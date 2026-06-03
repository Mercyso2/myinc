export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type UserRole = "admin" | "editor" | "aprovador" | "viewer" | "user";

export interface AppUser {
  id: string;
  auth_user_id?: string | null;
  email: string;
  full_name?: string | null;
  role: UserRole;
  brand_id?: string | null;
  status: "active" | "invited" | "disabled";
  last_login_at?: string | null;
  created_at: string;
  updated_at: string;
}

export interface BrandRow {
  id: string;
  owner_id?: string | null;
  name: string;
  public_name?: string | null;
  status: string;
  archived_at?: string | null;
  created_at: string;
  updated_at: string;
}

export interface BrandProfileRow {
  id: string;
  brand_id: string;
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
  primary_palette?: string | null;
  secondary_palette?: string | null;
  forbidden_colors?: string | null;
  brand_fonts?: string | null;
  preferred_visual_style?: string | null;
  forbidden_visual_style?: string | null;
  logo_rules?: string | null;
  composition_rules?: string | null;
  image_text_rules?: string | null;
  approved_references?: string | null;
  bad_references?: string | null;
  mantra?: string | null;
  created_at: string;
  updated_at: string;
}

export interface PostIdeaRow {
  id: string;
  monthly_plan_id: string;
  brand_id: string;
  suggested_at?: string | null;
  channel?: string | null;
  format?: string | null;
  theme?: string | null;
  objective?: string | null;
  headline?: string | null;
  short_text?: string | null;
  cta?: string | null;
  visual_idea?: string | null;
  initial_prompt?: string | null;
  predicted_score?: number | null;
  status?: string | null;
  converted_post_id?: string | null;
  approved_at?: string | null;
  rejected_reason?: string | null;
  regenerate_count?: number | null;
  archived_at?: string | null;
  deleted_at?: string | null;
  created_at?: string;
  updated_at?: string;
}

export interface MonthlyPlanRow {
  id: string;
  brand_id: string;
  name: string;
  month: number;
  year: number;
  objective?: string | null;
  total_posts?: number | null;
  channels?: Json;
  formats_distribution?: Json;
  campaign_distribution?: Json;
  plan_brief?: Json;
  status: string;
  archived_at?: string | null;
  created_at: string;
  updated_at: string;
}

export interface PostRow {
  id: string;
  brand_id: string;
  monthly_plan_id?: string | null;
  source_idea_id?: string | null;
  batch_id?: string | null;
  title: string;
  channel: string;
  format: string;
  scheduled_at?: string | null;
  scheduled_by?: string | null;
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
  carousel_media_urls?: string[] | null;
  video_storyboard_urls?: string[] | null;
  story_sequence?: Json | null;
  quality_score: number;
  status: string;
  status_reason?: string | null;
  current_version_id?: string | null;
  meta_publish_id?: string | null;
  meta_post_id?: string | null;
  meta_permalink?: string | null;
  published_url?: string | null;
  approved_at?: string | null;
  published_at?: string | null;
  error_message?: string | null;
  archived_at?: string | null;
  deleted_at?: string | null;
  created_at: string;
  updated_at: string;
}

export interface PostVersionRow {
  id: string;
  post_id: string;
  version_label: string;
  version_type?: string | null;
  caption?: string | null;
  image_prompt?: string | null;
  video_prompt?: string | null;
  media_url?: string | null;
  quality_score?: number | null;
  human_feedback?: string | null;
  generated_by?: string | null;
  prompt_snapshot?: Json;
  output_json?: Json;
  is_current?: boolean | null;
  restored_at?: string | null;
  created_at: string;
}

export interface ContentCommentRow {
  id: string;
  post_id: string;
  version_id?: string | null;
  user_id?: string | null;
  author_name?: string | null;
  comment?: string;
  status?: string;
  comment_type?: string | null;
  feedback_for_ai?: boolean | null;
  resolved_at?: string | null;
  resolved_by?: string | null;
  archived_at?: string | null;
  updated_at?: string | null;
  created_at?: string | null;
}

export interface SystemLogRow {
  id: string;
  created_at: string;
  brand_id?: string | null;
  user_id?: string | null;
  module: string;
  type?: string | null;
  status: "sucesso" | "erro" | "alerta" | "info";
  severity?: string | null;
  correlation_id?: string | null;
  request_id?: string | null;
  sanitized?: boolean | null;
  friendly_message: string;
  technical_detail?: string | null;
  post_id?: string | null;
}

export interface MediaAssetRow {
  id: string;
  brand_id?: string | null;
  post_id?: string | null;
  name: string;
  media_type: string;
  url: string;
  preview_url?: string | null;
  status: string;
  tags?: string[] | null;
  notes?: string | null;
  origin?: string | null;
  ai_allowed: boolean;
  asset_role?: string | null;
  usage_context?: string | null;
  ai_weight?: number | null;
  source_url?: string | null;
  related_campaign_id?: string | null;
  width?: number | null;
  height?: number | null;
  duration?: number | null;
  file_size?: number | null;
  storage_bucket?: string | null;
  storage_path?: string | null;
  is_final?: boolean | null;
  used_in_publish?: boolean | null;
  archived_at?: string | null;
  created_at: string;
  updated_at: string;
}

export interface LibraryItemRow {
  id: string;
  brand_id: string;
  media_asset_id?: string | null;
  name: string;
  item_type: string;
  url?: string | null;
  status: string;
  tags?: string[] | null;
  notes?: string | null;
  campaign?: string | null;
  format?: string | null;
  ai_usage_rule?: string | null;
  ai_allowed?: boolean | null;
  asset_role?: string | null;
  usage_context?: string | null;
  ai_weight?: number | null;
  source_url?: string | null;
  related_campaign_id?: string | null;
  forbidden_reason?: string | null;
  archived_at?: string | null;
  deleted_at?: string | null;
  created_at?: string;
  updated_at?: string;
}

export interface PublishQueueRow {
  id: string;
  post_id: string;
  channel: string;
  scheduled_at?: string | null;
  mode?: string | null;
  status: "queued" | "processing" | "published" | "failed" | "paused" | "cancelled";
  attempts?: number | null;
  last_error?: string | null;
  locked_at?: string | null;
  locked_by?: string | null;
  next_attempt_at?: string | null;
  meta_response_json?: Json;
  idempotency_key?: string | null;
  cancelled_at?: string | null;
  archived_at?: string | null;
  updated_at?: string | null;
  created_at?: string | null;
}

export interface GenerationJobRow {
  id: string;
  brand_id: string;
  post_id: string;
  batch_id?: string | null;
  job_type: "copy" | "image" | "full_post" | "regenerate";
  status: "queued" | "processing" | "done" | "failed" | "paused" | "cancelled";
  step?: string | null;
  attempts?: number | null;
  locked_at?: string | null;
  locked_by?: string | null;
  next_attempt_at?: string | null;
  last_error?: string | null;
  input_json?: Json;
  output_json?: Json;
  created_at?: string;
  updated_at?: string;
}

export interface AdminCreateUserPayload {
  email: string;
  password?: string;
  fullName: string;
  role: UserRole;
  brandId?: string;
}
