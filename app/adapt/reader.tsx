'use client';
import { useEffect, useState } from 'react';
import { BookOpen, BookmarkPlus, Check, ExternalLink } from 'lucide-react';
import { useSearchParams } from 'next/navigation';

type Chapter = { chapterTitle: string; chapter: string[]; originalEvidence?: { adapted: string; original: string; note: string }[]; quiz: { question: string; options: string[]; correctIndex: number; rightFeedback: string; wrongFeedback: string[] }; imageCue?: { needed: boolean; reason: string; prompt: string } };

export default function AdaptReader() {
  const params = useSearchParams();
  const title = params.get('title') || '';
  const source = params.get('source') || '';
  const [chapter, setChapter] = useState<Chapter | null>(null);
  const [error, setError] = useState('');
  const [progress, setProgress] = useState(8);
  const [progressLabel, setProgressLabel] = useState('正在确认正文来源');
  const [answer, setAnswer] = useState<number | null>(null);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'login' | 'error'>('idle');
  async function saveToShelf() {
    setSaveStatus('saving');
    try {
      const response = await fetch('/api/library', {
        method: 'POST', credentials: 'include', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ title, sourceUrl: source }),
      });
      if (response.status === 401) return setSaveStatus('login');
      if (!response.ok) throw new Error('save failed');
      setSaveStatus('saved');
    } catch { setSaveStatus('error'); }
  }
  useEffect(() => {
    if (chapter || error) return;
    const timer = window.setInterval(() => setProgress((value) => Math.min(value + 1, 90)), 1600);
    return () => window.clearInterval(timer);
  }, [chapter, error]);
  useEffect(() => {
    if (title === '爱丽丝漫游奇境') { window.location.replace('/chapter/alice'); return; }
    (async () => {
      try {
        const initial = await fetch('/api/adapt', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ title, sourceUrl: source }) });
        const first = await initial.json();
        if (!initial.ok && initial.status !== 202) throw new Error(first.error || '生成失败');
        if (first.content) { setChapter(first.content); return; }
        setProgress(42); setProgressLabel(first.sourceText ? '第一章已提取，正在根据你的画像改写' : '已连接公版正文，正在根据你的画像改写');
        const generated = await fetch(first.editorUrl, { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${first.token}` }, body: JSON.stringify({ title, profile: first.profile, sourceText: first.sourceText }) });
        const result = await generated.json();
        if (!generated.ok || !result.content) throw new Error(result.error === 'SOURCE_NOT_FOUND' ? '网上暂时没有找到可用于改写的公版第一章' : '这次改写没有完成，请稍后重试');
        setProgress(100); setProgressLabel('改写完成');
        setChapter(result.content);
        void fetch('/api/adapt', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: 'cache', title, sourceUrl: source, content: result.content, token: first.token }) });
      } catch (e) { setError(e instanceof Error ? e.message : '生成失败'); }
    })();
  }, [title, source]);
  if (error) return <section className="adapt-state"><span>这次没有准备好</span><h1>{title}</h1><p>{error}。你可以换一个公版版本，或者导入自己拥有合法阅读权的 PDF、EPUB、MOBI、AZW3 或 TXT，知己会提取第一章并开始改写。</p><div><a href="/shelf">导入我的电子书</a><a className="secondary" href="/discover">换一个版本</a>{source && !source.startsWith('upload:') && <a className="secondary" href={source} target="_blank" rel="noreferrer">查看来源记录 <ExternalLink size={14} /></a>}</div></section>;
  if (!chapter) return <section className="adapt-state"><span>AI 编辑正在工作</span><h1>正在准备《{title}》第一章</h1><div className="adapt-progress" role="progressbar" aria-valuenow={progress} aria-valuemin={0} aria-valuemax={100}><i><b style={{ width: `${progress}%` }} /></i><strong>{progressLabel}</strong><small>{progress}%</small></div><p>第一次准备会经历寻找来源、提取第一章和个性化改写。完成后会自动显示，以后再打开会直接读取缓存。</p></section>;
  return <article className="chapter-shell"><header className="chapter-intro"><a href="/shelf">返回书架</a><span>《{title}》个性化第一章</span><h1>{chapter.chapterTitle}</h1><p>这一章根据你的阅读画像生成。再次使用相同画像时会读取缓存，不会重复消耗模型额度。</p><div className="chapter-save-row"><button onClick={saveToShelf} disabled={saveStatus === 'saving' || saveStatus === 'saved'}>{saveStatus === 'saved' ? <Check size={17} /> : <BookmarkPlus size={17} />}{saveStatus === 'saving' ? '正在收藏' : saveStatus === 'saved' ? '已收藏到书架' : '收藏这本书'}</button><span>先读一读，喜欢再收藏。</span></div>{saveStatus === 'login' && <p className="chapter-save-message">登录后才能收藏。<a href={`/signin-with-chatgpt?return_to=${encodeURIComponent(`/adapt?title=${title}&source=${source}`)}`} target="_top">现在登录</a></p>}{saveStatus === 'error' && <p className="chapter-save-message">没有收藏成功，请再试一次。</p>}</header><section className="chapter-body">{chapter.chapter.map((p, i) => <p key={i}>{p}</p>)}</section>{chapter.originalEvidence?.map((item, i) => <details className="original-source" key={i}><summary><BookOpen size={18} />查看这一处的原文证据</summary><p>{item.adapted}</p><blockquote>{item.original}</blockquote><small>{item.note}</small></details>)}<section className="chapter-quiz"><span>读完想一想</span><h2>{chapter.quiz.question}</h2><div>{chapter.quiz.options.map((option, i) => <button key={option} className={answer === i ? (i === chapter.quiz.correctIndex ? 'correct' : 'wrong') : ''} onClick={() => setAnswer(i)}><b>{String.fromCharCode(65 + i)}</b>{option}</button>)}</div>{answer !== null && <aside className={answer === chapter.quiz.correctIndex ? 'quiz-right' : 'quiz-wrong'}>{answer === chapter.quiz.correctIndex ? chapter.quiz.rightFeedback : chapter.quiz.wrongFeedback[answer]}</aside>}</section>{source && <a className="chapter-original-link" href={source} target="_blank" rel="noreferrer">查看完整原始来源 <ExternalLink size={14} /></a>}</article>;
}
