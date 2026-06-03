# Changelog

## v1.0.0-stable — 2026-05-29

### Estado

- Canal: `stable`.
- Nome público: MYINC Social Media AI.
- Objetivo da versão: entregar uma base estável para uso operacional e evolução no GitHub.

### Incluído

- Central premium em português com indicadores do mês, saúde do sistema e atalhos operacionais.
- Memória da Marca, Cérebro da IA, Planejamento Mensal, Estúdio Criativo, Calendário Editorial, Biblioteca, Painel ADM e Logs.
- Serviços preparados para IA, geração de imagem e Meta Graph API com validações antes de publicar.
- Migração Supabase/Postgres com as tabelas principais do produto.
- `.env.example` documentado para segredos, Meta, IA, banco e release.

### Garantias de estabilidade desta versão

- Nenhuma chave sensível é hardcoded no frontend.
- Publicação real na Meta exige token, IDs, mídia HTTPS e post aprovado.
- O modo padrão de publicação é semi-automático.
- Mocks são identificados como modo de desenvolvimento/teste, sem simular publicação real.
- Build de produção validado antes do release.
