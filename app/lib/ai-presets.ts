export type ApiPreset = {
  id: string;
  name: string;
  baseUrl: string;
  model: string;
  note: string;
  keyUrl?: string;
  free?: boolean;
};

/**
 * 站内可选的 OpenAI-compatible 线路。keyUrl 是官方申请免费 key 的入口，
 * 首次进入站点时的引导弹窗和 /profile 的「改写模型」区块共用这份清单。
 */
export const apiPresets: ApiPreset[] = [
  { id: 'agnes', name: 'Agnes', baseUrl: 'https://apihub.agnes-ai.cn/v1', model: 'agnes-2.5-flash', note: '国内直连、当前免费；实测最快，整章约 15 秒，推荐先用这条', keyUrl: 'https://platform.agnes-ai.cn', free: true },
  { id: 'tokenharbor', name: 'Token Harbor', baseUrl: 'https://tokenharbor.ai/v1', model: 'deepseek-v4.1-flash:free', note: '免费模型，国内可直连；但有速率限制，实测整章要 90 秒以上，长章节容易超时，慢就换 Agnes', keyUrl: 'https://tokenharbor.ai/dashboard', free: true },
  { id: 'groq', name: 'Groq', baseUrl: 'https://api.groq.com/openai/v1', model: 'qwen/qwen3.8-27b', note: '免费额度，速度最快，推荐先试', keyUrl: 'https://console.groq.com/keys', free: true },
  { id: 'gemini', name: 'Google Gemini', baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai', model: 'gemini-2.5-flash', note: 'AI Studio 免费额度，性价比高', keyUrl: 'https://aistudio.google.com/apikey', free: true },
  { id: 'openrouter', name: 'OpenRouter', baseUrl: 'https://openrouter.ai/api/v1', model: 'nex-agi/nex-n2.5-mini:free', note: '免费档每天只有 50 次请求，改写一章要 4～10 次，用几天就会用完；额度不够时建议换 Groq 或 Gemini', keyUrl: 'https://openrouter.ai/keys', free: true },
  { id: 'siliconflow', name: '硅基流动', baseUrl: 'https://api.siliconflow.cn/v1', model: 'Qwen/Qwen2.5-72B-Instruct', note: '国内网络直连，注册送额度', keyUrl: 'https://cloud.siliconflow.cn/account/ak', free: true },
  { id: 'deepseek', name: 'DeepSeek', baseUrl: 'https://api.deepseek.com/v1', model: 'deepseek-chat', note: '便宜，中文和长文本成本低', keyUrl: 'https://platform.deepseek.com/api_keys' },
  { id: 'moonshot', name: 'Moonshot Kimi', baseUrl: 'https://api.moonshot.cn/v1', model: 'kimi-k2-0711-preview', note: '中文长文本可试', keyUrl: 'https://platform.moonshot.cn/console/api-keys' },
  { id: 'openai', name: 'OpenAI', baseUrl: 'https://api.openai.com/v1', model: 'gpt-4.1-mini', note: '稳定，通常需要付费余额', keyUrl: 'https://platform.openai.com/api-keys' },
  { id: 'together', name: 'Together AI', baseUrl: 'https://api.together.xyz/v1', model: 'meta-llama/Llama-3.3-70B-Instruct-Turbo', note: '常见开源大模型接口', keyUrl: 'https://api.together.xyz/settings/api-keys' },
  { id: 'custom', name: '自定义 OpenAI-compatible', baseUrl: '', model: '', note: '填供应商给你的 /v1 地址和模型名' },
];

export const AI_SETTINGS_KEY = 'zhiji-ai-settings';
export const AI_SETUP_DONE_KEY = 'zhiji-ai-setup-done';

/**
 * 线路配置变更信号。改写页面靠它自动接上：读者中途去别处填 key（引导弹窗或
 * 「阅读画像」），填完必须能继续，而不是停在一个「重试也没用」的错误页上。
 */
export const AI_SETTINGS_CHANGED = 'zhiji:ai-settings-changed';

/** 请求打开「填写 API key」弹窗。改写页出错时直接就地弹窗，不用跳走再回来。 */
export const OPEN_AI_SETUP = 'zhiji:open-ai-setup';

export type AiSettings = {
  aiProvider?: string;
  apiBaseUrl?: string;
  apiModel?: string;
  apiKey?: string;
  imageModel?: string;
};

export function readAiSettings(): AiSettings {
  try {
    const raw = JSON.parse(localStorage.getItem(AI_SETTINGS_KEY) || '{}') as AiSettings;
    // 早期版本存下来的配置没有 aiProvider 字段，而改写服务只认 openai-compatible。
    // 这里补默认值，避免「明明填过 key，却被要求再填一次」。
    if (!raw.aiProvider && raw.apiKey && raw.apiBaseUrl && raw.apiModel) {
      return { ...raw, aiProvider: 'openai-compatible' };
    }
    return raw;
  } catch {
    return {};
  }
}

/** 唯一的写入口：落盘 + 广播。任何保存线路的地方都必须走这里。 */
export function saveAiSettings(settings: AiSettings) {
  try {
    localStorage.setItem(AI_SETTINGS_KEY, JSON.stringify(settings));
  } catch {
    /* 隐身模式下写不进去，也不该挡住阅读 */
  }
  try {
    window.dispatchEvent(new Event(AI_SETTINGS_CHANGED));
  } catch {
    /* SSR 环境没有 window */
  }
}

/** 判断一份线路配置能不能真的发起改写。 */
export function hasUsableAiSettings(settings = readAiSettings()) {
  return settings.aiProvider === 'openai-compatible' && Boolean(settings.apiBaseUrl && settings.apiModel && settings.apiKey);
}

export type LineTest = {
  ok: boolean;
  status?: number;
  model?: string;
  ms?: number;
  reply?: string;
  message?: string;
  /** 两家的口径不一样：OpenRouter 报「还剩几次」，Token Harbor 报「已用百分之几」。 */
  quota?: { limit: number; remaining: number; resetAt?: number; usedPct?: number; resetsAt?: string };
};

/**
 * 让站点替读者打一次最小请求。
 * 以前只有真正改写时才知道模型已下架，读者会误以为是自己 key 填错了——
 * 加这个入口，存之前就能确认线路到底能不能用。
 */
export async function testAiLine(settings: AiSettings): Promise<LineTest> {
  try {
    // 必须带一个 JSON body：空 body 的 POST 在这个运行时里会直接 500。
    const ticket = await fetch('/api/ai-test', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
    const data = (await ticket.json()) as { editorUrl?: string; title?: string; token?: string; message?: string };
    if (!ticket.ok || !data.editorUrl || !data.token) {
      return { ok: false, status: ticket.status, message: data.message || '站点没有返回测试票据。' };
    }
    const response = await fetch(data.editorUrl, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${data.token}` },
      body: JSON.stringify({ title: data.title, action: 'test-line', ...settings }),
      signal: AbortSignal.timeout(45_000),
    });
    const result = (await response.json()) as LineTest;
    if (typeof result?.ok === 'boolean') return result;
    return { ok: false, status: response.status, message: '改写服务没有返回测试结果。' };
  } catch {
    return { ok: false, message: '网络不通，没能联系上站点。' };
  }
}

/** 把上游报的额度翻译成一句人话。读不到就不提，别编数字。 */
function describeQuota(quota?: LineTest['quota']) {
  if (!quota) return '';
  if (typeof quota.usedPct === 'number') {
    const reset = quota.resetsAt ? `，${quota.resetsAt.slice(0, 10)} 重置` : '';
    return `（免费额度已用 ${quota.usedPct}%${reset}；改写一章大约要 4～10 次请求）`;
  }
  return `（今日免费额度还剩 ${quota.remaining}/${quota.limit} 次；改写一章大约要 4～10 次请求）`;
}

/** 把一次线路测试的结果说成一句人话。 */
export function describeLineTest(result: LineTest) {
  // 免费额度必须一起报出来：一次小请求能过，不代表还够跑完一章。
  // 之前读者看到「可用」就去改写了，结果写一半额度用光，页面只说「改写失败」。
  const quota = describeQuota(result.quota);
  if (result.ok) {
    return `线路可用：${result.model} 在 ${result.ms ?? '-'}ms 内返回「${result.reply || '正常'}」${quota}`;
  }
  return `线路不可用${result.status ? `（HTTP ${result.status}）` : ''}：${result.message || '未知原因'}${quota}`;
}
