'use client';
import { firstChapter, chaptersFromText } from './chapter-text';

function htmlToText(html: string) {
  const document = new DOMParser().parseFromString(html, 'text/html');
  document.querySelectorAll('script,style,nav').forEach((node) => node.remove());
  document.querySelectorAll('p,div,h1,h2,h3,h4,li,br').forEach(node => node.appendChild(document.createTextNode('\n')));
  return (document.body.textContent || '').replace(/[ \t]+/g, ' ').trim();
}

function chapterWindow(text: string) { return firstChapter(text).text; }

async function extractPdf(file: File, onProgress: (value: number, label: string) => void) {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  // Use CDN for worker — import.meta.url doesn't resolve correctly in vinext/CF Workers bundling
  pdfjs.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs';
  const loadingTask = pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) });
  const pdf = await loadingTask.promise;
  const pages: string[] = [];
  const limit = Math.min(pdf.numPages, 120);
  for (let pageNumber = 1; pageNumber <= limit; pageNumber += 1) {
    const page = await pdf.getPage(pageNumber);
    const content = await page.getTextContent();
    pages.push(content.items.map(item => 'str' in item ? item.str + (item.hasEOL ? '\n' : ' ') : '').join(''));
    page.cleanup();
    onProgress(10 + Math.round((pageNumber / limit) * 45), `正在识别第 ${pageNumber} 页`);
    if (chaptersFromText(pages.join('\n')).length >= 2) break;
  }
  await loadingTask.destroy();
  if (pages.join('').replace(/\s/g, '').length < 150) throw new Error('扫描版 PDF 没有文字层，暂时无法自动识别；请导入文字版或 EPUB');
  return chapterWindow(pages.join('\n\n'));
}

async function extractEpub(file: File, onProgress: (value: number, label: string) => void) {
  const { initEpubFile } = await import('@lingo-reader/epub-parser');
  const book = await initEpubFile(file);
  try {
    const parts: string[] = [];
    const spine = book.getSpine().slice(0, 120);
    for (let index = 0; index < spine.length; index += 1) {
      const chapter = await book.loadChapter(spine[index].id);
      const text = htmlToText(chapter?.html || '');
      if (text.length > 120) parts.push(text);
      onProgress(12 + Math.round(((index + 1) / spine.length) * 45), '正在整理章节顺序');
      if (chaptersFromText(parts.join('\n')).length >= 2) break;
      if (parts.join('\n').length > 120_000) throw new Error('未识别到章节边界，请提供单章文件');
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
    const spine = book.getSpine().slice(0, 120);
    for (let index = 0; index < spine.length; index += 1) {
      const chapter = book.loadChapter(spine[index].id);
      const text = htmlToText(chapter?.html || '');
      if (text.length > 120) parts.push(text);
      onProgress(12 + Math.round(((index + 1) / spine.length) * 45), '正在整理章节顺序');
      if (chaptersFromText(parts.join('\n')).length >= 2) break;
      if (parts.join('\n').length > 120_000) throw new Error('未识别到章节边界，请提供单章文件');
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
  else if (lower.endsWith('.txt')) text = chapterWindow(await decodeText(file));
  else throw new Error('支持 PDF、EPUB、MOBI、AZW3 和 TXT');
  if (text.replace(/\s/g, '').length < 500) throw new Error('没有识别到足够正文；扫描版 PDF 暂时需要先进行文字识别');
  return text;
}

async function decodeText(file: File) { const bytes = new Uint8Array(await file.arrayBuffer()); try { return new TextDecoder('utf-8', { fatal: true }).decode(bytes); } catch { return new TextDecoder('gb18030').decode(bytes); } }
