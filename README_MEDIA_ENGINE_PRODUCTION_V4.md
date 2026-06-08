# MYINC Social Media AI — v4 Media Engine Production

Versão focada em produção real de mídia para social media.

## O que foi corrigido

- Imagem não usa mais SVG falso salvo como PNG.
- Geração de imagem valida assinatura real do arquivo.
- Modelo padrão de imagem: `gpt-image-1.5`.
- Edge Function `generate-image` atualizada para API moderna.
- Nova Edge Function `generate-video` com OpenAI Videos/Sora.
- Reels só publica com `video_url` real.
- Modo local não marca publicação como enviada sem Meta.
- API local passou a ter proteção por chave.
- `.env.local` foi removido do pacote.
- Nova migration adiciona campos de mídia avançada.

## Scripts úteis

```bash
npm ci
npm run typecheck
npm run lint
npm run smoke:local -- --static
npm run build
```

## Observação importante

O pacote final não deve incluir `node_modules`. O ZIP original continha dependências de Windows, o que quebra Rollup/Vite em Linux. Para produção, apague `node_modules` e rode `npm ci` diretamente no ambiente final.

## Arquivos principais alterados

- `server/local-api.mjs`
- `supabase/functions/generate-image/index.ts`
- `supabase/functions/generate-video/index.ts`
- `supabase/functions/generate-post-content/index.ts`
- `supabase/functions/process-production-queue/index.ts`
- `supabase/functions/publish-meta/index.ts`
- `supabase/migrations/20260603000000_media_engine_production.sql`
- `.env.example`
- `.env.local.example`
- `.env.production.example`
- `scripts/smoke-media-engine.mjs`

## Checklist antes de vender/usar em massa

- [ ] Configurar OpenAI real.
- [ ] Configurar Supabase real.
- [ ] Configurar bucket público/CDN.
- [ ] Configurar Meta Page + Instagram Business.
- [ ] Gerar Feed real.
- [ ] Gerar Story real.
- [ ] Gerar Carrossel real.
- [ ] Gerar Reels real.
- [ ] Publicar teste no Instagram.
- [ ] Publicar teste no Facebook.
- [ ] Ativar `AI_STRICT_MODE=true`.
- [ ] Manter `ALLOW_LOCAL_PUBLISH_SIMULATION=false`.
