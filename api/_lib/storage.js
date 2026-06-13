import { supabaseConfig } from "./supabase.js";
import { env } from "./env.js";

export function mediaBucket(config = process.env) {
  return String(config.MEDIA_BUCKET || env("MEDIA_BUCKET", "creative-media")).trim() || "creative-media";
}

export async function uploadObject({ config, path, bytes, contentType }) {
  const { url, serviceKey } = supabaseConfig();
  const bucket = mediaBucket(config);
  const response = await fetch(`${url}/storage/v1/object/${bucket}/${path}`, {
    method: "POST",
    headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}`, "Content-Type": contentType, "x-upsert": "false" },
    body: bytes
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`Storage upload falhou ${response.status}: ${text}`);
  return `${url}/storage/v1/object/public/${bucket}/${path}`;
}

export async function verifyPublicUrl(url) {
  const response = await fetch(url, { method: "HEAD" }).catch(() => null);
  return Boolean(response?.ok);
}
