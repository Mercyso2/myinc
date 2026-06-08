# Deploy das Supabase Edge Functions

Execute na raiz do projeto Supabase conectado:

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

Configure secrets no Supabase, nunca na Vercel:

```bash
npx supabase secrets set OPENAI_API_KEY=...
npx supabase secrets set OPENAI_TEXT_MODEL=gpt-5.5
npx supabase secrets set OPENAI_IMAGE_MODEL=gpt-image-2
npx supabase secrets set OPENAI_IMAGE_FALLBACK_MODELS=gpt-image-1.5,gpt-image-1
npx supabase secrets set OPENAI_IMAGE_QUALITY=high
npx supabase secrets set OPENAI_IMAGE_FORMAT=png
npx supabase secrets set ENABLE_OPENAI_VIDEO=true
npx supabase secrets set META_PAGE_ACCESS_TOKEN=...
npx supabase secrets set META_PAGE_ID=...
npx supabase secrets set META_INSTAGRAM_BUSINESS_ID=...
npx supabase secrets set PUBLIC_MEDIA_BASE_URL=...
npx supabase secrets set CORS_ALLOW_ORIGIN=https://seudominio.com.br
npx supabase secrets set ALLOW_LOCAL_PUBLISH_SIMULATION=false
```
