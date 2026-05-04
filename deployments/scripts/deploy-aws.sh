#!/bin/bash

# D-Panel AWS Deployment Script
# Deploys complete red team operations platform to AWS server ec2-13-55-232-246.ap-southeast-2.compute.amazonaws.com

set -e

# Configuration
AWS_SERVER="ec2-13-55-232-246.ap-southeast-2.compute.amazonaws.com"
AWS_USER="ubuntu"  # Ubuntu AMI on instance i-090d6d4ef9848e977
SSH_KEY="keypair.pem"  # SSH key for instance i-090d6d4ef9848e977 (hysteria2Bpanel)
PROJECT_NAME="dpanel-ops"
DEPLOY_PATH="/opt/$PROJECT_NAME"
DOMAIN="ec2-13-55-232-246.ap-southeast-2.compute.amazonaws.com"

# SSH command configuration
if [ -n "$SSH_KEY" ]; then
    SSH_CMD="ssh -i '$SSH_KEY'"
    SCP_CMD="scp -i '$SSH_KEY'"
    RSYNC_CMD="rsync -avz --progress -e 'ssh -i \"$SSH_KEY\"'"
else
    SSH_CMD="ssh"
    SCP_CMD="scp"
    RSYNC_CMD="rsync -avz --progress"
fi

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}[+] D-Panel AWS Deployment Script${NC}"
echo -e "${BLUE}[+] Target Server: $AWS_SERVER${NC}"
echo -e "${BLUE}[+] Project: $PROJECT_NAME${NC}"
echo ""

# Test SSH connection
echo -e "${YELLOW}[+] Testing SSH connection to $AWS_SERVER...${NC}"
if ! $SSH_CMD -o ConnectTimeout=10 -o StrictHostKeyChecking=accept-new "$AWS_USER@$AWS_SERVER" "echo 'SSH connection successful'"; then
    echo -e "${RED}[-] SSH connection failed${NC}"
    echo -e "${YELLOW}[!] Please check:${NC}"
    echo -e "${YELLOW}[!] - Server IP: $AWS_SERVER${NC}"
    echo -e "${YELLOW}[!] - Username: $AWS_USER${NC}"
    echo -e "${YELLOW}[!] - SSH key or agent setup${NC}"
    echo -e "${YELLOW}[!] - Security group allows SSH (port 22)${NC}"
    exit 1
fi

# Create deployment directory
echo -e "${YELLOW}[+] Creating deployment directory...${NC}"
$SSH_CMD "$AWS_USER@$AWS_SERVER" "sudo mkdir -p $DEPLOY_PATH && sudo chown $AWS_USER:$AWS_USER $DEPLOY_PATH"

# Build production Next.js application
echo -e "${YELLOW}[+] Building Next.js application for production...${NC}"
cd "$(dirname "$0")"
NODE_ENV=production npm run build

# Create production environment file
echo -e "${YELLOW}[+] Creating production environment configuration...${NC}"
cat > .env.production << EOF
NODE_ENV=production
NEXT_PUBLIC_APP_URL=https://$DOMAIN
PORT=3000

# JWT Configuration
JWT_SECRET=$(openssl rand -base64 32)
JWT_REFRESH_SECRET=$(openssl rand -base64 32)
JWT_ACCESS_EXPIRE=15m
JWT_REFRESH_EXPIRE=7d

# Admin Credentials - CHANGE THESE IN PRODUCTION
ADMIN_USERNAME=admin
ADMIN_PASSWORD=DPanel@2024!Secure
ADMIN_EMAIL=admin@dpanel.ops

# Hysteria2 Configuration
HYSTERIA_AUTH_BACKEND_SECRET=$(openssl rand -base64 32)
NODE_ID=aws-production-server-001

# Security Configuration
CORS_ORIGIN=https://$DOMAIN
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX_REQUESTS=100

# SSL/HTTPS Configuration
SSL_CERT_PATH=/etc/ssl/certs/dpanel.crt
SSL_KEY_PATH=/etc/ssl/private/dpanel.key

# Production Features
ENABLE_REAL_TIME_UPDATES=true
ENABLE_ACTIVITY_LOGGING=true
ENABLE_AUDIT_TRAIL=true
SESSION_TIMEOUT=3600000
EOF

