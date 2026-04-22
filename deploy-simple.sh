#!/bin/bash

# Simple D-Panel Deployment Script
# Run this locally, then manually copy files to your AWS server

set -e

echo "[+] D-Panel Simple Deployment Script"
echo "[+] Preparing files for deployment to ec2-13-55-232-246.ap-southeast-2.compute.amazonaws.com"
echo ""

# Build production Next.js application
echo "[+] Building Next.js application for production..."
NODE_ENV=production npm run build

# Create production environment file
echo "[+] Creating production environment configuration..."
cat > .env.production << EOF
NODE_ENV=production
NEXT_PUBLIC_APP_URL=https://ec2-13-55-232-246.ap-southeast-2.compute.amazonaws.com
PORT=3000

# JWT Configuration
JWT_SECRET=$(openssl rand -base64 32)
JWT_REFRESH_SECRET=$(openssl rand -base64 32)
JWT_ACCESS_EXPIRE=15m
JWT_REFRESH_EXPIRE=7d

# Admin Credentials
ADMIN_USERNAME=admin
ADMIN_PASSWORD=DPanel@2024!Secure
ADMIN_EMAIL=admin@dpanel.ops

# Hysteria2 Configuration
HYSTERIA_AUTH_BACKEND_SECRET=$(openssl rand -base64 32)
NODE_ID=aws-production-server-001

# Security Configuration
CORS_ORIGIN=https://ec2-13-55-232-246.ap-southeast-2.compute.amazonaws.com
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX_REQUESTS=100

# Production Features
ENABLE_REAL_TIME_UPDATES=true
ENABLE_ACTIVITY_LOGGING=true
ENABLE_AUDIT_TRAIL=true
SESSION_TIMEOUT=3600000
EOF

# Create Docker Compose file
echo "[+] Creating Docker Compose configuration..."
cat > docker-compose.prod.yml << EOF
version: '3.8'

services:
  dpanel-web:
    build:
      context: .
      dockerfile: Dockerfile
    ports:
      - "3000:3000"
    environment:
      - NODE_ENV=production
    env_file:
      - .env.production
    volumes:
      - ./logs:/var/log/dpanel
      - ./backups:/var/backups/dpanel
    restart: unless-stopped
    networks:
      - dpanel-network

networks:
  dpanel-network:
    driver: bridge

volumes:
  logs:
  backups:
EOF

# Create startup script
echo "[+] Creating startup script..."
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
echo "[+] Web Interface: http://localhost:3000"
echo "[+] Login: admin / DPanel@2024!Secure"
EOF

chmod +x start-dpanel.sh

# Create deployment package
echo "[+] Creating deployment package..."
DEPLOY_PACKAGE="dpanel-deploy-$(date +%Y%m%d-%H%M%S).tar.gz"

tar -czf "$DEPLOY_PACKAGE" \
    .next/ \
    public/ \
    package*.json \
    Dockerfile \
    docker-compose.prod.yml \
    .env.production \
    start-dpanel.sh \
    implant/dist/ \
    README.md

echo ""
echo "[+] Deployment package created: $DEPLOY_PACKAGE"
echo ""
echo "[+] Next Steps:"
echo "1. Copy $DEPLOY_PACKAGE to your AWS server:"
echo "   scp $DEPLOY_PACKAGE user@ec2-13-55-232-246.ap-southeast-2.compute.amazonaws.com:/tmp/"
echo ""
echo "2. SSH into your AWS server:"
echo "   ssh user@ec2-13-55-232-246.ap-southeast-2.compute.amazonaws.com"
echo ""
echo "3. Extract and deploy:"
echo "   cd /tmp"
echo "   tar -xzf $DEPLOY_PACKAGE"
echo "   sudo mkdir -p /opt/dpanel-ops"
echo "   sudo mv * /opt/dpanel-ops/"
echo "   cd /opt/dpanel-ops"
echo "   sudo chmod +x start-dpanel.sh"
echo ""
echo "4. Install Docker (if not installed):"
echo "   curl -fsSL https://get.docker.com -o get-docker.sh"
echo "   sudo sh get-docker.sh"
echo "   sudo usermod -aG docker \$USER"
echo ""
echo "5. Start the application:"
echo "   ./start-dpanel.sh"
echo ""
echo "6. Access the platform:"
echo "   http://ec2-13-55-232-246.ap-southeast-2.compute.amazonaws.com:3000"
echo "   Login: admin / DPanel@2024!Secure"
echo ""
echo "[+] Implant binaries are available in /opt/dpanel-ops/implant/dist/"
echo "[+] Ready for red team operations!"