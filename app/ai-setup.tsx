'use client';
import { useEffect, useState } from 'react';
import { Check, ExternalLink, KeyRound, X } from 'lucide-react';
import { AI_SETUP_DONE_KEY, OPEN_AI_SETUP, apiPresets, describeLineTest, readAiSettings, saveAiSettings, testAiLine, type LineTest } from './lib/ai-presets';

/**
 * 首次进入站点时的线路引导。
 * 站点不再提供自己的 AI 额度（共用 key 很快会被额度或限流打爆），
 * 所以这里要求读者填自己的 key，并直接给出免费 key 的申请入口。
 * 浏览书库、加入书架、填阅读画像这些不需要 key 的功能仍然可以跳过这步。
 */
export default function AiSetup() {
  const [open, setOpen] = useState(false);
  const [presetId, setPresetId] = useState(apiPresets[0].id);
  const [apiBaseUrl, setApiBaseUrl] = useState(apiPresets[0].baseUrl);
  const [apiModel, setApiModel] = useState(apiPresets[0].model);
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

  function choosePreset(id: string) {
    setPresetId(id);
    const preset = apiPresets.find((item) => item.id === id);
    if (preset) {
      setApiBaseUrl(preset.baseUrl);
      setApiModel(preset.model);
    }
    setError('');
    setTestResult(null);
  }

  function currentSettings(): Record<string, string> | null {
    if (!apiBaseUrl.trim() || !apiModel.trim() || apiKey.trim().length < 8) {
      setError('Base URL、模型名和 API key 都要填完整。');
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

  const current = apiPresets.find((item) => item.id === presetId) || apiPresets[0];
  const keyLinks = apiPresets.filter((item) => item.keyUrl);

  if (saved && !open) {
    return (
      <output className="ai-setup-toast">
        <Check size={16} />
        线路已保存，可以开始阅读了
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
            <h2 id="ai-setup-title">先填一个你自己的 API key</h2>
            <p>
              站点不提供共用的 AI 额度，改写章节消耗的是你自己的 key。浏览书库、加入书架、填阅读画像都不需要 key。
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
              服务商
              <select value={presetId} onChange={(event) => choosePreset(event.target.value)}>
                {apiPresets.map((item) => (
                  <option value={item.id} key={item.id}>
                    {item.name}
                    {item.free ? '（有免费额度）' : ''}
                  </option>
                ))}
              </select>
              {/* 说明放在下拉框外面：塞进 <option> 会把下拉框撑得比面板还宽 */}
              {current.note && <span className="ai-setup-note">{current.note}</span>}
            </label>
            <label>
              Base URL
              <input value={apiBaseUrl} onChange={(event) => setApiBaseUrl(event.target.value)} placeholder="https://api.groq.com/openai/v1" />
            </label>
            <label>
              Model
              <input value={apiModel} onChange={(event) => setApiModel(event.target.value)} placeholder="模型名" />
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
            {current.keyUrl && (
              <a className="ai-setup-apply" href={current.keyUrl} target="_blank" rel="noreferrer">
                去 {current.name} 申请 key
                <ExternalLink size={14} />
              </a>
            )}
            {error && <p className="ai-setup-error">{error}</p>}
            {testResult && (
              <p className={`ai-setup-test ${testResult.ok ? 'ok' : 'bad'}`} role="status">
                {describeLineTest(testResult)}
              </p>
            )}
          </div>

          <div className="ai-setup-links">
            <span>还没有 key？这些都是免费申请的：</span>
            <div>
              {keyLinks.map((item) => (
                <a href={item.keyUrl} target="_blank" rel="noreferrer" key={item.id}>
                  {item.name}
                  {item.free ? ' 免费' : ''}
                </a>
              ))}
            </div>
          </div>
        </div>

        <footer>
          <div className="ai-setup-actions">
            <button type="button" className="ai-setup-test-btn" onClick={runTest} disabled={testing}>
              {testing ? '测试中…' : '测试这条线路'}
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
