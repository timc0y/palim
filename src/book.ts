import JSZip from 'jszip';
import MarkdownIt from 'markdown-it';
import { BookSchema, LIMITS, type Book } from './schema.js';
import { escapeXml as e, xhtml, sha256, parseXml } from './xml.js';
import { renderFigure, coverSvg, type Asset } from './figures.js';
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
  const rendered = new Map<string, ReturnType<typeof renderFigure>>();
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
    preview: string[] = [],
    warnings: string[] = [];
  const addPage = (id: string, title: string, body: string, inToc = true) => {
    const href = `${id}.xhtml`;
    const xml = xhtml(title, book.language, body);
    parseXml(xml);
    file(`EPUB/${href}`, xml);
    manifest.push({ id, href, type: 'application/xhtml+xml', properties: '' });
    spine.push(id);
    if (inToc) toc.push({ title, href });
    if (id !== 'cover' && id !== 'title')
      preview.push(
        body.replace(
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
    `<section class="title-page"><h1>${e(book.title)}</h1>${book.subtitle ? `<p class="subtitle">${e(book.subtitle)}</p>` : ''}${book.creator ? `<p class="author">${e(book.creator)}</p>` : ''}${book.description ? `<p>${e(book.description)}</p>` : ''}<p class="source-note">${e(book.edition || 'Reading edition')} · ${modified.slice(0, 10)}</p>${book.sourceRevision ? `<p class="source-note">Source revision: ${e(book.sourceRevision)}</p>` : ''}</section>`,
  );
  const used = new Set<string>();
  for (const [index, chapter] of book.chapters.entries()) {
    const md = new MarkdownIt({ html: false, xhtmlOut: true, linkify: false, typographer: false });
    md.validateLink = (href: string) => {
      if (href.startsWith('figure:')) return true;
      try {
        const u = new URL(href);
        return u.protocol === 'https:' && !u.username && !u.password;
      } catch {
        return href.startsWith('figure:');
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
      used.add(image.id);
      return `<img src="${image.filename}" alt="${e(image.alt)}"/>`;
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
    const levels = tokens
      .filter((t) => t.type === 'heading_open')
      .map((t) => Number(t.tag.slice(1)));
    headingBase = levels.length ? Math.min(...levels) : 1;
    for (const t of tokens) {
      if (t.type === 'fence' && t.content.split('\n').some((l) => l.length > 90))
        warnings.push(
          `${chapter.title}: a code line exceeds 90 characters; check small-screen wrapping.`,
        );
      if (t.type === 'inline' && t.children?.some((c) => c.type === 'image')) {
        const images = t.children.filter((c) => c.type === 'image');
        for (const image of images) {
          const f = rendered.get((image.attrGet('src') ?? '').replace(/^figure:/, ''));
          if (f) image.content = f.alt;
        }
      }
    }
    let body = md.renderer.render(tokens, md.options, {});
    for (const [figureIndex, figure] of [...rendered.values()].entries())
      body = body.replaceAll(
        `<p><img src="${figure.filename}" alt="${e(figure.alt)}"/></p>`,
        `<figure><img src="${figure.filename}" alt="${e(figure.alt)}"/><figcaption><span class="figure-number">Figure ${figureIndex + 1}.</span> ${e(figure.caption)}</figcaption></figure>`,
      );
    addPage(
      `chapter-${index + 1}`,
      chapter.title,
      `<section class="chapter" id="chapter-${index + 1}"><header class="chapter-heading"><p class="chapter-number">Chapter ${index + 1}</p><h1>${e(chapter.title)}</h1></header>${body}</section>`,
    );
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
      `<section id="sources"><h1>Sources and further reading</h1><ol>${book.sources.map((s) => `<li><p><a href="${e(s.url)}">${e(s.title)}</a>${s.note ? ` — ${e(s.note)}` : ''}</p></li>`).join('')}</ol></section>`,
    );
  file(
    'EPUB/nav.xhtml',
    xhtml(
      'Contents',
      book.language,
      `<nav epub:type="toc" id="toc"><h1>Contents</h1><ol>${toc.map((t) => `<li><a href="${t.href}">${e(t.title)}</a></li>`).join('')}</ol></nav>`,
    ),
  );
  file(
    'EPUB/package.opf',
    `<?xml version="1.0" encoding="utf-8"?><package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="book-id"><metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:identifier id="book-id">${identifier}</dc:identifier><dc:title>${e(book.title)}</dc:title><dc:language>${e(book.language)}</dc:language>${book.creator ? `<dc:creator>${e(book.creator)}</dc:creator>` : ''}${book.description ? `<dc:description>${e(book.description)}</dc:description>` : ''}<meta property="dcterms:modified">${modified}</meta><meta property="rendition:layout">reflowable</meta></metadata><manifest>${manifest.map((m) => `<item id="${m.id}" href="${m.href}" media-type="${m.type}"${m.properties ? ` properties="${m.properties}"` : ''}/>`).join('')}</manifest><spine>${spine.map((id) => `<itemref idref="${id}"/>`).join('')}</spine></package>`,
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
    preview: `<!doctype html><html lang="${e(book.language)}"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/><title>${e(book.title)}</title><style>${PREVIEW_CSS}</style></head><body><div class="preview-tools"><a href="/app">Back to desk</a></div><header class="preview-header"><div class="preview-heading"><p class="preview-meta">${e(book.edition || 'Reading edition')}</p><h1>${e(book.title)}</h1>${book.subtitle ? `<p class="subtitle">${e(book.subtitle)}</p>` : ''}${book.creator ? `<p class="preview-meta">${e(book.creator)}</p>` : ''}</div><img class="preview-cover" src="${dataUrl('image/png', cover)}" alt="" width="1200" height="1600"/></header><nav class="preview-contents" aria-label="Contents"><details><summary>In this edition</summary><ol>${book.chapters.map((chapter, index) => `<li><a href="#chapter-${index + 1}">${e(chapter.title)}</a></li>`).join('')}${book.sources.length ? '<li><a href="#sources">Sources and further reading</a></li>' : ''}</ol></details></nav><main>${inlinePreview}</main></body></html>`,
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
