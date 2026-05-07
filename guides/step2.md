Detailed Instruction Guide: 2. Hysteria 2 Node Management
This guide covers everything you need to know about managing Hysteria 2 nodes in HYSTER-IA.
Overview
The Nodes module is the core of the platform. It provides full CRUD (Create, Read, Update, Delete) operations, real-time monitoring, deployment presets, and client config generation.
Key Capabilities:

Add, edit, delete, and search nodes
Deployment presets (Basic TLS, Obfuscated, High-throughput, Minimal)
Real-time traffic stats, health checks, and bandwidth monitoring
Multi-format client config generation
Public subscription endpoint
Optional process lifecycle management

Step-by-Step Instructions
1. Access the Nodes Section

Log in to HYSTER-IA (http://localhost:3000 or your deployed URL).
From the left sidebar, click Nodes (or navigate to /admin/nodes).

You will see:

Summary cards (Total Nodes, Online Nodes, Active Connections, Total Bandwidth)
Search bar + filters (by status, provider, tags)
Nodes table with columns: Name, Status, Provider, IP/Host, Connections, Bandwidth, Last Seen, Actions

2. Add a New Node
Method A: Using Deployment Modal (Recommended)

Click the + Add Node button (top right).
Select a Preset:
Basic TLS — Simple TLS setup
Obfuscated — Strong obfuscation + masquerading
High-throughput — BBR congestion control, high bandwidth
Minimal — Low-resource VPS

Fill in the form:
Node Name (e.g., tokyo-node-01)
Server Address (IP or domain)
Listen Port (default: 443)
Provider (AWS, DigitalOcean, Hetzner, etc.)
Tags (e.g., gaming, residential, high-speed)
Authentication (Password or Certificate)
Traffic Stats API settings (if enabling real-time monitoring)

Click Deploy / Save.

Method B: Manual Entry

Use the same modal but skip preset and configure all fields manually.

3. Configure Hysteria 2 Traffic Stats API (for Live Monitoring)
In .env.local (highly recommended):
envHYSTERIA_TRAFFIC_API_BASE_URL=http://your-hysteria-server:25000
HYSTERIA_TRAFFIC_API_SECRET=your-secret-key
This enables:

Real-time bandwidth graphs
Active connections count
Health status (green/yellow/red)

4. View & Manage Existing Nodes

Click any node row to open the Detail Modal.
Available actions:
Edit node details
Rotate Auth (regenerate password/cert)
Restart (if process management enabled)
Delete node
Generate Configs (direct button)


5. Client Config Generation

Select one or more nodes (checkboxes).
Click Generate Configs (top of table or in detail modal).
Choose output format:
Official Hysteria 2 YAML
hysteria2:// URI
Clash Meta YAML
sing-box JSON

Copy or download the config.

Public Subscription Endpoint (great for clients):
texthttps://your-panel-domain/api/sub/hysteria2?token=YOUR_USER_TOKEN&tags=high-speed&format=clash
6. Real-Time Monitoring

The dashboard automatically polls for updates.
Watch:
Online/Offline status
Bandwidth usage (Upload/Download)
Active connections
Health indicators


7. Using the AI Config Assistant (for Server-Side Configs)
Navigate to AI → Config Assistant and use prompts like:
textGenerate a high-performance Hysteria 2 server config optimized for 1Gbps link with strong obfuscation, masquerading as microsoft.com, and BBR congestion control.
textCreate a stealthy Hysteria 2 config with password auth, TLS fingerprint randomization, and rate limiting for 200 users.
The AI outputs a full YAML — review and apply it to your node.
Best Practices

Use separate nodes for different purposes (e.g., one for phishing egress, one for C2).
Enable masquerading on all production nodes.
Tag nodes properly for easy filtering.
Rotate authentication credentials regularly.
Monitor bandwidth to avoid abuse flags from providers.

Troubleshooting

Node shows Offline → Check Hysteria 2 is running and Traffic Stats API is reachable.
No real-time stats → Verify HYSTERIA_TRAFFIC_API_* variables and restart the app.
Config generation fails → Ensure the node has valid listen address and auth settings.
High latency → Try different presets or enable QUIC obfuscation