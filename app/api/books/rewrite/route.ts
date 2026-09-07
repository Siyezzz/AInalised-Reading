import { env } from 'cloudflare:workers';
import { getChatGPTUser } from '../../../chatgpt-auth';

const SUPPORTED_HOSTS = new Set([
  'openlibrary.org',
  'www.gutenberg.org',
  'zh.wikisource.org',
  'www.wikisource.org',
  'standardebooks.org',
  'archive.org',
  'librivox.org',
]);

export async function POST(request: Request) {
  const user = await getChatGPTUser();
  if (!user) {
    return Response.json({ error: '请先用 ChatGPT 账号登录' }, { status: 401 });
  }

  try {
    const body = (await request.json()) as {
      title?: string;
      sourceUrl?: string;
      goal?: string;
      level?: string;
    };

    const title = body.title?.trim() || '未命名书籍';
    const sourceUrl = body.sourceUrl?.trim();
    if (!sourceUrl) {
      return Response.json({ error: '缺少书籍来源地址' }, { status: 400 });
    }

    const parsed = new URL(sourceUrl);
    if (!SUPPORTED_HOSTS.has(parsed.hostname)) {
      return Response.json({ error: '暂不支持这个来源' }, { status: 400 });
    }

    const text = await extractReadableText(sourceUrl);
    const paragraphs = splitIntoParagraphs(text, 130);
    if (!paragraphs.length) {
      return Response.json({ error: '无法从该来源提取正文内容' }, { status: 422 });
    }

    const rewrite = await buildRewrite({
      title,
      paragraphs,
      user,
      goal: body.goal || '读懂故事',
      level: body.level || '平时会读一些',
      sourceUrl,
    });

    return Response.json({
      book: {
        title,
        source: parsed.hostname,
        sourceUrl,
        provider: rewrite.provider,
        summary: rewrite.summary,
        paragraphs: rewrite.paragraphs,
      },
    });
  } catch (error) {
    return Response.json(
      {
        error:
          error instanceof Error ? error.message : '加载书籍内容时出现错误',
      },
      { status: 500 },
    );
  }
}

async function extractReadableText(sourceUrl: string): Promise<string> {
  const response = await fetch(sourceUrl, {
    headers: {
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36',
      Accept: 'text/html,application/xhtml+xml,text/xml;q=0.9,*/*;q=0.8',
    },
    redirect: 'follow',
  });

  if (!response.ok) {
    throw new Error(`源站返回 ${response.status}`);
  }

  const html = await response.text();
  const cleaned = html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ')
    .replace(/<svg[\s\S]*?<\/svg>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, ' ')
    .trim();

  if (!cleaned) {
    throw new Error('源站没有可读文本内容');
  }

  return cleaned.slice(0, 20000);
}

function splitIntoParagraphs(text: string, chunkLength: number): string[] {
  const sentences = text
    .split(/(?<=[。！？.!?])\s+/)
    .map((part) => part.trim())
    .filter(Boolean);

  const chunks: string[] = [];
  let buffer = '';

  for (const sentence of sentences) {
    if ((buffer + sentence).length > chunkLength && buffer) {
      chunks.push(buffer.trim());
      buffer = sentence;
    } else {
      buffer = buffer ? `${buffer} ${sentence}` : sentence;
    }
  }

  if (buffer.trim()) chunks.push(buffer.trim());

  return chunks.slice(0, 8);
}

async function buildRewrite({
  title,
  paragraphs,
  user,
  goal,
  level,
  sourceUrl,
}: {
  title: string;
  paragraphs: string[];
  user: Awaited<ReturnType<typeof getChatGPTUser>>;
  goal: string;
  level: string;
  sourceUrl: string;
}): Promise<{ summary: string; paragraphs: string[]; provider: 'openai' | 'local' }> {
  const apiKey = (env as any)?.OPENAI_API_KEY;
  const model = (env as any)?.OPENAI_MODEL || 'gpt-4o-mini';

  if (apiKey) {
    try {
      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model,
          temperature: 0.7,
          messages: [
            {
              role: 'system',
              content:
                '你是文学编辑。请保留原文事实、人物关系和故事脉络，只用更清晰、适合阅读的语言重写。不要编造新情节。返回 JSON：{"summary":"...","paragraphs":["...","..."]}"',
            },
            {
              role: 'user',
              content: JSON.stringify({
                title,
                sourceUrl,
                goal,
                level,
                paragraphs: paragraphs.slice(0, 5),
                user: { userId: user?.userId, email: user?.email },
              }),
            },
          ],
        }),
      });

      if (response.ok) {
        const payload = (await response.json()) as {
          choices?: Array<{ message?: { content?: string } }>;
        };
        const content = payload.choices?.[0]?.message?.content?.trim();
        if (content) {
          const parsed = safeParseJson(content);
          if (parsed?.summary && Array.isArray(parsed.paragraphs) && parsed.paragraphs.length) {
            return {
              summary: String(parsed.summary),
              paragraphs: parsed.paragraphs.map((p) => String(p)).slice(0, 6),
              provider: 'openai',
            };
          }
        }
      }
    } catch {
      // fall through to local rewrite
    }
  }

  return localRewrite({ title, paragraphs, goal, level, user });
}

function safeParseJson(content: string) {
  try {
    const match = content.match(/\{[\s\S]*\}/);
    if (!match) return null;
    return JSON.parse(match[0]);
  } catch {
    return null;
  }
}

function localRewrite({
  title,
  paragraphs,
  goal,
  level,
  user,
}: {
  title: string;
  paragraphs: string[];
  goal: string;
  level: string;
  user: Awaited<ReturnType<typeof getChatGPTUser>>;
}): { summary: string; paragraphs: string[]; provider: 'local' } {
  const opening = paragraphs[0] || '本书内容已成功加载。';
  const summary = `《${title}》当前先按“${goal}”目标处理，针对“${level}”的阅读水平，保留事件因果并用更清晰的表达展示前两到三段关键内容。当前用户：${user?.displayName || user?.email || '未命名读者'}。`;

  const rewritten = paragraphs.slice(0, 5).map((paragraph, index) => {
    const cleaned = paragraph
      .replace(/\s+/g, ' ')
      .trim();
    if (!cleaned) return `第 ${index + 1} 段：内容已载入。`;
    return `第 ${index + 1} 段：${cleaned.slice(0, 220)}${cleaned.length > 220 ? '……' : ''}`;
  });

  if (rewritten.length === 0) {
    rewritten.push(`《${title}》已成功载入，先按“${goal}”的目标整理开头。`);
  }

  return {
    summary,
    paragraphs: rewritten,
    provider: 'local',
  };
}
