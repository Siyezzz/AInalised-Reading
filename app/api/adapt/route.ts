import { env } from 'cloudflare:workers';
import { getChatGPTUser } from '../../chatgpt-auth';

type RuntimeEnv = typeof env & { EDITOR_URL?: string; EDITOR_SECRET?: string };

export async function POST(request: Request) {
  const user = await getChatGPTUser();
  if (!user) return Response.json({ error: '请先登录' }, { status: 401 });
  const body = await request.json() as { title?: string; sourceUrl?: string; feedback?: string; wrongAnswerType?: string };
  const title = body.title?.trim().slice(0, 180);
  const sourceUrl = body.sourceUrl?.trim().slice(0, 500);
  if (!title || !sourceUrl) return Response.json({ error: '缺少书名或来源' }, { status: 400 });
  const profile = await env.DB.prepare('SELECT goal,level,likes FROM reader_profiles WHERE user_id = ?').bind(user.userId).first<{ goal: string; level: string; likes: string }>();
  const normalizedProfile = { goal: profile?.goal || '读懂故事', level: profile?.level || '平时会读一些', likes: profile ? JSON.parse(profile.likes) : [] };
  const signatureInput = JSON.stringify({ normalizedProfile, feedback: body.feedback || '', wrongAnswerType: body.wrongAnswerType || '' });
  const hashBytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(signatureInput));
  const profileHash = Array.from(new Uint8Array(hashBytes), (b) => b.toString(16).padStart(2, '0')).join('');
  const cached = await env.DB.prepare('SELECT content FROM adapted_chapters WHERE user_id = ? AND title = ? AND source_url = ? AND profile_hash = ? LIMIT 1').bind(user.userId, title, sourceUrl, profileHash).first<{ content: string }>();
  if (cached) return Response.json({ content: JSON.parse(cached.content), cached: true });
  const runtime = env as RuntimeEnv;
  if (!runtime.EDITOR_URL || !runtime.EDITOR_SECRET) return Response.json({ error: '生成服务尚未配置' }, { status: 503 });
  const response = await fetch(runtime.EDITOR_URL, { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${runtime.EDITOR_SECRET}` }, body: JSON.stringify({ title, profile: normalizedProfile, feedback: body.feedback, wrongAnswerType: body.wrongAnswerType }) });
  const result = await response.json() as { content?: unknown; message?: string };
  if (!response.ok || !result.content) return Response.json({ error: result.message || '这一章暂时没有准备好' }, { status: response.status });
  await env.DB.prepare('INSERT OR REPLACE INTO adapted_chapters (id,user_id,title,source_url,profile_hash,content,created_at) VALUES (?,?,?,?,?,?,?)').bind(crypto.randomUUID(), user.userId, title, sourceUrl, profileHash, JSON.stringify(result.content), Date.now()).run();
  return Response.json({ content: result.content, cached: false });
}
