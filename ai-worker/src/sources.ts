import { firstChapter } from '../../app/lib/chapter-text';
export const CLASSICS: Record<string, string> = {
  '西游记': '西遊記', '西遊記': '西遊記', '红楼梦': '紅樓夢', '紅樓夢': '紅樓夢',
  '三国演义': '三國演義', '三國演義': '三國演義', '水浒传': '水滸傳', '水滸傳': '水滸傳',
  '儒林外史': '儒林外史', '聊斋志异': '聊齋志異', '聊齋志異': '聊齋志異',
};
const english: Record<string, string> = { '爱丽丝漫游奇境': '11', 'Alice in Wonderland': '11', "Alice’s Adventures in Wonderland": '11', 'Pride and Prejudice': '1342', '傲慢与偏见': '1342' };
const headers = { 'user-agent': 'ZhijiReading/2.0 (public-domain reading app; https://zhiji-reading.li-siye-0123.chatgpt.site)' };
async function get(url: string) {
  const response = await fetch(url, { headers, signal: AbortSignal.timeout(18_000) });
  if (!response.ok) throw new Error(`SOURCE_HTTP_${response.status}`);
  return response;
}
function cleanWiki(raw: string) {
  let text = raw.replace(/<noinclude>[\s\S]*?<\/noinclude>/gi, '').replace(/<ref[^>]*>[\s\S]*?<\/ref>/gi, '');
  for (let i = 0; i < 5; i++) text = text.replace(/\{\{[^{}]*\}\}/g, '');
  return text.replace(/\[\[(?:[^\]|]*\|)?([^\]]+)\]\]/g, '$1').replace(/'{2,}/g, '').replace(/<br\s*\/?\s*>/gi, '\n').replace(/<[^>]+>/g, '').trim();
}
async function wiki(page: string) {
  const response = await get(`https://zh.wikisource.org/w/api.php?action=parse&page=${encodeURIComponent(page)}&prop=wikitext|links&format=json&formatversion=2`);
  const data = await response.json<{ parse?: { wikitext?: string; links?: { '*': string; title?: string; ns: number }[] } }>();
  if (!data.parse?.wikitext) throw new Error('SOURCE_PAGE_MISSING');
  return { text: cleanWiki(data.parse.wikitext), links: (data.parse.links || []).filter(x => x.ns === 0).map(x => x.title || x['*']) };
}
export async function readWiki(page: string) {
  const root = await wiki(page);
  // Follow the selected edition's chapter links, instead of treating its TOC as prose.
  if (!/\/.*第.+[回章]/.test(page)) {
    const candidates = root.links.filter(x => x.startsWith(`${page}/`) && /第[零〇0]*[一壹1][回章]|第0*1[回章]/.test(x));
    for (const candidate of candidates.slice(0, 3)) {
      try { const chapter = await wiki(candidate); if (chapter.text.length >= 150) return { title: candidate.split('/').at(-1)!, text: chapter.text, url: `https://zh.wikisource.org/wiki/${encodeURIComponent(candidate)}` }; } catch { /* Try next chapter link in the edition. */ }
    }
  }
  if (root.text.length < 150) throw new Error('SOURCE_TEXT_MISSING');
  const chapter = firstChapter(root.text);
  return { ...chapter, url: `https://zh.wikisource.org/wiki/${encodeURIComponent(page)}` };
}
async function gutenberg(id: string) {
  let last: unknown;
  for (const url of [`https://www.gutenberg.org/ebooks/${id}.txt.utf-8`, `https://www.gutenberg.org/cache/epub/${id}/pg${id}.txt`]) {
    try { const text = await (await get(url)).text(); return { ...firstChapter(text), url: `https://www.gutenberg.org/ebooks/${id}` }; } catch (error) { last = error; }
  }
  throw last;
}
export async function searchSources(query: string) {
  const title = query.trim().slice(0, 180);
  if (CLASSICS[title]) return [{ title, sourceUrl: `https://zh.wikisource.org/wiki/${encodeURIComponent(CLASSICS[title])}`, author: '', provider: '维基文库' }];
  if (english[title]) return [{ title, sourceUrl: `https://www.gutenberg.org/ebooks/${english[title]}`, author: '', provider: 'Project Gutenberg' }];
  if (/[\u3400-\u9fff]/.test(title)) {
    const data = await (await get(`https://zh.wikisource.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(title)}&srnamespace=0&srlimit=8&format=json&formatversion=2`)).json<{ query?: { search?: { title: string }[] } }>();
    return (data.query?.search || []).map(x => ({ title: x.title, sourceUrl: `https://zh.wikisource.org/wiki/${encodeURIComponent(x.title)}`, author: '', provider: '维基文库' }));
  }
  const data = await (await get(`https://gutendex.com/books/?search=${encodeURIComponent(title)}`)).json<{ results?: { id: number; title: string; copyright: boolean | null; authors: { name: string }[] }[] }>();
  return (data.results || []).filter(x => x.copyright === false).slice(0, 8).map(x => ({ title: x.title, sourceUrl: `https://www.gutenberg.org/ebooks/${x.id}`, author: x.authors.map(a => a.name).join(', '), provider: 'Project Gutenberg' }));
}
export async function resolveSource(title: string, sourceUrl?: string) {
  if (sourceUrl && !sourceUrl.startsWith('upload:')) {
    const source = new URL(sourceUrl);
    if (source.protocol !== 'https:') throw new Error('SOURCE_NOT_SUPPORTED');
    if (source.hostname === 'zh.wikisource.org' && source.pathname.startsWith('/wiki/')) return readWiki(decodeURIComponent(source.pathname.slice(6)));
    const id = source.hostname === 'www.gutenberg.org' ? /\/(?:ebooks|epub)\/(\d+)/.exec(source.pathname)?.[1] : null;
    if (id) return gutenberg(id);
  }
  if (CLASSICS[title]) return readWiki(CLASSICS[title]);
  if (english[title]) return gutenberg(english[title]);
  const results = await searchSources(title);
  const normalize = (x: string) => x.toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');
  const result = results.find(x => normalize(x.title) === normalize(title));
  if (!result) throw new Error('SOURCE_NOT_FOUND');
  return resolveSource(result.title, result.sourceUrl);
}
