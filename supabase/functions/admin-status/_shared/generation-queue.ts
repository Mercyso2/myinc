import { stringifyError } from "./function-utils.ts";
import { getCorsHeaders } from "./runtime-config.ts";

type SupabaseLike = {
  from: (table: string) => any;
};

type Runtime = Record<string, string | null>;
type Row = Record<string, unknown>;

export function json(req: Request, body: unknown, status = 200, runtime: Runtime = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...getCorsHeaders(req, runtime), "Content-Type": "application/json" },
  });
}

export function requireEnv(name: string) {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`${name} ausente no backend. Operacao real nao executada.`);
  return value;
}

export function asObject(value: unknown): Row {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Row) : {};
}

export function isCarouselFormat(format = "") {
  return String(format).toLowerCase().includes("carrossel");
}

export function isVideoFormat(format = "") {
  const normalized = String(format).toLowerCase();
  return normalized.includes("reels") || normalized.includes("vídeo") || normalized.includes("video");
}

export function inferJobType(post: Row, forced?: string) {
  if (forced) return forced;
  const format = String(post.format ?? "");
  if (isVideoFormat(format)) return "video";
  if (isCarouselFormat(format)) return "carousel";
  return "image";
}

export function friendlyProcessingStatus(jobType: string) {
  if (jobType === "video") return "em_producao";
  if (jobType === "video_frame") return "em_producao";
  if (jobType === "carousel") return "em_producao";
  if (jobType === "carousel_page") return "em_producao";
  return "em_producao";
}

export async function logEvent(supabase: SupabaseLike, jobId: string, eventType: string, message: string, detail: unknown = {}) {
  await supabase.from("generation_job_events").insert({
    job_id: jobId,
    event_type: eventType,
    message,
    detail,
  });
}

export async function enqueueGenerationJob({
  supabase,
  post,
  jobType,
  payload = {},
  priority = 100,
  provider = null,
}: {
  supabase: SupabaseLike;
  post: Row;
  jobType: string;
  payload?: Row;
  priority?: number;
  provider?: string | null;
}) {
  const safePayload = {
    ...payload,
    post_snapshot: {
      id: post.id,
      title: post.title,
      format: post.format,
      channel: post.channel,
      objective: post.objective,
      theme: post.theme,
      headline: post.headline,
      caption: post.caption,
      cta: post.cta,
      image_prompt: post.image_prompt,
      creative_brief: post.creative_brief,
      video_prompt: post.video_prompt,
    },
  };

  const { data: job, error: jobError } = await supabase
    .from("generation_jobs")
    .insert({
      brand_id: post.brand_id ?? null,
      post_id: post.id ?? null,
      job_type: jobType,
      type: jobType,
      content_type: jobType,
      provider,
      status: "pending",
      priority,
      progress: 0,
      max_attempts: Number(payload.max_attempts ?? 3),
      payload: safePayload,
      input_json: safePayload,
    })
    .select()
    .single();

  if (jobError) throw jobError;

  await logEvent(supabase, String(job.id), "job_created", `Job ${jobType} criado.`, safePayload);

  const { data: updatedPost, error: updateError } = await supabase
    .from("posts")
    .update({
      status: friendlyProcessingStatus(jobType),
      error_message: null,
      technical_detail: null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", post.id)
    .select()
    .single();

  if (updateError) throw updateError;

  await supabase.from("system_logs").insert({
    brand_id: post.brand_id ?? null,
    post_id: post.id ?? null,
    module: "generation_queue",
    type: "generation",
    status: "info",
    friendly_message: `Geracao ${jobType} enfileirada.`,
    technical_detail: stringifyError({ job_id: job.id, job_type: jobType }),
  });

  return { job, post: updatedPost };
}
