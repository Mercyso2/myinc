import { handleOptions, json, errorJson, readJson, asString, nowIso } from '../_shared/http.ts';
import { maybeGetPost, updateByIdCompatible } from '../_shared/supabase.ts';
import { generateOpenAIImage } from '../_shared/openai.ts';
import { uploadMediaBytes, updatePostAfterMedia } from '../_shared/media.ts';

function formatToSize(format: string): string {
  const f = format.toLowerCase();
  if (f.includes('story') || f.includes('reel') || f.includes('vertical')) return '1024x1792';
  if (f.includes('feed') || f.includes('square')) return '1024x1024';
  if (f.includes('landscape') || f.includes('banner')) return '1792x1024';
  return '1024x1024';
}

function buildImagePrompt(input: Record<string, unknown>, post: Record<string, unknown> | null): string {
  const title = asString(input.title, asString(post?.title, 'Criativo institucional My Inc'));
  const caption = asString(input.caption, asString(post?.caption, asString(post?.content, '')));
  const format = asString(input.format, asString(post?.format, 'feed'));
  const brand = asString(input.brand_context, 'My Inc, incorporadora premium, alto padrão, arquitetura contemporânea, imóveis de desejo.');
  const extra = asString(input.prompt, '');

  return `
Criar uma imagem publicitária premium para rede social de incorporadora imobiliária.
Marca: ${brand}
Título do post: ${title}
Formato: ${format}
Contexto/copy: ${caption}
Direção criativa adicional: ${extra}

Requisitos visuais obrigatórios:
- Visual de alto padrão, sofisticado, realista, moderno, arquitetura contemporânea brasileira.
- Iluminação cinematográfica, composição profissional, profundidade, materiais nobres, concreto, vidro, madeira, vegetação e atmosfera aspiracional.
- Sem texto renderizado dentro da imagem, sem logotipos falsos, sem marcas d'água, sem letras quebradas.
- Deve parecer campanha de incorporadora premium, não imagem genérica de banco.
- Área segura para aplicação posterior de copy no layout.
- Qualidade final publicável em Instagram/Facebook.
`.trim();
}

Deno.serve(async (req) => {
  const options = handleOptions(req);
  if (options) return options;

  try {
    const input = await readJson(req);
    const postId = asString(input.post_id || input.postId);
    const post = await maybeGetPost(postId || undefined);
    const format = asString(input.format, asString(post?.format, 'feed'));
    const prompt = buildImagePrompt(input, post);
    const size = asString(input.size, formatToSize(format));

    if (postId) {
      await updateByIdCompatible('posts', postId, [
        { generation_status: 'processing', generation_error: null, updated_at: nowIso() },
        { status: 'generating', updated_at: nowIso() },
      ]);
    }

    const result = await generateOpenAIImage({
      prompt,
      size,
      quality: typeof input.quality === 'string' ? input.quality : undefined,
      model: typeof input.model === 'string' ? input.model : undefined,
    });

    const uploaded = await uploadMediaBytes({
      postId: postId || undefined,
      title: asString(input.title, asString(post?.title, 'myinc-image')),
      bytes: result.bytes,
      kind: 'image',
      contentType: result.mime,
      preferredExt: result.ext,
      metadata: { prompt, size, model: result.model, source: result.source, generated_at: nowIso() },
    });

    await updatePostAfterMedia({
      postId: postId || undefined,
      kind: 'image',
      url: uploaded.url,
      metadata: { storage_path: uploaded.path, model: result.model, size, prompt },
    });

    return json({ ok: true, post_id: postId || null, media_url: uploaded.url, storage_path: uploaded.path, model: result.model, mime: uploaded.mime });
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
    return errorJson('Falha ao gerar imagem real.', 500, error);
  }
});
