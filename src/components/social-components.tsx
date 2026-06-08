import { useEffect, useMemo, useState, type ElementType, type ReactNode } from "react";
import {
  AlertTriangle,
  Archive,
  CalendarDays,
  Check,
  Copy,
  ImagePlus,
  Loader2,
  MessageSquare,
  Pencil,
  Play,
  Plus,
  RefreshCw,
  RotateCcw,
  Save,
  Search,
  Send,
  Sparkles,
  Trash2,
  Upload,
  Wand2,
  X,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Textarea } from "@/components/ui/textarea";
import { ScoreBadge } from "@/components/score";
import { InstagramFeedMockup } from "@/components/instagram/InstagramFeedMockup";
import { InstagramStoryMockup } from "@/components/instagram/InstagramStoryMockup";
import { InstagramReelsMockup } from "@/components/instagram/InstagramReelsMockup";
import { InstagramCarouselMockup } from "@/components/instagram/InstagramCarouselMockup";
import type {
  AIBrainRule,
  AIPromptTemplate,
  ContentComment,
  ContentFormat,
  MediaAsset,
  SocialPost,
  SystemLog,
} from "@/lib/social-types";
import { cn } from "@/lib/utils";

const statusTone: Record<string, string> = {
  rascunho: "border-border bg-muted text-muted-foreground",
  tema_aprovado: "border-primary/30 bg-primary/10 text-primary",
  em_producao: "border-warning/30 bg-warning/10 text-warning",
  aguardando_revisao: "border-warning/30 bg-warning/10 text-warning",
  ajuste_solicitado: "border-warning/30 bg-warning/10 text-warning",
  aprovado: "border-success/30 bg-success/10 text-success",
  agendado: "border-primary/30 bg-primary/10 text-primary",
  publicando: "border-warning/30 bg-warning/10 text-warning",
  publicado: "border-success/30 bg-success/10 text-success",
  erro: "border-destructive/30 bg-destructive/10 text-destructive",
  pausado: "border-warning/30 bg-warning/10 text-warning",
  arquivado: "border-border bg-muted text-muted-foreground",
  reprovado: "border-destructive/30 bg-destructive/10 text-destructive",
  queued: "border-primary/30 bg-primary/10 text-primary",
  processing: "border-warning/30 bg-warning/10 text-warning",
  failed: "border-destructive/30 bg-destructive/10 text-destructive",
  sucesso: "border-success/30 bg-success/10 text-success",
  alerta: "border-warning/30 bg-warning/10 text-warning",
  info: "border-primary/30 bg-primary/10 text-primary",
};

const channelTone: Record<string, string> = {
  Instagram: "border-pink-500/30 bg-pink-500/10 text-pink-300",
  Facebook: "border-blue-500/30 bg-blue-500/10 text-blue-300",
  Ambos: "border-primary/30 bg-primary/10 text-primary",
};

const emptyMediaAssets: MediaAsset[] = [];

function dateValue(value?: string) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toISOString().slice(0, 16);
}

function asHashtags(value: string[] | string) {
  if (Array.isArray(value)) return value;
  return value
    .split(/[\s,]+/)
    .map((tag) => tag.trim())
    .filter(Boolean)
    .map((tag) => (tag.startsWith("#") ? tag : `#${tag}`));
}

export function MetricCard({
  label,
  value,
  helper,
  icon: Icon,
  tone = "primary",
}: {
  label: string;
  value: string | number;
  helper?: string;
  icon: ElementType;
  tone?: "primary" | "success" | "warning" | "destructive";
}) {
  const tones = {
    primary: "bg-primary/10 text-primary",
    success: "bg-success/15 text-success",
    warning: "bg-warning/15 text-warning",
    destructive: "bg-destructive/15 text-destructive",
  };
  return (
    <Card className="overflow-hidden rounded-3xl border-border bg-card shadow-soft transition hover:-translate-y-0.5 hover:shadow-elevated">
      <CardContent className="p-5">
        <div className="flex items-center justify-between">
          <span
            className={cn("flex h-10 w-10 items-center justify-center rounded-2xl", tones[tone])}
          >
            <Icon className="h-5 w-5" />
          </span>
          {helper && <span className="text-xs font-semibold text-muted-foreground">{helper}</span>}
        </div>
        <p className="mt-5 text-3xl font-bold tracking-tight tabular-nums">{value}</p>
        <p className="mt-1 text-sm text-muted-foreground">{label}</p>
      </CardContent>
    </Card>
  );
}

export function StatusBadge({ status }: { status: string }) {
  return (
    <span
      className={cn(
        "inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold capitalize",
        statusTone[status] ?? "bg-muted text-muted-foreground border-border",
      )}
    >
      {status.replaceAll("_", " ")}
    </span>
  );
}

export function ChannelBadge({ channel }: { channel: string }) {
  return (
    <span
      className={cn(
        "inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold",
        channelTone[channel] ?? "bg-muted text-muted-foreground border-border",
      )}
    >
      {channel}
    </span>
  );
}

export function ConnectionStatus({
  label,
  status,
  detail,
}: {
  label: string;
  status: "online" | "warning" | "offline";
  detail: string;
}) {
  const tone =
    status === "online" ? "bg-success" : status === "warning" ? "bg-warning" : "bg-destructive";
  return (
    <div className="flex items-center justify-between rounded-2xl border border-border bg-background p-4">
      <div>
        <p className="text-sm font-semibold">{label}</p>
        <p className="mt-1 text-xs text-muted-foreground">{detail}</p>
      </div>
      <span className="flex items-center gap-2 text-xs font-semibold text-muted-foreground">
        <span className={cn("h-2.5 w-2.5 rounded-full", tone)} />
        {status === "online" ? "Ativo" : status === "warning" ? "Atenção" : "Configurar"}
      </span>
    </div>
  );
}

