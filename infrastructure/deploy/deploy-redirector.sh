#!/bin/bash

# Redirector Deployment Script
# Deploys Hysteria2 redirector with masquerading configuration

set -euo pipefail

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

print_status() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Configuration
REDIRECTOR_NAME=${1:-""}
CONFIG_FILE=${2:-""}
SSH_HOST=${3:-""}
SSH_USER=${4:-"root"}
SSH_KEY=${5:-""}

if [[ -z "$REDIRECTOR_NAME" || -z "$CONFIG_FILE" || -z "$SSH_HOST" ]]; then
    print_error "Usage: $0 <redirector-name> <config-file> <ssh-host> [ssh-user] [ssh-key]"
    exit 1
fi

print_status "Deploying redirector: $REDIRECTOR_NAME"
print_status "Configuration: $CONFIG_FILE"
print_status "Target host: $SSH_HOST"

# Validate config file exists
if [[ ! -f "$CONFIG_FILE" ]]; then
    print_error "Configuration file not found: $CONFIG_FILE"
    exit 1
fi

# SSH options
SSH_OPTS="-o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null"
if [[ -n "$SSH_KEY" ]]; then
    SSH_OPTS="$SSH_OPTS -i $SSH_KEY"
fi

# Test SSH connection
print_status "Testing SSH connection..."
if ! ssh $SSH_OPTS $SSH_USER@$SSH_HOST "echo 'SSH connection successful'"; then
    print_error "SSH connection failed"
    exit 1
fi

# Install prerequisites
print_status "Installing prerequisites..."
ssh $SSH_OPTS $SSH_USER@$SSH_HOST << 'EOF'
set -e
apt update
apt install -y curl wget unzip certbot python3-certbot-nginx nginx ufw

# Create hysteria user
useradd -r -s /bin/false hysteria || true
mkdir -p /opt/hysteria
chown hysteria:hysteria /opt/hysteria
EOF

# Download and install Hysteria2
print_status "Downloading and installing Hysteria2..."
ssh $SSH_OPTS $SSH_USER@$SSH_HOST << 'EOF'
set -e
cd /tmp

