/**
 * Pre-built workflow templates for common operations
 */

export interface WorkflowTemplate {
  id: string
  name: string
  description: string
  category: 'node_management' | 'user_management' | 'configuration' | 'system' | 'advanced'
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