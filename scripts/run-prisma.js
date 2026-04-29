async function run() {
  const nextEnv = await import('@next/env')
  const { spawn } = await import('node:child_process')

  nextEnv.default.loadEnvConfig(process.cwd())

  const args = process.argv.slice(2)
  if (args.length === 0) {
    console.error('Prisma command arguments are required')
    process.exit(1)
  }

  const prismaBin = require.resolve('prisma/build/index.js')
  const child = spawn(process.execPath, [prismaBin, ...args], {
    stdio: 'inherit',
    env: process.env,
  })

  child.on('exit', (code, signal) => {
    if (signal) {
      process.kill(process.pid, signal)
      return
    }

    process.exit(code ?? 1)
  })
}

run().catch((error) => {
  console.error(error)
  process.exit(1)
})