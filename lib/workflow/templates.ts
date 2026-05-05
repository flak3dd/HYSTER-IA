/**
 * Pre-built workflow templates for common operations
 */

export interface WorkflowTemplate {
  id: string
  name: string
  description: string
  category: 'node_management' | 'user_management' | 'configuration' | 'system' | 'advanced' | 'post_exploitation'
  initialPrompt: string
  icon?: string
  estimatedSteps: number
  requiredParams?: Array<{
    name: string
    type: string
    description: string
    placeholder: string
  }>
}

export const WORKFLOW_TEMPLATES: WorkflowTemplate[] = [
  {
    id: 'create_node',
    name: 'Create New Node',
    description: 'Deploy a new Hysteria2 node with custom configuration',
    category: 'node_management',
    initialPrompt: 'Create a new Hysteria2 node',
    icon: 'server',
    estimatedSteps: 3,
    requiredParams: [
      { name: 'name', type: 'string', description: 'Node name', placeholder: 'us-east-1-node' },
      { name: 'hostname', type: 'string', description: 'Hostname or IP address', placeholder: 'node.example.com' },
      { name: 'region', type: 'string', description: 'Region (optional)', placeholder: 'us-east-1' },
    ],
  },
  {
    id: 'create_user',
    name: 'Add New User',
    description: 'Create a new client user with quota settings',
    category: 'user_management',
    initialPrompt: 'Create a new client user',
    icon: 'users',
    estimatedSteps: 2,
    requiredParams: [
      { name: 'displayName', type: 'string', description: 'User display name', placeholder: 'John Doe' },
      { name: 'quotaBytes', type: 'number', description: 'Quota in bytes (optional)', placeholder: '10737418240' },
    ],
  },
  {
    id: 'list_nodes',
    name: 'List All Nodes',
    description: 'View all configured Hysteria2 nodes',
    category: 'node_management',
    initialPrompt: 'List all Hysteria2 nodes',
    icon: 'list',
    estimatedSteps: 1,
  },
  {
    id: 'check_status',
    name: 'Check System Status',
    description: 'Get overall system health and metrics',
    category: 'system',
    initialPrompt: 'Check system status and health',
    icon: 'activity',
    estimatedSteps: 1,
  },
  {
    id: 'generate_config',
    name: 'Generate Client Config',
    description: 'Generate configuration file for a specific user',
    category: 'configuration',
    initialPrompt: 'Generate client configuration',
    icon: 'file-code',
    estimatedSteps: 2,
    requiredParams: [
      { name: 'userId', type: 'string', description: 'User ID', placeholder: 'user-123' },
      { name: 'format', type: 'string', description: 'Config format (yaml, uri, clash)', placeholder: 'yaml' },
    ],
  },
  {
    id: 'restart_service',
    name: 'Restart Service',
    description: 'Restart the Hysteria2 service',
    category: 'system',
    initialPrompt: 'Restart the Hysteria2 service',
    icon: 'refresh-cw',
    estimatedSteps: 2,
  },
  {
    id: 'update_node',
    name: 'Update Node',
    description: 'Update configuration of an existing node',
    category: 'node_management',
    initialPrompt: 'Update node configuration',
    icon: 'edit',
    estimatedSteps: 2,
    requiredParams: [
      { name: 'nodeId', type: 'string', description: 'Node ID', placeholder: 'node-123' },
    ],
  },
  {
    id: 'delete_user',
    name: 'Delete User',
    description: 'Remove a client user from the system',
    category: 'user_management',
    initialPrompt: 'Delete a user',
    icon: 'trash',
    estimatedSteps: 2,
    requiredParams: [
      { name: 'userId', type: 'string', description: 'User ID to delete', placeholder: 'user-123' },
    ],
  },
  {
    id: 'complex_operation',
    name: 'Complex Operation',
    description: 'Execute a complex multi-step operation using AI agents',
    category: 'advanced',
    initialPrompt: 'I need help with a complex operation',
    icon: 'zap',
    estimatedSteps: 5,
  },
  {
    id: 'health_check',
    name: 'System Health Check',
    description: 'Comprehensive system health and connectivity check',
    category: 'system',
    initialPrompt: 'Perform comprehensive system health check',
    icon: 'heart',
    estimatedSteps: 3,
  },
  {
    id: 'lateral_movement',
    name: 'Lateral Movement',
    description: 'Execute lateral movement across compromised network using various techniques',
    category: 'post_exploitation',
    initialPrompt: 'Execute lateral movement from a compromised host',
    icon: 'arrow-right',
    estimatedSteps: 4,
    requiredParams: [
      { name: 'sourceHostId', type: 'string', description: 'Source compromised host ID', placeholder: 'host-123' },
      { name: 'targetHostId', type: 'string', description: 'Target host ID', placeholder: 'host-456' },
      { name: 'technique', type: 'string', description: 'Movement technique (smb, winrm, pth)', placeholder: 'smb' },
      { name: 'credentialId', type: 'string', description: 'Credential ID to use', placeholder: 'cred-789' },
    ],
  },
  {
    id: 'credential_harvest',
    name: 'Credential Harvest',
    description: 'Harvest credentials from compromised hosts using various methods',
    category: 'post_exploitation',
    initialPrompt: 'Harvest credentials from a compromised host',
    icon: 'key',
    estimatedSteps: 3,
    requiredParams: [
      { name: 'hostId', type: 'string', description: 'Compromised host ID', placeholder: 'host-123' },
      { name: 'methods', type: 'array', description: 'Harvest methods (lsass, cached, registry)', placeholder: 'lsass, cached' },
    ],
  },
  {
    id: 'attack_path_discovery',
    name: 'Attack Path Discovery',
    description: 'Discover optimal attack paths using graph-based analysis',
    category: 'post_exploitation',
    initialPrompt: 'Discover attack paths to target privilege level',
    icon: 'git-branch',
    estimatedSteps: 2,
    requiredParams: [
      { name: 'sourceHostId', type: 'string', description: 'Source compromised host ID', placeholder: 'host-123' },
      { name: 'targetPrivilege', type: 'string', description: 'Target privilege level (user, admin, domain_admin)', placeholder: 'domain_admin' },
    ],
  },
  {
    id: 'auto_pivot',
    name: 'Auto Pivot',
    description: 'Automatically pivot through network to reach target privilege level',
    category: 'post_exploitation',
    initialPrompt: 'Auto-pivot to Domain Admin',
    icon: 'git-merge',
    estimatedSteps: 5,
    requiredParams: [
      { name: 'sourceHostId', type: 'string', description: 'Source compromised host ID', placeholder: 'host-123' },
      { name: 'targetPrivilege', type: 'string', description: 'Target privilege level', placeholder: 'domain_admin' },
    ],
  },
]

export function getTemplateById(id: string): WorkflowTemplate | undefined {
  return WORKFLOW_TEMPLATES.find(t => t.id === id)
}

export function getTemplatesByCategory(category: WorkflowTemplate['category']): WorkflowTemplate[] {
  return WORKFLOW_TEMPLATES.filter(t => t.category === category)
}

export function searchTemplates(query: string): WorkflowTemplate[] {
  const lowerQuery = query.toLowerCase()
  return WORKFLOW_TEMPLATES.filter(t => 
    t.name.toLowerCase().includes(lowerQuery) ||
    t.description.toLowerCase().includes(lowerQuery) ||
    t.category.toLowerCase().includes(lowerQuery)
  )
}