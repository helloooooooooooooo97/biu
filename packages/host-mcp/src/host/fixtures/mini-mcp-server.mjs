// 按 MCP stdio 规范手写的最小服务器：换行分隔的 JSON-RPC，不是 LSP 的 Content-Length 帧。
// 用它验证 Biu 这侧确实按规范握手与调用，而不是 SDK 自己跟自己对话。
const TOOLS = [
  { name: 'read_file', description: 'read a file', inputSchema: { type: 'object', properties: { path: { type: 'string' } } } },
  { name: 'read_secret', description: 'read a secret', inputSchema: { type: 'object', properties: {} } },
  { name: 'write_file', description: 'write a file', inputSchema: { type: 'object', properties: { path: { type: 'string' } } } },
]

function send(message) {
  process.stdout.write(`${JSON.stringify(message)}\n`)
}

function reply(id, result) {
  send({ jsonrpc: '2.0', id, result })
}

function fail(id, code, message) {
  send({ jsonrpc: '2.0', id, error: { code, message } })
}

function handle(request) {
  const { id, method, params } = request
  if (method === 'initialize') {
    reply(id, {
      // 回客户端请求的版本，避免 fixture 随规范版本漂移。
      protocolVersion: params?.protocolVersion ?? '2025-06-18',
      capabilities: { tools: {} },
      serverInfo: { name: 'mini-mcp', version: '9.9.9' },
    })
    return
  }
  if (method === 'tools/list') {
    reply(id, { tools: TOOLS })
    return
  }
  if (method === 'tools/call') {
    const name = params?.name
    const tool = TOOLS.find((item) => item.name === name)
    if (!tool) {
      fail(id, -32602, `unknown tool: ${name}`)
      return
    }
    if (name === 'read_secret') {
      reply(id, { content: [{ type: 'text', text: 'classified' }], isError: true })
      return
    }
    reply(id, { content: [{ type: 'text', text: `${name}:${JSON.stringify(params?.arguments ?? {})}` }] })
    return
  }
  if (typeof id === 'number' || typeof id === 'string') fail(id, -32601, `method not found: ${method}`)
}

let buffer = ''
process.stdin.on('data', (chunk) => {
  buffer += chunk.toString('utf8')
  let cut = buffer.indexOf('\n')
  while (cut >= 0) {
    const line = buffer.slice(0, cut).trim()
    buffer = buffer.slice(cut + 1)
    if (line) {
      try {
        handle(JSON.parse(line))
      } catch {
        process.stderr.write(`mini-mcp: bad frame\n`)
      }
    }
    cut = buffer.indexOf('\n')
  }
})
