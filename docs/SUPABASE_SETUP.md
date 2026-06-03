# Supabase Setup

1. Crie um projeto Supabase.
2. Aplique `supabase/migrations/20260529000000_myinc_social_media_ai.sql`.
3. Aplique `supabase/migrations/20260530000000_production_auth_rls_storage.sql`.
4. Em Authentication, crie `rodrigo@myinc.local` com senha `rodrigo`.
5. Vincule o `auth_user_id` na tabela `app_users` ao usuário criado.
6. Publique as Edge Functions: `admin-users`, `ai-generate-plan`, `generate-image`, `publish-meta`.
7. Configure `SUPABASE_SERVICE_ROLE_KEY` apenas nos secrets das functions.

## Edge Functions obrigatórias v1.3.0

```bash
npx supabase functions deploy admin-users
npx supabase functions deploy admin-status
npx supabase functions deploy ai-generate-plan
npx supabase functions deploy generate-post-content
npx supabase functions deploy generate-image
npx supabase functions deploy publish-meta
```

Confirme que `creative-media` é público para a Meta acessar imagens.
