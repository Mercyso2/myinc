import { callEdgeFunction } from "@/lib/supabase/client";
import { BaseRepository } from "./base-repository";
import type { MonthlyPlanRow, PostIdeaRow } from "@/lib/supabase/types";

export const monthlyPlanRepository = new BaseRepository<MonthlyPlanRow>("monthly_plans");
export const postIdeaRepository = new BaseRepository<PostIdeaRow>("post_ideas");

export function generateMonthlyPlan(token: string, payload: Record<string, unknown>) {
  return callEdgeFunction<{ ok: true; monthlyPlan: MonthlyPlanRow; ideas: PostIdeaRow[] }>(
    "ai-generate-plan",
    token,
    payload,
  );
}

export function regenerateIdea(token: string, payload: { ideaId: string; instruction?: string }) {
  return callEdgeFunction<{ ok: true; idea: PostIdeaRow }>("ai-generate-plan", token, {
    ...payload,
    mode: "regenerate_idea",
  });
}
