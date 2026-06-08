export type Json = string | number | boolean | null | Json[] | { [key: string]: Json | undefined };

export type RowBase = {
  id: string;
  brand_id?: string | null;
  archived_at?: string | null;
  deleted_at?: string | null;
  created_at: string;
  updated_at?: string | null;
};

export type AdminCreateUserPayload = {
  email: string;
  password?: string;
  fullName?: string;
  role?: "admin" | "editor" | "aprovador" | "viewer" | "user";
  brandId?: string | null;
  status?: string;
};

export type BrandRow = RowBase & {
  owner_id?: string | null;
  name: string;
  public_name?: string | null;
  status?: string | null;
};

export type BrandProfileRow = RowBase & {
  site?: string | null;
  instagram?: string | null;
  facebook?: string | null;
  whatsapp?: string | null;
  commercial_email?: string | null;
  region?: string | null;
  niche?: string | null;
  segment?: string | null;
  primary_audience?: string | null;
  secondary_audience?: string | null;
  persona?: string | null;
  problems_solved?: string | null;
  benefits?: string | null;
  differentiators?: string | null;
  products?: string | null;
  services?: string | null;
  average_ticket?: string | null;
  objections?: string | null;
  guarantees?: string | null;
  social_proof?: string | null;
  cases?: string | null;
  testimonials?: string | null;
  faq?: string | null;
  tone?: string | null;
  communication_style?: string | null;
  preferred_words?: string | null;
  forbidden_words?: string | null;
  usual_phrases?: string | null;
  never_use_phrases?: string | null;
  forbidden_promises?: string | null;
  allowed_technical_terms?: string | null;
  avoided_technical_terms?: string | null;
  primary_palette?: string | null;
  secondary_palette?: string | null;
  forbidden_colors?: string | null;
  brand_fonts?: string | null;
  preferred_visual_style?: string | null;
  forbidden_visual_style?: string | null;
  preferred_images?: string | null;
  avoided_images?: string | null;
  logo_rules?: string | null;
  composition_rules?: string | null;
  image_text_rules?: string | null;
  approved_references?: string | null;
  bad_references?: string | null;
  mantra?: string | null;
};

export type MonthlyPlanRow = RowBase & {
  month?: number | null;
  year?: number | null;
  title?: string | null;
  objective?: string | null;
  strategy?: string | null;
  status?: string | null;
  total_posts?: number | null;
  prompt_used?: string | null;
  ai_response_json?: Json;
};

export type PostIdeaRow = RowBase & {
  monthly_plan_id?: string | null;
  title: string;
  headline?: string | null;
  short_text?: string | null;
  cta?: string | null;
  visual_idea?: string | null;
  initial_prompt?: string | null;
  suggested_at?: string | null;
  theme?: string | null;
  objective?: string | null;
  channel?: string | null;
  format?: string | null;
  scheduled_at?: string | null;
  priority?: number | null;
  predicted_score?: number | null;
  status?: string | null;
  approved_at?: string | null;
  notes?: string | null;
  prompt_seed?: string | null;
  ai_response_json?: Json;
};

export type PostRow = RowBase & {
  monthly_plan_id?: string | null;
  post_idea_id?: string | null;
  source_idea_id?: string | null;
  title: string;
  channel: string;
  format?: string | null;
  scheduled_at?: string | null;
  objective?: string | null;
  theme?: string | null;
  headline?: string | null;
  short_text?: string | null;
  caption?: string | null;
  hashtags?: string[] | null;
  cta?: string | null;
  image_prompt?: string | null;
  video_prompt?: string | null;
  master_prompt?: string | null;
  creative_brief?: string | null;
  media_url?: string | null;
  video_url?: string | null;
  carousel_media_urls?: string[] | null;
  quality_score?: number | null;
  quality_review?: Json;
  status?: string | null;
  status_reason?: string | null;
  approved_at?: string | null;
  published_at?: string | null;
  meta_publish_id?: string | null;
  meta_post_id?: string | null;
  meta_permalink?: string | null;
  published_url?: string | null;
  error_message?: string | null;
};

export type PostVersionRow = RowBase & {
  post_id: string;
  version_label: string;
  caption?: string | null;
  media_url?: string | null;
  output_json?: Json;
  quality_score?: number | null;
  is_current?: boolean | null;
};

export type ContentCommentRow = RowBase & {
  post_id: string;
  user_id?: string | null;
  author_name?: string | null;
  comment?: string | null;
  status?: string | null;
  feedback_for_ai?: boolean | null;
};

export type MediaAssetRow = RowBase & {
  post_id?: string | null;
  name: string;
  type?: string | null;
  media_type?: string | null;
  bucket?: string | null;
  path?: string | null;
  url?: string | null;
  source_url?: string | null;
  public_url?: string | null;
  mime_type?: string | null;
  size_bytes?: number | null;
  status?: string | null;
  tags?: string[] | null;
  notes?: string | null;
  origin?: string | null;
  campaign?: string | null;
  format?: string | null;
  related_campaign_id?: string | null;
  usage_context?: string | null;
  ai_allowed: boolean;
  metadata?: Json;
  uploaded_at?: string | null;
};

export type LibraryItemRow = RowBase & {
  media_asset_id?: string | null;
  name: string;
  type?: string | null;
  media_type?: string | null;
  url?: string | null;
  source_url?: string | null;
  status?: string | null;
  tags?: string[] | null;
  notes?: string | null;
  origin?: string | null;
  campaign?: string | null;
  format?: string | null;
  related_campaign_id?: string | null;
  usage_context?: string | null;
  ai_allowed: boolean;
  metadata?: Json;
  uploaded_at?: string | null;
};

export type PublishQueueRow = RowBase & {
  post_id: string;
  channel?: string | null;
  scheduled_at?: string | null;
  mode?: string | null;
  status?: string | null;
  attempts?: number | null;
  max_attempts?: number | null;
  locked_at?: string | null;
  locked_by?: string | null;
  next_attempt_at?: string | null;
  last_error?: string | null;
  idempotency_key?: string | null;
  meta_response_json?: Json;
  cancelled_at?: string | null;
};

export type SystemLogRow = RowBase & {
  user_id?: string | null;
  post_id?: string | null;
  module: string;
  type: string;
  severity?: string | null;
  status: "sucesso" | "erro" | "alerta" | "info";
  friendly_message: string;
  technical_detail: string;
};

export type GenerationJobRow = RowBase & {
  post_id?: string | null;
  type?: string | null;
  provider?: string | null;
  status?: string | null;
  input_json?: Json;
  output_json?: Json;
  error_message?: string | null;
};
