# OpenAI Setup

Configure somente no backend/Edge Functions:

- `OPENAI_API_KEY`
- `OPENAI_TEXT_MODEL`
- `OPENAI_IMAGE_MODEL`

O frontend nunca deve receber chaves OpenAI. Planejamento, copy, prompts e imagem devem ser executados por funções backend.

## Teste real

1. Entre como admin.
2. Abra Painel ADM e clique em **Testar conexões reais**.
3. Gere planejamento em `/planejamento`.
4. No Estúdio, use **Melhorar copy** ou **Produzir todos os aprovados** para chamar `generate-post-content`.
5. Use **Gerar nova imagem** para chamar `generate-image`.
