#!/bin/bash

# D-Panel Implant Build Script
# Builds cross-platform implant binaries for red team operations

set -e

echo "[+] D-Panel Implant Build Script Starting..."
echo "[+] Building Hysteria2 QUIC-based C2 implant"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Configuration
VERSION="0.1"
BUILD_DIR="build"
DIST_DIR="dist"

# Clean previous builds
echo "[+] Cleaning previous builds..."
rm -rf $BUILD_DIR $DIST_DIR
mkdir -p $BUILD_DIR $DIST_DIR

# Build for multiple platforms
PLATFORMS=(
    "windows/amd64"
    "windows/386" 
    "linux/amd64"
    "linux/386"
    "linux/arm64"
    "darwin/amd64"
    "darwin/arm64"
)

echo "[+] Building for platforms: ${PLATFORMS[@]}"

for platform in "${PLATFORMS[@]}"; do
    platform_split=(${platform//\// })
    GOOS=${platform_split[0]}
    GOARCH=${platform_split[1]}
    
    output_name="h2-implant-${GOOS}-${GOARCH}"
    if [ $GOOS = "windows" ]; then
        output_name+='.exe'
    fi
    
    echo "[+] Building for $GOOS/$GOARCH..."
    
    # Set environment variables for cross-compilation
    export GOOS=$GOOS
    export GOARCH=$GOARCH
    export CGO_ENABLED=0
    
    # Build the implant
    go build -ldflags "-s -w -X main.version=$VERSION" \
             -trimpath \
             -o $BUILD_DIR/$output_name \
             .
    
    if [ $? -ne 0 ]; then
        echo -e "${RED}[-] Build failed for $GOOS/$GOARCH${NC}"
        exit 1
    fi
    
    echo -e "${GREEN}[+] Successfully built $output_name${NC}"
    
    # Create compressed archive
    if [ $GOOS = "windows" ]; then
        cd $BUILD_DIR
        zip -q "../$DIST_DIR/${output_name}.zip" $output_name
        cd ..
    else
        tar -czf "$DIST_DIR/${output_name}.tar.gz" -C $BUILD_DIR $output_name
    fi
    
    echo "[+] Archived: ${output_name}.tar.gz"
done

# Generate checksums
echo "[+] Generating checksums..."
cd $DIST_DIR
sha256sum * > checksums.txt
cd ..

# Create deployment package
echo "[+] Creating deployment package..."
DEPLOY_PACKAGE="dpanel-implant-v${VERSION}-$(date +%Y%m%d).tar.gz"
tar -czf "$DEPLOY_PACKAGE" $DIST_DIR/ README.md

echo -e "${GREEN}[+] Build completed successfully!${NC}"
echo "[+] Distribution files in: $DIST_DIR/"
echo "[+] Deployment package: $DEPLOY_PACKAGE"
echo "[+] Checksums: $DIST_DIR/checksums.txt"

# List built files
echo ""
echo "[+] Built files:"
ls -la $DIST_DIR/

echo ""
echo -e "${GREEN}[+] Ready for deployment to AWS server ec2-13-55-232-246.ap-southeast-2.compute.amazonaws.com${NC}"