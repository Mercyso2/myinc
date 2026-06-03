# MYINC Creative Suite — v1.2.0-real-integrations-final

Esta versão prepara a aplicação para produção estática na Hostinger com backend seguro em Supabase Edge Functions.

## Login inicial

- Usuário solicitado: `rodrigo`
- Senha inicial: `rodrigo`
- Em produção crie no Supabase Auth o e-mail `rodrigo@myinc.local` com senha `rodrigo` e altere a senha no primeiro acesso.
- Sem `VITE_SUPABASE_URL`/`VITE_SUPABASE_ANON_KEY`, o app permite apenas bootstrap local `rodrigo/rodrigo` e mostra aviso claro.

## Camadas

- Frontend: React/Vite estático em `dist/`; usa somente `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_APP_URL`, `VITE_APP_ENV`.
- Backend: Supabase Edge Functions para criação de usuários, IA, imagem e Meta.
- Banco: Supabase Postgres com RLS.
- Storage: buckets `brand-assets`, `creative-media`, `library`.

## Comandos

```bash
npm install
npm run lint
npm run typecheck
npm run build
npm run verify
```

## Deploy resumido

1. Configure o projeto Supabase.
2. Rode as migrations em `supabase/migrations`.
3. Crie `rodrigo@myinc.local` no Supabase Auth com senha `rodrigo`.
4. Configure secrets das Edge Functions.
5. Faça `npm run build`.
6. Envie o conteúdo de `dist/` e o `.htaccess` para `public_html` da Hostinger.

## Regra de produção

A aplicação não simula sucesso em IA/Meta: quando credenciais faltam, as funções retornam erro claro.

## Integrações reais v1.2.0

- `ai-generate-plan` usa `OPENAI_API_KEY` e salva `monthly_plans` + `post_ideas`.
- `generate-image` usa OpenAI Images, salva no bucket `creative-media`, cria `media_assets` e `post_versions`, e atualiza `posts.media_url`.
- `publish-meta` valida post aprovado/agendado, legenda, mídia HTTPS e credenciais Meta antes de chamar Graph API.
- Em produção (`VITE_APP_ENV=production`), o login local `rodrigo/rodrigo` fica bloqueado; o usuário precisa existir no Supabase Auth.
- Mocks só entram em fluxo principal com `VITE_DEMO_MODE=true`/`DEMO_MODE=true` ou fallback local de desenvolvimento.

## v1.3.0-full-production-audit-no-mocks

- O fluxo principal não importa `mock-data.ts`.
- Dashboard, Planejamento, Estúdio, Biblioteca, Calendário, Memória, Cérebro IA, Admin e Logs usam Supabase/Edge Functions ou exibem empty/error state.
- Edge Functions deployáveis: `admin-users`, `admin-status`, `ai-generate-plan`, `generate-post-content`, `generate-image`, `publish-meta`.
- Veja `docs/BUTTON_AUDIT.md` para a auditoria de botões e `docs/EDGE_FUNCTIONS_DEPLOY.md` para comandos de deploy.

## v1.3.1-production-readiness-check

Renomeia a release visível no app e adiciona checklist final de produção/GitHub. Observação: neste checkout não há `remote origin` configurado; portanto, para aparecer no GitHub é necessário publicar a branch com `git push origin HEAD:codex/add-login-screen-and-user-management`. Veja `docs/PRODUCTION_READINESS_CHECKLIST.md`.
