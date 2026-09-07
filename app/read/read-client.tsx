'use client';
import { useEffect, useRef, useState } from 'react';
import { BookOpen, BookmarkPlus, Check, ExternalLink } from 'lucide-react';
import { useSearchParams } from 'next/navigation';

type RewriteBook = {
  title: string;
  source: string;
  sourceUrl: string;
  provider: 'openai' | 'local';
  summary: string;
  paragraphs: string[];
};

export default function ReadClient() {
  const params = useSearchParams();
  const title = params.get('title') || '未命名书籍';
  const sourceUrl = params.get('source') || '';
  const available = params.get('available') === '1';
  const attemptedAutoSave = useRef(false);
  const [status, setStatus] = useState<
    'idle' | 'saving' | 'saved' | 'login' | 'error'
  >('idle');
  const [rewriteStatus, setRewriteStatus] = useState<
    'idle' | 'loading' | 'ready' | 'login' | 'error'
  >('idle');
  const [rewrite, setRewrite] = useState<RewriteBook | null>(null);

  async function add() {
    setStatus('saving');
    try {
      const response = await fetch('/api/library', {
        method: 'POST',
        credentials: 'include',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ title, sourceUrl }),
      });
      if (response.status === 401) {
        setStatus('login');
        return;
      }
      if (!response.ok) throw new Error('save failed');
      setStatus('saved');
      window.setTimeout(() => {
        window.location.href = '/shelf';
      }, 650);
    } catch {
      setStatus('error');
    }
  }

  async function loadRewrite() {
    if (!sourceUrl) return;
    setRewriteStatus('loading');
    try {
      const response = await fetch('/api/books/rewrite', {
        method: 'POST',
        credentials: 'include',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ title, sourceUrl, goal: '读懂故事', level: '平时会读一些' }),
      });
      if (response.status === 401) {
        setRewriteStatus('login');
        return;
      }
      const payload = await response.json();
      if (!response.ok) throw new Error(payload?.error || 'rewrite failed');
      setRewrite(payload.book);
      setRewriteStatus('ready');
    } catch {
      setRewriteStatus('error');
    }
  }

  useEffect(() => {
    if (params.get('autosave') === '1' && !attemptedAutoSave.current) {
      attemptedAutoSave.current = true;
      void add();
    }
  }, [params]);

  useEffect(() => {
    if (sourceUrl) {
      void loadRewrite();
    }
  }, [sourceUrl, title]);

  return (
    <>
      <section className="read-hero">
        <span>{available ? '可在线阅读' : '图书馆馆藏'}</span>
        <h1>{title}</h1>
        <p>
          {available
            ? '先打开原文开始阅读。读到任何位置，都可以回到这里把它加入书架，并立即生成第一章改写。'
            : '这个结果目前只有馆藏资料，是否能在线借阅以图书馆页面为准。'}
        </p>
        <div className="read-actions">
          {sourceUrl && (
            <a href={sourceUrl} target="_blank" rel="noreferrer">
              <BookOpen size={17} />
              打开原文阅读 <ExternalLink size={14} />
            </a>
          )}
          <button
            onClick={add}
            disabled={status === 'saving' || status === 'saved'}
          >
            {status === 'saved' ? (
              <>
                <Check size={17} />
                已加入书架
              </>
            ) : (
              <>
                <BookmarkPlus size={17} />
                {status === 'saving' ? '正在保存' : '加入我的书架'}
              </>
            )}
          </button>
        </div>
        {status === 'login' && (
          <p className="inline-notice">
            登录后才能保存。
            <a
              href={`/signin-with-chatgpt?return_to=${encodeURIComponent(`/read?title=${encodeURIComponent(title)}&source=${encodeURIComponent(sourceUrl)}&available=${available ? '1' : '0'}&autosave=1`)}`}
              target="_top"
            >
              现在登录
            </a>
          </p>
        )}
        {status === 'error' && (
          <p className="inline-notice">没有保存成功，请稍后再试。</p>
        )}
        {status === 'saved' && (
          <p className="inline-notice success-notice">
            已经保存好了。<a href="/shelf">去我的书架</a>
          </p>
        )}
      </section>

      <section className="reading-guide">
        <div>
          <small>第一章改写</small>
          <h2>{rewriteStatus === 'loading' ? '正在加载正文并改写...' : '按你的阅读画像整理第一章'}</h2>
        </div>
        {rewriteStatus === 'login' && (
          <p className="inline-notice">
            需要先登录 ChatGPT 才能生成个性化改写。
            <a
              href={`/signin-with-chatgpt?return_to=${encodeURIComponent(`/read?title=${encodeURIComponent(title)}&source=${encodeURIComponent(sourceUrl)}&available=${available ? '1' : '0'}`)}`}
              target="_top"
            >
              现在登录
            </a>
          </p>
        )}
        {rewriteStatus === 'loading' && (
          <p className="inline-notice">正在抓取原文并生成适合你的版本，可能需要几秒钟。</p>
        )}
        {rewriteStatus === 'error' && (
          <p className="inline-notice">这本书暂时不能直接生成改写版本，但你仍然可以先打开原文阅读。</p>
        )}
        {rewriteStatus === 'ready' && rewrite && (
          <div>
            <p className="inline-notice success-notice">
              已根据 {rewrite.provider === 'openai' ? '你的 ChatGPT 账户' : '本地规则'} 生成改写版本。
            </p>
            <p>{rewrite.summary}</p>
            <ol>
              {rewrite.paragraphs.map((paragraph, index) => (
                <li key={`${rewrite.title}-${index}`}>
                  <p>{paragraph}</p>
                </li>
              ))}
            </ol>
          </div>
        )}
      </section>

      <section className="reading-guide">
        <div>
          <small>从阅读开始</small>
          <h2>先读，再决定是否留下</h2>
        </div>
        <ol>
          <li>
            <b>01</b>
            <p>先打开原文，看看版本和语言是否合适。</p>
          </li>
          <li>
            <b>02</b>
            <p>读到想留下的位置时，把这本书加入书架。</p>
          </li>
          <li>
            <b>03</b>
            <p>进入书架后，选择需要怎样改写第一章。</p>
          </li>
        </ol>
      </section>
    </>
  );
}
