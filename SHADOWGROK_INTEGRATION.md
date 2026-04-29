# ShadowGrok Integration Guide

Complete integration guide for ShadowGrok autonomous C2 operations powered by xAI Grok API.

## Overview

ShadowGrok transforms the Hysteria 2 Admin Panel into an autonomous C2 operations system by integrating xAI's Grok API with specialized tool calling capabilities. This enables natural language control of complex red team operations with built-in safety guardrails.

## Architecture

```
User Request
    ↓
AI Chat UI
    ↓
POST /api/shadowgrok/execute
    ↓
ShadowGrok Agent Runner
    ↓
Grok API (xAI)
    ↓
Tool Execution Engine
    ↓
C2 Operations (Implants, Tasks, Nodes)
    ↓
Audit Logging & Approval System
```

## Components

### 1. Core Files

- **lib/grok/grok-tools.ts**: Tool registry with 12 specialized C2 tools
- **lib/grok/tool-executor.ts**: Tool execution engine with safety checks
- **lib/grok/agent-runner.ts**: Agent runner with Grok integration
- **app/api/shadowgrok/execute/route.ts**: API endpoint for execution
- **app/api/shadowgrok/approvals/route.ts**: Approval workflow endpoint

### 2. Database Schema

- **ShadowGrokExecution**: Tracks each autonomous operation
- **ShadowGrokToolCall**: Logs individual tool executions
- **ShadowGrokApproval**: Manages approval workflow for high-risk operations

## Installation & Setup

### 1. Environment Configuration

Add the following to your `.env.local`:

```bash
# Enable ShadowGrok
SHADOWGROK_ENABLED=true

# xAI Grok Configuration
XAI_API_KEY=your-xai-api-key-here
XAI_BASE_URL=https://api.x.ai/v1
XAI_MODEL=grok-4.20-reasoning

# Safety Settings
SHADOWGROK_REQUIRE_APPROVAL=true
SHADOWGROK_MAX_TOOL_ROUNDS=15
SHADOWGROK_MAX_CONCURRENT_TOOLS=5
SHADOWGROK_EXECUTION_TIMEOUT_MS=300000
SHADOWGROK_RISK_THRESHOLD=70
SHADOWGROK_AUTO_APPROVE_LOW_RISK=true
```

### 2. Database Migration

Run the Prisma migration to add ShadowGrok tables:

```bash
npm run prisma:push
```

Or create a migration:

```bash
npm run prisma:migrate --name add_shadowgrok_tables
```

### 3. Verify Installation

Test the installation by calling the API:

```bash
curl -X POST http://localhost:3000/api/shadowgrok/execute \
  -H "Content-Type: application/json" \
  -H "Cookie: your-session-cookie" \
  -d '{
    "message": "List all active implants",
    "requireApproval": false
  }'
```

## Available Tools

### Core C2 Tools

1. **generate_stealth_implant_config**
   - Generate stealth implant configurations
   - Supports anti-analysis, traffic blending, jitter
   - Parameters: target_os, stealth_level, traffic_blend_profile

2. **compile_and_deploy_implant**
   - Compile and deploy implants to nodes
   - Parameters: node_id, config, build_flags, auto_start

3. **send_c2_task_to_implant**
   - Execute C2 tasks on live implants
   - Parameters: implant_ids, task_type, payload, timeout_seconds

4. **query_implant_status**
   - Query real-time implant status
   - Parameters: implant_ids, include_traffic_stats

### Operations Tools

5. **trigger_kill_switch**
   - Execute kill switches with confirmation
   - Parameters: scope, mode, target_ids, confirmation_code
   - **Requires approval for global/immediate modes**

6. **analyze_traffic_and_suggest_evasion**
   - Analyze traffic patterns and recommend evasion
   - Parameters: node_id, time_window_hours, threat_model

7. **orchestrate_full_operation**
   - Plan multi-phase operations
   - Parameters: operation_goal, constraints, max_phases

### System Tools

8. **run_panel_command**
   - Execute panel commands
   - Parameters: command, working_dir, require_approval, timeout
   - **Requires approval**

9. **update_node_config**
   - Update Hysteria2 node configurations
   - Parameters: node_id, config_patch, hot_reload

10. **query_hysteria_traffic_stats**
    - Fetch live traffic statistics
    - Parameters: node_id, metric

11. **list_active_implants**
    - List and query active implants
    - Parameters: status_filter, limit

12. **assess_opsec_risk**
    - Assess operational security risk
    - Parameters: action_type, target_scope, context

## API Usage

### Execute ShadowGrok Operation

