#!/bin/bash

# Egress Node Deployment Script
# Deploys high-bandwidth egress node with SOCKS5 proxy

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
EGRESS_NAME=${1:-""}
REGION=${2:-""}
PROVIDER=${3:-""}
SSH_HOST=${4:-""}
SSH_USER=${5:-"root"}
SSH_KEY=${6:-""}

if [[ -z "$EGRESS_NAME" || -z "$REGION" || -z "$PROVIDER" || -z "$SSH_HOST" ]]; then
    print_error "Usage: $0 <egress-name> <region> <provider> <ssh-host> [ssh-user] [ssh-key]"
    exit 1
fi

print_status "Deploying egress node: $EGRESS_NAME"
print_status "Region: $REGION"
print_status "Provider: $PROVIDER"
print_status "Target host: $SSH_HOST"

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

# Install and configure egress node
print_status "Installing egress node software..."
ssh $SSH_OPTS $SSH_USER@$SSH_HOST << EOF
set -e

# Update system
apt update && apt upgrade -y

# Install required packages
apt install -y python3 python3-pip nginx ufw fail2ban

# Install Dante SOCKS5 server
apt install -y dante-server

# Create egress user
useradd -r -s /bin/false egress || true
mkdir -p /opt/egress
chown egress:egress /opt/egress

# Configure Dante SOCKS5 server
cat > /etc/danted.conf << 'EOL'
# Egress Node SOCKS5 Configuration
logoutput: /var/log/socks.log
errorlog: /var/log/socks.err

# Internal and external interfaces
internal: 0.0.0.0 port = 1080
external: eth0

# Authentication method (none for internal use)
socksmethod: username none

# Client access rules
client pass {
    from: 0.0.0.0/0 to: 0.0.0.0/0
    log: error connect disconnect
}

# SOCKS pass rules
socks pass {
    from: 0.0.0.0/0 to: 0.0.0.0/0
    protocol: tcp udp
    log: error connect disconnect
}
EOL

# Create systemd service for Dante
cat > /etc/systemd/system/danted.service << 'EOL'
[Unit]
Description=Dante SOCKS5 Proxy Server
After=network.target

[Service]
Type=forking
PIDFile=/var/run/danted.pid
ExecStart=/usr/sbin/danted -D
ExecReload=/bin/kill -HUP \$MAINPID
KillMode=process
Restart=on-failure
RestartSec=5s

[Install]
WantedBy=multi-user.target
EOL

# Configure firewall
ufw --force reset
ufw default deny incoming
ufw default allow outgoing

# Allow SSH
ufw allow ssh

# Allow SOCKS5 port
ufw allow 1080/tcp

# Allow monitoring ports
ufw allow 8080/tcp  # Health check
ufw allow 9090/tcp  # Metrics

ufw --force enable

# Setup monitoring
cat > /usr/local/bin/egress-monitor.sh << 'EOL'
#!/bin/bash

LOG_FILE="/var/log/egress-monitor.log"
METRICS_FILE="/var/log/egress-metrics.log"

check_dante() {
    if systemctl is-active --quiet danted; then
        echo "\$(date): Dante SOCKS5 server is running" >> \$LOG_FILE
    else
        echo "\$(date): Dante SOCKS5 server is DOWN, restarting..." >> \$LOG_FILE
        systemctl restart danted
    fi
}

collect_metrics() {
    # Connection count
    CONNECTIONS=\$(netstat -an | grep :1080 | grep ESTABLISHED | wc -l)
    
    # Bandwidth usage (simplified)
    RX_BYTES=\$(cat /proc/net/dev | grep eth0 | awk '{print \$2}')
    TX_BYTES=\$(cat /proc/net/dev | grep eth0 | awk '{print \$10}')
    
    # CPU and memory usage
    CPU_USAGE=\$(top -bn1 | grep "Cpu(s)" | awk '{print \$2}' | cut -d'%' -f1)
    MEMORY_USAGE=\$(free | grep Mem | awk '{printf("%.1f"), \$3/\$2 * 100.0}')
    
    echo "\$(date),connections=\$CONNECTIONS,rx_bytes=\$RX_BYTES,tx_bytes=\$TX_BYTES,cpu=\$CPU_USAGE,memory=\$MEMORY_USAGE" >> \$METRICS_FILE
}

check_dante
collect_metrics
EOF

chmod +x /usr/local/bin/egress-monitor.sh

# Setup health check endpoint
cat > /etc/nginx/sites-available/egress << 'EOL'
server {
    listen 8080;
    server_name _;
    
    location /health {
        access_log off;
        return 200 "healthy\n";
        add_header Content-Type text/plain;
    }
    
    location /metrics {
        access_log off;
        return 200 "egress_node_up 1\n";
        add_header Content-Type text/plain;
    }
}
EOL

ln -sf /etc/nginx/sites-available/egress /etc/nginx/sites-enabled/
rm -f /etc/nginx/sites-enabled/default

# Enable and start services
systemctl daemon-reload
systemctl enable danted
systemctl enable nginx
systemctl start danted
systemctl start nginx

# Add monitoring to cron
echo "*/2 * * * * /usr/local/bin/egress-monitor.sh" | crontab -
EOF

# Verify deployment
print_status "Verifying egress deployment..."
sleep 5

# Check service status
DANTE_STATUS=$(ssh $SSH_OPTS $SSH_USER@$SSH_HOST "systemctl is-active danted")
if [[ "$DANTE_STATUS" == "active" ]]; then
    print_status "✅ Dante SOCKS5 server is running"
else
    print_error "❌ Dante SOCKS5 server failed to start"
    ssh $SSH_OPTS $SSH_USER@$SSH_HOST "journalctl -u danted --no-pager -n 20"
    exit 1
fi

# Check port listening
PORT_STATUS=$(ssh $SSH_OPTS $SSH_USER@$SSH_HOST "netstat -ln | grep :1080")
if [[ -n "$PORT_STATUS" ]]; then
    print_status "✅ SOCKS5 port 1080 is listening"
else
    print_error "❌ SOCKS5 port 1080 is not listening"
    exit 1
fi

# Test health check endpoint
print_status "Testing health check endpoint..."
HEALTH_RESPONSE=$(ssh $SSH_OPTS $SSH_USER@$SSH_HOST "curl -s http://localhost:8080/health")
if [[ "$HEALTH_RESPONSE" == "healthy" ]]; then
    print_status "✅ Health check endpoint is working"
else
    print_error "❌ Health check endpoint failed"
    exit 1
fi

print_status "🎉 Egress node deployment completed successfully!"
print_status "Egress Node: $EGRESS_NAME"
print_status "Region: $REGION"
print_status "Provider: $PROVIDER"
print_status "Host: $SSH_HOST"
print_status "SOCKS5 Port: 1080"
print_status "Health Check: http://$SSH_HOST:8080/health"

print_status ""
print_warning "Remember to:"
echo "  1. Add this egress node to the teamserver configuration"
echo "  2. Monitor the egress node logs: journalctl -u danted -f"
echo "  3. Check monitoring logs: tail -f /var/log/egress-monitor.log"
echo "  4. Test SOCKS5 connectivity from the teamserver"