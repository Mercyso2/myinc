import { BaseRepository } from "./base-repository";
import type { BrandProfileRow, BrandRow } from "@/lib/supabase/types";

export const brandRepository = new BaseRepository<BrandRow>("brands");
export const brandProfileRepository = new BaseRepository<BrandProfileRow>("brand_profiles");
export const brandVoiceRuleRepository = new BaseRepository<{
  id: string;
  brand_id: string;
  archived_at?: string | null;
  updated_at?: string | null;
}>("brand_voice_rules");
export const brandVisualRuleRepository = new BaseRepository<{
  id: string;
  brand_id: string;
  archived_at?: string | null;
  updated_at?: string | null;
}>("brand_visual_rules");
export const brandProductRepository = new BaseRepository<{
  id: string;
  brand_id: string;
  archived_at?: string | null;
  updated_at?: string | null;
}>("brand_products");
export const brandServiceRepository = new BaseRepository<{
  id: string;
  brand_id: string;
  archived_at?: string | null;
  updated_at?: string | null;
}>("brand_services");
export const brandReferenceRepository = new BaseRepository<{
  id: string;
  brand_id: string;
  archived_at?: string | null;
  updated_at?: string | null;
}>("brand_references");
export const brandColorPaletteRepository = new BaseRepository<{
  id: string;
  brand_id: string;
  archived_at?: string | null;
  updated_at?: string | null;
}>("brand_color_palette");

export async function getFirstAccessibleBrand(token: string) {
  const [brand] = await brandRepository.list(
    token,
    "select=*&status=eq.active&archived_at=is.null&order=created_at.asc&limit=1",
  );
  return brand ?? null;
}

export async function ensureFirstBrand(token: string) {
  const brand = await getFirstAccessibleBrand(token);
  if (!brand)
    throw new Error(
      "Nenhuma marca ativa encontrada. Rode a migration/seed MYINC ou crie uma marca no Admin.",
    );
  return brand;
}
