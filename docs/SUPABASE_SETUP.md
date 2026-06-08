# Supabase Setup

1. Crie um projeto Supabase.
2. Aplique `supabase/migrations/20260603000000_media_engine_production.sql`.
3. Aplique `supabase/migrations/20260603003000_runtime_secrets_v9_final.sql`.
4. Em Authentication, crie o usuario admin com senha forte.
5. Vincule o `auth_user_id` na tabela `app_users` ao usuário criado.
6. Publique as Edge Functions listadas em `docs/EDGE_FUNCTIONS_DEPLOY.md`.
7. Configure `SUPABASE_SERVICE_ROLE_KEY` apenas nos secrets das functions.

## Edge Functions obrigatórias v1.3.0

```bash
npx supabase functions deploy admin-users
npx supabase functions deploy admin-status
npx supabase functions deploy admin-save-settings
npx supabase functions deploy ai-generate-plan
npx supabase functions deploy autonomous-run
npx supabase functions deploy backup-create
npx supabase functions deploy backup-list
npx supabase functions deploy generate-post-content
npx supabase functions deploy generate-image
npx supabase functions deploy generate-images-batch
npx supabase functions deploy generate-video
npx supabase functions deploy generate-videos-batch
npx supabase functions deploy improve-post
npx supabase functions deploy meta-test-connection
npx supabase functions deploy process-production-queue
npx supabase functions deploy process-publish-queue
npx supabase functions deploy publish-meta
npx supabase functions deploy render-template
npx supabase functions deploy render-templates-batch
npx supabase functions deploy review-post-quality
```

Confirme que `creative-media` é público para a Meta acessar imagens.
