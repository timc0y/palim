import { z } from 'zod';

export const LIMITS = Object.freeze({
  upload: 20 * 1024 * 1024,
  manuscript: 240_000,
  output: 10 * 1024 * 1024,
  message: 5 * 1024 * 1024,
  xml: 256 * 1024,
  entries: 4096,
  inflated: 128 * 1024 * 1024,
  assetPixels: 4_000_000,
  retention: 86400,
  receiptRetention: 35 * 86400,
  sends: 3,
  renders: 2,
  uploads: 6,
  globalDaily: 80,
  globalMonthly: 2400,
});
const text = (max: number) =>
  z
    .string()
    .max(max)
    .refine(
      (s) => !/[\u0000-\u0008\u000b\u000c\u000e-\u001f\ufffe\uffff]/u.test(s) && s.isWellFormed(),
      'Invalid XML character',
    );
const label = (max: number) =>
  text(max)
    .min(1)
    .refine((s) => s.trim().length > 0, 'Must not be blank');
const id = z.string().regex(/^[a-z][a-z0-9-]{0,47}$/);
const source = z
  .object({
    title: label(240),
    url: z.url().refine((s) => {
      const u = new URL(s);
      return u.protocol === 'https:' && !u.username && !u.password;
    }, 'Use an HTTPS source URL'),
    note: text(1000).optional(),
  })
  .strict();
const figureBase = { id, alt: label(600), caption: label(1000) };
export const FigureSchema = z.discriminatedUnion('kind', [
  z
    .object({
      ...figureBase,
      kind: z.literal('mermaid'),
      source: label(6000).refine(
        (s) => s.split('\n').length <= 80,
        'Split the diagram into fewer than 80 lines',
      ),
    })
    .strict(),
  z
    .object({
      ...figureBase,
      kind: z.literal('bars'),
      unit: label(60),
      data: z
        .array(z.object({ label: label(60), value: z.number().finite().nonnegative() }).strict())
        .min(1)
        .max(8),
      source: label(1000),
    })
    .strict(),
  z.object({ ...figureBase, kind: z.literal('image'), assetId: z.uuid() }).strict(),
]);
export const BookSchema = z
  .object({
    title: label(160),
    subtitle: text(240).optional(),
    creator: text(160).optional(),
    language: label(35)
      .default('en')
      .refine((s) => {
        try {
          return Intl.getCanonicalLocales(s).length === 1;
        } catch {
          return false;
        }
      }, 'Use a BCP 47 language tag'),
    description: text(1200).optional(),
    edition: text(80).optional(),
    sourceRevision: text(160).optional(),
    chapters: z
      .array(z.object({ title: label(160), markdown: label(50_000) }).strict())
      .min(1)
      .max(24),
    figures: z.array(FigureSchema).max(12).default([]),
    sources: z.array(source).max(80).default([]),
  })
  .strict()
  .superRefine((v, ctx) => {
    if (JSON.stringify(v).length > LIMITS.manuscript)
      ctx.addIssue({
        code: 'custom',
        message: 'Manuscript exceeds 240,000 characters; split the book.',
      });
    if (new Set(v.figures.map((f) => f.id)).size !== v.figures.length)
      ctx.addIssue({ code: 'custom', message: 'Figure IDs must be unique.' });
  });
export type Book = z.infer<typeof BookSchema>;
export type Figure = z.infer<typeof FigureSchema>;
export const SendSchema = z
  .object({ artifactId: z.uuid(), resendOf: z.uuid().optional() })
  .strict();
export const ReceiptSchema = z.object({ deliveryId: z.uuid() }).strict();
export const DestinationSchema = z
  .object({
    email: z
      .email()
      .max(180)
      .transform((s) => s.trim().toLowerCase())
      .refine(
        (s) => /^[a-z0-9._+-]+@(?:kindle\.com|free\.kindle\.com)$/.test(s),
        'Use your Amazon @kindle.com document address',
      ),
  })
  .strict();
export function parseBook(value: unknown): Book {
  return BookSchema.parse(value);
}
