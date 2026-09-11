'use client';
import { useEffect, useState } from 'react';
import { Check, ExternalLink, KeyRound, LoaderCircle, Sparkles, X } from 'lucide-react';
import { AI_SETTINGS_KEY, AI_SETUP_DONE_KEY, apiPresets, readAiSettings } from './lib/ai-presets';

/**
 * 首次进入站点时的线路引导。
 * 大多数人第一次来并不知道「改写」需要一条 AI 线路，所以在这里先问一次：
 * 要么用站点默认线路（无需 key），要么填自己的 key，并直接给出免费 key 的申请入口。
 */
export default function AiSetup() {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<'choose' | 'key'>('choose');
  const [presetId, setPresetId] = useState('groq');
  const [apiBaseUrl, setApiBaseUrl] = useState(apiPresets[0].baseUrl);
  const [apiModel, setApiModel] = useState(apiPresets[0].model);
  const [apiKey, setApiKey] = useState('');
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    try {
      const configured = readAiSettings();
      if (configured.aiProvider || configured.apiKey) return;
      if (localStorage.getItem(AI_SETUP_DONE_KEY) === '1') return;
    } catch {
      return;
    }
    setOpen(true);
  }, []);

  function finish(settings: Record<string, string>) {
    try {
      localStorage.setItem(AI_SETTINGS_KEY, JSON.stringify(settings));
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
  }

  function saveOwnKey() {
    if (!apiBaseUrl.trim() || !apiModel.trim() || apiKey.trim().length < 8) {
      setError('Base URL、模型名和 API key 都要填完整。');
      return;
    }
    finish({ aiProvider: 'openai-compatible', apiBaseUrl: apiBaseUrl.trim(), apiModel: apiModel.trim(), apiKey: apiKey.trim() });
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
      <div className="ai-setup-toast" role="status">
        <Check size={16} />
        线路已保存，可以开始阅读了
        <button type="button" aria-label="关闭提示" onClick={() => setSaved(false)}>
          <X size={14} />
        </button>
      </div>
    );
  }

  if (!open) return null;

  return (
    <div className="ai-setup-backdrop" role="dialog" aria-modal="true" aria-labelledby="ai-setup-title">
      <section className="ai-setup-panel">
        <header>
          <span className="ai-setup-icon">
            <KeyRound size={20} />
          </span>
          <div>
            <h2 id="ai-setup-title">先选一条改写线路</h2>
            <p>站点把名著改写成适合你的版本，需要一条 AI 线路。用默认线路不需要任何 key，也可以填自己的。</p>
          </div>
          <button type="button" className="ai-setup-close" onClick={dismiss} aria-label="稍后设置">
            <X size={18} />
          </button>
        </header>

        {mode === 'choose' ? (
          <div className="ai-setup-choices">
            <button type="button" className="ai-setup-choice primary" onClick={() => finish({ aiProvider: 'system-agnes' })}>
              <Sparkles size={18} />
              <strong>用站点默认线路</strong>
              <small>无需 key，免费。高峰期限额时速度会慢一些。</small>
            </button>
            <button type="button" className="ai-setup-choice" onClick={() => setMode('key')}>
              <KeyRound size={18} />
              <strong>填我自己的 API key</strong>
              <small>更稳定、更快，下面有免费 key 的申请入口。</small>
            </button>
          </div>
        ) : (
          <div className="ai-setup-form">
            <label>
              服务商
              <select value={presetId} onChange={(event) => choosePreset(event.target.value)}>
                {apiPresets.map((item) => (
                  <option value={item.id} key={item.id}>
                    {item.name} - {item.note}
                  </option>
                ))}
              </select>
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
            {current.keyUrl && (
              <a className="ai-setup-apply" href={current.keyUrl} target="_blank" rel="noreferrer">
                去 {current.name} 申请 key
                <ExternalLink size={14} />
              </a>
            )}
            {error && <p className="ai-setup-error">{error}</p>}
            <div className="ai-setup-actions">
              <button type="button" className="secondary" onClick={() => setMode('choose')}>
                返回
              </button>
              <button type="button" onClick={saveOwnKey}>
                保存并开始
              </button>
            </div>
          </div>
        )}

        {mode === 'key' && (
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
        )}

        <footer>
          <button type="button" className="ai-setup-skip" onClick={dismiss}>
            先随便逛逛，稍后在「阅读画像」里设置
          </button>
        </footer>
      </section>
    </div>
  );
}
