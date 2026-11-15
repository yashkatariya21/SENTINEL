/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  darkMode: ["class", '[data-theme="dark"]'],
  theme: {
    extend: {
      colors: {
        /* ============================================================
           PROOF DESK — ink and paper, with a proofreader's three inks.
           Every pair below is measured; the ratios in the comments are
           from lib/contrast.ts against the surface named.
           ============================================================ */
        ink: {
          DEFAULT: "#111318", // 18.6:1 on paper — body and headings
          soft: "#4B5160",    //  7.9:1 on paper — secondary
          mute: "#5F6673",    //  5.8:1 on paper — hints, meta
          faint: "#9AA1AE",   //  only on ink (7.2:1). Never on paper.
        },
        paper: "#EEF0F3",           // the desk: page background
        ivory: { DEFAULT: "#FFFFFF", deep: "#FCFCFD" }, // sheets
        parchment: { DEFAULT: "#EEF0F3", deep: "#E6E9EE" },

        /* the dark surface (top bar, rail, gate strip) and, historically, the
           colour of headings — both now resolve to ink. */
        navy: {
          DEFAULT: "#111318",
          900: "#111318", 800: "#171A20", 700: "#1D2128", 500: "#2A2F38",
          300: "#9AA1AE", 100: "#E6E9EE", 50: "#F4F5F7",
        },

        /* signal red: marks, holds, strikethrough. `DEFAULT` is graphic
           (borders, stamp fill); `text` is the AA-passing ink for small words. */
        mark: { DEFAULT: "#D92D20", text: "#C42A1E", deep: "#A81F14", tint: "#FDECEA" },

        /* highlighter: a fill, never a text colour on paper. 14.3:1 under ink. */
        highlight: { DEFAULT: "#FFE066", tint: "#FFF7D1", deep: "#E8C84A" },

        /* legacy aliases: the old gold vocabulary now means highlighter, so
           existing classes keep working and mean the right thing. */
        gold: { DEFAULT: "#FFE066", soft: "#FFF0A8", deep: "#4B5160", tint: "#FFF7D1" },

        /* semantic states — always shipped with a word or a glyph */
        confirmed: { DEFAULT: "#15704A", tint: "#E7F4EC", dark: "#7BE0A8" },
        possible: { DEFAULT: "#8F5500", tint: "#FBF0D6", dark: "#F0C070" },
        critical: { DEFAULT: "#C42A1E", tint: "#FDECEA", dark: "#FF8A7A" },
        info: { DEFAULT: "#2A2F38", tint: "#EEF0F3", dark: "#C3CAD6" },
        live: { DEFAULT: "#C42A1E", night: "#FFE066", tint: "#FDECEA" },

        /* proof black: the night shift, re-cut for this identity */
        night: { DEFAULT: "#0E1014", soft: "#16191F", card: "#1D2128" },

        /* retained aliases used by older pages */
        amber: { 100: "#FFF7D1", 300: "#FFE066", 500: "#8F5500", 700: "#6E4000" },
        danger: { 50: "#FDECEA", 500: "#C42A1E", 700: "#A81F14" },
        ok: { 50: "#E7F4EC", 600: "#15704A" },
      },
      fontFamily: {
        /* the interface is set in Inter; the serif is reserved for the draft */
        sans: ["var(--font-inter)", "ui-sans-serif", "system-ui", "-apple-system", "Segoe UI", "sans-serif"],
        display: ["var(--font-inter)", "ui-sans-serif", "system-ui", "sans-serif"],
        crest: ["var(--font-inter)", "ui-sans-serif", "system-ui", "sans-serif"],
        mono: ["var(--font-plex-mono)", "ui-monospace", "SFMono-Regular", "Menlo", "monospace"],
        doc: ["var(--font-source-serif)", "Georgia", "Times New Roman", "serif"],
      },
      fontSize: {
        "hero": ["clamp(2.75rem, 7vw, 6.5rem)", { lineHeight: "0.98", letterSpacing: "-0.035em", fontWeight: "600" }],
        "section": ["clamp(1.75rem, 3.6vw, 3rem)", { lineHeight: "1.05", letterSpacing: "-0.02em" }],
        "2xs": ["0.75rem", { lineHeight: "1.25" }],  /* 12 */
        xs: ["0.8125rem", { lineHeight: "1.45" }],  /* 13 */
        sm: ["0.9375rem", { lineHeight: "1.55" }],  /* 15 */
        base: ["1.0625rem", { lineHeight: "1.6" }], /* 17 */
        lg: ["1.25rem", { lineHeight: "1.4" }],
        xl: ["1.625rem", { lineHeight: "1.25" }],
        "2xl": ["2.25rem", { lineHeight: "1.1" }],
      },
      borderRadius: {
        DEFAULT: "10px",
        sm: "7px",
        md: "10px",
        lg: "12px",
        xl: "14px",
      },
      boxShadow: {
        /* printed, not floating: a hairline plus a single 1px offset */
        card: "0 1px 0 0 rgba(17,19,24,0.04)",
        herald: "3px 3px 0 0 rgba(17,19,24,0.9)",
        seal: "0 2px 0 0 rgba(17,19,24,0.25)",
      },
      transitionTimingFunction: {
        royal: "cubic-bezier(0.22, 0.61, 0.36, 1)",
        settle: "cubic-bezier(0.16, 1, 0.3, 1)",
        snap: "cubic-bezier(0.4, 0, 0.2, 1)",
      },
      transitionDuration: {
        200: "200ms",
        micro: "140ms",
        ui: "240ms",
        reveal: "700ms",
        scene: "1200ms",
      },
      keyframes: {
        "stamp-drop": {
          "0%": { opacity: "0", transform: "scale(1.45) rotate(-9deg)" },
          "62%": { opacity: "1", transform: "scale(0.98) rotate(-5deg)" },
          "100%": { opacity: "1", transform: "scale(1) rotate(-5deg)" },
        },
        "mark-pop": {
          "0%": { opacity: "0", transform: "scale(0.4)" },
          "70%": { transform: "scale(1.12)" },
          "100%": { opacity: "1", transform: "scale(1)" },
        },
        "ink-shimmer": {
          "0%": { transform: "translateX(-100%)" },
          "100%": { transform: "translateX(100%)" },
        },
        "rule-draw": {
          "0%": { transform: "scaleX(0)" },
          "100%": { transform: "scaleX(1)" },
        },
        blink: { "0%,49%": { opacity: "1" }, "50%,100%": { opacity: "0" } },
      },
      animation: {
        "stamp-drop": "stamp-drop 620ms cubic-bezier(0.16, 1, 0.3, 1) both",
        "mark-pop": "mark-pop 420ms cubic-bezier(0.16, 1, 0.3, 1) both",
        "ink-shimmer": "ink-shimmer 1.5s cubic-bezier(0.22, 0.61, 0.36, 1) infinite",
        "rule-draw": "rule-draw 520ms cubic-bezier(0.16, 1, 0.3, 1) both",
        blink: "blink 1s steps(1) infinite",
        // legacy names, re-pointed
        "gold-shimmer": "ink-shimmer 1.5s cubic-bezier(0.22, 0.61, 0.36, 1) infinite",
        "seal-press": "stamp-drop 620ms cubic-bezier(0.16, 1, 0.3, 1) both",
      },
    },
  },
  plugins: [],
};
