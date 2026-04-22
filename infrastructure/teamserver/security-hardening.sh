#!/bin/bash

# Teamserver Security Hardening Script
# This script hardens the teamserver for production deployment

set -euo pipefail

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Function to print colored output
print_status() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Check if running as root
if [[ $EUID -ne 0 ]]; then
   print_error "This script must be run as root"
   exit 1
fi

print_status "Starting teamserver security hardening..."

# Update system packages
print_status "Updating system packages..."
apt update && apt upgrade -y

# Install security packages
print_status "Installing security packages..."
apt install -y \
    ufw \
    fail2ban \
    rkhunter \
    chkrootkit \
    unattended-upgrades \
    apparmor-profiles \
    auditd \
    logrotate \
    nginx \
    certbot \
    python3-certbot-nginx

# Configure UFW (Uncomplicated Firewall)
print_status "Configuring firewall rules..."

# Reset firewall rules
ufw --force reset

# Default policies
ufw default deny incoming
ufw default allow outgoing

# Allow SSH (restrict to specific IPs if provided)
if [[ -n "${ADMIN_IPS:-}" ]]; then
    for ip in $ADMIN_IPS; do
        ufw allow from $ip to any port 22 proto tcp
        print_status "Allowed SSH from $ip"
    done
else
    ufw allow ssh
    print_warning "SSH allowed from any IP (restrict with ADMIN_IPS environment variable)"
fi

# Allow Hysteria2 from redirectors
if [[ -n "${REDIRECTOR_IPS:-}" ]]; then
    for ip in $REDIRECTOR_IPS; do
        ufw allow from $ip to any port 443 proto tcp
        ufw allow from $ip to any port 443 proto udp
        print_status "Allowed Hysteria2 from redirector $ip"
    done
fi

# Allow WireGuard (if configured)
if [[ -n "${WIREGUARD_PORT:-}" ]]; then
    ufw allow $WIREGUARD_PORT/udp
    print_status "Allowed WireGuard on port $WIREGUARD_PORT"
fi

# Allow HTTP/HTTPS for management (restrict to admin IPs)
if [[ -n "${ADMIN_IPS:-}" ]]; then
    for ip in $ADMIN_IPS; do
        ufw allow from $ip to any port 80 proto tcp
        ufw allow from $ip to any port 443 proto tcp
    done
fi

# Enable firewall
ufw --force enable
print_status "Firewall configured and enabled"

# Configure fail2ban
print_status "Configuring fail2ban..."
cat > /etc/fail2ban/jail.local << EOF
[DEFAULT]
bantime = 3600
findtime = 600
maxretry = 3
backend = systemd

[sshd]
enabled = true
port = ssh
filter = sshd
logpath = /var/log/auth.log
maxretry = 3
bantime = 3600

[nginx-http-auth]
enabled = true
port = http,https
filter = nginx-http-auth
logpath = /var/log/nginx/error.log
maxretry = 3
bantime = 3600

[nginx-limit-req]
enabled = true
port = http,https
filter = nginx-limit-req
logpath = /var/log/nginx/error.log
maxretry = 3
bantime = 3600
EOF

systemctl enable fail2ban
systemctl restart fail2ban

# Harden SSH configuration
print_status "Hardening SSH configuration..."
cp /etc/ssh/sshd_config /etc/ssh/sshd_config.backup

cat > /etc/ssh/sshd_config << EOF
# SSH Hardening Configuration
Port 22
Protocol 2

# Authentication
PermitRootLogin no
PasswordAuthentication no
PubkeyAuthentication yes
AuthorizedKeysFile .ssh/authorized_keys

# Security
PermitEmptyPasswords no
ChallengeResponseAuthentication no
UsePAM yes

# Connection limits
MaxAuthTries 3
MaxSessions 2
ClientAliveInterval 300
ClientAliveCountMax 2

# Logging
SyslogFacility AUTH
LogLevel VERBOSE

# Network
AllowTcpForwarding no
X11Forwarding no
Banner /etc/ssh/banner.txt

# User restrictions
AllowUsers ${SSH_USERS:-admin}
EOF

# Create SSH banner
cat > /etc/ssh/banner.txt << EOF
***************************************************************************
                            AUTHORIZED ACCESS ONLY
***************************************************************************
This system is for authorized users only. Individual use of this system
and/or network without authority from the system administrator is strictly
prohibited. Unauthorized access is a violation of state and federal, civil
and criminal laws.
***************************************************************************
EOF

systemctl restart sshd

