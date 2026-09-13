import { env } from 'cloudflare:workers';
import { getChatGPTUser } from '../../chatgpt-auth';

type RuntimeEnv = typeof env & { EDITOR_URL?: string; EDITOR_SECRET?: string };

const TEST_TITLE = '线路测试';
function bytesToBase64Url(bytes: Uint8Array) { let binary = ''; for (const byte of bytes) binary += String.fromCharCode(byte); return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); }
async function sign(payload: string, secret: string) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return bytesToBase64Url(new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(payload))));
}

/**
 * 「测试这条线路」的取票口：只签一张短票据，真正的测试请求由浏览器直接打给 AI Worker。
 * 之所以不在这里代发：同一个 zone 下让 Worker 去 fetch 另一个 Worker 会被 Cloudflare 拦下，
 * 和 /api/adapt 保持同一种形状最稳。要求登录，否则这个接口就是给别人白用的出网通道。
 */
export async function POST() {
  const user = await getChatGPTUser();
  if (!user) return Response.json({ ok: false, message: '请先登录，再测试线路。' }, { status: 401 });
  const runtime = env as RuntimeEnv;
  if (!runtime.EDITOR_URL || !runtime.EDITOR_SECRET) return Response.json({ ok: false, message: '生成服务尚未配置。' }, { status: 503 });
  const payload = bytesToBase64Url(new TextEncoder().encode(JSON.stringify({ title: TEST_TITLE, uid: user.userId, exp: Date.now() + 5 * 60_000 })));
  return Response.json({ editorUrl: runtime.EDITOR_URL, title: TEST_TITLE, token: `v1.${payload}.${await sign(payload, runtime.EDITOR_SECRET)}` });
}
