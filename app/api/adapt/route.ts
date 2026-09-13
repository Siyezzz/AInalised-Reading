import { env } from 'cloudflare:workers';
import { getChatGPTUser } from '../../chatgpt-auth';

type RuntimeEnv = typeof env & { EDITOR_URL?: string; EDITOR_SECRET?: string };
type Body = { title?: string; sourceUrl?: string; chapterNumber?: number; fresh?: boolean; feedback?: string; wrongAnswerType?: string; action?: string; content?: unknown; token?: string };
function bytesToBase64Url(bytes: Uint8Array) { let binary = ''; for (const byte of bytes) binary += String.fromCharCode(byte); return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); }
function base64UrlToBytes(value: string) { const binary = atob(value.replace(/-/g, '+').replace(/_/g, '/')); return Uint8Array.from(binary, (c) => c.charCodeAt(0)); }
async function sign(payload: string, secret: string) { const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']); return bytesToBase64Url(new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(payload)))); }
async function verifyToken(token: string, secret: string, title: string) { const [version, payload, signature] = token.split('.'); if (version !== 'v1' || !payload || !signature || await sign(payload, secret) !== signature) return false; try { const data = JSON.parse(new TextDecoder().decode(base64UrlToBytes(payload))) as { title?: string; exp?: number }; return data.title === title && Number(data.exp) > Date.now(); } catch { return false; } }
// pipeline 是缓存指纹的一部分。旧版本（pipeline 4）曾经在生成失败时把一段
// 「本章改写未完成」的模板话当成成果存进缓存，读者之后每次打开都命中它、
// 永远看到同一句废话，重试也没有用。改成 5 之后旧记录不再匹配，会重新生成。
async function profileAndHash(userId: string, chapterNumber = 1, feedback = '', wrongAnswerType = '') { const profile = await env.DB.prepare('SELECT goal,level,likes FROM reader_profiles WHERE user_id = ?').bind(userId).first<{ goal: string; level: string; likes: string }>(); const normalizedProfile = { goal: profile?.goal || '读懂故事', level: profile?.level || '平时会读一些', likes: profile ? JSON.parse(profile.likes) : [] }; const input = JSON.stringify({ pipeline: 5, chapterNumber, normalizedProfile, feedback, wrongAnswerType }); const hash = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input))), (b) => b.toString(16).padStart(2, '0')).join(''); return { normalizedProfile, hash }; }
const PLACEHOLDER_PATTERN = /未通过检查|没有稳定返回|请稍后刷新|本章改写未完成|暂时无法生成|改写未完成|换用个人/;
/** 是不是一段「生成失败」的模板话，而不是真的改写。 */
function looksLikePlaceholder(value: unknown) {
  const chapter = (value as { chapter?: unknown })?.chapter;
  if (!Array.isArray(chapter)) return false;
  const text = chapter.filter((p): p is string => typeof p === 'string').join('').replace(/\s/g, '');
  // 真改写要求 4 段以上、每段 90-190 字，短于 200 字不可能是正文。
  return PLACEHOLDER_PATTERN.test(text) || text.length < 200;
}
function validContent(value: unknown) { const x = value as { chapter?: unknown; quiz?: { options?: unknown } }; return Boolean(x && Array.isArray(x.chapter) && x.chapter.length >= 4 && x.quiz && Array.isArray(x.quiz.options) && x.quiz.options.length === 4) && !looksLikePlaceholder(value); }

export async function POST(request: Request) {
  const user = await getChatGPTUser(); if (!user) return Response.json({ error: '请先登录' }, { status: 401 });
  const body = await request.json() as Body; const title = body.title?.trim().slice(0, 180); const sourceUrl = body.sourceUrl?.trim().slice(0, 500);
  if (!title || !sourceUrl) return Response.json({ error: '缺少书名或来源' }, { status: 400 });
  const chapterNumber = Math.max(1, Math.min(200, Math.trunc(Number(body.chapterNumber) || 1)));
  const runtime = env as RuntimeEnv; if (!runtime.EDITOR_URL || !runtime.EDITOR_SECRET) return Response.json({ error: '生成服务尚未配置' }, { status: 503 });
  const { normalizedProfile, hash } = await profileAndHash(user.userId, chapterNumber, body.feedback, body.wrongAnswerType);
  if (body.action === 'cache') {
    if (!body.token || !(await verifyToken(body.token, runtime.EDITOR_SECRET, title)) || !validContent(body.content)) return Response.json({ error: '生成结果无法验证' }, { status: 400 });
    await env.DB.prepare('INSERT OR REPLACE INTO adapted_chapters (id,user_id,title,source_url,profile_hash,content,created_at) VALUES (?,?,?,?,?,?,?)').bind(crypto.randomUUID(), user.userId, title, sourceUrl, hash, JSON.stringify(body.content), Date.now()).run();
    return Response.json({ saved: true });
  }
  const cached = body.fresh ? null : await env.DB.prepare('SELECT content FROM adapted_chapters WHERE user_id = ? AND title = ? AND source_url = ? AND profile_hash = ? LIMIT 1').bind(user.userId, title, sourceUrl, hash).first<{ content: string }>();
  if (cached) {
    try {
      const content = JSON.parse(cached.content) as unknown;
      if (validContent(content)) return Response.json({ content, cached: true });
    } catch { /* 老记录解不开就当作没有缓存 */ }
    // 命中一条不可用的旧缓存：删掉它，让这次请求继续往下走真实生成，
    // 否则读者会一直卡在同一句模板话上，重试多少次都一样。
    await env.DB.prepare('DELETE FROM adapted_chapters WHERE user_id = ? AND title = ? AND source_url = ? AND profile_hash = ?').bind(user.userId, title, sourceUrl, hash).run();
  }
  const payload = bytesToBase64Url(new TextEncoder().encode(JSON.stringify({ title, uid: user.userId, exp: Date.now() + 60 * 60_000 })));
  const token = `v1.${payload}.${await sign(payload, runtime.EDITOR_SECRET)}`;
  if (sourceUrl.startsWith('upload:')) {
    // 导入的书没有可抓取的来源地址：正文在导入时已由浏览器抽取并随书架行保存。
    const row = await env.DB.prepare(
      'SELECT title,extracted_text AS extractedText FROM shelf_books WHERE user_id = ? AND source_url = ? LIMIT 1',
    )
      .bind(user.userId, sourceUrl)
      .first<{ title: string; extractedText: string | null }>();
    if (!row?.extractedText) return Response.json({ error: '这本书没有可用的正文，请回到书架重新导入一次。' }, { status: 409 });
    return Response.json({ editorUrl: runtime.EDITOR_URL, token, profile: normalizedProfile, sourceText: row.extractedText }, { status: 202 });
  }
  return Response.json({ editorUrl: runtime.EDITOR_URL, token, profile: normalizedProfile }, { status: 202 });
}
