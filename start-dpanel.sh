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
