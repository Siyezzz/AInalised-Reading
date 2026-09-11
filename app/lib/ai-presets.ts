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
  { id: 'groq', name: 'Groq', baseUrl: 'https://api.groq.com/openai/v1', model: 'qwen/qwen3.8-27b', note: '免费额度，速度最快，推荐先试', keyUrl: 'https://console.groq.com/keys', free: true },
  { id: 'gemini', name: 'Google Gemini', baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai', model: 'gemini-2.5-flash', note: 'AI Studio 免费额度，性价比高', keyUrl: 'https://aistudio.google.com/apikey', free: true },
  { id: 'openrouter', name: 'OpenRouter', baseUrl: 'https://openrouter.ai/api/v1', model: 'deepseek/deepseek-chat-v3.1:free', note: '带 :free 后缀的模型可免费调用', keyUrl: 'https://openrouter.ai/keys', free: true },
  { id: 'siliconflow', name: '硅基流动', baseUrl: 'https://api.siliconflow.cn/v1', model: 'Qwen/Qwen2.5-72B-Instruct', note: '国内网络直连，注册送额度', keyUrl: 'https://cloud.siliconflow.cn/account/ak', free: true },
  { id: 'deepseek', name: 'DeepSeek', baseUrl: 'https://api.deepseek.com/v1', model: 'deepseek-chat', note: '便宜，中文和长文本成本低', keyUrl: 'https://platform.deepseek.com/api_keys' },
  { id: 'moonshot', name: 'Moonshot Kimi', baseUrl: 'https://api.moonshot.cn/v1', model: 'kimi-k2-0711-preview', note: '中文长文本可试', keyUrl: 'https://platform.moonshot.cn/console/api-keys' },
  { id: 'openai', name: 'OpenAI', baseUrl: 'https://api.openai.com/v1', model: 'gpt-4.1-mini', note: '稳定，通常需要付费余额', keyUrl: 'https://platform.openai.com/api-keys' },
  { id: 'together', name: 'Together AI', baseUrl: 'https://api.together.xyz/v1', model: 'meta-llama/Llama-3.3-70B-Instruct-Turbo', note: '常见开源大模型接口', keyUrl: 'https://api.together.xyz/settings/api-keys' },
  { id: 'custom', name: '自定义 OpenAI-compatible', baseUrl: '', model: '', note: '填供应商给你的 /v1 地址和模型名' },
];

export const AI_SETTINGS_KEY = 'zhiji-ai-settings';
export const AI_SETUP_DONE_KEY = 'zhiji-ai-setup-done';

export type AiSettings = {
  aiProvider?: string;
  apiBaseUrl?: string;
  apiModel?: string;
  apiKey?: string;
};

export function readAiSettings(): AiSettings {
  try {
    return JSON.parse(localStorage.getItem(AI_SETTINGS_KEY) || '{}') as AiSettings;
  } catch {
    return {};
  }
}