# Create Docker Compose file
echo -e "${YELLOW}[+] Creating Docker Compose configuration...${NC}"
cat > docker-compose.prod.yml << EOF
version: '3.8'

services:
  dpanel-web:
    build:
      context: .
      dockerfile: Dockerfile
    ports:
      - "3000:3000"
      - "443:443"
      - "80:80"
    environment:
      - NODE_ENV=production
    env_file:
      - .env.production
    volumes:
      - ./logs:/var/log/dpanel
      - ./ssl:/etc/ssl/private:ro
      - ./backups:/var/backups/dpanel
    restart: unless-stopped
    networks:
      - dpanel-network

  nginx:
    image: nginx:alpine
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./nginx.conf:/etc/nginx/nginx.conf:ro
      - ./ssl:/etc/ssl:ro
    depends_on:
      - dpanel-web
    restart: unless-stopped
    networks:
      - dpanel-network

networks:
  dpanel-network:
    driver: bridge

volumes:
  logs:
  ssl:
  backups:
EOF

# Create Nginx configuration
echo -e "${YELLOW}[+] Creating Nginx configuration...${NC}"
cat > nginx.conf << EOF
events {
    worker_connections 1024;
}

http {
    upstream dpanel {
        server dpanel-web:3000;
    }

    # HTTP redirect to HTTPS
    server {
        listen 80;
        server_name $DOMAIN;
        return 301 https://\$server_name\$request_uri;
    }

    # HTTPS server
    server {
        listen 443 ssl http2;
        server_name $DOMAIN;

        ssl_certificate /etc/ssl/certs/dpanel.crt;
        ssl_certificate_key /etc/ssl/private/dpanel.key;
        ssl_protocols TLSv1.2 TLSv1.3;
        ssl_ciphers ECDHE-RSA-AES256-GCM-SHA512:DHE-RSA-AES256-GCM-SHA512:ECDHE-RSA-AES256-GCM-SHA384:DHE-RSA-AES256-GCM-SHA384;
        ssl_prefer_server_ciphers off;

        # Security headers
        add_header X-Frame-Options DENY;
        add_header X-Content-Type-Options nosniff;
        add_header X-XSS-Protection "1; mode=block";
        add_header Strict-Transport-Security "max-age=63072000; includeSubDomains; preload";

        location / {
            proxy_pass http://dpanel;
            proxy_set_header Host \$host;
            proxy_set_header X-Real-IP \$remote_addr;
            proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
            proxy_set_header X-Forwarded-Proto \$scheme;
        }

        # WebSocket support for real-time updates
        location /ws {
            proxy_pass http://dpanel;
            proxy_http_version 1.1;
            proxy_set_header Upgrade \$http_upgrade;
            proxy_set_header Connection "upgrade";
            proxy_set_header Host \$host;
        }
    }
}
EOF

# Create self-signed SSL certificate (for testing)
echo -e "${YELLOW}[+] Creating self-signed SSL certificate...${NC}"
mkdir -p ssl
openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
    -keyout ssl/dpanel.key \
    -out ssl/dpanel.crt \
    -subj "/C=US/ST=State/L=City/O=D-Panel/CN=$DOMAIN"

# Create startup script
echo -e "${YELLOW}[+] Creating startup script...${NC}"
cat > start-dpanel.sh << 'EOF'
#!/bin/bash
cd /opt/dpanel-ops

echo "[+] Starting D-Panel Red Team Operations Platform..."
echo "[+] Stopping existing containers..."
docker-compose -f docker-compose.prod.yml down

echo "[+] Building and starting containers..."
docker-compose -f docker-compose.prod.yml up --build -d

echo "[+] Waiting for services to start..."
sleep 30

echo "[+] Checking service status..."
docker-compose -f docker-compose.prod.yml ps

echo "[+] D-Panel is now running!"
echo "[+] Web Interface: https://ec2-13-55-232-246.ap-southeast-2.compute.amazonaws.com"
echo "[+] Login: admin / DPanel@2024!Secure"
EOF

chmod +x start-dpanel.sh

