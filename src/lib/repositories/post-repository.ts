import { callEdgeFunction } from "@/lib/supabase/client";
import { BaseRepository } from "./base-repository";
import type {
  ContentCommentRow,
  GenerationJobRow,
  PostRow,
  PostVersionRow,
} from "@/lib/supabase/types";

export const postRepository = new BaseRepository<PostRow>("posts");
export const postVersionRepository = new BaseRepository<PostVersionRow>("post_versions");
export const contentCommentRepository = new BaseRepository<ContentCommentRow>("content_comments");
export const generationJobRepository = new BaseRepository<GenerationJobRow>("generation_jobs");

export function approvePost(token: string, id: string) {
  return postRepository.update(token, id, {
    status: "aprovado",
    approved_at: new Date().toISOString(),
    error_message: null,
  } as Partial<PostRow>);
}

export function requestPostChanges(token: string, id: string, reason: string) {
  return postRepository.update(token, id, {
    status: "ajuste_solicitado",
    status_reason: reason,
  } as Partial<PostRow>);
}

export function archivePost(token: string, id: string) {
  return postRepository.archive(token, id, { status: "arquivado" } as Partial<PostRow>);
}

export function restorePost(token: string, id: string, status = "aguardando_revisao") {
  return postRepository.restore(token, id, { status } as Partial<PostRow>);
}

export function deletePost(token: string, id: string) {
  // Exclusão segura: remove da operação e do calendário sem apagar histórico físico do banco.
  return postRepository.softDelete(token, id, {
    status: "excluido",
    archived_at: new Date().toISOString(),
  } as Partial<PostRow>);
}

export function updatePostContent(
  token: string,
  id: string,
  patch: Pick<
    Partial<PostRow>,
    | "title"
    | "headline"
    | "caption"
    | "hashtags"
    | "cta"
    | "image_prompt"
    | "creative_brief"
    | "scheduled_at"
    | "media_url"
  >,
) {
  return postRepository.update(token, id, patch as Partial<PostRow>);
}

export function generatePostContent(token: string, postId: string, instruction?: string) {
  return callEdgeFunction<{ ok: true; post: PostRow; message?: string }>("generate-post-content", token, {
    postId,
    instruction,
  });
}

export function generatePostImage(token: string, postId: string, jobType?: "image" | "carousel" | "video") {
  return callEdgeFunction<{
    ok: true;
    queued?: boolean;
    status?: string;
    jobId?: string;
    jobType?: string;
    post: PostRow;
    mediaUrl?: string | null;
    carouselMediaUrls?: string[];
    message?: string;
  }>("generate-image", token, {
    postId,
    jobType,
  });
}

export function getGenerationStatus(token: string, payload: { jobId?: string; postId?: string }) {
  return callEdgeFunction<{
    ok: true;
    job: GenerationJobRow | null;
    children: GenerationJobRow[];
    events: unknown[];
    assets: unknown[];
    post?: PostRow | null;
  }>("generation-status", token, payload);
}

export function publishPostNow(token: string, postId: string) {
  return callEdgeFunction<{ ok: true; post: PostRow; publishedUrl?: string }>(
    "publish-meta",
    token,
    { postId },
  );
}

export function generateImagesBatch(
  token: string,
  payload: {
    brandId?: string;
    postIds?: string[];
    onlyMissing?: boolean;
    force?: boolean;
    limit?: number;
  },
) {
  return callEdgeFunction<{
    ok: true;
    processed: number;
    requested: number;
    generated: number;
    queued?: number;
    remaining: number;
    results: unknown[];
    message?: string;
  }>("generate-images-batch", token, payload);
}

export function generateVideosBatch(
  token: string,
  payload: { brandId?: string; postIds?: string[]; force?: boolean; limit?: number; provider?: string },
) {
  return callEdgeFunction<{
    ok: true;
    processed: number;
    requested: number;
    generated: number;
    queued?: number;
    remaining: number;
    results: unknown[];
    message?: string;
  }>("generate-videos-batch", token, payload);
}

export function runAutonomousProduction(
  token: string,
  payload: {
    brandId?: string;
    publish?: boolean;
    approve?: boolean;
    schedule?: boolean;
    generateImages?: boolean;
    applyTemplates?: boolean;
    reviewQuality?: boolean;
  },
) {
  return callEdgeFunction<{
    ok: true;
    createdPosts: number;
    produced: number;
    generatedImages: number;
    approved: number;
    scheduled: number;
    published: number;
  }>("autonomous-run", token, payload);
}

export function createProductionBatch(
  token: string,
  payload: { brandId: string; postIds: string[]; instruction?: string },
) {
  return callEdgeFunction<{ ok: true; batchId: string; queued: number; processed?: number }>(
    "process-production-queue",
    token,
    payload,
  );
}

export async function hydratePostRelations(token: string, posts: PostRow[]) {
  if (!posts.length)
    return {
      versions: new Map<string, PostVersionRow[]>(),
      comments: new Map<string, ContentCommentRow[]>(),
    };
  const ids = posts.map((post) => post.id).join(",");
  const [versions, comments] = await Promise.all([
    postVersionRepository.list(token, `select=*&post_id=in.(${ids})&order=created_at.desc`),
    contentCommentRepository.list(token, `select=*&post_id=in.(${ids})&order=created_at.desc`),
  ]);
  const versionMap = new Map<string, PostVersionRow[]>();
  const commentMap = new Map<string, ContentCommentRow[]>();
  versions.forEach((version) =>
    versionMap.set(version.post_id, [...(versionMap.get(version.post_id) ?? []), version]),
  );
  comments.forEach((comment) =>
    commentMap.set(comment.post_id, [...(commentMap.get(comment.post_id) ?? []), comment]),
  );
  return { versions: versionMap, comments: commentMap };
}

export function improvePost(
  token: string,
  postId: string,
  mode:
    | "copy"
    | "premium"
    | "commercial"
    | "institutional"
    | "visual"
    | "shorter"
    | "carousel" = "premium",
  regenerateMedia = false,
) {
  return callEdgeFunction<{ ok: true; post: PostRow; review?: unknown }>("improve-post", token, {
    postId,
    mode,
    regenerateMedia,
  });
}

export function reviewPostQuality(token: string, postId: string) {
  return callEdgeFunction<{ ok: true; post: PostRow; review: unknown }>(
    "review-post-quality",
    token,
    { postId },
  );
}

export function renderPostTemplate(token: string, postId: string) {
  return callEdgeFunction<{ ok: true; post: PostRow; mediaUrl: string }>("render-template", token, {
    postId,
  });
}

export function renderTemplatesBatch(
  token: string,
  payload: { brandId?: string; postIds?: string[] },
) {
  return callEdgeFunction<{ ok: true; processed: number; results: unknown[] }>(
    "render-templates-batch",
    token,
    payload,
  );
}

export function createLocalBackup(token: string, label = "manual") {
  return callEdgeFunction<{ ok: true; backup: unknown; backups: unknown[] }>(
    "backup-create",
    token,
    {
      label,
    },
  );
}

export function listLocalBackups(token: string) {
  return callEdgeFunction<{
    ok: true;
    backups: unknown[];
    dbPath: string;
    backupDir: string;
    uploadDir: string;
  }>("backup-list", token, {});
}
