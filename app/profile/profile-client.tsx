'use client';
import { useEffect, useState } from 'react';
import { Check, ChevronRight, Search } from 'lucide-react';
import { useSearchParams } from 'next/navigation';
import BrandMark from '../brand-mark';
import { describeLineTest, readAiSettings, saveAiSettings, testAiLine, type LineTest } from '../lib/ai-presets';

export default function ProfileClient({ email }: { email: string }) {
  const params = useSearchParams();
  const book = params.get('book');
  const [goal, setGoal] = useState('读懂故事'),
    [level, setLevel] = useState('平时会读一些'),
    [likes, setLikes] = useState<string[]>([]),
    [saved, setSaved] = useState(false),
    [bookStatus, setBookStatus] = useState<'idle' | 'saving' | 'error'>('idle'),
    [bookError, setBookError] = useState(''),
    [apiBaseUrl, setApiBaseUrl] = useState(''),
    [apiModel, setApiModel] = useState(''),
    [apiKey, setApiKey] = useState(''),
    [imageModel, setImageModel] = useState(''),
    [modelSaved, setModelSaved] = useState(false),
    [modelError, setModelError] = useState(''),
    [testing, setTesting] = useState(false),
    [testResult, setTestResult] = useState<LineTest | null>(null);
  useEffect(() => {
    fetch('/api/profile')
      .then((r) => r.json())
      .then((value) => { const data = value as { profile?: { goal: string; level: string; likes: string[] } };
        if (data.profile) {
          setGoal(data.profile.goal);
          setLevel(data.profile.level);
          setLikes(data.profile.likes || []);
        }
      });
  }, []);
  useEffect(() => {
    try {
      const raw = readAiSettings();
      // 站点已不再提供共用线路，旧配置里的 system-agnes / cloudflare-free 一律归到自有 key。
      if (raw.apiBaseUrl) setApiBaseUrl(raw.apiBaseUrl);
      if (raw.apiModel) setApiModel(raw.apiModel);
      if (raw.apiKey) setApiKey(raw.apiKey);
      if (raw.imageModel) setImageModel(raw.imageModel);
    } catch { /* Ignore broken local settings. */ }
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
  function modelSettings(): Record<string, string> | null {
    if (!apiBaseUrl.trim() || !apiModel.trim() || apiKey.trim().length < 8) {
      setModelError('Base URL、模型名和 API key 都要填完整，key 至少 8 位。');
      setModelSaved(false);
      return null;
    }
    const value: Record<string, string> = {
      aiProvider: 'openai-compatible',
      apiBaseUrl: apiBaseUrl.trim(),
      apiModel: apiModel.trim(),
      apiKey: apiKey.trim(),
    };
    if (imageModel.trim()) value.imageModel = imageModel.trim();
    return value;
  }
  function saveModelSettings() {
    const value = modelSettings();
    if (!value) return;
    // 统一写入口：会广播变更事件，正在改写的章节页收到后自动继续。
    saveAiSettings(value);
    setModelError('');
    setModelSaved(true);
  }
  async function testModelSettings() {
    const value = modelSettings();
    if (!value) return;
    setModelError('');
    setTestResult(null);
    setTesting(true);
    try {
      setTestResult(await testAiLine(value));
    } finally {
      setTesting(false);
    }
  }
  async function startReading() {
    if (!book || bookStatus === 'saving') return;
    setBookStatus('saving');
    setBookError('');
    const sourceUrl =
      book === '爱丽丝漫游奇境'
        ? 'https://www.gutenberg.org/ebooks/928'
        : `https://openlibrary.org/search?q=${encodeURIComponent(book)}`;
    try {
      const profileResponse = await fetch('/api/profile', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ goal, level, likes }),
      });
      if (!profileResponse.ok) throw new Error('阅读画像没有保存成功');
      setSaved(true);
      window.location.href =
         `/adapt?title=${encodeURIComponent(book)}&source=${encodeURIComponent(sourceUrl)}`;
    } catch (error) {
      setBookStatus('error');
      setBookError(error instanceof Error ? error.message : '暂时无法开始阅读');
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
          <fieldset className="model-settings">
            <legend>改写模型</legend>
            <p className="model-settings-note">
              填入你信赖的 AI 服务的接口信息，即可解锁章节的精讲与改写。密钥只保存在这台浏览器里，不会上传到服务器。
            </p>
            <label>
              接口地址（Base URL）
              <input value={apiBaseUrl} onChange={(event) => { setApiBaseUrl(event.target.value); setModelSaved(false); setModelError(''); }} placeholder="https://api.example.com/v1" />
            </label>
            <label>
              模型名（Model）
              <input value={apiModel} onChange={(event) => { setApiModel(event.target.value); setModelSaved(false); setModelError(''); }} placeholder="模型名，如 gpt-4.1-mini" />
            </label>
            <label>
              API key
              <input type="password" value={apiKey} onChange={(event) => { setApiKey(event.target.value); setModelSaved(false); setModelError(''); }} placeholder="粘贴服务商给的 key" autoComplete="off" />
            </label>
            <label>
              插图模型（可选）
              <input value={imageModel} onChange={(event) => { setImageModel(event.target.value); setModelSaved(false); setModelError(''); }} placeholder="留空则用内置插图，例如 gpt-image-1" />
            </label>
            {modelError && <p className="model-settings-error" role="alert">{modelError}</p>}
            {testResult && (
              <p className={`model-settings-test ${testResult.ok ? 'ok' : 'bad'}`} role="status">
                {describeLineTest(testResult)}
              </p>
            )}
            <div className="model-settings-actions">
              <button type="button" className="test-model" onClick={testModelSettings} disabled={testing}>
                {testing ? '测试中…' : '测试这条线路'}
              </button>
              <button type="button" className="save-model" onClick={saveModelSettings}>
                {modelSaved ? '模型已保存' : '保存模型设置'}
              </button>
            </div>
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
              <button className="profile-add-book" onClick={startReading} disabled={bookStatus === 'saving'}>
                {bookStatus === 'saving' ? '正在准备' : '开始阅读第一章'}
                <ChevronRight size={16} />
              </button>
              {bookStatus === 'error' && <p className="profile-save-error">{bookError}，请再试一次。</p>}
            </section>
          )}
        </aside>
      </section>
    </main>
  );
}
