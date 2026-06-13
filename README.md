# MYINC Social Media AI v2.0.1

Aplicação revisada para rodar em **Vercel + Supabase**, com IA pesada na hospedagem Vercel e Supabase apenas para Auth, banco, Storage, logs e fila.

## Principais garantias

- Worker Vercel processa 1 job por chamada.
- Chaves da OpenAI/Meta ficam em `runtime_secrets`.
- Suporte a banco compartilhado com isolamento por `brand_id`.
- Sem cron obrigatório.
- Logs em `system_logs` e eventos em `generation_job_events`.

## Comandos

```bash
npm install
npm run dev
npm run typecheck
npm run build
npm run diagnose
```

## Deploy

Leia `docs/DEPLOY_VERCEL_SUPABASE.md` antes de subir, principalmente se for usar o mesmo banco do projeto antigo.