export function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="rounded-3xl border border-dashed border-border bg-card p-10 text-center shadow-soft">
      <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-primary">
        <Sparkles className="h-7 w-7" />
      </div>
      <h3 className="mt-5 text-lg font-bold">{title}</h3>
      <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">{description}</p>
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export function LoadingState({ label = "Processando com IA..." }: { label?: string }) {
  return (
    <div className="flex items-center gap-2 rounded-2xl border border-border bg-card p-4 text-sm text-muted-foreground">
      <Loader2 className="h-4 w-4 animate-spin text-primary" />
      {label}
    </div>
  );
}

export function ErrorState({ message }: { message: string }) {
  return (
    <div className="flex items-center gap-2 rounded-2xl border border-destructive/25 bg-destructive/10 p-4 text-sm text-destructive">
      <AlertTriangle className="h-4 w-4" />
      {message}
    </div>
  );
}

function toInstagramPost(post: SocialPost) {
  return {
    title: post.title,
    brandName: "MYINC",
    location: post.channel === "Instagram" ? "Brasil" : undefined,
    mediaUrl: post.mediaUrl,
    mediaUrls: post.carouselMediaUrls,
    caption: post.caption,
    hashtags: post.hashtags,
    scheduledAt: post.scheduledAt,
    status: post.status,
    score: post.qualityScore,
    channel: post.channel,
    format: post.format,
  };
}

export function PostPreview({ post }: { post: SocialPost }) {
  const preview = toInstagramPost(post);
  if (post.format.includes("Story")) return <InstagramStoryMockup post={preview} />;
  if (post.format.includes("Reels")) return <InstagramReelsMockup post={preview} />;
  if (post.format.includes("Carrossel")) {
    return <InstagramCarouselMockup post={preview} pages={post.format.includes("8") ? 8 : 5} />;
  }
  return <InstagramFeedMockup post={preview} />;
}

export function PromptViewer({ prompt }: { prompt: string }) {
  return (
    <details className="rounded-2xl border border-border bg-background p-4">
      <summary className="cursor-pointer text-sm font-semibold text-primary">
        Ver prompt usado pela IA
      </summary>
      <pre className="mt-4 max-h-72 whitespace-pre-wrap rounded-xl bg-sidebar p-4 text-xs leading-relaxed text-sidebar-foreground/80">
        {prompt || "Prompt ainda não gerado."}
      </pre>
    </details>
  );
}

export function HumanCommentsPanel({
  comments,
  onAddComment,
}: {
  comments: ContentComment[];
  onAddComment?: (comment: string) => Promise<void> | void;
}) {
  const [draft, setDraft] = useState("");
  const [items, setItems] = useState(comments);
  useEffect(() => setItems(comments), [comments]);
  async function add() {
    if (!draft.trim() || !onAddComment) return;
    const text = draft.trim();
    await onAddComment(text);
    setItems([
      {
        id: `local-${Date.now()}`,
        author: "Você",
        comment: text,
        status: "aberto",
        createdAt: "agora",
      },
      ...items,
    ]);
    setDraft("");
  }
  return (
    <div className="rounded-3xl border border-border bg-card p-5 shadow-soft">
      <div className="flex items-center gap-2">
        <MessageSquare className="h-4 w-4 text-primary" />
        <h3 className="font-semibold">Comentários humanos</h3>
      </div>
      <div className="mt-4 flex gap-2">
        <Input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Ex.: deixe mais premium, use menos texto..."
        />
        <Button
          onClick={() => void add()}
          disabled={!onAddComment || !draft.trim()}
          className="bg-gradient-primary text-primary-foreground"
        >
          <Send className="h-4 w-4" />
        </Button>
      </div>
      <div className="mt-4 space-y-3">
        {items.map((comment) => (
          <div key={comment.id} className="rounded-2xl border border-border bg-background p-3">
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm font-medium">{comment.author}</p>
              <Badge
                variant="outline"
                className={comment.status === "resolvido" ? "text-success" : "text-warning"}
              >
                {comment.status}
              </Badge>
            </div>
            <p className="mt-2 text-sm text-muted-foreground">{comment.comment}</p>
          </div>
        ))}
        {!items.length && (
          <p className="text-sm text-muted-foreground">
            Nenhum comentário. Use feedback humano para orientar a próxima versão da IA.
          </p>
        )}
      </div>
    </div>
  );
}

