import { type JobEnv } from './reading-workflow';
import { ADAPTATION_SKILL, AGNES_IMAGE_MODEL, AGNES_TEXT_MODEL, GROQ_TEXT_MODEL, IMAGE_MODEL, TEXT_MODEL, fallbackSvg, generateAdaptedChapter, normalizeUserAiConfig } from './reading-workflow';
export { ReadingWorkflow } from './reading-workflow';
import { resolveSource } from './sources';
interface EditorEnv extends Cloudflare.Env, JobEnv { EDITOR_SECRET: string; AI: Ai }

const ALLOWED_ORIGINS = new Set([
  'https://zhiji-reading.li-siye-0123.chatgpt.site',
  'https://zhiji-reading.li-siye-0123.workers.dev', // 主站 workers.dev 域名
  'https://zhiji-reading.pages.dev',                 // Cloudflare Pages 域名（如后续启用）
  'http://localhost:5173',
  'http://localhost:4173',
]);
function resolveOrigin(request: Request): string {
  const origin = request.headers.get('origin') || '';
  return ALLOWED_ORIGINS.has(origin) ? origin : 'https://zhiji-reading.li-siye-0123.workers.dev';
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
  const fenced = value.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
  const candidate = fenced ? fenced[1].trim() : value.trim();
  const firstBrace = candidate.indexOf('{');
  const lastBrace = candidate.lastIndexOf('}');
  const jsonLike = firstBrace >= 0 && lastBrace > firstBrace
    ? candidate.slice(firstBrace, lastBrace + 1)
    : candidate;
  return JSON.parse(jsonLike);
}

function assertChapterShape(value: unknown) {
  if (!value || typeof value !== 'object') throw new Error('INVALID_CHAPTER_OBJECT');
  const item = value as { chapter?: unknown; quiz?: { options?: unknown; correctIndex?: unknown } };
  if (!Array.isArray(item.chapter) || item.chapter.length < 4 || !item.chapter.every((p) => typeof p === 'string' && p.trim().length > 0)) throw new Error('INCOMPLETE_CHAPTER');
  const options = Array.isArray(item.quiz?.options) ? item.quiz.options : [];
  const correctIndex = typeof item.quiz?.correctIndex === 'number' ? item.quiz.correctIndex : Number(item.quiz?.correctIndex);
  if (!item.quiz || options.length !== 4 || !Number.isInteger(correctIndex) || correctIndex < 0 || correctIndex > 3) throw new Error('INVALID_QUIZ');
}