# Configure nginx as reverse proxy
print_status "Configuring nginx reverse proxy..."
cat > /etc/nginx/sites-available/teamserver << EOF
# Teamserver Nginx Configuration
server {
    listen 80;
    server_name _;
    return 301 https://\$server_name\$request_uri;
}

server {
    listen 443 ssl http2;
    server_name _;

    # SSL Configuration
    ssl_certificate /etc/ssl/certs/teamserver.crt;
    ssl_certificate_key /etc/ssl/private/teamserver.key;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers ECDHE-RSA-AES256-GCM-SHA512:DHE-RSA-AES256-GCM-SHA512:ECDHE-RSA-AES256-GCM-SHA384:DHE-RSA-AES256-GCM-SHA384;
    ssl_prefer_server_ciphers off;
    ssl_session_cache shared:SSL:10m;
    ssl_session_timeout 10m;

    # Security Headers
    add_header X-Frame-Options DENY;
    add_header X-Content-Type-Options nosniff;
    add_header X-XSS-Protection "1; mode=block";
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
    add_header Content-Security-Policy "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'";

    # Rate limiting
    limit_req_zone \$binary_remote_addr zone=api:10m rate=10r/s;
    limit_req_zone \$binary_remote_addr zone=login:10m rate=1r/s;

    # Logging
    access_log /var/log/nginx/teamserver.access.log;
    error_log /var/log/nginx/teamserver.error.log;

    # Next.js application
    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_cache_bypass \$http_upgrade;
        
        # Timeouts
        proxy_connect_timeout 60s;
        proxy_send_timeout 60s;
        proxy_read_timeout 60s;
    }

    # API endpoints with stricter rate limiting
    location /api/ {
        limit_req zone=api burst=20 nodelay;
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
    }

    # Authentication endpoints with very strict rate limiting
    location /api/auth/ {
        limit_req zone=login burst=5 nodelay;
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
    }

    # Health check endpoint
    location /health {
        access_log off;
        return 200 "healthy\n";
        add_header Content-Type text/plain;
    }
}
EOF

# Enable nginx site
ln -sf /etc/nginx/sites-available/teamserver /etc/nginx/sites-enabled/
rm -f /etc/nginx/sites-enabled/default

# Test nginx configuration
nginx -t
systemctl enable nginx
systemctl restart nginx

# Configure automatic security updates
print_status "Configuring automatic security updates..."
cat > /etc/apt/apt.conf.d/50unattended-upgrades << EOF
Unattended-Upgrade::Allowed-Origins {
    "\${distro_id}:\${distro_codename}";
    "\${distro_id}:\${distro_codename}-security";
    "\${distro_id}ESMApps:\${distro_codename}-apps-security";
    "\${distro_id}ESM:\${distro_codename}-infra-security";
};

Unattended-Upgrade::Package-Blacklist {
};

Unattended-Upgrade::DevRelease "false";
Unattended-Upgrade::MinimalSteps "true";
Unattended-Upgrade::InstallOnShutdown "false";
Unattended-Upgrade::Remove-Unused-Dependencies "true";
Unattended-Upgrade::Automatic-Reboot "false";
EOF

cat > /etc/apt/apt.conf.d/20auto-upgrades << EOF
APT::Periodic::Update-Package-Lists "1";
APT::Periodic::Download-Upgradeable-Packages "1";
APT::Periodic::AutocleanInterval "7";
APT::Periodic::Unattended-Upgrade "1";
EOF

systemctl enable unattended-upgrades

# Configure auditd
print_status "Configuring audit daemon..."
cat > /etc/audit/rules.d/teamserver.rules << EOF
# Monitor file access
-w /etc/passwd -p wa -k identity
-w /etc/shadow -p wa -k identity
-w /etc/sudoers -p wa -k identity
-w /etc/ssh/sshd_config -p wa -k sshd_config

# Monitor system calls
-a always,exit -F arch=b64 -S execve -k exec
-a always,exit -F arch=b64 -S fork,clone -k process

# Monitor network
-a always,exit -F arch=b64 -S bind,connect,accept -k network

# Monitor privilege escalation
-a always,exit -F arch=b64 -S setuid,setgid -k priv_esc
EOF

systemctl restart auditd

# Secure shared memory
print_status "Securing shared memory..."
echo "tmpfs /run/shm tmpfs defaults,noexec,nosuid,size=1G 0 0" >> /etc/fstab
mount -o remount /run/shm

