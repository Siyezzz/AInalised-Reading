import { env } from 'cloudflare:workers';
import { cookies } from 'next/headers';
import {
  READER_COOKIE,
  SESSION_COOKIE,
  accountForSession,
  adoptAnonymousData,
  createSession,
  destroySession,
  makePasswordHash,
  sessionCookieOptions,
  verifyPassword,
} from '../../lib/auth';

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

export async function GET() {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  const account = token ? await accountForSession(token) : null;
  return Response.json({ account }, { headers: { 'cache-control': 'private, no-store' } });
}

export async function POST(request: Request) {
  let body: { action?: string; email?: string; password?: string };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return Response.json({ error: '请求格式不对' }, { status: 400 });
  }
  const store = await cookies();

  if (body.action === 'logout') {
    const token = store.get(SESSION_COOKIE)?.value;
    if (token) await destroySession(token);
    store.delete(SESSION_COOKIE);
    return Response.json({ ok: true }, { headers: { 'cache-control': 'private, no-store' } });
  }

  const email = body.email?.trim().toLowerCase() || '';
  const password = body.password || '';
  if (!EMAIL_RE.test(email)) return Response.json({ error: '邮箱格式不对' }, { status: 400 });
  if (password.length < 8) return Response.json({ error: '密码至少 8 位' }, { status: 400 });

  if (body.action === 'register') {
    const existing = await env.DB.prepare('SELECT id FROM users WHERE email = ?').bind(email).first();
    if (existing) return Response.json({ error: '这个邮箱已经注册过，直接登录就行' }, { status: 409 });
    const userId = crypto.randomUUID();
    await env.DB.prepare('INSERT INTO users (id,email,password_hash,created_at) VALUES (?,?,?,?)')
      .bind(userId, email, await makePasswordHash(password), Date.now())
      .run();
    return signIn(store, userId, email);
  }

  if (body.action === 'login') {
    const user = await env.DB.prepare('SELECT id, password_hash AS passwordHash FROM users WHERE email = ?')
      .bind(email)
      .first<{ id: string; passwordHash: string }>();
    if (!user || !(await verifyPassword(password, user.passwordHash))) {
      return Response.json({ error: '邮箱或密码不对' }, { status: 401 });
    }
    return signIn(store, user.id, email);
  }

  return Response.json({ error: '未知操作' }, { status: 400 });
}

async function signIn(store: Awaited<ReturnType<typeof cookies>>, userId: string, email: string) {
  const token = await createSession(userId);
  store.set(SESSION_COOKIE, token, sessionCookieOptions());
  await adoptAnonymousData(userId, email, store.get(READER_COOKIE)?.value);
  return Response.json({ account: { id: userId, email } });
}
