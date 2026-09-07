import { type JobEnv } from './reading-workflow';
export { ReadingWorkflow } from './reading-workflow';
import { resolveSource } from './sources';
interface EditorEnv extends Cloudflare.Env, JobEnv { EDITOR_SECRET: string; AI: Ai }

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
    const body = await request.json<{ title?: string; profile?: { goal?: string; level?: string; likes?: string[] }; feedback?: string; wrongAnswerType?: string; sourceText?: string; sourceUrl?: string; action?: string; prompt?: string; apiKey?: string; jobId?: string }>();
    const title = body.title?.trim();
    if (!title) return json({ error: 'TITLE_REQUIRED' }, 400, request);
    const bearer = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '') || '';
    if (bearer !== env.EDITOR_SECRET && !(await validSignedToken(bearer, env.EDITOR_SECRET, title))) return json({ error: 'UNAUTHORIZED' }, 401, request);
    try {
      if (body.action === 'start-job' || body.action === 'job-status') {
        const claims = bearer === env.EDITOR_SECRET ? { uid: 'admin' } : JSON.parse(new TextDecoder().decode(fromBase64Url(bearer.split('.')[1])));
        if (!claims.uid) return json({ error: 'UNAUTHORIZED' }, 401, request);
        const hash = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(claims.uid + ':' + title))), x => x.toString(16).padStart(2, '0')).join('').slice(0, 24);
        if (!body.jobId || !/^[a-f0-9-]{36}$/.test(body.jobId)) return json({ error: 'INVALID_JOB_ID' }, 400, request);
        const id = hash + '-' + body.jobId;
        if (body.action === 'job-status') { const status = await (await env.READING.get(id)).status(); return json({ job: status }, 200, request); }
        if (!body.sourceText || body.sourceText.length < 150 || body.sourceText.length > 80_000) return json({ error: '需要完整的第一章正文（150–80000字符）' }, 400, request);
        try { const existing = await (await env.READING.get(id)).status(); return json({ job: existing }, 202, request); } catch { /* Instance has not been created. */ }
        await env.READING.create({ id, params: { title, sourceText: body.sourceText, sourceUrl: body.sourceUrl || 'user-upload', profile: body.profile || {} } });
        return json({ job: { status: 'queued' } }, 202, request);
      }
      if (body.action === 'image') {
        if (!body.prompt || body.prompt.length > 2000) return json({ error: 'INVALID_IMAGE_PROMPT' }, 400, request);
        const result = await env.AI.run('@cf/black-forest-labs/flux-1-schnell', { prompt: body.prompt, steps: 4 });
        return json({ image: 'data:image/jpeg;base64,' + result.image }, 200, request);
      }
      const uploadedText = body.sourceText?.trim().slice(0, 80_000);
      const resolved = uploadedText && uploadedText.length >= 500
        ? { text: uploadedText, url: 'user-upload' }
        : await resolveSource(title, body.sourceUrl);
      if (!resolved) return json({ error: 'SOURCE_NOT_FOUND', message: '暂时没有找到可核验的第一章正文。系统会继续扩充来源，不会把查找工作交给读者。' }, 422, request);
      if (body.action === 'source') return json({ source: resolved }, 200, request);
      const source = resolved.text;
      const result = await env.AI.run('@cf/zai-org/glm-4.7-flash', {
        messages: [
          { role: 'system', content: '你是严谨的中文文学编辑。只依据提供的章节原文工作。交付完整连贯的一章，不是摘要。保留全部事件、说话者、行动主体、因果、场景转换和结尾状态。个性化作用于整章词汇、句长、解释密度和思考空间。语言像人写，少用口号、冒号和破折号。输出前在内部逐项核对人物、动作、顺序、数字与结尾，发现不一致必须修正。输出严格 JSON，不要代码围栏。' },
          { role: 'user', content: `书名：${title}\n阅读目标：${body.profile?.goal || '读懂故事'}\n阅读基础：${body.profile?.level || '平时会读一些'}\n兴趣：${body.profile?.likes?.join('、') || '尚未确定'}\n上一章反馈：${body.feedback || '无'}\n上次错题类型：${body.wrongAnswerType || '无'}\n\n原文：\n${source}\n\n请返回 {"chapterTitle":"...","chapter":["自然段1","自然段2"],"originalEvidence":[{"adapted":"改写中的关键句","original":"不超过30字或20个英文词的原文证据","note":"比较说明"}],"quiz":{"question":"需要推理的问题","options":["A项","B项","C项","D项"],"correctIndex":0,"rightFeedback":"...","wrongFeedback":["对应A的反馈","对应B的反馈","对应C的反馈","对应D的反馈"]},"imageCue":{"needed":true,"reason":"只有关键剧情才为true并说明原因","prompt":"用英文描述本章一个具体场景、人物外观和动作，绘本插图，无文字，最多150词"}}。错误选项分别体现范围夸大、因果倒置、无证据补充或只看一面。` },
        ],
        response_format: { type: 'json_object' },
        reasoning_effort: 'low',
        max_completion_tokens: 16000,
        temperature: 0.55,
      });
      const completion = result as { choices?: Array<{ finish_reason?: string; message?: { content?: string } }> };
      if (completion.choices?.[0]?.finish_reason === 'length') throw new Error('MODEL_OUTPUT_TRUNCATED');
      const content = completion.choices?.[0]?.message?.content;
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
      return json({ error: 'GENERATION_FAILED', message: '改写未完成，请重试。', detail: error instanceof Error ? error.message : 'UNKNOWN' }, 502, request);
    }
  },
} satisfies ExportedHandler<EditorEnv>;

