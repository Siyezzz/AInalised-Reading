interface EditorEnv extends Cloudflare.Env { EDITOR_SECRET: string }

const PUBLIC_TEXTS: Record<string, { url: string; start: string; end: string }> = {
  'Pride and Prejudice': {
    url: 'https://www.gutenberg.org/cache/epub/1342/pg1342.txt',
    start: '\nchapter i.]\n',
    end: '\nchapter ii.\n',
  },
};

const WIKISOURCE_CHAPTERS: Record<string, string> = {
  '红楼梦': '紅樓夢/第001回',
  '紅樓夢': '紅樓夢/第001回',
  '西游记': '西遊記/第001回',
  '西遊記': '西遊記/第001回',
  '三国演义': '三國演義/第001回',
  '三國演義': '三國演義/第001回',
  '水浒传': '水滸傳/第001回',
  '水滸傳': '水滸傳/第001回',
};

const ALLOWED_ORIGINS = new Set([
  'https://zhiji-reading.li-siye-0123.chatgpt.site',
  'http://localhost:5173',
  'http://localhost:4173',
]);
function resolveOrigin(request: Request): string {
  const origin = request.headers.get('origin') || '';
  return ALLOWED_ORIGINS.has(origin) ? origin : 'https://zhiji-reading.li-siye-0123.chatgpt.site';
}
function json(data: unknown, status: number, request: Request) {
  return Response.json(data, { status, headers: { 'cache-control': 'no-store', 'access-control-allow-origin': resolveOrigin(request), 'access-control-allow-headers': 'authorization, content-type', 'access-control-allow-methods': 'POST, OPTIONS' } });
}

function fromBase64Url(value: string) { const binary = atob(value.replace(/-/g, '+').replace(/_/g, '/')); return Uint8Array.from(binary, (c) => c.charCodeAt(0)); }
async function validSignedToken(token: string, secret: string, title: string) {
  const [version, payload, signature] = token.split('.'); if (version !== 'v1' || !payload || !signature) return false;
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['verify']);
  const valid = await crypto.subtle.verify('HMAC', key, fromBase64Url(signature), new TextEncoder().encode(payload)); if (!valid) return false;
  try { const data = JSON.parse(new TextDecoder().decode(fromBase64Url(payload))) as { title?: string; exp?: number }; return data.title === title && Number(data.exp) > Date.now(); } catch { return false; }
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

async function readWikisourceChapter(page: string) {
  const url = `https://zh.wikisource.org/w/api.php?action=parse&page=${encodeURIComponent(page)}&prop=wikitext&format=json&formatversion=2&origin=*`;
  const response = await fetch(url, { headers: { 'user-agent': 'ZhijiReading/1.0' } });
  if (!response.ok) throw new Error('WIKISOURCE_UNAVAILABLE');
  const data = await response.json<{ parse?: { wikitext?: string } }>();
  const raw = data.parse?.wikitext;
  if (!raw) throw new Error('WIKISOURCE_CHAPTER_NOT_FOUND');
  const cleaned = raw
    .replace(/<noinclude>[\s\S]*?<\/noinclude>/gi, ' ')
    .replace(/<ref[^>]*>[\s\S]*?<\/ref>/gi, ' ')
    .replace(/\{\{[^{}]*\}\}/g, ' ')
    .replace(/\[\[(?:[^\]|]*\|)?([^\]]+)\]\]/g, '$1')
    .replace(/'{2,}/g, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  if (cleaned.length < 500) throw new Error('WIKISOURCE_TEXT_TOO_SHORT');
  return { text: cleaned.slice(0, 80_000), url: `https://zh.wikisource.org/wiki/${encodeURIComponent(page)}` };
}

function looksChinese(value: string) { return /[\u3400-\u9fff]/.test(value); }

async function discoverWikisourceChapter(title: string) {
  const query = `${title} 第001回`;
  const url = `https://zh.wikisource.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(query)}&srnamespace=0&srlimit=10&format=json&formatversion=2&origin=*`;
  const response = await fetch(url, { headers: { 'user-agent': 'ZhijiReading/1.0' } });
  if (!response.ok) return null;
  const data = await response.json<{ query?: { search?: Array<{ title: string }> } }>();
  const choices = data.query?.search || [];
  const normalized = title.replace(/\s+/g, '');
  const hit = choices.find((item) => item.title.replace(/\s+/g, '').includes(normalized) && /第0*1回|第一回|第0*1章/.test(item.title));
  if (!hit) return null;
  try { return await readWikisourceChapter(hit.title); } catch { return null; }
}

