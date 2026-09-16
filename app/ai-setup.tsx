'use client';
import { useEffect, useState } from 'react';
import { Check, KeyRound, X } from 'lucide-react';
import { AI_SETUP_DONE_KEY, OPEN_AI_SETUP, describeLineTest, readAiSettings, saveAiSettings, testAiLine, type LineTest } from './lib/ai-presets';

/**
 * 首次进入站点时的阅读引擎引导。
 * 让读者接入自己信赖的 AI 服务，阅读体验完全由读者自己把控。
 * 浏览书库、加入书架、填阅读画像这些功能仍然可以跳过这步。
 */
export default function AiSetup() {
  const [open, setOpen] = useState(false);
  const [apiBaseUrl, setApiBaseUrl] = useState('');
  const [apiModel, setApiModel] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [imageModel, setImageModel] = useState('');
  const [showImage, setShowImage] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<LineTest | null>(null);

  useEffect(() => {
    try {
      const configured = readAiSettings();
      if (configured.apiKey) return;
      if (localStorage.getItem(AI_SETUP_DONE_KEY) === '1') return;
    } catch {
      return;
    }
    setOpen(true);
  }, []);

  // 任何页面（比如改写页报「没填 key」）都可以把弹窗叫出来，
  // 这样读者不用离开当前页去别处设置。
  useEffect(() => {
    const reopen = () => {
      setError('');
      setSaved(false);
      setTestResult(null);
      setOpen(true);
    };
    window.addEventListener(OPEN_AI_SETUP, reopen);
    return () => window.removeEventListener(OPEN_AI_SETUP, reopen);
  }, []);

  function finish(settings: Record<string, string>) {
    // saveAiSettings 会广播变更事件，正在改写的章节页收到后会自动继续。
    saveAiSettings(settings);
    try {
      localStorage.setItem(AI_SETUP_DONE_KEY, '1');
    } catch {
      /* 隐身模式下写不进去，也不该挡住阅读。 */
    }
    setSaved(true);
    setOpen(false);
  }

  function currentSettings(): Record<string, string> | null {
    if (!apiBaseUrl.trim() || !apiModel.trim() || apiKey.trim().length < 8) {
      setError('接口地址、模型名和 API key 都要填完整。');
      return null;
    }
    const settings: Record<string, string> = { aiProvider: 'openai-compatible', apiBaseUrl: apiBaseUrl.trim(), apiModel: apiModel.trim(), apiKey: apiKey.trim() };
    if (imageModel.trim()) settings.imageModel = imageModel.trim();
    return settings;
  }

  function saveKey() {
    const settings = currentSettings();
    if (!settings) return;
    finish(settings);
  }

  async function runTest() {
    const settings = currentSettings();
    if (!settings) return;
    setError('');
    setTestResult(null);
    setTesting(true);
    try {
      setTestResult(await testAiLine(settings));
    } finally {
      setTesting(false);
    }
  }

  function dismiss() {
    try {
      localStorage.setItem(AI_SETUP_DONE_KEY, '1');
    } catch {
      /* 忽略 */
    }
    setOpen(false);
  }

  if (saved && !open) {
    return (
      <output className="ai-setup-toast">
        <Check size={16} />
        阅读引擎已保存，可以开始阅读了
        <button type="button" aria-label="关闭提示" onClick={() => setSaved(false)}>
          <X size={14} />
        </button>
      </output>
    );
  }

  if (!open) return null;

  return (
    <dialog open className="ai-setup-backdrop" aria-labelledby="ai-setup-title">
      <section className="ai-setup-panel">
        <header>
          <span className="ai-setup-icon">
            <KeyRound size={20} />
          </span>
          <div>
            <h2 id="ai-setup-title">接入你的专属阅读引擎</h2>
            <p>
              填入你信赖的 AI 服务的接口信息，即可解锁章节的精讲与改写。浏览书库、加入书架、填写阅读画像都无需这步。
            </p>
          </div>
          <button type="button" className="ai-setup-close" onClick={dismiss} aria-label="稍后设置">
            <X size={18} />
          </button>
        </header>

        {/* 只有这一段会滚动，标题和底部的「保存并开始」始终可见 */}
        <div className="ai-setup-body">
          <div
            className="ai-setup-form"
            onKeyDown={(event) => {
              // 填完 key 顺手敲回车是很自然的动作，之前按回车毫无反应。
              if (event.key === 'Enter' && !(event.target instanceof HTMLTextAreaElement)) {
                event.preventDefault();
                saveKey();
              }
            }}
          >
            <label>
              接口地址（Base URL）
              <input value={apiBaseUrl} onChange={(event) => setApiBaseUrl(event.target.value)} placeholder="https://api.example.com/v1" />
            </label>
            <label>
              模型名（Model）
              <input value={apiModel} onChange={(event) => setApiModel(event.target.value)} placeholder="模型名，如 gpt-4.1-mini" />
            </label>
            <label>
              API key
              <input type="password" value={apiKey} onChange={(event) => setApiKey(event.target.value)} placeholder="粘贴你申请到的 key" autoComplete="off" />
            </label>
            {showImage ? (
              <label>
                插图模型（可选）
                <input value={imageModel} onChange={(event) => setImageModel(event.target.value)} placeholder="留空则用内置插图" />
              </label>
            ) : (
              <button type="button" className="ai-setup-more" onClick={() => setShowImage(true)}>
                想生成 AI 插图？填一个支持生图的模型名
              </button>
            )}
            {error && <p className="ai-setup-error">{error}</p>}
            {testResult && (
              <p className={`ai-setup-test ${testResult.ok ? 'ok' : 'bad'}`} role="status">
                {describeLineTest(testResult)}
              </p>
            )}
          </div>
        </div>

        <footer>
          <div className="ai-setup-actions">
            <button type="button" className="ai-setup-test-btn" onClick={runTest} disabled={testing}>
              {testing ? '测试中…' : '测试连接'}
            </button>
            <button type="button" onClick={saveKey}>
              保存并开始
            </button>
          </div>
          <button type="button" className="ai-setup-skip" onClick={dismiss}>
            先随便逛逛，稍后在「阅读画像」里设置
          </button>
        </footer>
      </section>
    </dialog>
  );
}
