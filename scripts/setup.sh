#!/bin/bash

# Hysteria 2 Admin Panel - Automated Setup Script
# This script helps automate the installation process

set -e

echo "🚀 Hysteria 2 Admin Panel - Setup Script"
echo "========================================"
echo ""

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Function to print colored output
print_success() {
    echo -e "${GREEN}✓ $1${NC}"
}

print_error() {
    echo -e "${RED}✗ $1${NC}"
}

print_warning() {
    echo -e "${YELLOW}⚠ $1${NC}"
}

print_info() {
    echo "ℹ $1"
}

# Check if Node.js is installed
check_nodejs() {
    print_info "Checking Node.js installation..."
    if ! command -v node &> /dev/null; then
        print_error "Node.js is not installed"
        print_info "Please install Node.js 20+ from https://nodejs.org/"
        exit 1
    fi
    
    NODE_VERSION=$(node -v)
    print_success "Node.js is installed: $NODE_VERSION"
    
    # Check if version is 20+
    MAJOR_VERSION=$(echo $NODE_VERSION | cut -d'.' -f1 | sed 's/v//')
    if [ "$MAJOR_VERSION" -lt 20 ]; then
        print_error "Node.js version 20+ is required (current: $NODE_VERSION)"
        exit 1
    fi
}

# Check if npm is installed
check_npm() {
    print_info "Checking npm installation..."
    if ! command -v npm &> /dev/null; then
        print_error "npm is not installed"
        exit 1
    fi
    
    NPM_VERSION=$(npm -v)
    print_success "npm is installed: $NPM_VERSION"
}

# Check if PostgreSQL is running
check_postgresql() {
    print_info "Checking PostgreSQL installation..."
    if ! command -v psql &> /dev/null; then
        print_warning "PostgreSQL client not found"
        print_info "PostgreSQL is required. Please install PostgreSQL 14+"
        print_info "Or use Docker: docker run --name hysteria2-postgres -e POSTGRES_PASSWORD=postgres -p 5432:5432 -d postgres:14"
        read -p "Continue anyway? (y/n) " -n 1 -r
        echo
        if [[ ! $REPLY =~ ^[Yy]$ ]]; then
            exit 1
        fi
    else
        print_success "PostgreSQL client is installed"
    fi
}

# Install dependencies
install_dependencies() {
    print_info "Installing npm dependencies..."
    if npm install; then
        print_success "Dependencies installed successfully"
    else
        print_error "Failed to install dependencies"
        exit 1
    fi
}

# Setup environment file
setup_env() {
    print_info "Setting up environment configuration..."
    
    if [ -f .env.local ]; then
        print_warning ".env.local already exists"
        read -p "Overwrite existing .env.local? (y/n) " -n 1 -r
        echo
        if [[ ! $REPLY =~ ^[Yy]$ ]]; then
            print_info "Keeping existing .env.local"
            return
        fi
    fi
    
    if [ -f .env.example ]; then
        cp .env.example .env.local
        print_success "Created .env.local from .env.example"
        print_warning "Please edit .env.local with your configuration"
        print_info "Required variables: DATABASE_URL"
        print_info "Optional variables: AI provider keys, Hysteria 2 API credentials"
    else
        print_error ".env.example not found"
        exit 1
    fi
}

# Initialize database
init_database() {
    print_info "Initializing database..."
    
    read -p "Have you configured DATABASE_URL in .env.local? (y/n) " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        print_warning "Please configure DATABASE_URL in .env.local before continuing"
        print_info "Example: DATABASE_URL=postgresql://postgres:postgres@localhost:5432/hysteria2?schema=public"
        read -p "Press Enter to continue after editing .env.local..."
    fi
    
    if npm run prisma:push; then
        print_success "Database schema pushed successfully"
    else
        print_error "Failed to push database schema"
        print_info "Please check your DATABASE_URL configuration"
        exit 1
    fi
    
    if npm run prisma:generate; then
        print_success "Prisma Client generated successfully"
    else
        print_error "Failed to generate Prisma Client"
        exit 1
    fi
}

# Setup admin user
setup_admin() {
    print_info "Setting up admin user..."
    
    if npm run setup:admin; then
        print_success "Admin user created successfully"
        print_info "Default credentials: admin / admin123 (unless customized in .env.local)"
    else
        print_error "Failed to setup admin user"
        exit 1
    fi
}

# Run tests (optional)
run_tests() {
    print_info "Do you want to run the test suite? (y/n) " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        print_info "Running tests..."
        if npm test; then
            print_success "All tests passed"
        else
            print_warning "Some tests failed. This might be expected if API keys are not configured."
        fi
    fi
}

# Print completion message
print_completion() {
    echo ""
    echo "========================================"
    print_success "Setup completed successfully!"
    echo "========================================"
    echo ""
    print_info "Next steps:"
    echo "  1. Edit .env.local with your configuration"
    echo "  2. Start the development server: npm run dev"
    echo "  3. Open http://localhost:3000/login in your browser"
    echo "  4. Login with admin credentials"
    echo ""
    print_info "For detailed installation instructions, see INSTALL.md"
    echo ""
}

# Main execution
main() {
    check_nodejs
    check_npm
    check_postgresql
    install_dependencies
    setup_env
    init_database
    setup_admin
    run_tests
    print_completion
}

# Run main function
main