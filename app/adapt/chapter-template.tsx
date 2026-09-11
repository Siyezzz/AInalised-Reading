'use client';
import { Fragment } from 'react';
import { BookOpen, BookmarkPlus, Check, Download, LoaderCircle, StepForward } from 'lucide-react';

export type Chapter = {
  chapterTitle: string;
  chapter: string[];
  image?: string;
  source?: string;
  originalEvidence?: { adapted: string; original: string; note: string }[];
  quiz: { question: string; options: string[]; correctIndex: number; rightFeedback: string; wrongFeedback: string[] };
  imageCue?: { prompt: string; afterParagraph?: number };
};

function imageAfterParagraph(content: Chapter) {
  const requested = Number(content.imageCue?.afterParagraph);
  if (Number.isInteger(requested) && requested > 0) return Math.min(requested, Math.max(1, content.chapter.length - 1));
  return Math.min(Math.max(2, Math.round(content.chapter.length / 3)), Math.max(1, content.chapter.length - 1));
}

type Props = {
  chapter: Chapter;
  title: string;
  sourceUrl: string;
  chapterNumber: number;
  shelfState: 'idle' | 'saving' | 'saved' | 'error';
  answer: number | null;
  chapterFeedback: string;
  busy: boolean;
  onAddToShelf: () => void;
  onDownload: () => void;
  onAnswer: (index: number) => void;
  onFeedback: (value: string) => void;
  onIllustrate: () => void;
};

export function ChapterTemplate({ chapter, title, sourceUrl, chapterNumber, shelfState, answer, chapterFeedback, busy, onAddToShelf, onDownload, onAnswer, onFeedback, onIllustrate }: Props) {
  const nextChapterUrl = `/adapt?title=${encodeURIComponent(title)}&source=${encodeURIComponent(sourceUrl)}&chapter=${chapterNumber + 1}&fresh=1`;
  return <>
    <div className="chapter-actions" aria-label="章节操作">
      <button onClick={onAddToShelf} disabled={shelfState === 'saving' || shelfState === 'saved'}>
        {shelfState === 'saved' ? <Check size={17} /> : shelfState === 'saving' ? <LoaderCircle className="spin" size={17} /> : <BookmarkPlus size={17} />}
        {shelfState === 'saved' ? '已加入书架' : shelfState === 'saving' ? '正在加入' : '加入书架'}
      </button>
      <button className="secondary" onClick={onDownload}><Download size={17} />下载</button>
      <a className="chapter-next-link" href={nextChapterUrl}><StepForward size={17} />下一章</a>
    </div>
    {shelfState === 'error' && <p className="chapter-save-message">加入失败，请登录后重试。</p>}
    <section className="chapter-body">
      {chapter.chapter.map((p, i) => <Fragment key={i}>
        <p>{p}</p>
        {chapter.image && i + 1 === imageAfterParagraph(chapter) && <figure className="story-figure">
          <img src={chapter.image} alt={chapter.imageCue?.prompt || '本章场景插图'} />
          <figcaption>本章场景插图</figcaption>
        </figure>}
      </Fragment>)}
    </section>
    {chapter.originalEvidence?.map((x, i) => <details className="original-source" key={i}>
      <summary><BookOpen size={18} />原文证据</summary>
      <p>{x.adapted}</p>
      <blockquote>{x.original}</blockquote>
      <small>{x.note}</small>
    </details>)}
    <section className="chapter-feedback">
      <span>章末反馈</span>
      <h2>这章改写得如何？</h2>
      <div>{['刚刚好', '太浅了', '有点难', '想更像原著'].map((item) => <button className={chapterFeedback === item ? 'active' : ''} key={item} onClick={() => onFeedback(item)}>{item}</button>)}</div>
      {chapterFeedback && <p>已记下：{chapterFeedback}。下一章会按这个方向调整。</p>}
    </section>
    <section className="chapter-quiz">
      <span>章节小考察</span>
      <h2>{chapter.quiz.question}</h2>
      <div>{chapter.quiz.options.map((o, i) => <button className={answer === null ? '' : i === chapter.quiz.correctIndex ? 'correct' : answer === i ? 'wrong' : ''} key={i} onClick={() => onAnswer(i)}><b>{String.fromCharCode(65 + i)}</b><span>{o}</span></button>)}</div>
      {answer !== null && <aside className={answer === chapter.quiz.correctIndex ? 'quiz-right' : 'quiz-wrong'}>{answer === chapter.quiz.correctIndex ? chapter.quiz.rightFeedback : chapter.quiz.wrongFeedback[answer]}</aside>}
    </section>
    {!chapter.image && !busy && <button className="adapt-primary" onClick={onIllustrate}>生成插图</button>}
  </>;
}
