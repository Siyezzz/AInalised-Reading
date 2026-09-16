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
    return `（额度已用 ${quota.usedPct}%${reset}）`;
  }
  return `（今日额度还剩 ${quota.remaining}/${quota.limit} 次）`;
}

/** 把一次线路测试的结果说成一句人话。 */
export function describeLineTest(result: LineTest) {
  // 把额度信息一并报出来：一次小请求能过，不代表还够跑完一章。
  const quota = describeQuota(result.quota);
  if (result.ok) {
    return `线路可用：${result.model} 在 ${result.ms ?? '-'}ms 内返回「${result.reply || '正常'}」${quota}`;
  }
  return `线路不可用${result.status ? `（HTTP ${result.status}）` : ''}：${result.message || '未知原因'}${quota}`;
}
