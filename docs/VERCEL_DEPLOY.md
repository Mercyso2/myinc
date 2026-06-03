# Deploy Vercel

Variáveis públicas na Vercel:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`
- `VITE_APP_ENV=production`
- `VITE_DEMO_MODE=false`

Segredos privados ficam somente no Supabase Edge Functions Secrets.

Build:

```bash
npm install
npm run verify
```