```typescript
const response = await fetch('/api/shadowgrok/execute', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    message: 'Deploy a stealth implant to Node-07 with Spotify traffic blending',
    requireApproval: true,
    maxToolRounds: 10,
  }),
});

const result = await response.json();
console.log(result.finalResponse);
console.log(result.toolExecutions);
```

### Get Execution Status

```typescript
const response = await fetch('/api/shadowgrok/execute?executionId=exec-123');
const { execution } = await response.json();
console.log(execution.status);
console.log(execution.toolCalls);
```

### Handle Approvals

```typescript
// List pending approvals
const approvalsResponse = await fetch('/api/shadowgrok/approvals?status=pending');
const { approvals } = await approvalsResponse.json();

// Approve an action
await fetch('/api/shadowgrok/approvals', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    approvalId: 'approval-123',
    action: 'approve',
  }),
});

// Reject an action
await fetch('/api/shadowgrok/approvals', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    approvalId: 'approval-123',
    action: 'reject',
    reason: 'Risk assessment score too high',
  }),
});
```

## Safety & Security

### Approval Workflow

High-risk tools require approval before execution:

- **trigger_kill_switch** (global/immediate modes)
- **run_panel_command**
- **compile_and_deploy_implant** (can be configured)

When these tools are called:

1. ShadowGrok pauses execution
2. Creates approval record in `shadowgrok_approvals` table
3. Returns `approvalRequired: true` in response
4. Admin must approve via `/api/shadowgrok/approvals`
5. Execution resumes after approval

### OPSEC Risk Assessment

Before sensitive operations, ShadowGrok automatically:

1. Calls `assess_opsec_risk` tool
2. Calculates risk score based on action type and scope
3. Compares against `SHADOWGROK_RISK_THRESHOLD`
4. Requires approval if score exceeds threshold
5. Provides recommendations for risk mitigation

### Audit Logging

All ShadowGrok operations are logged:

- **shadowgrok_executions**: Operation-level logging
- **shadowgrok_tool_calls**: Individual tool execution logs
- **shadowgrok_approvals**: Approval workflow tracking
- **audit_logs**: General audit trail

Regular monitoring recommended:

```sql
-- Recent operations
SELECT * FROM shadowgrok_executions 
ORDER BY created_at DESC LIMIT 20;

-- High-risk tool calls
SELECT * FROM shadowgrok_tool_calls 
WHERE tool_name IN ('trigger_kill_switch', 'run_panel_command')
ORDER BY executed_at DESC LIMIT 10;

-- Pending approvals
SELECT * FROM shadowgrok_approvals 
WHERE status = 'pending';
```

## UI Integration

### Basic Integration

Add a toggle to the AI chat interface:

```tsx
const [shadowGrokEnabled, setShadowGrokEnabled] = useState(false);

async function sendMessage(message: string) {
  if (shadowGrokEnabled) {
    const response = await fetch('/api/shadowgrok/execute', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message, requireApproval: true }),
    });
    return await response.json();
  } else {
    // Use regular AI chat
    return await sendRegularChatMessage(message);
  }
}

return (
  <div>
    <Toggle
      checked={shadowGrokEnabled}
      onChange={setShadowGrokEnabled}
      label="Enable ShadowGrok Autonomous Mode"
    />
    {/* Chat interface */}
  </div>
);
```

### Advanced Integration with Streaming

For real-time progress updates:

```tsx
async function sendShadowGrokMessage(message: string) {
  const response = await fetch('/api/shadowgrok/execute', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ 
      message, 
      requireApproval: true,
      stream: true 
    }),
  });

  // Handle streaming updates
  const reader = response.body?.getReader();
  while (true) {
    const { done, value } = await reader!.read();
    if (done) break;
    
    const update = JSON.parse(new TextDecoder().decode(value));
    if (update.type === 'tool_call') {
      showToolCallNotification(update.data);
    } else if (update.type === 'tool_result') {
      updateToolCallStatus(update.data);
    }
  }
}
```

### Approval UI Component

```tsx
function ApprovalPanel() {
  const [approvals, setApprovals] = useState([]);

  useEffect(() => {
    loadApprovals();
    const interval = setInterval(loadApprovals, 30000);
    return () => clearInterval(interval);
  }, []);

  async function loadApprovals() {
    const response = await fetch('/api/shadowgrok/approvals?status=pending');
    const { approvals } = await response.json();
    setApprovals(approvals);
  }

  async function handleApproval(approvalId: string, action: 'approve' | 'reject') {
    await fetch('/api/shadowgrok/approvals', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ approvalId, action }),
    });
    loadApprovals();
  }

  return (
    <div>
      <h2>Pending Approvals</h2>
      {approvals.map(approval => (
        <div key={approval.id}>
          <span>{approval.toolName}</span>
          <button onClick={() => handleApproval(approval.id, 'approve')}>
            Approve
          </button>
          <button onClick={() => handleApproval(approval.id, 'reject')}>
            Reject
          </button>
        </div>
      ))}
    </div>
  );
}
```

