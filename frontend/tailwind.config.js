/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: { DEFAULT: "#12161D", soft: "#3D4756", mute: "#66707F" },
        navy: { 50: "#EEF2F9", 100: "#DCE5F3", 500: "#1E4E8C", 700: "#123A6B", 900: "#0B2239" },
        amber: { 100: "#FDF3D7", 300: "#F7CE5B", 500: "#C98A00", 700: "#8A5D00" },
        paper: "#F7F8FA",
        danger: { 50: "#FDECEC", 500: "#B42318", 700: "#8A1B12" },
        ok: { 50: "#E8F5EE", 600: "#17663F" },
      },
      fontFamily: {
        sans: ["ui-sans-serif", "system-ui", "-apple-system", "Segoe UI", "Roboto", "Helvetica Neue", "Arial", "sans-serif"],
        mono: ["ui-monospace", "SFMono-Regular", "Menlo", "Consolas", "monospace"],
      },
      boxShadow: { card: "0 1px 2px rgba(18,22,29,0.06), 0 1px 3px rgba(18,22,29,0.04)" },
    },
  },
  plugins: [],
};
