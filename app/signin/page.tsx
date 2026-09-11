import { Suspense } from 'react';
import { Search } from 'lucide-react';
import BrandMark from '../brand-mark';
import { currentAccount } from '../lib/auth';
import SigninClient from './signin-client';

export const dynamic = 'force-dynamic';

export default async function SigninPage() {
  const account = await currentAccount();
  return (
    <main className="product-shell signin-page">
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
        <a className="nav-search" href="/discover" aria-label="搜索书籍">
          <Search size={18} />
          <span>搜索</span>
        </a>
      </header>
      <Suspense fallback={<section className="signin-card">正在准备登录…</section>}>
        <SigninClient email={account?.email} />
      </Suspense>
    </main>
  );
}
