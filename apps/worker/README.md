# MYINC AI Worker Externo

Este worker tira IA pesada do Supabase Edge.

## Função

- Lê `generation_jobs` com status `queued`.
- Processa texto/imagem fora do Supabase Edge.
- Salva imagem no Supabase Storage.
- Atualiza `posts`, `media_assets`, `post_versions`, `generation_jobs` e `system_logs`.

## Deploy no EasyPanel

1. Suba esta pasta `apps/worker` no repositório.
2. Crie um app Node/Docker no EasyPanel apontando para `apps/worker`.
3. Configure as variáveis do `.env.example`.
4. Ative restart always.

## Importante

O Supabase fica apenas como banco, storage, auth, logs e fila. A IA pesada roda neste worker.
