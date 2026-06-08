# MAPA DE PRODUÇÃO MASSA — MYINC SOCIAL MEDIA AI v4

Esta versão foi preparada para transformar o projeto de um protótipo bonito em uma base de produção com motor real de mídia. O foco principal foi blindar imagem, vídeo/Reels, fila, publicação e ambiente.

## 1. Objetivo da versão

Criar uma ferramenta interna de social media para incorporadoras capaz de:

- planejar campanhas mensais;
- gerar copy, legenda, hashtags, roteiro, briefing visual e CTA;
- gerar imagens reais por IA com validação;
- gerar vídeos/Reels por API de vídeo quando habilitada;
- revisar conteúdo antes de publicar;
- publicar na Meta somente com mídia pública válida;
- impedir falso sucesso em geração/publicação.

## 2. Pipeline ideal de produção

### Etapa 1 — Memória da marca

O sistema deve manter:

- logotipo;
- paleta de cores;
- tom de voz;
- público-alvo;
- diferenciais da incorporadora;
- exemplos visuais aprovados;
- restrições de texto, estética e linguagem.

### Etapa 2 — Planejamento mensal

O operador cria 30 ideias ou pede para a IA gerar. Cada ideia deve sair com:

- formato: feed, story, reels, carrossel;
- objetivo: autoridade, venda, prova social, bastidor, lifestyle;
- headline;
- legenda;
- CTA;
- hashtags;
- briefing visual.

### Etapa 3 — Pré-aprovação humana

Antes da mídia final, o usuário aprova/edita o tema. Isso reduz custo e evita gerar imagem errada.

### Etapa 4 — Produção de mídia

Fluxo por formato:

- Feed: imagem vertical/quadrada real validada.
- Story: imagem 9:16 real validada.
- Carrossel: múltiplas páginas, cada uma com briefing próprio.
- Reels/Vídeo: vídeo real por API quando `ENABLE_OPENAI_VIDEO=true`; senão, não finge produção final.

### Etapa 5 — Validação

A mídia gerada precisa passar por:

- assinatura real do arquivo;
- tamanho mínimo;
- formato correto;
- URL pública HTTPS para publicação;
- status claro de sucesso, erro ou simulação.

### Etapa 6 — Revisão final

O usuário vê preview estilo Instagram, aprova, reprova, edita legenda e agenda.

### Etapa 7 — Publicação

A publicação só deve ser marcada como publicada se a Meta confirmar retorno válido. Sem credenciais, fica bloqueada ou simulada explicitamente.

## 3. Alterações críticas feitas nesta versão

### Imagens

- Modelo padrão atualizado para `gpt-image-1.5`.
- Fallbacks configuráveis: `gpt-image-1,gpt-image-1-mini`.
- Removido falso PNG baseado em SVG.
- Adicionada validação por assinatura de arquivo.
- Adicionado modo rígido `AI_STRICT_MODE` / `PRODUCTION_MEDIA_STRICT`.
- Prompts visuais muito mais fortes para incorporadoras.
- Tamanhos corretos por formato: quadrado, vertical e horizontal.

### Vídeos/Reels

- Nova função Supabase `generate-video`.
- Suporte à API de vídeos OpenAI/Sora.
- Polling de job assíncrono.
- Download e upload do MP4 final.
- Campos de status, progresso e job id no banco.
- Bloqueio de publicação de Reels sem `video_url` real.

### Publicação Meta

- Bloqueia falso publicado em modo local.
- Exige URL pública HTTPS.
- Distingue feed, story, carrossel e Reels.
- Reels/Vídeo só publicam com MP4 real.
- Carrossel preparado para `carousel_media_urls`.

### Segurança local

- REST local agora pode exigir `LOCAL_API_KEY`.
- `/rest/v1` e `/functions/v1` não ficam mais abertos por padrão.
- `ALLOW_LOCAL_PUBLISH_SIMULATION=false` por padrão.
- `.env.local` foi removido do pacote final.

### Banco

Nova migration:

`supabase/migrations/20260603000000_media_engine_production.sql`

Ela adiciona campos para:

- carrossel;
- vídeo;
- poster de vídeo;
- storyboard;
- status/progresso;
- qualidade;
- metadados de geração.

## 4. Variáveis obrigatórias para produção

Copie `.env.production.example` para `.env.production` e configure:

```env
OPENAI_API_KEY=COLE_SUA_CHAVE_OPENAI_AQUI
OPENAI_IMAGE_MODEL=gpt-image-1.5
OPENAI_IMAGE_FALLBACK_MODELS=gpt-image-1,gpt-image-1-mini
OPENAI_IMAGE_QUALITY=high
OPENAI_IMAGE_FORMAT=png

ENABLE_OPENAI_VIDEO=true
OPENAI_VIDEO_MODEL=sora-2-pro
OPENAI_VIDEO_SIZE=720x1280
OPENAI_VIDEO_SECONDS=8

SUPABASE_URL=https://seu-projeto.supabase.co
SUPABASE_SERVICE_ROLE_KEY=...
SUPABASE_ANON_KEY=...

META_PAGE_ID=...
META_PAGE_ACCESS_TOKEN=...
META_INSTAGRAM_BUSINESS_ID=...

PUBLIC_MEDIA_BASE_URL=https://sua-url-publica.com/storage/v1/object/public/creative-media
LOCAL_AUTH_REQUIRED=true
LOCAL_API_KEY=troque_essa_chave
AI_STRICT_MODE=true
ALLOW_LOCAL_PUBLISH_SIMULATION=false
```

## 5. Como rodar localmente

```bash
npm ci
cp .env.local.example .env.local
npm run local
```

Para checagem:

```bash
npm run typecheck
npm run lint
npm run smoke:local -- --static
```

## 6. Como subir em produção

1. Não suba `node_modules`.
2. Rode `npm ci` no servidor.
3. Configure `.env.production`.
4. Aplique as migrations Supabase.
5. Publique as Edge Functions.
6. Configure bucket `creative-media` com leitura pública ou CDN.
7. Configure Meta com permissões corretas.
8. Faça um post teste de Feed.
9. Faça um post teste de Reels.
10. Publique somente depois de confirmar URL pública HTTPS da mídia.

## 7. Critério de pronto para operar

A aplicação só deve ser considerada pronta quando:

- imagem real é gerada com OpenAI;
- arquivo passa validação;
- mídia abre por HTTPS público;
- Reels gera `video_url` MP4;
- Meta confirma publicação;
- fila não marca falso sucesso;
- logs mostram erro claro quando falha.

## 8. Próximos upgrades recomendados

- Avaliador visual com IA para detectar texto quebrado ou baixa qualidade.
- Editor visual estilo Canva com camadas.
- Templates próprios por formato.
- Biblioteca de referências por campanha.
- Renderizador de carrossel com texto controlado, não texto gerado dentro da imagem.
- Agendamento Meta com reprocessamento automático.
- Relatório de performance por post.