# Get latest Hysteria2 release
HYSTERIA_VERSION=$(curl -s https://api.github.com/repos/apernet/hysteria/releases/latest | grep '"tag_name":' | sed -E 's/.*"tag_name": ?"v?([^"]+).*/\1/')
ARCH=$(uname -m | sed 's/x86_64/amd64/')

wget "https://github.com/apernet/hysteria/releases/download/v${HYSTERIA_VERSION}/hysteria-linux-${ARCH}-${HYSTERIA_VERSION}.tar.gz"
tar -xzf "hysteria-linux-${ARCH}-${HYSTERIA_VERSION}.tar.gz"

# Install binary
mv hysteria /usr/local/bin/hysteria
chmod +x /usr/local/bin/hysteria

# Create systemd service
cat > /etc/systemd/system/hysteria-redirector.service << 'EOL'
[Unit]
Description=Hysteria2 Redirector
After=network.target

[Service]
Type=simple
User=hysteria
Group=hysteria
ExecStart=/usr/local/bin/hysteria server -c /etc/hysteria/config.yaml
Restart=always
RestartSec=5
LimitNOFILE=1048576

[Install]
WantedBy=multi-user.target
EOL

systemctl daemon-reload
systemctl enable hysteria-redirector
EOF

# Upload configuration
print_status "Uploading configuration..."
scp $SSH_OPTS "$CONFIG_FILE" $SSH_USER@$SSH_HOST:/etc/hysteria/config.yaml
ssh $SSH_OPTS $SSH_USER@$SSH_HOST "chown hysteria:hysteria /etc/hysteria/config.yaml"

# Setup SSL certificate
print_status "Setting up SSL certificate..."
DOMAIN=$(grep -E "^\s*domains:" "$CONFIG_FILE" -A 5 | grep -oE '"[^"]+"' | head -1 | tr -d '"')

if [[ -n "$DOMAIN" ]]; then
    print_status "Obtaining SSL certificate for: $DOMAIN"
    ssh $SSH_OPTS $SSH_USER@$SSH_HOST << EOF
        # Setup nginx for certbot
        cat > /etc/nginx/sites-available/redirector << 'EOL'
server {
    listen 80;
    server_name $DOMAIN;
    location /.well-known/acme-challenge/ {
        root /var/www/html;
    }
    location / {
        return 301 https://\$server_name\$request_uri;
    }
}
EOL
        
        ln -sf /etc/nginx/sites-available/redirector /etc/nginx/sites-enabled/
        rm -f /etc/nginx/sites-enabled/default
        nginx -t && systemctl reload nginx
        
        # Obtain certificate
        certbot --nginx -d $DOMAIN --non-interactive --agree-tos --email admin@$DOMAIN --redirect
        
        # Copy certificates for Hysteria
        cp /etc/letsencrypt/live/$DOMAIN/fullchain.pem /etc/hysteria/cert.pem
        cp /etc/letsencrypt/live/$DOMAIN/privkey.pem /etc/hysteria/key.pem
        chown hysteria:hysteria /etc/hysteria/*.pem
EOF
else
    print_warning "No domain found in config, skipping SSL setup"
fi

# Configure firewall
print_status "Configuring firewall..."
ssh $SSH_OPTS $SSH_USER@$SSH_HOST << 'EOF'
ufw --force reset
ufw default deny incoming
ufw default allow outgoing

# Allow SSH
ufw allow ssh

# Allow Hysteria ports
ufw allow 443/tcp
ufw allow 443/udp

# Allow HTTP for certbot
ufw allow 80/tcp

# Allow traffic stats port
ufw allow 25000/tcp

ufw --force enable
EOF

# Setup monitoring
print_status "Setting up monitoring..."
ssh $SSH_OPTS $SSH_USER@$SSH_HOST << 'EOF'
# Create monitoring script
cat > /usr/local/bin/redirector-monitor.sh << 'EOL'
#!/bin/bash

LOG_FILE="/var/log/redirector-monitor.log"

check_hysteria() {
    if systemctl is-active --quiet hysteria-redirector; then
        echo "$(date): Hysteria service is running" >> $LOG_FILE
    else
        echo "$(date): Hysteria service is DOWN, restarting..." >> $LOG_FILE
        systemctl restart hysteria-redirector
    fi
}

check_ssl() {
    if [[ -f "/etc/hysteria/cert.pem" ]]; then
        EXPIRY=$(openssl x509 -in /etc/hysteria/cert.pem -noout -enddate | cut -d= -f2)
        EXPIRY_EPOCH=$(date -d "$EXPIRY" +%s)
        CURRENT_EPOCH=$(date +%s)
        DAYS_LEFT=$(( (EXPIRY_EPOCH - CURRENT_EPOCH) / 86400 ))
        
        if [[ $DAYS_LEFT -lt 7 ]]; then
            echo "$(date): SSL certificate expires in $DAYS_LEFT days" >> $LOG_FILE
        fi
    fi
}

check_hysteria
check_ssl
EOF

chmod +x /usr/local/bin/redirector-monitor.sh

# Add to cron
echo "*/5 * * * * /usr/local/bin/redirector-monitor.sh" | crontab -
EOF

# Start Hysteria service
print_status "Starting Hysteria service..."
ssh $SSH_OPTS $SSH_USER@$SSH_HOST << 'EOF'
systemctl start hysteria-redirector
systemctl status hysteria-redirector --no-pager
EOF

# Verify deployment
print_status "Verifying deployment..."
sleep 5

# Check service status
SERVICE_STATUS=$(ssh $SSH_OPTS $SSH_USER@$SSH_HOST "systemctl is-active hysteria-redirector")
if [[ "$SERVICE_STATUS" == "active" ]]; then
    print_status "✅ Hysteria service is running"
else
    print_error "❌ Hysteria service failed to start"
    ssh $SSH_OPTS $SSH_USER@$SSH_HOST "journalctl -u hysteria-redirector --no-pager -n 20"
    exit 1
fi

# Check port listening
PORT_STATUS=$(ssh $SSH_OPTS $SSH_USER@$SSH_HOST "netstat -ln | grep :443")
if [[ -n "$PORT_STATUS" ]]; then
    print_status "✅ Port 443 is listening"
else
    print_error "❌ Port 443 is not listening"
    exit 1
fi

# Test connectivity if domain is set
if [[ -n "$DOMAIN" ]]; then
    print_status "Testing connectivity to $DOMAIN..."
    if curl -s -k "https://$DOMAIN" > /dev/null; then
        print_status "✅ Connectivity test passed"
    else
        print_warning "⚠️ Connectivity test failed (may need DNS propagation)"
    fi
fi

print_status "🎉 Redirector deployment completed successfully!"
print_status "Redirector: $REDIRECTOR_NAME"
print_status "Host: $SSH_HOST"
print_status "Config: $CONFIG_FILE"

if [[ -n "$DOMAIN" ]]; then
    print_status "Domain: https://$DOMAIN"
fi

print_status ""
print_warning "Remember to:"
echo "  1. Update your DNS records if using a domain"
echo "  2. Configure the teamserver to use this redirector"
echo "  3. Monitor the redirector logs: journalctl -u hysteria-redirector -f"
echo "  4. Check monitoring logs: tail -f /var/log/redirector-monitor.log"