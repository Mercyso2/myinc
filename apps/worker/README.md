# MYINC AI Worker

Worker externo para processar IA pesada fora do Supabase Edge.

Objetivo:
- Supabase fica como Auth, banco, Storage, fila e logs.
- Este worker processa generation_jobs em uma VPS/EasyPanel.
- O frontend cria jobs e acompanha status.
- A IA pesada não roda mais dentro das Edge Functions.

Fluxo:
1. App cria posts e generation_jobs.
2. Worker busca jobs queued.
3. Worker executa texto, imagem, carrossel ou vídeo.
4. Worker salva mídia no Supabase Storage.
5. Worker atualiza posts, media_assets, post_versions e generation_jobs.

Variáveis necessárias:
- SUPABASE_URL
- SUPABASE_SERVICE_ROLE_KEY
- OPENAI_API_KEY
- MEDIA_BUCKET
- WORKER_POLL_INTERVAL_MS
- WORKER_MAX_PARALLEL
- ENABLE_VIDEO_WORKER

Deploy recomendado:
- EasyPanel com Node 20+
- Dockerfile deste diretório
- Restart always
