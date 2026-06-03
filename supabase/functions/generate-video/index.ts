import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import { boolCfg, cfg, loadRuntimeConfig, requiredCfg } from "../_shared/runtime-config.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
function requireEnv(name: string) {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`${name} ausente no backend. Operação real não executada.`);
  return value;
}
function truthy(value: string | undefined, fallback = false) {
  if (value === undefined || value === "") return fallback;
  return ["1", "true", "yes", "sim", "on"].includes(value.toLowerCase());
}
function videoPrompt(post: Record<string, unknown>, profile: unknown, refs: unknown) {
  const script =
    post.video_prompt ||
    post.master_prompt ||
    post.creative_brief ||
    post.image_prompt ||
    post.caption;
  return [
    "Vídeo/Reels vertical premium para MYINC Incorporadora, arquitetura contemporânea brasileira de alto padrão.",
    `Tema: ${String(post.title ?? post.theme ?? post.headline ?? "MYINC")}.`,
    `Roteiro/brief: ${String(script ?? "reveal de arquitetura premium, materiais nobres e CTA elegante")}.`,
    "Movimento: câmera suave, travelling lento, reveal de fachada/interiores, detalhes de materiais nobres, luz natural cinematográfica, sem movimentos bruscos.",
    "Estética: imobiliário alto padrão, sofisticado, limpo, premium, grafite/off-white/cobre discreto, sem visual genérico.",
    `Texto na tela: mínimo, legível, português do Brasil. CTA final: ${String(post.cta ?? "Fale com a equipe MYINC")}.`,
    `Memória da marca: ${JSON.stringify(profile ?? {})}.`,
    `Referências aprovadas: ${JSON.stringify(refs ?? [])}.`,
    "Evitar: pessoas deformadas, mãos, logo falso, watermark, textos quebrados, visual panfleto, excesso de elementos, promessas exageradas.",
  ].join("\n");
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const supabase = createClient(
    requireEnv("SUPABASE_URL"),
    requireEnv("SUPABASE_SERVICE_ROLE_KEY"),
  );
  const runtime = await loadRuntimeConfig(supabase);
  const openAiKey = requiredCfg(runtime, "OPENAI_API_KEY", "Geração de vídeo");
  async function log(row: Record<string, unknown>) {
    await supabase.from("system_logs").insert({ type: row.type ?? "video", ...row });
  }
  try {
    if (!boolCfg(runtime, "ENABLE_OPENAI_VIDEO", true)) {
      throw new Error("ENABLE_OPENAI_VIDEO=false. Ative para gerar MP4 real.");
    }
    const { postId } = await req.json();
    if (!postId) return json({ error: "postId é obrigatório." }, 400);
    const { data: post, error: postError } = await supabase
      .from("posts")
      .select("*")
      .eq("id", postId)
      .single();
    if (postError || !post) throw postError ?? new Error("Post não encontrado.");
    const { data: profile } = await supabase
      .from("brand_profiles")
      .select("*")
      .eq("brand_id", post.brand_id)
      .maybeSingle();
    const { data: refs } = await supabase
      .from("library_items")
      .select("name,notes,url,ai_usage_rule")
      .eq("brand_id", post.brand_id)
      .eq("status", "referência aprovada")
      .is("archived_at", null)
      .limit(8);
    const prompt = videoPrompt(post, profile, refs);
    const form = new FormData();
    const model = cfg(runtime, "OPENAI_VIDEO_MODEL", "sora-2-pro");
    form.append("model", model);
    form.append("prompt", prompt);
    form.append("size", cfg(runtime, "OPENAI_VIDEO_SIZE", "1080x1920"));
    form.append("seconds", cfg(runtime, "OPENAI_VIDEO_SECONDS", "8"));
    const createRes = await fetch("https://api.openai.com/v1/videos", {
      method: "POST",
      headers: { Authorization: `Bearer ${openAiKey}` },
      body: form,
    });
    let video = await createRes.json().catch(() => ({}));
    if (!createRes.ok) throw new Error(video?.error?.message ?? JSON.stringify(video));
    const videoId = video.id;
    if (!videoId) throw new Error("OpenAI Videos não retornou id.");
    await supabase
      .from("posts")
      .update({
        video_job_id: videoId,
        video_status: video.status ?? "queued",
        updated_at: new Date().toISOString(),
      })
      .eq("id", post.id);
    const timeoutSeconds = Number(cfg(runtime, "OPENAI_VIDEO_POLL_TIMEOUT_SECONDS", "240"));
    const pollSeconds = Math.max(
      5,
      Number(cfg(runtime, "OPENAI_VIDEO_POLL_INTERVAL_SECONDS", "12")),
    );
    const deadline = Date.now() + timeoutSeconds * 1000;
    while (["queued", "in_progress"].includes(String(video.status)) && Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, pollSeconds * 1000));
      const pollRes = await fetch(`https://api.openai.com/v1/videos/${videoId}`, {
        headers: { Authorization: `Bearer ${openAiKey}` },
      });
      video = await pollRes.json().catch(() => ({}));
      if (!pollRes.ok) throw new Error(video?.error?.message ?? JSON.stringify(video));
      await supabase
        .from("posts")
        .update({
          video_status: video.status,
          video_progress: video.progress ?? 0,
          updated_at: new Date().toISOString(),
        })
        .eq("id", post.id);
    }
    if (video.status !== "completed") {
      await log({
        brand_id: post.brand_id,
        post_id: post.id,
        module: "video",
        status: "alerta",
        friendly_message: "Vídeo iniciado, mas ainda não finalizou dentro do tempo configurado.",
        technical_detail: JSON.stringify({
          videoId,
          status: video.status,
          progress: video.progress,
        }),
      });
      return json({
        ok: true,
        pending: true,
        videoId,
        status: video.status,
        progress: video.progress ?? 0,
      });
    }
    const contentRes = await fetch(`https://api.openai.com/v1/videos/${videoId}/content`, {
      headers: { Authorization: `Bearer ${openAiKey}` },
    });
    if (!contentRes.ok) throw new Error(`Falha ao baixar MP4: ${contentRes.status}`);
    const bytes = new Uint8Array(await contentRes.arrayBuffer());
    if (bytes.byteLength < 80_000)
      throw new Error(`MP4 muito pequeno para produção (${bytes.byteLength} bytes).`);
    const path = `${post.brand_id}/${post.id}/${crypto.randomUUID()}.mp4`;
    const { error: uploadError } = await supabase.storage
      .from(cfg(runtime, "MEDIA_BUCKET", "creative-media"))
      .upload(path, bytes, { contentType: "video/mp4", upsert: false });
    if (uploadError) throw uploadError;
    const { data: publicUrl } = supabase.storage.from(cfg(runtime, "MEDIA_BUCKET", "creative-media")).getPublicUrl(path);
    const videoUrl = publicUrl.publicUrl;
    await supabase.from("media_assets").insert({
      brand_id: post.brand_id,
      post_id: post.id,
      name: `Reels ${post.title}`,
      media_type: "Vídeo gerado",
      url: videoUrl,
      preview_url: post.video_poster_url ?? post.media_url ?? videoUrl,
      status: "ativo",
      origin: `openai-video:${model}`,
      ai_allowed: true,
      storage_bucket: cfg(runtime, "MEDIA_BUCKET", "creative-media"),
      storage_path: path,
      is_final: true,
      used_in_publish: false,
      notes: prompt,
    });
    const { data: updatedPost } = await supabase
      .from("posts")
      .update({
        video_url: videoUrl,
        media_url: videoUrl,
        video_status: "completed",
        status: "aguardando_revisao",
        updated_at: new Date().toISOString(),
      })
      .eq("id", post.id)
      .select()
      .single();
    await log({
      brand_id: post.brand_id,
      post_id: post.id,
      module: "video",
      status: "sucesso",
      friendly_message: "Vídeo/Reels real gerado e salvo no Supabase Storage.",
      technical_detail: `videoId=${videoId}; path=${path}; model=${model}`,
    });
    return json({ ok: true, post: updatedPost, videoUrl, videoId, model });
  } catch (error) {
    await log({
      module: "video",
      status: "erro",
      friendly_message: "Falha ao gerar vídeo/Reels real.",
      technical_detail: error instanceof Error ? error.message : String(error),
    });
    return json({ error: error instanceof Error ? error.message : "Erro desconhecido" }, 400);
  }
});
