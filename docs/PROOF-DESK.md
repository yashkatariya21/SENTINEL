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

## 1a.1 The day shift — a cream desk

The day shift is no longer white. It is six warm neutrals with peach and
baby-pink light: **pearl** cards, **cream** raised halves, **bone** desk, **sand**
drawer, on a warm rule instead of a cool one, with one whisper of ruby in the
top-right corner. Nothing is tinted — the warmth arrives as light, the same way
the night shift works.

| token | value | role |
|---|---|---|
| `--paper` | `#fffdf9` | pearl — the sheet a card is printed on |
| `--paper-2` | `#fbf6ee` | cream — the card's raised half |
| `--canvas` | `#f6f1e8` | bone — the desk |
| `--rail` | `#f1e9da` | sand — the side panel |
| `--rail-edge` | `#e2d7c3` | the one warm rule the panel is separated by |
| `--hairline` | `#e2dac9` | every other rule |
| `--ink-3` | `#515763` | hints and meta, deepened for the warm ground |
| `--mark-text` | `#b32519` | red that carries small words |
| `--pass` | `#146046` | resolved / approved |
| `--warn` | `#7c4c0a` | possible / waiting |

Glow, day shift: peach `rgba(240,191,151,.44)` at 80 % 92 %, baby pink
`rgba(239,192,203,.36)` at 6 % 96 %, a whisper of ruby `rgba(190,67,48,.08)` at
94 % 2 %, and a pearl highlight `rgba(255,255,255,.72)` at 16 % 0 % — at about a
third of that on the app screens.

**Measured on the warmest field pixel** the day-shift lights can produce,
`rgb(242,218,196)` (the ember corner at 1920), with the 1–2 px grid rules
median-filtered out of the capture: ink **13.8**, ink-2 **5.90**, ink-3 **4.99**,
mark-text **4.61**, pass **4.52**, warn **5.03**. On the flat stocks: bone
5.4–16.5, pearl 6.0–18.3, cream 5.7–17.3, sand 5.1–15.4. Four light tokens had to
move to clear 4.5 on that pixel and they are listed above rather than quietly
kept — the same rule as the night shift.

## 1a.2 The side panel

The rail is a drawer beside the desk, not another sheet on it: its own ground
(`--rail`), one warm rule at its edge, its own hover colour (`--rail-hover`, a
pearl that lifts off the sand, and a bluer ink at night), and at night a faint
emerald wash picked up from the bottom-left light so it belongs to the room.
The selected row keeps the system's rule — solid ink under paper in daylight,
the highlighter at night. Measured on the panel itself: ink-3 5.57 (day) /
8.44 (night), mark-text 5.15 / 9.08 — every row label clears AA on its own
ground, not just on a card.

## 1a.3 The mark

The logo inside the shield was a **padlock**, which says "locked" and nothing
else — the product's promise is a gate a *person* opens. The mark is now the
shield with a **gate** in it: an arch standing on its threshold rule, with the
seam between its two leaves as a hairline. Same shield, so it still matches the
3D seal, the engraving in `SealStage`, and the favicon silhouette; three strokes
so it survives 20 px in the header; single-colour `currentColor`, so one path
serves paper, ink and night stock. The engraved crest inside the hero seal and
the raised detail on the 3D shield were re-cut to the same gate.

## 1a.4 A note from the maker

The close of `#limits` used to carry a visible placeholder — a mono red flag
reading `// TODO — founder's note pending` — which is the one thing a public page
must never show. It is now a note in the maker's own voice: an eyebrow
(*A note from the maker*), three paragraphs of Source Serif at a 62-character
measure, a caption naming the demo workspace, and a marginal colophon at the
right edge holding the gate mark, `01 — why this exists` and the byline. The
colophon is what keeps the white space to the right of a reading measure from
looking unfinished; below `lg` it stacks under the note, and nothing is
duplicated.

