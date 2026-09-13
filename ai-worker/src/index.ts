import { type JobEnv } from './reading-workflow';
import { ADAPTATION_SKILL, IMAGE_STYLE_PROMPT, fallbackSvg, generateAdaptedChapter, normalizeUserAiConfig, upstreamMessage } from './reading-workflow';
export { ReadingWorkflow } from './reading-workflow';
import { resolveSource } from './sources';
interface EditorEnv extends Cloudflare.Env, JobEnv { EDITOR_SECRET: string }

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

/** 从上游响应头里读出「今天还剩多少次免费请求」。读不到就返回 undefined，不要编数字。 */
function readQuota(response: Response) {
  const limit = Number(response.headers.get('x-ratelimit-limit'));
  const remaining = Number(response.headers.get('x-ratelimit-remaining'));
  if (Number.isFinite(limit) && Number.isFinite(remaining)) {
    const reset = Number(response.headers.get('x-ratelimit-reset'));
    return { limit, remaining, resetAt: Number.isFinite(reset) ? reset : undefined };
  }
  // Token Harbor 报的不是次数，而是「免费额度用了百分之几」加一个重置时间。
  const usedPct = Number(response.headers.get('x-th-free-used-pct'));
  if (Number.isFinite(usedPct)) {
    return { limit: 100, remaining: Math.max(0, 100 - usedPct), usedPct, resetsAt: response.headers.get('x-th-free-resets') || undefined };
  }
  return undefined;
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
    const body = await request.json<{ title?: string; profile?: { goal?: string; level?: string; likes?: string[] }; feedback?: string; wrongAnswerType?: string; sourceText?: string; sourceUrl?: string; chapterNumber?: number; action?: string; prompt?: string; apiKey?: string; apiBaseUrl?: string; apiModel?: string; aiProvider?: string; jobId?: string }>();
    const title = body.title?.trim();
    if (!title) return json({ error: 'TITLE_REQUIRED' }, 400, request);
    const bearer = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '') || '';
    if (bearer !== env.EDITOR_SECRET && !(await validSignedToken(bearer, env.EDITOR_SECRET, title))) return json({ error: 'UNAUTHORIZED' }, 401, request);
    let requestedModel = '';
    try {
      const chapterNumber = Math.max(1, Math.min(200, Math.trunc(Number(body.chapterNumber) || 1)));
      const aiConfig = normalizeUserAiConfig({ provider: body.aiProvider, apiKey: body.apiKey, baseUrl: body.apiBaseUrl, model: body.apiModel });
      requestedModel = aiConfig?.model || '';
      // 「测试这条线路」：配置完当场打一次最小请求，把上游的原话回给读者。
      // 以前只有等到真正改写时才知道模型已下架，读者会以为是自己 key 填错了。
      if (body.action === 'test-line') {
        if (!aiConfig) return json({ ok: false, model: body.apiModel || '', message: 'Base URL、模型名和 key 都要填完整（Base URL 必须是 https）。' }, 200, request);
        const started = Date.now();
        try {
          const r = await fetch(`${aiConfig.baseUrl}/chat/completions`, {
            method: 'POST',
            headers: { authorization: `Bearer ${aiConfig.apiKey}`, 'content-type': 'application/json' },
            // max_tokens 必须给够：Agnes 这类模型默认先「想」再答，16 个 token 会被思考全吃掉，
            // 正文一直是空的，读者看到「返回『』」会以为线路坏了。512 够它想完还有余量出正文。
            body: JSON.stringify({ model: aiConfig.model, messages: [{ role: 'user', content: '只回复两个字：可用' }], max_tokens: 512 }),
            // 思考型模型单次就要 10～25 秒，30 秒会擦边超时，把一条好线路误报成「网络不通」。
            signal: AbortSignal.timeout(60_000),
          });
          // OpenRouter 这类服务商把免费额度写在响应头上。一次小请求只能证明「线路通」，
          // 不能证明「改写一章够用」——所以把剩余额度一起带回去，读者才知道还能跑几章。
          const quota = readQuota(r);
          if (!r.ok) return json({ ok: false, status: r.status, model: aiConfig.model, message: await upstreamMessage(r), quota }, 200, request);
          const data = await r.json() as { choices?: { message?: { content?: string } }[] };
          const reply = (data.choices?.[0]?.message?.content || '').trim().slice(0, 40);
          return json({ ok: true, status: r.status, model: aiConfig.model, ms: Date.now() - started, reply: reply || '（模型先思考再作答，这次没轮到正文，但线路是通的）', quota }, 200, request);
        } catch (testError) {
          const message = testError instanceof Error ? testError.message : String(testError);
          return json({ ok: false, status: 0, model: aiConfig.model, message: /abort|timeout/i.test(message) ? '60 秒内没有响应，可能是网络不通或模型太慢。' : message.slice(0, 200) }, 200, request);
        }
      }
      if (body.action === 'start-job' || body.action === 'job-status') {
        const claims = bearer === env.EDITOR_SECRET ? { uid: 'admin' } : JSON.parse(new TextDecoder().decode(fromBase64Url(bearer.split('.')[1])));
        if (!claims.uid) return json({ error: 'UNAUTHORIZED' }, 401, request);
        const hash = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(claims.uid + ':' + title))), x => x.toString(16).padStart(2, '0')).join('').slice(0, 24);
        if (!body.jobId || !/^[a-f0-9-]{36}$/.test(body.jobId)) return json({ error: 'INVALID_JOB_ID' }, 400, request);
        const id = hash + '-' + body.jobId;
        if (body.action === 'job-status') { const status = await (await env.READING.get(id)).status(); return json({ job: status }, 200, request); }
        if (!body.sourceText || body.sourceText.length < 150 || body.sourceText.length > 80_000) return json({ error: '需要完整的第一章正文（150–80000字符）' }, 400, request);
        try { const existing = await (await env.READING.get(id)).status(); if (existing.status !== 'errored') return json({ job: existing }, 202, request); } catch { /* Instance has not been created. */ }
        const output = await generateAdaptedChapter(env, { title, chapterNumber, sourceText: body.sourceText, sourceUrl: body.sourceUrl || 'user-upload', profile: body.profile || {}, aiConfig });
        return json({ job: { status: 'complete', output } }, 200, request);
      }
      if (body.action === 'image') {
        if (!body.prompt || body.prompt.length > 2000) return json({ error: 'INVALID_IMAGE_PROMPT' }, 400, request);
        const imagePrompt = `${IMAGE_STYLE_PROMPT}\nScene: ${body.prompt}`.slice(0, 2000);
        if (aiConfig?.apiKey && aiConfig.baseUrl && aiConfig.imageModel) {
          try {
            const r = await fetch(`${aiConfig.baseUrl}/images/generations`, { method: 'POST', headers: { authorization: `Bearer ${aiConfig.apiKey}`, 'content-type': 'application/json' }, body: JSON.stringify({ model: aiConfig.imageModel, prompt: imagePrompt, n: 1, size: '1024x768' }), signal: AbortSignal.timeout(75_000) });
            if (!r.ok) throw new Error(`USER_IMAGE_HTTP_${r.status}`);
            const data = await r.json() as { data?: { url?: string; b64_json?: string }[] };
            const item = data.data?.[0];
            const image = item?.b64_json ? `data:image/png;base64,${item.b64_json}` : item?.url;
            if (!image) throw new Error('USER_IMAGE_EMPTY');
            return json({ image, imageModel: aiConfig.imageModel }, 200, request);
          } catch (imageError) {
            console.error(JSON.stringify({ event: 'user_image_svg_fallback', error: imageError instanceof Error ? imageError.message : String(imageError) }));
          }
        }
        return json({ image: fallbackSvg(title), imageModel: 'built-in-svg-fallback' }, 200, request);
      }
      const uploadedText = body.sourceText?.trim().slice(0, 80_000);
      const resolved = uploadedText && uploadedText.length >= 500
        ? { text: uploadedText, url: 'user-upload' }
        : await resolveSource(title, body.sourceUrl, chapterNumber);
      if (!resolved) return json({ error: 'SOURCE_NOT_FOUND', message: '暂时没有找到可核验的第一章正文。系统会继续扩充来源，不会把查找工作交给读者。' }, 422, request);
      if (body.action === 'source') return json({ source: resolved }, 200, request);
      const source = resolved.text;
      const messages = [
        { role: 'system', content: `${ADAPTATION_SKILL}\nReturn only one valid json object. Use json keys exactly as requested. No Markdown fences, no prose before or after the json.` },
        { role: 'user', content: `书名：${title}\n章节：第 ${chapterNumber} 章\n阅读目标：${body.profile?.goal || '读懂故事'}\n阅读基础：${body.profile?.level || '平时会读一些'}\n兴趣：${body.profile?.likes?.join('、') || '尚未确定'}\n上一章反馈：${body.feedback || '无'}\n上次错题类型：${body.wrongAnswerType || '无'}\n\n原文：\n${source}\n\n固定模板：chapterTitle 用简体；chapter 只放改写后的现代简体中文白话文，不要整段照抄原文，不要繁体字；originalEvidence 只放折叠证据；quiz 是章末小考察；imageCue.afterParagraph 标出插图应插在第几段后面。\n请返回 {"chapterTitle":"...","chapter":["改写后的简体中文自然段1","改写后的简体中文自然段2"],"originalEvidence":[{"adapted":"改写中的关键句","original":"不超过30字或20个英文词的原文证据","note":"比较说明"}],"quiz":{"question":"需要推理的问题","options":["A项","B项","C项","D项"],"correctIndex":0,"rightFeedback":"...","wrongFeedback":["对应A的反馈","对应B的反馈","对应C的反馈","对应D的反馈"]},"imageCue":{"needed":true,"reason":"只有关键剧情才为true并说明原因","prompt":"Elegant Chinese classic picture-book illustration, warm ink wash and mineral pigment colors, clear characters and action, no text. Describe one concrete scene.","afterParagraph":3}}。错误选项分别体现范围夸大、因果倒置、无证据补充或只看一面。` },
      ];
      if (aiConfig?.provider !== 'openai-compatible' || !aiConfig.apiKey || !aiConfig.baseUrl || !aiConfig.model) {
        return json({ error: 'USER_KEY_REQUIRED', message: '请先在「阅读画像」里填写自己的 API key，站点不再提供共用 AI 线路。' }, 402, request);
      }
      const userKey = aiConfig.apiKey, userBaseUrl = aiConfig.baseUrl, modelUsed = aiConfig.model;
      const completion = await (async () => {
        const body = { model: modelUsed, messages, response_format: { type: 'json_object' }, temperature: 0.55, max_tokens: 16000 };
        const requestUserModel = (payload: Record<string, unknown>) => fetch(`${userBaseUrl}/chat/completions`, {
          method: 'POST',
          headers: { authorization: `Bearer ${userKey}`, 'content-type': 'application/json' },
          body: JSON.stringify(payload),
          signal: AbortSignal.timeout(150_000),
        });
        let r = await requestUserModel(body);
        if (r.status === 400 || r.status === 422) {
          const plainBody = { ...body } as Record<string, unknown>;
          delete plainBody.response_format;
          r = await requestUserModel(plainBody);
        }
        if (!r.ok) throw new Error(r.status === 429 ? 'USER_MODEL_QUOTA' : `USER_MODEL_HTTP_${r.status}`);
        return await r.json() as { response?: string; text?: string; content?: string; choices?: Array<{ finish_reason?: string; message?: { content?: string }; text?: string }> };
      })();
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
      return json({ content: parsed, source: resolved.url, model: modelUsed, imageModel: aiConfig.imageModel || 'built-in-svg-fallback', verified: 'model-self-check+structure-check' }, 200, request);
    } catch (error) {
      const detail = error instanceof Error ? error.message : 'UNKNOWN';
      // 真正要判断的是错误码，不是整句话——上游原话跟在「：」后面，别让原话干扰分类。
      const code = detail.split('：')[0];
      console.error(JSON.stringify({ event: 'adapt_failed', title, error: detail }));
      if (code === 'USER_KEY_REQUIRED' || code === 'USER_MODEL_CONFIG_INVALID') {
        return json({ error: 'USER_KEY_REQUIRED', message: '请先在「阅读画像」里填写自己的 API key，站点不再提供共用 AI 线路。' }, 402, request);
      }
      // 免费额度用完是最容易被误判成「key 填错了」的一种失败：线路测试只花 1 次请求，
      // 能过；改写一章要 4～10 次，一次就用光。所以这里必须说清楚，并给出能走通的下一步。
      if (code === 'USER_MODEL_QUOTA_DAILY') {
        return json({ error: 'USER_MODEL_QUOTA_DAILY', message: `${requestedModel ? `模型 ${requestedModel} 所在服务商的` : '当前服务商的'}免费额度今天已经用完了，所以现在怎么重试都不会成功。OpenRouter 免费档每天上限 50 次请求，改写一章要用 4～10 次；在 OpenRouter 充 5 美元可以升到每天 1000 次，或者到「阅读画像」把服务商换成 Groq、Google Gemini 的免费额度（那边额度宽松得多）。明天额度重置后也可以继续用这条线路。`, detail }, 429, request);
      }
      if (code === 'USER_MODEL_QUOTA') {
        return json({ error: 'USER_MODEL_QUOTA', message: '请求太密集，被服务商限流了（不是 key 的问题）。等十几秒再点「重试失败步骤」通常就能过。', detail }, 429, request);
      }
      if (code.startsWith('USER_MODEL_HTTP_') || code.startsWith('USER_IMAGE_HTTP_') || code.startsWith('USER_MODEL_EMPTY')) {
        return json({ error: 'USER_MODEL_FAILED', message: `调用你自己的 API 线路失败了（模型 ${requestedModel || '未知'}）。`, detail }, 502, request);
      }
      // 超时不是线路配错，读者能做的是换一个更快的模型或稍后重试。
      if (/abort|timeout|超时|BUDGET_EXHAUSTED/i.test(detail)) {
        return json({ error: 'MODEL_TIMEOUT', message: '模型这次没能按时写完（免费模型高峰期常见）。可以换一个响应更快的模型，或稍后重试。', detail }, 504, request);
      }
      return json({ error: 'GENERATION_FAILED', message: '改写未完成，请重试。', detail }, 502, request);
    }
  },
} satisfies ExportedHandler<EditorEnv>;
