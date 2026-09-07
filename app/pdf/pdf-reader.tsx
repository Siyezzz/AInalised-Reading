'use client';
import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';

export default function PdfReader() {
  const params = useSearchParams();
  const id = params.get('id') || '';
  const title = params.get('title') || '我的 PDF';
  const [blobUrl, setBlobUrl] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) { setError('缺少书籍编号'); setLoading(false); return; }
    let url = '';
    (async () => {
      try {
        const response = await fetch(`/api/library/file?id=${encodeURIComponent(id)}`, { credentials: 'include' });
        if (!response.ok) {
          const text = await response.text().catch(() => '');
          throw new Error(response.status === 401 ? '请先登录后再查看原文' : response.status === 404 ? '文件不存在或已删除' : text || `加载失败 (${response.status})`);
        }
        const blob = await response.blob();
        url = URL.createObjectURL(blob);
        setBlobUrl(url);
      } catch (e) {
        setError(e instanceof Error ? e.message : '加载 PDF 失败');
      } finally {
        setLoading(false);
      }
    })();
    return () => { if (url) URL.revokeObjectURL(url); };
  }, [id]);

  return (
    <section className="pdf-workspace">
      <div>
        <span>正在阅读</span>
        <h1>{title}</h1>
        {loading && <p>正在加载 PDF 文件…</p>}
        {error && <p style={{ color: '#f87171' }}>{error}</p>}
        {!loading && !error && <p>阅读进度会在后续版本接入页面级记录。</p>}
        <a href="/shelf" style={{ display: 'inline-block', marginTop: 12, color: '#e0b86f', fontSize: 13 }}>← 返回书架</a>
      </div>
      {blobUrl && (
        <iframe
          title={title}
          src={blobUrl}
        />
      )}
      {!blobUrl && !loading && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'white', borderRadius: 17 }}>
          <p style={{ color: '#666', fontSize: 14 }}>{error || '无法显示 PDF'}</p>
        </div>
      )}
    </section>
  );
}
