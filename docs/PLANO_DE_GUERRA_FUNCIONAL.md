# Plano de guerra funcional — MYINC Social Media AI

Data: 2026-05-29  
Branch base: `codex/create-myinc-social-media-ai-application`  
Objetivo: transformar a base visual criada no Lovable em um produto real, persistente e operacional, sem perder o design premium já aprovado.

## 1. Diagnóstico real do projeto

O projeto já deixou de ser apenas uma tela bonita. Ele tem uma base organizada com rotas, componentes, tipos, serviços preparados, schema Supabase, `.env.example`, CI e documentação. Isso é um ótimo ponto de partida.

Mas o estado atual ainda não deve ser tratado como produto final 100% funcional. A maior parte da UX já existe, porém vários botões executam apenas `toast`, vários formulários ainda não persistem dados, a geração de conteúdo ainda usa funções determinísticas/mocks e a integração real com Supabase, OpenAI/imagem e Meta ainda precisa ser conectada de ponta a ponta.

## 2. O que deve ser preservado

### Design e identidade

Preservar:

- layout premium escuro/claro;
- estética grafite, off-white e laranja MYINC;
- cards arredondados, sombras suaves e hierarquia visual;
- Dashboard/Central;
- Planejamento mensal;
- Estúdio Criativo;
- Memória da Marca;
- Cérebro da IA;
- Biblioteca;
- Calendário;
- Painel ADM;
- Logs;
- componentes reutilizáveis criados em `src/components/social-components.tsx`.

Regra: não refazer o visual do zero. Corrigir funcionamento por baixo e lapidar microinterações.

## 3. O que falta para funcionar de verdade

### 3.1 Persistência real

Hoje os dados principais vêm de `src/lib/mock-data.ts`. Isso é útil para demo, mas não para operação.

Necessário criar uma camada de repositório para:

- marcas;
- memória da marca;
- regras do cérebro da IA;
- prompts base;
- planejamento mensal;
- ideias de posts;
- posts;
- versões;
- comentários humanos;
- feedbacks;
- biblioteca;
- fila de publicação;
- logs.

Arquivos sugeridos:

```text
src/lib/db/supabase.server.ts
src/lib/repositories/brand-repository.server.ts
src/lib/repositories/planning-repository.server.ts
src/lib/repositories/post-repository.server.ts
src/lib/repositories/media-repository.server.ts
src/lib/repositories/settings-repository.server.ts
src/lib/repositories/log-repository.server.ts
```

Estimativa: 900 a 1.500 linhas.

### 3.2 Server actions / API interna

A UI precisa parar de chamar apenas `toast` e passar a chamar ações reais server-side.

Criar actions para:

- salvar memória da marca;
- criar/editar/excluir/arquivar regras de IA;
- gerar planejamento;
- aprovar temas;
- produzir posts;
- salvar comentários humanos;
- regenerar copy;
- regenerar prompt;
- gerar imagem;
- aprovar post;
- agendar post;
- publicar agora;
- arquivar/excluir item de biblioteca;
- testar conexão Meta;
- testar conexão IA;
- testar Supabase;
- gravar logs.

Arquivos sugeridos:

```text
src/lib/actions/brand-actions.server.ts
src/lib/actions/planning-actions.server.ts
src/lib/actions/creative-actions.server.ts
src/lib/actions/media-actions.server.ts
src/lib/actions/publish-actions.server.ts
src/lib/actions/admin-actions.server.ts
```

Estimativa: 1.200 a 2.000 linhas.

### 3.3 IA real de texto

O arquivo `src/lib/services/ai-content-service.ts` já monta prompt mestre e simula resultados. O próximo passo é ligar esse serviço a um provedor real.

Requisitos:

- chamar OpenAI apenas no servidor;
- nunca expor `OPENAI_API_KEY` no frontend;
- aceitar fallback mock em ambiente sem chave;
- retornar JSON estruturado;
- validar JSON com schema;
- registrar prompt, resposta, custo estimado e erro em logs;
- impedir respostas genéricas;
- usar memória da marca, biblioteca e feedback humano no prompt.

Arquivos sugeridos:

```text
src/lib/services/openai-text-service.server.ts
src/lib/services/ai-content-service.ts
src/lib/validators/ai-output-schema.ts
```

Estimativa: 700 a 1.200 linhas.

### 3.4 IA real de imagem

