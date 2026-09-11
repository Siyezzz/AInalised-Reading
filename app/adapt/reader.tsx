'use client';
import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { ExternalLink } from 'lucide-react';
import { readAiSettings } from '../lib/ai-presets';
import { ChapterTemplate, type Chapter } from './chapter-template';
type Ticket = { editorUrl: string; token: string; profile: Record<string, unknown>; sourceText?: string; content?: Chapter; error?: string };
type Result = { job?: { status: string; output?: Chapter; error?: { message?: string } }; content?: Chapter; source?: { title: string; text: string; url: string }; image?: string; message?: string; detail?: string; error?: string };
function validChapter(x: Chapter) { return x && typeof x.chapterTitle === 'string' && Array.isArray(x.chapter) && x.chapter.length >= 4 && x.chapter.every(p => typeof p === 'string' && p.trim()) && x.quiz && typeof x.quiz.question === 'string' && x.quiz.options?.length === 4 && x.quiz.options.every(o => typeof o === 'string') && Number.isInteger(x.quiz.correctIndex) && x.quiz.correctIndex >= 0 && x.quiz.correctIndex < 4 && x.quiz.wrongFeedback?.length === 4; }
export default function AdaptReader() {
  const params = useSearchParams(), title = params.get('title') || '', source = params.get('source') || '';
  const chapterNumber = Math.max(1, Number.parseInt(params.get('chapter') || '1', 10) || 1);
  const fresh = params.get('fresh') === '1';
  const [chapter, setChapter] = useState<Chapter | null>(null), [error, setError] = useState(''), [label, setLabel] = useState('正在获取原文'), [busy, setBusy] = useState(true), [prepared, setPrepared] = useState<Result['source']>(), [answer, setAnswer] = useState<number | null>(null), [notice, setNotice] = useState(''), [attempt, setAttempt] = useState(0);
  const [progress, setProgress] = useState(8), [shelfState, setShelfState] = useState<'idle'|'saving'|'saved'|'error'>('idle');
  const [chapterFeedback, setChapterFeedback] = useState('');
  const ticket = useRef<Ticket | null>(null), working = useRef(false), autoStarted = useRef('');
  const [jobId, setJobId] = useState<string | null>(null);
  const storageKey = 'reading-job:v2:' + title + ':' + source + ':' + chapterNumber;
  async function call(body: Record<string, unknown>): Promise<Result> {
    const t = ticket.current!;
    const aiSettings = body.action === 'start-job' || body.action === 'image' ? readAiSettings() : {};
    const r = await fetch(t.editorUrl, { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${t.token}` }, body: JSON.stringify({ title, sourceUrl: source, chapterNumber, profile: t.profile, ...aiSettings, ...body }), signal: AbortSignal.timeout(240_000) });
    const x = await r.json() as Result;
    if (!r.ok) throw new Error([x.message || x.error || '服务请求失败', x.detail].filter(Boolean).join('：'));
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
    if (!readAiSettings().apiKey) {
      setBusy(false);
      setProgress(0);
      setError('还没有填写 API key。站点不提供共用 AI 额度，请先到「阅读画像」填一个自己的 key（Groq、Gemini 都有免费额度）。');
      return;
    }
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
    {error && <div role="alert"><p>{error}</p>{!busy && <button onClick={() => { if (jobId) { localStorage.removeItem(storageKey); autoStarted.current = ''; setJobId(null); setAttempt(x => x+1); } else if (chapter) { void illustrate(chapter).catch(e => setError(String(e))); } else if (prepared) { void generate(); } else setAttempt(x => x+1); }}>重试失败步骤</button>} <a href="/profile">去填 API key</a></div>}
    {notice && <p role="status">{notice}</p>}
    {prepared && !chapter && !busy && <section className="adapt-ready"><div><span>原文已就绪</span><h2>{prepared.title}</h2><p>已识别第 {chapterNumber} 章，共 {prepared.text.length.toLocaleString()} 字符。系统正在自动开始改写和配图，无需再操作。</p></div><details><summary>查看提取的第 {chapterNumber} 章原文</summary><pre>{prepared.text}</pre></details></section>}
    {chapter && <ChapterTemplate chapter={chapter} title={title} sourceUrl={source} chapterNumber={chapterNumber} shelfState={shelfState} answer={answer} chapterFeedback={chapterFeedback} busy={busy} onAddToShelf={addToShelf} onDownload={() => download(chapterMarkdown(chapter), `${title}-第${chapterNumber}章.md`)} onAnswer={setAnswer} onFeedback={(item) => { setChapterFeedback(item); localStorage.setItem(`reading-feedback:${title}:${source}:${chapterNumber}`, item); }} onIllustrate={() => { setBusy(true); illustrate(chapter).catch(e => setError(String(e))).finally(() => setBusy(false)); }} />}
    {original && !original.startsWith('upload:') && original !== 'user-upload' && <a className="chapter-original-link" href={original} target="_blank" rel="noreferrer">核对原文 <ExternalLink size={14} /></a>}
  </article>;
}