# Disable unnecessary services
print_status "Disabling unnecessary services..."
systemctl disable bluetooth
systemctl disable cups
systemctl disable avahi-daemon
systemctl disable rpcbind
systemctl disable nfs-common
systemctl disable rsync

# Configure log rotation
print_status "Configuring log rotation..."
cat > /etc/logrotate.d/teamserver << EOF
/var/log/nginx/*.log {
    daily
    missingok
    rotate 30
    compress
    delaycompress
    notifempty
    create 644 www-data www-data
    postrotate
        systemctl reload nginx
    endscript
}

/var/log/auth.log {
    daily
    missingok
    rotate 30
    compress
    delaycompress
    notifempty
}

/var/log/audit/audit.log {
    daily
    missingok
    rotate 30
    compress
    delaycompress
    notifempty
    postrotate
        systemctl restart auditd
    endscript
}
EOF

# Create system monitoring script
print_status "Creating system monitoring script..."
cat > /usr/local/bin/teamserver-monitor.sh << 'EOF'
#!/bin/bash

# Teamserver Monitoring Script
LOG_FILE="/var/log/teamserver-monitor.log"
ALERT_THRESHOLD_CPU=80
ALERT_THRESHOLD_MEMORY=80
ALERT_THRESHOLD_DISK=90

check_cpu() {
    CPU_USAGE=$(top -bn1 | grep "Cpu(s)" | awk '{print $2}' | cut -d'%' -f1)
    if (( $(echo "$CPU_USAGE > $ALERT_THRESHOLD_CPU" | bc -l) )); then
        echo "$(date): HIGH CPU USAGE: ${CPU_USAGE}%" >> $LOG_FILE
    fi
}

check_memory() {
    MEMORY_USAGE=$(free | grep Mem | awk '{printf("%.1f"), $3/$2 * 100.0}')
    if (( $(echo "$MEMORY_USAGE > $ALERT_THRESHOLD_MEMORY" | bc -l) )); then
        echo "$(date): HIGH MEMORY USAGE: ${MEMORY_USAGE}%" >> $LOG_FILE
    fi
}

check_disk() {
    DISK_USAGE=$(df / | tail -1 | awk '{print $5}' | cut -d'%' -f1)
    if [ "$DISK_USAGE" -gt "$ALERT_THRESHOLD_DISK" ]; then
        echo "$(date): HIGH DISK USAGE: ${DISK_USAGE}%" >> $LOG_FILE
    fi
}

check_services() {
    if ! systemctl is-active --quiet nginx; then
        echo "$(date): NGINX SERVICE IS DOWN" >> $LOG_FILE
        systemctl restart nginx
    fi
    
    if ! systemctl is-active --quiet fail2ban; then
        echo "$(date): FAIL2BAN SERVICE IS DOWN" >> $LOG_FILE
        systemctl restart fail2ban
    fi
}

check_cpu
check_memory
check_disk
check_services
EOF

chmod +x /usr/local/bin/teamserver-monitor.sh

# Add monitoring to cron
echo "*/5 * * * * /usr/local/bin/teamserver-monitor.sh" | crontab -

# Create backup script
print_status "Creating backup script..."
cat > /usr/local/bin/teamserver-backup.sh << 'EOF'
#!/bin/bash

BACKUP_DIR="/opt/backups"
DATE=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="teamserver_backup_${DATE}.tar.gz"

# Create backup directory
mkdir -p $BACKUP_DIR

# Backup critical files
tar -czf "$BACKUP_DIR/$BACKUP_FILE" \
    /etc/nginx/ \
    /etc/ssh/ \
    /etc/fail2ban/ \
    /etc/ufw/ \
    /var/log/ \
    /opt/teamserver/ \
    --exclude=/var/log/*.log.*

# Keep only last 7 days of backups
find $BACKUP_DIR -name "teamserver_backup_*.tar.gz" -mtime +7 -delete

echo "Backup completed: $BACKUP_DIR/$BACKUP_FILE"
EOF

chmod +x /usr/local/bin/teamserver-backup.sh

# Add backup to cron (daily at 2 AM)
echo "0 2 * * * /usr/local/bin/teamserver-backup.sh" | crontab -

print_status "Security hardening completed successfully!"
print_warning "Remember to:"
echo "  1. Set up SSL certificates with certbot"
echo "  2. Configure admin user accounts"
echo "  3. Set up monitoring alerts"
echo "  4. Test fail2ban rules"
echo "  5. Verify backup system works"
echo "  6. Review all configuration files"

print_status "Reboot recommended to apply all changes"