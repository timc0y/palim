import JSZip from 'jszip';
import MarkdownIt from 'markdown-it';
import { BookSchema, LIMITS, type Book } from './schema.js';
import { escapeXml as e, xhtml, sha256, parseXml } from './xml.js';
import { renderFigure, coverSvg, type Asset } from './figures.js';
import { invariant, PalimError } from './errors.js';
import { canEmail, safeFilename } from './mail.js';

export const BOOK_CSS = `html{color-scheme:light dark}body{line-height:1.5;margin:5%;}h1,h2,h3{line-height:1.18;page-break-after:avoid}h1{margin-top:1.4em}p{orphans:2;widows:2}a{text-decoration:underline}img{max-width:100%;height:auto}figure{margin:1.2em 0;page-break-inside:avoid}figcaption{font-size:.85em;line-height:1.4;margin-top:.6em}pre{white-space:pre-wrap;overflow-wrap:anywhere;font-size:.8em;border-left:2px solid;padding-left:.8em}code{font-family:monospace}blockquote{margin-left:0;padding-left:1em;border-left:2px solid}table{border-collapse:collapse;width:100%;font-size:.9em}th,td{padding:.5em;border-bottom:1px solid;text-align:left;vertical-align:top}th{font-weight:bold}.title-page{text-align:center}.subtitle{font-size:1.2em}.source-note{font-size:.85em}nav ol{line-height:1.8}.cover{margin:0;text-align:center}.cover img{max-height:95vh}.caption{font-size:.85em}`;
export interface BuiltBook { bytes: Uint8Array; source: string; preview: string; filename: string; hash: string; wordCount: number; emailEligible: boolean; warnings: string[]; }

