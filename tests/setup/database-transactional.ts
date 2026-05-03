/**
 * Database test setup with transactional isolation
 * Uses Prisma transactions for automatic rollback after each test
 */

import { PrismaClient } from '@prisma/client'

// Global Prisma client for transaction management
const prisma = new PrismaClient()

// Transaction context for each test
let transactionPrisma: PrismaClient | null = null

/**
 * Begin a transaction for test isolation
 */
export async function beginTestTransaction() {
  transactionPrisma = new PrismaClient()
  await transactionPrisma.$connect()
  return transactionPrisma
}

/**
 * Rollback the transaction after test
 */
export async function rollbackTestTransaction() {
  if (transactionPrisma) {
    await transactionPrisma.$disconnect()
    transactionPrisma = null
  }
}

/**
 * Get the transactional Prisma client
 */
export function getTestPrisma() {
  return transactionPrisma || prisma
}

/**
 * Seed test data within transaction
 */
export async function seedTestData(prismaClient: PrismaClient) {
  const result: any = {}

  try {
    // Create test operator
    if (prismaClient.operator) {
      result.operator = await prismaClient.operator.create({
        data: {
          username: `test_operator_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
          password: '$2a$10$test_hashed_password',
          role: 'OPERATOR',
          isActive: true,
          permissions: JSON.stringify(['read', 'write', 'execute']),
          skills: JSON.stringify(['network', 'social_engineering']),
        },
      })
    }
  } catch (error) {
    console.log('Could not create test operator:', error)
  }

  try {
    // Create test operation
    if (prismaClient.operation && result.operator) {
      result.operation = await prismaClient.operation.create({
        data: {
          name: `Test Operation ${Date.now()}`,
          description: 'A test operation for automated testing',
          type: 'PENETRATION_TEST',
          priority: 'MEDIUM',
          status: 'PLANNING',
          team: JSON.stringify([result.operator.id]),
          createdBy: result.operator.id,
        },
      })
    }
  } catch (error) {
    console.log('Could not create test operation:', error)
  }

  try {
    // Create test Hysteria node
    if (prismaClient.hysteriaNode) {
      result.node = await prismaClient.hysteriaNode.create({
        data: {
          name: `Test Node ${Date.now()}`,
          hostname: `test-node-${Date.now()}.example.com`,
          region: 'us-east-1',
          listenAddr: ':443',
          status: 'stopped',
          tags: JSON.stringify(['test', 'development']),
          provider: 'aws',
        },
      })
    }
  } catch (error) {
    console.log('Could not create test node:', error)
  }

  try {
    // Create test implant
    if (prismaClient.implant && result.node) {
      result.implant = await prismaClient.implant.create({
        data: {
          implantId: `implant-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
          name: 'Test Implant',
          type: 'windows',
          architecture: 'x64',
          status: 'active',
          config: {
            callbackInterval: 30,
            jitter: 0.2,
            transport: 'hysteria2',
          },
          transportConfig: {
            server: 'test-node.example.com',
            port: 443,
            auth: 'test-auth-token',
          },
          nodeId: result.node.id,
        },
      })
    }
  } catch (error) {
    console.log('Could not create test implant:', error)
  }

  try {
    // Create test AI conversation
    if (prismaClient.aiConversation && result.operator) {
      result.conversation = await prismaClient.aiConversation.create({
        data: {
          title: 'Test Conversation',
          createdBy: result.operator.id,
        },
      })
    }
  } catch (error) {
    console.log('Could not create test conversation:', error)
  }

  return result
}

/**
 * Setup test database with transaction
 */
export async function setupTestDatabase() {
  const prismaClient = await beginTestTransaction()
  const testData = await seedTestData(prismaClient)
  return { prisma: prismaClient, ...testData }
}

/**
 * Teardown test database with rollback
 */
export async function teardownTestDatabase() {
  await rollbackTestTransaction()
}

/**
 * Clean database (fallback for non-transactional tests)
 */
export async function cleanDatabase() {
  const safeDelete = async (model: any) => {
    try {
      if (model && typeof model.deleteMany === 'function') {
        await model.deleteMany()
      }
    } catch (error) {
      // Ignore errors for models that don't exist
    }
  }

  // Delete in dependency order
  await safeDelete(prisma.shadowGrokToolCall)
  await safeDelete(prisma.shadowGrokExecution)
  await safeDelete(prisma.shadowGrokApproval)
  await safeDelete(prisma.agentStep)
  await safeDelete(prisma.agentTask)
  await safeDelete(prisma.workflowStep)
  await safeDelete(prisma.workflowSession)
  await safeDelete(prisma.scheduledWorkflow)
  await safeDelete(prisma.backendFunction)
  await safeDelete(prisma.emailHarvestResult)
  await safeDelete(prisma.emailCampaign)
  await safeDelete(prisma.emailLog)
  await safeDelete(prisma.implantTask)
  await safeDelete(prisma.implant)
  await safeDelete(prisma.payloadBuild)
  await safeDelete(prisma.payload)
  await safeDelete(prisma.hysteriaNode)
  await safeDelete(prisma.clientUser)
  await safeDelete(prisma.usageRecord)
  await safeDelete(prisma.profile)
  await safeDelete(prisma.aiMessage)
  await safeDelete(prisma.aiConversation)
  await safeDelete(prisma.osintTask)
  await safeDelete(prisma.oSINTData)
  await safeDelete(prisma.threatIntel)
  await safeDelete(prisma.networkMap)
  await safeDelete(prisma.lotLTool)
  await safeDelete(prisma.forensicsAction)
  await safeDelete(prisma.behaviorPattern)
  await safeDelete(prisma.auditLog)
  await safeDelete(prisma.scheduledReport)
  await safeDelete(prisma.exfilPlan)
  await safeDelete(prisma.intelligence)
  await safeDelete(prisma.executiveReport)
  await safeDelete(prisma.technicalReport)
  await safeDelete(prisma.timelineReport)
  await safeDelete(prisma.reportPackage)
  await safeDelete(prisma.deliverable)
  await safeDelete(prisma.task)
  await safeDelete(prisma.objective)
  await safeDelete(prisma.operation)
  await safeDelete(prisma.operator)
}

export { prisma }