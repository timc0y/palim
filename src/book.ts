import JSZip from 'jszip';
import MarkdownIt from 'markdown-it';
import { BookSchema, LIMITS, type Book } from './schema.js';
import { escapeXml as e, xhtml, sha256, parseXml } from './xml.js';
import { renderFigure, coverSvg, type Asset, type RenderedFigure } from './figures.js';
import { invariant, PalimError } from './errors.js';
import { canEmail, safeFilename } from './mail.js';
import { rasterize } from './raster.js';
import { BOOK_CSS, PREVIEW_CSS } from './book-styles.js';

function dataUrl(type: string, bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return `data:${type};base64,${btoa(binary)}`;
}

export interface BuiltBook {
  bytes: Uint8Array;
  source: string;
  preview: string;
  filename: string;
  hash: string;
  wordCount: number;
  emailEligible: boolean;
  warnings: string[];
}

function renderChapter(
  chapter: Book['chapters'][number],
  index: number,
  rendered: ReadonlyMap<string, RenderedFigure>,
  assignedFigureIds: Set<string>,
) {
  const usedFigures = new Set<string>();
  const firstFigureChapters: { id: string; number: number; caption: string }[] = [];
  const warnings: string[] = [];
  const figureOrder = [...rendered.keys()];
  const notes: { id: string; num: number; text: string }[] = [];
  const chapterNoteById = new Map((chapter.footnotes ?? []).map((fn) => [fn.id, fn.text]));

  const addNote = (text: string): { id: string; num: number } => {
    const num = notes.length + 1;
    const id = `fn-c${index + 1}-${num}`;
    notes.push({ id, num, text });
    return { id, num };
  };

  const md = new MarkdownIt({ html: false, xhtmlOut: true, linkify: false, typographer: false });
  md.validateLink = (href: string) => {
    if (href.startsWith('figure:')) return true;
    try {
      const u = new URL(href);
      return u.protocol === 'https:' && !u.username && !u.password;
    } catch {
      return false;
    }
  };
  md.renderer.rules.image = (tokens, at) => {
    const token = tokens[at]!;
    const ref = token.attrGet('src') ?? '';
    const image = rendered.get(ref.replace(/^figure:/, ''));
    invariant(
      ref.startsWith('figure:') && image,
      'MISSING_FIGURE',
      `Use a defined figure:id reference, not a remote image: ${ref.slice(0, 100)}`,
    );
    usedFigures.add(image.id);
    const number = figureOrder.indexOf(image.id) + 1;
    const isFirst = !assignedFigureIds.has(image.id);
    if (isFirst) {
      assignedFigureIds.add(image.id);
      firstFigureChapters.push({ id: image.id, number, caption: image.caption });
    }
    let noteRef = '';
    if (image.footnote) {
      const note = addNote(image.footnote);
      noteRef = `<a epub:type="noteref" class="noteref" href="#${note.id}">${note.num}</a>`;
    }
    return [
      `<figure${isFirst ? ` id="fig-${image.id}"` : ''} class="figure-${image.kind}">`,
      `<img src="${image.filename}" alt="${e(image.alt)}"/>`,
      '<figcaption>',
      `<span lang="en" xml:lang="en" dir="ltr" class="figure-number">Figure ${number}.</span> `,
      `<span class="caption-text">${e(image.caption)}${noteRef}</span>`,
      '</figcaption></figure>\n',
    ].join('');
  };
  let heading = 0;
  let headingBase = 1;
  md.renderer.rules.heading_open = (tokens, at) => {
    const level = Math.min(6, Number(tokens[at]!.tag.slice(1)) - headingBase + 2);
    tokens[at]!.tag = `h${level}`;
    return `<h${level} id="chapter-${index + 1}-section-${++heading}">`;
  };
  md.renderer.rules.heading_close = (tokens, at) =>
    `</h${Math.min(6, Number(tokens[at]!.tag.slice(1)) - headingBase + 2)}>\n`;
  const tokens = md.parse(chapter.markdown, {});
  const levels = tokens.filter((t) => t.type === 'heading_open').map((t) => Number(t.tag.slice(1)));
  headingBase = levels.length ? Math.min(...levels) : 1;
  for (const [at, t] of tokens.entries()) {
    if (t.type === 'fence' && t.content.split('\n').some((l) => l.length > 90))
      warnings.push(
        `${chapter.title}: a code line exceeds 90 characters; check small-screen wrapping.`,
      );
    if (t.type === 'inline' && t.children?.some((c) => c.type === 'image')) {
      invariant(
        tokens[at - 1]?.type === 'paragraph_open' &&
          tokens[at + 1]?.type === 'paragraph_close' &&
          t.children.every(
            (c) =>
              ['image', 'softbreak', 'hardbreak'].includes(c.type) ||
              (c.type === 'text' && !c.content.trim()),
          ),
        'FIGURE_PLACEMENT',
        `${chapter.title}: put figure references in their own paragraph, separated from prose by a blank line.`,
      );
      tokens[at - 1]!.hidden = true;
      tokens[at + 1]!.hidden = true;
    }
  }
  let body = md.renderer.render(tokens, md.options, {});
  if (chapterNoteById.size > 0) {
    body = body.replace(/\[\^([a-z0-9-]{1,24})\]/g, (match, noteKey: string) => {
      const noteText = chapterNoteById.get(noteKey);
      if (!noteText) return match;
      const note = addNote(noteText);
      return `<a epub:type="noteref" class="noteref" href="#${note.id}">${note.num}</a>`;
    });
  }
  const footnotesHtml = notes.length
    ? `<div class="footnotes">${notes
        .map(
          (note) =>
            `<aside epub:type="footnote" id="${note.id}" class="footnote"><p>${note.num}. ${e(note.text)}</p></aside>`,
        )
        .join('')}</div>`
    : '';
  return {
    html: [
      `<section class="chapter" id="chapter-${index + 1}">`,
      '<header class="chapter-heading">',
      `<p lang="en" xml:lang="en" dir="ltr" class="chapter-number">Chapter ${index + 1}</p>`,
      `<h1>${e(chapter.title)}</h1>`,
      '</header>',
      body,
      footnotesHtml,
      '</section>',
    ].join(''),
    usedFigures,
    firstFigureChapters,
    warnings,
  };
}

