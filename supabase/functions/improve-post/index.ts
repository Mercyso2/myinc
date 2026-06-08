import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import {
  callFunction,
  errorJson,
  requireActiveUser,
  serviceClient,
} from "../_shared/function-utils.ts";
import { json, options } from "../_shared/runtime-config.ts";

const instructions: Record<string, string> = {
  copy: "Melhore a copy mantendo o tom premium e CTA claro.",
  premium: "Eleve a percepcao premium, reduza genericidade e aumente precisao comercial.",
  commercial: "Torne o post mais comercial, sem promessa exagerada.",
  institutional: "Torne o post mais institucional e confiavel.",
  visual: "Melhore a direcao visual e o prompt de imagem.",
  shorter: "Encurte e deixe mais direto.",
  carousel: "Melhore a narrativa de carrossel pagina por pagina.",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return options(req);
  const supabase = serviceClient();
  try {
    await requireActiveUser(req, supabase);
    const payload = await req.json();
    const result = await callFunction<{ post: Record<string, unknown> }>(
      req,
      "generate-post-content",
      {
        postId: payload.postId,
        instruction: instructions[payload.mode] ?? instructions.premium,
      },
    );
    if (payload.regenerateMedia) {
      await callFunction(req, "generate-image", { postId: payload.postId });
    }
    return json(req, { ok: true, post: result.post, review: result });
  } catch (error) {
    return errorJson(req, error);
  }
});
