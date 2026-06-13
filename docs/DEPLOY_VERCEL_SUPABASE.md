# Deploy seguro: Vercel + mesmo Supabase

Esta versão foi revisada para o cenário: **novo deploy Vercel isolado usando o mesmo banco Supabase do projeto anterior**.

## 1. Antes de rodar migrations

Faça backup do Supabase ou exporte as tabelas principais. As migrations são idempotentes e aditivas, mas qualquer uso do mesmo banco precisa de cuidado.

## 2. Variáveis obrigatórias na Vercel

Frontend público:

```env
VITE_SUPABASE_URL=https://SEU-PROJETO.supabase.co
VITE_SUPABASE_ANON_KEY=...
VITE_APP_ENV=production
VITE_APP_URL=https://SEU-APP.vercel.app
VITE_DEFAULT_BRAND_ID=SEU-BRAND-ID-ISOLADO
```

Backend Vercel:

```env
SUPABASE_URL=https://SEU-PROJETO.supabase.co
SUPABASE_SERVICE_ROLE_KEY=...
CRON_SECRET=uma-chave-forte
VERCEL_APP_URL=https://SEU-APP.vercel.app
WORKER_BRAND_ID=SEU-BRAND-ID-ISOLADO
DEFAULT_BRAND_ID=SEU-BRAND-ID-ISOLADO
ISOLATED_ENVIRONMENT_NAME=myinc-vercel-isolado
```

`VITE_DEFAULT_BRAND_ID` e `WORKER_BRAND_ID` precisam ser iguais. Isso impede que o frontend liste posts de outras marcas e impede que o worker pegue jobs de outro ambiente.

## 3. Chaves pelo Painel ADM

Salve no Painel ADM:

```env
OPENAI_API_KEY=...
OPENAI_TEXT_MODEL=gpt-4.1
OPENAI_IMAGE_MODEL=gpt-image-1
MEDIA_BUCKET=creative-media
PUBLIC_MEDIA_BASE_URL=https://SEU-PROJETO.supabase.co/storage/v1/object/public/creative-media
META_PAGE_ACCESS_TOKEN=...
META_PAGE_ID=...
META_INSTAGRAM_BUSINESS_ID=...
WORKER_BRAND_ID=SEU-BRAND-ID-ISOLADO
```

## 4. Rodar SQL

Execute no Supabase SQL Editor, nesta ordem:

1. `supabase/migrations/202606130001_core_schema.sql`
2. `supabase/migrations/202606130002_worker_orchestration.sql`

A primeira migration não abre policies amplas no banco existente. A segunda cria/ajusta a fila `generation_jobs`, eventos e RPC `claim_generation_job(worker_id, p_brand_id)`.

## 5. Teste de produção

1. Faça login.
2. Abra Painel ADM.
3. Clique em atualizar diagnóstico.
4. Confirme `WORKER_BRAND_ID` preenchido.
5. Crie 1 post no Planejamento.
6. Em Conteúdos, clique em Enviar este/todos para fila.
7. Clique em Processar agora.
8. Confirme job concluído, mídia no Storage e post em `aguardando_revisao`.

## 6. Regra importante

Não deixe `WORKER_BRAND_ID` vazio em banco compartilhado. Se vazio, o worker pode processar qualquer job `queued` da tabela.
