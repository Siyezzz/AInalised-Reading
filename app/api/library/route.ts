import { env } from 'cloudflare:workers';
import { getChatGPTUser } from '../../chatgpt-auth';

export async function GET() {
  const user = await getChatGPTUser();
  if (!user) return Response.json({ error: '请先登录' }, { status: 401 });
  const result = await env.DB.prepare(
    'SELECT id,title,source,size,progress,status,created_at AS createdAt FROM shelf_books WHERE user_id = ? ORDER BY created_at DESC',
  )
    .bind(user.userId)
    .all();
  return Response.json({ books: result.results });
}

export async function POST(request: Request) {
  const user = await getChatGPTUser();
  if (!user) return Response.json({ error: '请先登录' }, { status: 401 });
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
      'INSERT INTO shelf_books (id,user_id,title,source,file_key,content_type,size,progress,status,created_at) VALUES (?,?,?,?,?,?,?,?,?,?)',
    )
      .bind(
        id,
        user.userId,
        safeTitle,
        '个人 PDF',
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
