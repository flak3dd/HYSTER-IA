const { PrismaClient } = require('@prisma/client')
const bcrypt = require('bcryptjs')

const prisma = new PrismaClient()

async function setupAdmin() {
  try {
    // Create admin user
    const hashedPassword = await bcrypt.hash('admin123', 12)
    
    const admin = await prisma.operator.upsert({
      where: { username: 'admin' },
      update: {},
      create: {
        username: 'admin',
        password: hashedPassword,
        role: 'ADMIN',
        isActive: true,
        permissions: ['ALL'],
        skills: ['Red Team Operations', 'Penetration Testing', 'Security Assessment'],
      },
    })

    console.log('✅ Admin user created successfully!')
    console.log('📝 Login Credentials:')
    console.log('   Username: admin')
    console.log('   Password: admin123')
    console.log('')
    console.log('🌐 Access the platform at: http://localhost:3000')
    console.log('🔐 Use these credentials to log in to the D-Panel Red Team Operations Platform')

  } catch (error) {
    console.error('❌ Error creating admin user:', error)
  } finally {
    await prisma.$disconnect()
  }
}

setupAdmin()