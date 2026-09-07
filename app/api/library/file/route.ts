import { env } from 'cloudflare:workers';
import { getChatGPTUser } from '../../../chatgpt-auth';

export async function GET(request: Request) {
  const user = await getChatGPTUser();
  if (!user) return new Response('请先登录', { status: 401 });
  const id = new URL(request.url).searchParams.get('id');
  if (!id) return new Response('缺少书籍编号', { status: 400 });
  const row = await env.DB.prepare(
    'SELECT file_key AS fileKey,title,content_type AS contentType FROM shelf_books WHERE id = ? AND user_id = ? AND file_key IS NOT NULL',
  )
    .bind(id, user.userId)
    .first<{ fileKey: string; title: string; contentType: string }>();
  if (!row) return new Response('没有找到这本书', { status: 404 });
  const object = await env.FILES.get(row.fileKey);
  if (!object) return new Response('文件不存在', { status: 404 });
  // Infer correct content-type from file extension if stored type is generic
  let contentType = row.contentType || 'application/octet-stream';
  if (contentType === 'application/octet-stream' || !contentType.includes('/')) {
    if (row.fileKey?.endsWith('.pdf')) contentType = 'application/pdf';
    else if (row.fileKey?.endsWith('.epub')) contentType = 'application/epub+zip';
    else if (row.fileKey?.endsWith('.txt')) contentType = 'text/plain; charset=utf-8';
  }
  return new Response(object.body, {
    headers: {
      'content-type': contentType,
      'content-disposition': 'inline',
      'cache-control': 'private, max-age=300',
    },
  });
}