O arquivo `src/lib/services/image-generation-service.ts` já cria prompt e fallback. Falta produção real.

Requisitos:

- gerar imagem real via provedor configurado;
- salvar resultado em Supabase Storage;
- gerar URL pública HTTPS;
- registrar asset na biblioteca;
- criar versão do post;
- validar dimensão por formato;
- permitir regeneração com feedback humano;
- usar referências aprovadas da biblioteca;
- bloquear referências proibidas.

Arquivos sugeridos:

```text
src/lib/services/image-generation-service.ts
src/lib/services/storage-service.server.ts
src/lib/actions/image-actions.server.ts
```

Estimativa: 600 a 1.000 linhas.

### 3.5 Meta Graph API real

O arquivo `src/lib/services/meta-service.ts` já tem validações e métodos base. Precisa endurecer para produção.

Requisitos:

- testar token e permissões;
- validar Page ID;
- validar Instagram Business ID;
- publicar imagem no Instagram;
- publicar carrossel de verdade;
- publicar Reels/vídeo quando houver vídeo público;
- publicar Facebook photo/feed/video;
- agendar post usando fila própria;
- reprocessar erros;
- salvar `meta_publish_id` e `published_url`;
- tratar erros da Meta com mensagem amigável;
- usar payload compatível com Graph API, evitando depender apenas de JSON quando endpoint exigir form-urlencoded/multipart.

Arquivos sugeridos:

```text
src/lib/services/meta-service.ts
src/lib/actions/publish-actions.server.ts
src/lib/workers/publish-queue-worker.server.ts
```

Estimativa: 900 a 1.500 linhas.

### 3.6 Biblioteca funcional

Hoje a Biblioteca tem grid, filtros e botões, mas precisa persistir upload, tags, status e relação com IA.

Requisitos:

- upload para Supabase Storage;
- salvar `media_assets` e `library_items`;
- editar nome/tags/notas;
- marcar como referência aprovada/proibida/template;
- excluir/arquivar/restaurar;
- filtrar por campanha, formato, tipo e permissão da IA;
- usar assets aprovados no prompt mestre.

Estimativa: 600 a 1.000 linhas.

### 3.7 Fluxo editorial completo

Fluxo esperado:

1. usuário preenche Memória da Marca;
2. usuário configura Cérebro da IA;
3. usuário cria Planejamento Mensal;
4. sistema gera ideias;
5. usuário edita/aprova temas;
6. sistema envia aprovados para produção;
7. IA cria copy, prompt, briefing, imagem e score;
8. usuário revisa no Estúdio Criativo;
9. usuário comenta ou aprova;
10. sistema agenda no Calendário;
11. fila publica no horário;
12. logs mostram sucesso/erro;
13. feedback alimenta próximos conteúdos.

Esse fluxo precisa ser persistente. O usuário não pode perder estado ao trocar de aba ou recarregar página.

Estimativa: 1.000 a 1.800 linhas.

## 4. Ordem de execução recomendada

### Etapa 1 — Local-first funcional

Objetivo: parar de parecer protótipo.

Entregar:

- estado centralizado;
- persistência local temporária em `localStorage` ou IndexedDB;
- todos os botões principais executando ações reais locais;
- aprovar, editar, arquivar, excluir, restaurar e comentar funcionando;
- fluxo sem voltar para o início.

Critério de aceite:

- criar planejamento;
- aprovar temas;
- enviar para produção;
- revisar post;
- aprovar;
- agendar;
- ver no calendário;
- recarregar página e manter dados.

### Etapa 2 — Supabase real

Objetivo: trocar persistência local por banco real.

Entregar:

- client/server Supabase configurado;
- repositories server-side;
- migração aplicada;
- leitura e escrita real;
- storage para uploads e imagens geradas;
- logs persistentes.

Critério de aceite:

- dados aparecem depois de fechar e abrir o app;
- biblioteca salva arquivos;
- posts e comentários persistem;
- logs persistem.

### Etapa 3 — IA real

Objetivo: substituir geração simulada por IA real.

Entregar:

- texto real via OpenAI;
- prompt mestre auditável;
- JSON validado;
- geração de copy, hashtags, CTA, briefing e prompt visual;
- melhoria com feedback humano;
- logs de erro/custo.

Critério de aceite:

- 30 ideias geradas com variação real;
- copy não repetitiva;
- prompt visual coerente com a marca;
- feedback humano altera a próxima versão.

