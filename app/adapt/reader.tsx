'use client';
import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { ExternalLink } from 'lucide-react';
import { AI_SETTINGS_CHANGED, OPEN_AI_SETUP, hasUsableAiSettings, readAiSettings } from '../lib/ai-presets';
import { ChapterTemplate, type Chapter } from './chapter-template';
type Ticket = { editorUrl: string; token: string; profile: Record<string, unknown>; sourceText?: string; content?: Chapter; error?: string };
type Result = { job?: { status: string; output?: Chapter; error?: { message?: string } }; content?: Chapter; source?: { title: string; text: string; url: string }; image?: string; message?: string; detail?: string; error?: string };
/**
 * 哪些错误是「改 key」能解决的。只有这些才隐藏「重试」按钮——
 * 重试注定失败的按钮比没有按钮更糟。注意不要用裸「key」匹配，
 * 否则一般的 5xx 也会被误判成配置问题。
 */
const KEY_ISSUE_PATTERN = /USER_KEY_REQUIRED|USER_MODEL_QUOTA|USER_MODEL_CONFIG_INVALID|USER_MODEL_HTTP_40[13]|UNAUTHORIZED|额度|余额|欠费|key 无效|未授权/;
/**
 * 线路本身调用失败（模型已下架、Base URL 写错、上游 5xx）。
 * 这类错误在错误文案里带上模型名和上游原话，并给一个「换一条线路」的入口——
 * 之前只显示「请检查 Base URL、模型名和 key」，读者会一直以为是 key 填错了，重复重试同一条坏线路。
 */
const LINE_ISSUE_PATTERN = /USER_MODEL_FAILED|USER_MODEL_HTTP_|USER_MODEL_EMPTY|MODEL_TIMEOUT|调用你自己的 API 线路/;
/**
 * 免费额度是按天重置的。这种情况今天再点「重试」永远不会成功，
 * 所以不能跟其他错误共用一套按钮——要直接告诉读者今天别再试了，去换线路。
 * 之前它被当成「线路调用失败」，读者看到「模型可能已被下架」，越查越远。
 */
