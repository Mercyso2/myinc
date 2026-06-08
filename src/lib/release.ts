export const APP_RELEASE = {
  name: "MYINC Social Media AI",
  version: "v1.3.1-production-readiness-check",
  channel: "production-candidate",
  label: "Produção auditada",
  date: "2026-05-30",
  githubTag: "v1.3.1-production-readiness-check",
  description:
    "Versão de conferência final: fluxo principal sem mocks, integrações reais via Supabase Edge Functions/OpenAI/Meta, painel ADM real e checklist de produção documentado. Publicação no GitHub depende de remote/push configurado.",
} as const;

export const STABILITY_GATES = [
  {
    area: "Segurança",
    status: "aprovado",
    detail:
      "Segredos ficam em variáveis de ambiente/server-side e campos sensíveis são mascarados no Painel ADM.",
  },
  {
    area: "Publicação Meta",
    status: "aprovado",
    detail:
      "Publicação real só ocorre após validação de token, IDs, aprovação do post e URL pública HTTPS.",
  },
  {
    area: "Fluxo editorial",
    status: "aprovado",
    detail:
      "Planejamento, produção, revisão, comentários, calendário e fila estão conectados por estados consistentes.",
  },
  {
    area: "Banco de dados",
    status: "aprovado",
    detail: "Migração Supabase/Postgres inclui as tabelas principais e índices de operação.",
  },
  {
    area: "Build",
    status: "aprovado",
    detail: "Versão validada com lint, build e captura visual da central.",
  },
] as const;

export const REQUIRED_ENV_GROUPS = [
  {
    group: "IA",
    keys: [
      "OPENAI_API_KEY",
      "OPENAI_TEXT_MODEL",
      "OPENAI_IMAGE_MODEL",
      "QUALITY_AUTO_APPROVE_SCORE",
    ],
  },
  {
    group: "Meta",
    keys: [
      "META_GRAPH_VERSION",
      "META_APP_ID",
      "META_APP_SECRET",
      "META_PAGE_ID",
      "META_INSTAGRAM_BUSINESS_ID",
      "META_PAGE_ACCESS_TOKEN",
      "FACEBOOK_PAGE_ID",
      "PUBLIC_MEDIA_BASE_URL",
    ],
  },
  {
    group: "Banco",
    keys: ["SUPABASE_URL", "SUPABASE_ANON_KEY", "SUPABASE_SERVICE_ROLE_KEY", "DATABASE_URL"],
  },
] as const;
