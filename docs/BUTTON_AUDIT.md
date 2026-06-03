# Auditoria de Botões — v1.3.0-full-production-audit-no-mocks

| Tela         | Botão                           | Ação                                | Integração                                           | Status       | Observação                                        |
| ------------ | ------------------------------- | ----------------------------------- | ---------------------------------------------------- | ------------ | ------------------------------------------------- |
| Login        | Entrar                          | Autentica usuário                   | Supabase Auth REST                                   | Implementado | Fallback local bloqueado em produção.             |
| Dashboard    | Criar planejamento mensal       | Navega para planejamento            | TanStack Router                                      | Implementado | Sem mocks no carregamento do painel.              |
| Planejamento | Gerar planejamento com IA       | Chama IA e salva plano/ideias       | Edge Function `ai-generate-plan` + OpenAI + Supabase | Implementado | Usa brand real; erro claro se não houver marca.   |
| Planejamento | Aprovar/Reprovar/Arquivar ideia | Atualiza status                     | `post_ideas` Supabase                                | Implementado | Persistência real.                                |
| Planejamento | Aprovar todos                   | Atualiza todas as ideias retornadas | `post_ideas` Supabase                                | Implementado | Executa updates reais.                            |
| Planejamento | Enviar aprovados para produção  | Cria posts reais                    | `posts` Supabase                                     | Implementado | Envia somente ideias aprovadas.                   |
| Estúdio      | Produzir todos os aprovados     | Gera conteúdo textual               | Edge Function `generate-post-content`                | Implementado | Sem IA local/mock.                                |
| Estúdio      | Melhorar copy/design            | Regenera conteúdo/briefing          | Edge Function `generate-post-content`                | Implementado | Cria versões no backend.                          |
| Estúdio      | Gerar nova imagem               | Gera imagem real                    | Edge Function `generate-image` + Storage             | Implementado | Salva em `creative-media`.                        |
| Estúdio      | Aprovar                         | Atualiza status                     | `posts` Supabase                                     | Implementado | Persistência real.                                |
| Estúdio      | Publicar agora                  | Publica via Meta                    | Edge Function `publish-meta`                         | Implementado | Retorna erro real se Meta recusar.                |
| Biblioteca   | Upload de arquivos              | Envia arquivo e cria asset          | Supabase Storage `library` + `media_assets`          | Implementado | Sem `mediaAssets` mock.                           |
| Calendário   | Agendar aprovados               | Cria fila e muda status             | `publish_queue` + `posts`                            | Implementado | Somente posts aprovados com data.                 |
| Calendário   | Publicar agora                  | Publica primeiro pronto             | Edge Function `publish-meta`                         | Implementado | Bloqueia sem aprovado/agendado.                   |
| Memória      | Salvar agora                    | Salva marca/perfil                  | `brands` + `brand_profiles`                          | Implementado | Auto-save com debounce.                           |
| Memória      | Restaurar arquivados            | Restauração granular                | Supabase                                             | Desabilitado | Exige modelagem de campos auxiliares arquiváveis. |
| Cérebro IA   | Nova regra                      | Cria regra                          | `ai_brain_rules`                                     | Implementado | Regras alimentam prompts backend.                 |
| Cérebro IA   | Testar prompt                   | Monta prompt real                   | `ai_brain_rules` + `ai_prompt_templates`             | Implementado | Não chama mock local.                             |
| Cérebro IA   | Restaurar padrões               | Seed/versionamento                  | Supabase                                             | Desabilitado | Exige seed aprovado de prompts padrão.            |
| Admin        | Testar conexões reais           | Verifica backend/env/db/storage     | Edge Function `admin-status`                         | Implementado | Não revela segredos.                              |
| Admin        | Criar usuário                   | Cria Auth + app_users               | Edge Function `admin-users`                          | Implementado | Bloqueado em fallback local.                      |
| Logs         | Atualizar logs                  | Recarrega logs                      | `system_logs` Supabase                               | Implementado | Sem `systemLogs` mock.                            |
| Logs         | Exportar JSON/CSV               | Exporta seleção real                | Browser Blob                                         | Implementado | Usa logs carregados do banco.                     |

Botões não suportados foram desabilitados com observação em vez de simular sucesso.
