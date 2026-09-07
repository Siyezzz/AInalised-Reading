'use client';

import { useEffect, useState } from 'react';
import {
  BookOpen,
  ChevronRight,
  Headphones,
  Landmark,
  Library,
  Search,
} from 'lucide-react';
import { useSearchParams } from 'next/navigation';
import BrandMark from '../brand-mark';

type Work = {
  key: string; sourceUrl: string; provider: string;
  title: string;
  author_name?: string[];
  first_publish_year?: number;
  public_scan_b?: boolean;
  ebook_access?: string;
  edition_count?: number;
};

export default function DiscoverPage() {
  const params = useSearchParams();
  const initial = params.get('q') || '';
  const [query, setQuery] = useState(initial);
  const [works, setWorks] = useState<Work[]>([]);
  const [loading, setLoading] = useState(Boolean(initial));
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!initial) return;
    const controller = new AbortController();
    setLoading(true);
    fetch(
      `/api/sources?q=${encodeURIComponent(initial)}`,
      { signal: controller.signal },
    )
      .then((r) => {
        if (!r.ok) throw new Error('search failed');
        return r.json();
      })
      .then((value) => { const data = value as { results: { title: string; sourceUrl: string; author: string; provider: string }[] }; setWorks(data.results.map(x => ({ ...x, key: x.sourceUrl, author_name: [x.author] }))); })
      .catch((error) => {
        if (error.name !== 'AbortError') setFailed(true);
      })
      .finally(() => setLoading(false));
    return () => controller.abort();
  }, [initial]);

  function submit() {
    const value = query.trim();
    if (value)
      window.location.href = `/discover?q=${encodeURIComponent(value)}`;
  }
  const q = encodeURIComponent(initial);
  return (
    <main className="product-shell discover-page">
      <header className="main-nav">
        <a href="/" className="brand">
          <span>
            <BrandMark size={21} />
          </span>
          知己读书
        </a>
        <nav>
          <a href="/">首页</a>
          <a href="/library">书库</a>
          <a href="/shelf">我的书架</a>
          <a href="/profile">阅读画像</a>
        </nav>
        <div className="nav-actions">
          <a
            className="nav-search active"
            href="/discover"
            aria-label="搜索书籍"
          >
            <Search size={18} />
            <span>搜索</span>
          </a>
          <a className="demo-link" href="/demo">
            看《西游记》演示
          </a>
        </div>
      </header>
      <section className="discover-head">
        <span className="eyebrow">全网找书</span>
        <h1>{initial ? `正在找《${initial}》` : '想找哪一本？'}</h1>
        <div className="book-search">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && submit()}
            placeholder="书名或作者"
          />
          <button onClick={submit}>
            <Search size={17} />
            重新搜索
          </button>
        </div>
        <p>
          先查图书馆目录，再给出公共领域原文。页面只保留书名、作者、年代和阅读状态，不混入来源网站的广告。
        </p>
      </section>
      <section className="source-strip">
        <a
          href={`https://openlibrary.org/search?q=${q}`}
          target="_blank"
          rel="noreferrer"
        >
          <Library size={18} />
          <div>
            <strong>Open Library</strong>
            <span>图书馆目录与可借阅版本</span>
          </div>
          <ChevronRight size={16} />
        </a>
        <a
          href={`https://zh.wikisource.org/w/index.php?search=${q}`}
          target="_blank"
          rel="noreferrer"
        >
          <BookOpen size={18} />
          <div>
            <strong>维基文库</strong>
            <span>中文公共领域原文</span>
          </div>
          <ChevronRight size={16} />
        </a>
        <a
          href={`https://www.gutenberg.org/ebooks/search/?query=${q}`}
          target="_blank"
          rel="noreferrer"
        >
          <BookOpen size={18} />
          <div>
            <strong>Project Gutenberg</strong>
            <span>多语种公共领域电子书</span>
          </div>
          <ChevronRight size={16} />
        </a>
        <a
          href={`https://standardebooks.org/ebooks?query=${q}`}
          target="_blank"
          rel="noreferrer"
        >
          <BookOpen size={18} />
          <div>
            <strong>Standard Ebooks</strong>
            <span>精校排版的公共领域名著</span>
          </div>
          <ChevronRight size={16} />
        </a>
        <a
          href={`https://archive.org/search?query=${q}`}
          target="_blank"
          rel="noreferrer"
        >
          <Landmark size={18} />
          <div>
            <strong>Internet Archive</strong>
            <span>扫描本、旧版本与馆藏资料</span>
          </div>
          <ChevronRight size={16} />
        </a>
        <a
          href={`https://librivox.org/search?title=${q}&author=&reader=&keywords=&genre_id=0&status=all&project_type=either&recorded_language=&sort_order=catalog_date&search_page=1&search_form=advanced`}
          target="_blank"
          rel="noreferrer"
        >
          <Headphones size={18} />
          <div>
            <strong>LibriVox</strong>
            <span>志愿者录制的公共领域有声书</span>
          </div>
          <ChevronRight size={16} />
        </a>
      </section>
      <section className="web-results">
        <div className="results-title">
          <h2>公版原文来源</h2>
          <span>
            {loading
              ? '正在查询'
              : failed
                ? '暂时连接不上'
                : `${works.length} 个相关版本`}
          </span>
        </div>
        {loading && (
          <div className="result-loading">
            <i />
            <i />
            <i />
          </div>
        )}
        {!loading &&
          works.map((work) => (
            <article className="web-book" key={work.key}>
              <div className="book-monogram">{work.title.slice(0, 1)}</div>
              <div>
                <small>
                  {work.provider}
                </small>
                <h2>{work.title}</h2>
                <p>
                  {work.author_name?.slice(0, 2).join('、') || '作者信息待补充'}
                  {work.first_publish_year
                    ? ` · 初版 ${work.first_publish_year}`
                    : ''}
                </p>
                <span>{work.edition_count || 1} 个版本</span>
              </div>
              <div className="web-book-actions">
                <a
                  href={work.sourceUrl}
                  target="_blank"
                  rel="noreferrer"
                >
                  查看原文
                </a>
                <a
                  href={`/adapt?title=${encodeURIComponent(work.title)}&source=${encodeURIComponent(work.sourceUrl)}`}
                >
                  生成并阅读第一章
                </a>
              </div>
            </article>
          ))}
        {!loading && !failed && !works.length && (
          <div className="no-web-result">
            <strong>暂时没有找到匹配的公版原文</strong>
            <p>
              可以继续查看上方的维基文库和 Project
              Gutenberg。版权状态不明确的结果只显示馆藏信息，不提供下载。
            </p>
          </div>
        )}
      </section>
    </main>
  );
}
