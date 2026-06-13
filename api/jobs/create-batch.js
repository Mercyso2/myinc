import { json, readJson } from "../_lib/env.js";
import { requireUserOrSecret } from "../_lib/auth.js";
import { insert, patch, selectOne } from "../_lib/supabase.js";
import { jobEvent, systemLog } from "../_lib/logs.js";

function isCarousel(format = "") { return String(format).toLowerCase().includes("carrossel") || String(format).toLowerCase().includes("carousel"); }
function isVideo(format = "") { const f = String(format).toLowerCase(); return f.includes("reels") || f.includes("vídeo") || f.includes("video"); }
function carouselCount(format = "") { const m = String(format).match(/(\d+)/); return m ? Math.min(10, Math.max(2, Number(m[1]))) : 5; }
function hidden(post) { const status = String(post.status || "").toLowerCase(); return Boolean(post.archived_at || post.deleted_at || ["arquivado", "excluido", "excluído", "deleted", "deletado"].includes(status)); }

export default async function handler(req, res) {
  if (req.method !== "POST") return json(res, 405, { ok: false, error: "method_not_allowed" });
  try {
    const auth = await requireUserOrSecret(req);
    const body = await readJson(req);
    const postIds = Array.from(new Set(Array.isArray(body.postIds) ? body.postIds.map(String).filter(Boolean) : []));
    if (!postIds.length) throw Object.assign(new Error("Nenhum post selecionado para gerar fila."), { statusCode: 400 });
    const batchId = body.batchId ? String(body.batchId) : crypto.randomUUID();
    const jobs = [];
    const skipped = [];
    for (const postId of postIds) {
      const post = await selectOne("posts", `select=*&id=eq.${encodeURIComponent(postId)}&limit=1`).catch(() => null);
      if (!post) { skipped.push({ postId, reason: "post_not_found" }); continue; }
      if (hidden(post)) { skipped.push({ postId, reason: "post_hidden" }); continue; }
      const brandId = String(body.brandId || post.brand_id || process.env.DEFAULT_BRAND_ID || "").trim();
      if (!brandId) { skipped.push({ postId, reason: "missing_brand_id" }); continue; }
      if (post.brand_id && String(post.brand_id) !== brandId) { skipped.push({ postId, reason: "brand_mismatch", postBrandId: post.brand_id, requestedBrandId: brandId }); continue; }
      await patch("posts", `id=eq.${post.id}`, { status: "em_fila", batch_id: batchId, updated_at: new Date().toISOString(), error_message: null, technical_detail: null });
      const common = { brand_id: brandId, post_id: post.id, batch_id: batchId, provider: "vercel-worker", status: "queued", progress: 0, attempt_count: 0, max_attempts: 3, created_at: new Date().toISOString(), updated_at: new Date().toISOString() };
      const contentJob = await insert("generation_jobs", { ...common, job_type: "content", type: "content", priority: 10, input_json: { instruction: body.instruction || "Produzir copy premium MYINC." }, idempotency_key: `${post.id}:${batchId}:content` });
      jobs.push(contentJob); await jobEvent(contentJob.id, "job_created", "Job de copy criado.", { postId: post.id });
      const format = String(post.format || "");
      if (isCarousel(format)) {
        const total = carouselCount(format);
        for (let page = 1; page <= total; page++) {
          const job = await insert("generation_jobs", { ...common, job_type: "carousel_page", type: "carousel_page", priority: 20 + page, input_json: { page, total_pages: total }, idempotency_key: `${post.id}:${batchId}:carousel:${page}` });
          jobs.push(job); await jobEvent(job.id, "job_created", `Página ${page}/${total} do carrossel criada.`, { postId: post.id });
        }
      } else if (isVideo(format)) {
        const job = await insert("generation_jobs", { ...common, job_type: "video", type: "video", priority: 20, input_json: { force: Boolean(body.force) }, idempotency_key: `${post.id}:${batchId}:video` });
        jobs.push(job); await jobEvent(job.id, "job_created", "Job de vídeo criado.", { postId: post.id });
      } else {
        const job = await insert("generation_jobs", { ...common, job_type: "image", type: "image", priority: 20, input_json: {}, idempotency_key: `${post.id}:${batchId}:image` });
        jobs.push(job); await jobEvent(job.id, "job_created", "Job de imagem criado.", { postId: post.id });
      }
    }
    await systemLog({ module: "jobs-create-batch", status: "sucesso", message: "Fila Vercel criada.", detail: `batch=${batchId}; jobs=${jobs.length}; skipped=${skipped.length}`, user_id: auth.user?.id, brand_id: body.brandId || null });
    return json(res, 200, { ok: true, batchId, queued: jobs.length, skipped, jobs, message: `${jobs.length} job(s) criados. Clique em Processar agora.` });
  } catch (error) {
    await systemLog({ module: "jobs-create-batch", status: "erro", message: "Falha ao criar fila.", detail: error?.message || String(error) });
    return json(res, error?.statusCode || 500, { ok: false, error: error?.message || String(error), code: error?.code || null });
  }
}
