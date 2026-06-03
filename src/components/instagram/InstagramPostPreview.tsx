import { MoreHorizontal } from "lucide-react";
import { InstagramActionsBar } from "./InstagramActionsBar";
import { InstagramCaptionBlock } from "./InstagramCaptionBlock";

export interface InstagramPreviewPost {
  title: string;
  brandName?: string;
  location?: string;
  mediaUrl?: string | null;
  mediaUrls?: string[] | null;
  caption: string;
  hashtags?: string[];
  scheduledAt?: string;
  status?: string;
  score?: number;
  channel?: string;
  format?: string;
  pages?: number;
}

function formatDate(value?: string) {
  if (!value) return undefined;
  return new Date(value).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
}

export function InstagramPlaceholder({ label = "Criativo ainda não gerado" }: { label?: string }) {
  return (
    <div className="flex h-full w-full flex-col items-center justify-center bg-[radial-gradient(circle_at_top_left,#ff6b2c55,transparent_35%),linear-gradient(135deg,#111827,#09090b_55%,#ff6b2c22)] p-6 text-center">
      <div className="rounded-full border border-white/20 px-4 py-2 text-xs font-bold uppercase tracking-[0.24em] text-white/70">
        MYINC
      </div>
      <p className="mt-6 max-w-56 text-lg font-extrabold text-white">{label}</p>
      <p className="mt-2 text-xs text-white/55">
        Placeholder premium até existir media_url no Storage.
      </p>
    </div>
  );
}

export function InstagramPostPreview({
  post,
  aspect = "4/5",
}: {
  post: InstagramPreviewPost;
  aspect?: "4/5" | "1/1";
}) {
  const brandName = post.brandName ?? "MYINC";
  return (
    <article className="overflow-hidden rounded-3xl border border-border bg-card shadow-soft">
      <header className="flex items-center justify-between px-4 py-3">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-primary text-xs font-extrabold text-primary-foreground">
            M
          </div>
          <div>
            <p className="text-sm font-bold leading-tight">{brandName}</p>
            {post.location ? (
              <p className="text-[0.68rem] text-muted-foreground">{post.location}</p>
            ) : null}
          </div>
        </div>
        <MoreHorizontal className="h-5 w-5 text-muted-foreground" />
      </header>
      <div className={`relative ${aspect === "1/1" ? "aspect-square" : "aspect-[4/5]"} bg-muted`}>
        {post.mediaUrls?.[0] || post.mediaUrl ? (
          <img
            src={post.mediaUrls?.[0] || post.mediaUrl || ""}
            alt={post.title}
            className="h-full w-full object-cover"
          />
        ) : (
          <InstagramPlaceholder />
        )}
        {post.pages && post.pages > 1 ? (
          <div className="absolute right-3 top-3 rounded-full bg-black/55 px-2 py-1 text-xs font-semibold text-white">
            1/{post.pages}
          </div>
        ) : null}
      </div>
      {post.pages && post.pages > 1 ? (
        <div className="flex justify-center gap-1 pt-3">
          {Array.from({ length: post.pages }).map((_, index) => (
            <span
              key={index}
              className={`h-1.5 w-1.5 rounded-full ${index === 0 ? "bg-primary" : "bg-muted-foreground/35"}`}
            />
          ))}
        </div>
      ) : null}
      <InstagramActionsBar likes={post.score ? post.score * 17 : undefined} />
      <InstagramCaptionBlock
        brandName={brandName}
        caption={post.caption}
        hashtags={post.hashtags}
        dateLabel={formatDate(post.scheduledAt)}
        status={post.status}
        score={post.score}
        channel={post.channel}
        format={post.format}
      />
    </article>
  );
}
