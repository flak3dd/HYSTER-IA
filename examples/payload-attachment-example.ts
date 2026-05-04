/**
 * Example: Using Payload Attachments with Hysteria Tunnel Configuration
 * 
 * This example demonstrates how to attach additional payloads to tunnel
 * configuration emails using the enhanced mailer system.
 */

import {
  sendHiddenHysteriaTunnelScript,
  createConfigPayload,
  createSetupScriptPayload,
  createEnvPayload,
  createReadmePayload,
  createBinaryPayload,
  PayloadTemplates,
  type PayloadAttachment,
} from '../mailer-service/index';

// Example 1: Basic tunnel with documentation
async function example1_BasicWithDocs() {
  console.log('Example 1: Basic tunnel with documentation');
  
  const result = await sendHiddenHysteriaTunnelScript({
    to: 'user@example.com',
    subject: 'Your Secure Tunnel Access',
    tunnelType: 'hysteria2-obfs',
    platform: 'linux',
    stealthLevel: 'high',
    expiresInHours: 72,
    payloads: [
      PayloadTemplates.documentation(),
    ],
  });
  
  console.log('Email sent:', result);
}

// Example 2: Tunnel with persistence and monitoring
async function example2_WithPersistence() {
  console.log('Example 2: Tunnel with persistence and monitoring');
  
  const payloads: PayloadAttachment[] = [
    PayloadTemplates.persistence('linux'),
    PayloadTemplates.monitoring(),
    PayloadTemplates.cleanup('linux'),
  ];
  
  const result = await sendHiddenHysteriaTunnelScript({
    to: 'user@example.com',
    subject: 'Persistent Tunnel Configuration',
    tunnelType: 'hysteria2-obfs',
    platform: 'linux',
    stealthLevel: 'maximum',
    expiresInHours: 168, // 1 week
    payloads,
  });
  
  console.log('Email sent with', result.attachmentsCount, 'attachments');
}

// Example 3: Custom configuration payload
async function example3_CustomConfig() {
  console.log('Example 3: Tunnel with custom configuration');
  
  const customConfig = {
    server: 'custom-server.example.com:443',
    auth: 'custom-password-123',
    obfs: {
      type: 'salamander',
      password: 'obfs-password-456',
    },
    quic: {
      congestion: 'bbr',
      initialStreamReceiveWindow: 8388608,
    },
  };
  
  const payloads: PayloadAttachment[] = [
    createConfigPayload('custom-hysteria-config.json', customConfig, 'Custom Hysteria2 configuration'),
    PayloadTemplates.documentation(),
  ];
  
  const result = await sendHiddenHysteriaTunnelScript({
    to: 'user@example.com',
    subject: 'Custom Tunnel Configuration',
    tunnelType: 'hysteria2',
    platform: 'all',
    stealthLevel: 'high',
    expiresInHours: 48,
    customConfig,
    payloads,
  });
  
  console.log('Email sent:', result);
}

// Example 4: Windows-specific payloads
async function example4_WindowsPayloads() {
  console.log('Example 4: Windows-specific payloads');
  
  const payloads: PayloadAttachment[] = [
    PayloadTemplates.persistence('windows'),
    PayloadTemplates.cleanup('windows'),
    createSetupScriptPayload([
      '# Windows-specific setup',
      'Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser',
      'Write-Host "Environment configured for Windows"',
    ], 'windows', 'Windows environment setup'),
  ];
  
  const result = await sendHiddenHysteriaTunnelScript({
    to: 'user@example.com',
    subject: 'Windows Tunnel Configuration',
    tunnelType: 'hysteria2-obfs',
    platform: 'windows',
    stealthLevel: 'high',
    expiresInHours: 72,
    payloads,
  });
  
  console.log('Email sent:', result);
}

