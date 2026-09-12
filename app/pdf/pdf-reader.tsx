'use client';
import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';

type Original = { title: string; text: string };

/**
 * 原文查看页。站点只保留导入时抽取出的正文，所以这里渲染文本而不是 PDF 预览；
 * 以前嵌 iframe 指向已下线的文件接口，是个走得进去出不来的死页。
 */
export default function PdfReader() {
  const params = useSearchParams();
  const id = params.get('id') || '';
  const fallbackTitle = params.get('title') || '导入的电子书';
  const [original, setOriginal] = useState<Original | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) { setError('缺少书籍编号，请从书架上的「查看原文」进入。'); setLoading(false); return; }
    let active = true;
    (async () => {
      try {
        const response = await fetch(`/api/library/file?id=${encodeURIComponent(id)}`, { credentials: 'include' });
        const data = (await response.json().catch(() => ({}))) as { title?: string; text?: string; error?: string };
        if (!response.ok) throw new Error(data.error || `加载失败 (${response.status})`);
        if (!data.text) throw new Error('这本书没有可读的正文。');
        if (active) setOriginal({ title: data.title || fallbackTitle, text: data.text });
      } catch (e) {
        if (active) setError(e instanceof Error ? e.message : '加载原文失败');
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => { active = false; };
  }, [id, fallbackTitle]);

  const title = original?.title || fallbackTitle;

  return (
    <section className="pdf-workspace">
      <div>
        <span>正在查看原文</span>
        <h1>{title}</h1>
        {loading && <p>正在读取导入时抽取的正文…</p>}
        {error && <p style={{ color: '#f87171' }}>{error}</p>}
        {original && <p>共 {original.text.length.toLocaleString()} 字符，来自导入时抽取的正文。</p>}
        <a href="/shelf" style={{ display: 'inline-block', marginTop: 12, color: '#e0b86f', fontSize: 13 }}>← 返回书架</a>
      </div>
      {original && <pre className="original-text">{original.text}</pre>}
    </section>
  );
}
