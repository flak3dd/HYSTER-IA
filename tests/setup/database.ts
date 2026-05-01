/**
 * Database test setup utilities
 * Handles test database initialization, cleanup, and seeding
 */

import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

/**
 * Clean all database tables before tests
 */
export async function cleanDatabase() {
  // Helper function to safely delete if model exists
  const safeDelete = async (model: any) => {
    try {
      if (model && typeof model.deleteMany === 'function') {
        await model.deleteMany()
      }
    } catch (error) {
      // Ignore errors for models that don't exist
    }
  }

  // Delete in dependency order (child tables first)
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
  await safeDelete(prisma.osintData)
  await safeDelete(prisma.threatIntel)
  await safeDelete(prisma.networkMap)
  await safeDelete(prisma.lotlTool)
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

/**
 * Seed test data for testing
 */
export async function seedTestData() {
  const result: any = {}

  try {
    // Create test operator
    if (prisma.operator) {
      result.operator = await prisma.operator.create({
        data: {
          username: `test_operator_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
          password: '$2a$10$test_hashed_password', // bcrypt hash
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
    if (prisma.operation && result.operator) {
      result.operation = await prisma.operation.create({
        data: {
          name: 'Test Operation',
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
    if (prisma.hysteriaNode) {
      result.node = await prisma.hysteriaNode.create({
        data: {
          name: 'Test Node',
          hostname: 'test-node.example.com',
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
    if (prisma.implant && result.node) {
      result.implant = await prisma.implant.create({
        data: {
          implantId: `test-implant-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
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
    if (prisma.aiConversation && result.operator) {
      result.conversation = await prisma.aiConversation.create({
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
 * Setup test database before running tests
 */
export async function setupTestDatabase() {
  try {
    await cleanDatabase()
    const testData = await seedTestData()
    return testData
  } catch (error) {
    console.error('Failed to setup test database:', error)
    throw error
  }
}

/**
 * Cleanup test database after running tests
 */
export async function teardownTestDatabase() {
  try {
    await cleanDatabase()
    await prisma.$disconnect()
  } catch (error) {
    console.error('Failed to teardown test database:', error)
    await prisma.$disconnect()
    throw error
  }
}

export { prisma }