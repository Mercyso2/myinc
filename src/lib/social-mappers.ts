import type { ContentCommentRow, PostRow, PostVersionRow } from "@/lib/supabase/types";
import type { ContentFormat, PostStatus, SocialChannel, SocialPost } from "@/lib/social-types";

function safeDate(value?: string | null) {
  return value || new Date().toISOString();
}

export function mapComment(row: ContentCommentRow) {
  return {
    id: row.id,
    author: row.author_name ?? "Equipe MYINC",
    comment: row.comment ?? "",
    status: row.status === "resolvido" ? ("resolvido" as const) : ("aberto" as const),
    createdAt: row.created_at ? new Date(row.created_at).toLocaleString("pt-BR") : "agora",
  };
}

function arrayFromJson(value: unknown): string[] {
  return Array.isArray(value) ? value.map((item) => String(item)).filter(Boolean) : [];
}

export function mapVersion(row: PostVersionRow) {
  const output = (
    row.output_json && typeof row.output_json === "object" ? row.output_json : {}
  ) as Record<string, unknown>;
  return {
    id: row.id,
    version: row.version_label,
    caption: row.caption ?? "",
    mediaUrl: row.media_url ?? "",
    carouselMediaUrls: arrayFromJson(output.carousel_media_urls),
    videoStoryboardUrls: arrayFromJson(output.video_storyboard_urls),
    qualityScore: row.quality_score ?? 0,
    createdAt: new Date(row.created_at).toLocaleString("pt-BR"),
  };
}

export function postRowToSocialPost(
  row: PostRow,
  versions: PostVersionRow[] = [],
  comments: ContentCommentRow[] = [],
): SocialPost {
  const currentVersion = versions.find((version) => version.is_current) ?? versions[0];
  const output = (
    currentVersion?.output_json && typeof currentVersion.output_json === "object"
      ? currentVersion.output_json
      : {}
  ) as Record<string, unknown>;
  const carouselFromVersion = arrayFromJson(output.carousel_media_urls);
  const videoStoryboardUrls = Array.isArray(
    (row as unknown as { video_storyboard_urls?: unknown }).video_storyboard_urls,
  )
    ? ((row as unknown as { video_storyboard_urls?: string[] }).video_storyboard_urls ?? [])
    : arrayFromJson(output.video_storyboard_urls);
  const storySequence = Array.isArray(output.story_sequence) ? output.story_sequence : [];
  const qualityReview =
    (row as unknown as { quality_review?: unknown }).quality_review &&
    typeof (row as unknown as { quality_review?: unknown }).quality_review === "object"
      ? (row as unknown as { quality_review?: SocialPost["qualityReview"] }).quality_review
      : output.quality_review && typeof output.quality_review === "object"
        ? (output.quality_review as SocialPost["qualityReview"])
        : undefined;
  const qualityNotes = [
    row.quality_score && row.quality_score >= 85
      ? "Score premium aprovado para revisão humana."
      : "Score abaixo do ideal: gere nova versão com feedback humano.",
    row.media_url ? "Mídia já gerada." : "Ainda falta gerar mídia final.",
    row.master_prompt
      ? "Prompt mestre salvo para auditoria."
      : "Prompt mestre ainda não foi salvo.",
  ];

  return {
    id: row.id,
    brandId: row.brand_id ?? "",
    monthlyPlanId: row.monthly_plan_id ?? "",
    title: row.title,
    channel: (row.channel || "Instagram") as SocialChannel,
    format: (row.format || "Feed 1080x1350") as ContentFormat,
    scheduledAt: safeDate(row.scheduled_at ?? row.created_at),
    objective: row.objective ?? "",
    theme: row.theme ?? "",
    headline: row.headline ?? row.title,
    shortText: row.short_text ?? row.caption ?? "",
    caption: row.caption ?? "",
    hashtags: row.hashtags ?? [],
    cta: row.cta ?? "",
    imagePrompt: row.image_prompt ?? "",
    videoPrompt: row.video_prompt ?? undefined,
    masterPrompt: row.master_prompt ?? "",
    creativeBrief: row.creative_brief ?? "",
    mediaUrl: row.media_url ?? "",
    carouselMediaUrls: Array.isArray(
      (row as unknown as { carousel_media_urls?: unknown }).carousel_media_urls,
    )
      ? ((row as unknown as { carousel_media_urls?: string[] }).carousel_media_urls ?? [])
      : carouselFromVersion,
    videoStoryboardUrls,
    storySequence,
    qualityNotes,
    qualityReview,
    qualityScore: row.quality_score ?? qualityReview?.overall_score ?? 0,
    status: (row.status || "rascunho") as PostStatus,
    metaPublishId: row.meta_publish_id ?? row.meta_post_id ?? undefined,
    publishedUrl: row.published_url ?? row.meta_permalink ?? undefined,
    errorMessage: row.error_message ?? undefined,
    archivedAt: row.archived_at ?? undefined,
    humanComments: comments.map(mapComment),
    versions: versions.map(mapVersion),
    feedbacks: comments
      .filter((comment) => comment.feedback_for_ai)
      .map((comment) => comment.comment ?? ""),
  };
}
