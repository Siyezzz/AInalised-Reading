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
    const sourceUrl = body.sourceUrl?.trim().slice(0, 500);
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
  const extractedText = form.get('extractedText');
  if (!file || typeof file !== 'object' || !('name' in file)) {
    return Response.json({ error: '请选择电子书文件' }, { status: 400 });
  }
  const extension = (file as File).name.toLowerCase().match(/\.(pdf|epub|mobi|azw3|kf8|txt)$/)?.[1];
  if (!extension) return Response.json({ error: '支持 PDF、EPUB、MOBI、AZW3 和 TXT' }, { status: 400 });
  if ((file as File).size > 25 * 1024 * 1024)
    return Response.json({ error: '文件不能超过 25MB' }, { status: 400 });
  const hasText = typeof extractedText === 'string' && extractedText.trim().length >= 500;
  const id = crypto.randomUUID();
  const safeTitle = (file as File).name.replace(/\.(pdf|epub|mobi|azw3|kf8|txt)$/i, '').trim() || '未命名书籍';
  const key = `${user.userId}/${id}.${extension}`;
  await env.FILES.put(key, (file as File).stream(), {
    httpMetadata: { contentType: (file as File).type || 'application/octet-stream' },
    customMetadata: { owner: user.userId, originalName: (file as File).name },
  });
  if (hasText) {
    const textKey = `${key}.chapter.txt`;
    await env.FILES.put(textKey, (extractedText as string).trim().slice(0, 80_000), {
      httpMetadata: { contentType: 'text/plain; charset=utf-8' },
      customMetadata: { owner: user.userId, purpose: 'first-chapter-source' },
    });
  }
  const sourceUrlForUpload = `upload:${id}`;
  const status = hasText ? '第一章已准备' : '已导入，待提取正文';
  try {
    await env.DB.prepare(
      'INSERT INTO shelf_books (id,user_id,title,source,source_url,file_key,content_type,size,progress,status,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)',
    )
      .bind(
        id,
        user.userId,
        safeTitle,
        `个人 ${extension.toUpperCase()}`,
        sourceUrlForUpload,
        key,
        (file as File).type || 'application/octet-stream',
        (file as File).size,
        0,
        status,
        Date.now(),
      )
      .run();
  } catch (error) {
    await env.FILES.delete(key);
    throw error;
  }
  return Response.json(
    {
      readUrl: hasText ? `/adapt?title=${encodeURIComponent(safeTitle)}&source=${encodeURIComponent(sourceUrlForUpload)}` : `/pdf?id=${encodeURIComponent(id)}&title=${encodeURIComponent(safeTitle)}`,
      book: {
        id,
        title: safeTitle,
        source: `个人 ${extension.toUpperCase()}`,
        size: (file as File).size,
        progress: 0,
        status,
        createdAt: Date.now(),
      },
    },
    { status: 201, headers: { 'x-read-url': `/adapt?title=${encodeURIComponent(safeTitle)}&source=${encodeURIComponent(sourceUrlForUpload)}` } },
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
  if (book.fileKey) await Promise.all([env.FILES.delete(book.fileKey), env.FILES.delete(`${book.fileKey}.chapter.txt`)]);
  return Response.json({ removed: true });
}
