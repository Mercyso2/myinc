# Checklist final de produção — v1.3.1-production-readiness-check

## Status de publicação GitHub

- [x] Existe commit local com a auditoria de produção: `83634b1`.
- [x] A versão exibida no app foi renomeada para `v1.3.1-production-readiness-check`.
- [ ] Publicação/push no GitHub confirmada.
  - Resultado da conferência local: este checkout não possui `remote` Git configurado (`git remote` não retornou `origin`).
  - Por isso, a versão pode estar commitada localmente/PR registrada pelo ambiente, mas não aparece no GitHub até configurar remote e executar push.

Comandos para publicar quando houver credencial/remote:

```bash
git remote add origin git@github.com:Mercyso2/myinc-creative-suite.git
git push -u origin codex/add-login-screen-and-user-management
```

Se a branch local deste ambiente estiver nomeada `work`, publique explicitamente para a branch desejada:

```bash
git push origin HEAD:codex/add-login-screen-and-user-management
```

## Frontend / Vercel

- [x] `VITE_SUPABASE_URL` esperado no frontend.
- [x] `VITE_SUPABASE_ANON_KEY` esperado no frontend.
- [x] `VITE_APP_ENV=production` bloqueia fallback local.
- [x] `VITE_DEMO_MODE=false` documentado.
- [x] `npm run build` gera `dist/`.
- [x] Nenhum segredo backend foi adicionado ao frontend.

## Autenticação e segurança

- [x] Login Supabase real implementado.
- [x] Fallback `rodrigo/rodrigo` só funciona fora de produção e sem Supabase configurado.
- [x] Rotas internas protegidas.
- [x] Painel ADM exige `role=admin` em `app_users`.
- [x] Edge Functions usam `SUPABASE_SERVICE_ROLE_KEY` somente no backend.

## Dados reais / sem mocks no fluxo principal

- [x] Rotas principais não importam `mock-data.ts`.
- [x] Dashboard lê `posts` reais.
- [x] Planejamento chama `ai-generate-plan` e salva `monthly_plans`/`post_ideas`.
- [x] Estúdio lê `posts` reais e chama `generate-post-content`, `generate-image`, `publish-meta`.
- [x] Biblioteca lê `media_assets` reais e faz upload para Storage.
- [x] Calendário lê `posts` reais e cria fila em `publish_queue`.
- [x] Logs leem `system_logs` reais.
- [x] Memória salva `brands`/`brand_profiles`.
- [x] Cérebro IA usa `ai_brain_rules`/`ai_prompt_templates`.

## Edge Functions

- [x] `admin-users` criada.
- [x] `admin-status` criada.
- [x] `ai-generate-plan` criada com OpenAI real.
- [x] `generate-post-content` criada com OpenAI real.
- [x] `generate-image` criada com OpenAI Images e Storage.
- [x] `publish-meta` criada com Meta Graph API.
- [ ] Deploy remoto das Edge Functions confirmado neste ambiente.
  - Necessário rodar os comandos de `docs/EDGE_FUNCTIONS_DEPLOY.md` no projeto Supabase conectado.

## OpenAI / imagem

- [x] Chaves ficam nos Supabase Secrets.
- [x] Planejamento textual usa `OPENAI_API_KEY` no backend.
- [x] Conteúdo individual usa `OPENAI_API_KEY` no backend.
- [x] Imagem usa `OPENAI_IMAGE_MODEL` no backend.
- [x] Imagem salva no bucket `creative-media`.

## Meta

- [x] Publicação valida status `aprovado`/`agendado`.
- [x] Publicação valida legenda.
- [x] Publicação valida `media_url` HTTPS.
- [x] Publicação chama Meta Graph API no backend.
- [x] Erro Meta não marca post como publicado.
- [ ] Teste real de publicação Meta confirmado em produção.

## Storage / banco

- [x] Migration cria/ajusta `app_users`, RLS e buckets esperados.
- [x] `creative-media` documentado como público para Meta.
- [x] `admin-status` verifica tabelas e buckets sem revelar secrets.

## Build e qualidade

- [ ] `npm install` foi tentado neste ambiente, mas falhou por `403 Forbidden` no registry npm para `@tanstack/start-storage-context`; dependências já presentes permitiram rodar lint/typecheck/build/verify.
- [x] `npm run lint` passou com warnings não bloqueantes existentes.
- [x] `npm run typecheck` passou.
- [x] `npm run build` passou.
- [x] `npm run verify` passou.

## Pendências operacionais antes de declarar produção 100%

1. Configurar remote Git neste ambiente ou publicar a branch a partir do ambiente que tem acesso ao GitHub.
2. Fazer deploy das 6 Edge Functions no Supabase.
3. Abrir o app na Vercel e clicar em **Painel ADM → Testar conexões reais**.
4. Executar teste real OpenAI: gerar planejamento.
5. Executar teste real imagem: gerar imagem de um post.
6. Executar teste real Meta: publicar post aprovado com mídia HTTPS pública.
7. Confirmar logs em `system_logs`, `publish_logs` e status final em `posts`.
