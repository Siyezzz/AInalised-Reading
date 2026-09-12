import { getChatGPTUser } from '../../../chatgpt-auth';

export async function GET() {
  const user = await getChatGPTUser();
  if (!user) return new Response('请先登录', { status: 401 });
  return new Response('站点暂不保存原始电子书文件，只保存抽取出的正文。请回到书架继续阅读或重新导入。', { status: 410 });
}