function readingPreview(book: Book, body: string, rtl: boolean): string {
  const byline = [book.creator, book.edition].filter(Boolean).join(' · ');
  const contents = book.chapters.map(
    (chapter, index) => `<li><a href="#chapter-${index + 1}">${e(chapter.title)}</a></li>`,
  );
  if (book.sources.length)
    contents.push('<li><a lang="en" href="#sources">Sources and further reading</a></li>');
  return [
    '<!doctype html>',
    `<html lang="${e(book.language)}"${rtl ? ' dir="rtl"' : ''}>`,
    '<head><meta charset="utf-8"/>',
    '<meta name="viewport" content="width=device-width,initial-scale=1"/>',
    `<title>${e(book.title)}</title>`,
    `<style>${PREVIEW_CSS}</style>`,
    '</head><body>',
    '<a lang="en" class="preview-skip" href="#reading-text">Skip to book text</a>',
    '<div lang="en" class="preview-tools"><a href="/app#files-panel">Open Shelf</a></div>',
    '<header class="preview-header"><div class="preview-heading">',
    `<h1 id="top" tabindex="-1">${e(book.title)}</h1>`,
    book.subtitle ? `<p class="subtitle">${e(book.subtitle)}</p>` : '',
    byline ? `<p class="preview-meta">${e(byline)}</p>` : '',
    '</div></header>',
    contents.length > 1
      ? `<nav lang="en" class="preview-contents" aria-label="Contents"><details><summary id="contents">Contents</summary><ol lang="${e(book.language)}">${contents.join('')}</ol></details></nav>`
      : '',
    `<main id="reading-text" tabindex="-1">${body}</main>`,
    contents.length > 1
      ? '<footer lang="en" class="preview-tools"><a href="#contents">Back to contents</a></footer>'
      : '<footer lang="en" class="preview-tools"><a href="#top">Back to top</a></footer>',
    '</body></html>',
  ].join('');
}

