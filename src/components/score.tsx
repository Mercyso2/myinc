import { cn } from "@/lib/utils";

export type ScoreTier = "excellent" | "good" | "review" | "regen";

export function getScoreTier(score: number): ScoreTier {
  if (score >= 90) return "excellent";
  if (score >= 75) return "good";
  if (score >= 50) return "review";
  return "regen";
}

const tierConfig: Record<ScoreTier, { label: string; classes: string; bar: string }> = {
  excellent: {
    label: "Excelente",
    classes: "bg-success/15 text-success border-success/25",
    bar: "bg-success",
  },
  good: {
    label: "Bom",
    classes: "bg-primary/15 text-primary border-primary/25",
    bar: "bg-primary",
  },
  review: {
    label: "Precisa revisar",
    classes: "bg-warning/15 text-warning border-warning/30",
    bar: "bg-warning",
  },
  regen: {
    label: "Regerar",
    classes: "bg-destructive/15 text-destructive border-destructive/25",
    bar: "bg-destructive",
  },
};

export function ScoreBadge({ score, className }: { score: number; className?: string }) {
  const tier = getScoreTier(score);
  const cfg = tierConfig[tier];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold",
        cfg.classes,
        className,
      )}
    >
      <span className="tabular-nums">{score}</span>
      {cfg.label}
    </span>
  );
}

export function ScoreRing({ score, size = 56 }: { score: number; size?: number }) {
  const tier = getScoreTier(score);
  const textColor = {
    excellent: "text-success",
    good: "text-primary",
    review: "text-warning",
    regen: "text-destructive",
  }[tier];
  const stroke = 5;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const offset = c - (score / 100) * c;
  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          strokeWidth={stroke}
          className="stroke-muted"
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={offset}
          className={cn(textColor, "transition-all duration-700")}
          stroke="currentColor"
        />
      </svg>
      <span className="absolute inset-0 flex items-center justify-center text-sm font-bold tabular-nums">
        {score}
      </span>
    </div>
  );
}