export function PostCard({
  post,
  onOpen,
  onApprove,
  onRegenerate,
  onGenerateImage,
  onPublish,
  onArchive,
}: {
  post: SocialPost;
  onOpen?: () => void;
  onApprove?: () => void;
  onRegenerate?: () => void;
  onGenerateImage?: () => void;
  onPublish?: () => void;
  onArchive?: () => void;
}) {
  const isCarousel = post.format.toLowerCase().includes("carrossel");
  const isVideo =
    post.format.toLowerCase().includes("reels") ||
    post.format.toLowerCase().includes("video") ||
    post.format.toLowerCase().includes("vÃ­deo");
  const mediaCount = isCarousel
    ? post.carouselMediaUrls?.length || 0
    : isVideo
      ? post.videoStoryboardUrls?.length || (post.mediaUrl ? 1 : 0)
      : post.mediaUrl
        ? 1
        : 0;
  return (
    <Card className="overflow-hidden rounded-2xl border-border bg-card shadow-soft transition hover:-translate-y-0.5 hover:shadow-elevated">
      <div className="grid gap-0 sm:grid-cols-[230px_minmax(0,1fr)]">
        <div className="bg-background/70 p-4">
          <PostPreview post={post} />
        </div>
        <CardContent className="p-5">
          <div className="flex flex-wrap items-center gap-2">
            <ChannelBadge channel={post.channel} />
            <StatusBadge status={post.status} />
            <ScoreBadge score={post.qualityScore} />
            <Badge variant="outline">{post.format}</Badge>
          </div>
          <div className="mt-3 grid gap-2 rounded-2xl border border-border bg-background p-3 text-xs text-muted-foreground sm:grid-cols-3">
            <span>
              <b className="text-foreground">{mediaCount}</b>{" "}
              {isCarousel ? "pÃ¡ginas" : isVideo ? "ativos vÃ­deo" : "mÃ­dia"}
            </span>
            <span>
              <b className="text-foreground">{post.qualityScore || 0}</b>/100 score
            </span>
            <span className={post.mediaUrl ? "text-success" : "text-warning"}>
              {post.mediaUrl ? "mÃ­dia pronta" : "aguarda mÃ­dia"}
            </span>
          </div>
          <h3 className="mt-4 line-clamp-2 text-lg font-bold">{post.title}</h3>
          <p className="mt-2 line-clamp-2 text-sm text-muted-foreground">
            {post.caption || post.theme}
          </p>
          <div className="mt-4 grid gap-2 text-xs text-muted-foreground sm:grid-cols-2">
            <span>{post.format}</span>
            <span>{new Date(post.scheduledAt).toLocaleString("pt-BR")}</span>
          </div>
          {post.errorMessage && (
            <div className="mt-3">
              <ErrorState message={post.errorMessage} />
            </div>
          )}
          <div className="mt-4 flex flex-wrap gap-2">
            <Button
              size="sm"
              className="bg-gradient-primary text-primary-foreground"
              disabled={!onApprove}
              onClick={onApprove}
            >
              <Check className="h-4 w-4" /> Aprovar
            </Button>
            <Button size="sm" variant="outline" onClick={onOpen}>
              <Pencil className="h-4 w-4" /> Editar
            </Button>
            <Button size="sm" variant="outline" disabled={!onRegenerate} onClick={onRegenerate}>
              <RefreshCw className="h-4 w-4" /> Regerar
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={!onGenerateImage}
              onClick={onGenerateImage}
            >
              <ImagePlus className="h-4 w-4" /> Mídia
            </Button>
            <Button size="sm" variant="outline" disabled={!onPublish} onClick={onPublish}>
              <Play className="h-4 w-4" /> Publicar
            </Button>
            <Button size="sm" variant="ghost" disabled={!onArchive} onClick={onArchive}>
              <Archive className="h-4 w-4" />
            </Button>
          </div>
        </CardContent>
      </div>
    </Card>
  );
}

