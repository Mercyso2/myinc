# Tutorial de hospedagem — MYINC Social Media AI

## Opção recomendada: VPS / EasyPanel / Hostinger VPS

1. Suba os arquivos do projeto para o servidor.
2. Copie `.env.production.example` para `.env.local`.
3. Preencha as chaves locais, OpenAI, Cloudinary e Meta.
4. Rode:

```bash
npm install
npm run build
node server/local-api.mjs
```

5. Configure proxy reverso para a porta `8787`.
6. Ative SSL/HTTPS no painel da hospedagem.

## Nginx exemplo

```nginx
server {
  server_name seudominio.com.br;

  location / {
    proxy_pass http://127.0.0.1:8787;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection 'upgrade';
    proxy_set_header Host $host;
    proxy_cache_bypass $http_upgrade;
  }
}
```

## PM2

```bash
npm install -g pm2
pm2 start server/local-api.mjs --name myinc-social-media-ai
pm2 save
pm2 startup
```

Atualizar:

```bash
bash scripts/update-hosting.sh
```