export async function buildBook(value: unknown, assets: ReadonlyMap<string, Asset> = new Map(), now = new Date()): Promise<BuiltBook> {
  const parsed = BookSchema.safeParse(value);
  if (!parsed.success) throw new PalimError('INVALID_MANUSCRIPT', parsed.error.issues.map(i => `${i.path.join('.')}: ${i.message}`).join('; ').slice(0, 2000));
  const book: Book = parsed.data;
  const source = JSON.stringify(book, null, 2), identifier = `urn:sha256:${await sha256(source)}`;
  const modified = now.toISOString().replace(/\.\d{3}Z$/, 'Z'), zip = new JSZip();
  const file = (path: string, data: string | Uint8Array, store = false) => zip.file(path, data, { date: new Date('2000-01-01T00:00:00Z'), createFolders: false, compression: store ? 'STORE' : 'DEFLATE' });
  file('mimetype', 'application/epub+zip', true);
  file('META-INF/container.xml', '<?xml version="1.0"?><container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles><rootfile full-path="EPUB/package.opf" media-type="application/oebps-package+xml"/></rootfiles></container>');
  file('EPUB/style.css', BOOK_CSS);
  const manifest = [{ id: 'css', href: 'style.css', type: 'text/css', properties: '' }, { id: 'nav', href: 'nav.xhtml', type: 'application/xhtml+xml', properties: 'nav' }, { id: 'cover-image', href: 'cover.svg', type: 'image/svg+xml', properties: 'cover-image' }];
  file('EPUB/cover.svg', coverSvg(book.title, book.subtitle, book.creator));
  const rendered = new Map(book.figures.map(f => { const r = renderFigure(f, assets); file(`EPUB/${r.filename}`, r.bytes, r.type !== 'image/svg+xml'); manifest.push({ id: `fig-${r.id}`, href: r.filename, type: r.type, properties: '' }); return [f.id, r] as const; }));
  const spine: string[] = [], toc: { title: string; href: string }[] = [], preview: string[] = [], warnings: string[] = [];
  const addPage = (id: string, title: string, body: string, inToc = true) => { const href = `${id}.xhtml`; const xml = xhtml(title, book.language, body); parseXml(xml); file(`EPUB/${href}`, xml); manifest.push({ id, href, type: 'application/xhtml+xml', properties: '' }); spine.push(id); if (inToc) toc.push({ title, href }); preview.push(body); };
  addPage('cover', book.title, `<section class="cover" epub:type="cover"><img src="cover.svg" alt="${e(book.title)}"/></section>`, false);
  addPage('title', book.title, `<section class="title-page"><h1>${e(book.title)}</h1>${book.subtitle ? `<p class="subtitle">${e(book.subtitle)}</p>` : ''}${book.creator ? `<p>${e(book.creator)}</p>` : ''}${book.description ? `<p>${e(book.description)}</p>` : ''}<p class="source-note">${e(book.edition || 'Reading edition')} · ${modified.slice(0, 10)}</p>${book.sourceRevision ? `<p class="source-note">Source revision: ${e(book.sourceRevision)}</p>` : ''}</section>`);
  const used = new Set<string>();
  for (const [index, chapter] of book.chapters.entries()) {
    const md = new MarkdownIt({ html: false, xhtmlOut: true, linkify: false, typographer: false });
    md.validateLink = (href: string) => { try { const u = new URL(href); return u.protocol === 'https:' && !u.username && !u.password; } catch { return href.startsWith('figure:'); } };
    md.renderer.rules.image = (tokens, at) => {
      const token = tokens[at]!; const ref = token.attrGet('src') ?? ''; const image = rendered.get(ref.replace(/^figure:/, ''));
      invariant(ref.startsWith('figure:') && image, 'MISSING_FIGURE', `Use a defined figure:id reference, not a remote image: ${ref.slice(0, 100)}`);
      used.add(image.id);
      return `<img src="${image.filename}" alt="${e(image.alt)}"/>`;
    };
    let heading = 0;
    md.renderer.rules.heading_open = (tokens, at) => { const level = Math.min(6, Number(tokens[at]!.tag.slice(1)) + 1); tokens[at]!.tag = `h${level}`; return `<h${level} id="section-${++heading}">`; };
    md.renderer.rules.heading_close = (tokens, at) => `</h${Math.min(6, Number(tokens[at]!.tag.slice(1)) + 1)}>\n`;
    const tokens = md.parse(chapter.markdown, {});
    for (const t of tokens) {
      if (t.type === 'fence' && t.content.split('\n').some(l => l.length > 90)) warnings.push(`${chapter.title}: a code line exceeds 90 characters; check small-screen wrapping.`);
      if (t.type === 'inline' && t.children?.some(c => c.type === 'image')) {
        const images = t.children.filter(c => c.type === 'image');
        for (const image of images) { const f = rendered.get((image.attrGet('src') ?? '').replace(/^figure:/, '')); if (f) image.content = f.alt; }
      }
    }
    let body = md.renderer.render(tokens, md.options, {});
    for (const figure of rendered.values()) body = body.replace(`<p><img src="${figure.filename}" alt="${e(figure.alt)}"/></p>`, `<figure><img src="${figure.filename}" alt="${e(figure.alt)}"/><figcaption>${e(figure.caption)}</figcaption></figure>`);
    addPage(`chapter-${index + 1}`, chapter.title, `<section><h1>${e(chapter.title)}</h1>${body}</section>`);
  }
  for (const figure of book.figures) invariant(used.has(figure.id), 'UNUSED_FIGURE', `Figure ${figure.id} is not referenced; insert ![description](figure:${figure.id}) in a chapter.`);
  if (book.sources.length) addPage('sources', 'Sources and further reading', `<section><h1>Sources and further reading</h1><ol>${book.sources.map(s => `<li><p><a href="${e(s.url)}">${e(s.title)}</a>${s.note ? ` — ${e(s.note)}` : ''}</p></li>`).join('')}</ol></section>`);
  file('EPUB/nav.xhtml', xhtml('Contents', book.language, `<nav epub:type="toc" id="toc"><h1>Contents</h1><ol>${toc.map(t => `<li><a href="${t.href}">${e(t.title)}</a></li>`).join('')}</ol></nav>`));
  file('EPUB/package.opf', `<?xml version="1.0" encoding="utf-8"?><package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="book-id"><metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:identifier id="book-id">${identifier}</dc:identifier><dc:title>${e(book.title)}</dc:title><dc:language>${e(book.language)}</dc:language>${book.creator ? `<dc:creator>${e(book.creator)}</dc:creator>` : ''}${book.description ? `<dc:description>${e(book.description)}</dc:description>` : ''}<meta property="dcterms:modified">${modified}</meta></metadata><manifest>${manifest.map(m => `<item id="${m.id}" href="${m.href}" media-type="${m.type}"${m.properties ? ` properties="${m.properties}"` : ''}/>`).join('')}</manifest><spine>${spine.map(id => `<itemref idref="${id}"/>`).join('')}</spine></package>`);
  const bytes = await zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE', compressionOptions: { level: 6 }, platform: 'DOS' });
  invariant(bytes.length <= LIMITS.output, 'BOOK_TOO_LARGE', 'The generated EPUB exceeds 10 MiB. Reduce images or split the guide.');
  if (!canEmail(bytes.length)) warnings.push('The book is downloadable but exceeds the Cloudflare email budget.');
  const inlinePreview = preview.join('\n').replace(/src="(cover\.svg|fig-[a-z0-9-]+\.(?:svg|png|jpg))"/g, (_, filename: string) => { const f = [...rendered.values()].find(r => r.filename === filename); const content = filename === 'cover.svg' ? new TextEncoder().encode(coverSvg(book.title, book.subtitle, book.creator)) : f!.bytes; let bin = ''; for (const byte of content) bin += String.fromCharCode(byte); return `src="data:${f?.type ?? 'image/svg+xml'};base64,${btoa(bin)}"`; });
  return { bytes, source, preview: `<!doctype html><html lang="${e(book.language)}"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/><title>${e(book.title)}</title><style>${BOOK_CSS}body{max-width:42rem;margin:3rem auto;padding:0 1rem}.cover img{max-height:70vh}section{margin-bottom:4rem}</style></head><body>${inlinePreview}</body></html>`, filename: safeFilename(book.title, 'application/epub+zip'), hash: await sha256(bytes), wordCount: book.chapters.reduce((n, c) => n + c.markdown.split(/\s+/).filter(Boolean).length, 0), emailEligible: canEmail(bytes.length), warnings };
}
