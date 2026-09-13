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
 * 「测试这条线路」：把读者填的 Base URL / 模型 / key 原样转发给 AI Worker 打一次最小请求。
 * 站点不保存 key，只做一次转发。要求登录，否则这个接口会变成任何人都能用的出网代理。
 * 票据的 title 必须与请求体的 title 一致，否则 AI Worker 会判 UNAUTHORIZED。
 */
export async function POST(request: Request) {
  const user = await getChatGPTUser();
  if (!user) return Response.json({ ok: false, message: '请先登录，再测试线路。' }, { status: 401 });
  const runtime = env as RuntimeEnv;
  if (!runtime.EDITOR_URL || !runtime.EDITOR_SECRET) return Response.json({ ok: false, message: '生成服务尚未配置。' }, { status: 503 });
  const body = await request.json() as Record<string, unknown>;
  const payload = bytesToBase64Url(new TextEncoder().encode(JSON.stringify({ title: TEST_TITLE, uid: user.userId, exp: Date.now() + 5 * 60_000 })));
  const token = `v1.${payload}.${await sign(payload, runtime.EDITOR_SECRET)}`;
  try {
    const response = await fetch(runtime.EDITOR_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
      body: JSON.stringify({ title: TEST_TITLE, action: 'test-line', ...body }),
    });
    return Response.json(await response.json(), { status: response.ok ? 200 : response.status });
  } catch {
    return Response.json({ ok: false, message: '没能联系上改写服务，请稍后再试。' }, { status: 502 });
  }
}
