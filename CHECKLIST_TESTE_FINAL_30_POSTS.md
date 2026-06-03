# Checklist final — MYINC Social Media AI

## Build

- [ ] `npm ci`
- [ ] `npm run typecheck`
- [ ] `npm run lint`
- [ ] `npm run build`

## Supabase

- [ ] Aplicar migrations.
- [ ] Verificar tabelas: `posts`, `post_ideas`, `generation_jobs`, `publish_queue`, `library_items`, `media_assets`, `system_logs`.
- [ ] Verificar buckets: `brand-assets`, `library`, `creative-media`.
- [ ] Verificar seed MYINC.
- [ ] Criar usuário Auth e vincular em `app_users`.

## Fluxo completo

- [ ] Login produção.
- [ ] Configurar memória da marca.
- [ ] Criar/editar regras no Cérebro IA.
- [ ] Upload de referência na Biblioteca.
- [ ] Marcar referência como aprovada para IA.
- [ ] Gerar 30 ideias no Planejamento.
- [ ] Editar 2 ideias.
- [ ] Aprovar 10 ideias.
- [ ] Reprovar 1 ideia.
- [ ] Arquivar 1 ideia.
- [ ] Enviar aprovados para Produção.
- [ ] Confirmar que não duplicou posts.
- [ ] Produção gera copy/hashtags/CTA/prompt.
- [ ] Imagem salva em Storage.
- [ ] Abrir modal do Estúdio.
- [ ] Salvar edição de legenda.
- [ ] Adicionar comentário humano.
- [ ] Regerar com feedback.
- [ ] Aprovar post.
- [ ] Agendar post no Calendário.
- [ ] Processar fila de publicação.
- [ ] Publicar 1 post real de teste Meta.
- [ ] Conferir `publish_logs` e `system_logs`.

## Critério de aprovação

- [ ] Nenhum botão principal sem ação real.
- [ ] Nenhum sucesso falso.
- [ ] Arquivar preserva histórico.
- [ ] Erro de IA/Meta não trava o lote.
- [ ] Cliente consegue operar sem mexer em banco/código.
