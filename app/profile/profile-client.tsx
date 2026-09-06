'use client';
import { useEffect, useState } from 'react';
import { Check, ChevronRight, Search } from 'lucide-react';
import { useSearchParams } from 'next/navigation';
import BrandMark from '../brand-mark';

export default function ProfileClient({ email }: { email: string }) {
  const params = useSearchParams();
  const book = params.get('book');
  const [goal, setGoal] = useState('读懂故事'),
    [level, setLevel] = useState('平时会读一些'),
    [likes, setLikes] = useState<string[]>([]),
    [saved, setSaved] = useState(false);
  useEffect(() => {
    fetch('/api/profile')
      .then((r) => r.json())
      .then((data) => {
        if (data.profile) {
          setGoal(data.profile.goal);
          setLevel(data.profile.level);
          setLikes(data.profile.likes || []);
        }
      });
  }, []);
  function toggle(x: string) {
    setLikes((v) => (v.includes(x) ? v.filter((i) => i !== x) : [...v, x]));
  }
  async function save() {
    const response = await fetch('/api/profile', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ goal, level, likes }),
    });
    if (response.ok) setSaved(true);
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
          <a href="/shelf">我的书架</a>
          <a className="active" href="/profile">
            阅读画像
          </a>
        </nav>
        <div className="nav-actions">
          <a className="nav-search" href="/discover" aria-label="搜索书籍">
            <Search size={18} />
            <span>搜索</span>
          </a>
          <span className="signed-email">{email}</span>
        </div>
      </header>
      <section className="profile-layout">
        <div className="profile-form">
          <span className="eyebrow">阅读画像</span>
          <h1>{book ? `为《${book}》调整讲法` : '你希望书怎样讲？'}</h1>
          <p>选择会保存到账号，并随着你的阅读和答题继续变化。</p>
          <fieldset>
            <legend>这次最想得到什么</legend>
            {['读懂故事', '准备考试', '认识人物', '读出深意'].map((x) => (
              <button
                className={goal === x ? 'selected' : ''}
                onClick={() => setGoal(x)}
                key={x}
              >
                {x}
              </button>
            ))}
          </fieldset>
          <fieldset>
            <legend>你平时读名著的感觉</legend>
            {['常常看不懂', '平时会读一些', '喜欢自己琢磨'].map((x) => (
              <button
                className={level === x ? 'selected' : ''}
                onClick={() => setLevel(x)}
                key={x}
              >
                {x}
              </button>
            ))}
          </fieldset>
          <fieldset>
            <legend>什么会让你更想读下去</legend>
            {['冒险', '悬念', '人物关系', '历史', '幽默', '哲思'].map((x) => (
              <button
                className={likes.includes(x) ? 'selected' : ''}
                onClick={() => toggle(x)}
                key={x}
              >
                {x}
              </button>
            ))}
          </fieldset>
          <button className="save-profile" onClick={save}>
            {saved ? (
              <>
                <Check size={16} />
                画像已保存
              </>
            ) : (
              '保存到我的账号'
            )}
          </button>
        </div>
        <aside className="profile-insight">
          <span>当前阅读画像</span>
          <div>
            <strong>优势</strong>
            <p>
              {level === '喜欢自己琢磨'
                ? '愿意自己寻找证据'
                : '能跟住清楚的事件顺序'}
            </p>
          </div>
          <div>
            <strong>需要留意</strong>
            <p>
              {level === '常常看不懂'
                ? '人物称呼和前后因果'
                : '复杂动机还需要更多观察'}
            </p>
          </div>
          <div>
            <strong>偏好</strong>
            <p>{likes.length ? likes.join('、') : '还在观察'}</p>
          </div>
          {book && (
            <section>
              <small>下一步</small>
              <h2>准备《{book}》第一章</h2>
              <p>
                按“{goal}”目标和“{level}”难度处理完整章节。
              </p>
              <a href="/shelf">
                放进我的书架 <ChevronRight size={16} />
              </a>
            </section>
          )}
        </aside>
      </section>
    </main>
  );
}
