# Fonts

Four families, all under the **SIL Open Font License 1.1**, committed here as latin-subset
`.woff2` files so the app builds and serves them without a network call:

| File | Family | Weight | Upstream |
|---|---|---|---|
| `playfair-600.woff2`, `playfair-700.woff2` | Playfair Display | 600, 700 | https://fonts.google.com/specimen/Playfair+Display |
| `cormorant-600.woff2`, `cormorant-700.woff2` | Cormorant Garamond | 600, 700 | https://fonts.google.com/specimen/Cormorant+Garamond |
| `inter-var.woff2` | Inter (variable) | 100–900 | https://fonts.google.com/specimen/Inter |
| `jetbrains-400.woff2`, `jetbrains-500.woff2` | JetBrains Mono | 400, 500 | https://fonts.google.com/specimen/JetBrains+Mono |

Each file is the unmodified latin subset served by Google Fonts for that weight. The OFL
permits redistribution and self-hosting; the families are not sold, and no Reserved Font
Name has been changed. Full licence text: https://openfontlicense.org

**Why local:** `next/font/google` fetches these files from Google during `next build`. That
made a build fail whenever the sandbox or CI runner had no egress (or Google returned a
rate-limited response) — the app could not be built at all. `next/font/local` produces the
same CSS variables (`--font-playfair`, `--font-cormorant`, `--font-inter`,
`--font-jetbrains`) from committed files, so design tokens are unchanged.
