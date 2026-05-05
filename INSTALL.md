# Installation Guide

Complete step-by-step installation instructions for the Hysteria 2 Admin Panel.

## Prerequisites

### Required Software

- **Node.js 20+** - Download from [nodejs.org](https://nodejs.org/)
- **PostgreSQL 14+** - Download from [postgresql.org](https://www.postgresql.org/download/)
- **Git** - For cloning the repository
- **Hysteria 2 Server** (Optional) - For managing Hysteria 2 infrastructure

### System Requirements

- **RAM**: 2GB minimum, 4GB recommended
- **Disk**: 500MB for application, additional space for PostgreSQL database
- **OS**: Linux, macOS, or Windows with WSL2

## Quick Start (Development)

```bash
# Clone the repository
git clone https://github.com/your-username/blackboxai-hysteria2-sonner.git
cd blackboxai-hysteria2-sonner

# Install dependencies
npm install

# Copy environment configuration
cp .env.example .env.local

# Edit .env.local with your configuration
nano .env.local  # or use your preferred editor

# Initialize database
npm run prisma:push
npm run prisma:generate

# Create admin user
npm run setup:admin

# Start development server
npm run dev
```

Open http://localhost:3000/login to access the admin panel.

Default credentials (if not set in .env.local):
- Username: `admin`
- Password: `admin123`

## Detailed Installation Steps

### 1. Clone the Repository

```bash
git clone https://github.com/your-username/blackboxai-hysteria2-sonner.git
cd blackboxai-hysteria2-sonner
```

### 2. Install Node.js Dependencies

```bash
npm install
```

This installs all required packages including:
- Next.js 16.2.4
- React 19.2.4
- Prisma ORM
- UI components and utilities
- AI SDKs and integrations

### 3. Set Up PostgreSQL

#### Option A: Using Docker (Recommended)

```bash
# Start PostgreSQL container
docker run --name hysteria2-postgres \
  -e POSTGRES_USER=postgres \
  -e POSTGRES_PASSWORD=postgres \
  -e POSTGRES_DB=hysteria2 \
  -p 5432:5432 \
  -d postgres:14

# Verify connection
docker ps
```

#### Option B: Local PostgreSQL Installation

1. Install PostgreSQL 14+ for your OS
2. Create a database:
```bash
# Login to PostgreSQL
psql -U postgres

# Create database
CREATE DATABASE hysteria2;

# Exit
\q
```

### 4. Configure Environment Variables

Copy the example environment file:
```bash
cp .env.example .env.local
```

Edit `.env.local` with your configuration:

#### Required Variables

```env
# Database Connection
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/hysteria2?schema=public

# Admin Credentials (optional - defaults to admin/admin123)
ADMIN_USERNAME=admin
ADMIN_PASSWORD=your_secure_password
```

#### Optional Variables

```env
# AI Provider Configuration (choose one)
# Option 1: OpenRouter (Recommended)
OPENROUTER_API_KEY=your-openrouter-api-key
OPENROUTER_BASE_URL=https://openrouter.ai/api/v1
OPENROUTER_MODEL=anthropic/claude-3.5-sonnet

# Option 2: xAI Grok (for ShadowGrok)
SHADOWGROK_ENABLED=false
XAI_API_KEY=your-xai-api-key
XAI_BASE_URL=https://api.x.ai/v1
XAI_MODEL=grok-4.20-reasoning

# Option 3: Azure OpenAI
AZURE_OPENAI_ENDPOINT=https://your-resource.openai.azure.com/
AZURE_OPENAI_API_KEY=your-azure-openai-api-key
AZURE_OPENAI_DEPLOYMENT=gpt-4o

# Hysteria 2 Integration
HYSTERIA_TRAFFIC_API_BASE_URL=http://127.0.0.1:25000
HYSTERIA_TRAFFIC_API_SECRET=your_traffic_api_secret

# Threat Intelligence APIs
VIRUSTOTAL_API_KEY=your-virustotal-api-key
ALIENVAULT_OTX_KEY=your-alienvault-otx-key

# Email Service (optional)
RESEND_API_KEY=your-resend-api-key
MAIL_FROM=noreply@example.com

# Redis (optional - for rate limiting and caching)
REDIS_URL=redis://localhost:6379
```

### 5. Initialize Database

```bash
# Push schema to database
npm run prisma:push

# Generate Prisma Client
npm run prisma:generate

# Create admin user and seed demo data
npm run setup:admin
```

The `setup:admin` script:
- Creates an admin operator account
- Seeds 3 demo nodes for testing
- Seeds 3 demo client users
- Uses `ADMIN_USERNAME` and `ADMIN_PASSWORD` from env if provided

### 6. Start the Application

#### Development Mode

```bash
npm run dev
```

The development server will start at http://localhost:3000

#### Production Mode

```bash
# Build the application
npm run build

# Start production server
npm start
```

The production server will start at http://localhost:3000

## Verification

### Check Database Connection

```bash
# Open Prisma Studio to inspect database
npm run prisma:studio
```

This will open a web interface at http://localhost:5555 to view and edit database records.

### Test API Endpoints

```bash
# Test health endpoint
curl http://localhost:3000/api/health

# Test admin authentication (requires valid session)
curl http://localhost:3000/api/admin/nodes
```

### Run Test Suite

```bash
# Run all tests
npm test

# Run specific test suites
npm run test:shadowgrok
npm run test:opsec

# Run with coverage
npm run test:coverage
```

## Production Deployment

### Environment Setup

1. Set production environment variables on your hosting platform
2. Ensure all required secrets are configured:
   - `DATABASE_URL`
   - `ADMIN_USERNAME` and `ADMIN_PASSWORD`
   - AI provider API keys (if using AI features)
   - Hysteria 2 API credentials (if managing Hysteria 2)

### Database Migration

```bash
# Create migration (for production)
npm run prisma:migrate

# Or push schema directly (for simple deployments)
npm run prisma:push
```

### Build and Deploy

```bash
# Build for production
npm run build

# The build output is in .next/ directory
# Deploy this to your hosting platform
```

### Recommended Hosting Platforms

- **Vercel** - Zero-config deployment for Next.js
- **Railway** - Full-stack deployment with PostgreSQL
- **DigitalOcean App Platform** - Scalable container hosting
- **AWS ECS/Fargate** - Enterprise container orchestration
- **Self-hosted** - VPS with Node.js and PostgreSQL

### Docker Deployment

Create a `Dockerfile` (if not present):

```dockerfile
FROM node:20-alpine AS base

# Install dependencies only when needed
FROM base AS deps
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci

# Rebuild the source code only when needed
FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

# Production image
FROM base AS runner
WORKDIR /app
ENV NODE_ENV production
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs
EXPOSE 3000
ENV PORT 3000
ENV HOSTNAME "0.0.0.0"

CMD ["node", "server.js"]
```

Build and run with Docker:

```bash
# Build image
docker build -t hysteria2-admin .

# Run container
docker run -p 3000:3000 \
  -e DATABASE_URL=your_database_url \
  -e ADMIN_USERNAME=admin \
  -e ADMIN_PASSWORD=secure_password \
  hysteria2-admin
```

## Troubleshooting

### Database Connection Issues

**Error**: "Connection refused" or "Can't reach database"

**Solutions**:
1. Verify PostgreSQL is running: `docker ps` or `systemctl status postgresql`
2. Check DATABASE_URL in `.env.local` matches your PostgreSQL configuration
3. Ensure firewall allows connections on port 5432
4. Test connection: `psql postgresql://postgres:postgres@localhost:5432/hysteria2`

### Port Already in Use

**Error**: "Port 3000 is already in use"

**Solutions**:
1. Kill process using port 3000:
   ```bash
   # Linux/macOS
   lsof -ti:3000 | xargs kill -9
   
   # Windows
   netstat -ano | findstr :3000
   taskkill /PID <PID> /F
   ```
2. Use a different port:
   ```bash
   PORT=3001 npm run dev
   ```

### Prisma Client Issues

**Error**: "Prisma Client is not generated"

**Solutions**:
```bash
# Regenerate Prisma Client
npm run prisma:generate

# If schema changed, push to database
npm run prisma:push
```

### AI API Errors

**Error**: "API key missing" or "Invalid API key"

**Solutions**:
1. Verify API keys are set in `.env.local`
2. Check API key format and validity
3. Ensure API key has required permissions
4. Test API key with provider's documentation

### Build Errors

**Error**: Build fails with TypeScript or module errors

**Solutions**:
```bash
# Clear Next.js cache
rm -rf .next

# Clear node modules and reinstall
rm -rf node_modules package-lock.json
npm install

# Check for TypeScript errors
npm run lint
```

## Security Considerations

### Environment Variables

- Never commit `.env.local` to version control
- Use strong, unique passwords for admin accounts
- Rotate API keys regularly
- Use different API keys for development and production

### Database Security

- Use strong PostgreSQL passwords
- Enable SSL for database connections in production
- Restrict database access to specific IPs
- Regular database backups

### Application Security

- Keep dependencies updated: `npm audit fix`
- Enable HTTPS in production
- Implement rate limiting
- Use secure session management
- Regular security audits

## Updates and Maintenance

### Update Dependencies

```bash
# Check for outdated packages
npm outdated

# Update packages
npm update

# Audit for security vulnerabilities
npm audit
npm audit fix
```

### Database Backups

```bash
# Backup database
pg_dump hysteria2 > backup_$(date +%Y%m%d).sql

# Restore database
psql hysteria2 < backup_20240101.sql
```

### Log Monitoring

Monitor application logs for errors and performance issues:
- Development logs appear in terminal
- Production logs depend on hosting platform
- Consider using log aggregation services (Sentry, LogRocket)

## Support

For issues and questions:
- Check existing GitHub Issues
- Review documentation in `/docs` directory
- Consult API documentation in `/app/api` routes
- Review test files for usage examples

## Next Steps

After successful installation:

1. **Configure Hysteria 2 Integration** - Set up Traffic Stats API if managing Hysteria 2 nodes
2. **Configure AI Provider** - Set up OpenRouter, xAI, or Azure OpenAI for AI features
3. **Set Up Threat Intelligence** - Configure VirusTotal, AlienVault OTX for threat analysis
4. **Configure Email Service** - Set up Resend or custom SMTP for notifications
5. **Explore Features** - Navigate through the admin panel to explore all features
6. **Customize Configuration** - Adjust settings based on your requirements
7. **Set Up Monitoring** - Implement monitoring and alerting for production deployments

## Additional Resources

- [Next.js Documentation](https://nextjs.org/docs)
- [Prisma Documentation](https://www.prisma.io/docs)
- [Hysteria 2 Documentation](https://v2.hysteria.network/docs/)
- [OpenRouter Documentation](https://openrouter.ai/docs)
- [React Documentation](https://react.dev)