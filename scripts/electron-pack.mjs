import { spawn } from 'node:child_process'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { compileMain } from './electron-launch.mjs'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')

function run(command, args) {
  return new Promise((resolveDone, reject) => {
    const child = spawn(command, args, {
      cwd: root,
      stdio: 'inherit',
      env: {
        ...process.env,
        CSC_IDENTITY_AUTO_DISCOVERY: process.env.CSC_IDENTITY_AUTO_DISCOVERY || 'false',
      },
      shell: process.platform === 'win32',
    })
    child.on('exit', (code) => {
      if (code === 0) resolveDone(undefined)
      else reject(new Error(`${command} ${args.join(' ')} exited ${code}`))
    })
  })
}

export async function packDesktop(builderArgs = process.argv.slice(2)) {
  await compileMain()
  const bin = join(root, 'node_modules', '.bin', process.platform === 'win32' ? 'electron-builder.cmd' : 'electron-builder')
  await run(bin, builderArgs.length ? builderArgs : ['--publish', 'never'])
}

const entry = process.argv[1]
if (entry && import.meta.url === pathToFileURL(resolve(entry)).href) {
  await packDesktop()
}
