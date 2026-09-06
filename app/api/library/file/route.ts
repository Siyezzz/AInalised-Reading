import { env } from 'cloudflare:workers';
import { getChatGPTUser } from '../../../chatgpt-auth';

export async function GET(request: Request) {
  const user = await getChatGPTUser();
  if (!user) return new Response('请先登录', { status: 401 });
  const id = new URL(request.url).searchParams.get('id');
  if (!id) return new Response('缺少书籍编号', { status: 400 });
  const row = await env.DB.prepare(
    'SELECT file_key AS fileKey,title FROM shelf_books WHERE id = ? AND user_id = ? AND file_key IS NOT NULL',
  )
    .bind(id, user.userId)
    .first<{ fileKey: string; title: string }>();
  if (!row) return new Response('没有找到这本书', { status: 404 });
  const object = await env.FILES.get(row.fileKey);
  if (!object) return new Response('文件不存在', { status: 404 });
  return new Response(object.body, {
    headers: {
      'content-type': 'application/pdf',
      'content-disposition': `inline; filename="book.pdf"`,
      'cache-control': 'private, max-age=300',
    },
  });
}
