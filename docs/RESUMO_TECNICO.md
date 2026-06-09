# Resumo técnico da atualização

## O que foi corrigido

O erro de timeout acontecia porque a Edge Function esperava a OpenAI gerar a imagem antes de responder ao navegador. Agora a Edge Function apenas cria um job e responde rápido.

## Arquitetura nova

```text
App → generate-image → generation_jobs → worker externo → OpenAI/provedor → Supabase Storage → posts/post_versions/media_assets
```

## Arquivos adicionados/substituídos

- `supabase/migrations/20260609093000_async_generation_jobs_worker.sql`
- `supabase/functions/_shared/generation-queue.ts`
- `supabase/functions/generate-image/index.ts`
- `supabase/functions/generate-images-batch/index.ts`
- `supabase/functions/generate-videos-batch/index.ts`
- `supabase/functions/generation-status/index.ts`
- `worker/myinc-generation-worker/*`
- `src/lib/repositories/post-repository.ts`
- `src/lib/supabase/types.ts`

## Preservação do cérebro da IA

O worker carrega:

- `brand_profiles`
- `ai_brain_rules`
- `ai_prompt_templates`
- `library_items`
- `post_versions.output_json`
- `posts.image_prompt`, `creative_brief`, `video_prompt`

Assim a lógica de regras, prompts e memória da marca continua sendo usada na geração visual.
