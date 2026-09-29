/**
 * 模型入口目录：官方 API + 常见中转站 / 聚合网关 + 本地运行时。
 * 同一入口（endpoint）共用一把 Key、一个 baseUrl，下面可挂多个模型名（统一入口多模型）。
 */

export type ChatProvider = 'deepseek' | 'openai' | 'anthropic'

/** 请求协议：决定走 OpenAI 兼容 chat.completions 还是 Anthropic messages。 */
export type LlmProtocol = 'openai-compat' | 'anthropic'

export type EndpointGroup = 'official' | 'relay' | 'local' | 'custom'

export interface LlmEndpointDef {
  id: string
  label: string
  group: EndpointGroup
  protocol: LlmProtocol
  /**
   * API 根地址（不含 /chat/completions 或 /messages）。
   * openai-compat 示例：https://api.openai.com/v1
   * anthropic 示例：https://api.anthropic.com/v1
   */
  baseUrl: string
  /**
   * 映射到现有 LLM 客户端分流：
   * - deepseek：OpenAI 兼容 + 视觉模型自动路由
   * - openai：OpenAI 兼容
   * - anthropic：Anthropic Messages
   */
  provider: ChatProvider
  placeholder?: string
  note?: string
  /** 是否内置（不可删除；baseUrl 可被用户覆盖） */
  builtin?: boolean
}

export interface LlmModelDef {
  id: string
  /** 展示名 */
  label: string
  /** 所属入口 id（官方 / 中转站 / 自定义） */
  endpointId: string
  /**
   * 兼容旧语义：与所属入口的 provider 一致（deepseek | openai | anthropic）。
   * 会话 / composer 仍用它做协议分流；真正发请求时用 endpoint.baseUrl。
   */
  provider: ChatProvider
  /** 传给上游 API 的 model id */
  model: string
  category: string
  note?: string
  builtin?: boolean
}

