import { insert } from "./supabase.js";
import { short } from "./env.js";

export async function systemLog(row) {
  try {
    return await insert("system_logs", {
      module: row.module || "vercel-worker",
      type: row.type || "system",
      status: row.status || "info",
      friendly_message: row.message || row.friendly_message || "Evento do sistema.",
      technical_detail: row.detail ? short(row.detail, 4000) : row.technical_detail || null,
      brand_id: row.brand_id || null,
      post_id: row.post_id || null,
      user_id: row.user_id || null,
      created_at: new Date().toISOString()
    });
  } catch (error) { console.error("systemLog failed", error); }
}

export async function jobEvent(jobId, eventType, message, detail = null) {
  if (!jobId) return;
  try {
    return await insert("generation_job_events", { job_id: jobId, event_type: eventType, message, detail, created_at: new Date().toISOString() });
  } catch (error) { console.error("jobEvent failed", error); }
}
