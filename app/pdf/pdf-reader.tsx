'use client';
import { useSearchParams } from 'next/navigation';
export default function PdfReader() {
  const params = useSearchParams();
  const id = params.get('id') || '';
  const title = params.get('title') || '我的 PDF';
  return (
    <section className="pdf-workspace">
      <div>
        <span>正在阅读</span>
        <h1>{title}</h1>
        <p>阅读进度会在后续版本接入页面级记录。</p>
      </div>
      <iframe
        title={title}
        src={`/api/library/file?id=${encodeURIComponent(id)}`}
      />
    </section>
  );
}