/** 内置入口：默认侧栏只有 DeepSeek / Anthropic / OpenAI；其余进「添加」预设，不自动标已接入。 */
export const LLM_ENDPOINT_PRESETS: LlmEndpointDef[] = [
  // ── 官方 ──
  {
    id: 'deepseek',
    label: 'DeepSeek',
    group: 'official',
    protocol: 'openai-compat',
    baseUrl: 'https://api.deepseek.com',
    provider: 'deepseek',
    placeholder: 'sk-…',
    note: '官方 · OpenAI 兼容',
    builtin: true,
  },
  {
    id: 'openai',
    label: 'OpenAI',
    group: 'official',
    protocol: 'openai-compat',
    baseUrl: 'https://api.openai.com/v1',
    provider: 'openai',
    placeholder: 'sk-…',
    note: '官方 · GPT',
    builtin: true,
  },
  {
    id: 'anthropic',
    label: 'Anthropic',
    group: 'official',
    protocol: 'anthropic',
    baseUrl: 'https://api.anthropic.com/v1',
    provider: 'anthropic',
    placeholder: 'sk-ant-…',
    note: '官方 · Claude Messages',
    builtin: true,
  },
  {
    id: 'moonshot',
    label: 'Moonshot（Kimi）',
    group: 'official',
    protocol: 'openai-compat',
    baseUrl: 'https://api.moonshot.cn/v1',
    provider: 'openai',
    placeholder: 'sk-…',
    note: '月之暗面官方',
    builtin: true,
  },
  {
    id: 'zhipu',
    label: '智谱 GLM',
    group: 'official',
    protocol: 'openai-compat',
    baseUrl: 'https://open.bigmodel.cn/api/paas/v4',
    provider: 'openai',
    placeholder: '…',
    note: '智谱 AI 官方',
    builtin: true,
  },
  {
    id: 'dashscope',
    label: '通义千问（DashScope）',
    group: 'official',
    protocol: 'openai-compat',
    baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    provider: 'openai',
    placeholder: 'sk-…',
    note: '阿里云兼容模式',
    builtin: true,
  },
  {
    id: 'qianfan',
    label: '百度千帆',
    group: 'official',
    protocol: 'openai-compat',
    baseUrl: 'https://qianfan.baidubce.com/v2',
    provider: 'openai',
    placeholder: 'bce-v3/…',
    note: '文心 / 千帆 OpenAI 兼容',
    builtin: true,
  },
  {
    id: 'volcengine',
    label: '火山方舟（豆包）',
    group: 'official',
    protocol: 'openai-compat',
    baseUrl: 'https://ark.cn-beijing.volces.com/api/v3',
    provider: 'openai',
    placeholder: '…',
    note: '字节跳动方舟',
    builtin: true,
  },
  {
    id: 'minimax',
    label: 'MiniMax',
    group: 'official',
    protocol: 'openai-compat',
    baseUrl: 'https://api.minimax.chat/v1',
    provider: 'openai',
    placeholder: '…',
    note: 'MiniMax 官方',
    builtin: true,
  },
  {
    id: 'yi',
    label: '零一万物 Yi',
    group: 'official',
    protocol: 'openai-compat',
    baseUrl: 'https://api.lingyiwanwu.com/v1',
    provider: 'openai',
    placeholder: '…',
    note: 'Yi 官方',
    builtin: true,
  },
  {
    id: 'stepfun',
    label: '阶跃星辰 StepFun',
    group: 'official',
    protocol: 'openai-compat',
    baseUrl: 'https://api.stepfun.com/v1',
    provider: 'openai',
    placeholder: '…',
    note: 'Step 系列',
    builtin: true,
  },
  {
    id: 'baichuan',
    label: '百川 Baichuan',
    group: 'official',
    protocol: 'openai-compat',
    baseUrl: 'https://api.baichuan-ai.com/v1',
    provider: 'openai',
    placeholder: '…',
    note: '百川智能',
    builtin: true,
  },
  {
    id: 'siliconflow',
    label: '硅基流动 SiliconFlow',
    group: 'official',
    protocol: 'openai-compat',
    baseUrl: 'https://api.siliconflow.cn/v1',
    provider: 'openai',
    placeholder: 'sk-…',
    note: '聚合多模型 · 国内常用',
    builtin: true,
  },
  {
    id: 'openrouter',
    label: 'OpenRouter',
    group: 'official',
    protocol: 'openai-compat',
    baseUrl: 'https://openrouter.ai/api/v1',
    provider: 'openai',
    placeholder: 'sk-or-…',
    note: '全球模型聚合',
    builtin: true,
  },
  {
    id: 'groq',
    label: 'Groq',
    group: 'official',
    protocol: 'openai-compat',
    baseUrl: 'https://api.groq.com/openai/v1',
    provider: 'openai',
    placeholder: 'gsk_…',
    note: '高速推理',
    builtin: true,
  },
  {
    id: 'together',
    label: 'Together AI',
    group: 'official',
    protocol: 'openai-compat',
    baseUrl: 'https://api.together.xyz/v1',
    provider: 'openai',
    placeholder: '…',
    note: '开源模型托管',
    builtin: true,
  },
  {
    id: 'fireworks',
    label: 'Fireworks AI',
    group: 'official',
    protocol: 'openai-compat',
    baseUrl: 'https://api.fireworks.ai/inference/v1',
    provider: 'openai',
    placeholder: '…',
    note: '开源模型推理',
    builtin: true,
  },
  {
    id: 'deepinfra',
    label: 'DeepInfra',
    group: 'official',
    protocol: 'openai-compat',
    baseUrl: 'https://api.deepinfra.com/v1/openai',
    provider: 'openai',
    placeholder: '…',
    note: '开源模型',
    builtin: true,
  },
  {
    id: 'mistral',
    label: 'Mistral',
    group: 'official',
    protocol: 'openai-compat',
    baseUrl: 'https://api.mistral.ai/v1',
    provider: 'openai',
    placeholder: '…',
    note: 'Mistral 官方',
    builtin: true,
  },
  {
    id: 'xai',
    label: 'xAI Grok',
    group: 'official',
    protocol: 'openai-compat',
    baseUrl: 'https://api.x.ai/v1',
    provider: 'openai',
    placeholder: 'xai-…',
    note: 'Grok 官方',
    builtin: true,
  },
  {
    id: 'gemini-openai',
    label: 'Google Gemini（OpenAI 兼容）',
    group: 'official',
    protocol: 'openai-compat',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai',
    provider: 'openai',
    placeholder: 'AIza…',
    note: 'Gemini OpenAI 兼容层',
    builtin: true,
  },
  {
    id: 'nvidia',
    label: 'NVIDIA NIM',
    group: 'official',
    protocol: 'openai-compat',
    baseUrl: 'https://integrate.api.nvidia.com/v1',
    provider: 'openai',
    placeholder: 'nvapi-…',
    note: 'NVIDIA 托管推理',
    builtin: true,
  },

  // ── 中转站 / 国内常见代理（统一 OpenAI 兼容入口，一把 Key 多模型）──
  {
    id: 'closeai',
    label: 'CloseAI',
    group: 'relay',
    protocol: 'openai-compat',
    baseUrl: 'https://api.closeai-asia.com/v1',
    provider: 'openai',
    placeholder: 'sk-…',
    note: '中转站 · GPT/Claude/Gemini 等',
    builtin: true,
  },
  {
    id: 'api2d',
    label: 'API2D',
    group: 'relay',
    protocol: 'openai-compat',
    baseUrl: 'https://oa.api2d.net/v1',
    provider: 'openai',
    placeholder: 'fk…',
    note: '中转站',
    builtin: true,
  },
  {
    id: 'ohmygpt',
    label: 'OhMyGPT',
    group: 'relay',
    protocol: 'openai-compat',
    baseUrl: 'https://api.ohmygpt.com/v1',
    provider: 'openai',
    placeholder: '…',
    note: '中转站',
    builtin: true,
  },
  {
    id: 'chatanywhere',
    label: 'ChatAnywhere',
    group: 'relay',
    protocol: 'openai-compat',
    baseUrl: 'https://api.chatanywhere.tech/v1',
    provider: 'openai',
    placeholder: 'sk-…',
    note: '中转站 · 国内直连',
    builtin: true,
  },
  {
    id: 'openai-sb',
    label: 'OpenAI-SB',
    group: 'relay',
    protocol: 'openai-compat',
    baseUrl: 'https://api.openai-sb.com/v1',
    provider: 'openai',
    placeholder: 'sb-…',
    note: '中转站',
    builtin: true,
  },
  {
    id: 'aiproxy',
    label: 'AIProxy',
    group: 'relay',
    protocol: 'openai-compat',
    baseUrl: 'https://api.aiproxy.io/v1',
    provider: 'openai',
    placeholder: 'sk-…',
    note: '中转站',
    builtin: true,
  },
  {
    id: 'poloapi',
    label: 'PoloAPI',
    group: 'relay',
    protocol: 'openai-compat',
    baseUrl: 'https://api.poloapi.com/v1',
    provider: 'openai',
    placeholder: 'sk-…',
    note: '中转站',
    builtin: true,
  },
  {
    id: 'yunwu',
    label: '云雾 Yunwu',
    group: 'relay',
    protocol: 'openai-compat',
    baseUrl: 'https://api.yunwu.ai/v1',
    provider: 'openai',
    placeholder: 'sk-…',
    note: '中转站 · 多模型',
    builtin: true,
  },
  {
    id: 'apiyi',
    label: 'API易',
    group: 'relay',
    protocol: 'openai-compat',
    baseUrl: 'https://api.apiyi.com/v1',
    provider: 'openai',
    placeholder: 'sk-…',
    note: '中转站',
    builtin: true,
  },
  {
    id: 'gptgod',
    label: 'GPTGod',
    group: 'relay',
    protocol: 'openai-compat',
    baseUrl: 'https://api.gptgod.online/v1',
    provider: 'openai',
    placeholder: '…',
    note: '中转站',
    builtin: true,
  },
  {
    id: 'aihubmix',
    label: 'AiHubMix',
    group: 'relay',
    protocol: 'openai-compat',
    baseUrl: 'https://aihubmix.com/v1',
    provider: 'openai',
    placeholder: 'sk-…',
    note: '中转站 · 聚合',
    builtin: true,
  },
  {
    id: 'opencs',
    label: 'OpenCS / OneAPI 风格',
    group: 'relay',
    protocol: 'openai-compat',
    baseUrl: 'https://api.openai.com/v1',
    provider: 'openai',
    placeholder: 'sk-…',
    note: '自建 OneAPI/NewAPI 时请改 URL',
    builtin: true,
  },
  {
    id: 'relay-claude-compat',
    label: 'Claude 中转（OpenAI 兼容）',
    group: 'relay',
    protocol: 'openai-compat',
    baseUrl: 'https://api.closeai-asia.com/v1',
    provider: 'openai',
    placeholder: 'sk-…',
    note: '多数中转站用 OpenAI 格式调 Claude',
    builtin: true,
  },

  // ── 本地 ──
  {
    id: 'ollama',
    label: 'Ollama',
    group: 'local',
    protocol: 'openai-compat',
    baseUrl: 'http://127.0.0.1:11434/v1',
    provider: 'openai',
    placeholder: 'ollama（可空）',
    note: '本地 · ollama serve',
    builtin: true,
  },
  {
    id: 'lmstudio',
    label: 'LM Studio',
    group: 'local',
    protocol: 'openai-compat',
    baseUrl: 'http://127.0.0.1:1234/v1',
    provider: 'openai',
    placeholder: 'lm-studio（可空）',
    note: '本地 · LM Studio Server',
    builtin: true,
  },
  {
    id: 'vllm',
    label: 'vLLM',
    group: 'local',
    protocol: 'openai-compat',
    baseUrl: 'http://127.0.0.1:8000/v1',
    provider: 'openai',
    placeholder: '（可空）',
    note: '本地 / 自建 vLLM',
    builtin: true,
  },
]

