'use client';
import { useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { LoaderCircle, LogOut } from 'lucide-react';

function safeReturn(value: string) {
  return value.startsWith('/') && !value.startsWith('//') ? value : '/shelf';
}

export default function SigninClient({ email }: { email?: string }) {
  const params = useSearchParams();
  const returnTo = safeReturn(params.get('return_to') || '/shelf');
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [field, setField] = useState({ email: '', password: '' });
  const [busy, setBusy] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [error, setError] = useState('');

  async function submit(action: 'login' | 'register') {
    if (busy) return;
    if (!field.email.trim() || field.password.length < 8) {
      setError('请填邮箱和至少 8 位的密码。');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const response = await fetch('/api/auth', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action, email: field.email.trim(), password: field.password }),
      });
      const data = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(data.error || '登录没有成功');
      window.location.href = returnTo;
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : '登录没有成功');
      setBusy(false);
    }
  }

  async function signOut() {
    setSigningOut(true);
    await fetch('/api/auth', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: 'logout' }) });
    window.location.href = '/';
  }

  if (email) {
    return (
      <section className="signin-card">
        <h1>已经登录</h1>
        <p>当前账号：{email}。书架、阅读画像和生成过的章节都跟着这个账号走。</p>
        <div className="signin-actions">
          <a className="signin-primary" href={returnTo}>回到阅读</a>
          <button type="button" className="signin-secondary" onClick={signOut} disabled={signingOut}>
            {signingOut ? <LoaderCircle className="spin" size={16} /> : <LogOut size={16} />}
            退出登录
          </button>
        </div>
      </section>
    );
  }

  return (
    <section className="signin-card">
      <h1>{mode === 'login' ? '登录知己读书' : '注册知己读书'}</h1>
      <p>
        登录后书架、阅读画像和已生成的章节会存在账号里，换设备也能接着读；不登录也能用，但数据只留在这一台浏览器。
      </p>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          void submit(mode);
        }}
      >
        <label>
          邮箱
          <input
            type="email"
            value={field.email}
            onChange={(event) => setField({ ...field, email: event.target.value })}
            placeholder="you@example.com"
            autoComplete="email"
          />
        </label>
        <label>
          密码
          <input
            type="password"
            value={field.password}
            onChange={(event) => setField({ ...field, password: event.target.value })}
            placeholder="至少 8 位"
            autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
          />
        </label>
        {error && <p className="signin-error">{error}</p>}
        <div className="signin-actions">
          <button type="submit" className="signin-primary" disabled={busy}>
            {busy && <LoaderCircle className="spin" size={16} />}
            {mode === 'login' ? '登录' : '注册并登录'}
          </button>
          <button
            type="button"
            className="signin-secondary"
            onClick={() => {
              setMode(mode === 'login' ? 'register' : 'login');
              setError('');
            }}
          >
            {mode === 'login' ? '还没有账号？去注册' : '已有账号？去登录'}
          </button>
        </div>
      </form>
      <small>我们只存邮箱和密码的哈希值，不存明文密码，也不发营销邮件。</small>
    </section>
  );
}
