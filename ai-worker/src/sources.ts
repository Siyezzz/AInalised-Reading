import { chaptersFromText } from '../../app/lib/chapter-text';

export const CLASSICS: Record<string, string> = {
  // 四大名著
  '西游记': '西遊記',
  '西遊記': '西遊記',
  '红楼梦': '紅樓夢',
  '紅樓夢': '紅樓夢',
  '三国演义': '三國演義',
  '三國演義': '三國演義',
  '水浒传': '水滸傳',
  '水滸傳': '水滸傳',
  // 其他古典小说
  '儒林外史': '儒林外史',
  '聊斋志异': '聊齋志異',
  '聊齋志異': '聊齋志異',
  '封神演义': '封神演義',
  '封神演義': '封神演義',
  '镜花缘': '鏡花緣',
  '鏡花緣': '鏡花緣',
  '老残游记': '老殘遊記',
  '老殘遊記': '老殘遊記',
  '世说新语': '世說新語',
  '世說新語': '世說新語',
  '金瓶梅': '金瓶梅',
  '醒世恒言': '醒世恆言',
  '喻世明言': '喻世明言',
  '警世通言': '警世通言',
  '初刻拍案惊奇': '初刻拍案驚奇',
  '初刻拍案驚奇': '初刻拍案驚奇',
  '二刻拍案惊奇': '二刻拍案驚奇',
  '二刻拍案驚奇': '二刻拍案驚奇',
  '儿女英雄传': '兒女英雄傳',
  '兒女英雄傳': '兒女英雄傳',
  '说岳全传': '說岳全傳',
  '說岳全傳': '說岳全傳',
  '隋唐演义': '隋唐演義',
  '東周列國志': '東周列國志',
  '东周列国志': '東周列國志',
  '杨家将演义': '楊家將演義',
  '楊家將演義': '楊家將演義',
  '七侠五义': '七俠五義',
  '七俠五義': '七俠五義',
  '小五義': '小五義',
  '小五义': '小五義',
};

const ENGLISH_CLASSICS: Record<string, string> = {
  'Alice in Wonderland': '11',
  "Alice's Adventures in Wonderland": '11',
  '爱丽丝漫游奇境': '11',
  'Pride and Prejudice': '1342',
  '傲慢与偏见': '1342',
  '傲慢與偏見': '1342',
  'The Great Gatsby': '64317',
  '了不起的盖茨比': '64317',
  'Moby Dick': '2701',
  '白鲸': '2701',
  '白鯨': '2701',
  'Frankenstein': '84',
  '科学怪人': '84',
  'Dracula': '345',
  '德古拉': '345',
  'The Picture of Dorian Gray': '174',
  '道林格雷的画像': '174',
  'Jane Eyre': '1260',
  '简爱': '1260',
  'Wuthering Heights': '768',
  '呼啸山庄': '768',
  'Great Expectations': '1400',
  '远大前程': '1400',
  'Little Women': '37106',
  '小妇人': '37106',
  'The Adventures of Sherlock Holmes': '1661',
  '福尔摩斯探案集': '1661',
  'The Importance of Being Earnest': '844',
  '不可儿戏': '844',
  'The Republic': '1497',
  '理想国': '1497',
  'The Odyssey': '1727',
  '奥德赛': '1727',
  'The Iliad': '6130',
  '伊利亚特': '6130',
  'Metamorphosis': '5200',
  '变形记': '5200',
  'Around the World in Eighty Days': '103',
  '八十天环游地球': '103',
  'Twenty Thousand Leagues Under the Seas': '164',
  '海底两万里': '164',
  'The Three Musketeers': '1257',
  '三个火枪手': '1257',
  'The Hound of the Baskervilles': '2852',
  '巴斯克维尔的猎犬': '2852',
};

const headers = { 'user-agent': 'ZhijiReading/2.0 (public-domain reading app; https://zhiji-reading.li-siye-0123.workers.dev)' };

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

async function wiki(page: string, lang: 'zh' | 'en' = 'zh') {
  const host = lang === 'zh' ? 'zh.wikisource.org' : 'en.wikisource.org';
  const response = await get(`https://${host}/w/api.php?action=parse&page=${encodeURIComponent(page)}&prop=wikitext|links&format=json&formatversion=2`);
  const data = await response.json<{ parse?: { wikitext?: string; links?: { '*': string; title?: string; ns: number }[] } }>();
  if (!data.parse?.wikitext) throw new Error('SOURCE_PAGE_MISSING');
  return { text: cleanWiki(data.parse.wikitext), links: (data.parse.links || []).filter(x => x.ns === 0).map(x => x.title || x['*']) };
}