# Upload files to AWS server
echo -e "${YELLOW}[+] Uploading files to AWS server...${NC}"
$RSYNC_CMD \
    .next/ \
    public/ \
    package*.json \
    Dockerfile \
    ../config/docker-compose.prod.yml \
    ../config/nginx.conf \
    .env.production \
    start-dpanel.sh \
    ../config/ssl/ \
    ../../implant/dist/ \
    "$AWS_USER@$AWS_SERVER:$DEPLOY_PATH/"

# Setup SSL certificates on server
echo -e "${YELLOW}[+] Setting up SSL certificates...${NC}"
ssh -i "$SSH_KEY" "$AWS_USER@$AWS_SERVER" "
    sudo mkdir -p /etc/ssl/certs /etc/ssl/private
    sudo cp $DEPLOY_PATH/ssl/dpanel.crt /etc/ssl/certs/
    sudo cp $DEPLOY_PATH/ssl/dpanel.key /etc/ssl/private/
    sudo chmod 600 /etc/ssl/private/dpanel.key
"

# Create directories and set permissions
echo -e "${YELLOW}[+] Setting up directories and permissions...${NC}"
ssh -i "$SSH_KEY" "$AWS_USER@$AWS_SERVER" "
    sudo mkdir -p /var/log/dpanel /var/backups/dpanel
    sudo chown -R \$USER:$USER $DEPLOY_PATH
    sudo chmod +x $DEPLOY_PATH/start-dpanel.sh
"

# Install Docker and Docker Compose if not present
echo -e "${YELLOW}[+] Installing Docker and Docker Compose...${NC}"
ssh -i "$SSH_KEY" "$AWS_USER@$AWS_SERVER" "
    if ! command -v docker &> /dev/null; then
        echo '[+] Installing Docker...'
        curl -fsSL https://get.docker.com -o get-docker.sh
        sudo sh get-docker.sh
        sudo usermod -aG docker \$USER
    fi
    
    if ! command -v docker-compose &> /dev/null; then
        echo '[+] Installing Docker Compose...'
        sudo curl -L \"https://github.com/docker/compose/releases/latest/download/docker-compose-\$(uname -s)-\$(uname -m)\" -o /usr/local/bin/docker-compose
        sudo chmod +x /usr/local/bin/docker-compose
    fi
"

# Start the application
echo -e "${YELLOW}[+] Starting D-Panel application...${NC}"
ssh -i "$SSH_KEY" "$AWS_USER@$AWS_SERVER" "cd $DEPLOY_PATH && ./start-dpanel.sh"

# Wait for startup and test
echo -e "${YELLOW}[+] Waiting for application to start...${NC}"
sleep 60

# Test the deployment
echo -e "${YELLOW}[+] Testing deployment...${NC}"
if curl -k -s -o /dev/null -w "%{http_code}" "https://$AWS_SERVER" | grep -q "200"; then
    echo -e "${GREEN}[+] Deployment successful!${NC}"
    echo -e "${GREEN}[+] D-Panel is running at: https://$AWS_SERVER${NC}"
    echo -e "${GREEN}[+] Login: admin / DPanel@2024!Secure${NC}"
else
    echo -e "${RED}[-] Deployment test failed${NC}"
    echo -e "${YELLOW}[!] Check logs with: ssh -i '$SSH_KEY' '$AWS_USER@$AWS_SERVER' 'cd $DEPLOY_PATH && docker-compose logs'${NC}"
fi

echo ""
echo -e "${BLUE}[+] Deployment Summary${NC}"
echo -e "${BLUE}[+] Server: https://$AWS_SERVER${NC}"
echo -e "${BLUE}[+] Username: admin${NC}"
echo -e "${BLUE}[+] Password: DPanel@2024!Secure${NC}"
echo -e "${BLUE}[+] Implant Binaries: $DEPLOY_PATH/dist/${NC}"
echo -e "${BLUE}[+] Logs: ssh -i '$SSH_KEY' '$AWS_USER@$AWS_SERVER' 'cd $DEPLOY_PATH && docker-compose logs -f'${NC}"
echo ""
echo -e "${GREEN}[+] D-Panel Red Team Operations Platform deployed successfully!${NC}"