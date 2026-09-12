'use client';
import { useEffect, useRef, useState } from 'react';
import {
  BookOpen,
  Check,
  Eye,
  FileText,
  LogOut,
  Search,
  Upload,
  Trash2,
} from 'lucide-react';
import BrandMark from '../brand-mark';
import { extractFirstChapter } from '../lib/extract-book';

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
  const [removing, setRemoving] = useState<string | null>(null);
  const [uploadProgress, setUploadProgress] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    fetch('/api/library', { cache: 'no-store', credentials: 'include' })
      .then(async (response) => {
        const text = await response.text();
        const data = text ? JSON.parse(text) as { error?: string; books?: ShelfBook[]; book: ShelfBook; readUrl: string } : {} as { error?: string; books?: ShelfBook[]; book: ShelfBook; readUrl: string };
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
    setUploadProgress(4);
    setMessage('正在读取文件');
    try {
      let extractedText = '';
      try {
        extractedText = await extractFirstChapter(file, (value, label) => { setUploadProgress(value); setMessage(label); });
      } catch (error) {
        // 正文抽取是导入的前置条件：站点只保存正文，不保存原始文件。
        throw new Error(error instanceof Error ? error.message : '这个文件里的正文无法识别');
      }
      setUploadProgress(64);
      setMessage('正在保存到书架');
      // 原始二进制留在本地，只把抽取出的正文发到服务端。
      const response = await fetch('/api/library', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          action: 'import',
          title: file.name,
          fileName: file.name,
          mimeType: file.type,
          size: file.size,
          extractedText,
        }),
      });
      const text = await response.text();
      const data = text ? JSON.parse(text) as { error?: string; book: ShelfBook; readUrl: string } : {} as { error?: string; book: ShelfBook; readUrl: string };
      if (!response.ok) throw new Error(data.error || '上传失败');
      setBooks((current) => [data.book, ...current]);
      setUploadProgress(100);
      setMessage('第一章已经提取，正在进入 AI 改写');
      window.setTimeout(() => { window.location.href = data.readUrl; }, 500);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '上传失败');
    } finally {
      setBusy(false);
      if (input.current) input.current.value = '';
    }
  }
  async function removeBook(book: ShelfBook) {
    if (!window.confirm(`确定把《${book.title}》移出书架吗？${book.sourceUrl?.startsWith('upload:') ? ' 导入时抽取的正文也会一并删除。' : ''}`)) return;
    setRemoving(book.id);
    setMessage('');
    try {
      const response = await fetch(`/api/library?id=${encodeURIComponent(book.id)}`, { method: 'DELETE', credentials: 'include' });
      const data = await response.json() as { error?: string; book: ShelfBook; readUrl: string };
      if (!response.ok) throw new Error(data.error || '移除失败');
      setBooks((current) => current.filter((item) => item.id !== book.id));
      setMessage(`《${book.title}》已移出书架`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '移除失败');
    } finally { setRemoving(null); }
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
            href="/signin"
            title="账号与退出登录"
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
          <Upload size={18} />
          <span>{busy ? '正在准备' : '导入电子书'}</span>
          <input
            ref={input}
            type="file"
            accept="application/pdf,.pdf,application/epub+zip,.epub,.mobi,.azw3,.kf8,text/plain,.txt"
            disabled={busy}
            onChange={(e) => upload(e.target.files?.[0])}
          />
        </label>
      </section>
      {message && (
        <div className="upload-message">
          <Check size={15} />
          <div><span>{message}</span>{busy && <i><b style={{ width: `${uploadProgress}%` }} /></i>}</div>
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
        {books.map((book) => {
          // 导入的书 sourceUrl 是 upload:<id>（而不是外链），要单独识别，
          // 否则会被当成本站抓取的公版书，既标错成 WEB 也没有查看原文的入口。
          const imported = book.sourceUrl?.startsWith('upload:') ?? false;
          return (
          <article className="shelf-book" key={book.id}>
            <div className="pdf-cover">
              {imported ? <FileText size={25} /> : <BookOpen size={25} />}
              <small>{imported ? 'FILE' : 'WEB'}</small>
            </div>
            <div>
              <span>{book.source}</span>
              <h2>{book.title}</h2>
              <p>
                {imported
                  ? `${(book.size / 1024 / 1024).toFixed(1)} MB · ${book.status}`
                  : `在线来源 · ${book.status}`}
              </p>
              <i>
                <b style={{ width: `${book.progress}%` }} />
              </i>
              <small>阅读进度 {book.progress}%</small>
            </div>
            <div className="shelf-book-actions">
              <a className="continue-reading" href={`/adapt?title=${encodeURIComponent(book.title)}&source=${encodeURIComponent(book.sourceUrl || `upload:${book.id}`)}`}>继续阅读</a>
              {imported && <a className="view-original" href={`/pdf?id=${encodeURIComponent(book.id)}&title=${encodeURIComponent(book.title)}`}><Eye size={14} />查看原文</a>}
              <button className="remove-book" onClick={() => removeBook(book)} disabled={removing === book.id} aria-label={`把《${book.title}》移出书架`}><Trash2 size={16} />{removing === book.id ? '正在移除' : '移出'}</button>
            </div>
          </article>
          );
        })}
        {!loading && !loadError && !books.length && !busy && (
          <div className="empty-shelf">
            <FileText size={30} />
            <h2>书架还是空的</h2>
            <p>从搜索结果开始阅读并加入书架，或导入你拥有合法阅读权的电子书。导入后会提取第一章并开始 AI 改写。</p>
            <button onClick={() => input.current?.click()}>选择电子书</button>
          </div>
        )}
      </section>
    </main>
  );
}
