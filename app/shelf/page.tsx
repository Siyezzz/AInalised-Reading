import { BookOpen, LogIn } from 'lucide-react';
import { chatGPTSignInPath, getChatGPTUser } from '../chatgpt-auth';
import ShelfClient from './shelf-client';

export const dynamic = 'force-dynamic';

export default async function ShelfPage() {
  const user = await getChatGPTUser();
  if (!user)
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
          <a className="demo-link" href="/demo">
            看《西游记》演示
          </a>
        </header>
        <section className="signin-card">
          <span className="eyebrow">个人书架</span>
          <h1>登录后，书才会一直记得你</h1>
          <p>
            使用 ChatGPT 账号登录。知己会读取账号中的邮箱作为身份标识，把
            PDF、阅读进度和个人画像安全地分开保存。
          </p>
          <a href={chatGPTSignInPath('/shelf')} target="_top">
            <LogIn size={17} />
            登录并打开书架
          </a>
          <small>不会读取你的聊天记录。</small>
        </section>
      </main>
    );
  return <ShelfClient email={user.email} displayName={user.displayName} />;
}