export async function buildBook(
  value: unknown,
  assets: ReadonlyMap<string, Asset> = new Map(),
  now = new Date(),
): Promise<BuiltBook> {
  const parsed = BookSchema.safeParse(value);
  if (!parsed.success)
    throw new PalimError(
      'INVALID_MANUSCRIPT',
      parsed.error.issues
        .map((i) => `${i.path.join('.')}: ${i.message}`)
        .join('; ')
        .slice(0, 2000),
    );
  const book: Book = parsed.data;
  const script = new Intl.Locale(book.language).maximize().script;
  const rtl = ['Adlm', 'Arab', 'Hebr', 'Mand', 'Nkoo', 'Rohg', 'Samr', 'Syrc', 'Thaa'].includes(
    script ?? '',
  );
  const source = JSON.stringify(book, null, 2),
    identifier = `urn:sha256:${await sha256(source)}`;
  const modified = now.toISOString().replace(/\.\d{3}Z$/, 'Z'),
    zip = new JSZip();
  const file = (path: string, data: string | Uint8Array, store = false) =>
    zip.file(path, data, {
      date: new Date('2000-01-01T00:00:00Z'),
      createFolders: false,
      compression: store ? 'STORE' : 'DEFLATE',
    });
  file('mimetype', 'application/epub+zip', true);
  file(
    'META-INF/container.xml',
    '<?xml version="1.0"?><container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles><rootfile full-path="EPUB/package.opf" media-type="application/oebps-package+xml"/></rootfiles></container>',
  );
  file('EPUB/style.css', BOOK_CSS);
  const manifest = [
    { id: 'css', href: 'style.css', type: 'text/css', properties: '' },
    { id: 'nav', href: 'nav.xhtml', type: 'application/xhtml+xml', properties: 'nav' },
    { id: 'cover-image', href: 'cover.png', type: 'image/png', properties: 'cover-image' },
  ];
  const cover = await rasterize(coverSvg(book.title, book.subtitle, book.creator));
  file('EPUB/cover.png', cover, true);
  const rendered = new Map<string, RenderedFigure>();
  // Render sequentially to bound WASM image memory across a manuscript's figures.
  for (const f of book.figures) {
    const r = renderFigure(f, assets);
    if (r.type === 'image/svg+xml') {
      r.bytes = await rasterize(new TextDecoder().decode(r.bytes));
      r.type = 'image/png';
      r.filename = r.filename.replace(/\.svg$/, '.png');
    }
    file(`EPUB/${r.filename}`, r.bytes, true);
    manifest.push({ id: `fig-${r.id}`, href: r.filename, type: r.type, properties: '' });
    rendered.set(f.id, r);
  }
  const spine: string[] = [],
    toc: { title: string; href: string }[] = [],
    loi: { title: string; href: string }[] = [],
    preview: string[] = [],
    warnings: string[] = [];
  const addPage = (id: string, title: string, body: string) => {
    const href = `${id}.xhtml`;
    const xml = xhtml(title, book.language, body, rtl);
    parseXml(xml);
    file(`EPUB/${href}`, xml);
    manifest.push({ id, href, type: 'application/xhtml+xml', properties: '' });
    spine.push(id);
    toc.push({ title, href });
    if (id === 'title') return;
    const previewBody = body
      .replace('<section ', () => `<section tabindex="-1" aria-label="${e(title)}" `)
      .replace(/<table>([\s\S]*?)<\/thead>/g, (header: string) => {
        const wide = (header.match(/<th[ >]/g) || []).length >= 5;
        return `<div class="preview-table"${wide ? ' tabindex="0"' : ''}>${header}`;
      })
      .replaceAll('</table>', '</table></div>');
    if (id === 'chapter-1' && book.chapters.length === 1 && title === book.title) {
      preview.push(previewBody.replace(/<header class="chapter-heading">[\s\S]*?<\/header>/, ''));
    } else
      preview.push(
        previewBody.replace(
          /<(\/?)h([1-5])(\s[^>]*)?>/g,
          (_, close: string, level: string, attrs: string = '') =>
            `<${close}h${Number(level) + 1}${attrs}>`,
        ),
      );
  };
  // Kindle consumes the OPF cover image; a duplicate HTML cover in the spine can fail conversion.
  addPage(
    'title',
    book.title,
    [
      '<section class="title-page">',
      `<h1 id="top" tabindex="-1">${e(book.title)}</h1>`,
      book.subtitle ? `<p class="subtitle">${e(book.subtitle)}</p>` : '',
      book.creator ? `<p class="author">${e(book.creator)}</p>` : '',
      book.description ? `<p class="description">${e(book.description)}</p>` : '',
      `<p class="source-note">${e(book.edition || 'Reading edition')} · ${modified.slice(0, 10)}</p>`,
      book.sourceRevision
        ? `<p class="source-note">Source revision: ${e(book.sourceRevision)}</p>`
        : '',
      '</section>',
    ].join(''),
  );
  const used = new Set<string>();
  const assignedFigureIds = new Set<string>();
  for (const [index, chapter] of book.chapters.entries()) {
    const chapterPage = renderChapter(chapter, index, rendered, assignedFigureIds);
    addPage(`chapter-${index + 1}`, chapter.title, chapterPage.html);
    for (const id of chapterPage.usedFigures) used.add(id);
    for (const fig of chapterPage.firstFigureChapters) {
      loi.push({
        title: `Figure ${fig.number}. ${fig.caption}`,
        href: `chapter-${index + 1}.xhtml#fig-${fig.id}`,
      });
    }
    warnings.push(...chapterPage.warnings);
  }

  for (const figure of book.figures)
    invariant(
      used.has(figure.id),
      'UNUSED_FIGURE',
      `Figure ${figure.id} is not referenced; insert ![description](figure:${figure.id}) in a chapter.`,
    );
  if (book.sources.length)
    addPage(
      'sources',
      'Sources and further reading',
      [
        '<section class="source-section" id="sources" lang="en">',
        `<h1 dir="ltr">Sources and further reading</h1><ol lang="${e(book.language)}">`,
        ...book.sources.map(
          (entry) =>
            `<li><p><a href="${e(entry.url)}">${e(entry.title)}</a></p>${entry.note ? `<p>${e(entry.note)}</p>` : ''}</li>`,
        ),
        '</ol></section>',
      ].join(''),
    );
  const loiNav = loi.length
    ? `<nav epub:type="loi" id="loi"><h2>Artifacts</h2><ol lang="${e(book.language)}" xml:lang="${e(book.language)}">${loi.map((item) => `<li><a href="${item.href}">${e(item.title)}</a></li>`).join('')}</ol></nav>`
    : '';
  file(
    'EPUB/nav.xhtml',
    xhtml(
      'Contents',
      'en',
      `<nav epub:type="toc" id="toc"><h1>Contents</h1><ol lang="${e(book.language)}" xml:lang="${e(book.language)}">${toc.map((t) => `<li><a href="${t.href}"${t.href === 'sources.xhtml' ? ' lang="en" xml:lang="en"' : ''}>${e(t.title)}</a></li>`).join('')}</ol></nav>` +
        loiNav +
        '<nav epub:type="landmarks" hidden="hidden"><h2>Book navigation</h2><ol>' +
        '<li><a epub:type="titlepage" href="title.xhtml">Title page</a></li>' +
        '<li><a epub:type="bodymatter" href="chapter-1.xhtml">Start reading</a></li>' +
        (book.sources.length
          ? '<li><a epub:type="bibliography" href="sources.xhtml">Sources and further reading</a></li>'
          : '') +
        '</ol></nav>',
      rtl,
    ),
  );
  file(
    'EPUB/package.opf',
    [
      '<?xml version="1.0" encoding="utf-8"?>',
      '<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="book-id">',
      '<metadata xmlns:dc="http://purl.org/dc/elements/1.1/">',
      `<dc:identifier id="book-id">${identifier}</dc:identifier>`,
      `<dc:title>${e(book.title)}</dc:title>`,
      `<dc:language>${e(book.language)}</dc:language>`,
      book.creator ? `<dc:creator>${e(book.creator)}</dc:creator>` : '',
      book.description ? `<dc:description>${e(book.description)}</dc:description>` : '',
      `<meta property="dcterms:modified">${modified}</meta>`,
      '<meta property="rendition:layout">reflowable</meta>',
      '</metadata><manifest>',
      ...manifest.map(
        (item) =>
          `<item id="${item.id}" href="${item.href}" media-type="${item.type}"${item.properties ? ` properties="${item.properties}"` : ''}/>`,
      ),
      rtl ? '</manifest><spine page-progression-direction="rtl">' : '</manifest><spine>',
      ...spine.map((id) => `<itemref idref="${id}"/>`),
      '</spine></package>',
    ].join(''),
  );
  const bytes = await zip.generateAsync({
    type: 'uint8array',
    compression: 'DEFLATE',
    compressionOptions: { level: 6 },
    platform: 'DOS',
  });
  invariant(
    bytes.length <= LIMITS.output,
    'BOOK_TOO_LARGE',
    'The generated EPUB exceeds 10 MiB. Reduce images or split the guide.',
  );
  if (!canEmail(bytes.length))
    warnings.push('The book is downloadable but exceeds the Cloudflare email budget.');
  const inlinePreview = preview
    .join('\n')
    .replace(/src="(fig-[a-z0-9-]+\.(?:png|jpg))"/g, (_, filename: string) => {
      const f = [...rendered.values()].find((r) => r.filename === filename)!;
      return `src="${dataUrl(f.type, f.bytes)}"`;
    });
  return {
    bytes,
    source,
    preview: readingPreview(book, inlinePreview, rtl),
    filename: safeFilename(book.title, 'application/epub+zip'),
    hash: await sha256(bytes),
    wordCount: book.chapters.reduce(
      (n, c) => n + c.markdown.split(/\s+/).filter(Boolean).length,
      0,
    ),
    emailEligible: canEmail(bytes.length),
    warnings,
  };
}