export function CreativeReviewModal({
  post,
  open,
  onClose,
  onSave,
  onApprove,
  onSchedule,
  onPublish,
  onRegenerate,
  onGenerateImage,
  onImprove,
  onReviewQuality,
  onRenderTemplate,
  onArchive,
  onAddComment,
}: {
  post: SocialPost | null;
  open: boolean;
  onClose: () => void;
  onSave?: (patch: {
    title: string;
    caption: string;
    hashtags: string[];
    cta: string;
    imagePrompt: string;
    creativeBrief: string;
    scheduledAt: string;
  }) => Promise<void> | void;
  onApprove?: () => Promise<void> | void;
  onSchedule?: (scheduledAt: string) => Promise<void> | void;
  onPublish?: () => Promise<void> | void;
  onRegenerate?: (feedback: string) => Promise<void> | void;
  onGenerateImage?: () => Promise<void> | void;
  onImprove?: (
    mode: "copy" | "premium" | "commercial" | "institutional" | "visual" | "shorter" | "carousel",
  ) => Promise<void> | void;
  onReviewQuality?: () => Promise<void> | void;
  onRenderTemplate?: () => Promise<void> | void;
  onArchive?: () => Promise<void> | void;
  onAddComment?: (comment: string) => Promise<void> | void;
}) {
  const [title, setTitle] = useState("");
  const [caption, setCaption] = useState("");
  const [hashtags, setHashtags] = useState("");
  const [cta, setCta] = useState("");
  const [imagePrompt, setImagePrompt] = useState("");
  const [creativeBrief, setCreativeBrief] = useState("");
  const [scheduledAt, setScheduledAt] = useState("");
  const [feedback, setFeedback] = useState("");

  useEffect(() => {
    if (!post) return;
    setTitle(post.title);
    setCaption(post.caption);
    setHashtags(post.hashtags.join(" "));
    setCta(post.cta);
    setImagePrompt(post.imagePrompt);
    setCreativeBrief(post.creativeBrief);
    setScheduledAt(dateValue(post.scheduledAt));
    setFeedback("");
  }, [post]);

  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose, open]);

  if (!open || !post) return null;
  const finalScheduledAt = scheduledAt ? new Date(scheduledAt).toISOString() : post.scheduledAt;
  return (
    <div className="fixed inset-0 z-50 bg-background/80 p-4 backdrop-blur-sm" onClick={onClose}>
      <div
        className="mx-auto grid max-h-[92vh] max-w-6xl overflow-auto rounded-3xl border border-border bg-card shadow-elevated lg:grid-cols-[0.9fr_1.1fr]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="bg-muted p-4">
          <PostPreview
            post={{
              ...post,
              title,
              caption,
              hashtags: asHashtags(hashtags),
              cta,
              imagePrompt,
              creativeBrief,
              scheduledAt: finalScheduledAt,
            }}
          />
          <div className="mt-4 rounded-2xl border border-border bg-card p-4 text-sm shadow-soft">
            <div className="flex flex-wrap gap-2">
              <Badge variant="outline">{post.format}</Badge>
              {post.carouselMediaUrls?.length ? (
                <Badge variant="outline">{post.carouselMediaUrls.length} páginas</Badge>
              ) : null}
              {post.videoStoryboardUrls?.length ? (
                <Badge variant="outline">{post.videoStoryboardUrls.length} frames vídeo</Badge>
              ) : null}
            </div>
            <p className="mt-2 text-muted-foreground">
              {post.format.toLowerCase().includes("carrossel")
                ? "Use as setas do preview para revisar página por página antes de aprovar."
                : post.format.toLowerCase().includes("reels") ||
                    post.format.toLowerCase().includes("vídeo") ||
                    post.format.toLowerCase().includes("video")
                  ? "Reels/Vídeo local gera roteiro, capa e storyboard. Para MP4 final, exporte a base ou conecte API de vídeo."
                  : "Revise copy, CTA, prompt visual e mídia antes de publicar."}
            </p>
          </div>
        </div>
        <div className="space-y-5 p-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="text-2xl font-bold">{title}</h2>
              <div className="mt-3 flex flex-wrap gap-2">
                <ChannelBadge channel={post.channel} />
                <StatusBadge status={post.status} />
                <ScoreBadge score={post.qualityScore} />
              </div>
            </div>
            <Button type="button" variant="ghost" size="icon" onClick={onClose}>
              <X className="h-5 w-5" />
            </Button>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="space-y-2">
              <span className="text-sm font-semibold">Título</span>
              <Input value={title} onChange={(e) => setTitle(e.target.value)} />
            </label>
            <label className="space-y-2">
              <span className="text-sm font-semibold">Data e hora</span>
              <Input
                type="datetime-local"
                value={scheduledAt}
                onChange={(e) => setScheduledAt(e.target.value)}
              />
            </label>
          </div>
          <label className="block space-y-2">
            <span className="text-sm font-semibold">Copy e legenda editáveis</span>
            <Textarea
              value={caption}
              onChange={(e) => setCaption(e.target.value)}
              className="min-h-32"
            />
          </label>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="space-y-2">
              <span className="text-sm font-semibold">Hashtags</span>
              <Textarea value={hashtags} onChange={(e) => setHashtags(e.target.value)} />
            </label>
            <label className="space-y-2">
              <span className="text-sm font-semibold">CTA</span>
              <Textarea value={cta} onChange={(e) => setCta(e.target.value)} />
            </label>
          </div>
          <label className="block space-y-2">
            <span className="text-sm font-semibold">Briefing visual</span>
            <Textarea
              value={creativeBrief}
              onChange={(e) => setCreativeBrief(e.target.value)}
              className="min-h-24"
            />
          </label>
          <label className="block space-y-2">
            <span className="text-sm font-semibold">Prompt de imagem</span>
            <Textarea
              value={imagePrompt}
              onChange={(e) => setImagePrompt(e.target.value)}
              className="min-h-24"
            />
          </label>
          <div className="grid gap-3 lg:grid-cols-2">
            <div className="rounded-3xl border border-border bg-background p-4">
              <h3 className="font-semibold">Diagnóstico de qualidade</h3>
              {post.qualityReview ? (
                <div className="mt-3 grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
                  <Badge variant="outline">Copy {post.qualityReview.copy_score ?? "—"}</Badge>
                  <Badge variant="outline">Visual {post.qualityReview.visual_score ?? "—"}</Badge>
                  <Badge variant="outline">Marca {post.qualityReview.brand_score ?? "—"}</Badge>
                  <Badge variant="outline">CTA {post.qualityReview.cta_score ?? "—"}</Badge>
                </div>
              ) : null}
              <div className="mt-3 space-y-2 text-sm text-muted-foreground">
                {(post.qualityNotes?.length
                  ? post.qualityNotes
                  : [
                      post.qualityScore >= 85
                        ? "Score premium para revisão."
                        : "Score baixo: peça uma nova versão.",
                      post.mediaUrl ? "Mídia disponível para prévia." : "Mídia ainda não gerada.",
                      post.masterPrompt
                        ? "Prompt mestre salvo."
                        : "Prompt mestre ainda não gerado.",
                    ]
                ).map((note) => (
                  <p key={note} className="rounded-2xl bg-card p-3">
                    {note}
                  </p>
                ))}
              </div>
            </div>
            <div className="rounded-3xl border border-border bg-background p-4">
              <h3 className="font-semibold">Roteiro / estrutura IA</h3>
              {post.videoPrompt ? (
                <pre className="mt-3 max-h-52 overflow-auto whitespace-pre-wrap rounded-2xl bg-sidebar p-3 text-xs text-sidebar-foreground/80">
                  {post.videoPrompt}
                </pre>
              ) : post.carouselMediaUrls?.length ? (
                <p className="mt-3 text-sm text-muted-foreground">
                  Carrossel com {post.carouselMediaUrls.length} páginas de mídia geradas. Revise no
                  preview lateral.
                </p>
              ) : (
                <p className="mt-3 text-sm text-muted-foreground">
                  Produza o post para gerar roteiro, páginas, prompt mestre e mídia.
                </p>
              )}
            </div>
          </div>
          <div className="rounded-3xl border border-primary/20 bg-primary/5 p-4">
            <div className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-primary" />
              <h3 className="font-semibold">Ações rápidas do Estúdio 10/10</h3>
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              Direcione a IA sem perder o histórico: copy, premium, comercial, visual, template e
              score.
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <Button
                size="sm"
                variant="outline"
                disabled={!onImprove}
                onClick={() => void onImprove?.("copy")}
              >
                <Wand2 className="h-4 w-4" /> Melhorar copy
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={!onImprove}
                onClick={() => void onImprove?.("premium")}
              >
                <Sparkles className="h-4 w-4" /> Mais premium
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={!onImprove}
                onClick={() => void onImprove?.("commercial")}
              >
                <Send className="h-4 w-4" /> Mais comercial
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={!onImprove}
                onClick={() => void onImprove?.("visual")}
              >
                <ImagePlus className="h-4 w-4" /> Melhorar visual
              </Button>
              {post.format.toLowerCase().includes("carrossel") ? (
                <Button
                  size="sm"
                  variant="outline"
                  disabled={!onImprove}
                  onClick={() => void onImprove?.("carousel")}
                >
                  <RefreshCw className="h-4 w-4" /> Melhorar carrossel
                </Button>
              ) : null}
              <Button
                size="sm"
                variant="outline"
                disabled={!onRenderTemplate}
                onClick={() => void onRenderTemplate?.()}
              >
                <Upload className="h-4 w-4" /> Aplicar template
              </Button>
              <Button
                size="sm"
                className="bg-gradient-primary text-primary-foreground"
                disabled={!onReviewQuality}
                onClick={() => void onReviewQuality?.()}
              >
                <Check className="h-4 w-4" /> Revisor IA
              </Button>
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <Button
              className="bg-gradient-primary text-primary-foreground"
              disabled={!onSave}
              onClick={() =>
                void onSave?.({
                  title,
                  caption,
                  hashtags: asHashtags(hashtags),
                  cta,
                  imagePrompt,
                  creativeBrief,
                  scheduledAt: finalScheduledAt,
                })
              }
            >
              <Save className="h-4 w-4" /> Salvar
            </Button>
            <Button variant="outline" disabled={!onApprove} onClick={() => void onApprove?.()}>
              <Check className="h-4 w-4" /> Aprovar
            </Button>
            <Button
              variant="outline"
              disabled={!onSchedule}
              onClick={() => void onSchedule?.(finalScheduledAt)}
            >
              <CalendarDays className="h-4 w-4" /> Agendar
            </Button>
            <Button
              variant="outline"
              disabled={!onGenerateImage}
              onClick={() => void onGenerateImage?.()}
            >
              <ImagePlus className="h-4 w-4" /> Gerar mídia
            </Button>
            <Button variant="outline" disabled={!onPublish} onClick={() => void onPublish?.()}>
              <Play className="h-4 w-4" /> Publicar agora
            </Button>
            <Button variant="ghost" disabled={!onArchive} onClick={() => void onArchive?.()}>
              <Archive className="h-4 w-4" /> Arquivar
            </Button>
          </div>
          <div className="rounded-3xl border border-border bg-background p-4">
            <h3 className="font-semibold">Correção com feedback</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              Esse texto entra no próximo prompt e cria uma nova versão controlada.
            </p>
            <div className="mt-3 flex gap-2">
              <Input
                value={feedback}
                onChange={(e) => setFeedback(e.target.value)}
                placeholder="Ex.: mais luxuoso, menos texto na arte, foco no empreendimento..."
              />
              <Button
                variant="outline"
                disabled={!feedback.trim() || !onRegenerate}
                onClick={() => void onRegenerate?.(feedback)}
              >
                <Wand2 className="h-4 w-4" /> Regerar
              </Button>
            </div>
          </div>
          <HumanCommentsPanel comments={post.humanComments} onAddComment={onAddComment} />
          <PromptViewer prompt={post.masterPrompt} />
          <div className="rounded-3xl border border-border bg-background p-4">
            <h3 className="font-semibold">Histórico de versões</h3>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              {post.versions.map((version) => (
                <div key={version.id} className="rounded-2xl border border-border bg-card p-3">
                  <div className="flex items-center justify-between">
                    <b>{version.version}</b>
                    <ScoreBadge score={version.qualityScore} />
                  </div>
                  <p className="mt-2 line-clamp-3 text-sm text-muted-foreground">
                    {version.caption}
                  </p>
                </div>
              ))}
              {!post.versions.length && (
                <p className="text-sm text-muted-foreground">Nenhuma versão registrada ainda.</p>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export function BrandMemoryForm({ fields }: { fields: Record<string, string> }) {
  return (
    <div className="grid gap-4 md:grid-cols-2">
      {Object.entries(fields).map(([label, value]) => (
        <label key={label} className="space-y-2">
          <span className="text-sm font-semibold">{label}</span>
          {value.length > 90 ? (
            <Textarea defaultValue={value} className="min-h-24" />
          ) : (
            <Input defaultValue={value} />
          )}
        </label>
      ))}
    </div>
  );
}

export function RuleEditor({
  rules,
  onChange,
  onDuplicate,
  onArchive,
}: {
  rules: AIBrainRule[];
  onChange?: (rule: AIBrainRule) => Promise<void> | void;
  onDuplicate?: (rule: AIBrainRule) => Promise<void> | void;
  onArchive?: (rule: AIBrainRule) => Promise<void> | void;
}) {
  const [items, setItems] = useState(rules);
  useEffect(() => setItems(rules), [rules]);
  function updateLocal(id: string, patch: Partial<AIBrainRule>) {
    setItems((current) => current.map((item) => (item.id === id ? { ...item, ...patch } : item)));
  }
  return (
    <div className="space-y-4">
      {items.map((rule) => (
        <div key={rule.id} className="rounded-3xl border border-border bg-card p-5 shadow-soft">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <Badge className="bg-primary/10 text-primary hover:bg-primary/10">
                  {rule.category}
                </Badge>
                <Badge variant="outline">Prioridade {rule.priority}</Badge>
                {rule.active ? (
                  <Badge className="bg-success/15 text-success hover:bg-success/15">ativo</Badge>
                ) : (
                  <Badge variant="outline">inativo</Badge>
                )}
              </div>
              <Input
                value={rule.name}
                onChange={(e) => updateLocal(rule.id, { name: e.target.value })}
                className="mt-3 max-w-xl font-bold"
              />
            </div>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" size="sm" onClick={() => void onChange?.(rule)}>
                <Save className="h-4 w-4" /> Salvar
              </Button>
              <Button variant="outline" size="sm" onClick={() => void onDuplicate?.(rule)}>
                <Copy className="h-4 w-4" /> Duplicar
              </Button>
              <Button variant="ghost" size="sm" onClick={() => void onArchive?.(rule)}>
                <Archive className="h-4 w-4" />
              </Button>
            </div>
          </div>
          <Textarea
            className="mt-4 min-h-24"
            value={rule.content}
            onChange={(e) => updateLocal(rule.id, { content: e.target.value })}
          />
        </div>
      ))}
    </div>
  );
}

export function PromptTemplateEditor({
  prompts,
  onChange,
  onDuplicate,
  onArchive,
  onDelete,
}: {
  prompts: AIPromptTemplate[];
  onChange?: (prompt: AIPromptTemplate) => Promise<void> | void;
  onDuplicate?: (prompt: AIPromptTemplate) => Promise<void> | void;
  onArchive?: (prompt: AIPromptTemplate) => Promise<void> | void;
  onDelete?: (prompt: AIPromptTemplate) => Promise<void> | void;
}) {
  const [items, setItems] = useState(prompts);
  useEffect(() => setItems(prompts), [prompts]);

  function updateLocal(id: string, patch: Partial<AIPromptTemplate>) {
    setItems((current) => current.map((item) => (item.id === id ? { ...item, ...patch } : item)));
  }

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      {items.map((prompt) => (
        <div key={prompt.id} className="rounded-3xl border border-border bg-card p-5 shadow-soft">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1 space-y-2">
              <Input
                value={prompt.name}
                onChange={(e) => updateLocal(prompt.id, { name: e.target.value })}
                className="font-bold"
                placeholder="Nome do prompt base"
              />
              <Input
                value={prompt.note ?? ""}
                onChange={(e) => updateLocal(prompt.id, { note: e.target.value })}
                placeholder="Observação / uso deste prompt"
              />
            </div>
            <Badge variant="outline">{prompt.versions.length} versões</Badge>
          </div>
          <Textarea
            className="mt-4 min-h-48"
            value={prompt.content}
            onChange={(e) => updateLocal(prompt.id, { content: e.target.value })}
            placeholder="Escreva o prompt base que será unido ao Cérebro IA."
          />
          <div className="mt-4 flex flex-wrap gap-2">
            <Button variant="outline" size="sm" onClick={() => void onChange?.(prompt)}>
              <Save className="h-4 w-4" /> Salvar
            </Button>
            <Button variant="outline" size="sm" onClick={() => void onDuplicate?.(prompt)}>
              <Copy className="h-4 w-4" /> Duplicar
            </Button>
            <Button variant="outline" size="sm" onClick={() => void onArchive?.(prompt)}>
              <Archive className="h-4 w-4" /> Arquivar
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="text-destructive hover:text-destructive"
              onClick={() => {
                if (window.confirm(`Excluir definitivamente o prompt base "${prompt.name}"?`)) {
                  void onDelete?.(prompt);
                }
              }}
            >
              <Trash2 className="h-4 w-4" /> Excluir
            </Button>
          </div>
        </div>
      ))}
    </div>
  );
}

export function FormatDistributionSelector({
  formats,
}: {
  formats: Record<ContentFormat, number>;
}) {
  return (
    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
      {Object.entries(formats).map(([format, quantity]) => (
        <div key={format} className="rounded-2xl border border-border bg-card p-4 shadow-soft">
          <div className="flex items-center justify-between gap-3">
            <span className="text-sm font-semibold">{format}</span>
            <Badge variant="outline">{quantity}</Badge>
          </div>
          <Progress className="mt-3" value={Math.min(100, Number(quantity) * 3.34)} />
        </div>
      ))}
    </div>
  );
}

export function CampaignThemeBuilder() {
  return (
    <EmptyState
      title="Temas personalizados salvos no planejamento"
      description="Nesta versão, os temas personalizados entram no briefing do wizard e são enviados para a IA junto com os pilares editoriais."
    />
  );
}

export function CalendarView({
  posts,
  onOpen,
}: {
  posts: SocialPost[];
  onOpen?: (post: SocialPost) => void;
}) {
  const current = posts[0]?.scheduledAt ? new Date(posts[0].scheduledAt) : new Date();
  const year = current.getFullYear();
  const month = current.getMonth();
  const first = new Date(year, month, 1);
  const startOffset = first.getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells = Array.from(
    { length: Math.ceil((startOffset + daysInMonth) / 7) * 7 },
    (_, index) => index - startOffset + 1,
  );
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between rounded-3xl border border-border bg-card p-4 shadow-soft">
        <h3 className="text-xl font-bold capitalize">
          {current.toLocaleDateString("pt-BR", { month: "long", year: "numeric" })}
        </h3>
        <p className="text-sm text-muted-foreground">Clique em um post para revisar.</p>
      </div>
      <div className="grid grid-cols-7 gap-2">
        {["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"].map((day) => (
          <div key={day} className="px-2 text-xs font-bold text-muted-foreground">
            {day}
          </div>
        ))}
        {cells.map((day, index) => {
          const dayPosts =
            day > 0 && day <= daysInMonth
              ? posts.filter((post) => {
                  const date = new Date(post.scheduledAt);
                  return (
                    date.getFullYear() === year &&
                    date.getMonth() === month &&
                    date.getDate() === day
                  );
                })
              : [];
          return (
            <div
              key={`${day}-${index}`}
              className="min-h-28 rounded-2xl border border-border bg-card p-2 shadow-soft opacity-100"
            >
              <div className="flex items-center justify-between">
                <span
                  className={cn(
                    "text-xs font-bold",
                    (day < 1 || day > daysInMonth) && "text-muted-foreground/30",
                  )}
                >
                  {day > 0 && day <= daysInMonth ? day : ""}
                </span>
                {dayPosts.length > 0 && (
                  <Badge className="bg-primary/10 text-primary hover:bg-primary/10">
                    {dayPosts.length}
                  </Badge>
                )}
              </div>
              <div className="mt-2 space-y-1">
                {dayPosts.map((post) => (
                  <button
                    key={post.id}
                    type="button"
                    onClick={() => onOpen?.(post)}
                    className="block w-full rounded-lg bg-primary/10 px-2 py-1 text-left text-[0.68rem] font-medium text-primary hover:bg-primary/20"
                  >
                    {new Date(post.scheduledAt).toLocaleTimeString("pt-BR", {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}{" "}
                    · {post.format.split(" ")[0]} · {post.status}
                  </button>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function QueuePanel({ posts }: { posts: SocialPost[] }) {
  const groups = [
    ["Aguardando produção", ["tema_aprovado", "em_producao"]],
    ["Aguardando revisão", ["aguardando_revisao", "ajuste_solicitado"]],
    ["Aprovado", ["aprovado"]],
    ["Agendado", ["agendado"]],
    ["Publicado", ["publicado"]],
    ["Erro", ["erro"]],
  ] as const;
  return (
    <div className="grid gap-3 md:grid-cols-3 xl:grid-cols-6">
      {groups.map(([step, statuses]) => {
        const statusList = statuses as readonly string[];
        const count = posts.filter((post) => statusList.includes(post.status)).length;
        return (
          <div key={step} className="rounded-2xl border border-border bg-card p-4 shadow-soft">
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold">{step}</p>
              <Badge variant="outline">{count}</Badge>
            </div>
            <div className="mt-3 h-1.5 rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-gradient-primary"
                style={{ width: `${Math.min(100, count * 18)}%` }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function PublishControlPanel({
  posts,
  onSchedule,
  onArchive,
  onOpen,
}: {
  posts: SocialPost[];
  onSchedule?: (post: SocialPost, scheduledAt: string) => void | Promise<void>;
  onArchive?: (post: SocialPost) => void | Promise<void>;
  onOpen?: (post: SocialPost) => void;
}) {
  const [times, setTimes] = useState<Record<string, string>>({});
  return (
    <div className="overflow-hidden rounded-3xl border border-border bg-card shadow-soft">
      <div className="border-b border-border p-5">
        <h3 className="font-bold">Painel de controle operacional</h3>
        <p className="mt-1 text-sm text-muted-foreground">
          Edite horário, abra revisão, agende, arquive e acompanhe status reais.
        </p>
      </div>
      <div className="divide-y divide-border">
        {posts.map((post) => {
          const value = times[post.id] ?? dateValue(post.scheduledAt);
          return (
            <div
              key={post.id}
              className="grid gap-3 p-4 lg:grid-cols-[1fr_190px_130px_180px] lg:items-center"
            >
              <button type="button" onClick={() => onOpen?.(post)} className="text-left">
                <p className="font-semibold">{post.title}</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  <ChannelBadge channel={post.channel} />
                  <StatusBadge status={post.status} />
                </div>
              </button>
              <Input
                type="datetime-local"
                value={value}
                onChange={(e) => setTimes((current) => ({ ...current, [post.id]: e.target.value }))}
              />
              <Badge variant="outline">{post.format}</Badge>
              <div className="flex flex-wrap gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  disabled={!onSchedule}
                  onClick={() => value && void onSchedule?.(post, new Date(value).toISOString())}
                >
                  <CalendarDays className="h-4 w-4" /> Agendar
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={!onArchive}
                  onClick={() => void onArchive?.(post)}
                >
                  <Archive className="h-4 w-4" />
                </Button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function MediaLibraryGrid({
  items = emptyMediaAssets,
  onApproveReference,
  onForbidReference,
  onArchive,
  onRestore,
  onMakeTemplate,
  onDelete,
}: {
  items?: MediaAsset[];
  onApproveReference?: (item: MediaAsset) => Promise<void> | void;
  onForbidReference?: (item: MediaAsset) => Promise<void> | void;
  onArchive?: (item: MediaAsset) => Promise<void> | void;
  onRestore?: (item: MediaAsset) => Promise<void> | void;
  onMakeTemplate?: (item: MediaAsset) => Promise<void> | void;
  onDelete?: (item: MediaAsset) => Promise<void> | void;
}) {
  const [query, setQuery] = useState("");
  const filtered = useMemo(
    () =>
      items.filter(
        (item) =>
          item.name.toLowerCase().includes(query.toLowerCase()) ||
          item.tags.join(" ").toLowerCase().includes(query.toLowerCase()) ||
          item.status.toLowerCase().includes(query.toLowerCase()),
      ),
    [items, query],
  );
  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="pl-9"
            placeholder="Buscar por nome, tag, status, campanha ou formato"
          />
        </div>
        <Button className="bg-gradient-primary text-primary-foreground" disabled>
          <Upload className="h-4 w-4" /> Upload no topo
        </Button>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {filtered.map((item) => (
          <Card key={item.id} className="overflow-hidden rounded-3xl shadow-soft">
            <div className="aspect-[4/3] bg-muted">
              <img src={item.url} alt={item.name} className="h-full w-full object-cover" />
            </div>
            <CardContent className="p-4">
              <div className="flex items-start justify-between gap-2">
                <h3 className="line-clamp-2 font-bold">{item.name}</h3>
                <Badge variant="outline">{item.type}</Badge>
              </div>
              <div className="mt-2 flex flex-wrap gap-2">
                <StatusBadge status={item.status} />
                {item.aiAllowed && (
                  <Badge className="bg-success/15 text-success hover:bg-success/15">
                    entra na IA
                  </Badge>
                )}
              </div>
              <p className="mt-2 line-clamp-2 text-sm text-muted-foreground">{item.notes}</p>
              <div className="mt-3 flex flex-wrap gap-1">
                {item.tags.map((tag) => (
                  <Badge key={tag} variant="outline" className="text-[0.65rem]">
                    {tag}
                  </Badge>
                ))}
              </div>
              <div className="mt-4 grid grid-cols-2 gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  disabled={!onApproveReference}
                  onClick={() => void onApproveReference?.(item)}
                >
                  <ImagePlus className="h-4 w-4" /> Aprovar IA
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={!onForbidReference}
                  onClick={() => void onForbidReference?.(item)}
                >
                  <X className="h-4 w-4" /> Proibir
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={!onMakeTemplate}
                  onClick={() => void onMakeTemplate?.(item)}
                >
                  <Copy className="h-4 w-4" /> Template
                </Button>
                {item.status === "arquivado" ? (
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={!onRestore}
                    onClick={() => void onRestore?.(item)}
                  >
                    <RotateCcw className="h-4 w-4" /> Restaurar
                  </Button>
                ) : (
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={!onArchive}
                    onClick={() => void onArchive?.(item)}
                  >
                    <Archive className="h-4 w-4" /> Arquivar
                  </Button>
                )}
                <Button
                  size="sm"
                  variant="ghost"
                  className="text-destructive hover:text-destructive"
                  disabled={!onDelete}
                  onClick={() => {
                    if (window.confirm(`Excluir definitivamente "${item.name}" da biblioteca?`)) {
                      void onDelete?.(item);
                    }
                  }}
                >
                  <Trash2 className="h-4 w-4" /> Excluir
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
      {!filtered.length && (
        <EmptyState
          title="Nada encontrado"
          description="Ajuste filtros ou envie novas referências para a biblioteca."
        />
      )}
    </div>
  );
}

export function PublishLogTable({ logs }: { logs: SystemLog[] }) {
  return (
    <div className="overflow-hidden rounded-3xl border border-border bg-card shadow-soft">
      <div className="grid grid-cols-5 gap-4 border-b border-border p-4 text-xs font-bold uppercase tracking-wide text-muted-foreground">
        <span>Data</span>
        <span>Módulo</span>
        <span>Status</span>
        <span className="col-span-2">Mensagem</span>
      </div>
      {logs.map((log) => (
        <details key={log.id} className="group border-b border-border last:border-b-0">
          <summary className="grid cursor-pointer grid-cols-5 gap-4 p-4 text-sm">
            <span>{log.date}</span>
            <span>{log.module}</span>
            <span>
              <StatusBadge status={log.status} />
            </span>
            <span className="col-span-2">{log.friendlyMessage}</span>
          </summary>
          <pre className="mx-4 mb-4 whitespace-pre-wrap rounded-2xl bg-sidebar p-4 text-xs text-sidebar-foreground/80">
            {log.technicalDetail}
          </pre>
        </details>
      ))}
    </div>
  );
}

export function ConfirmDialog({ title, description }: { title: string; description: string }) {
  return (
    <div className="rounded-3xl border border-warning/30 bg-warning/10 p-5 text-warning">
      <div className="flex gap-3">
        <AlertTriangle className="h-5 w-5" />
        <div>
          <h3 className="font-bold">{title}</h3>
          <p className="mt-1 text-sm">{description}</p>
          <div className="mt-4 flex gap-2">
            <Button variant="outline">Cancelar</Button>
            <Button className="bg-gradient-primary text-primary-foreground">Confirmar</Button>
          </div>
        </div>
      </div>
    </div>
  );
}
