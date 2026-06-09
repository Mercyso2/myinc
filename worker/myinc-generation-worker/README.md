# MYINC Generation Worker

Este worker resolve o timeout da geração de feed, carrossel e vídeo porque processa os jobs fora da Supabase Edge Function.

## Instalação rápida

```bash
cd worker/myinc-generation-worker
npm install
cp .env.example .env
# edite .env com Supabase e OpenAI
npm start
```

## Deploy recomendado

Suba esta pasta como um container/app Node.js no EasyPanel, Railway, Render ou VPS.

Comando de start:

```bash
npm install && npm start
```

## Fluxo

1. O app chama `generate-image` ou batch.
2. A Edge Function cria um registro em `generation_jobs` e responde rápido.
3. O worker pega o job via RPC `claim_generation_job`.
4. O worker carrega memória da marca, regras, prompts, referências e post.
5. Gera imagem/página/vídeo, salva no Storage e atualiza `posts`, `media_assets`, `post_versions`.

## Vídeo

Para MP4 real, configure `VIDEO_PROVIDER_API_URL` e `VIDEO_PROVIDER_API_KEY`.
O endpoint deve aceitar JSON com `prompt`, `script`, `duration_seconds`, `aspect_ratio` e retornar uma destas opções:

```json
{ "video_url": "https://.../video.mp4" }
```

ou:

```json
{ "job_id": "abc", "status_url": "https://.../abc" }
```

Se não houver provedor configurado, o worker gera capa/storyboard de vídeo e registra aviso no post, sem travar a fila.