export default {
  async fetch(request: Request, env: EditorEnv): Promise<Response> {
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: { 'access-control-allow-origin': resolveOrigin(request), 'access-control-allow-headers': 'authorization, content-type', 'access-control-allow-methods': 'POST, OPTIONS', 'access-control-max-age': '86400' } });
    if (request.method !== 'POST') return json({ error: 'METHOD_NOT_ALLOWED' }, 405, request);
    const body = await request.json<{ title?: string; profile?: { goal?: string; level?: string; likes?: string[] }; feedback?: string; wrongAnswerType?: string; sourceText?: string; sourceUrl?: string; action?: string; prompt?: string; apiKey?: string; apiBaseUrl?: string; apiModel?: string; aiProvider?: string; jobId?: string }>();
    const title = body.title?.trim();
    if (!title) return json({ error: 'TITLE_REQUIRED' }, 400, request);
    const bearer = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '') || '';
    if (bearer !== env.EDITOR_SECRET && !(await validSignedToken(bearer, env.EDITOR_SECRET, title))) return json({ error: 'UNAUTHORIZED' }, 401, request);
    try {
      const aiConfig = normalizeUserAiConfig({ provider: body.aiProvider, apiKey: body.apiKey, baseUrl: body.apiBaseUrl, model: body.apiModel });
      if (body.action === 'start-job' || body.action === 'job-status') {
        const claims = bearer === env.EDITOR_SECRET ? { uid: 'admin' } : JSON.parse(new TextDecoder().decode(fromBase64Url(bearer.split('.')[1])));
        if (!claims.uid) return json({ error: 'UNAUTHORIZED' }, 401, request);
        const hash = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(claims.uid + ':' + title))), x => x.toString(16).padStart(2, '0')).join('').slice(0, 24);
        if (!body.jobId || !/^[a-f0-9-]{36}$/.test(body.jobId)) return json({ error: 'INVALID_JOB_ID' }, 400, request);
        const id = hash + '-' + body.jobId;
        if (body.action === 'job-status') { const status = await (await env.READING.get(id)).status(); return json({ job: status }, 200, request); }
        if (!body.sourceText || body.sourceText.length < 150 || body.sourceText.length > 80_000) return json({ error: '需要完整的第一章正文（150–80000字符）' }, 400, request);
        try { const existing = await (await env.READING.get(id)).status(); if (existing.status !== 'errored') return json({ job: existing }, 202, request); } catch { /* Instance has not been created. */ }
        const output = await generateAdaptedChapter(env, { title, sourceText: body.sourceText, sourceUrl: body.sourceUrl || 'user-upload', profile: body.profile || {}, aiConfig });
        return json({ job: { status: 'complete', output } }, 200, request);
      }
      if (body.action === 'image') {
        if (!body.prompt || body.prompt.length > 2000) return json({ error: 'INVALID_IMAGE_PROMPT' }, 400, request);
        async function callAgnesImage() {
          if (!env.AGNES_API_KEY) throw new Error('AGNES_KEY_MISSING');
          const r = await fetch('https://apihub.agnes-ai.com/v1/images/generations', { method: 'POST', headers: { authorization: `Bearer ${env.AGNES_API_KEY}`, 'content-type': 'application/json' }, body: JSON.stringify({ model: AGNES_IMAGE_MODEL, prompt: body.prompt, n: 1, size: '1024x768' }), signal: AbortSignal.timeout(75_000) });
          if (!r.ok) throw new Error(`AGNES_IMAGE_HTTP_${r.status}`);
          const data = await r.json() as { data?: { url?: string; b64_json?: string }[] };
          const item = data.data?.[0];
          const image = item?.b64_json ? `data:image/png;base64,${item.b64_json}` : item?.url;
          if (!image) throw new Error('AGNES_IMAGE_EMPTY');
          return json({ image, imageModel: AGNES_IMAGE_MODEL }, 200, request);
        }
        if (env.AGNES_API_KEY && aiConfig?.provider !== 'cloudflare-free') {
          try { return await callAgnesImage(); }
          catch (agnesError) { console.error(JSON.stringify({ event: 'direct_agnes_image_fallback', error: agnesError instanceof Error ? agnesError.message : String(agnesError) })); }
        }
        try {
          const result = await env.AI.run(IMAGE_MODEL, { prompt: body.prompt, steps: 4 });
          return json({ image: 'data:image/jpeg;base64,' + result.image, imageModel: IMAGE_MODEL }, 200, request);
        } catch (cloudflareError) {
          if (!env.AGNES_API_KEY || aiConfig?.provider !== 'cloudflare-free') return json({ image: fallbackSvg(title), imageModel: 'built-in-svg-fallback' }, 200, request);
          console.error(JSON.stringify({ event: 'direct_cloudflare_image_fallback', error: cloudflareError instanceof Error ? cloudflareError.message : String(cloudflareError) }));
          try { return await callAgnesImage(); }
          catch { return json({ image: fallbackSvg(title), imageModel: 'built-in-svg-fallback' }, 200, request); }
        }
      }
      const uploadedText = body.sourceText?.trim().slice(0, 80_000);
      const resolved = uploadedText && uploadedText.length >= 500
        ? { text: uploadedText, url: 'user-upload' }
        : await resolveSource(title, body.sourceUrl);
      if (!resolved) return json({ error: 'SOURCE_NOT_FOUND', message: '暂时没有找到可核验的第一章正文。系统会继续扩充来源，不会把查找工作交给读者。' }, 422, request);
      if (body.action === 'source') return json({ source: resolved }, 200, request);
      const source = resolved.text;
      const messages = [
        { role: 'system', content: `${ADAPTATION_SKILL}\nReturn only one valid json object. Use json keys exactly as requested. No Markdown fences, no prose before or after the json.` },
        { role: 'user', content: `书名：${title}\n阅读目标：${body.profile?.goal || '读懂故事'}\n阅读基础：${body.profile?.level || '平时会读一些'}\n兴趣：${body.profile?.likes?.join('、') || '尚未确定'}\n上一章反馈：${body.feedback || '无'}\n上次错题类型：${body.wrongAnswerType || '无'}\n\n原文：\n${source}\n\n固定模板：chapterTitle 用简体；chapter 只放改写后的现代简体中文白话文，不要整段照抄原文，不要繁体字；originalEvidence 只放折叠证据；quiz 是章末小考察；imageCue.afterParagraph 标出插图应插在第几段后面。\n请返回 {"chapterTitle":"...","chapter":["改写后的简体中文自然段1","改写后的简体中文自然段2"],"originalEvidence":[{"adapted":"改写中的关键句","original":"不超过30字或20个英文词的原文证据","note":"比较说明"}],"quiz":{"question":"需要推理的问题","options":["A项","B项","C项","D项"],"correctIndex":0,"rightFeedback":"...","wrongFeedback":["对应A的反馈","对应B的反馈","对应C的反馈","对应D的反馈"]},"imageCue":{"needed":true,"reason":"只有关键剧情才为true并说明原因","prompt":"用英文描述本章一个具体场景、人物外观和动作，绘本插图，无文字，最多150词","afterParagraph":3}}。错误选项分别体现范围夸大、因果倒置、无证据补充或只看一面。` },
      ];
      let modelUsed = TEXT_MODEL;
      let completion: { response?: string; text?: string; content?: string; choices?: Array<{ finish_reason?: string; message?: { content?: string }; text?: string }> } = {};
      async function callOpenAICompatible() {
        if (!aiConfig?.apiKey || !aiConfig.baseUrl || !aiConfig.model) throw new Error('USER_MODEL_CONFIG_INVALID');
        modelUsed = aiConfig.model;
        const body = { model: modelUsed, messages, response_format: { type: 'json_object' }, temperature: 0.55, max_tokens: 16000 };
        const requestUserModel = (payload: Record<string, unknown>) => fetch(`${aiConfig.baseUrl}/chat/completions`, {
          method: 'POST',
          headers: { authorization: `Bearer ${aiConfig.apiKey}`, 'content-type': 'application/json' },
          body: JSON.stringify(payload),
          signal: AbortSignal.timeout(150_000),
        });
        let r = await requestUserModel(body);
        if (r.status === 400 || r.status === 422) {
          const plainBody = { ...body } as Record<string, unknown>;
          delete plainBody.response_format;
          r = await requestUserModel(plainBody);
        }
        if (!r.ok) throw new Error(`USER_MODEL_HTTP_${r.status}`);
        return await r.json() as typeof completion;
      }
      async function callGroq() {
        if (!env.GROQ_API_KEY) throw new Error('GROQ_KEY_MISSING');
        modelUsed = env.GROQ_MODEL || GROQ_TEXT_MODEL;
        const body = { model: modelUsed, messages, response_format: { type: 'json_object' }, temperature: 0.55, max_tokens: 8000 };
        const requestGroq = (payload: Record<string, unknown>) => fetch('https://api.groq.com/openai/v1/chat/completions', {
          method: 'POST',
          headers: { authorization: `Bearer ${env.GROQ_API_KEY}`, 'content-type': 'application/json' },
          body: JSON.stringify(payload),
          signal: AbortSignal.timeout(75_000),
        });
        let r = await requestGroq(body);
        if (r.status === 400 || r.status === 422) {
          const plainBody = { ...body } as Record<string, unknown>;
          delete plainBody.response_format;
          r = await requestGroq(plainBody);
        }
        if (!r.ok) throw new Error(r.status === 429 ? 'GROQ_QUOTA' : `GROQ_HTTP_${r.status}`);
        return await r.json() as typeof completion;
      }
      async function callAgnes() {
        if (!env.AGNES_API_KEY) throw new Error('AGNES_KEY_MISSING');
        modelUsed = env.AGNES_MODEL || AGNES_TEXT_MODEL;
        const r = await fetch('https://apihub.agnes-ai.com/v1/chat/completions', {
          method: 'POST',
          headers: { authorization: `Bearer ${env.AGNES_API_KEY}`, 'content-type': 'application/json' },
          body: JSON.stringify({ model: modelUsed, messages, response_format: { type: 'json_object' }, temperature: 0.55, max_tokens: 16000 }),
          signal: AbortSignal.timeout(90_000),
        });
        if (!r.ok) throw new Error(r.status === 429 ? 'AGNES_QUOTA' : `AGNES_HTTP_${r.status}`);
        return await r.json() as typeof completion;
      }
      async function callCloudflare() {
        modelUsed = TEXT_MODEL;
        return await env.AI.run(TEXT_MODEL, {
          messages,
          response_format: { type: 'json_object' },
          reasoning_effort: 'low',
          max_completion_tokens: 16000,
          temperature: 0.55,
        }) as typeof completion;
      }
      if (aiConfig?.provider === 'openai-compatible') {
        completion = await callOpenAICompatible();
      } else if (env.GROQ_API_KEY && env.ADAPT_MODEL_PROVIDER !== 'agnes' && env.ADAPT_MODEL_PROVIDER !== 'cloudflare' && aiConfig?.provider !== 'cloudflare-free') {
        try {
          completion = await callGroq();
        } catch (groqError) {
          console.error(JSON.stringify({ event: 'direct_groq_text_fallback', error: groqError instanceof Error ? groqError.message : String(groqError) }));
          try {
            completion = await callAgnes();
          } catch (agnesError) {
            console.error(JSON.stringify({ event: 'direct_agnes_text_fallback', error: agnesError instanceof Error ? agnesError.message : String(agnesError) }));
            completion = await callCloudflare();
          }
        }
      } else if (env.AGNES_API_KEY && env.ADAPT_MODEL_PROVIDER !== 'cloudflare' && aiConfig?.provider !== 'cloudflare-free') {
        try {
          completion = await callAgnes();
        } catch (agnesError) {
          console.error(JSON.stringify({ event: 'direct_agnes_text_fallback', error: agnesError instanceof Error ? agnesError.message : String(agnesError) }));
          completion = await callCloudflare();
        }
      } else {
        try {
          completion = await callCloudflare();
        } catch (cloudflareError) {
          if (!env.AGNES_API_KEY) throw cloudflareError;
          console.error(JSON.stringify({ event: 'direct_cloudflare_text_fallback', error: cloudflareError instanceof Error ? cloudflareError.message : String(cloudflareError) }));
          completion = await callAgnes();
        }
      }
      if (completion.choices?.[0]?.finish_reason === 'length') throw new Error('MODEL_OUTPUT_TRUNCATED');
      const content = completion.response || completion.text || completion.content || completion.choices?.[0]?.message?.content || completion.choices?.[0]?.text || '';
      if (!content) throw new Error('EMPTY_MODEL_RESPONSE');
      let parsed: unknown;
      try { parsed = parseModelJson(content); }
      catch (parseError) {
        console.error(JSON.stringify({ event: 'model_json_invalid', length: content.length, tail: content.slice(-160), parseError: parseError instanceof Error ? parseError.message : String(parseError) }));
        throw parseError;
      }
      assertChapterShape(parsed);
      return json({ content: parsed, source: resolved.url, model: modelUsed, imageModel: IMAGE_MODEL, verified: 'model-self-check+structure-check' }, 200, request);
    } catch (error) {
      console.error(JSON.stringify({ event: 'adapt_failed', title, error: error instanceof Error ? error.message : String(error) }));
      return json({ error: 'GENERATION_FAILED', message: '改写未完成，请重试。', detail: error instanceof Error ? error.message : 'UNKNOWN' }, 502, request);
    }
  },
} satisfies ExportedHandler<EditorEnv>;
