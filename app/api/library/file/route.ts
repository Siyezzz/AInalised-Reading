import { getChatGPTUser } from '../../../chatgpt-auth';

export async function GET() {
  const user = await getChatGPTUser();
  if (!user) return new Response('请先登录', { status: 401 });
  return new Response('PDF 导入暂时暂停。请先从书库或搜索页选择公版名著生成改写。', { status: 410 });
}
