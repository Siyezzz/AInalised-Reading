import { getChatGPTUser } from '../../../chatgpt-auth';

export async function GET() {
  const user = await getChatGPTUser();
  if (!user) return new Response('请先登录', { status: 401 });
  return new Response('本地上传和文件预览已关闭，请从发现页导入公开来源的书籍。', { status: 410 });
}
