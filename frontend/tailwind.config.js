/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  darkMode: ["class", '[data-theme="dark"]'],
  theme: {
    extend: {
      colors: {
        /* --- Phase 2 royal palette ------------------------------------- */
        royal: { DEFAULT: "#1B2A6B", light: "#2A3D8F", deep: "#121D4D" },
        imperial: { DEFAULT: "#3D2468", light: "#513185", deep: "#2A1849" },
        gold: { DEFAULT: "#C9A227", soft: "#E8D48B", deep: "#8F7418", tint: "#F3E4AE" },
        ivory: { DEFAULT: "#FBF7EE", deep: "#F3ECDC" },
        parchment: { DEFAULT: "#F3ECDC", deep: "#EADFC6" },
        night: { DEFAULT: "#070B1F", soft: "#0D1330", card: "#111834" },
        /* semantic — always paired with an icon and a text label in the UI */
        confirmed: { DEFAULT: "#1F6F4A", tint: "#E4F1EA", dark: "#8FD3B0" },
        possible: { DEFAULT: "#B26A00", tint: "#FBF0D6", dark: "#E7B45B" },
        critical: { DEFAULT: "#9B1C31", tint: "#FBEAEC", dark: "#F0A0AC" },
        info: { DEFAULT: "#1B2A6B", tint: "#E7EAF7", dark: "#A8B6E8" },

        /* --- retained names, re-pointed at the royal palette so every
               pre-existing page inherits the new identity ---------------- */
        ink: { DEFAULT: "#1A1A2E", soft: "#3A3A52", mute: "#5C5C72" },
        navy: {
          DEFAULT: "#0B1437",
          50: "#F6EFE0", 100: "#E8DFC9", 300: "#B9A97F",
          500: "#1B2A6B", 700: "#132055", 800: "#0E1840", 900: "#0B1437",
        },
        paper: "#FBF7EE",
        amber: { 100: "#FBF0D6", 300: "#E8D48B", 500: "#B26A00", 700: "#7E4C00" },
        danger: { 50: "#FBEAEC", 500: "#9B1C31", 700: "#7A1626" },
        ok: { 50: "#E4F1EA", 600: "#1F6F4A" },
      },
      fontFamily: {
        display: ["var(--font-playfair)", "Georgia", "serif"],
        crest: ["var(--font-cormorant)", "Georgia", "serif"],
        sans: ["var(--font-inter)", "ui-sans-serif", "system-ui", "-apple-system", "Segoe UI", "sans-serif"],
        mono: ["var(--font-jetbrains)", "ui-monospace", "SFMono-Regular", "Menlo", "monospace"],
      },
      fontSize: {
        "2xs": ["0.75rem", { lineHeight: "1.2" }],   /* 12 */
        xs: ["0.875rem", { lineHeight: "1.45" }],    /* 14 */
        sm: ["1rem", { lineHeight: "1.6" }],         /* 16 base */
        base: ["1.125rem", { lineHeight: "1.6" }],   /* 18 */
        lg: ["1.375rem", { lineHeight: "1.4" }],     /* 22 */
        xl: ["1.875rem", { lineHeight: "1.25" }],    /* 30 */
        "2xl": ["2.75rem", { lineHeight: "1.1" }],   /* 44 */
      },
      boxShadow: {
        card: "0 1px 2px rgba(11,20,55,0.06), 0 2px 10px rgba(11,20,55,0.05)",
        herald: "0 18px 40px -18px rgba(11,20,55,0.45)",
        seal: "0 6px 18px -6px rgba(143,116,24,0.55)",
      },
      backgroundImage: {
        "gradient-gold": "linear-gradient(180deg, #E2C558 0%, #C9A227 55%, #A9861C 100%)",
        "gradient-royal": "linear-gradient(160deg, #0B1437 0%, #1B2A6B 55%, #3D2468 100%)",
        "gradient-parchment": "linear-gradient(180deg, #FBF7EE 0%, #F3ECDC 100%)",
      },
      transitionTimingFunction: { royal: "cubic-bezier(0.22, 0.61, 0.36, 1)" },
      transitionDuration: { 200: "180ms" },
      keyframes: {
        rise: {
          "0%": { opacity: "0", transform: "translateY(8px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        shimmer: {
          "0%": { backgroundPosition: "-200% 0" },
          "100%": { backgroundPosition: "200% 0" },
        },
        blink: {
          "0%, 92%, 100%": { transform: "scaleY(1)" },
          "96%": { transform: "scaleY(0.1)" },
        },
      },
      animation: {
        rise: "rise 220ms cubic-bezier(0.22,0.61,0.36,1) both",
        shimmer: "shimmer 2.4s linear infinite",
        blink: "blink 5s ease-in-out infinite",
      },
    },
  },
  plugins: [],
};
