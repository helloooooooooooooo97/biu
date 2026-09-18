import { spawn } from 'node:child_process'
import { cpSync, mkdirSync, rmSync, writeFileSync, readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { compileMain } from './electron-launch.mjs'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const appDir = join(root, '.pack-app')

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

/** asar 只装壳：package.json + electron 主进程 + vite dist。host 走 extraResources。 */
export function stagePackApp() {
  rmSync(appDir, { recursive: true, force: true })
  mkdirSync(join(appDir, 'electron', 'out'), { recursive: true })
  const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))
  writeFileSync(
    join(appDir, 'package.json'),
    JSON.stringify(
      {
        name: pkg.name,
        version: pkg.version,
        description: pkg.description,
        main: 'electron/out/main.js',
        author: pkg.author,
        license: pkg.license,
      },
      null,
      2,
    ) + '\n',
  )
  cpSync(join(root, 'electron', 'out'), join(appDir, 'electron', 'out'), { recursive: true })
  cpSync(join(root, 'electron', 'preload.cjs'), join(appDir, 'electron', 'preload.cjs'))
  cpSync(join(root, 'dist'), join(appDir, 'dist'), { recursive: true })
}

export async function packDesktop(builderArgs = process.argv.slice(2)) {
  await compileMain()
  stagePackApp()
  const bin = join(root, 'node_modules', '.bin', process.platform === 'win32' ? 'electron-builder.cmd' : 'electron-builder')
  await run(bin, builderArgs.length ? builderArgs : ['--publish', 'never'])
}

const entry = process.argv[1]
if (entry && import.meta.url === pathToFileURL(resolve(entry)).href) {
  await packDesktop()
}
