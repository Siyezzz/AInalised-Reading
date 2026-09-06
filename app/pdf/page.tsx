import { Search } from 'lucide-react';
import PdfReader from './pdf-reader';
import BrandMark from '../brand-mark';
export const dynamic = 'force-dynamic';
export default function PdfPage() {
  return (
    <main className="pdf-page">
      <header className="main-nav">
        <a href="/" className="brand">
          <span>
            <BrandMark size={21} />
          </span>
          知己读书
        </a>
        <nav>
          <a href="/shelf">返回书架</a>
          <a href="/profile">阅读画像</a>
        </nav>
        <a className="nav-search" href="/discover" aria-label="搜索书籍">
          <Search size={18} />
          <span>搜索</span>
        </a>
      </header>
      <PdfReader />
    </main>
  );
}
