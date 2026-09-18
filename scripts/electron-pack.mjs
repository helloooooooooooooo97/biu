import { spawn } from 'node:child_process'
import { execFileSync } from 'node:child_process'
import { cpSync, existsSync, mkdirSync, readdirSync, rmSync, writeFileSync, readFileSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { compileMain } from './electron-launch.mjs'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const appDir = join(root, 'pack-app')
const hostDir = join(root, 'pack-host')
const hostRuntimeManifest = join(root, 'electron', 'host-runtime', 'package.json')

const HOST_RUNTIME_PACKAGES = Object.keys(
  JSON.parse(readFileSync(hostRuntimeManifest, 'utf8')).dependencies ?? {},
)

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

function packageName(specifier) {
  const parts = specifier.split('/')
  return specifier.startsWith('@') ? `${parts[0]}/${parts[1]}` : parts[0]
}

function packageSubpath(specifier) {
  const name = packageName(specifier)
  return specifier === name ? '.' : `.${specifier.slice(name.length)}`
}

function exportTarget(value, fallback) {
  if (typeof value === 'string') return value
  if (value && typeof value === 'object') return value.import || value.default || fallback
  return fallback
}

function configuredHostEntries() {
  const config = JSON.parse(readFileSync(join(root, 'cordis.plugins.json'), 'utf8'))
  const refs = [...(config.host ?? []), ...(config.plugins ?? [])]
    .map((item) => item.package)
    .filter(Boolean)
  const packageDirs = new Map()
  for (const dir of readdirSync(join(root, 'packages'))) {
    const manifest = join(root, 'packages', dir, 'package.json')
    if (!existsSync(manifest)) continue
    const pkg = JSON.parse(readFileSync(manifest, 'utf8'))
    if (pkg.name) packageDirs.set(pkg.name, { dir: join(root, 'packages', dir), pkg })
  }
  return [...new Set(refs)].map((specifier) => {
    const found = packageDirs.get(packageName(specifier))
    if (!found) throw new Error(`configured host package not found: ${specifier}`)
    const subpath = packageSubpath(specifier)
    const fallback = found.pkg.main || 'src/index.ts'
    const target = exportTarget(found.pkg.exports?.[subpath], fallback)
    return { specifier, entry: join(found.dir, target) }
  })
}

async function compilePackagedHost() {
  const { build } = await import('esbuild')
  const entries = configuredHostEntries()
  const modules = entries.map(
    ({ specifier, entry }) =>
      `${JSON.stringify(specifier)}: () => import(${JSON.stringify(`./${relative(root, entry).replace(/\\/g, '/')}`)})`,
  )
  const source = [
    `globalThis[Symbol.for('biu.packagedHostModules')] = { ${modules.join(', ')} }`,
    `await import('./host/index.ts')`,
  ].join('\n')
  mkdirSync(join(hostDir, 'host'), { recursive: true })
  await build({
    stdin: {
      contents: source,
      resolveDir: root,
      sourcefile: 'desktop-host-entry.ts',
      loader: 'ts',
    },
    outfile: join(hostDir, 'host', 'index.mjs'),
    bundle: true,
    platform: 'node',
    format: 'esm',
    target: 'node24',
    sourcemap: false,
    legalComments: 'none',
    external: HOST_RUNTIME_PACKAGES.flatMap((name) => [name, `${name}/*`]),
    logLevel: 'info',
  })
}

export function npmQueryInvocation(
  selector,
  platform = process.platform,
  env = process.env,
  node = process.execPath,
) {
  const args = ['query', selector, '--json']
  if (env.npm_execpath) {
    return { command: node, args: [env.npm_execpath, ...args], shell: false }
  }
  // Windows 不能由 execFileSync 直接执行 npm.cmd（EINVAL）；fallback 必须走 shell。
  return { command: 'npm', args, shell: platform === 'win32' }
}

function stageHostNodeModules() {
  const ids = HOST_RUNTIME_PACKAGES.map((name) => `#${name}`).join(',')
  const selector = `:is(${ids}), :is(${ids}) *`
  const invocation = npmQueryInvocation(selector)
  const nodes = JSON.parse(
    execFileSync(invocation.command, invocation.args, {
      cwd: root,
      encoding: 'utf8',
      maxBuffer: 32 * 1024 * 1024,
      shell: invocation.shell,
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
  // esbuild 的安装脚本会留下两份 fallback 二进制；运行时从 @esbuild/<platform>
  // optional package 解析，只保留那一份即可。
  const esbuildDir = join(hostDir, 'node_modules', 'esbuild')
  rmSync(join(esbuildDir, 'bin'), { recursive: true, force: true })
  const libDir = join(esbuildDir, 'lib')
  if (existsSync(libDir)) {
    for (const name of readdirSync(libDir)) {
      if (name.startsWith('downloaded-')) rmSync(join(libDir, name), { force: true })
    }
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

export async function stagePackHost() {
  rmSync(hostDir, { recursive: true, force: true })
  mkdirSync(hostDir, { recursive: true })
  cpSync(hostRuntimeManifest, join(hostDir, 'package.json'))
  cpSync(join(root, 'cordis.plugins.json'), join(hostDir, 'cordis.plugins.json'))
  await compilePackagedHost()
  stageHostNodeModules()
}

export async function packDesktop(builderArgs = process.argv.slice(2)) {
  await compileMain()
  stagePackApp()
  await stagePackHost()
  const bin = join(root, 'node_modules', '.bin', process.platform === 'win32' ? 'electron-builder.cmd' : 'electron-builder')
  await run(bin, builderArgs.length ? builderArgs : ['--publish', 'never'])
}

const entry = process.argv[1]
if (entry && import.meta.url === pathToFileURL(resolve(entry)).href) {
  await packDesktop()
}
