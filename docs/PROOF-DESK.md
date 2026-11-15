# The Proof desk — interface notes

The product reviews a draft the way a proofreader does: the document is the hero, every
objection is a numbered mark in the text with a note in the margin, and the work stops at
a gate until a person signs it. The interface is built from that idea. **No API call, data
model, route, permission or business rule changed** to produce it: this is a visual and
interaction layer over the same `/v1` API.

## 1. What the screen is made of

| element | file | what it means |
|---|---|---|
| the manuscript | `app/components/proof/Manuscript.tsx` | the draft, unedited, with `<mark>` spans and numbered pins |
| the margin | `app/components/proof/Manuscript.tsx` (`MarginNote`) | one note per finding: rule, source, why, suggestion, four decisions |
| the verdict | `app/components/proof/Panels.tsx` (`VerdictCard`) | a huge mono count of open notes plus the stamp |
| the gate | `app/components/Desk.tsx` (`GateStrip`) | Draft → Six reviewers → Human decision → Release (locked) |
| the paper trail | `app/components/proof/Panels.tsx` (`PaperTrail`) | system and human entries, oldest first, linked to the audit log |
| the furniture | `app/components/Desk.tsx` | the mark, the wordmark, the stamp, the figures, Sentri |

Marks and notes are two ends of one link: pressing either brings the other into view.

## 1a. The desk behind the sheets

A flat fill was the one thing the first pass got wrong, so the paper is now a surface.
`app/components/DeskBackground.tsx` paints eight fixed, `aria-hidden`,
pointer-transparent layers under every page — the app shell, `/login` and `/welcome` all
share it:

| layer | what it is | interaction |
|---|---|---|
| the drawing grid | 24 px minor / 120 px major rules, like drafting paper | drifts at 6 % of the scroll (`--bg-drift`) |
| the ledger columns | the stat band's vertical rules carried down the page | static |
| the shade hatches | 45° hairlines, two corners, the way a draftsman shades a margin | static |
| the dot screen | one 12 px screen hanging under the top rule | drifts with the grid |
| crop marks | printer's registration crosshairs at the four trim corners | static |
| the ghost glyphs | one oversized proofreader's sign per section (circled numeral, caret, pilcrow, deletion loop, swatch stack, clause, bar reading) — large at the right edge, echoed and turned at the left | leans up to 10 px away from the pointer (`--bg-lean-x/y`) |
| paper grain | `feTurbulence` at 3 % (multiply on paper, screen on ink) | static |
| the highlighter lamp | a 640 px wash of `--highlight` | lerps toward a fine pointer, one transform per frame |
| the measuring rule | a tick strip down the right edge | fills with scroll position |

Why it does not cost legibility: every panel that carries meaning sits on opaque
`--paper` above the desk; the strongest pattern line is 6 % ink and the ghost glyphs are
9 % ink (13 % on night stock), both far below the level at which the measured contrast
ratios in §1b.1 change. axe-core was re-run over all 32 combinations after the layer went in
and still reports **0 violations** — the two regressions it caught on the way in were
fixed rather than waived (see below).

**Reduced motion.** The lamp and the lean are disabled, the glyph animation is off, the
grid stops drifting and the ruler stops easing; the patterns remain, statically. Coarse
pointers never get the lamp.

**Two real defects the new contrast pass surfaced**, both fixed here:

- the rail's band note was `--ink-3` at 72 % opacity (3.9:1) — it is now `--ink-2` with no
  dimming;
- a decided margin note was dimmed with `opacity-80`, which dropped its body text to
  3.7:1 — it now recedes by ground (`--paper-2`) instead of by ink, keeping the green ✓
  pin and the "decided" line as the state.
- the fixed white sample sheet on `/login` was inheriting night-shift tokens
  (`2.19:1`); `Stamp` grew a `tone="stock"` for sheets that never invert.

## 1b. The night shift — a dark room with three lights in it

The day shift is a desk. The night shift is the same desk in a dark room, lit from
three sides. Colour appears **only as glow**: nothing is tinted, no card is coloured,
most of the page stays near-black. It is one fixed, non-interactive layer
(`.desk-glow`, `position: absolute` inside the already-fixed `.desk-bg`,
`pointer-events: none`) painted *under* the paper patterns, so the grid rules still
read on top of the light.

| light | where | full recipe (public pages) | app screens |
|---|---|---|---|
| ember | behind the seal, bottom-right | `rgba(150,102,22,.46)` at 78 % 88 %, 45 % × 45 %, fade 70 % | `rgba(150,102,22,.20)` at 96 % 96 % |
| emerald | bottom-left | `rgba(14,107,85,.44)` at 8 % 95 %, 46 % × 44 %, fade 72 % | `rgba(14,107,85,.17)` at 18 % 100 % |
| aurora violet | top-right | `rgba(70,48,140,.42)` at 90 % 5 % | `rgba(70,48,140,.16)` at 100 % 0 % |
| aurora teal | top-left | `rgba(15,74,85,.38)` at 20 % 0 % | `rgba(15,74,85,.13)` at 44 % 0 % |
| base | the room | `#07090d` | `#07090d` |

