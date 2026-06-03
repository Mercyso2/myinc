# Atualização simples na hospedagem

Sempre faça backup antes. O script já faz isso.

```bash
bash scripts/update-hosting.sh
```

Se usar PM2:

```bash
pm2 restart myinc-social-media-ai
```

Se usar EasyPanel, clique em redeploy/restart depois de enviar os arquivos.
