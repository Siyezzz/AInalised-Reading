import { env } from 'cloudflare:workers';
import { getChatGPTUser } from '../../chatgpt-auth';

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
  if (request.headers.get('content-type')?.includes('application/json')) {
    const body = (await request.json()) as {
      title?: string;
      sourceUrl?: string;
    };
    const title = body.title?.trim().slice(0, 180);
    const sourceUrl = body.sourceUrl?.trim();
    if (!title || !sourceUrl)
      return Response.json({ error: '缺少书名或来源' }, { status: 400 });
    let source: URL;
    try {
      source = new URL(sourceUrl);
    } catch {
      return Response.json({ error: '来源地址无效' }, { status: 400 });
    }
    if (
      ![
        'openlibrary.org',
        'www.gutenberg.org',
        'zh.wikisource.org',
        'standardebooks.org',
        'archive.org',
        'librivox.org',
      ].includes(source.hostname)
    )
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
  const form = await request.formData();
  const file = form.get('file');
  if (!(file instanceof File))
    return Response.json({ error: '请选择 PDF 文件' }, { status: 400 });
  if (
    file.type !== 'application/pdf' &&
    !file.name.toLowerCase().endsWith('.pdf')
  )
    return Response.json({ error: '目前只支持 PDF' }, { status: 400 });
  if (file.size > 25 * 1024 * 1024)
    return Response.json({ error: 'PDF 不能超过 25MB' }, { status: 400 });
  const id = crypto.randomUUID();
  const safeTitle = file.name.replace(/\.pdf$/i, '').trim() || '未命名书籍';
  const key = `${user.userId}/${id}.pdf`;
  await env.FILES.put(key, file.stream(), {
    httpMetadata: { contentType: 'application/pdf' },
    customMetadata: { owner: user.userId, originalName: file.name },
  });
  try {
    await env.DB.prepare(
      'INSERT INTO shelf_books (id,user_id,title,source,source_url,file_key,content_type,size,progress,status,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)',
    )
      .bind(
        id,
        user.userId,
        safeTitle,
        '个人 PDF',
        null,
        key,
        'application/pdf',
        file.size,
        0,
        '等待准备',
        Date.now(),
      )
      .run();
  } catch (error) {
    await env.FILES.delete(key);
    throw error;
  }
  return Response.json(
    {
      book: {
        id,
        title: safeTitle,
        source: '个人 PDF',
        size: file.size,
        progress: 0,
        status: '等待准备',
        createdAt: Date.now(),
      },
    },
    { status: 201 },
  );
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
  if (book.fileKey) await env.FILES.delete(book.fileKey);
  return Response.json({ removed: true });
}
