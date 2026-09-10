import { getChatGPTUser } from '../../../chatgpt-auth';
import { env } from 'cloudflare:workers';

export async function GET(request: Request) {
  const user = await getChatGPTUser();
  if (!user) return new Response('请先登录', { status: 401 });
  const id = new URL(request.url).searchParams.get('id');
  if (!id) return new Response('缺少书籍编号', { status: 400 });
  const book = await env.DB.prepare(
    'SELECT file_key AS fileKey, content_type AS contentType FROM shelf_books WHERE id = ? AND user_id = ? AND file_key IS NOT NULL LIMIT 1',
  ).bind(id, user.userId).first<{ fileKey: string; contentType?: string | null }>();
  if (!book) return new Response('文件不存在或已删除', { status: 404 });
  const object = await env.FILES.get(book.fileKey);
  if (!object) return new Response('文件不存在或已删除', { status: 404 });
  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set('content-type', book.contentType || headers.get('content-type') || 'application/octet-stream');
  headers.set('cache-control', 'private, no-store');
  headers.set('content-disposition', 'inline');
  return new Response(object.body, { headers });
}
