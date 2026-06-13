import type { AppUser, Session } from "./types";

const RAW_URL = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;
const RAW_DEFAULT_BRAND_ID = (import.meta.env.VITE_DEFAULT_BRAND_ID || import.meta.env.VITE_ISOLATED_BRAND_ID || "00000000-0000-0000-0000-000000000001") as string;

export const supabaseConfigured = Boolean(RAW_URL && ANON_KEY);
export function supabaseUrl() { if (!RAW_URL) throw new Error("VITE_SUPABASE_URL ausente."); return RAW_URL.replace(/\/$/, ""); }
export function anonKey() { if (!ANON_KEY) throw new Error("VITE_SUPABASE_ANON_KEY ausente."); return ANON_KEY; }
export function defaultBrandId() { return String(RAW_DEFAULT_BRAND_ID || "00000000-0000-0000-0000-000000000001").trim(); }
export function currentBrandId(profile?: Pick<AppUser, "brand_id"> | null) { return profile?.brand_id || defaultBrandId(); }
export function brandScoped(query: string, brandId?: string | null) {
  const id = String(brandId || defaultBrandId()).trim();
  if (!id) return query;
  return `${query}${query.includes("?") ? "&" : "&"}brand_id=eq.${encodeURIComponent(id)}`;
}

async function parseResponse(response: Response) { const text = await response.text(); try { return text ? JSON.parse(text) : null; } catch { return text; } }
function headers(token?: string, prefer = "return=representation") { return { apikey: anonKey(), Authorization: `Bearer ${token ?? anonKey()}`, "Content-Type": "application/json", Prefer: prefer }; }

export async function signIn(login: string, password: string): Promise<Session> {
  const email = login.includes("@") ? login : `${login}@myinc.local`;
  const response = await fetch(`${supabaseUrl()}/auth/v1/token?grant_type=password`, { method: "POST", headers: { apikey: anonKey(), "Content-Type": "application/json" }, body: JSON.stringify({ email, password }) });
  const data = await parseResponse(response);
  if (!response.ok) throw new Error("Login inválido ou usuário ausente no Supabase Auth.");
  return data as Session;
}

export async function selectRows<T>(table: string, token: string, query = "select=*") {
  const response = await fetch(`${supabaseUrl()}/rest/v1/${table}?${query}`, { headers: headers(token) });
  const data = await parseResponse(response);
  if (!response.ok) throw new Error(`Falha ao ler ${table}: ${JSON.stringify(data)}`);
  return (data ?? []) as T[];
}

export async function patchRow<T>(table: string, token: string, id: string, patch: Partial<T>) {
  const response = await fetch(`${supabaseUrl()}/rest/v1/${table}?id=eq.${encodeURIComponent(id)}`, { method: "PATCH", headers: headers(token), body: JSON.stringify(patch) });
  const data = await parseResponse(response);
  if (!response.ok) throw new Error(`Falha ao atualizar ${table}: ${JSON.stringify(data)}`);
  return Array.isArray(data) ? (data[0] as T) : (data as T);
}

export async function insertRows<T>(table: string, token: string, rows: Partial<T>[]) {
  const response = await fetch(`${supabaseUrl()}/rest/v1/${table}`, { method: "POST", headers: headers(token), body: JSON.stringify(rows) });
  const data = await parseResponse(response);
  if (!response.ok) throw new Error(`Falha ao inserir ${table}: ${JSON.stringify(data)}`);
  return (data ?? []) as T[];
}

export async function apiPost<T>(path: string, session: Session | null, body: unknown = {}) {
  const response = await fetch(path, { method: "POST", headers: { "Content-Type": "application/json", ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}) }, body: JSON.stringify(body) });
  const data = await parseResponse(response);
  if (!response.ok) throw new Error(typeof data?.error === "string" ? data.error : JSON.stringify(data));
  return data as T;
}

export async function apiGet<T>(path: string, session: Session | null) {
  const response = await fetch(path, { headers: { ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}) } });
  const data = await parseResponse(response);
  if (!response.ok) throw new Error(typeof data?.error === "string" ? data.error : JSON.stringify(data));
  return data as T;
}
