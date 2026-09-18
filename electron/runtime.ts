import { cpSync, existsSync, mkdirSync, readdirSync } from 'node:fs'
import net from 'node:net'
import { basename, join } from 'node:path'

/** 优先使用约定端口；被占用时让系统分配空闲端口。 */
export function availablePort(preferred: number, host = '127.0.0.1') {
  const listen = (port: number) =>
    new Promise<number>((resolve, reject) => {
      const server = net.createServer()
      server.once('error', reject)
      server.listen(port, host, () => {
        const address = server.address()
        if (!address || typeof address === 'string') {
          server.close()
          reject(new Error('failed to allocate desktop host port'))
          return
        }
        server.close((error) => (error ? reject(error) : resolve(address.port)))
      })
    })
  return listen(preferred).catch((error: NodeJS.ErrnoException) => {
    if (preferred > 0 && error.code === 'EADDRINUSE') return listen(0)
    throw error
  })
}

/** 首次启动复制内置插件源码；已有沙箱属于用户，不覆盖。 */
export function seedPluginSandboxes(sourceDir: string, targetDir: string) {
  if (!existsSync(sourceDir)) return []
  mkdirSync(targetDir, { recursive: true })
  const copied: string[] = []
  for (const id of readdirSync(sourceDir).sort()) {
    const source = join(sourceDir, id)
    if (!existsSync(join(source, 'manifest.json'))) continue
    const target = join(targetDir, id)
    if (existsSync(target)) continue
    cpSync(source, target, {
      recursive: true,
      filter: (path) => basename(path) !== 'node_modules',
    })
    copied.push(id)
  }
  return copied
}
