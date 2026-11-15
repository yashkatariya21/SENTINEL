"use client";
/**
 * The desk behind the sheets.
 *
 * Seven layers, cheapest first, none of them decorative noise:
 *
 *  1. the drawing grid — 24px minor, 120px major, like drafting paper, drifting a
 *     little slower than the page so it reads as a surface and not as a fill;
 *  2. a shade hatch — 45° hairlines in the two corners, the way a draftsman shades
 *     a margin;
 *  3. a dot screen — one 24px screen at the very top, under the rule;
 *  4. crop marks — the printer's registration crosshairs, one per corner;
 *  5. ghost glyphs — oversized proofreader's signs, one per section, so each page
 *     has its own quiet signature instead of the same grey rectangle. They move
 *     against the pointer by a few pixels;
 *  6. paper grain — a turbulence filter at 3%, which is what stops a flat hex from
 *     reading as "screen";
 *  7. the highlighter lamp — a soft wash that follows a fine pointer, and a
 *     measuring rule down the right edge that fills as you scroll.
 *
 * Everything here is fixed, aria-hidden and pointer-transparent; every panel that
 * carries meaning sits on opaque `--paper` above it. The strongest pattern line is
 * ~6% ink, so no text ever loses AA contrast. The lamp and the parallax are off for
 * touch pointers and off entirely under `prefers-reduced-motion`, which also stops
 * the glyph animation. Each effect writes one transform per frame and nothing else.
 */
import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";

/** One glyph per section. Drawn, not typed, so no font can change their weight. */
const GLYPHS: Record<string, React.ReactNode> = {
  overview: (
    // a circled section number, the way a chapter opens
    <>
      <circle cx="60" cy="60" r="52" />
      <path d="M60 26v68M40 46h22M40 66h22M40 86h22" />
    </>
  ),
  new: (
    // a caret: insert here
    <>
      <path d="M22 96 60 22l38 74" />
      <path d="M40 74h40" />
    </>
  ),
  content: (
    // a pilcrow, the oldest proof mark for "new paragraph"
    <>
      <path d="M74 22v76" />
      <path d="M58 22h16M58 22c-14 0-24 9-24 24s10 24 24 24" />
    </>
  ),
  proof: (
    // the deleted-word mark: a stroke through and a loop under
    <>
      <path d="M20 58c14-16 26-16 40 0s26 16 40 0" />
      <path d="M20 78h80" />
    </>
  ),
  kit: (
    // a swatch stack
    <>
      <rect x="26" y="30" width="68" height="20" rx="2" />
      <rect x="26" y="58" width="68" height="20" rx="2" />
      <rect x="26" y="86" width="42" height="14" rx="2" />
    </>
  ),
  rules: (
    // a numbered clause
    <>
      <path d="M22 34h76M22 62h76M22 90h48" />
      <path d="M22 22v84" />
    </>
  ),
  record: (
    // a bar reading
    <>
      <path d="M26 96V62M48 96V36M70 96V50M92 96V24" />
    </>
  ),
};

function glyphFor(pathname: string): React.ReactNode {
  if (pathname === "/") return GLYPHS.overview;
  if (pathname.startsWith("/content/")) return GLYPHS.proof;
  if (pathname.startsWith("/content")) return GLYPHS.content;
  if (pathname.startsWith("/new")) return GLYPHS.new;
  if (pathname.startsWith("/kit") || pathname.startsWith("/brand")) return GLYPHS.kit;
  if (pathname.startsWith("/rules")) return GLYPHS.rules;
  if (
    pathname.startsWith("/analytics") ||
    pathname.startsWith("/learn") ||
    pathname.startsWith("/evaluation") ||
    pathname.startsWith("/audit") ||
    pathname.startsWith("/settings")
  )
    return GLYPHS.record;
  return GLYPHS.content;
}

