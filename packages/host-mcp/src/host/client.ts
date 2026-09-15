import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js'
import { StdioClientTransport, getDefaultEnvironment } from '@modelcontextprotocol/sdk/client/stdio.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import type { Transport } from '@modelcontextprotocol/sdk/shared/transport.js'
import type { McpServerConfig } from './config.ts'

export type McpToolInfo = {
  name: string
  description: string
  inputSchema?: unknown
}

export const CLIENT_INFO = { name: 'biu', version: '0.1.0' } as const

const DEFAULT_TIMEOUT_MS = Number(process.env.BIU_MCP_TIMEOUT ?? 30000)

function buildTransport(config: McpServerConfig): Transport {
  if (config.transport === 'stdio') {
    return new StdioClientTransport({
      command: config.command,
      args: config.args,
      // 子进程默认只继承白名单环境变量；配置里的 env 叠在上面。
      env: { ...getDefaultEnvironment(), ...config.env },
      ...(config.cwd ? { cwd: config.cwd } : {}),
      stderr: 'pipe',
    })
  }
  const url = new URL(config.url)
  const headers = config.headers
  if (config.transport === 'sse') {
    return new SSEClientTransport(url, {
      requestInit: { headers },
      eventSourceInit: { fetch: (input, init) => fetch(input, { ...init, headers: { ...init?.headers, ...headers } }) },
    })
  }
  return new StreamableHTTPClientTransport(url, { requestInit: { headers } })
}

/**
 * 一条已完成 initialize 握手的 MCP 连接。
 * SDK 负责协议细节（握手、帧、error、超时）；这里只保留 Biu 需要的四个动作。
 */
export class McpConnection {
  readonly id: string
  private client: Client
  private transport: Transport
  private stderr = ''

  private constructor(id: string, client: Client, transport: Transport) {
    this.id = id
    this.client = client
    this.transport = transport
  }

  static async open(config: McpServerConfig) {
    const client = new Client(CLIENT_INFO, { capabilities: {} })
    const transport = buildTransport(config)
    const connection = new McpConnection(config.id, client, transport)
    if (transport instanceof StdioClientTransport) {
      transport.stderr?.on('data', (chunk: Buffer) => {
        // 只留尾部，够定位启动失败原因，不至于把日志灌爆。
        connection.stderr = `${connection.stderr}${chunk.toString('utf8')}`.slice(-4000)
      })
    }
    await client.connect(transport, { timeout: DEFAULT_TIMEOUT_MS })
    return connection
  }

  /**
   * 订阅「连上之后又掉线」。只在握手成功后注册，握手期间的退出由 connect 自己 reject。
   * SDK 在 onclose 里先叫我们、再 reject 在途请求，所以这里绝不能抛。
   */
  onClosed(listener: (reason?: string) => void) {
    this.client.onclose = () => {
      try {
        listener(this.lastStderr() || undefined)
      } catch {
        // 吞掉：抛出去会掐断 SDK 后续的连接清理。
      }
    }
  }

  serverInfo() {
    const info = this.client.getServerVersion()
    return { name: info?.name ?? this.id, version: info?.version ?? '' }
  }

  lastStderr() {
    return this.stderr.trim()
  }

  async listTools(): Promise<McpToolInfo[]> {
    const listed = await this.client.listTools(undefined, { timeout: DEFAULT_TIMEOUT_MS })
    return (listed.tools ?? []).map((tool) => ({
      name: tool.name,
      description: String(tool.description ?? ''),
      inputSchema: tool.inputSchema,
    }))
  }

  async callTool(name: string, args: Record<string, unknown>) {
    return this.client.callTool({ name, arguments: args }, undefined, { timeout: DEFAULT_TIMEOUT_MS })
  }

  async close() {
    this.client.onclose = undefined
    try {
      await this.client.close()
    } catch {
      // 进程可能已经没了，卸载路径不该因此失败。
    }
  }
}
