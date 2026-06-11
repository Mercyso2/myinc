export type AiFocusMode = "equilibrado" | "comunidade" | "autoridade" | "comercial" | "institucional";

export const AI_FOCUS_MODES: Array<{
  value: AiFocusMode;
  label: string;
  description: string;
}> = [
  {
    value: "equilibrado",
    label: "Equilibrado",
    description: "Distribui o mês entre relacionamento, autoridade, conteúdo útil e oportunidades comerciais.",
  },
  {
    value: "comunidade",
    label: "Comunidade e conexão",
    description: "Prioriza conversas, bastidores, perguntas, enquetes e presença recorrente nos stories.",
  },
  {
    value: "autoridade",
    label: "Autoridade",
    description: "Prioriza conteúdos educativos, técnicos, institucionais e de construção de confiança.",
  },
  {
    value: "comercial",
    label: "Comercial",
    description: "Prioriza diferenciais, objeções, chamadas para atendimento e clareza de oferta.",
  },
  {
    value: "institucional",
    label: "Institucional",
    description: "Prioriza marca, bastidores, equipe, processo e posicionamento premium.",
  },
];

export const MYINC_LIGHT_PROFILE_RULE =
  "Perfil visual claro/lite: priorizar branco, off-white, areia, luz natural, respiro, contraste suave e aparência premium limpa. Evitar fundo escuro dominante.";
