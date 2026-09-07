// Shared by the browser importer and the source service. Never truncate a chapter.
export type TextChapter = { title: string; text: string };
const heading = /^(?:第[〇零一二三四五六七八九十百千万两壹贰叁肆伍陆柒捌玖拾\d]+[章节回卷部夜](?:\s|[：:、.．]|$|[^\d])[^\n]{0,100}|chapter\s+(?:[ivxlcdm]+|\d+|one|two|three|four|five|six|seven|eight|nine|ten)\b[^\n]{0,100})$/i;
export function normalizeText(text: string) {
  return text.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n').replace(/[\t \u3000]+/g, ' ').replace(/\n[ ]+/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
}
export function chaptersFromText(input: string): TextChapter[] {
  let text = normalizeText(input);
  const start = /\*\*\* START OF (?:THE|THIS) PROJECT GUTENBERG EBOOK[^\n]*\n/i.exec(text);
  if (start) text = text.slice(start.index + start[0].length);
  text = text.split(/\*\*\* END OF (?:THE|THIS) PROJECT GUTENBERG EBOOK/i)[0];
  const lines = text.split('\n');
  const marks: { title: string; index: number }[] = [];
  let offset = 0;
  for (const line of lines) {
    if (heading.test(line.trim())) marks.push({ title: line.trim(), index: offset });
    offset += line.length + 1;
  }
  // A TOC has headings but almost no narrative between them. Discard those entries.
  const chapters = marks.map((mark, i) => ({ title: mark.title, text: text.slice(mark.index, marks[i + 1]?.index ?? text.length).trim() }))
    .filter((chapter) => chapter.text.slice(chapter.title.length).replace(/\s/g, '').length >= 150);
  // The final TOC entry can include the preface. Prefer the later, repeated first heading.
  const first = chapters.findIndex((chapter) => /^(?:第[零〇0]*[一壹1][章节回夜]|chapter\s+(?:i|1|one)\b)/i.test(chapter.title));
  if (chapters.length) return first > 0 ? chapters.slice(first) : chapters;
  return text ? [{ title: '正文', text: text.trim() }] : [];
}
export function firstChapter(text: string) {
  const chapter = chaptersFromText(text)[0];
  if (!chapter || chapter.text.replace(/\s/g, '').length < 150) throw new Error('没有识别到章节正文');
  if (chapter.text.length > 120_000) throw new Error('未能可靠分出第一章，请提供单章文件或带目录的 EPUB');
  return chapter;
}
export function splitForRewrite(text: string, limit = 2200) {
  const parts: string[] = [];
  let rest = normalizeText(text);
  while (rest.length > limit) {
    let cut = rest.lastIndexOf('\n', limit);
    if (cut < limit / 2) cut = Math.max(rest.lastIndexOf('。', limit), rest.lastIndexOf('. ', limit)) + 1;
    if (cut < limit / 2) cut = limit;
    parts.push(rest.slice(0, cut)); rest = rest.slice(cut);
  }
  if (rest.trim()) parts.push(rest);
  return parts;
}