It invents nothing. No name is signed, no quotation is borrowed, no metric is
claimed; the byline is the role, not a person, and the caption says plainly that
Northwind Analytics is fictional. The point it makes is the product's own limit
stated as a preference: the review stops where the judgement begins.

Measured on the field actually behind the text (day `rgb(245,238,225)`, night
`rgb(15,17,20)` — sampled with the type hidden):

| token | used for | day | night |
|---|---|---|---|
| `--ink` | the three paragraphs | 16.10 | 17.16 |
| `--ink-3` | eyebrow, caption, colophon | 6.29 | 8.65 |

Both sit well above the worst pixel recorded in §1a.1 and §1b.1, so the note
cannot be the first thing to fail when a glow moves.

## 1a.5 The order of the door — brief, then sign-in, then desk

The public link opens on the brief. The order is enforced in one place, `lib/auth.tsx`
plus the route list in `lib/routes.ts`, and nowhere else:

1. `/` **is** the brief, and it is public: an anonymous visitor is not bounced to a form
   to read it. It is prerendered, so it opens at once, and an expired session costs the
   reader nothing — a 401 on a public page no longer throws them out of it
   (`lib/api.ts` asks `isPublicRoute` first).
2. The brief's header and closing call to action point at `/login`. The desk lives behind
   it at `/desk`.
3. After `login`, `setup` or `loginAs` the destination is `takeNext() ?? "/desk"`.

Before this, `/` was the desk and the signed-out redirect was client-side: a browser
holding a stale token opened straight on the dashboard, everyone else saw a flash of it
first, and a 401 from a public page could send a reader to the sign-in form. Swapping the
two is the whole change — no API, data, rule or permission moved.

`takeNext()` accepts only a string that starts with `/` and not `//`, and removes the key
as it reads it, so the remembered path is used once and cannot become a redirect to
somewhere else. It is kept in `sessionStorage` rather than the URL so neither `/` nor
`/login` has to become dynamic: a query string would force exactly that.

`isPublicRoute()` in `lib/routes.ts` is the one list, with three readers — the auth gate,
the API client's 401 handling, and the shell's decision whether to draw the desk chrome.
It is **exact** for `/` and a prefix for the rest: `"/".startsWith("/")` is true for every
path, so a naive prefix test would make the whole desk public and switch the gate off.
`/welcome` is a permanent redirect to `/` so old links keep working (`next.config.js`).

A person already signed in who opens `/login` is sent to `/desk` rather than shown a form
they do not need. That redirect is guarded by a `submitted` ref: `submit()` ends in its own
navigation (to the room the visitor clicked), and an unguarded redirect fired afterwards
would beat it and throw the room away — which it did, until the guard was added.

Headless journey (chromium, console captured, 1440 × 950):

| step | expected | got | console |
|---|---|---|---|
| open `/` signed out | the brief at `/` | `/`, no desk furniture, 4 sign-in links | `[]` |
| `/welcome` (an old link) | `/` | `308 → /` | — |
| press the brief's CTA | `/login` | `/login` | — |
| sign in as Ananya | `/desk` | `/desk`, "Today at the gate" rendered | `[]` |
| cold deep link `/rules/changes` | `/`, path remembered | `/`, `sessionStorage['sentinel.next'] = "/rules/changes"` | — |
| sign in from there | back to the deep link | `/rules/changes` | `[]` |
| open `/login` while signed in | `/desk` | `/desk` | — |
| open `/` while signed in | the brief | `/` | — |

All twelve desk rooms were then opened signed in: every one rendered, `overflowX` 0,
no console errors.

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
- the order of the door: `/` → `/welcome`, CTA → `/login`, sign in → `/`, and a cold
  deep link → `/welcome` → sign in → the deep link it asked for; `sessionStorage` key
  consumed once; no console errors (`journey.py`)
- axe-core re-run after the flow and the maker's note: **0 violations across the same 32
  page × theme combinations**; mobile sweep at 390 px still reports `OVERFLOW: []` on all
  14 pages
- no console errors in any capture run
