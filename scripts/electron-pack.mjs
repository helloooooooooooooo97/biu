import { spawn } from 'node:child_process'
import { execFileSync } from 'node:child_process'
import { cpSync, existsSync, mkdirSync, readdirSync, rmSync, writeFileSync, readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { compileMain } from './electron-launch.mjs'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const appDir = join(root, 'pack-app')
const hostDir = join(root, 'pack-host')

// 前端依赖已经由 Vite 打进 dist。这里只复制 host 源码真正会 import 的
// 直接依赖及其 npm 依赖闭包，避免把 antd、Excalidraw 等整棵前端依赖树塞进安装包。
const HOST_RUNTIME_PACKAGES = [
  '@modelcontextprotocol/sdk',
  'cordis',
  'esbuild',
  'node-pty',
  'tsx',
  'vite',
  'ws',
  'yaml',
]

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

function copyDir(from, to, skip = new Set()) {
  mkdirSync(to, { recursive: true })
  for (const name of readdirSync(from)) {
    if (skip.has(name)) continue
    cpSync(join(from, name), join(to, name), { recursive: true })
  }
}

function stageHostNodeModules() {
  const ids = HOST_RUNTIME_PACKAGES.map((name) => `#${name}`).join(',')
  const selector = `:is(${ids}), :is(${ids}) *`
  const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm'
  const nodes = JSON.parse(
    execFileSync(npm, ['query', selector, '--json'], {
      cwd: root,
      encoding: 'utf8',
      maxBuffer: 32 * 1024 * 1024,
    }),
  )
  const locations = [...new Set(nodes.map((node) => node.location))]
    .filter((location) => location === 'node_modules' || location.startsWith('node_modules/'))
    .sort((a, b) => a.length - b.length)
  const copied = []
  for (const location of locations) {
    if (copied.some((parent) => location.startsWith(`${parent}/`))) continue
    cpSync(join(root, location), join(hostDir, location), { recursive: true })
    copied.push(location)
  }
  // npm workspace 在 CI 中是指向构建目录的绝对链接，不能原样带进安装包。
  // 将内置包复制到 @biu scope，保证安装后仍可按包名互相解析。
  const scopeDir = join(hostDir, 'node_modules', '@biu')
  mkdirSync(scopeDir, { recursive: true })
  for (const name of readdirSync(join(root, 'packages'))) {
    const packageDir = join(root, 'packages', name)
    const manifest = join(packageDir, 'package.json')
    if (!existsSync(manifest)) continue
    const pkg = JSON.parse(readFileSync(manifest, 'utf8'))
    if (typeof pkg.name !== 'string' || !pkg.name.startsWith('@biu/')) continue
    cpSync(packageDir, join(scopeDir, pkg.name.slice('@biu/'.length)), { recursive: true })
  }
}

/** asar/app 只装壳。host 单独放 pack-host，避免 extraResources 的 package.json 把壳里的同名文件排除掉。 */
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
  if (existsSync(join(root, 'dist'))) {
    cpSync(join(root, 'dist'), join(appDir, 'dist'), { recursive: true })
  } else {
    mkdirSync(join(appDir, 'dist'), { recursive: true })
    writeFileSync(join(appDir, 'dist', 'index.html'), '<!doctype html><title>Biu</title>')
  }
}

export function stagePackHost() {
  rmSync(hostDir, { recursive: true, force: true })
  mkdirSync(hostDir, { recursive: true })
  for (const name of ['package.json', 'package-lock.json', 'cordis.plugins.json']) {
    cpSync(join(root, name), join(hostDir, name))
  }
  copyDir(join(root, 'host'), join(hostDir, 'host'))
  copyDir(join(root, 'packages'), join(hostDir, 'packages'))
  mkdirSync(join(hostDir, 'scripts'), { recursive: true })
  for (const name of readdirSync(join(root, 'scripts'))) {
    if (name.endsWith('.mjs')) cpSync(join(root, 'scripts', name), join(hostDir, 'scripts', name))
  }
  stageHostNodeModules()
}

export async function packDesktop(builderArgs = process.argv.slice(2)) {
  await compileMain()
  stagePackApp()
  stagePackHost()
  const bin = join(root, 'node_modules', '.bin', process.platform === 'win32' ? 'electron-builder.cmd' : 'electron-builder')
  await run(bin, builderArgs.length ? builderArgs : ['--publish', 'never'])
}

const entry = process.argv[1]
if (entry && import.meta.url === pathToFileURL(resolve(entry)).href) {
  await packDesktop()
}
