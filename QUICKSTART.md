# Quick Start Guide

Get the Hysteria 2 Admin Panel up and running in 5 minutes.

## Prerequisites Check

- Node.js 20+ installed
- PostgreSQL 14+ installed (or use Docker)
- Git installed

## Installation

### Option 1: Automated Setup (Recommended)

**Linux/macOS:**
```bash
git clone https://github.com/your-username/blackboxai-hysteria2-sonner.git
cd blackboxai-hysteria2-sonner
chmod +x scripts/setup.sh
./scripts/setup.sh
```

**Windows:**
```batch
git clone https://github.com/your-username/blackboxai-hysteria2-sonner.git
cd blackboxai-hysteria2-sonner
scripts\setup.bat
```

### Option 2: Manual Setup

```bash
# Clone repository
git clone https://github.com/your-username/blackboxai-hysteria2-sonner.git
cd blackboxai-hysteria2-sonner

# Install dependencies
npm install

# Setup environment
cp .env.example .env.local

# Edit .env.local with your database URL
# Minimum required: DATABASE_URL

# Initialize database
npm run prisma:push
npm run prisma:generate

# Create admin user
npm run setup:admin

# Start development server
npm run dev
```

## First Run

1. Open http://localhost:3000/login
2. Login with default credentials:
   - Username: `admin`
   - Password: `admin123`
3. **Important**: Change your password immediately after first login

## Minimum Configuration

For basic functionality, you only need:

```env
# .env.local
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/hysteria2?schema=public
```

## Enable Features

### AI Features (Optional)

Add one of these to `.env.local`:

**OpenRouter (Recommended):**
```env
OPENROUTER_API_KEY=your-key
OPENROUTER_MODEL=anthropic/claude-3.5-sonnet
```

**xAI Grok (for ShadowGrok):**
```env
SHADOWGROK_ENABLED=true
XAI_API_KEY=your-key
```

### Hysteria 2 Integration (Optional)

```env
HYSTERIA_TRAFFIC_API_BASE_URL=http://127.0.0.1:25000
HYSTERIA_TRAFFIC_API_SECRET=your-secret
```

### Threat Intelligence (Optional)

```env
VIRUSTOTAL_API_KEY=your-key
ALIENVAULT_OTX_KEY=your-key
```

## Common Issues

### Database Connection Failed

**Solution:** Ensure PostgreSQL is running and DATABASE_URL is correct.

```bash
# Test PostgreSQL connection
psql postgresql://postgres:postgres@localhost:5432/hysteria2
```

### Port Already in Use

**Solution:** Kill process on port 3000 or use different port.

```bash
# macOS/Linux
lsof -ti:3000 | xargs kill -9

# Windows
netstat -ano | findstr :3000
taskkill /PID <PID> /F

# Or use different port
PORT=3001 npm run dev
```

### Prisma Client Not Generated

**Solution:** Regenerate Prisma Client.

```bash
npm run prisma:generate
```

## Next Steps

1. **Configure Database**: Set up PostgreSQL with proper security
2. **Enable Features**: Add API keys for AI and threat intelligence features
3. **Set Up Hysteria 2**: Configure Hysteria 2 integration if managing nodes
4. **Explore Dashboard**: Navigate through the admin panel features
5. **Read Documentation**: Check [INSTALL.md](./INSTALL.md) for detailed setup

## Support

- **Documentation**: See [INSTALL.md](./INSTALL.md) for detailed instructions
- **Issues**: Report bugs on GitHub Issues
- **Tests**: Run `npm test` to verify installation

## Development

```bash
# Development server with hot reload
npm run dev

# Run tests
npm test

# Build for production
npm run build

# Start production server
npm start

# Database management
npm run prisma:studio  # Open Prisma Studio
npm run prisma:migrate # Create migration
npm run prisma:push    # Push schema to database
```

## Production Deployment

For production deployment, see [INSTALL.md](./INSTALL.md) - Production Deployment section.

Key production considerations:
- Set strong admin passwords
- Use environment-specific API keys
- Enable HTTPS
- Configure database backups
- Set up monitoring and logging
- Use process manager (PM2, systemd, etc.)