/** 中转站常用模型包：同一 OpenAI 兼容入口下挂多模型。 */
const RELAY_MODEL_SEEDS: Array<{ suffix: string; label: string; model: string; note?: string }> = [
  { suffix: 'gpt-4o', label: 'GPT-4o', model: 'gpt-4o' },
  { suffix: 'gpt-4o-mini', label: 'GPT-4o mini', model: 'gpt-4o-mini' },
  { suffix: 'gpt-4.1', label: 'GPT-4.1', model: 'gpt-4.1' },
  { suffix: 'gpt-4.1-mini', label: 'GPT-4.1 mini', model: 'gpt-4.1-mini' },
  { suffix: 'o3', label: 'o3', model: 'o3', note: '推理' },
  { suffix: 'o3-mini', label: 'o3-mini', model: 'o3-mini', note: '推理' },
  { suffix: 'o4-mini', label: 'o4-mini', model: 'o4-mini', note: '推理' },
  { suffix: 'claude-sonnet-4', label: 'Claude Sonnet 4', model: 'claude-sonnet-4-20250514' },
  { suffix: 'claude-opus-4', label: 'Claude Opus 4', model: 'claude-opus-4-20250514' },
  { suffix: 'claude-haiku-4', label: 'Claude Haiku 4.5', model: 'claude-haiku-4-5-20251001' },
  { suffix: 'claude-3-7-sonnet', label: 'Claude 3.7 Sonnet', model: 'claude-3-7-sonnet-20250219' },
  { suffix: 'claude-3-5-sonnet', label: 'Claude 3.5 Sonnet', model: 'claude-3-5-sonnet-20241022' },
  { suffix: 'gemini-2.5-pro', label: 'Gemini 2.5 Pro', model: 'gemini-2.5-pro' },
  { suffix: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash', model: 'gemini-2.5-flash' },
  { suffix: 'deepseek-chat', label: 'DeepSeek Chat', model: 'deepseek-chat' },
  { suffix: 'deepseek-reasoner', label: 'DeepSeek Reasoner', model: 'deepseek-reasoner' },
  { suffix: 'deepseek-v3', label: 'DeepSeek V3', model: 'deepseek-v3' },
  { suffix: 'qwen-max', label: 'Qwen-Max', model: 'qwen-max' },
  { suffix: 'qwen-plus', label: 'Qwen-Plus', model: 'qwen-plus' },
  { suffix: 'grok-3', label: 'Grok 3', model: 'grok-3' },
]

function relayPack(endpointId: string, note?: string): LlmModelDef[] {
  return RELAY_MODEL_SEEDS.map((s) => ({
    id: `${endpointId}-${s.suffix}`,
    label: s.label,
    endpointId,
    provider: 'openai' as const,
    model: s.model,
    category: 'relay',
    note: s.note ?? note,
    builtin: true,
  }))
}

/** 官方三家 + 各入口内置模型（尽量全；中转站复用统一模型包）。 */
export const LLM_MODEL_CATALOG: LlmModelDef[] = [
  // ── DeepSeek 官方（仅 Flash / Pro / Vision）──
  { id: 'deepseek-flash', label: 'DeepSeek Flash', endpointId: 'deepseek', provider: 'deepseek', model: 'deepseek-v4-flash', category: 'flash', note: '通用 / 快速', builtin: true },
  { id: 'deepseek-pro', label: 'DeepSeek Pro', endpointId: 'deepseek', provider: 'deepseek', model: 'deepseek-v4-pro', category: 'pro', note: '深度推理', builtin: true },
  { id: 'deepseek-flash-vision', label: 'DeepSeek Flash Vision', endpointId: 'deepseek', provider: 'deepseek', model: 'deepseek-v4-flash-vision-exp', category: 'flash', note: '视觉', builtin: true },

  // ── OpenAI 官方 ──
  { id: 'gpt-4o', label: 'GPT-4o', endpointId: 'openai', provider: 'openai', model: 'gpt-4o', category: 'gpt', note: '通用旗舰', builtin: true },
  { id: 'gpt-4o-mini', label: 'GPT-4o mini', endpointId: 'openai', provider: 'openai', model: 'gpt-4o-mini', category: 'gpt', note: '轻量', builtin: true },
  { id: 'gpt-4o-2024-11-20', label: 'GPT-4o (2024-11-20)', endpointId: 'openai', provider: 'openai', model: 'gpt-4o-2024-11-20', category: 'gpt', builtin: true },
  { id: 'chatgpt-4o-latest', label: 'ChatGPT-4o Latest', endpointId: 'openai', provider: 'openai', model: 'chatgpt-4o-latest', category: 'gpt', builtin: true },
  { id: 'gpt-4.1', label: 'GPT-4.1', endpointId: 'openai', provider: 'openai', model: 'gpt-4.1', category: 'gpt', note: '编码增强', builtin: true },
  { id: 'gpt-4.1-mini', label: 'GPT-4.1 mini', endpointId: 'openai', provider: 'openai', model: 'gpt-4.1-mini', category: 'gpt', builtin: true },
  { id: 'gpt-4.1-nano', label: 'GPT-4.1 nano', endpointId: 'openai', provider: 'openai', model: 'gpt-4.1-nano', category: 'gpt', note: '极速', builtin: true },
  { id: 'gpt-4-turbo', label: 'GPT-4 Turbo', endpointId: 'openai', provider: 'openai', model: 'gpt-4-turbo', category: 'gpt', builtin: true },
  { id: 'gpt-4-turbo-preview', label: 'GPT-4 Turbo Preview', endpointId: 'openai', provider: 'openai', model: 'gpt-4-turbo-preview', category: 'gpt', builtin: true },
  { id: 'gpt-3.5-turbo', label: 'GPT-3.5 Turbo', endpointId: 'openai', provider: 'openai', model: 'gpt-3.5-turbo', category: 'gpt', note: '经典', builtin: true },
  { id: 'o1', label: 'o1', endpointId: 'openai', provider: 'openai', model: 'o1', category: 'gpt', note: '推理', builtin: true },
  { id: 'o1-mini', label: 'o1-mini', endpointId: 'openai', provider: 'openai', model: 'o1-mini', category: 'gpt', note: '推理轻量', builtin: true },
  { id: 'o1-pro', label: 'o1-pro', endpointId: 'openai', provider: 'openai', model: 'o1-pro', category: 'gpt', note: '推理旗舰', builtin: true },
  { id: 'o3', label: 'o3', endpointId: 'openai', provider: 'openai', model: 'o3', category: 'gpt', note: '推理', builtin: true },
  { id: 'o3-mini', label: 'o3-mini', endpointId: 'openai', provider: 'openai', model: 'o3-mini', category: 'gpt', note: '推理', builtin: true },
  { id: 'o3-pro', label: 'o3-pro', endpointId: 'openai', provider: 'openai', model: 'o3-pro', category: 'gpt', note: '推理旗舰', builtin: true },
  { id: 'o4-mini', label: 'o4-mini', endpointId: 'openai', provider: 'openai', model: 'o4-mini', category: 'gpt', note: '推理', builtin: true },
  { id: 'gpt-5', label: 'GPT-5', endpointId: 'openai', provider: 'openai', model: 'gpt-5', category: 'gpt', builtin: true },
  { id: 'gpt-5-mini', label: 'GPT-5 mini', endpointId: 'openai', provider: 'openai', model: 'gpt-5-mini', category: 'gpt', builtin: true },
  { id: 'gpt-5-nano', label: 'GPT-5 nano', endpointId: 'openai', provider: 'openai', model: 'gpt-5-nano', category: 'gpt', builtin: true },

  // ── Anthropic 官方 ──
  { id: 'claude-opus-4-20250514', label: 'Claude Opus 4', endpointId: 'anthropic', provider: 'anthropic', model: 'claude-opus-4-20250514', category: 'claude', note: '旗舰', builtin: true },
  { id: 'claude-sonnet-4-20250514', label: 'Claude Sonnet 4', endpointId: 'anthropic', provider: 'anthropic', model: 'claude-sonnet-4-20250514', category: 'claude', note: '均衡', builtin: true },
  { id: 'claude-haiku-4-5-20251001', label: 'Claude Haiku 4.5', endpointId: 'anthropic', provider: 'anthropic', model: 'claude-haiku-4-5-20251001', category: 'claude', note: '快速', builtin: true },
  { id: 'claude-opus-4-1-20250805', label: 'Claude Opus 4.1', endpointId: 'anthropic', provider: 'anthropic', model: 'claude-opus-4-1-20250805', category: 'claude', builtin: true },
  { id: 'claude-3-7-sonnet-20250219', label: 'Claude 3.7 Sonnet', endpointId: 'anthropic', provider: 'anthropic', model: 'claude-3-7-sonnet-20250219', category: 'claude', note: '扩展思考', builtin: true },
  { id: 'claude-3-5-sonnet-20241022', label: 'Claude 3.5 Sonnet', endpointId: 'anthropic', provider: 'anthropic', model: 'claude-3-5-sonnet-20241022', category: 'claude', builtin: true },
  { id: 'claude-3-5-sonnet-20240620', label: 'Claude 3.5 Sonnet (Jun)', endpointId: 'anthropic', provider: 'anthropic', model: 'claude-3-5-sonnet-20240620', category: 'claude', builtin: true },
  { id: 'claude-3-5-haiku-20241022', label: 'Claude 3.5 Haiku', endpointId: 'anthropic', provider: 'anthropic', model: 'claude-3-5-haiku-20241022', category: 'claude', note: '轻量', builtin: true },
  { id: 'claude-3-opus-20240229', label: 'Claude 3 Opus', endpointId: 'anthropic', provider: 'anthropic', model: 'claude-3-opus-20240229', category: 'claude', builtin: true },
  { id: 'claude-3-sonnet-20240229', label: 'Claude 3 Sonnet', endpointId: 'anthropic', provider: 'anthropic', model: 'claude-3-sonnet-20240229', category: 'claude', builtin: true },
  { id: 'claude-3-haiku-20240307', label: 'Claude 3 Haiku', endpointId: 'anthropic', provider: 'anthropic', model: 'claude-3-haiku-20240307', category: 'claude', builtin: true },

  // ── Moonshot / Kimi ──
  { id: 'moonshot-v1-auto', label: 'Kimi Auto', endpointId: 'moonshot', provider: 'openai', model: 'moonshot-v1-auto', category: 'other', note: '自动路由', builtin: true },
  { id: 'moonshot-v1-8k', label: 'moonshot-v1-8k', endpointId: 'moonshot', provider: 'openai', model: 'moonshot-v1-8k', category: 'other', builtin: true },
  { id: 'moonshot-v1-32k', label: 'moonshot-v1-32k', endpointId: 'moonshot', provider: 'openai', model: 'moonshot-v1-32k', category: 'other', builtin: true },
  { id: 'moonshot-v1-128k', label: 'moonshot-v1-128k', endpointId: 'moonshot', provider: 'openai', model: 'moonshot-v1-128k', category: 'other', builtin: true },
  { id: 'kimi-k2', label: 'Kimi K2', endpointId: 'moonshot', provider: 'openai', model: 'kimi-k2-0711-preview', category: 'other', builtin: true },
  { id: 'kimi-latest', label: 'Kimi Latest', endpointId: 'moonshot', provider: 'openai', model: 'kimi-latest', category: 'other', builtin: true },

  // ── 智谱 ──
  { id: 'glm-4-plus', label: 'GLM-4-Plus', endpointId: 'zhipu', provider: 'openai', model: 'glm-4-plus', category: 'other', builtin: true },
  { id: 'glm-4-air', label: 'GLM-4-Air', endpointId: 'zhipu', provider: 'openai', model: 'glm-4-air', category: 'other', builtin: true },
  { id: 'glm-4-airx', label: 'GLM-4-AirX', endpointId: 'zhipu', provider: 'openai', model: 'glm-4-airx', category: 'other', builtin: true },
  { id: 'glm-4-flash', label: 'GLM-4-Flash', endpointId: 'zhipu', provider: 'openai', model: 'glm-4-flash', category: 'other', note: '高速', builtin: true },
  { id: 'glm-4-long', label: 'GLM-4-Long', endpointId: 'zhipu', provider: 'openai', model: 'glm-4-long', category: 'other', builtin: true },
  { id: 'glm-4v-plus', label: 'GLM-4V-Plus', endpointId: 'zhipu', provider: 'openai', model: 'glm-4v-plus', category: 'other', note: '视觉', builtin: true },
  { id: 'glm-z1-air', label: 'GLM-Z1-Air', endpointId: 'zhipu', provider: 'openai', model: 'glm-z1-air', category: 'other', note: '推理', builtin: true },
  { id: 'glm-z1-airx', label: 'GLM-Z1-AirX', endpointId: 'zhipu', provider: 'openai', model: 'glm-z1-airx', category: 'other', note: '推理', builtin: true },
  { id: 'glm-z1-flash', label: 'GLM-Z1-Flash', endpointId: 'zhipu', provider: 'openai', model: 'glm-z1-flash', category: 'other', note: '推理', builtin: true },

  // ── 通义 DashScope ──
  { id: 'qwen-max', label: 'Qwen-Max', endpointId: 'dashscope', provider: 'openai', model: 'qwen-max', category: 'other', builtin: true },
  { id: 'qwen-max-latest', label: 'Qwen-Max-Latest', endpointId: 'dashscope', provider: 'openai', model: 'qwen-max-latest', category: 'other', builtin: true },
  { id: 'qwen-plus', label: 'Qwen-Plus', endpointId: 'dashscope', provider: 'openai', model: 'qwen-plus', category: 'other', builtin: true },
  { id: 'qwen-plus-latest', label: 'Qwen-Plus-Latest', endpointId: 'dashscope', provider: 'openai', model: 'qwen-plus-latest', category: 'other', builtin: true },
  { id: 'qwen-turbo', label: 'Qwen-Turbo', endpointId: 'dashscope', provider: 'openai', model: 'qwen-turbo', category: 'other', builtin: true },
  { id: 'qwen-turbo-latest', label: 'Qwen-Turbo-Latest', endpointId: 'dashscope', provider: 'openai', model: 'qwen-turbo-latest', category: 'other', builtin: true },
  { id: 'qwen-long', label: 'Qwen-Long', endpointId: 'dashscope', provider: 'openai', model: 'qwen-long', category: 'other', builtin: true },
  { id: 'qwq-plus', label: 'QwQ-Plus', endpointId: 'dashscope', provider: 'openai', model: 'qwq-plus', category: 'other', note: '推理', builtin: true },
  { id: 'qwq-32b', label: 'QwQ-32B', endpointId: 'dashscope', provider: 'openai', model: 'qwq-32b', category: 'other', note: '推理', builtin: true },
  { id: 'qwen3-235b', label: 'Qwen3-235B', endpointId: 'dashscope', provider: 'openai', model: 'qwen3-235b-a22b', category: 'other', builtin: true },
  { id: 'qwen3-32b', label: 'Qwen3-32B', endpointId: 'dashscope', provider: 'openai', model: 'qwen3-32b', category: 'other', builtin: true },

  // ── 硅基流动 ──
  { id: 'sf-deepseek-v3', label: 'DeepSeek-V3', endpointId: 'siliconflow', provider: 'openai', model: 'deepseek-ai/DeepSeek-V3', category: 'other', builtin: true },
  { id: 'sf-deepseek-v3.1', label: 'DeepSeek-V3.1', endpointId: 'siliconflow', provider: 'openai', model: 'deepseek-ai/DeepSeek-V3.1', category: 'other', builtin: true },
  { id: 'sf-deepseek-r1', label: 'DeepSeek-R1', endpointId: 'siliconflow', provider: 'openai', model: 'deepseek-ai/DeepSeek-R1', category: 'other', builtin: true },
  { id: 'sf-qwen3-235b', label: 'Qwen3-235B', endpointId: 'siliconflow', provider: 'openai', model: 'Qwen/Qwen3-235B-A22B', category: 'other', builtin: true },
  { id: 'sf-qwen3-32b', label: 'Qwen3-32B', endpointId: 'siliconflow', provider: 'openai', model: 'Qwen/Qwen3-32B', category: 'other', builtin: true },
  { id: 'sf-qwen2.5-72b', label: 'Qwen2.5-72B', endpointId: 'siliconflow', provider: 'openai', model: 'Qwen/Qwen2.5-72B-Instruct', category: 'other', builtin: true },
  { id: 'sf-glm4-9b', label: 'GLM-4-9B', endpointId: 'siliconflow', provider: 'openai', model: 'THUDM/GLM-4-9B-0414', category: 'other', builtin: true },
  { id: 'sf-llama-70b', label: 'Llama-3.3-70B', endpointId: 'siliconflow', provider: 'openai', model: 'meta-llama/Llama-3.3-70B-Instruct', category: 'other', builtin: true },

  // ── OpenRouter ──
  { id: 'or-gpt-4o', label: 'GPT-4o', endpointId: 'openrouter', provider: 'openai', model: 'openai/gpt-4o', category: 'other', builtin: true },
  { id: 'or-gpt-4.1', label: 'GPT-4.1', endpointId: 'openrouter', provider: 'openai', model: 'openai/gpt-4.1', category: 'other', builtin: true },
  { id: 'or-o3', label: 'o3', endpointId: 'openrouter', provider: 'openai', model: 'openai/o3', category: 'other', builtin: true },
  { id: 'or-o4-mini', label: 'o4-mini', endpointId: 'openrouter', provider: 'openai', model: 'openai/o4-mini', category: 'other', builtin: true },
  { id: 'or-claude-opus', label: 'Claude Opus 4', endpointId: 'openrouter', provider: 'openai', model: 'anthropic/claude-opus-4', category: 'other', builtin: true },
  { id: 'or-claude-sonnet', label: 'Claude Sonnet 4', endpointId: 'openrouter', provider: 'openai', model: 'anthropic/claude-sonnet-4', category: 'other', builtin: true },
  { id: 'or-claude-3.7', label: 'Claude 3.7 Sonnet', endpointId: 'openrouter', provider: 'openai', model: 'anthropic/claude-3.7-sonnet', category: 'other', builtin: true },
  { id: 'or-gemini-pro', label: 'Gemini 2.5 Pro', endpointId: 'openrouter', provider: 'openai', model: 'google/gemini-2.5-pro', category: 'other', builtin: true },
  { id: 'or-gemini-flash', label: 'Gemini 2.5 Flash', endpointId: 'openrouter', provider: 'openai', model: 'google/gemini-2.5-flash', category: 'other', builtin: true },
  { id: 'or-deepseek-r1', label: 'DeepSeek R1', endpointId: 'openrouter', provider: 'openai', model: 'deepseek/deepseek-r1', category: 'other', builtin: true },
  { id: 'or-deepseek-v3', label: 'DeepSeek V3', endpointId: 'openrouter', provider: 'openai', model: 'deepseek/deepseek-chat', category: 'other', builtin: true },
  { id: 'or-qwen3-235b', label: 'Qwen3 235B', endpointId: 'openrouter', provider: 'openai', model: 'qwen/qwen3-235b-a22b', category: 'other', builtin: true },

  // ── Groq ──
  { id: 'groq-llama-70b', label: 'Llama 3.3 70B', endpointId: 'groq', provider: 'openai', model: 'llama-3.3-70b-versatile', category: 'other', builtin: true },
  { id: 'groq-llama-8b', label: 'Llama 3.1 8B', endpointId: 'groq', provider: 'openai', model: 'llama-3.1-8b-instant', category: 'other', builtin: true },
  { id: 'groq-qwen3-32b', label: 'Qwen3 32B', endpointId: 'groq', provider: 'openai', model: 'qwen/qwen3-32b', category: 'other', builtin: true },
  { id: 'groq-gpt-oss-120b', label: 'GPT-OSS 120B', endpointId: 'groq', provider: 'openai', model: 'openai/gpt-oss-120b', category: 'other', builtin: true },
  { id: 'groq-kimi-k2', label: 'Kimi K2', endpointId: 'groq', provider: 'openai', model: 'moonshotai/kimi-k2-instruct', category: 'other', builtin: true },

  // ── xAI ──
  { id: 'grok-3', label: 'Grok 3', endpointId: 'xai', provider: 'openai', model: 'grok-3', category: 'other', builtin: true },
  { id: 'grok-3-mini', label: 'Grok 3 Mini', endpointId: 'xai', provider: 'openai', model: 'grok-3-mini', category: 'other', builtin: true },
  { id: 'grok-3-fast', label: 'Grok 3 Fast', endpointId: 'xai', provider: 'openai', model: 'grok-3-fast', category: 'other', builtin: true },
  { id: 'grok-2', label: 'Grok 2', endpointId: 'xai', provider: 'openai', model: 'grok-2-latest', category: 'other', builtin: true },
  { id: 'grok-4', label: 'Grok 4', endpointId: 'xai', provider: 'openai', model: 'grok-4', category: 'other', builtin: true },

  // ── Gemini OpenAI 兼容 ──
  { id: 'gemini-2.5-pro', label: 'Gemini 2.5 Pro', endpointId: 'gemini-openai', provider: 'openai', model: 'gemini-2.5-pro', category: 'other', builtin: true },
  { id: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash', endpointId: 'gemini-openai', provider: 'openai', model: 'gemini-2.5-flash', category: 'other', builtin: true },
  { id: 'gemini-2.5-flash-lite', label: 'Gemini 2.5 Flash Lite', endpointId: 'gemini-openai', provider: 'openai', model: 'gemini-2.5-flash-lite', category: 'other', builtin: true },
  { id: 'gemini-2.0-flash', label: 'Gemini 2.0 Flash', endpointId: 'gemini-openai', provider: 'openai', model: 'gemini-2.0-flash', category: 'other', builtin: true },
  { id: 'gemini-1.5-pro', label: 'Gemini 1.5 Pro', endpointId: 'gemini-openai', provider: 'openai', model: 'gemini-1.5-pro', category: 'other', builtin: true },

  // ── 火山 / MiniMax / Step / 百川 / 零一 ──
  { id: 'doubao-pro', label: 'Doubao Pro', endpointId: 'volcengine', provider: 'openai', model: 'doubao-pro-32k', category: 'other', note: '按方舟接入点 ID 改', builtin: true },
  { id: 'doubao-lite', label: 'Doubao Lite', endpointId: 'volcengine', provider: 'openai', model: 'doubao-lite-32k', category: 'other', note: '按方舟接入点 ID 改', builtin: true },
  { id: 'minimax-abab6.5s', label: 'abab6.5s', endpointId: 'minimax', provider: 'openai', model: 'abab6.5s-chat', category: 'other', builtin: true },
  { id: 'minimax-m1', label: 'MiniMax-M1', endpointId: 'minimax', provider: 'openai', model: 'MiniMax-M1', category: 'other', builtin: true },
  { id: 'step-2', label: 'Step-2', endpointId: 'stepfun', provider: 'openai', model: 'step-2-16k', category: 'other', builtin: true },
  { id: 'step-1o', label: 'Step-1o', endpointId: 'stepfun', provider: 'openai', model: 'step-1o-turbo-vision', category: 'other', note: '视觉', builtin: true },
  { id: 'baichuan4', label: 'Baichuan4', endpointId: 'baichuan', provider: 'openai', model: 'Baichuan4', category: 'other', builtin: true },
  { id: 'baichuan4-turbo', label: 'Baichuan4-Turbo', endpointId: 'baichuan', provider: 'openai', model: 'Baichuan4-Turbo', category: 'other', builtin: true },
  { id: 'yi-lightning', label: 'Yi-Lightning', endpointId: 'yi', provider: 'openai', model: 'yi-lightning', category: 'other', builtin: true },
  { id: 'yi-large', label: 'Yi-Large', endpointId: 'yi', provider: 'openai', model: 'yi-large', category: 'other', builtin: true },

  // ── 中转站：统一模型包 ──
  ...relayPack('closeai', 'CloseAI'),
  ...relayPack('api2d', 'API2D'),
  ...relayPack('ohmygpt', 'OhMyGPT'),
  ...relayPack('chatanywhere', 'ChatAnywhere'),
  ...relayPack('openai-sb', 'OpenAI-SB'),
  ...relayPack('aiproxy', 'AIProxy'),
  ...relayPack('poloapi', 'PoloAPI'),
  ...relayPack('yunwu', 'Yunwu'),
  ...relayPack('apiyi', 'API易'),
  ...relayPack('gptgod', 'GPTGod'),
  ...relayPack('aihubmix', 'AiHubMix'),
  ...relayPack('opencs', 'OneAPI'),
  ...relayPack('relay-claude-compat', 'Claude 兼容中转'),

  // ── 本地 ──
  { id: 'ollama-llama3.2', label: 'llama3.2', endpointId: 'ollama', provider: 'openai', model: 'llama3.2', category: 'local', builtin: true },
  { id: 'ollama-llama3.1', label: 'llama3.1', endpointId: 'ollama', provider: 'openai', model: 'llama3.1', category: 'local', builtin: true },
  { id: 'ollama-qwen2.5', label: 'qwen2.5', endpointId: 'ollama', provider: 'openai', model: 'qwen2.5', category: 'local', builtin: true },
  { id: 'ollama-qwen3', label: 'qwen3', endpointId: 'ollama', provider: 'openai', model: 'qwen3', category: 'local', builtin: true },
  { id: 'ollama-deepseek-r1', label: 'deepseek-r1', endpointId: 'ollama', provider: 'openai', model: 'deepseek-r1', category: 'local', builtin: true },
  { id: 'ollama-mistral', label: 'mistral', endpointId: 'ollama', provider: 'openai', model: 'mistral', category: 'local', builtin: true },
  { id: 'ollama-gemma3', label: 'gemma3', endpointId: 'ollama', provider: 'openai', model: 'gemma3', category: 'local', builtin: true },
  { id: 'lmstudio-local', label: '当前加载模型', endpointId: 'lmstudio', provider: 'openai', model: 'local-model', category: 'local', note: '按 LM Studio 实际名改', builtin: true },
  { id: 'vllm-local', label: 'vLLM 当前模型', endpointId: 'vllm', provider: 'openai', model: 'default', category: 'local', note: '按 served-model-name 改', builtin: true },
]

/** 兼容旧代码：仅 deepseek / openai / anthropic。 */
export const CHAT_PROVIDERS: ChatProvider[] = ['deepseek', 'openai', 'anthropic']

export function describeProvider(provider: ChatProvider): string {
  switch (provider) {
    case 'deepseek':
      return 'DeepSeek'
    case 'openai':
      return 'OpenAI'
    case 'anthropic':
      return 'Anthropic'
    default:
      return provider
  }
}

export function defaultModelFor(provider: ChatProvider): string {
  if (provider === 'deepseek') return 'deepseek-v4-flash'
  const first = LLM_MODEL_CATALOG.find((m) => m.provider === provider && m.endpointId === provider)
  return first?.model ?? LLM_MODEL_CATALOG.find((m) => m.provider === provider)?.model ?? 'deepseek-v4-flash'
}

export function findEndpointPreset(id: string): LlmEndpointDef | undefined {
  return LLM_ENDPOINT_PRESETS.find((e) => e.id === id)
}

export type ReasoningEffort = 'high' | 'max'
export type ThinkingMode = 'enabled' | 'disabled'
export type ContextWindow = '200k' | '1m'
export type SpeedMode = 'fast' | 'slow'
export type ModelKnobId = 'thinking' | 'speed' | 'effort' | 'context'

export type ModelToggleKnob = {
  id: 'thinking' | 'speed'
  kind: 'toggle'
  label: string
  on: string
  off: string
}

export type ModelChoiceKnob = {
  id: 'effort' | 'context'
  kind: 'choice'
  label: string
  options: Array<{ value: string; label: string }>
}

export type ModelKnob = ModelToggleKnob | ModelChoiceKnob

/** 一级菜单只消费 knobs，不关心是哪家模型。 */
export interface ModelCapabilities {
  knobs: ModelKnob[]
}

export type ModelModeValues = {
  thinking: ThinkingMode
  speed: SpeedMode
  effort: ReasoningEffort
  context: ContextWindow
}

export const THINKING_KNOB: ModelToggleKnob = {
  id: 'thinking',
  kind: 'toggle',
  label: '思考',
  on: 'enabled',
  off: 'disabled',
}

export const SPEED_KNOB: ModelToggleKnob = {
  id: 'speed',
  kind: 'toggle',
  label: '快',
  on: 'fast',
  off: 'slow',
}

export const EFFORT_KNOB: ModelChoiceKnob = {
  id: 'effort',
  kind: 'choice',
  label: '力度',
  options: [
    { value: 'high', label: 'High' },
    { value: 'max', label: 'Max' },
  ],
}

export const CONTEXT_KNOB: ModelChoiceKnob = {
  id: 'context',
  kind: 'choice',
  label: '上下文',
  options: [
    { value: '200k', label: '200k' },
    { value: '1m', label: '1M' },
  ],
}

const FAMILIES: Array<{ match: (id: string, provider: ChatProvider) => boolean; knobs: ModelKnob[] }> = [
  {
    match: (id, provider) =>
      provider === 'deepseek' ||
      id.includes('deepseek-v4') ||
      id.includes('deepseek-reasoner') ||
      /deepseek-r1/.test(id),
    knobs: [THINKING_KNOB, EFFORT_KNOB],
  },
  { match: (id) => id.includes('grok'), knobs: [SPEED_KNOB] },
  { match: (id) => /gpt-5/.test(id), knobs: [SPEED_KNOB, EFFORT_KNOB, CONTEXT_KNOB] },
  { match: (id) => /(^|[^a-z])o[1-4]([^a-z]|$)/.test(id), knobs: [SPEED_KNOB, EFFORT_KNOB] },
  { match: (id) => /gpt-4\.1/.test(id), knobs: [CONTEXT_KNOB] },
  {
    match: (id, provider) =>
      provider === 'anthropic' && /claude-(opus|sonnet)-4|claude-4|claude-3-7/.test(id),
    knobs: [THINKING_KNOB],
  },
]

export function inferModelCapabilities(model: string, provider: ChatProvider): ModelCapabilities {
  const id = model.toLowerCase()
  return { knobs: FAMILIES.find((family) => family.match(id, provider))?.knobs ?? [] }
}

export function hasKnob(caps: ModelCapabilities, id: ModelKnobId) {
  return (caps.knobs ?? []).some((knob) => knob.id === id)
}

export function knobIds(caps: ModelCapabilities): ModelKnobId[] {
  return (caps.knobs ?? []).map((knob) => knob.id)
}

export function defaultModeValues(caps: ModelCapabilities): ModelModeValues {
  return {
    thinking: hasKnob(caps, 'thinking') || hasKnob(caps, 'speed') || hasKnob(caps, 'effort') ? 'enabled' : 'disabled',
    speed: 'slow',
    effort: 'high',
    context: '200k',
  }
}

export function defaultThinkingFor(caps: ModelCapabilities): ThinkingMode {
  return defaultModeValues(caps).thinking
}

/** 只有发请求时才把 knobs 收成上游字段；快 ≠ 思考。 */
export function applyModeToLlm(caps: ModelCapabilities, mode: ModelModeValues): {
  thinking?: ThinkingMode
  reasoningEffort?: ReasoningEffort
} {
  if (!(caps.knobs ?? []).length) return {}
  if (hasKnob(caps, 'speed') && mode.speed === 'fast') return { thinking: 'disabled' }
  return {
    ...(hasKnob(caps, 'thinking') || hasKnob(caps, 'speed') ? { thinking: mode.thinking } : {}),
    ...(hasKnob(caps, 'effort') ? { reasoningEffort: mode.effort } : {}),
  }
}

/** 规范化用户输入的 baseUrl（去尾斜杠）。 */
export function normalizeBaseUrl(url: string): string {
  return url.trim().replace(/\/+$/, '')
}