### Etapa 4 — Imagem real

Objetivo: gerar criativos premium de verdade.

Entregar:

- geração de imagem via API;
- upload automático para storage;
- URL pública HTTPS;
- versões do post;
- regeneração com comentário humano.

Critério de aceite:

- cada post produzido tem imagem real;
- imagem fica salva na biblioteca;
- URL pública pode ser usada pela Meta.

### Etapa 5 — Meta real

Objetivo: publicar Facebook/Instagram sem simular sucesso.

Entregar:

- teste de conexão;
- validação de permissões;
- publicação Instagram imagem;
- publicação Facebook photo/feed;
- fila de publicação;
- reprocessamento de erro;
- logs amigáveis.

Critério de aceite:

- post aprovado publica no Facebook;
- post aprovado publica no Instagram;
- erro de token/mídia/permissão aparece com explicação clara;
- sistema não publica nada sem aprovação no modo semi-automático.

## 5. Arquivos críticos atuais

### Manter e evoluir

```text
src/routes/index.tsx
src/routes/planejamento.tsx
src/routes/conteudos.tsx
src/routes/calendario.tsx
src/routes/biblioteca.tsx
src/routes/configuracoes.tsx
src/routes/cerebro-ia.tsx
src/routes/admin.tsx
src/routes/logs.tsx
src/components/social-components.tsx
src/lib/social-types.ts
src/lib/services/ai-content-service.ts
src/lib/services/image-generation-service.ts
src/lib/services/meta-service.ts
supabase/migrations/20260529000000_myinc_social_media_ai.sql
.env.example
```

### Criar no próximo patch

```text
src/lib/state/social-workspace-store.ts
src/lib/db/supabase.server.ts
src/lib/repositories/*.server.ts
src/lib/actions/*.server.ts
src/lib/services/openai-text-service.server.ts
src/lib/services/storage-service.server.ts
src/lib/workers/publish-queue-worker.server.ts
src/lib/validators/*.ts
```

## 6. Estimativa de código para deixar 10/10

Estimativa realista para transformar a base atual em produto operacional:

- repositórios Supabase: 900 a 1.500 linhas;
- actions server-side: 1.200 a 2.000 linhas;
- IA texto real: 700 a 1.200 linhas;
- imagem/storage: 600 a 1.000 linhas;
- Meta/publicação/fila: 900 a 1.500 linhas;
- ajustes de UI persistente: 1.000 a 1.800 linhas;
- validações/logs/testes: 600 a 1.200 linhas.

Total provável: 5.900 a 10.200 linhas novas/refatoradas.

## 7. Checklist antes de chamar de “perfeito e funcionando”

- [ ] `bun run lint` passa.
- [ ] `bun run typecheck` passa.
- [ ] `bun run build` passa.
- [ ] `bun run verify` passa.
- [ ] app roda localmente sem erro.
- [ ] planejamento gera ideias com dados reais do formulário.
- [ ] aprovar tema muda status e persiste.
- [ ] produção gera copy/prompt/briefing/imagem.
- [ ] comentário humano gera nova versão.
- [ ] biblioteca faz upload e edição real.
- [ ] calendário mostra dados reais.
- [ ] fila publica ou retorna erro real.
- [ ] Meta não simula sucesso.
- [ ] logs são gravados no banco.
- [ ] segredos não aparecem no frontend.
- [ ] `.env` real não é commitado.

## 8. Decisão recomendada

Não jogar fora o projeto do Lovable. A base visual está boa e deve ser reaproveitada.

A melhor estratégia é:

1. usar o PR atual como base visual/arquitetural;
2. não declarar como produto final ainda;
3. criar um patch `v1.1-functional-core` para persistência e fluxo local-first;
4. depois criar `v1.2-supabase-ai-meta` para integrações reais;
5. somente após isso marcar como versão de produção.

## 9. Critério final de qualidade

O sistema só será considerado 10/10 quando uma pessoa sem conhecimento técnico conseguir:

1. abrir o app;
2. preencher/editar a marca;
3. clicar para gerar 30 posts;
4. aprovar temas;
5. produzir criativos;
6. revisar um por um;
7. comentar/regenerar;
8. aprovar;
9. agendar;
10. publicar no Facebook/Instagram;
11. ver logs claros;
12. repetir no mês seguinte sem refazer tudo.

Essa é a régua oficial do projeto MYINC Social Media AI.