`/welcome` and `/login` pass `variant="public"` to `DeskBackground`; everything else gets
the edge recipe. Cards stay opaque `--paper` / `--paper-2`, and the only decoration on
top of a glow is the seal's orbit ring (night shift only, contained inside the stage box
so it cannot reach the headline).

### 1b.1 Measured on the worst-case background pixel

Not against a flat fill: the glow layer was isolated in a headless render (every other
element hidden, 5 px median to drop 1–2 px decorations, 4 px inset for the trim-edge
crop marks), and the **brightest pixel any of it can produce** was used as the worst
case for every text token.

| | 1920 × 1080 | 390 × 844 (worst) |
|---|---|---|
| brightest field pixel | `rgb(36,66,62)` | `rgb(37,71,65)` |
| its luminance | 0.0462 | 0.0528 |

| token | value | on the worst glow pixel | on `--paper` `#10141a` | on `--paper-2` `#161b22` |
|---|---|---|---|---|
| `--ink` | `#f2f4f7` | **9.27** | 16.76 | 15.70 |
| `--ink-2` | `#b9c0cb` | **5.58** | 10.08 | 9.44 |
| `--ink-3` | `#a8b0bc` | **4.67** | 8.44 | 7.91 |
| `--mark-text` | `#ff9b8c` | **5.02** | 9.08 | 8.50 |
| `--pass` | `#7be0a8` | **6.36** | 11.49 | 10.77 |
| `--warn` | `#f0c070` | **6.07** | 10.98 | 10.28 |

Everything clears 4.5:1 on the worst pixel, not just on the cards. Two values had to
move to get there, and both are reported rather than hidden:

- **`--mark` / `--mark-text` went `#ff8a7a` → `#ff9b8c`.** The old red measured
  **4.38:1** on the brightest pixel the first glow recipe produced — a fail. The new
  red clears it at 5.02:1.
- **the glow alphas are the tuned values, not the first ones.** The starting recipe
  (ember .55 / emerald .45 / violet .45 / teal .40) measured 4.68:1 for `--ink-3`
  on paper analysis but only **4.42:1** once the 3 % grain and the pattern layers were
  composited on top at phone width. Ember `.46`, emerald `.44` over a wider radius, and
  violet/teal `.42`/`.38` land at 4.67:1, which is the number above.

The other dark-stock tokens: `--canvas #07090d`, `--paper #10141a`, `--paper-2 #161b22`,
`--hairline #232a33`, `--hairline-strong #2f3944`, `--ink-faint #6c7683` (ink-stock only),
`--mark-tint #2a1714`. The whole old dark grey ramp was replaced (22 hard-coded values
in `globals.css`), and the surfaced utilities (`bg-paper`, `bg-ivory`,
`bg-ivory/{90…40}`, `border-ink/{10…30}`) were remapped onto the new stock so no corner
kept a leftover tone.

**No flash, and the switch still works.** The saved theme is now painted by a three-line
inline script in `<head>` before the first frame (verified: `data-theme="dark"` is
already set at `domcontentloaded` on a cold navigation, and the script sits between
`<head>` and `<body>` in the served HTML), and `PrefsProvider` no longer writes its
default `light` over it before reading the preference. The theme switch was exercised:
`dark → light → dark`, `localStorage` following, no console errors. `ThemeSwitch`'s
fallback overlay colour was updated to `#07090d` so the circular reveal no longer
flashes a different near-black.

**The day shift did not move.** Same viewport, reduced motion, everything settled, old
build vs new build on port 3201/3100: `/login` pixel-identical, the other four pages
differ by 0.01–0.06 % — every differing pixel is inside the seal's orbit rings or the
status-bar clock (verified by diff mask bounding boxes). No light-theme token changed.

## 1c. The rail says what it is

The 64 px icon rail became a 236 px labelled rail at `lg` and up (`app/components/Shell.tsx`),
reading left to right as **glyph · name · shortcut**. Items are banded the way the desk is
organised — *The desk* (Overview, New submission, Content queue), *The record* (Brand Kit,
Rules, Learning, Analytics, Evaluation, Audit log), *Your setup* (Settings) — and each item
carries a one-line `blurb` in `lib/nav.ts` as its `title`. Below `lg` the same rail is a
drawer with the same labels, a scrim that closes it on tap and `Esc` to dismiss. The footer
states the promise in words: *Humans decide — nothing publishes on its own.*

