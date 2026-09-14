#!/usr/bin/env node
/** npm 解包后 spawn-helper 可能丢可执行位，node-pty 会 posix_spawnp failed。 */
import { chmodSync, existsSync, readdirSync, statSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const bases = [
  join(root, 'node_modules/node-pty/prebuilds'),
  join(root, 'node_modules/node-pty/build/Release'),
  join(root, 'node_modules/node-pty/build/Debug'),
]

function mark(file) {
  if (!existsSync(file)) return false
  chmodSync(file, 0o755)
  return (statSync(file).mode & 0o111) !== 0
}

let n = 0
for (const base of bases) {
  if (!existsSync(base)) continue
  const st = statSync(base)
  if (st.isFile()) continue
  if (base.endsWith('prebuilds')) {
    for (const plat of readdirSync(base)) {
      if (mark(join(base, plat, 'spawn-helper'))) n++
    }
  } else if (mark(join(base, 'spawn-helper'))) {
    n++
  }
}
if (n) console.log(`[chmod-node-pty-helper] executable: ${n} spawn-helper`)
