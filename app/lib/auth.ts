import { env } from 'cloudflare:workers';
import { cookies } from 'next/headers';

export const SESSION_COOKIE = 'zhiji_session';
export const READER_COOKIE = 'reader_id';
const SESSION_DAYS = 30;
// Cloudflare Workers 的 WebCrypto 对 PBKDF2 有硬上限：迭代次数不能超过 100000。
const PBKDF2_ITERATIONS = 100_000;

export type Account = { id: string; email: string };

function toHex(value: ArrayBuffer | Uint8Array) {
  const bytes = value instanceof Uint8Array ? value : new Uint8Array(value);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

function randomHex(bytes: number) {
  const buffer = new Uint8Array(bytes);
  crypto.getRandomValues(buffer);
  return toHex(buffer);
}

async function sha256Hex(value: string) {
  return toHex(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)));
}

async function derive(password: string, salt: string) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', salt: new TextEncoder().encode(salt), iterations: PBKDF2_ITERATIONS, hash: 'SHA-256' }, key, 256);
  return toHex(bits);
}

function equalConstantTime(a: string, b: string) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export async function makePasswordHash(password: string) {
  const salt = randomHex(16);
  return `${salt}:${await derive(password, salt)}`;
}

export async function verifyPassword(password: string, stored: string) {
  const [salt, hash] = stored.split(':');
  if (!salt || !hash) return false;
  return equalConstantTime(await derive(password, salt), hash);
}

export async function createSession(userId: string) {
  const token = randomHex(32);
  const now = Date.now();
  await env.DB.prepare('INSERT INTO sessions (token_hash,user_id,created_at,expires_at) VALUES (?,?,?,?)')
    .bind(await sha256Hex(token), userId, now, now + SESSION_DAYS * 86_400_000)
    .run();
  return token;
}

export async function destroySession(token: string) {
  await env.DB.prepare('DELETE FROM sessions WHERE token_hash = ?').bind(await sha256Hex(token)).run();
}

export async function accountForSession(token: string): Promise<Account | null> {
  const row = await env.DB.prepare(
    'SELECT u.id AS id, u.email AS email, s.expires_at AS expiresAt FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token_hash = ?',
  )
    .bind(await sha256Hex(token))
    .first<{ id: string; email: string; expiresAt: number }>();
  if (!row) return null;
  if (row.expiresAt < Date.now()) {
    await destroySession(token);
    return null;
  }
  return { id: row.id, email: row.email };
}

export async function currentAccount(): Promise<Account | null> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  return token ? accountForSession(token) : null;
}

/** 把匿名身份（reader_id cookie）下的书架、章节和画像并到刚登录的账号上。 */
export async function adoptAnonymousData(userId: string, email: string, readerId: string | undefined) {
  if (!readerId) return;
  const anonymous = `anon:${readerId}`;
  await env.DB.batch([
    env.DB.prepare('UPDATE shelf_books SET user_id = ? WHERE user_id = ?').bind(userId, anonymous),
    env.DB.prepare('UPDATE adapted_chapters SET user_id = ? WHERE user_id = ?').bind(userId, anonymous),
  ]);
  const profile = await env.DB.prepare('SELECT goal,level,likes FROM reader_profiles WHERE user_id = ?')
    .bind(anonymous)
    .first<{ goal: string; level: string; likes: string }>();
  if (profile) {
    await env.DB.batch([
      env.DB.prepare('INSERT OR REPLACE INTO reader_profiles (user_id,email,goal,level,likes,updated_at) VALUES (?,?,?,?,?,?)')
        .bind(userId, email, profile.goal, profile.level, profile.likes, Date.now()),
      env.DB.prepare('DELETE FROM reader_profiles WHERE user_id = ?').bind(anonymous),
    ]);
  }
}

export function sessionCookieOptions() {
  return { httpOnly: true, secure: true, sameSite: 'lax' as const, path: '/', maxAge: SESSION_DAYS * 86_400 };
}
