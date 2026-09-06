'use client';
import { useEffect, useRef, useState } from 'react';
import {
  BookOpen,
  Check,
  FileText,
  LogOut,
  Search,
  Download,
} from 'lucide-react';
import BrandMark from '../brand-mark';

type ShelfBook = {
  id: string;
  title: string;
  source: string;
  sourceUrl?: string | null;
  size: number;
  progress: number;
  status: string;
  createdAt: number;
};
export default function ShelfClient({
  email,
  displayName,
}: {
  email: string;
  displayName: string;
}) {
  const [books, setBooks] = useState<ShelfBook[]>([]),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState(''),
    [loading, setLoading] = useState(true),
    [loadError, setLoadError] = useState('');
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    fetch('/api/library', { cache: 'no-store', credentials: 'include' })
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || '书架加载失败');
        setBooks(data.books || []);
      })
      .catch((error) =>
        setLoadError(error instanceof Error ? error.message : '书架加载失败'),
      )
      .finally(() => setLoading(false));
  }, []);
  async function upload(file?: File) {
    if (!file) return;
    setBusy(true);
    setMessage('正在安全上传…');
    const form = new FormData();
    form.append('file', file);
    try {
      const response = await fetch('/api/library', {
        method: 'POST',
        body: form,
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || '上传失败');
      setBooks((current) => [data.book, ...current]);
      setMessage('已放进你的书架');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '上传失败');
    } finally {
      setBusy(false);
      if (input.current) input.current.value = '';
    }
  }
  return (
    <main className="product-shell">
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
          <a className="active" href="/shelf">
            我的书架
          </a>
          <a href="/profile">阅读画像</a>
        </nav>
        <div className="nav-actions">
          <a className="nav-search" href="/discover" aria-label="搜索书籍">
            <Search size={18} />
            <span>搜索</span>
          </a>
          <a
            className="account-pill"
            href="/signout-with-chatgpt?return_to=/"
            target="_top"
            title="退出登录"
          >
            <span>{displayName.slice(0, 1).toUpperCase()}</span>
            <b>{email}</b>
            <LogOut size={15} />
          </a>
        </div>
      </header>
      <section className="shelf-head">
        <div>
          <span className="eyebrow">我的书架</span>
          <h1>欢迎回来</h1>
          <p>
            {books.length
              ? `这里有 ${books.length} 本属于你的书。`
              : '从导入第一本书开始。'}
          </p>
        </div>
        <label className={busy ? 'upload-control busy' : 'upload-control'}>
          <Download size={18} />
          <span>{busy ? '正在上传' : '导入 PDF'}</span>
          <input
            ref={input}
            type="file"
            accept="application/pdf,.pdf"
            disabled={busy}
            onChange={(e) => upload(e.target.files?.[0])}
          />
        </label>
      </section>
      {message && (
        <div className="upload-message">
          <Check size={15} />
          {message}
        </div>
      )}
      <section className="shelf-grid">
        {loading && <div className="shelf-loading">正在打开你的书架…</div>}
        {loadError && (
          <div className="empty-shelf">
            <h2>书架暂时没有打开</h2>
            <p>{loadError}。刷新页面再试一次。</p>
            <button onClick={() => window.location.reload()}>重新加载</button>
          </div>
        )}
        {books.map((book) => (
          <article className="shelf-book" key={book.id}>
            <div className="pdf-cover">
              {book.sourceUrl ? <BookOpen size={25} /> : <FileText size={25} />}
              <small>{book.sourceUrl ? 'WEB' : 'PDF'}</small>
            </div>
            <div>
              <span>{book.source}</span>
              <h2>{book.title}</h2>
              <p>
                {book.sourceUrl
                  ? `在线来源 · ${book.status}`
                  : `${(book.size / 1024 / 1024).toFixed(1)} MB · ${book.status}`}
              </p>
              <i>
                <b style={{ width: `${book.progress}%` }} />
              </i>
              <small>阅读进度 {book.progress}%</small>
            </div>
            <a
              className="continue-reading"
              href={
                book.sourceUrl
                  ? `/read?title=${encodeURIComponent(book.title)}&source=${encodeURIComponent(book.sourceUrl)}&available=1`
                  : `/pdf?id=${encodeURIComponent(book.id)}&title=${encodeURIComponent(book.title)}`
              }
            >
              继续阅读
            </a>
          </article>
        ))}
        {!loading && !loadError && !books.length && !busy && (
          <div className="empty-shelf">
            <FileText size={30} />
            <h2>书架还是空的</h2>
            <p>从搜索结果开始阅读并加入书架，或导入你拥有合法阅读权的 PDF。</p>
            <button onClick={() => input.current?.click()}>选择 PDF</button>
          </div>
        )}
      </section>
    </main>
  );
}