const DAILY_QUOTA_PATTERN = /USER_MODEL_QUOTA_DAILY|free-models-per-day|per-day|每日免费额度|当天额度/;
function validChapter(x: Chapter) { return x && typeof x.chapterTitle === 'string' && Array.isArray(x.chapter) && x.chapter.length >= 4 && x.chapter.every(p => typeof p === 'string' && p.trim()) && x.quiz && typeof x.quiz.question === 'string' && x.quiz.options?.length === 4 && x.quiz.options.every(o => typeof o === 'string') && Number.isInteger(x.quiz.correctIndex) && x.quiz.correctIndex >= 0 && x.quiz.correctIndex < 4 && x.quiz.wrongFeedback?.length === 4; }
export default function AdaptReader() {
  const params = useSearchParams(), title = params.get('title') || '', source = params.get('source') || '';
  const chapterNumber = Math.max(1, Number.parseInt(params.get('chapter') || '1', 10) || 1);
  const fresh = params.get('fresh') === '1';
  const [chapter, setChapter] = useState<Chapter | null>(null), [error, setError] = useState(''), [label, setLabel] = useState('正在获取原文'), [busy, setBusy] = useState(true), [prepared, setPrepared] = useState<Result['source']>(), [answer, setAnswer] = useState<number | null>(null), [notice, setNotice] = useState(''), [attempt, setAttempt] = useState(0);
  const [progress, setProgress] = useState(8), [shelfState, setShelfState] = useState<'idle'|'saving'|'saved'|'error'>('idle');
  const [chapterFeedback, setChapterFeedback] = useState('');
  // 错误原因如果是「没填 / 填错了自己的 key」，重试没有意义，应直接引导去配置。
  const [keyIssue, setKeyIssue] = useState(false);
  // 线路本身打不通（模型下架 / Base URL 错 / 上游 5xx）：重试前先让读者看到用的是哪条线路。
  const [lineIssue, setLineIssue] = useState(false);
  // 免费额度今天已用完：重试按钮要给对，不然读者会一直点一个注定失败的按钮。
  const [dailyQuota, setDailyQuota] = useState(false);
  const [line, setLine] = useState('');
  const ticket = useRef<Ticket | null>(null), working = useRef(false), autoStarted = useRef('');
  const [jobId, setJobId] = useState<string | null>(null);
  const storageKey = 'reading-job:v2:' + title + ':' + source + ':' + chapterNumber;
  // 供事件回调读取最新状态（事件监听只注册一次，闭包里拿不到新的 state）。
  const latest = useRef({ chapter, error });
  useEffect(() => { latest.current = { chapter, error }; }, [chapter, error]);
  function openKeySetup() { window.dispatchEvent(new Event(OPEN_AI_SETUP)); }
  async function call(body: Record<string, unknown>): Promise<Result> {
    const t = ticket.current!;
    const aiSettings = body.action === 'start-job' || body.action === 'image' ? readAiSettings() : {};
    const r = await fetch(t.editorUrl, { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${t.token}` }, body: JSON.stringify({ title, sourceUrl: source, chapterNumber, profile: t.profile, ...aiSettings, ...body }), signal: AbortSignal.timeout(240_000) });
    const x = await r.json() as Result;
    if (!r.ok) {
      const text = [x.error, x.message, x.detail].filter(Boolean).join(' ');
      setKeyIssue(KEY_ISSUE_PATTERN.test(text));
      setLineIssue(LINE_ISSUE_PATTERN.test(text));
      setDailyQuota(DAILY_QUOTA_PATTERN.test(text));
      const settings = readAiSettings();
      setLine(settings.apiModel ? `${settings.apiModel} @ ${settings.apiBaseUrl}` : '未配置');
      throw new Error([x.message || x.error || '服务请求失败', x.detail].filter(Boolean).join('：'));
    }
    return x;
  }
  async function cache(content: Chapter) {
    const r = await fetch('/api/adapt', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: 'cache', title, sourceUrl: source, chapterNumber, content, token: ticket.current?.token }) });
    if (!r.ok) setNotice('本章已生成，但未保存成功。请下载本章，稍后重试保存。');
    else setNotice('本章已保存到你的账户。');
  }
  useEffect(() => {
    let active = true;
    setBusy(true); setError(''); setChapter(null); setPrepared(undefined);
    (async () => { try {
      const r = await fetch('/api/adapt', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ title, sourceUrl: source, chapterNumber, fresh }) });
      const t = await r.json() as Ticket;
      if (!r.ok) throw new Error(t.error || '请登录后重试');
      if (!active) return;
      ticket.current = t;
      if (t.content) { setChapter(t.content); setProgress(100); return; }
      const pending = fresh ? null : localStorage.getItem(storageKey);
      if (pending) { setJobId(pending); setProgress(42); setLabel('后台任务执行中，可以关闭页面稍后回来'); return; }
      const x = await call({ action: 'source', sourceText: t.sourceText });
      if (active) { setPrepared(x.source); setProgress(25); setLabel('原文已识别，正在启动改写'); }
    } catch(e) { if (active) setError(e instanceof Error ? e.message : '获取失败'); } finally { if (active) setBusy(false); } })();
    return () => { active = false; };
  }, [title, source, chapterNumber, fresh, attempt]);
  /**
   * 读者中途去填 / 改 key 时必须能自动接上。
   * 触发场景：① 就地打开引导弹窗填完 key；② 跳去「阅读画像」设置后按浏览器返回，
   * 页面被 bfcache 还原（此时组件不会重新挂载，错误状态一直都在）。
   * 之前这两种情况都会停在错误页：autoStarted 已置位、error 又有值，
   * 自动改写的那条 useEffect 永远不会再跑。
   */
  useEffect(() => {
    const resume = () => {
      if (latest.current.chapter) return;       // 已经读到章节，别打断
      if (!latest.current.error) return;        // 本来没出错，不用管
      if (!hasUsableAiSettings()) return;       // key 还是没配好，没什么可接续
      const pending = localStorage.getItem(storageKey);
      if (pending) localStorage.removeItem(storageKey); // 清掉上一次失败的任务，否则会一直读到旧的失败状态
      autoStarted.current = '';
      working.current = false;
      setJobId(null);
      setError('');
      setKeyIssue(false);
      setLineIssue(false);
      setDailyQuota(false);
      setNotice('');
      setAttempt((x) => x + 1);                 // 走一遍完整流程：重取票据 → 取原文 → 自动改写
    };
    const onPageShow = (event: PageTransitionEvent) => { if (event.persisted) resume(); };
    window.addEventListener(AI_SETTINGS_CHANGED, resume);
    window.addEventListener('pageshow', onPageShow as EventListener);
    return () => {
      window.removeEventListener(AI_SETTINGS_CHANGED, resume);
      window.removeEventListener('pageshow', onPageShow as EventListener);
    };
  }, [storageKey]);
  async function illustrate(content: Chapter) {
    if (!content.imageCue?.prompt) throw new Error('没有生成插图描述，请重试改写');
    setLabel('正在绘制本章插图');
    const result = await call({ action: 'image', prompt: content.imageCue.prompt });
    if (!result.image || !(/^data:image\/(jpeg|png|svg\+xml);base64,/.test(result.image) || /^https?:\/\//.test(result.image))) throw new Error('没有收到插图');
    const complete = { ...content, image: result.image }; setChapter(complete); await cache(complete);
  }
  useEffect(() => {
    if (!jobId) return;
    let active = true, timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      try {
        const x = await call({ action: 'job-status', jobId }); if (!active) return;
        if (x.job?.status === 'complete' && x.job.output) {
          if (!validChapter(x.job.output)) throw new Error('后台结果格式不完整');
          setChapter(x.job.output); setProgress(100); await cache(x.job.output); localStorage.removeItem(storageKey); setJobId(null); setBusy(false); return;
        }
        if (['errored', 'terminated'].includes(x.job?.status || '')) throw new Error(x.job?.error?.message || '后台任务失败，请重新提交');
        setProgress(current => Math.min(92, current + (x.job?.status === 'queued' ? 2 : 7)));
        setLabel('后台任务：' + (x.job?.status === 'queued' ? '排队中' : '正在改写、校验或配图') + '。关闭页面后会继续。');
        timer = setTimeout(poll, 5000);
      } catch(e) { if (active) { setError(e instanceof Error ? e.message : '查询失败'); setBusy(false); } }
    };
    setBusy(true); void poll(); return () => { active = false; clearTimeout(timer); };
  }, [jobId]);
  async function generate() {
    if (working.current || !prepared) return;
    if (!hasUsableAiSettings()) {
      setBusy(false);
      setProgress(0);
      setKeyIssue(true);
      setError('还没有填写可用的 API key。站点不提供共用 AI 额度，请先填一个自己的 key（Groq、Gemini 都有免费额度）。');
      return;
    }
    setKeyIssue(false);
    working.current = true; setBusy(true); setProgress(32); setLabel('正在创建改写任务'); setError('');
    const id = crypto.randomUUID();
    try {
      const result = await call({ action: 'start-job', jobId: id, sourceText: prepared.text, feedback: localStorage.getItem(`reading-feedback:${title}:${source}:${chapterNumber - 1}`) || '' });
      if (result.job?.status === 'complete' && result.job.output) {
        if (!validChapter(result.job.output)) throw new Error('生成结果格式不完整');
        setChapter(result.job.output); setProgress(100); await cache(result.job.output); setBusy(false); return;
      }
      localStorage.setItem(storageKey, id); setJobId(id);
    }
    catch(e) { setError(e instanceof Error ? e.message : '提交失败'); setBusy(false); } finally { working.current = false; }
  }
  function retry() {
    if (jobId) { localStorage.removeItem(storageKey); autoStarted.current = ''; setJobId(null); setAttempt(x => x+1); }
    else if (chapter) { void illustrate(chapter).catch(e => setError(String(e))); }
    else if (prepared) { void generate(); }
    else setAttempt(x => x+1);
  }
  useEffect(() => {
    if (!prepared || chapter || jobId || busy || error || autoStarted.current === storageKey) return;
    autoStarted.current = storageKey;
    void generate();
  }, [prepared, chapter, jobId, busy, error, storageKey]);
  async function addToShelf() {
    // 操作条已经是图标按钮了，点完必须给一句文字反馈，否则读者不知道有没有成功。
    if (source.startsWith('upload:')) { setShelfState('saved'); setNotice(`《${title}》在书架里。`); return; }
    setShelfState('saving');
    try {
      const r = await fetch('/api/library', { method: 'POST', credentials: 'include', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ title, sourceUrl: original }) });
      if (!r.ok) throw new Error();
      setShelfState('saved');
      setNotice(`《${title}》已加入书架，可以在书架里继续读。`);
    }
    catch { setShelfState('error'); }
  }
  function chapterMarkdown(c: Chapter) {
    const lines = [`# ${c.chapterTitle}`, '', `> 《${title}》第 ${chapterNumber} 章`, ''];
    c.chapter.forEach((p) => lines.push(p, ''));
    if (c.imageCue?.prompt) lines.push(`插图描述：${c.imageCue.prompt}`, '');
    if (c.originalEvidence?.length) {
      lines.push('## 原文证据', '');
      c.originalEvidence.forEach((e) => lines.push(`- 改写：${e.adapted}`, `  - 原文：${e.original}`, `  - 说明：${e.note}`));
      lines.push('');
    }
    lines.push('## 章节小考察', '', c.quiz.question, '');
    c.quiz.options.forEach((o, i) => lines.push(`- ${String.fromCharCode(65 + i)}. ${o}${i === c.quiz.correctIndex ? '（正确答案）' : ''}`));
    lines.push('', `解析：${c.quiz.rightFeedback}`);
    if (chapterFeedback) lines.push('', `本章反馈：${chapterFeedback}`);
    return lines.join('\n');
  }
  function download(value: string, name: string) {
    const u = URL.createObjectURL(new Blob([value], { type: 'text/markdown;charset=utf-8' }));
    if (window.self !== window.top) {
      // 站点被嵌在预览窗口里时 download 属性会被忽略，只能在新标签页兜底另存。
      window.open(u, '_blank', 'noopener');
      setNotice('已在新标签页打开本章内容，用浏览器的「另存为」保存即可。');
    } else {
      const a = document.createElement('a');
      a.href = u;
      a.download = name;
      a.style.display = 'none';
      document.body.appendChild(a);
      a.click();
      a.remove();
      setNotice('本章已导出到下载目录。这本书要长期留在站内，请点「加入书架」。');
    }
    setTimeout(() => URL.revokeObjectURL(u), 60_000);
  }
  const original = chapter?.source || prepared?.url || source;
  return <article className="chapter-shell"><header className="chapter-intro"><a href="/shelf">返回书架</a><span>《{title}》第 {chapterNumber} 章</span><h1>{chapter?.chapterTitle || prepared?.title || '准备你的阅读版本'}</h1></header>
    {(busy || (!chapter && prepared)) && <div className="adapt-progress" role="status"><strong>{label}</strong><small>{progress}%</small><i><b style={{width: `${progress}%`}} /></i></div>}
    {error && <div role="alert"><p>{error}</p>{dailyQuota
      ? <><button className="alert-action" onClick={openKeySetup}>换一条线路</button> <a href="/profile">去阅读画像设置</a></>
      : keyIssue
        ? <><button className="alert-action" onClick={openKeySetup}>填写 API key</button> <a href="/profile">去阅读画像设置</a></>
        : lineIssue
          ? <>{!busy && <button onClick={retry}>重试失败步骤</button>}<button className="alert-action" onClick={openKeySetup}>换一条线路</button> <a href="/profile">去阅读画像设置</a></>
          : !busy && <><button onClick={retry}>重试失败步骤</button> <a href="/profile">检查 AI 线路设置</a></>}
      {dailyQuota && <small className="alert-line">免费额度每天才重置一次，今天再点重试也不会成功。到「阅读画像」把服务商换成 Groq 或 Google Gemini 就好，那边的免费额度宽松得多。</small>}
      {lineIssue && !dailyQuota && <small className="alert-line">当前线路：{line}。模型可能已被服务商下架，换一个模型名或点「换一条线路」重新选。</small>}</div>}
    {notice && <p role="status">{notice}</p>}
    {prepared && !chapter && !busy && <section className="adapt-ready"><div><span>原文已就绪</span><h2>{prepared.title}</h2><p>已识别第 {chapterNumber} 章，共 {prepared.text.length.toLocaleString()} 字符。系统正在自动开始改写和配图，无需再操作。</p></div><details><summary>查看提取的第 {chapterNumber} 章原文</summary><pre>{prepared.text}</pre></details></section>}
    {chapter && <ChapterTemplate chapter={chapter} title={title} sourceUrl={source} chapterNumber={chapterNumber} shelfState={shelfState} answer={answer} chapterFeedback={chapterFeedback} busy={busy} onAddToShelf={addToShelf} onDownload={() => download(chapterMarkdown(chapter), `${title}-第${chapterNumber}章.md`)} onAnswer={setAnswer} onFeedback={(item) => { setChapterFeedback(item); localStorage.setItem(`reading-feedback:${title}:${source}:${chapterNumber}`, item); }} onIllustrate={() => { setBusy(true); illustrate(chapter).catch(e => setError(String(e))).finally(() => setBusy(false)); }} />}
    {original && !original.startsWith('upload:') && original !== 'user-upload' && <a className="chapter-original-link" href={original} target="_blank" rel="noreferrer">核对原文 <ExternalLink size={14} /></a>}
  </article>;
}

