export type SocialChannel = "Instagram" | "Facebook" | "Ambos";
export type ContentFormat =
  | "Feed 1080x1350"
  | "Feed quadrado 1080x1080"
  | "Story 1080x1920"
  | "Reels 1080x1920"
  | "Carrossel 5 páginas"
  | "Carrossel 8 páginas"
  | "Facebook 1200x630"
  | "Vídeo curto"
  | "Thumbnail";

export type PostStatus =
  | "rascunho"
  | "tema_aprovado"
  | "em_producao"
  | "aguardando_revisao"
  | "ajuste_solicitado"
  | "aprovado"
  | "agendado"
  | "publicando"
  | "publicado"
  | "erro"
  | "pausado"
  | "arquivado"
  | "reprovado";

export type CampaignPattern =
  | "Venda"
  | "Autoridade"
  | "Engajamento"
  | "Prova social"
  | "Institucional"
  | "Bastidores"
  | "Oferta"
  | "Datas comemorativas"
  | "Lançamento"
  | "Educativo"
  | "Reativação"
  | "Comparativo"
  | "Antes e depois";

export interface BrandProfile {
  name: string;
  publicName: string;
  site: string;
  instagram: string;
  facebook: string;
  whatsapp: string;
  email: string;
  region: string;
  niche: string;
  segment: string;
  primaryAudience: string;
  secondaryAudience: string;
  persona: string;
  problemsSolved: string;
  benefits: string;
  differentiators: string;
  products: string;
  services: string;
  averageTicket: string;
  objections: string;
  guarantees: string;
  socialProof: string;
  cases: string;
  testimonials: string;
  faq: string;
  tone: string;
  communicationStyle: string;
  preferredWords: string;
  forbiddenWords: string;
  usualPhrases: string;
  neverUsePhrases: string;
  forbiddenPromises: string;
  allowedTechnicalTerms: string;
  avoidedTechnicalTerms: string;
  primaryPalette: string;
  secondaryPalette: string;
  forbiddenColors: string;
  brandFonts: string;
  preferredVisualStyle: string;
  forbiddenVisualStyle: string;
  preferredImages: string;
  avoidedImages: string;
  logoRules: string;
  compositionRules: string;
  imageTextRules: string;
  approvedReferences: string;
  badReferences: string;
}

export interface AIBrainRule {
  id: string;
  name: string;
  category: "Planejamento" | "Copy" | "Design" | "Imagem" | "Vídeo/Reels";
  content: string;
  active: boolean;
  priority: number;
  defaultContent: string;
}

export interface AIPromptTemplate {
  id: string;
  name: string;
  content: string;
  note: string;
  versions: string[];
}

export interface CustomCampaignTheme {
  id: string;
  theme: string;
  quantity: number;
  objective: string;
  formats: ContentFormat[];
  channels: SocialChannel[];
  period: string;
  notes: string;
}

export interface SocialPost {
  id: string;
  brandId: string;
  monthlyPlanId: string;
  title: string;
  channel: SocialChannel;
  format: ContentFormat;
  scheduledAt: string;
  objective: string;
  theme: string;
  headline: string;
  shortText: string;
  caption: string;
  hashtags: string[];
  cta: string;
  imagePrompt: string;
  videoPrompt?: string;
  masterPrompt: string;
  creativeBrief: string;
  mediaUrl: string;
  carouselMediaUrls?: string[];
  videoStoryboardUrls?: string[];
  storySequence?: unknown[];
  qualityNotes?: string[];
  qualityReview?: {
    overall_score?: number;
    copy_score?: number;
    visual_score?: number;
    brand_score?: number;
    cta_score?: number;
    approved?: boolean;
    problems?: string[];
    suggestions?: string[];
  };
  qualityScore: number;
  status: PostStatus;
  metaPublishId?: string;
  publishedUrl?: string;
  errorMessage?: string;
  archivedAt?: string;
  humanComments: ContentComment[];
  versions: PostVersion[];
  feedbacks: string[];
}

export interface ContentComment {
  id: string;
  author: string;
  comment: string;
  status: "aberto" | "resolvido";
  createdAt: string;
}

export interface PostVersion {
  id: string;
  version: string;
  caption: string;
  mediaUrl: string;
  carouselMediaUrls?: string[];
  videoStoryboardUrls?: string[];
  storySequence?: unknown[];
  qualityNotes?: string[];
  qualityReview?: {
    overall_score?: number;
    copy_score?: number;
    visual_score?: number;
    brand_score?: number;
    cta_score?: number;
    approved?: boolean;
    problems?: string[];
    suggestions?: string[];
  };
  qualityScore: number;
  createdAt: string;
}

export interface MediaAsset {
  id: string;
  name: string;
  type:
    | "Imagem gerada"
    | "Vídeo gerado"
    | "Logo"
    | "Referência visual"
    | "Template"
    | "Criativo aprovado"
    | "Criativo reprovado"
    | "Post antigo"
    | "Arquivo da marca"
    | "Paleta"
    | "Print concorrente"
    | "Material de campanha";
  url: string;
  status:
    | "ativo"
    | "arquivado"
    | "favorito"
    | "referência aprovada"
    | "referência proibida"
    | "template";
  tags: string[];
  notes: string;
  uploadedAt: string;
  origin: string;
  aiAllowed: boolean;
  campaign: string;
  format: string;
}

export interface SystemLog {
  id: string;
  date: string;
  type: string;
  user: string;
  module: string;
  status: "sucesso" | "erro" | "alerta" | "info";
  friendlyMessage: string;
  technicalDetail: string;
  postId?: string;
}
