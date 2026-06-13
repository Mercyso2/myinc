# Arquitetura MYINC v2.0.1

## Papel de cada camada

- Vercel Frontend: interface, revisão, botões e painel ADM.
- Vercel API: worker IA, jobs, retry, health e publicação Meta.
- Supabase: Auth, Postgres, Storage, logs e runtime_secrets.
- OpenAI/provedor: geração de copy, imagem e vídeo.

## Fluxo oficial

```txt
Post aprovado/rascunho
  -> /api/jobs/create-batch
  -> generation_jobs
  -> /api/jobs/process-next
  -> 1 job por chamada
  -> OpenAI
  -> Supabase Storage
  -> posts.status = aguardando_revisao
```

## Isolamento em banco compartilhado

Esta revisão adicionou escopo por brand:

- Frontend filtra `posts`, `generation_jobs`, `library_items` e calendário por `VITE_DEFAULT_BRAND_ID` ou `profile.brand_id`.
- Worker filtra jobs por `WORKER_BRAND_ID`.
- RPC `claim_generation_job(worker_id, p_brand_id)` só reivindica jobs da marca permitida.

## Por que sem Supabase Edge para IA pesada

Supabase Free/Edge tende a estourar tempo em imagem/vídeo. A Vercel processa um job por chamada, permitindo repetir chamadas sem travar a tela e sem cron obrigatório.