## Testing

### Unit Testing

Test individual tool executions:

```typescript
import { executeShadowGrokTool } from '@/lib/grok/tool-executor';

const result = await executeShadowGrokTool(
  'list_active_implants',
  { status_filter: 'active', limit: 10 },
  { signal: AbortSignal.timeout(10000), invokerUid: 'test-user' }
);

console.log(result);
```

### Integration Testing

Test full workflow:

```typescript
import { runShadowGrokWithTools } from '@/lib/grok/agent-runner';

const result = await runShadowGrokWithTools(
  'List all active implants and provide traffic statistics',
  'test-user',
  { requireApproval: false }
);

console.log(result.finalResponse);
console.log(result.toolExecutions);
```

### Safety Testing

Test approval workflow:

```typescript
// This should require approval
const result = await runShadowGrokWithTools(
  'Trigger global kill switch immediately',
  'test-user',
  { requireApproval: true }
);

console.log(result.approvalRequired); // Should be true
```

## Troubleshooting

### ShadowGrok Not Responding

1. Check environment variables:
   ```bash
   echo $SHADOWGROK_ENABLED
   echo $XAI_API_KEY
   ```

2. Verify xAI API connectivity:
   ```bash
   curl -H "Authorization: Bearer $XAI_API_KEY" https://api.x.ai/v1/models
   ```

3. Check logs for errors:
   ```bash
   npm run dev
   # Look for ShadowGrok-specific errors
   ```

### Approval Workflow Issues

1. Check pending approvals in database:
   ```sql
   SELECT * FROM shadowgrok_approvals WHERE status = 'pending';
   ```

2. Verify approval expiration:
   ```sql
   SELECT * FROM shadowgrok_approvals 
   WHERE expires_at < NOW();
   ```

3. Check approval permissions:
   ```sql
   SELECT * FROM operators WHERE id = 'your-operator-id';
   ```

### Tool Execution Failures

1. Check tool call logs:
   ```sql
   SELECT * FROM shadowgrok_tool_calls 
   WHERE success = false 
   ORDER BY executed_at DESC LIMIT 10;
   ```

2. Verify tool parameters:
   ```sql
   SELECT tool_name, arguments, error 
   FROM shadowgrok_tool_calls 
   WHERE success = false;
   ```

3. Check system resources:
   ```bash
   # Check if implant compilation service is running
   # Check if Hysteria nodes are accessible
   # Check database connectivity
   ```

## Performance Optimization

### Caching

Enable Redis caching for repeated operations:

```bash
REDIS_URL=redis://localhost:6379
```

### Rate Limiting

Configure rate limits for xAI API:

```bash
SHADOWGROK_MAX_TOOL_ROUNDS=15
SHADOWGROK_MAX_CONCURRENT_TOOLS=5
```

### Database Indexing

Ensure proper indexes on ShadowGrok tables:

```sql
CREATE INDEX idx_shadowgrok_executions_user_created 
ON shadowgrok_executions(userId, createdAt DESC);

CREATE INDEX idx_shadowgrok_tool_calls_execution 
ON shadowgrok_tool_calls(executionId, executedAt);

CREATE INDEX idx_shadowgrok_approvals_status 
ON shadowgrok_approvals(status, requestedAt DESC);
```

## Best Practices

1. **Start with Safety On**: Always enable `SHADOWGROK_REQUIRE_APPROVAL=true` initially
2. **Monitor Approvals**: Review pending approvals regularly
3. **Audit Logs**: Regularly audit execution logs for unusual activity
4. **Test Thoroughly**: Test with low-risk operations before enabling high-risk tools
5. **Keep Keys Secure**: Rotate xAI API keys regularly
6. **Set Reasonable Limits**: Configure appropriate timeout and round limits
7. **Backup Data**: Regular backup of ShadowGrok tables
8. **Update Dependencies**: Keep xAI SDK and dependencies updated

## Future Enhancements

- [ ] Multi-agent support for specialized roles
- [ ] Advanced operation templates
- [ ] Real-time collaboration features
- [ ] Enhanced reporting and analytics
- [ ] Integration with additional threat intelligence feeds
- [ ] Custom tool registration interface
- [ ] Advanced scheduling and automation
- [ ] Mobile app support

## Support

For issues or questions:
1. Check this documentation
2. Review audit logs and error messages
3. Test with simplified operations
4. Consult the main README.md for general panel information

---

**ShadowGrok Integration Complete** - Your Hysteria 2 Admin Panel is now equipped with autonomous C2 operations powered by xAI Grok.