function chapterAt(text: string, chapterNumber = 1) {
  const chapters = chaptersFromText(text);
  const index = Math.max(0, chapterNumber - 1);
  const chapter = chapters[index] || chapters[0];
  if (!chapter || chapter.text.replace(/\s/g, '').length < 150) throw new Error('没有识别到章节正文');
  if (chapter.text.length > 120_000) throw new Error('未能可靠分出章节，请提供单章文件或带目录的 EPUB');
  return chapter;
}

export async function readWiki(page: string, lang: 'zh' | 'en' = 'zh', chapterNumber = 1) {
  const root = await wiki(page, lang);
  const isChapter = /\/.*第.+[回章]|\/.*Chapter\s+\d+/i.test(page);
  if (!isChapter) {
    const candidates = root.links.filter(x => {
      if (lang === 'zh') return x.startsWith(`${page}/`) && /第[〇零一二三四五六七八九十百千万两壹贰叁肆伍陆柒捌玖拾\d]+[回章]/.test(x);
      return x.startsWith(`${page}/`) && /chapter\s*(?:[ivxlcdm]+|\d+|one|two|three|four|five|six|seven|eight|nine|ten)\b/i.test(x);
    });
    const selected = candidates[Math.max(0, chapterNumber - 1)] ? [candidates[Math.max(0, chapterNumber - 1)], ...candidates.slice(0, 3)] : candidates.slice(0, 3);
    for (const candidate of selected) {
      try {
        const chapter = await wiki(candidate, lang);
        if (chapter.text.length >= 150) return { title: candidate.split('/').at(-1)!, text: chapter.text, url: `https://${lang}.wikisource.org/wiki/${encodeURIComponent(candidate)}` };
      } catch { /* Try next chapter link in the edition. */ }
    }
  }
  if (root.text.length < 150) throw new Error('SOURCE_TEXT_MISSING');
  const chapter = chapterAt(root.text, chapterNumber);
  return { ...chapter, url: `https://${lang}.wikisource.org/wiki/${encodeURIComponent(page)}` };
}

async function gutenberg(id: string, chapterNumber = 1) {
  let last: unknown;
  for (const url of [`https://www.gutenberg.org/ebooks/${id}.txt.utf-8`, `https://www.gutenberg.org/cache/epub/${id}/pg${id}.txt`]) {
    try { const text = await (await get(url)).text(); return { ...chapterAt(text, chapterNumber), url: `https://www.gutenberg.org/ebooks/${id}` }; } catch (error) { last = error; }
  }
  throw last;
}

async function searchWikiSource(query: string, lang: 'zh' | 'en' = 'zh'): Promise<{ title: string; sourceUrl: string; author: string; provider: string }[]> {
  const host = lang === 'zh' ? 'zh.wikisource.org' : 'en.wikisource.org';
  const provider = lang === 'zh' ? '维基文库' : 'Wikisource';
  const data = await (await get(`https://${host}/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(query)}&srnamespace=0&srlimit=8&format=json&formatversion=2`)).json<{ query?: { search?: { title: string }[] } }>();
  return (data.query?.search || []).map(x => ({ title: x.title, sourceUrl: `https://${host}/wiki/${encodeURIComponent(x.title)}`, author: '', provider }));
}

async function searchStandardEbooks(query: string): Promise<{ title: string; sourceUrl: string; author: string; provider: string }[]> {
  // Standard Ebooks has an OPDS catalog at https://standardebooks.org/opds/all
  try {
    const xml = await (await get(`https://standardebooks.org/opds/all?query=${encodeURIComponent(query)}`)).text();
    const entries = [...xml.matchAll(/<entry[\s\S]*?<\/entry>/gi)];
    const results: { title: string; sourceUrl: string; author: string; provider: string }[] = [];
    for (const entry of entries.slice(0, 6)) {
      const titleMatch = /<title[^>]*>([\s\S]*?)<\/title>/.exec(entry[0]);
      const linkMatch = /<link[^>]*href="([^"]+)"[^>]*type="application\/epub\+zip"/.exec(entry[0]);
      const authorMatch = /<author>[\s\S]*?<name>([\s\S]*?)<\/name>[\s\S]*?<\/author>/.exec(entry[0]);
      if (titleMatch && linkMatch) {
        const title = titleMatch[1].replace(/<[^>]+>/g, '').trim();
        if (title.toLowerCase().includes(query.toLowerCase())) {
          results.push({ title, sourceUrl: linkMatch[1], author: authorMatch?.[1].replace(/<[^>]+>/g, '').trim() || '', provider: 'Standard Ebooks' });
        }
      }
    }
    return results;
  } catch {
    return [];
  }
}

