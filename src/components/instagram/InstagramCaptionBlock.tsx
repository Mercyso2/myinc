import { ScoreBadge } from "@/components/score";

function MiniStatus({ status }: { status: string }) {
  return (
    <span className="rounded-full border border-border bg-background px-2 py-1 text-[0.65rem] font-semibold text-muted-foreground">
      {status.replaceAll("_", " ")}
    </span>
  );
}

export function InstagramCaptionBlock({
  brandName,
  caption,
  hashtags,
  dateLabel,
  status,
  score,
  channel,
  format,
}: {
  brandName: string;
  caption: string;
  hashtags?: string[];
  dateLabel?: string;
  status?: string;
  score?: number;
  channel?: string;
  format?: string;
}) {
  return (
    <div className="space-y-2 px-4 pb-4 text-sm">
      <p className="line-clamp-3">
        <b>{brandName}</b> {caption}
      </p>
      {hashtags?.length ? (
        <p className="line-clamp-2 text-primary">
          {hashtags.map((tag) => (tag.startsWith("#") ? tag : `#${tag}`)).join(" ")}
        </p>
      ) : null}
      <div className="flex flex-wrap items-center gap-2 pt-1">
        {status ? <MiniStatus status={status} /> : null}
        {typeof score === "number" ? <ScoreBadge score={score} /> : null}
        {channel ? (
          <span className="rounded-full border border-border px-2 py-1 text-[0.65rem] text-muted-foreground">
            {channel}
          </span>
        ) : null}
        {format ? (
          <span className="rounded-full border border-border px-2 py-1 text-[0.65rem] text-muted-foreground">
            {format}
          </span>
        ) : null}
      </div>
      {dateLabel ? (
        <p className="text-[0.65rem] uppercase tracking-wide text-muted-foreground">{dateLabel}</p>
      ) : null}
    </div>
  );
}
