# Meta Setup

Configure no backend/Edge Functions:

- `META_GRAPH_VERSION`
- `META_APP_ID`
- `META_APP_SECRET`
- `META_PAGE_ID`
- `META_INSTAGRAM_BUSINESS_ID`
- `META_PAGE_ACCESS_TOKEN`
- `FACEBOOK_PAGE_ID`

A publicação deve validar token, permissões, mídia pública HTTPS, legenda, canal/formato e status aprovado antes de chamar a Graph API.

## Teste real de publicação

1. Garanta post com `status` `aprovado` ou `agendado`.
2. Garanta `caption` preenchida.
3. Garanta `media_url` HTTPS pública do bucket `creative-media`.
4. Clique em **Publicar agora** no Estúdio ou Calendário.
5. Confira `posts`, `publish_queue`, `publish_logs` e `system_logs`.