async function searchInternetArchive(query: string): Promise<{ title: string; sourceUrl: string; author: string; provider: string }[]> {
  try {
    const data = await (await get(`https://archive.org/advancedsearch.php?q=title%3A(${encodeURIComponent(query)})+AND+mediatype%3Atexts&fl[]=identifier&fl[]=title&fl[]=creator&rows=6&output=json`)).json<{ response?: { docs?: { identifier: string; title: string; creator?: string | string[] }[] } }>();
    return (data.response?.docs || []).map(x => ({
      title: x.title,
      sourceUrl: `https://archive.org/details/${x.identifier}`,
      author: Array.isArray(x.creator) ? x.creator.join(', ') : (x.creator || ''),
      provider: 'Internet Archive',
    }));
  } catch {
    return [];
  }
}

async function searchOpenLibrary(query: string): Promise<{ title: string; sourceUrl: string; author: string; provider: string }[]> {
  try {
    const data = await (await get(`https://openlibrary.org/search.json?q=${encodeURIComponent(query)}&limit=6`)).json<{ docs?: { key: string; title: string; author_name?: string[]; ebook_access?: string }[] }>();
    return (data.docs || [])
      .filter(x => x.ebook_access === 'public')
      .map(x => ({ title: x.title, sourceUrl: `https://openlibrary.org${x.key}`, author: x.author_name?.join(', ') || '', provider: 'Open Library' }));
  } catch {
    return [];
  }
}

export async function searchSources(query: string) {
  const title = query.trim().slice(0, 180);
  if (CLASSICS[title]) return [{ title, sourceUrl: `https://zh.wikisource.org/wiki/${encodeURIComponent(CLASSICS[title])}`, author: '', provider: '维基文库' }];
  if (ENGLISH_CLASSICS[title]) return [{ title, sourceUrl: `https://www.gutenberg.org/ebooks/${ENGLISH_CLASSICS[title]}`, author: '', provider: 'Project Gutenberg' }];

  const hasChinese = /[\u3400-\u9fff]/.test(title);
  const promises: Promise<{ title: string; sourceUrl: string; author: string; provider: string }[]>[] = [];

  if (hasChinese) {
    promises.push(searchWikiSource(title, 'zh'));
  } else {
    promises.push(
      searchWikiSource(title, 'en'),
      (async () => {
        const data = await (await get(`https://gutendex.com/books/?search=${encodeURIComponent(title)}`)).json<{ results?: { id: number; title: string; copyright: boolean | null; authors: { name: string }[] }[] }>();
        return (data.results || []).filter(x => x.copyright === false).slice(0, 8).map(x => ({ title: x.title, sourceUrl: `https://www.gutenberg.org/ebooks/${x.id}`, author: x.authors.map(a => a.name).join(', '), provider: 'Project Gutenberg' }));
      })(),
      searchStandardEbooks(title),
      searchInternetArchive(title),
      searchOpenLibrary(title),
    );
  }

  const all = (await Promise.all(promises)).flat();
  const seen = new Set<string>();
  return all.filter(x => {
    const key = x.title.toLowerCase() + '|' + x.sourceUrl;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).slice(0, 12);
}

export async function resolveSource(title: string, sourceUrl?: string, chapterNumber = 1) {
  if (sourceUrl && !sourceUrl.startsWith('upload:')) {
    const source = new URL(sourceUrl);
    if (source.protocol !== 'https:') throw new Error('SOURCE_NOT_SUPPORTED');

    if (source.hostname === 'zh.wikisource.org' && source.pathname.startsWith('/wiki/')) {
      return readWiki(decodeURIComponent(source.pathname.slice(6)), 'zh', chapterNumber);
    }
    if (source.hostname === 'en.wikisource.org' && source.pathname.startsWith('/wiki/')) {
      return readWiki(decodeURIComponent(source.pathname.slice(6)), 'en', chapterNumber);
    }
    const id = source.hostname === 'www.gutenberg.org' ? /\/(?:ebooks|epub)\/(\d+)/.exec(source.pathname)?.[1] : null;
    if (id) return gutenberg(id, chapterNumber);
  }

  if (CLASSICS[title]) return readWiki(CLASSICS[title], 'zh', chapterNumber);
  if (ENGLISH_CLASSICS[title]) return gutenberg(ENGLISH_CLASSICS[title], chapterNumber);

  const results = await searchSources(title);
  const normalize = (x: string) => x.toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');
  const result = results.find(x => normalize(x.title) === normalize(title));
  if (!result) throw new Error('SOURCE_NOT_FOUND');
  return resolveSource(result.title, result.sourceUrl, chapterNumber);
}
