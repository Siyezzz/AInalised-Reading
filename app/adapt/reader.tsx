'use client';
import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { BookOpen, BookmarkPlus, Check, ExternalLink, LoaderCircle } from 'lucide-react';
type Chapter = { chapterTitle: string; chapter: string[]; image?: string; source?: string; originalEvidence?: { adapted: string; original: string; note: string }[]; quiz: { question: string; options: string[]; correctIndex: number; rightFeedback: string; wrongFeedback: string[] }; imageCue?: { prompt: string } };
type Ticket = { editorUrl: string; token: string; profile: Record<string, unknown>; sourceText?: string; content?: Chapter; error?: string };
type Result = { job?: { status: string; output?: Chapter; error?: { message?: string } }; content?: Chapter; source?: { title: string; text: string; url: string }; image?: string; message?: string; detail?: string; error?: string };
type AiSettings = { aiProvider?: string; apiBaseUrl?: string; apiModel?: string; apiKey?: string };
function validChapter(x: Chapter) { return x && typeof x.chapterTitle === 'string' && Array.isArray(x.chapter) && x.chapter.length >= 4 && x.chapter.every(p => typeof p === 'string' && p.trim()) && x.quiz && typeof x.quiz.question === 'string' && x.quiz.options?.length === 4 && x.quiz.options.every(o => typeof o === 'string') && Number.isInteger(x.quiz.correctIndex) && x.quiz.correctIndex >= 0 && x.quiz.correctIndex < 4 && x.quiz.wrongFeedback?.length === 4; }
function readAiSettings(): AiSettings {
  try {
    const raw = JSON.parse(localStorage.getItem('zhiji-ai-settings') || '{}') as AiSettings;
    return {
      aiProvider: raw.aiProvider,
      apiBaseUrl: raw.apiBaseUrl,
      apiModel: raw.apiModel,
      apiKey: raw.apiKey,
    };
  } catch { return {}; }
}
export default function AdaptReader() {
  const params = useSearchParams(), title = params.get('title') || '', source = params.get('source') || '';
  const [chapter, setChapter] = useState<Chapter | null>(null), [error, setError] = useState(''), [label, setLabel] = useState('正在获取原文'), [busy, setBusy] = useState(true), [prepared, setPrepared] = useState<Result['source']>(), [answer, setAnswer] = useState<number | null>(null), [notice, setNotice] = useState(''), [attempt, setAttempt] = useState(0);
  const [progress, setProgress] = useState(8), [shelfState, setShelfState] = useState<'idle'|'saving'|'saved'|'error'>('idle');
  const ticket = useRef<Ticket | null>(null), working = useRef(false), autoStarted = useRef('');
  const [jobId, setJobId] = useState<string | null>(null);
  const storageKey = 'reading-job:' + title + ':' + source;
  async function call(body: Record<string, unknown>): Promise<Result> {
    const t = ticket.current!;
    const aiSettings = body.action === 'start-job' || body.action === 'image' ? readAiSettings() : {};
    const r = await fetch(t.editorUrl, { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${t.token}` }, body: JSON.stringify({ title, sourceUrl: source, profile: t.profile, ...aiSettings, ...body }), signal: AbortSignal.timeout(240_000) });
    const x = await r.json() as Result;
    if (!r.ok) throw new Error([x.message || x.error || '服务请求失败', x.detail].filter(Boolean).join('：'));
    return x;
  }
  async function cache(content: Chapter) {
    const r = await fetch('/api/adapt', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: 'cache', title, sourceUrl: source, content, token: ticket.current?.token }) });
    if (!r.ok) setNotice('本章已生成，但未保存成功。请下载本章，稍后重试保存。');
    else setNotice('本章已保存到你的账户。');
  }
  useEffect(() => {
    let active = true;
    setBusy(true); setError(''); setChapter(null); setPrepared(undefined);
    (async () => { try {
      const r = await fetch('/api/adapt', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ title, sourceUrl: source }) });
      const t = await r.json() as Ticket;
      if (!r.ok) throw new Error(t.error || '请登录后重试');
      if (!active) return;
      ticket.current = t;
      if (t.content) { setChapter(t.content); setProgress(100); return; }
      const pending = localStorage.getItem(storageKey);
      if (pending) { setJobId(pending); setProgress(42); setLabel('后台任务执行中，可以关闭页面稍后回来'); return; }
      const x = await call({ action: 'source', sourceText: t.sourceText });
      if (active) { setPrepared(x.source); setProgress(25); setLabel('原文已识别，正在启动改写'); }
    } catch(e) { if (active) setError(e instanceof Error ? e.message : '获取失败'); } finally { if (active) setBusy(false); } })();
    return () => { active = false; };
  }, [title, source, attempt]);
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
    working.current = true; setBusy(true); setProgress(32); setLabel('正在创建改写任务'); setError('');
    const id = crypto.randomUUID();
    try { await call({ action: 'start-job', jobId: id, sourceText: prepared.text }); localStorage.setItem(storageKey, id); setJobId(id); }
    catch(e) { setError(e instanceof Error ? e.message : '提交失败'); setBusy(false); } finally { working.current = false; }
  }
  useEffect(() => {
    if (!prepared || chapter || jobId || busy || error || autoStarted.current === storageKey) return;
    autoStarted.current = storageKey;
    void generate();
  }, [prepared, chapter, jobId, busy, error, storageKey]);
  async function addToShelf() {
    if (source.startsWith('upload:')) { setShelfState('saved'); return; }
    setShelfState('saving');
    try { const r = await fetch('/api/library', { method: 'POST', credentials: 'include', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ title, sourceUrl: original }) }); if (!r.ok) throw new Error(); setShelfState('saved'); }
    catch { setShelfState('error'); }
  }
  function download(value: string, name: string) {
    const u = URL.createObjectURL(new Blob([value], { type: 'application/json;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = u;
    a.download = name;
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(u), 10_000);
  }
  const original = chapter?.source || prepared?.url || source;
  return <article className="chapter-shell"><header className="chapter-intro"><a href="/shelf">返回书架</a><span>《{title}》第一章</span><h1>{chapter?.chapterTitle || prepared?.title || '准备你的阅读版本'}</h1></header>
    {(busy || (!chapter && prepared)) && <div className="adapt-progress" role="status"><strong>{label}</strong><small>{progress}%</small><i><b style={{width: `${progress}%`}} /></i></div>}
    {error && <div role="alert"><p>{error}</p>{!busy && <button onClick={() => { if (jobId) { localStorage.removeItem(storageKey); autoStarted.current = ''; setJobId(null); setAttempt(x => x+1); } else if (chapter) { void illustrate(chapter).catch(e => setError(String(e))); } else if (prepared) { void generate(); } else setAttempt(x => x+1); }}>重试失败步骤</button>} <a href={`/signin-with-chatgpt?return_to=${encodeURIComponent(`/adapt?title=${title}&source=${source}`)}`} target="_top">登录</a></div>}
    {notice && <p role="status">{notice}</p>}
    {prepared && !chapter && !busy && <section className="adapt-ready"><div><span>原文已就绪</span><h2>{prepared.title}</h2><p>已识别第一章，共 {prepared.text.length.toLocaleString()} 字符。系统正在自动开始改写和配图，无需再操作。</p></div><details><summary>查看提取的第一章</summary><pre>{prepared.text}</pre></details></section>}
    {chapter && <><div className="chapter-actions"><button onClick={addToShelf} disabled={shelfState==='saving'||shelfState==='saved'}>{shelfState==='saved'?<Check size={17}/>:shelfState==='saving'?<LoaderCircle className="spin" size={17}/>:<BookmarkPlus size={17}/>} {shelfState==='saved'?'已加入书架':shelfState==='saving'?'正在加入':'加入我的书架'}</button><button className="secondary" onClick={() => download(JSON.stringify(chapter, null, 2), `${title}-第一章.json`)}>下载本章</button></div>{shelfState==='error'&&<p className="chapter-save-message">加入失败，请登录后重试。</p>}<section className="chapter-body">{chapter.image && <figure className="story-figure"><img src={chapter.image} alt={chapter.imageCue?.prompt || '本章场景插图'} /><figcaption>本章场景插图</figcaption></figure>}{chapter.chapter.map((p,i) => <p key={i}>{p}</p>)}</section>{chapter.originalEvidence?.map((x,i) => <details className="original-source" key={i}><summary><BookOpen size={18} />原文证据</summary><p>{x.adapted}</p><blockquote>{x.original}</blockquote><small>{x.note}</small></details>)}<section className="chapter-quiz"><span>读完想一想</span><h2>{chapter.quiz.question}</h2><div>{chapter.quiz.options.map((o,i) => <button key={i} onClick={() => setAnswer(i)}>{String.fromCharCode(65+i)}. {o}</button>)}</div>{answer !== null && <p>{answer === chapter.quiz.correctIndex ? chapter.quiz.rightFeedback : chapter.quiz.wrongFeedback[answer]}</p>}</section>{!chapter.image && !busy && <button className="adapt-primary" onClick={() => { setBusy(true); illustrate(chapter).catch(e => setError(String(e))).finally(() => setBusy(false)); }}>生成插图</button>}</>}
    {original && !original.startsWith('upload:') && original !== 'user-upload' && <a className="chapter-original-link" href={original} target="_blank" rel="noreferrer">核对原文 <ExternalLink size={14} /></a>}
  </article>;
}