export function DeskBackground({ variant = "app" }: { variant?: "public" | "app" }) {
  const pathname = usePathname();
  const rootRef = useRef<HTMLDivElement>(null);
  const lampRef = useRef<HTMLDivElement>(null);
  const markerRef = useRef<HTMLDivElement>(null);

  /* pointer: the lamp lerps toward the cursor, the glyphs lean away from it a touch */
  useEffect(() => {
    const root = rootRef.current;
    const lamp = lampRef.current;
    if (!root) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const fine = window.matchMedia("(pointer: fine)").matches;
    if (reduced || !fine) return;

    let tx = window.innerWidth * 0.62;
    let ty = window.innerHeight * 0.3;
    let x = tx;
    let y = ty;
    let frame = 0;
    let leanFrame = 0;

    const paint = () => {
      if (lamp) lamp.style.transform = `translate3d(${x - 320}px, ${y - 320}px, 0)`;
      // −1 … 1 across the viewport, written once per settle, not per pixel
      root.style.setProperty("--bg-lean-x", ((tx / window.innerWidth) * 2 - 1).toFixed(3));
      root.style.setProperty("--bg-lean-y", ((ty / window.innerHeight) * 2 - 1).toFixed(3));
    };
    paint();

    const tick = () => {
      frame = 0;
      x += (tx - x) * 0.075;
      y += (ty - y) * 0.075;
      if (lamp) lamp.style.transform = `translate3d(${x - 320}px, ${y - 320}px, 0)`;
      if (Math.abs(tx - x) + Math.abs(ty - y) > 0.6) frame = requestAnimationFrame(tick);
    };

    /* the ghost layer leans away from the pointer — one style write per frame */
    const writeLean = () => {
      leanFrame = 0;
      root.style.setProperty("--bg-lean-x", ((tx / window.innerWidth) * 2 - 1).toFixed(3));
      root.style.setProperty("--bg-lean-y", ((ty / window.innerHeight) * 2 - 1).toFixed(3));
    };

    const onMove = (event: PointerEvent) => {
      tx = event.clientX;
      ty = event.clientY;
      if (!leanFrame) leanFrame = requestAnimationFrame(writeLean);
      if (!frame) frame = requestAnimationFrame(tick);
    };

    const onVisibility = () => {
      if (document.hidden && frame) {
        cancelAnimationFrame(frame);
        frame = 0;
      }
    };

    window.addEventListener("pointermove", onMove, { passive: true });
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.removeEventListener("pointermove", onMove);
      document.removeEventListener("visibilitychange", onVisibility);
      if (frame) cancelAnimationFrame(frame);
      if (leanFrame) cancelAnimationFrame(leanFrame);
    };
  }, []);

  /* scroll: the grid drifts, the right rule fills */
  useEffect(() => {
    const root = rootRef.current;
    const marker = markerRef.current;
    if (!root) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let frame = 0;

    const update = () => {
      frame = 0;
      const max = document.documentElement.scrollHeight - window.innerHeight;
      const p = max > 0 ? Math.min(1, Math.max(0, window.scrollY / max)) : 0;
      if (!reduced) root.style.setProperty("--bg-drift", `${Math.round(window.scrollY * 0.06)}px`);
      if (marker) {
        marker.style.transform = `translateY(${p * 100}%)`;
        marker.style.opacity = p > 0.002 ? "1" : "0.4";
      }
    };
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };

    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      if (frame) cancelAnimationFrame(frame);
    };
  }, [pathname]);

  return (
    <div aria-hidden="true" ref={rootRef} className="desk-bg">
      {/* 0 · the three lights: full on the public pages, a third on the desk.
             Painted first so the grid rules still read on top of them. In the
             day shift this layer is simply nothing. */}
      <div className={`desk-glow ${variant === "public" ? "desk-glow-full" : "desk-glow-edge"}`} />

      {/* 1 · the drawing grid, drifting with the page */}
      <div className="desk-grid absolute inset-0" />

      {/* 2 · the shade hatches, in the two corners nobody writes in */}
      <div className="desk-hatch desk-hatch-tl absolute inset-0" />
      <div className="desk-hatch desk-hatch-br absolute inset-0" />

      {/* 3 · the ledger columns: the stat band's rules carried down the page */}
      <div className="desk-columns absolute inset-0" />

      {/* 4 · the dot screen under the top rule */}
      <div className="desk-dots absolute inset-0" />

      {/* 5 · crop marks, printed at the trim edge */}
      {["left-3 top-3", "right-3 top-3", "left-3 bottom-3", "right-3 bottom-3"].map((pos) => (
        <svg key={pos} className={`reg-mark absolute h-5 w-5 ${pos}`} viewBox="0 0 20 20">
          <path d="M10 0v6M10 14v6M0 10h6M14 10h6" />
          <circle cx="10" cy="10" r="2.2" fill="none" />
        </svg>
      ))}

      {/* 6 · the section's ghost glyphs: one large, one echoed and turned */}
      <div key={pathname} className="desk-ghosts absolute inset-0">
        <svg
          className="ghost-glyph absolute -right-16 top-[26%] hidden h-[22rem] w-[22rem] md:block"
          viewBox="0 0 120 120"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.1"
        >
          {glyphFor(pathname)}
        </svg>
        <svg
          className="ghost-glyph-echo absolute -left-24 bottom-[8%] hidden h-[18rem] w-[18rem] xl:block"
          viewBox="0 0 120 120"
          fill="none"
          stroke="currentColor"
          strokeWidth="0.9"
        >
          {glyphFor(pathname)}
        </svg>
      </div>

      {/* 7 · paper grain */}
      <svg className="grain absolute inset-0 h-full w-full">
        <filter id="desk-grain">
          <feTurbulence type="fractalNoise" baseFrequency="0.82" numOctaves="3" stitchTiles="stitch" />
          <feColorMatrix type="saturate" values="0" />
        </filter>
        <rect width="100%" height="100%" filter="url(#desk-grain)" />
      </svg>

      {/* 8a · the highlighter lamp */}
      <div ref={lampRef} className="desk-lamp" />

      {/* 8b · the measuring rule */}
      <div className="desk-ruler absolute inset-y-0 right-0 hidden w-6 lg:block">
        {Array.from({ length: 40 }).map((_, i) => (
          <span
            key={i}
            className="absolute right-0 block bg-[color:var(--hairline)]"
            style={{ top: `${i * 2.5}%`, height: 1, width: i % 4 === 0 ? 12 : 6 }}
          />
        ))}
        <div ref={markerRef} className="desk-ruler-marker absolute right-0 top-0 w-full">
          <span className="ml-auto block h-[1.5px] w-full bg-[color:var(--mark)]" />
        </div>
      </div>
    </div>
  );
}
