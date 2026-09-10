import { env } from 'cloudflare:workers';
import { getChatGPTUser } from '../../chatgpt-auth';

const ALLOWED_SOURCES = new Set([
  'openlibrary.org',
  'www.gutenberg.org',
  'zh.wikisource.org',
  'en.wikisource.org',
  'standardebooks.org',
  'archive.org',
  'librivox.org',
]);

export async function GET() {
  const user = await getChatGPTUser();
  if (!user) return Response.json({ error: '请先登录' }, { status: 401 });
  const result = await env.DB.prepare(
    'SELECT id,title,source,source_url AS sourceUrl,size,progress,status,created_at AS createdAt FROM shelf_books WHERE user_id = ? ORDER BY created_at DESC',
  )
    .bind(user.userId)
    .all();
  return Response.json(
    { books: result.results },
    { headers: { 'cache-control': 'private, no-store' } },
  );
}

export async function POST(request: Request) {
  const user = await getChatGPTUser();
  if (!user) return Response.json({ error: '请先登录' }, { status: 401 });

  const contentType = request.headers.get('content-type') || '';
  if (!contentType.includes('application/json')) {
    return Response.json(
      { error: 'PDF 导入暂时暂停。请先从书库或搜索页选择公版名著生成改写。' },
      { status: 400 },
    );
  }

  if (contentType.includes('application/json')) {
    const body = (await request.json()) as {
      title?: string;
      sourceUrl?: string;
    };
    const title = body.title?.trim().slice(0, 180);
    const sourceUrl = body.sourceUrl?.trim().slice(0, 500);
    if (!title || !sourceUrl)
      return Response.json({ error: '缺少书名或来源' }, { status: 400 });

    let source: URL;
    try {
      source = new URL(sourceUrl);
    } catch {
      return Response.json({ error: '来源地址无效' }, { status: 400 });
    }
    if (!ALLOWED_SOURCES.has(source.hostname))
      return Response.json({ error: '暂不支持这个来源' }, { status: 400 });

    const existing = await env.DB.prepare(
      'SELECT id,title,source,source_url AS sourceUrl,size,progress,status,created_at AS createdAt FROM shelf_books WHERE user_id = ? AND source_url = ? LIMIT 1',
    )
      .bind(user.userId, source.href)
      .first();
    if (existing) return Response.json({ book: existing, alreadySaved: true });

    const id = crypto.randomUUID();
    const now = Date.now();
    await env.DB.prepare(
      'INSERT INTO shelf_books (id,user_id,title,source,source_url,file_key,content_type,size,progress,status,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)',
    )
      .bind(
        id,
        user.userId,
        title,
        source.hostname,
        source.href,
        null,
        'text/html',
        0,
        0,
        '正在阅读',
        now,
      )
      .run();

    return Response.json(
      {
        book: {
          id,
          title,
          source: source.hostname,
          sourceUrl: source.href,
          size: 0,
          progress: 0,
          status: '正在阅读',
          createdAt: now,
        },
      },
      { status: 201 },
    );
  }
}

export async function DELETE(request: Request) {
  const user = await getChatGPTUser();
  if (!user) return Response.json({ error: '请先登录' }, { status: 401 });
  const id = new URL(request.url).searchParams.get('id');
  if (!id) return Response.json({ error: '缺少书籍编号' }, { status: 400 });
  const book = await env.DB.prepare(
    'SELECT file_key AS fileKey FROM shelf_books WHERE id = ? AND user_id = ? LIMIT 1',
  ).bind(id, user.userId).first<{ fileKey?: string | null }>();
  if (!book) return Response.json({ error: '没有找到这本书' }, { status: 404 });
  await env.DB.prepare('DELETE FROM shelf_books WHERE id = ? AND user_id = ?')
    .bind(id, user.userId).run();
  return Response.json({ removed: true });
}
