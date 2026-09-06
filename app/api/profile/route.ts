import { env } from 'cloudflare:workers';
import { getChatGPTUser } from '../../chatgpt-auth';

export async function GET() {
  const user = await getChatGPTUser();
  if (!user) return Response.json({ user: null });
  const row = await env.DB.prepare(
    'SELECT goal,level,likes FROM reader_profiles WHERE user_id = ?',
  )
    .bind(user.userId)
    .first<{ goal: string; level: string; likes: string }>();
  return Response.json({
    user: { email: user.email, displayName: user.displayName },
    profile: row ? { ...row, likes: JSON.parse(row.likes) } : null,
  });
}

export async function POST(request: Request) {
  const user = await getChatGPTUser();
  if (!user) return Response.json({ error: '请先登录' }, { status: 401 });
  const body = (await request.json()) as {
    goal?: string;
    level?: string;
    likes?: string[];
  };
  const goal = body.goal || '读懂故事',
    level = body.level || '平时会读一些',
    likes = JSON.stringify(
      Array.isArray(body.likes) ? body.likes.slice(0, 12) : [],
    ),
    now = Date.now();
  await env.DB.prepare(
    'INSERT INTO reader_profiles (user_id,email,goal,level,likes,updated_at) VALUES (?,?,?,?,?,?) ON CONFLICT(user_id) DO UPDATE SET email=excluded.email,goal=excluded.goal,level=excluded.level,likes=excluded.likes,updated_at=excluded.updated_at',
  )
    .bind(user.userId, user.email, goal, level, likes, now)
    .run();
  return Response.json({ ok: true });
}
