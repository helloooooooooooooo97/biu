#!/usr/bin/env node
/**
 * 按 cordis.plugins.json 把 packages/* 链到 node_modules。
 * 根 package.json 不写死任何插件包名。
 */
import { existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, rmSync, symlinkSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')

function splitPackageRef(specifier) {
  if (specifier.startsWith('@')) {
    const parts = specifier.split('/')
    if (parts.length <= 2) return { name: specifier }
    return { name: `${parts[0]}/${parts[1]}` }
  }
  const slash = specifier.indexOf('/')
  if (slash === -1) return { name: specifier }
  return { name: specifier.slice(0, slash) }
}

function allConfiguredNames() {
  const path = join(root, 'cordis.plugins.json')
  if (!existsSync(path)) return []
  const body = JSON.parse(readFileSync(path, 'utf8'))
  const names = new Set()
  for (const list of [body.host, body.web, body.plugins]) {
    if (!Array.isArray(list)) continue
    for (const item of list) {
      if (item.package) names.add(splitPackageRef(item.package).name)
      if (item.web) names.add(splitPackageRef(item.web).name)
    }
  }
  return names
}

function findPkg(name) {
  const base = join(root, 'packages')
  if (!existsSync(base)) return null
  for (const dir of readdirSync(base)) {
    const pkgFile = join(base, dir, 'package.json')
    if (!existsSync(pkgFile)) continue
    try {
      const pkg = JSON.parse(readFileSync(pkgFile, 'utf8'))
      if (pkg.name === name) return join(base, dir)
    } catch {
      /* skip */
    }
  }
  return null
}

for (const name of allConfiguredNames()) {
  const dir = findPkg(name)
  if (!dir) {
    console.warn(`[link-cordis-plugins] missing packages/* for ${name}`)
    continue
  }
  const linkPath = join(root, 'node_modules', ...String(name).split('/'))
  mkdirSync(dirname(linkPath), { recursive: true })
  try {
    const stat = lstatSync(linkPath)
    if (stat.isSymbolicLink() || stat.isDirectory()) {
      rmSync(linkPath, { recursive: true, force: true })
    }
  } catch {
    // 路径不存在时忽略
  }
  try {
    symlinkSync(dir, linkPath, 'dir')
  } catch (e) {
    if (e?.code !== 'EEXIST') throw e
  }
  console.log(`[link-cordis-plugins] ${name} -> ${dir}`)
}
