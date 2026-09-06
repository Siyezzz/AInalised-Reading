'use client';
import { useEffect, useRef, useState } from 'react';
import { BookOpen, Check, FileText, LogOut, Upload } from 'lucide-react';

type ShelfBook = {
  id: string;
  title: string;
  source: string;
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
    [message, setMessage] = useState('');
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    fetch('/api/library')
      .then((r) => r.json())
      .then((data) => setBooks(data.books || []));
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
            <BookOpen size={18} />
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
        {books.map((book) => (
          <article className="shelf-book" key={book.id}>
            <div className="pdf-cover">
              <FileText size={25} />
              <small>PDF</small>
            </div>
            <div>
              <span>{book.source}</span>
              <h2>{book.title}</h2>
              <p>
                {(book.size / 1024 / 1024).toFixed(1)} MB · {book.status}
              </p>
              <i>
                <b style={{ width: `${book.progress}%` }} />
              </i>
              <small>阅读进度 {book.progress}%</small>
            </div>
            <button>准备第一章</button>
          </article>
        ))}
        {!books.length && !busy && (
          <div className="empty-shelf">
            <FileText size={30} />
            <h2>书架还是空的</h2>
            <p>
              导入你拥有合法阅读权的
              PDF。上传后会先识别章节，再根据你的画像准备第一章。
            </p>
            <button onClick={() => input.current?.click()}>选择 PDF</button>
          </div>
        )}
      </section>
    </main>
  );
}
