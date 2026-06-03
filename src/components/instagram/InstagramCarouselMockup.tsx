import { useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { InstagramActionsBar } from "./InstagramActionsBar";
import { InstagramCaptionBlock } from "./InstagramCaptionBlock";
import { InstagramPlaceholder, type InstagramPreviewPost } from "./InstagramPostPreview";

function formatDate(value?: string) {
  if (!value) return undefined;
  return new Date(value).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
}

export function InstagramCarouselMockup({
  post,
  pages = 5,
}: {
  post: InstagramPreviewPost;
  pages?: number;
}) {
  const brandName = post.brandName ?? "MYINC";
  const slides = useMemo(() => {
    const urls = Array.isArray(post.mediaUrls) && post.mediaUrls.length ? post.mediaUrls : [];
    if (!urls.length && post.mediaUrl) return [post.mediaUrl];
    return urls;
  }, [post.mediaUrl, post.mediaUrls]);
  const totalPages = Math.max(pages, slides.length || 0);
  const [currentPage, setCurrentPage] = useState(0);

  useEffect(() => {
    setCurrentPage(0);
  }, [post.title, slides.length, totalPages]);

  function previous() {
    setCurrentPage((page) => (page <= 0 ? Math.max(0, totalPages - 1) : page - 1));
  }

  function next() {
    setCurrentPage((page) => (page >= totalPages - 1 ? 0 : page + 1));
  }

  const currentUrl = slides[currentPage] ?? slides[0] ?? null;

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
        <div className="rounded-full bg-primary/10 px-3 py-1 text-xs font-bold text-primary">
          Carrossel
        </div>
      </header>
      <div className="relative aspect-[4/5] bg-muted">
        {currentUrl ? (
          <img
            src={currentUrl}
            alt={`${post.title} página ${currentPage + 1}`}
            className="h-full w-full object-cover"
          />
        ) : (
          <InstagramPlaceholder label={`Página ${currentPage + 1} do carrossel ainda não gerada`} />
        )}
        <div className="absolute right-3 top-3 rounded-full bg-black/60 px-2.5 py-1 text-xs font-semibold text-white">
          {currentPage + 1}/{totalPages || 1}
        </div>
        {totalPages > 1 ? (
          <>
            <Button
              type="button"
              size="icon"
              variant="secondary"
              className="absolute left-3 top-1/2 h-9 w-9 -translate-y-1/2 rounded-full bg-black/55 text-white hover:bg-black/70"
              onClick={previous}
              aria-label="Página anterior do carrossel"
            >
              <ChevronLeft className="h-5 w-5" />
            </Button>
            <Button
              type="button"
              size="icon"
              variant="secondary"
              className="absolute right-3 top-1/2 h-9 w-9 -translate-y-1/2 rounded-full bg-black/55 text-white hover:bg-black/70"
              onClick={next}
              aria-label="Próxima página do carrossel"
            >
              <ChevronRight className="h-5 w-5" />
            </Button>
          </>
        ) : null}
      </div>
      {totalPages > 1 ? (
        <div className="flex items-center justify-center gap-1.5 px-4 pt-3">
          {Array.from({ length: totalPages }).map((_, index) => (
            <button
              key={index}
              type="button"
              aria-label={`Ir para página ${index + 1}`}
              onClick={() => setCurrentPage(index)}
              className={`h-2 rounded-full transition-all ${index === currentPage ? "w-6 bg-primary" : "w-2 bg-muted-foreground/35"}`}
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
