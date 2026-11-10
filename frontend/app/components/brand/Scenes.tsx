"use client";
/**
 * Small decorative scenes: Sentri in context, drawn from the same primitives.
 * Every scene is `aria-hidden` — the message it illustrates is always in text
 * next to it. Each one is a few hundred bytes of SVG, no raster images.
 */
import { Sentri, type SentriMood } from "./Sentri";
import { Damask, Lattice, Fan, Rosette } from "./Pattern";

type SceneName =
  | "welcome" | "reviewing" | "empty" | "success" | "notfound" | "loading"
  | "evaluation" | "sleeping";

interface SceneProps {
  name: SceneName;
  height?: number;
  className?: string;
}

const SCENES: Record<SceneName, { mood: SentriMood; caption: string; backdrop: "damask" | "lattice" | "fan" | "rosette" | "none" }> = {
  welcome: { mood: "welcome", caption: "Sentri, ready to read", backdrop: "damask" },
  reviewing: { mood: "scanning", caption: "Sentri reading a draft", backdrop: "lattice" },
  empty: { mood: "sleeping", caption: "Sentri resting until there is work", backdrop: "rosette" },
  success: { mood: "celebrating", caption: "Sentri celebrating a cleared queue", backdrop: "fan" },
  notfound: { mood: "confused", caption: "Sentri puzzled by a missing page", backdrop: "lattice" },
  loading: { mood: "thinking", caption: "Sentri thinking", backdrop: "damask" },
  evaluation: { mood: "thinking", caption: "Sentri reading the evaluation", backdrop: "rosette" },
  sleeping: { mood: "sleeping", caption: "Sentri asleep", backdrop: "fan" },
};

export function Scene({ name, height = 150, className = "" }: SceneProps) {
  const spec = SCENES[name];
  const Backdrop = spec.backdrop === "damask" ? Damask
    : spec.backdrop === "lattice" ? Lattice
    : spec.backdrop === "fan" ? Fan
    : spec.backdrop === "rosette" ? Rosette : null;

  return (
    <div
      className={`relative flex items-end justify-center overflow-hidden rounded-lg border border-gold/25 bg-gradient-parchment ${className}`}
      style={{ height }}
      aria-hidden
    >
      {Backdrop && <Backdrop className="pointer-events-none absolute inset-0 h-full w-full opacity-40" />}
      {/* floor line */}
      <svg className="absolute inset-x-0 bottom-8 h-8 w-full opacity-50" viewBox="0 0 200 24" preserveAspectRatio="none">
        <path d="M0 18h200" stroke="#C9A227" strokeWidth="0.7" strokeDasharray="3 4" />
      </svg>
      <div className="relative -mb-1">
        <Sentri mood={spec.mood} size={Math.round(height * 0.62)} decorative />
      </div>
      {/* tiny props that make the scene readable at a glance */}
      {name === "reviewing" && (
        <svg className="absolute bottom-7 right-[18%] h-8 w-8" viewBox="0 0 32 32">
          <rect x="4" y="3" width="20" height="26" rx="2" fill="#FBF7EE" stroke="#8F7418" strokeWidth="1" />
          <g stroke="#0B1437" strokeWidth="1" opacity="0.5">
            <path d="M8 9h12M8 13h12M8 17h8" />
          </g>
          <circle cx="24" cy="22" r="6" fill="none" stroke="#C9A227" strokeWidth="2" />
          <path d="M28 26l3 3" stroke="#C9A227" strokeWidth="2" strokeLinecap="round" />
        </svg>
      )}
      {name === "success" && (
        <svg className="absolute bottom-7 left-[20%] h-8 w-8" viewBox="0 0 32 32">
          <circle cx="16" cy="16" r="12" fill="#1F6F4A" />
          <path d="M10 16.5 14.5 21 22 12" stroke="#FBF7EE" strokeWidth="2.6" fill="none" strokeLinecap="round" />
        </svg>
      )}
      {name === "notfound" && (
        <svg className="absolute bottom-7 right-[20%] h-9 w-9" viewBox="0 0 36 36">
          <rect x="7" y="4" width="22" height="28" rx="2" fill="#FBF7EE" stroke="#8F7418" strokeWidth="1" />
          <path d="M12 12h12M12 17h8" stroke="#0B1437" strokeWidth="1.2" opacity="0.5" />
          <text x="18" y="28" textAnchor="middle" fontSize="9" fontFamily="serif" fill="#9B1C31">?</text>
        </svg>
      )}
      {name === "sleeping" && (
        <svg className="absolute right-[22%] top-6 h-7 w-7" viewBox="0 0 24 24">
          <g fill="#8F7418" fontFamily="serif" fontSize="9">
            <text x="4" y="20">z</text><text x="10" y="13">z</text><text x="16" y="7">z</text>
          </g>
        </svg>
      )}
    </div>
  );
}

export const SCENE_CATALOGUE = Object.keys(SCENES) as SceneName[];
