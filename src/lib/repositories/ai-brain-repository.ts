import { BaseRepository } from "./base-repository";
import type { Json } from "@/lib/supabase/types";

export type AIBrainRuleRow = {
  id: string;
  brand_id: string;
  name: string;
  category: string;
  content: string;
  active: boolean;
  priority: number;
  default_content?: string | null;
  archived_at?: string | null;
  deleted_at?: string | null;
  updated_at?: string | null;
};

export type AIPromptTemplateRow = {
  id: string;
  brand_id: string;
  name: string;
  content: string;
  note: string;
  version_history?: Json;
  active: boolean;
  archived_at?: string | null;
  deleted_at?: string | null;
  updated_at?: string | null;
};

export const aiBrainRuleRepository = new BaseRepository<AIBrainRuleRow>("ai_brain_rules");
export const aiPromptTemplateRepository = new BaseRepository<AIPromptTemplateRow>(
  "ai_prompt_templates",
);

export function listActiveRules(token: string, brandId: string) {
  return aiBrainRuleRepository.listByBrand(token, brandId, "active=eq.true&order=priority.asc");
}