// Example 5: Environment variables payload
async function example5_WithEnvVars() {
  console.log('Example 5: Tunnel with environment variables');
  
  const envVars = {
    TUNNEL_SERVER: 'hysteria.example.com',
    TUNNEL_PORT: '443',
    TUNNEL_PASSWORD: 'secure-password',
    PROXY_PORT: '1080',
    LOG_LEVEL: 'warn',
  };
  
  const payloads: PayloadAttachment[] = [
    createEnvPayload(envVars, 'Tunnel environment variables'),
    PayloadTemplates.documentation(),
    PayloadTemplates.monitoring(),
  ];
  
  const result = await sendHiddenHysteriaTunnelScript({
    to: 'user@example.com',
    subject: 'Tunnel with Environment Configuration',
    tunnelType: 'hysteria2-obfs',
    platform: 'linux',
    stealthLevel: 'high',
    expiresInHours: 72,
    payloads,
  });
  
  console.log('Email sent:', result);
}

// Example 6: Complete package with all payload types
async function example6_CompletePackage() {
  console.log('Example 6: Complete package with all payload types');
  
  const payloads: PayloadAttachment[] = [
    // Documentation
    PayloadTemplates.documentation(),
    
    // Persistence and monitoring
    PayloadTemplates.persistence('linux'),
    PayloadTemplates.monitoring(),
    PayloadTemplates.cleanup('linux'),
    
    // Custom configuration
    createConfigPayload('tunnel-settings.json', {
      retryAttempts: 3,
      retryDelay: 5000,
      keepAlive: true,
      bandwidth: {
        up: '100 mbps',
        down: '500 mbps',
      },
    }, 'Additional tunnel settings'),
    
    // Environment variables
    createEnvPayload({
      TUNNEL_TIMEOUT: '300',
      MAX_RETRIES: '5',
      DEBUG_MODE: 'false',
    }, 'Operational parameters'),
    
    // Custom setup script
    createSetupScriptPayload([
      '# Custom initialization',
      'mkdir -p ~/.hysteria',
      'echo "Tunnel initialized at $(date)" >> ~/.hysteria/setup.log',
      'echo "Ready to establish connection"',
    ], 'linux', 'Custom initialization script'),
  ];
  
  const result = await sendHiddenHysteriaTunnelScript({
    to: 'user@example.com',
    subject: 'Complete Tunnel Package',
    tunnelType: 'hysteria2-obfs',
    platform: 'all',
    stealthLevel: 'maximum',
    expiresInHours: 168,
    payloads,
  });
  
  console.log('Complete package sent with', result.attachmentsCount, 'attachments');
}

// Example 7: Binary payload (e.g., for custom tools)
async function example7_BinaryPayload() {
  console.log('Example 7: Tunnel with binary payload');
  
  // Simulated binary data (in reality, this would be actual binary content)
  const fakeBinaryData = Buffer.from('simulated binary content').toString('base64');
  
  const payloads: PayloadAttachment[] = [
    PayloadTemplates.documentation(),
    createBinaryPayload('custom-tool.bin', fakeBinaryData, 'Custom tunnel management tool'),
    createSetupScriptPayload([
      '# Install custom tool',
      'chmod +x custom-tool.bin',
      './custom-tool.bin --install',
    ], 'linux', 'Tool installation script'),
  ];
  
  const result = await sendHiddenHysteriaTunnelScript({
    to: 'user@example.com',
    subject: 'Tunnel with Custom Tools',
    tunnelType: 'hysteria2-obfs',
    platform: 'linux',
    stealthLevel: 'high',
    expiresInHours: 72,
    payloads,
  });
  
  console.log('Email sent with binary payload:', result);
}

// Main execution
async function main() {
  console.log('🚀 Payload Attachment Examples\n');
  console.log('=' .repeat(60));
  
  try {
    // Uncomment the examples you want to run:
    
    // await example1_BasicWithDocs();
    // await example2_WithPersistence();
    // await example3_CustomConfig();
    // await example4_WindowsPayloads();
    // await example5_WithEnvVars();
    // await example6_CompletePackage();
    // await example7_BinaryPayload();
    
    console.log('\n✅ Examples completed successfully!');
  } catch (error) {
    console.error('❌ Error running examples:', error);
  }
}

// Export for use in other files
export {
  example1_BasicWithDocs,
  example2_WithPersistence,
  example3_CustomConfig,
  example4_WindowsPayloads,
  example5_WithEnvVars,
  example6_CompletePackage,
  example7_BinaryPayload,
};

if (require.main === module) {
  main();
}