import { ScoreBadge } from "@/components/score";
import { InstagramPlaceholder, type InstagramPreviewPost } from "./InstagramPostPreview";

function MiniStatus({ status }: { status: string }) {
  return (
    <span className="rounded-full border border-border bg-background px-2 py-1 text-xs font-semibold text-muted-foreground">
      {status.replaceAll("_", " ")}
    </span>
  );
}

export function InstagramStoryMockup({
  post,
  label = "Story",
}: {
  post: InstagramPreviewPost;
  label?: string;
}) {
  return (
    <div className="rounded-3xl border border-border bg-card p-3 shadow-soft">
      <div className="relative mx-auto aspect-[9/16] max-h-[620px] overflow-hidden rounded-[2rem] bg-muted">
        {post.mediaUrl ? (
          <img src={post.mediaUrl} alt={post.title} className="h-full w-full object-cover" />
        ) : (
          <InstagramPlaceholder />
        )}
        <div className="absolute inset-x-4 top-4 space-y-3 text-white">
          <div className="h-1 rounded-full bg-white/70" />
          <div className="flex items-center gap-2 text-xs font-bold">
            <span className="h-8 w-8 rounded-full bg-gradient-primary" /> MYINC · {label}
          </div>
        </div>
        <div className="absolute inset-x-5 bottom-8 rounded-2xl bg-black/45 p-3 text-sm font-semibold text-white backdrop-blur">
          {post.caption}
        </div>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        {post.status ? <MiniStatus status={post.status} /> : null}
        {typeof post.score === "number" ? <ScoreBadge score={post.score} /> : null}
      </div>
    </div>
  );
}
