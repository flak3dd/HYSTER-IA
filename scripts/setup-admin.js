async function setupAdmin() {
  let prisma

  try {
    const [nextEnv, { PrismaClient }, bcryptModule] = await Promise.all([
      import('@next/env'),
      import('@prisma/client'),
      import('bcryptjs'),
    ])

    nextEnv.default.loadEnvConfig(process.cwd())

    prisma = new PrismaClient()
    const bcrypt = bcryptModule.default

    if (!process.env.DATABASE_URL) {
      throw new Error('DATABASE_URL must be set before running setup:admin')
    }

    // --- Seed admin operator ---
    const adminUsername = process.env.ADMIN_USERNAME || 'admin'
    const adminPassword = process.env.ADMIN_PASSWORD || 'admin123'
    const hashedPassword = await bcrypt.hash(adminPassword, 12)
    
    const admin = await prisma.operator.upsert({
      where: { username: adminUsername },
      update: {
        password: hashedPassword,
        role: 'ADMIN',
        isActive: true,
        permissions: JSON.stringify(['ALL']),
        skills: JSON.stringify(['Red Team Operations', 'Penetration Testing', 'Security Assessment']),
      },
      create: {
        username: adminUsername,
        password: hashedPassword,
        role: 'ADMIN',
        isActive: true,
        permissions: JSON.stringify(['ALL']),
        skills: JSON.stringify(['Red Team Operations', 'Penetration Testing', 'Security Assessment']),
      },
    })

    console.log('Admin operator ensured:', admin.username)

    // --- Seed demo nodes ---
    const demoNodes = [
      { id: 'node-001', name: 'US-East-Primary', hostname: 'us-east.example.com', region: 'us-east', tags: '["primary","production"]', provider: 'aws', status: 'running' },
      { id: 'node-002', name: 'EU-West-Backup', hostname: 'eu-west.example.com', region: 'eu-west', tags: '["backup","eu"]', provider: 'gcp', status: 'stopped' },
      { id: 'node-003', name: 'Asia-Pacific-Edge', hostname: 'ap-south.example.com', region: 'ap-south', tags: '["edge","asia"]', provider: 'azure', status: 'running' },
    ]

    for (const node of demoNodes) {
      await prisma.hysteriaNode.upsert({
        where: { id: node.id },
        update: { name: node.name, hostname: node.hostname, region: node.region, tags: node.tags, provider: node.provider, status: node.status },
        create: node,
      })
    }
    console.log('Demo nodes seeded:', demoNodes.length)

    // --- Seed demo client users ---
    const demoUsers = [
      { id: 'user-001', displayName: 'Demo User 1', authToken: 'token-abc123', status: 'active', quotaBytes: BigInt(1073741824), notes: 'Primary demo account' },
      { id: 'user-002', displayName: 'Demo User 2', authToken: 'token-def456', status: 'active', quotaBytes: BigInt(536870912), notes: 'Secondary demo account' },
      { id: 'user-003', displayName: 'Inactive User', authToken: 'token-ghi789', status: 'disabled', quotaBytes: BigInt(214748364), notes: 'Disabled account' },
    ]

    for (const user of demoUsers) {
      await prisma.clientUser.upsert({
        where: { id: user.id },
        update: { displayName: user.displayName, status: user.status },
        create: user,
      })
    }
    console.log('Demo client users seeded:', demoUsers.length)

    console.log('')
    console.log('Setup complete!')
    console.log(`  Admin login: ${admin.username} / ${adminPassword}`)
    console.log('  URL: http://localhost:3000')

  } catch (error) {
    console.error('Error during setup:', error)
  } finally {
    await prisma?.$disconnect()
  }
}

setupAdmin()
