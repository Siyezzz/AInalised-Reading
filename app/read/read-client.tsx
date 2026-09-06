'use client';
import { useState } from 'react';
import { BookOpen, BookmarkPlus, Check, ExternalLink } from 'lucide-react';
import { useSearchParams } from 'next/navigation';

export default function ReadClient() {
  const params = useSearchParams();
  const title = params.get('title') || '未命名书籍';
  const sourceUrl = params.get('source') || '';
  const available = params.get('available') === '1';
  const [status, setStatus] = useState<
    'idle' | 'saving' | 'saved' | 'login' | 'error'
  >('idle');
  async function add() {
    setStatus('saving');
    const response = await fetch('/api/library', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ title, sourceUrl }),
    });
    if (response.status === 401) {
      setStatus('login');
      return;
    }
    setStatus(response.ok ? 'saved' : 'error');
  }
  return (
    <>
      <section className="read-hero">
        <span>{available ? '可在线阅读' : '图书馆馆藏'}</span>
        <h1>{title}</h1>
        <p>
          {available
            ? '这个版本可以在来源网站阅读全文。你可以先开始读，确定想继续后再放进书架。'
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
              href={`/signin-with-chatgpt?return_to=${encodeURIComponent(`/read?title=${title}&source=${sourceUrl}&available=${available ? '1' : '0'}`)}`}
              target="_top"
            >
              现在登录
            </a>
          </p>
        )}
        {status === 'error' && (
          <p className="inline-notice">没有保存成功，请稍后再试。</p>
        )}
      </section>
      <section className="reading-guide">
        <div>
          <small>阅读时可以随时回来</small>
          <h2>书架不是阅读前的门槛</h2>
        </div>
        <ol>
          <li>
            <b>01</b>
            <p>先打开原文，看看版本和语言是否合适。</p>
          </li>
          <li>
            <b>02</b>
            <p>想继续读时，再加入书架保存进度。</p>
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
