/** Logo system: crest, wordmark, lockups and monogram, in the sizes the product needs. */
import { Crest, Monogram, Wordmark } from "./Crest";

export { Crest, Monogram, Wordmark };

export function LogoLockup({
  variant = "horizontal",
  size = 36,
  tone = "gold",
}: {
  variant?: "horizontal" | "stacked";
  size?: number;
  tone?: "gold" | "navy" | "ivory" | "mono";
}) {
  if (variant === "stacked") {
    return (
      <span className="inline-flex flex-col items-center gap-2">
        <Crest size={size * 1.4} tone={tone} />
        <Wordmark tone={tone} size={size * 0.5} />
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-2.5">
      <Crest size={size} tone={tone} />
      <Wordmark tone={tone} size={size * 0.55} />
    </span>
  );
}

/** Print-safe single-colour mark for exports and letterheads. */
export function MonoMark({ size = 32 }: { size?: number }) {
  return (
    <span className="text-navy" style={{ color: "var(--royal-navy)" }}>
      <Crest size={size} tone="mono" />
    </span>
  );
}
