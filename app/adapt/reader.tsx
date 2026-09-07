'use client';
import { useEffect, useState } from 'react';
import { BookOpen, ExternalLink } from 'lucide-react';
import { useSearchParams } from 'next/navigation';

type Chapter = { chapterTitle: string; chapter: string[]; originalEvidence?: { adapted: string; original: string; note: string }[]; quiz: { question: string; options: string[]; correctIndex: number; rightFeedback: string; wrongFeedback: string[] }; imageCue?: { needed: boolean; reason: string; prompt: string } };

export default function AdaptReader() {
  const params = useSearchParams();
  const title = params.get('title') || '';
  const source = params.get('source') || '';
  const [chapter, setChapter] = useState<Chapter | null>(null);
  const [error, setError] = useState('');
  const [answer, setAnswer] = useState<number | null>(null);
  useEffect(() => {
    if (title === '爱丽丝漫游奇境') { window.location.replace('/chapter/alice'); return; }
    (async () => {
      try {
        const initial = await fetch('/api/adapt', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ title, sourceUrl: source }) });
        const first = await initial.json();
        if (!initial.ok && initial.status !== 202) throw new Error(first.error || '生成失败');
        if (first.content) { setChapter(first.content); return; }
        const generated = await fetch(first.editorUrl, { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${first.token}` }, body: JSON.stringify({ title, profile: first.profile }) });
        const result = await generated.json();
        if (!generated.ok || !result.content) throw new Error(result.message || '生成失败');
        setChapter(result.content);
        void fetch('/api/adapt', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: 'cache', title, sourceUrl: source, content: result.content, token: first.token }) });
      } catch (e) { setError(e instanceof Error ? e.message : '生成失败'); }
    })();
  }, [title, source]);
  if (error) return <section className="adapt-state"><span>这一章暂时没有准备好</span><h1>{title}</h1><p>{error.replace(/[。.]$/, '')}。系统没有找到可靠正文时不会凭模型记忆编写，也不会把查找来源的工作交给你。</p><div><a href="/discover">换一本书</a>{source && <a className="secondary" href={source} target="_blank" rel="noreferrer">查看来源记录 <ExternalLink size={14} /></a>}</div></section>;
  if (!chapter) return <section className="adapt-state"><span>AI 编辑正在工作</span><h1>正在准备《{title}》第一章</h1><p>正在读取可靠正文并改写完整章节。长章节首次生成可能需要一到三分钟，你可以留在这个页面；完成后会自动显示，以后再打开会直接读取缓存。</p></section>;
  return <article className="chapter-shell"><header className="chapter-intro"><a href="/shelf">返回书架</a><span>《{title}》个性化第一章</span><h1>{chapter.chapterTitle}</h1><p>这一章根据你的阅读画像生成。再次使用相同画像时会读取缓存，不会重复消耗模型额度。</p></header><section className="chapter-body">{chapter.chapter.map((p, i) => <p key={i}>{p}</p>)}</section>{chapter.originalEvidence?.map((item, i) => <details className="original-source" key={i}><summary><BookOpen size={18} />查看这一处的原文证据</summary><p>{item.adapted}</p><blockquote>{item.original}</blockquote><small>{item.note}</small></details>)}<section className="chapter-quiz"><span>读完想一想</span><h2>{chapter.quiz.question}</h2><div>{chapter.quiz.options.map((option, i) => <button key={option} className={answer === i ? (i === chapter.quiz.correctIndex ? 'correct' : 'wrong') : ''} onClick={() => setAnswer(i)}><b>{String.fromCharCode(65 + i)}</b>{option}</button>)}</div>{answer !== null && <aside className={answer === chapter.quiz.correctIndex ? 'quiz-right' : 'quiz-wrong'}>{answer === chapter.quiz.correctIndex ? chapter.quiz.rightFeedback : chapter.quiz.wrongFeedback[answer]}</aside>}</section>{source && <a className="chapter-original-link" href={source} target="_blank" rel="noreferrer">查看完整原始来源 <ExternalLink size={14} /></a>}</article>;
}
