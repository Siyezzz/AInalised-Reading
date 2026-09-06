import { BookOpen, LogIn } from 'lucide-react';
import { chatGPTSignInPath, getChatGPTUser } from '../chatgpt-auth';
import ProfileClient from './profile-client';

export const dynamic = 'force-dynamic';
export default async function ProfilePage() {
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
            <a href="/shelf">我的书架</a>
            <a className="active" href="/profile">
              阅读画像
            </a>
          </nav>
        </header>
        <section className="signin-card">
          <span className="eyebrow">阅读画像</span>
          <h1>登录后，每本书都能接着认识你</h1>
          <p>
            你的阅读目标、擅长之处、常错问题和兴趣会保存到账号，下次换设备也不会丢。
          </p>
          <a href={chatGPTSignInPath('/profile')} target="_top">
            <LogIn size={17} />
            登录并建立画像
          </a>
        </section>
      </main>
    );
  return <ProfileClient email={user.email} />;
}
