# Deploy Hostinger

1. Rode `npm run build`.
2. Copie `dist/*` para `public_html`.
3. Copie `.htaccess` para `public_html/.htaccess` para fallback SPA.
4. Configure `VITE_APP_URL` antes do build.
5. Teste refresh em `/login`, `/admin`, `/planejamento` e `/conteudos`.
