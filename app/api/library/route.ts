import { env } from 'cloudflare:workers';
import { getChatGPTUser } from '../../chatgpt-auth';

const MAX_UPLOAD_BYTES = 40 * 1024 * 1024;

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
    // 导入电子书不需要上传原始二进制：正文已由浏览器端抽取。见下面的 action=import。
    return Response.json({ error: '请改用 JSON 提交导入内容（正文已在本地抽取，无需上传原文件）' }, { status: 415 });
  }

  if (contentType.includes('application/json')) {
    const body = (await request.json()) as {
      action?: string;
      title?: string;
      sourceUrl?: string;
      extractedText?: string;
      fileName?: string;
      size?: number;
      mimeType?: string;
    };

    if (body.action === 'import') {
      const extractedText = typeof body.extractedText === 'string' ? body.extractedText : '';
      if (extractedText.replace(/\s/g, '').length < 500)
        return Response.json({ error: '没有识别到足够正文；扫描版 PDF 暂时需要先做文字识别' }, { status: 422 });
      const size = Number(body.size) || 0;
      if (size > MAX_UPLOAD_BYTES)
        return Response.json({ error: `文件超过 ${Math.round(MAX_UPLOAD_BYTES / 1024 / 1024)}MB 上限` }, { status: 413 });

      const title = (body.title || body.fileName || '').replace(/\.[^.]+$/, '').trim().slice(0, 180) || '导入的书';
      const id = crypto.randomUUID();
      const now = Date.now();
      const sourceUrl = `upload:${id}`;
      await env.DB.prepare(
        'INSERT INTO shelf_books (id,user_id,title,source,source_url,file_key,content_type,extracted_text,size,progress,status,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)',
      )
        .bind(id, user.userId, title, '导入', sourceUrl, null, body.mimeType?.slice(0, 120) || 'text/plain', extractedText.slice(0, 400_000), size, 0, '正在阅读', now)
        .run();

      return Response.json({
        book: { id, title, source: '导入', sourceUrl, size, progress: 0, status: '正在阅读', createdAt: now },
        readUrl: `/adapt?title=${encodeURIComponent(title)}&source=${encodeURIComponent(sourceUrl)}`,
      });
    }

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
