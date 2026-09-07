'use client';

function htmlToText(html: string) {
  const document = new DOMParser().parseFromString(html, 'text/html');
  document.querySelectorAll('script,style,nav').forEach((node) => node.remove());
  return (document.body.textContent || '').replace(/\s+/g, ' ').trim();
}

function chapterWindow(text: string) {
  const clean = text.replace(/\r/g, '').replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
  const firstPattern = /(?:^|\n)\s*(?:第[一1壹]章|第[一1壹]回|chapter\s+(?:one|1|i)\b)[^\n]*/i;
  const first = firstPattern.exec(clean);
  const start = first?.index ?? 0;
  const rest = clean.slice(start);
  const nextPattern = /\n\s*(?:第[二2贰]章|第[二2贰]回|chapter\s+(?:two|2|ii)\b)[^\n]*/i;
  const next = nextPattern.exec(rest.slice(80));
  return rest.slice(0, next ? next.index + 80 : 80_000).trim().slice(0, 80_000);
}

async function extractPdf(file: File, onProgress: (value: number, label: string) => void) {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  pdfjs.GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/legacy/build/pdf.worker.min.mjs', import.meta.url).toString();
  const pdf = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
  const pages: string[] = [];
  const limit = Math.min(pdf.numPages, 40);
  for (let pageNumber = 1; pageNumber <= limit; pageNumber += 1) {
    const page = await pdf.getPage(pageNumber);
    const content = await page.getTextContent();
    pages.push(content.items.map((item) => ('str' in item ? item.str : '')).join(' '));
    onProgress(10 + Math.round((pageNumber / limit) * 45), `正在识别第 ${pageNumber} 页`);
    if (chapterWindow(pages.join('\n')).length > 45_000) break;
  }
  return chapterWindow(pages.join('\n\n'));
}

async function extractEpub(file: File, onProgress: (value: number, label: string) => void) {
  const { initEpubFile } = await import('@lingo-reader/epub-parser');
  const book = await initEpubFile(file);
  try {
    const parts: string[] = [];
    const spine = book.getSpine().slice(0, 14);
    for (let index = 0; index < spine.length; index += 1) {
      const chapter = await book.loadChapter(spine[index].id);
      const text = htmlToText(chapter?.html || '');
      if (text.length > 120) parts.push(text);
      onProgress(12 + Math.round(((index + 1) / spine.length) * 45), '正在整理章节顺序');
      if (parts.join('\n').length > 60_000) break;
    }
    return chapterWindow(parts.join('\n\n'));
  } finally { book.destroy(); }
}

async function extractMobi(file: File, onProgress: (value: number, label: string) => void) {
  const { initKf8File, initMobiFile } = await import('@lingo-reader/mobi-parser');
  const isKf8 = /\.(azw3|kf8)$/i.test(file.name);
  const book = isKf8 ? await initKf8File(file) : await initMobiFile(file);
  try {
    const parts: string[] = [];
    const spine = book.getSpine().slice(0, 14);
    for (let index = 0; index < spine.length; index += 1) {
      const chapter = book.loadChapter(spine[index].id);
      const text = htmlToText(chapter?.html || '');
      if (text.length > 120) parts.push(text);
      onProgress(12 + Math.round(((index + 1) / spine.length) * 45), '正在整理章节顺序');
      if (parts.join('\n').length > 60_000) break;
    }
    return chapterWindow(parts.join('\n\n'));
  } finally { book.destroy(); }
}

export async function extractFirstChapter(file: File, onProgress: (value: number, label: string) => void) {
  const lower = file.name.toLowerCase();
  let text = '';
  if (lower.endsWith('.pdf')) text = await extractPdf(file, onProgress);
  else if (lower.endsWith('.epub')) text = await extractEpub(file, onProgress);
  else if (/\.(mobi|azw3|kf8)$/.test(lower)) text = await extractMobi(file, onProgress);
  else if (lower.endsWith('.txt')) text = chapterWindow(await file.text());
  else throw new Error('支持 PDF、EPUB、MOBI、AZW3 和 TXT');
  if (text.replace(/\s/g, '').length < 500) throw new Error('没有识别到足够正文；扫描版 PDF 暂时需要先进行文字识别');
  return text;
}
