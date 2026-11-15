/**
 * The icon set: 20px outline glyphs, 1.6px strokes, drawn on a 24 grid.
 *
 * No icon library, no font, no sprite request — ten small paths that ship with the
 * bundle. Every one is decorative: the label lives in the rail's visible name or in
 * an `aria-label` beside it.
 */
export type IconName =
  | "overview" | "new" | "queue" | "kit" | "rules"
  | "learning" | "analytics" | "evaluation" | "audit" | "settings"
  | "search" | "close" | "menu" | "check" | "alert" | "lock" | "unlock"
  | "pen" | "mark" | "chevron" | "arrow" | "palette" | "volume" | "volume-off";

const PATHS: Record<IconName, React.ReactNode> = {
  overview: (
    <>
      <rect x="3.5" y="3.5" width="7" height="7" rx="1" />
      <rect x="13.5" y="3.5" width="7" height="7" rx="1" />
      <rect x="3.5" y="13.5" width="7" height="7" rx="1" />
      <rect x="13.5" y="13.5" width="7" height="7" rx="1" />
    </>
  ),
  new: (
    <>
      <path d="M12 5v14M5 12h14" />
    </>
  ),
  queue: (
    <>
      <path d="M4 6h16M4 12h16M4 18h10" />
    </>
  ),
  kit: (
    <>
      <path d="M4 8.5h16v11H4z" />
      <path d="M8.5 8.5V5.5h7v3" />
      <path d="M4 13h16" />
    </>
  ),
  rules: (
    <>
      <path d="M6 3.5h9l4 4v13H6z" />
      <path d="M15 3.5v4h4" />
      <path d="M9 12h7M9 16h5" />
    </>
  ),
  learning: (
    <>
      <path d="M3.5 7.5 12 4l8.5 3.5L12 11z" />
      <path d="M7 9.8V15c0 1.6 2.2 2.8 5 2.8s5-1.2 5-2.8V9.8" />
    </>
  ),
  analytics: (
    <>
      <path d="M4 20V9M10 20V4M16 20v-7M22 20H2" />
    </>
  ),
  evaluation: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7.5v5l3.2 2" />
    </>
  ),
  audit: (
    <>
      <path d="M5 3.5h14v17l-7-3.4-7 3.4z" />
      <path d="M9 9h6M9 13h4" />
    </>
  ),
  settings: (
    <>
      <circle cx="12" cy="12" r="3" />
      <path d="M12 3v2.2M12 18.8V21M3 12h2.2M18.8 12H21M5.6 5.6l1.6 1.6M16.8 16.8l1.6 1.6M18.4 5.6l-1.6 1.6M7.2 16.8l-1.6 1.6" />
    </>
  ),
  search: (
    <>
      <circle cx="10.5" cy="10.5" r="6.5" />
      <path d="M15.4 15.4 21 21" />
    </>
  ),
  close: <path d="M6 6l12 12M18 6 6 18" />,
  menu: <path d="M4 7h16M4 12h16M4 17h16" />,
  check: <path d="M4.5 12.5 9.5 17.5 19.5 6.5" />,
  alert: (
    <>
      <path d="M12 4 2.8 20h18.4z" />
      <path d="M12 10v4.2M12 17.2v.2" />
    </>
  ),
  lock: (
    <>
      <rect x="4.5" y="10.5" width="15" height="10" rx="2" />
      <path d="M8.5 10.5V7.8a3.5 3.5 0 0 1 7 0v2.7" />
    </>
  ),
  unlock: (
    <>
      <rect x="4.5" y="10.5" width="15" height="10" rx="2" />
      <path d="M8.5 10.5V7.8a3.5 3.5 0 0 1 6.6-1.6" />
    </>
  ),
  pen: (
    <>
      <path d="M15.5 4.5 19.5 8.5 8.5 19.5 4 20l.5-4.5z" />
      <path d="M13.5 6.5 17.5 10.5" />
    </>
  ),
  mark: (
    <>
      <path d="M12 3.5 14.6 9l6 .8-4.4 4.2 1.1 6-5.3-3-5.3 3 1.1-6L3.4 9.8l6-.8z" />
    </>
  ),
  chevron: <path d="M9 5l7 7-7 7" />,
  arrow: <path d="M4 12h15M13 6l6 6-6 6" />,
  palette: (
    <>
      <path d="M12 3.5a8.5 8.5 0 1 0 0 17c1.4 0 2-1 1.4-2-.7-1.2.1-2.4 1.5-2.4h1.9A3.7 3.7 0 0 0 20.5 12 8.5 8.5 0 0 0 12 3.5Z" />
      <circle cx="8.2" cy="10" r="1" />
      <circle cx="11.5" cy="7.4" r="1" />
      <circle cx="15.4" cy="9" r="1" />
    </>
  ),
  volume: (
    <>
      <path d="M4 9.5h3L12 5v14l-5-4.5H4z" />
      <path d="M15.5 9a4 4 0 0 1 0 6M18 6.5a7.5 7.5 0 0 1 0 11" />
    </>
  ),
  "volume-off": (
    <>
      <path d="M4 9.5h3L12 5v14l-5-4.5H4z" />
      <path d="M16 9.5l5 5M21 9.5l-5 5" />
    </>
  ),
};

export function Icon({
  name,
  size = 20,
  className = "",
}: {
  name: IconName;
  size?: number;
  className?: string;
}) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      className={className}
    >
      {PATHS[name]}
    </svg>
  );
}
