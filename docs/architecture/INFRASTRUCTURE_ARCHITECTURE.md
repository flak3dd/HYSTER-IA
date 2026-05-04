# Hysteria 2 C2 Infrastructure Architecture

## Overview
Multi-layered proxy infrastructure designed for operational security, redundancy, and traffic obfuscation. This architecture provides defense-in-depth with multiple redirectors, dedicated teamserver, and segregated egress nodes.

## Architecture Components

### 1. Front-end Redirectors (Public Facing)
**Purpose**: Initial entry points that masquerade as legitimate services

**Configuration**:
- Multiple VPS instances across different countries/providers
- Plain Hysteria2 servers with HTTP/3 masquerading
- Masquerade as news sites, CDNs, or legitimate web services
- Forward authenticated traffic to teamserver via Hysteria2

**Deployment Strategy**:
```
VPS 1 (US-East)     → Hysteria2 → Teamserver
VPS 2 (EU-West)     → Hysteria2 → Teamserver  
VPS 3 (Asia-Pacific) → Hysteria2 → Teamserver
VPS 4 (South America) → Hysteria2 → Teamserver
```

**Masquerade Examples**:
- News sites (CNN, BBC, Reuters clones)
- CDN endpoints (Cloudflare, Fastly, Akamai)
- Video streaming platforms
- Government portals
- Educational institutions

### 2. Teamserver (Command & Control)
**Purpose**: Central management console with enhanced security

**Components**:
- Modified Next.js Hysteria2 Admin Panel
- New D-Panel APIs for advanced operations
- Real-time dashboard and agent management
- AI-powered configuration assistance
- Multi-tool agent system

**Security Layers**:
- Behind Hysteria2 layer for operator access
- Optional WireGuard backup access
- Firebase Auth with custom admin claims
- Rate limiting and abuse protection

**Access Methods**:
```
Operators → Hysteria2 → Teamserver
Operators → WireGuard → Teamserver (Backup)
```

### 3. Egress Nodes (Traffic Exit)
**Purpose**: Dedicated high-bandwidth nodes for outbound traffic

**Use Cases**:
- LLM API calls (OpenAI, Blackbox AI, etc.)
- Web reconnaissance and data exfiltration
- C2 communications to external services
- Traffic scrubbing and analysis

**Configuration**:
- High-bandwidth VPS/dedicated servers
- Rotating proxy strategy implementation
- Geographically diverse locations
- Traffic analysis and logging

**Traffic Flow**:
```
Teamserver Agents → SOCKS5/HTTP → Egress Nodes → Internet
LLM Calls → Proxy Routing → Egress Nodes → AI APIs
```

### 4. Domain Fronting & CDN Abuse
**Purpose**: Additional obfuscation layer when needed

**Implementation Options**:
- Cloudflare Workers/Apps
- AWS CloudFront distributions
- Azure Front Door
- Google Cloud CDN

**Usage Scenarios**:
- When Hysteria2 HTTP/3 masquerading is insufficient
- For high-value targets requiring extra layers
- Bypassing sophisticated network inspection
- Redundant communication channels

## Traffic Flow Analysis

### Client → Teamserver Flow
```
Client → Redirector VPS → Hysteria2 → Teamserver
         (Masqueraded)    (Encrypted)   (Decrypted)
```

### Teamserver → Internet Flow
```
Teamserver → Egress Node → Target Service
   (Agent)    (Proxy)      (Final Destination)
```

### Operator Access Flow
```
Operator → Hysteria2/WireGuard → Teamserver
           (Secure Tunnel)       (Management Interface)
```

## Security Benefits

### 1. Multi-Layer Obfuscation
- **Layer 1**: HTTP/3 masquerading on redirectors
- **Layer 2**: Hysteria2 protocol obfuscation
- **Layer 3**: Domain fronting (optional)
- **Layer 4**: Egress node rotation

### 2. Redundancy & Resilience
- Multiple redirectors prevent single point of failure
- Geographic distribution avoids regional blocking
- Backup access methods (WireGuard)
- Rotating egress nodes prevent IP reputation damage

### 3. Traffic Analysis Resistance
- Masquerading as legitimate services
- HTTP/3 protocol blending
- Distributed traffic patterns
- No direct C2 server exposure

### 4. Operational Security
- Separation of public and infrastructure components
- Dedicated operator access channels
- Traffic segregation by purpose
- Centralized management through teamserver

## Implementation Considerations

### Redirector Configuration
```yaml
# Hysteria2 redirector config
listen: :443
tls:
  mode: acme
  domains: ["news.example.com"]
  email: admin@example.com
masquerade:
  type: proxy
  proxy:
    url: https://cnn.com
    rewriteHost: true
trafficStats:
  listen: :25000
  secret: "secure-secret-16-chars"
auth:
  type: http
  http:
    url: https://teamserver.example.com/api/hysteria/auth
```

### Egress Node Setup
```yaml
# Egress node with rotating proxy
listen: :1080  # SOCKS5
type: socks5
upstream:
  - proxy1.example.com:1080
  - proxy2.example.com:1080
  - proxy3.example.com:1080
rotation: round-robin
```

### Teamserver Hardening
```bash
# Security hardening
ufw deny 80
ufw deny 443
ufw allow from <operator-ips> to any port 22
ufw allow from <redirector-ips> to any port 443
```

## Deployment Strategy

### Phase 1: Infrastructure Setup
1. Deploy redirector VPS across multiple providers
2. Configure Hysteria2 with appropriate masquerading
3. Set up teamserver with security hardening
4. Deploy egress nodes with proxy rotation

### Phase 2: Integration Testing
1. Test client connectivity through redirectors
2. Verify agent egress through proxy nodes
3. Validate operator access channels
4. Test failover scenarios

### Phase 3: Operational Deployment
1. Configure monitoring and alerting
2. Set up automated failover
3. Implement traffic analysis
4. Deploy operational procedures

## Monitoring & Maintenance

### Health Checks
- Redirector availability and responsiveness
- Teamserver service status
- Egress node bandwidth and latency
- SSL certificate validity

### Traffic Analysis
- Connection patterns and anomalies
- Geographic distribution analysis
- Bandwidth utilization trends
- Error rates and failure patterns

### Security Monitoring
- Authentication attempt patterns
- Unusual traffic spikes
- IP reputation monitoring
- Certificate transparency logs

## Operational Procedures

### Redirector Rotation
- Monthly VPS provider rotation
- Masquerade target updates
- SSL certificate renewal
- Domain registration management

### Egress Node Management
- Weekly IP reputation checks
- Bandwidth capacity planning
- Proxy rotation configuration
- Traffic log analysis

### Incident Response
- Compromised node isolation procedures
- Traffic redirection protocols
- Operator communication channels
- Forensic data preservation

This architecture provides a robust, scalable, and secure foundation for Hysteria2 C2 operations with multiple layers of obfuscation and redundancy.