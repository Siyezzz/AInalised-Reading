import { BookOpen, Search } from 'lucide-react';
import ReadClient from './read-client';

export default function ReadPage() {
  return (
    <main className="product-shell reading-entry">
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
          <a href="/shelf">我的书架</a>
          <a href="/profile">阅读画像</a>
        </nav>
        <a className="nav-search" href="/discover" aria-label="搜索书籍">
          <Search size={18} />
          <span>搜索</span>
        </a>
      </header>
      <ReadClient />
    </main>
  );
}
