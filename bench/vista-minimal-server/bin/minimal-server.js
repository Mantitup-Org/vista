#!/usr/bin/env node
process.env.NODE_ENV = 'production'

const { spawn } = require('node:child_process')
const path = require('node:path')
const fs = require('node:fs')

const appDir = process.cwd()
const standaloneServer = path.join(appDir, '.vista', 'standalone', 'server.js')
const vistaBin = path.resolve(__dirname, '..', '..', '..', 'packages', 'vista', 'bin', 'vista.js')
const port = process.env.PORT || '3000'

console.time('vista-cold-start')

const childArgs = fs.existsSync(standaloneServer)
  ? [standaloneServer]
  : [vistaBin, 'start']

const child = spawn(process.execPath, childArgs, {
  cwd: appDir,
  env: {
    ...process.env,
    NODE_ENV: 'production',
    PORT: port,
  },
  stdio: ['ignore', 'pipe', 'pipe'],
  windowsHide: true,
})

let ready = false

function handleOutput(chunk) {
  const message = chunk.toString()
  process.stdout.write(message)
  if (!ready && /Ready in/i.test(message)) {
    ready = true
    console.timeEnd('vista-cold-start')
  }
}

child.stdout.on('data', handleOutput)
child.stderr.on('data', handleOutput)

child.on('exit', (code) => {
  if (!ready) {
    console.error(`Vista minimal server exited before ready (code=${code ?? 'unknown'})`)
  }
  process.exit(code ?? 0)
})

child.on('error', (error) => {
  console.error('Failed to start Vista minimal server:', error)
  process.exit(1)
})
