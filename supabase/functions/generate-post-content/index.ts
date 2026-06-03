import { handleOptions, json, errorJson, readJson, asString, nowIso } from '../_shared/http.ts';
import { generateTextJson } from '../_shared/openai.ts';
import { maybeGetPost, updateByIdCompatible } from '../_shared/supabase.ts';

Deno.serve(async (req) => {
  const options = handleOptions(req);
  if (options) return options;

  try {
    const input = await readJson(req);
    const postId = asString(input.post_id || input.postId);
    const post = await maybeGetPost(postId || undefined);
    const topic = asString(input.topic, asString(post?.title, 'post institucional para incorporadora'));
    const format = asString(input.format, asString(post?.format, 'feed'));
    const brandContext = asString(input.brand_context, 'My Inc, incorporadora premium, arquitetura, imóveis de alto padrão, confiança e sofisticação.');

    const content = await generateTextJson({
      system: 'Você é um diretor de criação especialista em social media para incorporadoras, construção civil e imóveis de alto padrão. Escreva copy curta, elegante, objetiva e publicável.',
      user: `Crie conteúdo para ${format}. Tema: ${topic}. Contexto da marca: ${brandContext}. Retorne título, legenda, CTA, hashtags e prompt_visual detalhado para imagem/vídeo.`,
      schemaHint: '{"title":"...","caption":"...","cta":"...","hashtags":["..."],"prompt_visual":"...","score":0-100}',
      temperature: 0.75,
    });

    const title = asString(content.title, topic);
    const caption = asString(content.caption, '');
    const promptVisual = asString(content.prompt_visual, '');

    if (postId) {
      await updateByIdCompatible('posts', postId, [
        {
          title,
          caption,
          content: caption,
          ai_prompt: promptVisual,
          generation_status: 'copy_completed',
          updated_at: nowIso(),
        },
        {
          title,
          caption,
          updated_at: nowIso(),
        },
      ]);
    }

    return json({ ok: true, post_id: postId || null, content });
  } catch (error) {
    return errorJson('Falha ao gerar conteúdo do post.', 500, error);
  }
});
