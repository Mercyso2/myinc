# Deploy das Supabase Edge Functions

Execute na raiz do projeto Supabase conectado:

```bash
npx supabase functions deploy admin-users
npx supabase functions deploy admin-status
npx supabase functions deploy ai-generate-plan
npx supabase functions deploy generate-post-content
npx supabase functions deploy generate-image
npx supabase functions deploy publish-meta
```

Configure secrets no Supabase, nunca na Vercel:

```bash
npx supabase secrets set OPENAI_API_KEY=...
npx supabase secrets set OPENAI_TEXT_MODEL=gpt-4.1-mini
npx supabase secrets set OPENAI_IMAGE_MODEL=gpt-image-1
npx supabase secrets set META_PAGE_ACCESS_TOKEN=...
npx supabase secrets set META_PAGE_ID=...
npx supabase secrets set META_INSTAGRAM_BUSINESS_ID=...
npx supabase secrets set PUBLIC_MEDIA_BASE_URL=...
```
