# Diagnóstico técnico — fila de IA na Vercel

## Arquitetura encontrada

O projeto não é Next.js. Ele usa Vite, React 19 e TanStack Start no frontend/SSR, funções Node.js em `api/` para a Vercel e Supabase Edge Functions para operações rápidas de criação de fila, administração e publicação. O Supabase fornece autenticação, banco, Storage, RLS e a tabela segura `runtime_secrets`.

## Causas principais da interrupção

1. O frontend considerava o worker externo habilitado e, nesse modo, retornava sem chamar nenhum processador. Os jobs permaneciam em `queued`.
2. O único cron da Vercel chamava `GET /api/worker/process`, mas o método GET retornava apenas informações do worker e não processava jobs.
3. O worker Vercel procurava jobs `queued` por `select` seguido de `update`, enquanto a RPC atômica existente procurava apenas `pending/retrying`. Isso criava incompatibilidade de estados e risco de concorrência.
4. O worker exigia `OPENAI_API_KEY` diretamente no ambiente Vercel durante o carregamento do módulo, embora as credenciais reais estivessem em `runtime_secrets` no Supabase. A função podia falhar antes de buscar a configuração segura.
5. O botão “Processar agora” dependia da Edge Function `trigger-worker-now`, que por sua vez dependia de URL pública e `CRON_SECRET`; portanto, o fluxo manual também podia não acordar a fila.
6. O projeto não tinha endpoint Node protegido de retry nem health-check específico para fila/configuração.
7. O typecheck já estava quebrado por props antigas em `conteudos.tsx` e uma comparação de status incompatível em `index.tsx`.

## Fluxo corrigido

1. A Edge Function leve `process-production-queue` valida o usuário e cria jobs persistentes com chave de idempotência.
2. O frontend chama `POST /api/jobs/process-next` com o JWT Supabase.
3. A função Node valida a sessão, carrega configurações seguras de `runtime_secrets`, chama a RPC atômica `claim_generation_job` e processa exatamente um job.
4. A RPC aceita `queued/pending/retrying`, usa `FOR UPDATE SKIP LOCKED` e libera locks antigos.
5. Resultado ou falha real é persistido em `generation_jobs`; eventos técnicos são gravados em `generation_job_events` e eventos gerais em `system_logs`.
6. Retry autenticado é feito por `POST /api/jobs/retry`; cards com erro usam esse fluxo.
7. O cron único continua opcional: ele apenas acorda uma tarefa por chamada. O botão e o fluxo do frontend funcionam sem cron.

## Variáveis necessárias na Vercel

Obrigatórias para a função Node acessar o Supabase:

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY` — somente server-side

Recomendadas:

- `CRON_SECRET` — proteção do gatilho cron opcional
- `DEBUG_ADMIN_SECRET` — acesso administrativo ao health-check
- `WORKER_ID` — identificação do worker

As credenciais de provider podem permanecer em `public.runtime_secrets`, incluindo `OPENAI_API_KEY`, modelos OpenAI, configurações de vídeo, `META_PAGE_ACCESS_TOKEN`, `META_PAGE_ID` e `META_INSTAGRAM_BUSINESS_ID`. Nenhuma delas deve usar prefixo `VITE_` ou `NEXT_PUBLIC_`.

## Migration necessária

Aplicar `supabase/migrations/20260612090000_vercel_job_orchestration.sql`. Ela é incremental, adiciona metadados de erro/provider, eventos de job, índice de idempotência e substitui a RPC de claim por uma versão atômica compatível com os estados atuais.

## Validação local

```bash
npm install --legacy-peer-deps
npm test
npm run typecheck
npm run build
npm run diagnose
```

Para diagnóstico conectado, exporte `SUPABASE_URL` e `SUPABASE_SERVICE_ROLE_KEY` apenas no ambiente server-side e execute `npm run diagnose`. Para validar provider real, aplique a migration, inicie o app, crie uma fila e use “Processar agora”.

## Validação na Vercel

1. Aplicar a migration no Supabase.
2. Configurar as variáveis server-side obrigatórias na Vercel e redeployar.
3. Abrir `GET /api/debug/health` com Bearer de usuário autenticado ou `DEBUG_ADMIN_SECRET` e confirmar fila/logs/configuração.
4. Criar posts, enviar à fila e clicar “Processar agora”.
5. Confirmar transição `queued -> processing -> completed` ou `failed` com erro técnico real.
6. Confirmar objetos persistidos no bucket público `creative-media` antes de testar publicação Meta.

## Limites externos honestos

- Imagem e carrossel dependem de uma chave/modelo de imagem válido e de permissão no Storage. Cada slide do carrossel é um job e um asset real.
- Vídeo só gera MP4 real quando `ENABLE_OPENAI_VIDEO=true` e o provider/modelo configurado suporta a API usada. Caso contrário, o job falha/reagenda com motivo técnico; não é marcado como concluído falsamente.
- Publicação Meta continua server-side pela Edge Function existente e depende de token, IDs, permissões do app Meta, mídia HTTPS pública e disponibilidade/processamento dos containers da Graph API.


## Secrets da Supabase Edge versus variáveis da Vercel

Os Secrets configurados no painel **Supabase Edge Functions** são acessíveis somente às Edge Functions. Eles não aparecem automaticamente em `process.env` das funções Node.js da Vercel. Quando `OPENAI_API_KEY` existe apenas na Edge, o frontend tenta o worker Vercel e muda automaticamente para `process-next-generation-job-safe`, que processa um job por chamada usando os Secrets da Edge. A tela técnica mostra separadamente o estado da Edge e o estado opcional do worker Vercel, sem acusar que a chave da Edge está ausente.

Para ativar esse fallback, publicar:

```bash
supabase functions deploy process-next-generation-job-safe
supabase functions deploy admin-status
```
