---
name: Palim
description: Ideas, in another light.
colors:
  canvas: '#F7F7FB'
  surface: '#FFFFFF'
  secondary: '#F0EEF7'
  ink: '#242239'
  muted: '#666277'
  accent: '#655681'
  action: '#343044'
  line: '#DDD9E8'
  input-border: '#8D879B'
  focus: '#7663B0'
typography:
  display:
    fontFamily: 'Instrument Serif, Georgia, serif'
    fontSize: 'clamp(56px, 7vw, 104px)'
    fontWeight: 400
    lineHeight: 1.02
    letterSpacing: '-0.025em'
  body:
    fontFamily: 'Arial, Helvetica, sans-serif'
    fontSize: '16px'
    lineHeight: 1.6
rounded:
  control: '8px'
  surface: '12px'
spacing:
  sm: '8px'
  md: '16px'
  lg: '32px'
components:
  button-primary:
    backgroundColor: '{colors.action}'
    textColor: '{colors.surface}'
    rounded: '{rounded.control}'
    padding: '14px 20px'
---

# Palim visual system

The user requested a cooler, more ethereal identity on 25 October 2026, replacing the earlier paper/terracotta direction. Astra supplied the moonlit reading-atelier direction and reviewed Mobbin references for hierarchy and restraint. Product truth remains in SIMPLE.md.

The landing page persuades through a readable specimen and two literal tasks; the workspace lets a signed-in reader create/download without Kindle setup, then choose a privately confirmed address for sending. Setup and MCP remain secondary disclosures.

- Canvas `#F7F7FB`, solid surface `#FFFFFF`, secondary `#F0EEF7`.
- Ink `#242239`, muted `#666277`, accent `#655681`, action `#343044`.
- Decorative line `#DDD9E8`, input boundary `#8D879B`, focus `#7663B0`.
- Instrument Serif regular/italic is self-hosted as WOFF2, including Latin-extended subsets, under OFL for wordmark/display; system sans for body and controls. Font display swaps; Georgia is fallback.
- An original split-leaf outline marks the brand. One nearly upright white page and a translucent offset leaf carry the hero; faint lilac/blue mist appears behind artwork only. No autoplay animation or external font request.
- Desktop separates copy and specimen. At 390px, both tasks precede the artwork. Workspace tasks precede address setup, with 48px primary controls, 16px input text, explicit focus and reduced-motion support.
- Sign-in codes belong to the inbox; Kindle confirmation codes belong to the verification book. Labels distinguish those sources. Selected recipient, actual expiry and provider-versus-device receipt remain explicit.

Reference composition: Cosmos atmosphere and generous editorial spacing, with implementation owned by original CSS/SVG. Current rendered review evidence is in the exact-source CI artifacts linked from docs/verification.md.

The final simplicity pass applied UI Skills Root, Impeccable, better-colors, better-typography, fixing-accessibility, fixing-metadata and writing-for-interfaces from the Mac’s local skill collection. It removed redundant tags, made headings literal, separated email-entry and code-entry states, associated errors and busy state with forms, added skip navigation and private-workspace noindex, compressed fonts, and reduced secondary setup to ruled disclosures. Browser proof covers the rendered task hierarchy and keyboard focus. Full assistive-technology and social-card testing remain unverified.
