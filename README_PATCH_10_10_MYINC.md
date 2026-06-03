# MYINC Social Media AI — Patch operacional 10/10

Este pacote mantém o design aprovado do projeto atual e aplica uma reconstrução funcional focada em produção em massa, persistência real, fila, IA, biblioteca, calendário e publicação Meta.

## O que foi preservado

- Sidebar grafite/preta premium.
- Cards rounded-3xl com sombra suave.
- Tema dark/light.
- Tokens visuais off-white/grafite/laranja-cobre.
- Mockups de Instagram para feed, story, reels e carrossel.
- Estrutura SaaS com Dashboard, Planejamento, Estúdio, Biblioteca, Calendário, Configurações, Cérebro IA, Admin e Logs.
- React, TypeScript, Tailwind, Supabase Auth/Postgres/Storage e Edge Functions.

## O que foi reconstruído

### 1. Planejamento mensal

- Wizard em 5 etapas: objetivo, canais, pilares, restrições e ideias.
- Briefing agora é específico para MYINC incorporadora/construtora premium.
- Geração de 30 ideias via `ai-generate-plan`.
- Edição individual de tema, headline, CTA, data e ideia visual.
- Aprovar, reprovar e arquivar por ideia.
- Aprovar todos.
- Enviar aprovados para produção sem duplicar, usando `source_idea_id`.

### 2. Produção em massa

- Nova tabela `generation_jobs`.
- Nova Edge Function `process-production-queue`.
- Cada post é um job independente.
- Falha em um item não quebra o lote.
- Gera copy, legenda, hashtags, CTA, prompt visual, imagem e versão.
- Mantém texto mesmo se a imagem falhar.
- Status por etapa: `tema_aprovado`, `em_producao`, `aguardando_revisao`, `erro`.

### 3. Estúdio Criativo

- Modal de revisão agora salva título, legenda, hashtags, CTA, prompt visual, briefing e data.
- Aprovar post muda status real.
- Agendar cria fila real.
- Publicar agora chama Meta via backend.
- Regerar com feedback humano cria comentário e nova versão.
- Gerar imagem salva em Storage e cria `media_assets`/`post_versions`.
- Arquivar preserva histórico, versões, mídia e logs.

### 4. Biblioteca

- Upload real para Supabase Storage.
- Cria `media_assets` e `library_items`.
- Permite marcar como referência aprovada.
- Permite marcar como referência proibida.
- Permite arquivar/restaurar.
- Referências arquivadas/proibidas não entram nos prompts.
- Tags e notas do upload entram na biblioteca.

### 5. Calendário e publicação

- Calendário mensal real com posts do mês.
- Lista operacional com edição de data/hora.
- Agendar cria/atualiza `publish_queue` com `idempotency_key`.
- Nova Edge Function `process-publish-queue`.
- Publicação imediata e agendada usam a mesma pipeline.
- Retry/backoff e logs.

### 6. Meta

- `publish-meta` atualizado para:
  - imagem Instagram;
  - carrossel quando `media_url` contém múltiplas URLs em JSON array ou linhas;
  - Reels/vídeo quando a mídia for vídeo;
  - Facebook foto/vídeo;
  - `published_at`, `meta_post_id`, `meta_permalink`, `publish_logs` e sanitização.
- Nova função `meta-test-connection` para validar Page/Instagram.

### 7. Banco e RLS

Nova migration:

`supabase/migrations/20260530010000_myinc_operational_10_10.sql`

Ela adiciona:

- `brand_color_palette`
- `campaigns`
- `generation_jobs`
- colunas de ciclo de vida em posts, ideias, versões, comentários, biblioteca e filas;
- índices de performance;
- idempotência para posts e fila;
- RLS complementar por brand/user/admin;
- seed oficial MYINC com memória, paleta, regras, templates e mantra.

## Como rodar local

```bash
npm ci
copy .env.example .env
npm run dev
```

## Como validar antes de produção

```bash
npm run typecheck
npm run lint
npm run build
```

Status deste pacote: os três comandos acima foram executados com sucesso. O lint ficou apenas com warnings já existentes de Fast Refresh e hooks em arquivos antigos.

## Variáveis obrigatórias para produção real

Frontend:

```env
VITE_SUPABASE_URL=
VITE_SUPABASE_ANON_KEY=
VITE_APP_ENV=production
```

Supabase Edge Functions secrets:

```env
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
OPENAI_API_KEY=
OPENAI_TEXT_MODEL=gpt-4.1-mini
OPENAI_IMAGE_MODEL=gpt-image-1
META_PAGE_ID=
META_PAGE_ACCESS_TOKEN=
META_INSTAGRAM_BUSINESS_ID=
META_GRAPH_VERSION=v23.0
PUBLIC_MEDIA_BASE_URL=
```

## Ordem correta para testar

1. Rodar migrations no Supabase.
2. Criar/validar usuário em Supabase Auth.
3. Entrar no app.
4. Ir em Configurações e revisar Memória da Marca.
5. Ir em Cérebro IA e confirmar regras MYINC.
6. Subir algumas referências na Biblioteca.
7. Marcar referências boas como “Aprovar IA”.
8. Gerar planejamento de 30 ideias.
9. Aprovar temas.
10. Enviar para produção.
11. Abrir Estúdio e revisar posts.
12. Gerar imagem quando necessário.
13. Aprovar post.
14. Agendar no Calendário.
15. Publicar teste com 1 post de imagem HTTPS.
16. Conferir Logs.

## Observação importante

Este projeto ficou pronto em nível de código, build e arquitetura para o fluxo completo. Para publicar de verdade na Meta, as credenciais Meta precisam estar válidas e com permissões corretas no app da Meta. Se as credenciais estiverem inválidas, o sistema não simula sucesso: ele registra erro e mostra mensagem amigável.