async function discoverGutenbergChapter(title: string) {
  const response = await fetch(`https://gutendex.com/books?search=${encodeURIComponent(title)}`, { headers: { 'user-agent': 'ZhijiReading/1.0' } });
  if (!response.ok) return null;
  const data = await response.json<{ results?: Array<{ id: number; title: string; copyright: boolean | null; formats: Record<string, string> }> }>();
  const wanted = title.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
  const book = (data.results || []).find((item) => item.copyright !== true && item.title.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').includes(wanted));
  if (!book) return null;
  const textUrl = book.formats['text/plain; charset=utf-8'] || book.formats['text/plain; charset=us-ascii'] || Object.entries(book.formats).find(([type]) => type.startsWith('text/plain'))?.[1];
  if (!textUrl) return null;
  const textResponse = await fetch(textUrl, { headers: { 'user-agent': 'ZhijiReading/1.0' } });
  if (!textResponse.ok) return null;
  let text = (await textResponse.text()).replace(/\r\n/g, '\n');
  const startMarker = text.search(/\*\*\* START OF (?:THE|THIS) PROJECT GUTENBERG EBOOK/i);
  if (startMarker >= 0) text = text.slice(startMarker + 40);
  const heading = /(?:^|\n)\s*(?:chapter\s+(?:i|1|one)\b[^\n]*|第[一1]章[^\n]*)\s*\n/i;
  const first = heading.exec(text);
  if (!first) return null;
  const chapterStart = first.index + first[0].length;
  const rest = text.slice(chapterStart);
  const next = /\n\s*(?:chapter\s+(?:ii|2|two)\b[^\n]*|第[二2]章[^\n]*)\s*\n/i.exec(rest);
  const chapter = rest.slice(0, next?.index ?? Math.min(rest.length, 80_000)).trim();
  if (chapter.length < 500) return null;
  return { text: chapter.slice(0, 80_000), url: `https://www.gutenberg.org/ebooks/${book.id}` };
}

async function resolvePublicChapter(title: string) {
  if (WIKISOURCE_CHAPTERS[title]) return readWikisourceChapter(WIKISOURCE_CHAPTERS[title]);
  if (PUBLIC_TEXTS[title]) return { text: await readBoundedChapter(PUBLIC_TEXTS[title]), url: PUBLIC_TEXTS[title].url };
  if (looksChinese(title)) {
    const wikisource = await discoverWikisourceChapter(title);
    if (wikisource) return wikisource;
  }
  return discoverGutenbergChapter(title);
}

function assertChapterShape(value: unknown) {
  if (!value || typeof value !== 'object') throw new Error('INVALID_CHAPTER_OBJECT');
  const item = value as { chapter?: unknown; quiz?: { options?: unknown; correctIndex?: unknown } };
  if (!Array.isArray(item.chapter) || item.chapter.length < 4 || !item.chapter.every((p) => typeof p === 'string' && p.trim().length > 0)) throw new Error('INCOMPLETE_CHAPTER');
  if (!item.quiz || !Array.isArray(item.quiz.options) || item.quiz.options.length !== 4 || typeof item.quiz.correctIndex !== 'number' || item.quiz.correctIndex < 0 || item.quiz.correctIndex > 3) throw new Error('INVALID_QUIZ');
}

export default {
  async fetch(request: Request, env: EditorEnv): Promise<Response> {
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: { 'access-control-allow-origin': resolveOrigin(request), 'access-control-allow-headers': 'authorization, content-type', 'access-control-allow-methods': 'POST, OPTIONS', 'access-control-max-age': '86400' } });
    if (request.method !== 'POST') return json({ error: 'METHOD_NOT_ALLOWED' }, 405, request);
    const body = await request.json<{ title?: string; profile?: { goal?: string; level?: string; likes?: string[] }; feedback?: string; wrongAnswerType?: string; sourceText?: string }>();
    const title = body.title?.trim();
    if (!title) return json({ error: 'TITLE_REQUIRED' }, 400, request);
    const bearer = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '') || '';
    if (bearer !== env.EDITOR_SECRET && !(await validSignedToken(bearer, env.EDITOR_SECRET, title))) return json({ error: 'UNAUTHORIZED' }, 401, request);
    try {
      const uploadedText = body.sourceText?.trim().slice(0, 80_000);
      const resolved = uploadedText && uploadedText.length >= 500
        ? { text: uploadedText, url: 'user-upload' }
        : await resolvePublicChapter(title);
      if (!resolved) return json({ error: 'SOURCE_NOT_FOUND', message: '暂时没有找到可核验的第一章正文。系统会继续扩充来源，不会把查找工作交给读者。' }, 422, request);
      const source = resolved.text;
      const result = await env.AI.run('@cf/zai-org/glm-4.7-flash', {
        messages: [
          { role: 'system', content: '你是严谨的中文文学编辑。只依据提供的章节原文工作。交付完整连贯的一章，不是摘要。保留全部事件、说话者、行动主体、因果、场景转换和结尾状态。个性化作用于整章词汇、句长、解释密度和思考空间。语言像人写，少用口号、冒号和破折号。输出前在内部逐项核对人物、动作、顺序、数字与结尾，发现不一致必须修正。输出严格 JSON，不要代码围栏。' },
          { role: 'user', content: `书名：${title}\n阅读目标：${body.profile?.goal || '读懂故事'}\n阅读基础：${body.profile?.level || '平时会读一些'}\n兴趣：${body.profile?.likes?.join('、') || '尚未确定'}\n上一章反馈：${body.feedback || '无'}\n上次错题类型：${body.wrongAnswerType || '无'}\n\n原文：\n${source}\n\n请返回 {"chapterTitle":"...","chapter":["自然段1","自然段2"],"originalEvidence":[{"adapted":"改写中的关键句","original":"不超过30字或20个英文词的原文证据","note":"比较说明"}],"quiz":{"question":"需要推理的问题","options":["A项","B项","C项","D项"],"correctIndex":0,"rightFeedback":"...","wrongFeedback":["对应A的反馈","对应B的反馈","对应C的反馈","对应D的反馈"]},"imageCue":{"needed":true,"reason":"只有关键剧情才为true并说明原因","prompt":"准确的无文字插图提示"}}。错误选项分别体现范围夸大、因果倒置、无证据补充或只看一面。` },
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
      assertChapterShape(parsed);
      return json({ content: parsed, source: resolved.url, model: '@cf/zai-org/glm-4.7-flash', verified: 'model-self-check+structure-check' }, 200, request);
    } catch (error) {
      console.error(JSON.stringify({ event: 'adapt_failed', title, error: error instanceof Error ? error.message : String(error) }));
      return json({ error: 'GENERATION_FAILED', message: '这一章暂时没有准备好，请稍后再试。' }, 502, request);
    }
  },
} satisfies ExportedHandler<EditorEnv>;
