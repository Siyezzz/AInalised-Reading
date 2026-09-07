interface EditorEnv extends Cloudflare.Env { EDITOR_SECRET: string }

const PUBLIC_TEXTS: Record<string, { url: string; start: string; end: string }> = {
  'Pride and Prejudice': {
    url: 'https://www.gutenberg.org/cache/epub/1342/pg1342.txt',
    start: '\nchapter i.]\n',
    end: '\nchapter ii.\n',
  },
};

function json(data: unknown, status = 200) {
  return Response.json(data, { status, headers: { 'cache-control': 'no-store' } });
}

function parseModelJson(value: string): unknown {
  const clean = value.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  try { return JSON.parse(clean); } catch {
    let repaired = '';
    let inString = false;
    let escaped = false;
    for (const char of clean) {
      if (inString && (char === '\n' || char === '\r')) { repaired += '\\n'; continue; }
      repaired += char;
      if (escaped) { escaped = false; continue; }
      if (char === '\\') { escaped = true; continue; }
      if (char === '"') inString = !inString;
    }
    return JSON.parse(repaired);
  }
}

async function readBoundedChapter(config: { url: string; start: string; end: string }) {
  const response = await fetch(config.url, { headers: { 'user-agent': 'ZhijiReading/1.0' } });
  if (!response.ok || !response.body) throw new Error('SOURCE_UNAVAILABLE');
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let text = '';
  while (text.length < 180_000) {
    const part = await reader.read();
    if (part.done) break;
    text += decoder.decode(part.value, { stream: true });
    const start = text.indexOf(config.start);
    if (start >= 0 && text.indexOf(config.end, start + config.start.length) >= 0) break;
  }
  await reader.cancel();
  text = text.replace(/\r\n/g, '\n');
  const comparable = text.toLowerCase();
  const start = comparable.indexOf(config.start);
  const end = comparable.indexOf(config.end, start + config.start.length);
  if (start < 0 || end < 0) throw new Error(`CHAPTER_NOT_FOUND:${text.length}:${text.slice(0, 80).replace(/\s+/g, ' ')}`);
  return text.slice(start, end).trim().slice(0, 80_000);
}

export default {
  async fetch(request: Request, env: EditorEnv): Promise<Response> {
    if (request.method !== 'POST') return json({ error: 'METHOD_NOT_ALLOWED' }, 405);
    if (request.headers.get('authorization') !== `Bearer ${env.EDITOR_SECRET}`)
      return json({ error: 'UNAUTHORIZED' }, 401);
    const body = await request.json<{ title?: string; profile?: { goal?: string; level?: string; likes?: string[] }; feedback?: string; wrongAnswerType?: string }>();
    const title = body.title?.trim();
    if (!title || !PUBLIC_TEXTS[title]) return json({ error: 'SOURCE_REQUIRED', message: '这本书暂时没有可核验的公版正文，请上传你有权阅读的 PDF。' }, 422);
    try {
      const source = await readBoundedChapter(PUBLIC_TEXTS[title]);
      const result = await env.AI.run('@cf/zai-org/glm-4.7-flash', {
        messages: [
          { role: 'system', content: '你是严谨的中文文学编辑。只依据提供的章节原文工作。交付完整连贯的一章，不是摘要。保留全部事件、行动主体、因果、场景转换和结尾状态。个性化作用于整章词汇、句长、解释密度和思考空间。语言像人写，少用口号、冒号和破折号。输出严格 JSON，不要代码围栏。' },
          { role: 'user', content: `书名：${title}\n阅读目标：${body.profile?.goal || '读懂故事'}\n阅读基础：${body.profile?.level || '平时会读一些'}\n兴趣：${body.profile?.likes?.join('、') || '尚未确定'}\n上一章反馈：${body.feedback || '无'}\n上次错题类型：${body.wrongAnswerType || '无'}\n\n原文：\n${source}\n\n请返回 {"chapterTitle":"...","chapter":["自然段1","自然段2"],"originalEvidence":[{"adapted":"改写中的关键句","original":"不超过20个英文词的原文证据","note":"比较说明"}],"quiz":{"question":"需要推理的问题","options":["A项","B项","C项","D项"],"correctIndex":0,"rightFeedback":"...","wrongFeedback":["...","...","...","..."]},"imageCue":{"needed":true,"reason":"为什么这是关键剧情点","prompt":"准确的无文字插图提示"}}。错误选项分别体现范围夸大、因果倒置、无证据补充或只看一面。` },
        ],
        response_format: { type: 'json_object' },
        reasoning_effort: 'low',
        max_completion_tokens: 5000,
        temperature: 0.55,
      });
      const content = (result as { choices?: Array<{ message?: { content?: string } }> }).choices?.[0]?.message?.content;
      if (!content) throw new Error('EMPTY_MODEL_RESPONSE');
      let parsed: unknown;
      try { parsed = parseModelJson(content); }
      catch (parseError) {
        console.error(JSON.stringify({ event: 'model_json_invalid', length: content.length, tail: content.slice(-160), parseError: parseError instanceof Error ? parseError.message : String(parseError) }));
        throw parseError;
      }
      const verified = await env.AI.run('@cf/zai-org/glm-4.7-flash', {
        messages: [
          { role: 'system', content: '你是文学事实核对编辑。逐项对照原文，修正草稿中的人物关系、说话者、行动主体、先后顺序、因果、数字和结尾状态。保持完整章节和原 JSON 结构。不要增加原文没有的事实。语言自然。只输出严格 JSON。' },
          { role: 'user', content: `原文：\n${source}\n\n待核对草稿：\n${JSON.stringify(parsed)}` },
        ],
        response_format: { type: 'json_object' },
        reasoning_effort: 'low',
        max_completion_tokens: 5000,
        temperature: 0.15,
      });
      const verifiedContent = (verified as { choices?: Array<{ message?: { content?: string } }> }).choices?.[0]?.message?.content;
      if (!verifiedContent) throw new Error('EMPTY_VERIFIER_RESPONSE');
      const verifiedParsed = parseModelJson(verifiedContent);
      return json({ content: verifiedParsed, source: PUBLIC_TEXTS[title].url, model: '@cf/zai-org/glm-4.7-flash', verified: true });
    } catch (error) {
      console.error(JSON.stringify({ event: 'adapt_failed', title, error: error instanceof Error ? error.message : String(error) }));
      return json({ error: 'GENERATION_FAILED', message: '这一章暂时没有准备好，请稍后再试。' }, 502);
    }
  },
} satisfies ExportedHandler<EditorEnv>;
