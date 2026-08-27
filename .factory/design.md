# Visual thesis: the migration field notebook

OpenAPI Collection Bridge should feel like the notebook an API engineer keeps beside a terminal: squared paper, graphite annotations, clipped evidence, and deliberate verification marks. It is a single-mode, light-paper interface. The fixed paper world makes the trust report easier to scan and avoids an ornamental theme switch; operating-system dark mode still receives an explicit warm-ink color scheme rather than an uncontrolled inversion.

## Palette

| Token | Value | Use |
| --- | --- | --- |
| paper | `#f3eedf` | page background, derived from engineering graph paper |
| sheet | `#fffaf0` | raised working sheets |
| ink | `#1d2926` | primary text, 13.1:1 on paper |
| graphite | `#53615c` | secondary text, 5.7:1 on paper |
| grid | `#c8d4c8` | non-semantic notebook rule |
| teal | `#006b62` | links, focus, primary actions; 5.7:1 on paper |
| teal-dark | `#064b46` | active controls and button fill |
| red-pencil | `#a63d2f` | errors and unsupported marks |
| amber-pencil | `#8a5600` | transformed/warning marks |
| green-pencil | `#176b44` | preserved/success marks |

Status never relies on color: every mark has a word and a distinct glyph. Paper grain and graph rules remain very low contrast so text keeps visual priority.

## Type and spacing

The display face is the local `Georgia` serif stack, giving titles the authority of a laboratory logbook. Interface labels, code, and body copy use the local system monospace stack (`ui-monospace`, `SFMono-Regular`, `Consolas`) so the product feels native beside API files. No network fonts are loaded.

Type steps are 14, 16, 20, 28, and a fluid 44–68px display. Body copy is at least 16px with 1.6 leading and a 68-character measure. Spacing follows a strict 4/8px rhythm: 4, 8, 12, 16, 24, 32, 48, 64, 96. Desktop composition is an asymmetrical two-column notebook spread; at 390px it becomes one continuous worksheet, dropping only decorative marginalia.

## Interaction grammar and depth

Primary actions resemble a dark rubber stamp: squared corners, a 2px ink border, and a 2px down/side press. Secondary links look like handwritten underlines. Evidence blocks are separate clipped sheets only when they are independent artifacts. Focus is a 3px teal outline with 3px offset. Every target is at least 44px.

The live demo follows the migration path left-to-right on wide screens and top-to-bottom on phones: source note → destination tab → evidence report. Parsing errors stay beside the source and are announced. Offline state is a paper slip explaining that conversion remains local while license verification will retry.

## Motion

On first reveal, evidence slips settle by 6px over 220ms and the successful stamp scales from 0.96 over 180ms. Hover and press feedback lasts 150ms and only uses transform, opacity, or color. Nothing loops. Under `prefers-reduced-motion: reduce`, transitions are removed and state changes are instant.

## Original asset plan and provenance

The hero asset is a generated editorial still-life: an overhead engineer’s notebook in which five differently shaped API-format notes converge into one audited ledger, with teal verification ticks and red unsupported marks. It explains neutral translation rather than decorating the page. It contains no legible generated text, logos, people, or UI screenshots. It will be generated with the factory image generator, optimized to WebP under 300 KB, and stored locally under `site/public/`.

Prompt (authored for this product): “Overhead editorial still life for a developer tool landing page, an open squared-paper laboratory notebook on a warm cream desk, five small abstract paper slips with distinct diagram languages flowing through a hand-drawn bridge into one tidy audit ledger, graphite lines, teal verification ticks and a few restrained red pencil exception circles, physical paper fibers, subtle shadows, meticulous technical mood, asymmetrical wide composition with breathing room, no people, no brands, no logos, no legible words, no screen, no gradients, no watermark.” Generator provenance and the resulting file size are recorded in the handoff.
