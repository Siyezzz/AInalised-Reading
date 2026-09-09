import { env } from 'cloudflare:workers';
import { getChatGPTUser } from '../../chatgpt-auth';

type RuntimeEnv = typeof env & { EDITOR_URL?: string; EDITOR_SECRET?: string };
type Body = { title?: string; sourceUrl?: string; feedback?: string; wrongAnswerType?: string; action?: string; content?: unknown; token?: string };
function bytesToBase64Url(bytes: Uint8Array) { let binary = ''; for (const byte of bytes) binary += String.fromCharCode(byte); return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); }
function base64UrlToBytes(value: string) { const binary = atob(value.replace(/-/g, '+').replace(/_/g, '/')); return Uint8Array.from(binary, (c) => c.charCodeAt(0)); }
async function sign(payload: string, secret: string) { const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']); return bytesToBase64Url(new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(payload)))); }
async function verifyToken(token: string, secret: string, title: string) { const [version, payload, signature] = token.split('.'); if (version !== 'v1' || !payload || !signature || await sign(payload, secret) !== signature) return false; try { const data = JSON.parse(new TextDecoder().decode(base64UrlToBytes(payload))) as { title?: string; exp?: number }; return data.title === title && Number(data.exp) > Date.now(); } catch { return false; } }
async function profileAndHash(userId: string, feedback = '', wrongAnswerType = '') { const profile = await env.DB.prepare('SELECT goal,level,likes FROM reader_profiles WHERE user_id = ?').bind(userId).first<{ goal: string; level: string; likes: string }>(); const normalizedProfile = { goal: profile?.goal || '读懂故事', level: profile?.level || '平时会读一些', likes: profile ? JSON.parse(profile.likes) : [] }; const input = JSON.stringify({ pipeline: 2, normalizedProfile, feedback, wrongAnswerType }); const hash = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input))), (b) => b.toString(16).padStart(2, '0')).join(''); return { normalizedProfile, hash }; }
function validContent(value: unknown) { const x = value as { chapter?: unknown; quiz?: { options?: unknown } }; return Boolean(x && Array.isArray(x.chapter) && x.chapter.length >= 4 && x.quiz && Array.isArray(x.quiz.options) && x.quiz.options.length === 4); }

export async function POST(request: Request) {
  const user = await getChatGPTUser(); if (!user) return Response.json({ error: '请先登录' }, { status: 401 });
  const body = await request.json() as Body; const title = body.title?.trim().slice(0, 180); const sourceUrl = body.sourceUrl?.trim().slice(0, 500);
  if (!title || !sourceUrl) return Response.json({ error: '缺少书名或来源' }, { status: 400 });
  const runtime = env as RuntimeEnv; if (!runtime.EDITOR_URL || !runtime.EDITOR_SECRET) return Response.json({ error: '生成服务尚未配置' }, { status: 503 });
  const { normalizedProfile, hash } = await profileAndHash(user.userId, body.feedback, body.wrongAnswerType);
  if (body.action === 'cache') {
    if (!body.token || !(await verifyToken(body.token, runtime.EDITOR_SECRET, title)) || !validContent(body.content)) return Response.json({ error: '生成结果无法验证' }, { status: 400 });
    await env.DB.prepare('INSERT OR REPLACE INTO adapted_chapters (id,user_id,title,source_url,profile_hash,content,created_at) VALUES (?,?,?,?,?,?,?)').bind(crypto.randomUUID(), user.userId, title, sourceUrl, hash, JSON.stringify(body.content), Date.now()).run();
    return Response.json({ saved: true });
  }
  const cached = await env.DB.prepare('SELECT content FROM adapted_chapters WHERE user_id = ? AND title = ? AND source_url = ? AND profile_hash = ? LIMIT 1').bind(user.userId, title, sourceUrl, hash).first<{ content: string }>();
  if (cached) return Response.json({ content: JSON.parse(cached.content), cached: true });
  if (sourceUrl.startsWith('upload:')) {
    return Response.json({ error: '本地上传已关闭，请从发现页导入公开来源的书籍。' }, { status: 400 });
  }
  const payload = bytesToBase64Url(new TextEncoder().encode(JSON.stringify({ title, uid: user.userId, exp: Date.now() + 60 * 60_000 })));
  const token = `v1.${payload}.${await sign(payload, runtime.EDITOR_SECRET)}`;
  return Response.json({ editorUrl: runtime.EDITOR_URL, token, profile: normalizedProfile, sourceText }, { status: 202 });
}
