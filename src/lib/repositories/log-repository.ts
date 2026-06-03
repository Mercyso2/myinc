import { BaseRepository } from "./base-repository";
import type { SystemLogRow } from "@/lib/supabase/types";

export const logRepository = new BaseRepository<SystemLogRow>("system_logs");
