import { env } from 'cloudflare:workers';
import { getChatGPTUser } from '../../../chatgpt-auth';

/**
 * 站点不保存原始电子书二进制（没有对象存储绑定），只保存导入时抽取出的正文，
 * 所以这里返回 JSON 正文而不是文件流，供「查看原文」页渲染。
 */
export async function GET(request: Request) {
  const user = await getChatGPTUser();
  if (!user) return Response.json({ error: '请先登录后再查看原文' }, { status: 401 });

  const id = new URL(request.url).searchParams.get('id');
  if (!id) return Response.json({ error: '缺少书籍编号' }, { status: 400 });

  const row = await env.DB.prepare(
    'SELECT title,extracted_text AS extractedText FROM shelf_books WHERE id = ? AND user_id = ? LIMIT 1',
  )
    .bind(id, user.userId)
    .first<{ title: string; extractedText: string | null }>();
  if (!row) return Response.json({ error: '这本书不在你的书架上，或者已经被移除了' }, { status: 404 });
  if (!row.extractedText) {
    return Response.json(
      { error: '这本书没有留下可读的原文：导入时只保存了抽取出的正文，而这次抽取没有成功。可以回到书架重新导入一次。' },
      { status: 409 },
    );
  }

  return Response.json(
    { title: row.title, text: row.extractedText },
    { headers: { 'cache-control': 'private, no-store' } },
  );
}
