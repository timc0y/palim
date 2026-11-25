import { z } from 'zod';

export const LIMITS = Object.freeze({
  upload: 20 * 1024 * 1024,
  manuscript: 240_000,
  output: 10 * 1024 * 1024,
  message: 25 * 1024 * 1024,
  xml: 256 * 1024,
  entries: 4096,
  inflated: 128 * 1024 * 1024,
  assetPixels: 4_000_000,
  retention: 86400,
  receiptRetention: 35 * 86400,
  uploads: 6,
  loginResendSeconds: 60,
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

const numericPin = z
  .object({
    at: z.number().finite(),
    note: label(160),
    series: z.number().int().min(0).max(5).optional(),
  })
  .strict();
const namedPin = z
  .object({
    at: label(48),
    note: label(160),
  })
  .strict();
const threshold = z
  .object({
    at: z.number().finite(),
    label: label(80),
  })
  .strict();

const figureBase = {
  id,
  alt: label(600),
  caption: label(1000),
  wide: z.boolean().optional(),
  footnote: text(600).optional(),
};

const tableCell = z.union([
  text(120),
  z
    .object({
      sparkline: z.array(z.number().finite()).min(2).max(24),
    })
    .strict(),
  z
    .object({
      score: z.number().int().min(0).max(10),
      max: z.number().int().min(1).max(10).default(5),
    })
    .strict(),
]);

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
  z
    .object({
      ...figureBase,
      kind: z.literal('plot'),
      xLabels: z.array(label(40)).min(2).max(12).optional(),
      yUnit: label(40).optional(),
      yRange: z.tuple([z.number().finite(), z.number().finite()]).optional(),
      series: z
        .array(
          z
            .object({
              label: label(48),
              values: z.array(z.number().finite()).min(2).max(32),
              style: z.enum(['solid', 'dashed', 'dotted']).optional(),
              band: z.array(z.number().finite().nonnegative()).min(2).max(32).optional(),
            })
            .strict(),
        )
        .min(1)
        .max(6),
      pins: z.array(numericPin).max(6).optional(),
      thresholds: z.array(threshold).max(4).optional(),
    })
    .strict(),
  z
    .object({
      ...figureBase,
      kind: z.literal('graph'),
      layout: z.enum(['flow', 'tree', 'ring']).default('flow'),
      nodes: z
        .array(
          z
            .object({
              id: label(48),
              label: label(48),
              emphasis: z.enum(['normal', 'terminal', 'muted']).optional(),
              lane: z.number().int().min(-2).max(2).optional(),
            })
            .strict(),
        )
        .min(2)
        .max(12),
      edges: z
        .array(
          z
            .object({
              from: label(48),
              to: label(48),
              label: label(40).optional(),
              style: z.enum(['solid', 'dashed']).optional(),
            })
            .strict(),
        )
        .min(1)
        .max(20),
      pins: z.array(namedPin).max(6).optional(),
    })
    .strict(),
  z
    .object({
      ...figureBase,
      kind: z.literal('trace'),
      unit: label(24).default('ms'),
      total: z.number().finite().positive().optional(),
      lanes: z
        .array(
          z
            .object({
              label: label(48),
              start: z.number().finite().nonnegative(),
              duration: z.number().finite().positive(),
              style: z.enum(['solid', 'outline', 'muted']).optional(),
              note: label(40).optional(),
            })
            .strict(),
        )
        .min(1)
        .max(12),
      pins: z.array(numericPin).max(6).optional(),
      thresholds: z.array(threshold).max(4).optional(),
    })
    .strict(),
  z
    .object({
      ...figureBase,
      kind: z.literal('anatomy'),
      unit: label(24).optional(),
      scale: z.array(label(24)).min(2).max(8).optional(),
      rows: z
        .array(
          z
            .object({
              offset: label(24).optional(),
              fields: z
                .array(
                  z
                    .object({
                      label: label(60),
                      span: z.number().finite().positive().default(1),
                      emphasis: z.enum(['normal', 'filled', 'muted']).optional(),
                    })
                    .strict(),
                )
                .min(1)
                .max(8),
            })
            .strict(),
        )
        .min(1)
        .max(8),
      pins: z.array(namedPin).max(6).optional(),
    })
    .strict(),
  z
    .object({
      ...figureBase,
      kind: z.literal('equation'),
      lhs: label(80).optional(),
      expression: label(160).optional(),
      prefix: label(60).optional(),
      fraction: z
        .object({
          numerator: label(80),
          denominator: label(80),
        })
        .strict()
        .optional(),
      suffix: label(60).optional(),
      terms: z
        .array(
          z
            .object({
              label: label(80),
              position: z.enum(['top', 'bottom']),
              at: z.number().min(0).max(1).optional(),
            })
            .strict(),
        )
        .max(6)
        .optional(),
    })
    .strict()
    .refine(
      (v) => Boolean(v.expression || v.fraction),
      'Supply an expression or a fraction for an equation figure.',
    ),
  z
    .object({
      ...figureBase,
      kind: z.literal('table'),
      columns: z
        .array(
          z
            .object({
              label: label(48),
              align: z.enum(['left', 'right']).optional(),
            })
            .strict(),
        )
        .min(2)
        .max(6),
      rows: z
        .array(
          z
            .object({
              cells: z.array(tableCell).min(2).max(6),
            })
            .strict(),
        )
        .min(1)
        .max(12),
    })
    .strict(),
]);

const chapterFootnote = z
  .object({
    id: z.string().regex(/^[a-z0-9-]{1,24}$/),
    text: label(600),
  })
  .strict();

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
      .array(
        z
          .object({
            title: label(160),
            markdown: label(50_000),
            footnotes: z.array(chapterFootnote).max(24).optional(),
          })
          .strict(),
      )
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
  .object({
    artifactId: z.uuid(),
    resendOf: z.uuid().optional(),
    destinationId: z.uuid().optional(),
  })
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
