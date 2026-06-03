# MYINC Local — Patch Automação Final

Substitua os arquivos do projeto pelos arquivos deste patch preservando a mesma estrutura de pastas.

Arquivos incluídos:
- server/local-api.mjs
- src/routes/conteudos.tsx
- src/routes/cerebro-ia.tsx
- src/routes/biblioteca.tsx
- src/components/social-components.tsx
- src/components/instagram/InstagramCarouselMockup.tsx
- src/components/instagram/InstagramPostPreview.tsx
- src/lib/repositories/post-repository.ts
- src/lib/social-types.ts
- src/lib/supabase/types.ts
- src/lib/social-mappers.ts

Correções:
- Corrige função local autonomous-run.
- Adiciona carrossel com preview lateral, setas e bolinhas de navegação.
- Carrossel passa a mostrar páginas geradas pela IA quando disponíveis.
- Prompt base agora pode ser criado, editado, salvo, duplicado, arquivado e excluído.
- Cérebro IA passa a incluir prompts base no contexto da produção local.
- Biblioteca agora permite excluir definitivamente imagens, templates, referências e mídia gerada.
- Biblioteca permite marcar item como template.
- Backend local cria seed de prompts base MYINC.
- Posts carregam carousel_media_urls para preview real do carrossel.

Depois de aplicar:
1. Pare o servidor atual com Ctrl+C.
2. Rode: npm run typecheck
3. Rode: npm run build
4. Rode: npm run local
5. No navegador, limpe cache se necessário: localStorage.clear(); sessionStorage.clear(); location.reload();

Validação feita no patch:
- node --check server/local-api.mjs
- npm run typecheck
- npm run lint: 0 erros, 12 warnings antigos
- npm run build: OK