## 2. Rules the interface is held to

1. **The draft is evidence.** A decision is recorded; the text is never rewritten.
2. **The gate really gates.** While any note is open, *Approve* is disabled and the reason
   is printed beside it in words ("Decide both notes first. The gate stays closed until
   then.") — see `verdictFor()` in `Panels.tsx`, the single source of the gate rule.
3. **A dismissal needs a reason.** The picker appears in the margin, `Esc` closes it, and
   the answer is written to the audit log with the decision.
4. **Resolution is visible.** An accepted or dismissed note turns its pin into a check and
   its phrase loses the alarm while keeping its place in the sentence.
5. **Nothing is colour alone.** Severity carries a printer's shape (square, triangle,
   diamond, circle) *and* a word; the three inks of a mark are a fill, a strike and a rule.
6. **No invented facts.** Reviewer names, rule keys, sources, counts and engine strings all
   come from the API; where a source is missing the note says "no approved source found".

## 3. Colour — measured, not asserted

Every pair below was measured against WCAG 2.1. `--ink-faint` is only ever used on ink.

| token | hex | on white | on `#FCFCFD` | on canvas `#EEF0F3` |
|---|---|---|---|---|
| `--ink` | `#111318` | 18.58 | 18.12 | 16.28 |
| `--ink-2` | `#4B5160` | 7.94 | 7.74 | 6.95 |
| `--ink-3` | `#5F6673` | 5.78 | 5.64 | 5.06 |
| `--ink-faint` | `#9AA1AE` | 2.60 ✗ | 2.53 ✗ | 2.28 ✗ |
| `--mark-text` | `#C42A1E` | 5.68 | 5.54 | 4.98 |
| `--mark` (graphic) | `#D92D20` | 4.83 | 4.71 | 4.23 ✗ |
| `--pass` | `#15704A` | 6.09 | 5.94 | 5.33 |
| `--warn` | `#8F5500` | 6.06 | 5.91 | 5.30 |
| `--highlight` (fill only) | `#FFE066` | 1.30 ✗ | — | — |

On ink `#111318`: paper `#F4F5F7` 17.03 · ink-faint 7.15 · highlight 14.25 · pass
`#7BE0A8` 11.56 · red `#FF8A7A` 8.11.

Night shift (`#0E1014` / `#16191F` / `#1D2128`): text `#F2F4F7` 17.28 / 15.98 / 14.66 ·
text-2 `#B9C0CB` 10.4 / 9.61 / 8.82 · text-3 `#8A93A1` 6.14 / 5.67 / 5.21 · red
`#FF8A7A` 8.31 / 7.69 / 7.05 · pass `#7BE0A8` 11.85 / 10.96 / 10.05.

The highlighter is a **fill**, never a text colour on paper. Red text uses `--mark-text`;
`--mark` is reserved for borders, strikes and stamp ink.

## 4. Type

Self-hosted via `next/font/local` in `app/layout.tsx` — no runtime font requests, no CDN:

| family | variable | role |
|---|---|---|
| Inter | `--font-inter` | the interface |
| IBM Plex Mono | `--font-plex-mono` | rule keys, counts, timestamps, eyebrow labels |
| Source Serif 4 | `--font-source-serif` | the draft under review, and nothing else |

## 5. Motion

Nothing runs longer than 620ms; every animation is killed globally under
`prefers-reduced-motion` (see `app/globals.css`). The stamp drops once and rests at −5°;
the red pen rule under a section heading draws once; the 3D mark oscillates rather than
spinning, so its face stays readable, and the flat SVG is used instead when the GPU, the
network or the reader's settings say no.

## 6. Verification (this branch)

- `./node_modules/.bin/tsc --noEmit` — clean
- `next lint` — clean
- `next build` — 18 routes, compiled successfully
- axe-core: **0 violations across 32 page × theme combinations** (14 pages + the proof
  desk + the approval view, each in day and night shift)
- proof-desk interaction run: Approve disabled with its inline reason; marks reachable by
  keyboard; dismissal requires a reason and `Esc` closes it; accepting a note turns its pin
  into a check and decrements the verdict count; `/` and `g`+digit shortcuts still work;
  no console errors
- mobile (390 px): no horizontal overflow on any of 14 pages; the drawer opens with all
  ten labels and `g`+digit hints visible
- the desk: lamp transform and glyph lean both tracked by measurement in a headless run
  (rest → 300,700 → 1300,200), grid drift `0px 48px` after an 800 px scroll, ruler marker
  moves with it; under `reduced_motion="reduce"` the lamp is `display:none`, the glyph
  animation is `none` and the lean transform is `none`
- no console errors in any capture run
