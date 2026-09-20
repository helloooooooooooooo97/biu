import { randomBytes, createHash, timingSafeEqual } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { dataHome, dataPath } from '@biu/host-plugin-loader/data-dir'

export type McpHostConfig = {
  token: string
}

export function mcpHostConfigPath(cwd = dataHome()) {
  return process.env.BIU_MCP_HOST || dataPath(cwd, 'mcp-host.json')
}

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  return value as Record<string, unknown>
}

export function generateMcpToken() {
  return `biu_mcp_${randomBytes(24).toString('base64url')}`
}

export function readMcpHostConfig(path = mcpHostConfigPath()): McpHostConfig | null {
  if (!existsSync(path)) return null
  try {
    const raw = asRecord(JSON.parse(readFileSync(path, 'utf8')))
    const token = String(raw.token ?? '').trim()
    if (!token) return null
    return { token }
  } catch {
    return null
  }
}

export function writeMcpHostConfig(config: McpHostConfig, path = mcpHostConfigPath()) {
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, `${JSON.stringify({ token: config.token }, null, 2)}\n`)
}

/** 环境变量优先；没有就读盘，再没有就生成一把写进 .biu/mcp-host.json。 */
export function loadOrCreateMcpToken(path = mcpHostConfigPath()) {
  const fromEnv = String(process.env.BIU_MCP_TOKEN ?? '').trim()
  if (fromEnv) return fromEnv
  const existing = readMcpHostConfig(path)
  if (existing?.token) return existing.token
  const token = generateMcpToken()
  writeMcpHostConfig({ token }, path)
  return token
}

export function rotateMcpToken(path = mcpHostConfigPath()) {
  const token = generateMcpToken()
  writeMcpHostConfig({ token }, path)
  if (process.env.BIU_MCP_TOKEN) process.env.BIU_MCP_TOKEN = token
  return token
}

export function bearerToken(header: string | string[] | undefined) {
  const raw = Array.isArray(header) ? header[0] : header
  const value = String(raw ?? '').trim()
  const match = /^Bearer\s+(\S+)/i.exec(value)
  return match?.[1] ?? ''
}

export function tokensMatch(got: string, expected: string) {
  if (!got || !expected) return false
  const a = createHash('sha256').update(got).digest()
  const b = createHash('sha256').update(expected).digest()
  return timingSafeEqual(a, b)
}

export function mcpClientSnippets(url: string, token: string) {
  const headers = { Authorization: `Bearer ${token}` }
  return {
    cursor: { mcpServers: { biu: { url, headers } } },
    claude: { mcpServers: { biu: { url, headers } } },
    chatgpt: { url, headers },
  }
}
