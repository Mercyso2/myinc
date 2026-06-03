import { handleOptions, json, errorJson, readJson, asString, asNumber, nowIso } from '../_shared/http.ts';
import { envBool } from '../_shared/env.ts';
import { maybeGetPost, updateByIdCompatible } from '../_shared/supabase.ts';
import { createAndDownloadVideo } from '../_shared/openai.ts';
import { uploadMediaBytes, updatePostAfterMedia } from '../_shared/media.ts';

function buildVideoPrompt(input: Record<string, unknown>, post: Record<string, unknown> | null): string {
  const title = asString(input.title, asString(post?.title, 'Reels My Inc'));
  const caption = asString(input.caption, asString(post?.caption, asString(post?.content, '')));
  const extra = asString(input.prompt, '');
  return `
Criar vídeo vertical 9:16 para Reels de incorporadora premium.
Marca: My Inc.
Tema: ${title}
Copy/contexto: ${caption}
Direção adicional: ${extra}

Roteiro visual:
- 0-2s: abertura impactante com fachada/arquitetura contemporânea de alto padrão.
- 2-5s: detalhes premium: hall, varanda, luz natural, textura de materiais, vegetação e lifestyle.
- 5-8s: encerramento aspiracional com sensação de desejo e exclusividade.

Regras:
- Sem texto dentro do vídeo, sem legenda queimada, sem logotipos falsos.
- Visual realista, cinematográfico, elegante, com movimento de câmera suave.
- Não usar pessoas deformadas, mãos em destaque ou elementos irreais.
- Saída precisa ser MP4 vertical publicável no Instagram Reels.
`.trim();
}

Deno.serve(async (req) => {
  const options = handleOptions(req);
  if (options) return options;

  try {
    if (!envBool('ENABLE_OPENAI_VIDEO', false)) {
      throw new Error('ENABLE_OPENAI_VIDEO=false. Ative esse secret para gerar vídeo real.');
    }

    const input = await readJson(req);
    const postId = asString(input.post_id || input.postId);
    const post = await maybeGetPost(postId || undefined);
    const prompt = buildVideoPrompt(input, post);
    const seconds = asNumber(input.seconds, 8);
    const size = asString(input.size, '1080x1920');

    if (postId) {
      await updateByIdCompatible('posts', postId, [
        { generation_status: 'processing_video', generation_error: null, updated_at: nowIso() },
        { status: 'generating_video', updated_at: nowIso() },
      ]);
    }

    const video = await createAndDownloadVideo({ prompt, size, seconds, model: asString(input.model) || undefined });
    const uploaded = await uploadMediaBytes({
      postId: postId || undefined,
      title: asString(input.title, asString(post?.title, 'myinc-reels')),
      bytes: video.bytes,
      kind: 'video',
      contentType: 'video/mp4',
      preferredExt: 'mp4',
      metadata: { prompt, size, seconds, model: video.model, openai_video_id: video.videoId, generated_at: nowIso() },
    });

    await updatePostAfterMedia({
      postId: postId || undefined,
      kind: 'video',
      url: uploaded.url,
      metadata: { storage_path: uploaded.path, model: video.model, size, seconds, prompt, openai_video_id: video.videoId },
    });

    return json({ ok: true, post_id: postId || null, video_url: uploaded.url, storage_path: uploaded.path, model: video.model, openai_video_id: video.videoId });
  } catch (error) {
    try {
      const body = await req.clone().json().catch(() => ({}));
      const postId = body?.post_id || body?.postId;
      if (postId) {
        await updateByIdCompatible('posts', String(postId), [
          { generation_status: 'failed', generation_error: error instanceof Error ? error.message : String(error), updated_at: nowIso() },
          { status: 'generation_failed', updated_at: nowIso() },
        ]);
      }
    } catch (_ignored) {}
    return errorJson('Falha ao gerar vídeo real.', 500, error);
  }
});
