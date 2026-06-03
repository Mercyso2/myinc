import { BaseRepository } from "./base-repository";
import type { LibraryItemRow, MediaAssetRow } from "@/lib/supabase/types";

export const mediaRepository = new BaseRepository<MediaAssetRow>("media_assets");
export const libraryRepository = new BaseRepository<LibraryItemRow>("library_items");

export function listApprovedReferences(token: string, brandId: string) {
  return libraryRepository.listByBrand(
    token,
    brandId,
    "status=eq.referência aprovada&ai_allowed=eq.true&order=created_at.desc",
  );
}

export function markReferenceApproved(token: string, id: string) {
  return libraryRepository.update(token, id, {
    status: "referência aprovada",
    ai_allowed: true,
  } as Partial<LibraryItemRow>);
}

export function markReferenceForbidden(token: string, id: string, reason?: string) {
  return libraryRepository.update(token, id, {
    status: "referência proibida",
    ai_allowed: false,
    forbidden_reason: reason ?? "Marcada manualmente como proibida.",
  } as Partial<LibraryItemRow>);
}
