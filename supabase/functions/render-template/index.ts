import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { errorJson, requireActiveUser, serviceClient } from "../_shared/function-utils.ts";
import { cfg, json, loadRuntimeConfig, options } from "../_shared/runtime-config.ts";

function escapeXml(value: unknown) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function svgForPost(post: Record<string, unknown>) {
  const title = escapeXml(post.headline ?? post.title);
  const caption = escapeXml(String(post.caption ?? "").slice(0, 190));
  const cta = escapeXml(post.cta ?? "Fale com a MYINC");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1350" viewBox="0 0 1080 1350">
<rect width="1080" height="1350" fill="#151515"/>
<rect x="72" y="72" width="936" height="1206" rx="28" fill="#f7f4ee"/>
<rect x="112" y="112" width="856" height="640" rx="18" fill="#2d2a26"/>
<text x="112" y="842" font-family="Arial, sans-serif" font-size="34" fill="#b86a35" font-weight="700">MYINC</text>
<text x="112" y="918" font-family="Arial, sans-serif" font-size="64" fill="#171717" font-weight="800">${title}</text>
<foreignObject x="112" y="970" width="820" height="170">
  <div xmlns="http://www.w3.org/1999/xhtml" style="font-family: Arial, sans-serif; font-size: 34px; line-height: 1.28; color: #34302b;">${caption}</div>
</foreignObject>
<rect x="112" y="1170" width="430" height="76" rx="38" fill="#b86a35"/>
<text x="152" y="1220" font-family="Arial, sans-serif" font-size="28" fill="#ffffff" font-weight="700">${cta}</text>
</svg>`;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return options(req);
  const supabase = serviceClient();
  try {
    await requireActiveUser(req, supabase);
    const { postId } = await req.json();
    const { data: post, error } = await supabase
      .from("posts")
      .select("*")
      .eq("id", postId)
      .single();
    if (error || !post) throw error ?? new Error("Post nao encontrado.");

    const runtime = await loadRuntimeConfig(supabase);
    const bucket = cfg(runtime, "MEDIA_BUCKET", "creative-media");
    const svg = svgForPost(post);
    const path = `${post.brand_id}/${post.id}/template-${crypto.randomUUID()}.svg`;
    const bytes = new TextEncoder().encode(svg);
    const { error: uploadError } = await supabase.storage
      .from(bucket)
      .upload(path, bytes, { contentType: "image/svg+xml", upsert: false });
    if (uploadError) throw uploadError;
    const { data: publicUrl } = supabase.storage.from(bucket).getPublicUrl(path);
    const mediaUrl = publicUrl.publicUrl;

    await supabase.from("media_assets").insert({
      brand_id: post.brand_id,
      post_id: post.id,
      name: `Template MYINC ${post.title}`,
      type: "Template",
      media_type: "Template",
      bucket,
      path,
      url: mediaUrl,
      public_url: mediaUrl,
      status: "template",
      origin: "edge-render-template",
      ai_allowed: false,
      notes: "Template SVG para revisao/exportacao. Para Meta, gere imagem PNG/JPEG final.",
    });
    await supabase.from("post_versions").insert({
      brand_id: post.brand_id,
      post_id: post.id,
      version_label: `template-${Date.now()}`,
      caption: post.caption,
      media_url: mediaUrl,
      output_json: { template_url: mediaUrl, format: "svg" },
      quality_score: post.quality_score,
    });
    const { data: updated, error: updateError } = await supabase
      .from("posts")
      .update({ media_url: post.media_url ?? mediaUrl, updated_at: new Date().toISOString() })
      .eq("id", post.id)
      .select()
      .single();
    if (updateError) throw updateError;
    return json(req, { ok: true, post: updated, mediaUrl });
  } catch (error) {
    return errorJson(req, error);
  }
});
