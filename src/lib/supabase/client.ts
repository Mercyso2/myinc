import type { AdminCreateUserPayload } from "./types";

const RAW_SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

function getSupabaseUrl() {
  if (RAW_SUPABASE_URL && RAW_SUPABASE_URL !== "same-origin") return RAW_SUPABASE_URL;
  if (typeof window !== "undefined") return window.location.origin;
  return RAW_SUPABASE_URL;
}

export const isSupabaseConfigured = Boolean(getSupabaseUrl() && SUPABASE_ANON_KEY);

export interface SupabaseSession {
  access_token: string;
  refresh_token?: string;
  expires_at?: number;
  user: {
    id: string;
    email?: string;
  };
}

export class SupabaseRestError extends Error {
  constructor(
    message: string,
    public status?: number,
    public details?: unknown,
  ) {
    super(message);
    this.name = "SupabaseRestError";
  }
}

function requireSupabaseEnv() {
  const SUPABASE_URL = getSupabaseUrl();
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    throw new SupabaseRestError(
      "Supabase não configurado. Defina VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY.",
    );
  }
  return { url: SUPABASE_URL.replace(/\/$/, ""), anonKey: SUPABASE_ANON_KEY };
}

function getHeaders(token?: string, prefer = "return=representation") {
  const { anonKey } = requireSupabaseEnv();
  return {
    apikey: anonKey,
    Authorization: `Bearer ${token ?? anonKey}`,
    "Content-Type": "application/json",
    Prefer: prefer,
  };
}

function getFunctionHeaders(token?: string) {
  const { anonKey } = requireSupabaseEnv();
  return {
    apikey: anonKey,
    Authorization: `Bearer ${token ?? anonKey}`,
    "Content-Type": "application/json",
  };
}

async function parseJson(response: Response) {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function readableError(value: unknown): string {
  if (!value) return "";
  if (value instanceof Error) return value.message;
  if (typeof value === "string") return value;
  if (typeof value !== "object") return String(value);

  const record = value as Record<string, unknown>;
  const nested = record.message ?? record.error_description ?? record.error ?? record.details;
  if (nested && nested !== value) {
    const nestedMessage = readableError(nested);
    if (nestedMessage) return nestedMessage;
  }

  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

async function fetchSupabase(context: string, input: string, init?: RequestInit) {
  try {
    return await fetch(input, init);
  } catch (error) {
    const host = (() => {
      try {
        return new URL(input).host;
      } catch {
        return input;
      }
    })();
    throw new SupabaseRestError(
      `${context}: falha de rede/CORS ao acessar ${host}. Recarregue a pagina e confira VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY e CORS_ALLOW_ORIGIN nas Edge Functions.`,
      undefined,
      { cause: readableError(error), url: input },
    );
  }
}

export function normalizeLogin(login: string) {
  return login.includes("@") ? login : `${login}@myinc.local`;
}

export async function signInWithPassword(
  login: string,
  password: string,
): Promise<SupabaseSession> {
  const { url, anonKey } = requireSupabaseEnv();
  const response = await fetchSupabase("Login", `${url}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: {
      apikey: anonKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ email: normalizeLogin(login), password }),
  });
  const data = await parseJson(response);
  if (!response.ok) {
    throw new SupabaseRestError(
      "Login inválido ou usuário ainda não criado no Supabase Auth.",
      response.status,
      data,
    );
  }
  return data as SupabaseSession;
}

export async function signOut(session: SupabaseSession) {
  const { url } = requireSupabaseEnv();
  await fetchSupabase("Logout", `${url}/auth/v1/logout`, {
    method: "POST",
    headers: getHeaders(session.access_token),
  });
}

export async function selectRows<T>(table: string, token: string, query = "select=*") {
  const { url } = requireSupabaseEnv();
  const response = await fetchSupabase(`Ler ${table}`, `${url}/rest/v1/${table}?${query}`, {
    headers: getHeaders(token),
  });
  const data = await parseJson(response);
  if (!response.ok) throw new SupabaseRestError(`Falha ao ler ${table}.`, response.status, data);
  return (data ?? []) as T[];
}

export async function upsertRows<T>(
  table: string,
  token: string,
  rows: Partial<T>[],
  onConflict?: string,
) {
  const { url } = requireSupabaseEnv();
  const query = onConflict ? `?on_conflict=${encodeURIComponent(onConflict)}` : "";
  const response = await fetchSupabase(`Salvar ${table}`, `${url}/rest/v1/${table}${query}`, {
    method: "POST",
    headers: { ...getHeaders(token), Prefer: "resolution=merge-duplicates,return=representation" },
    body: JSON.stringify(rows),
  });
  const data = await parseJson(response);
  if (!response.ok) throw new SupabaseRestError(`Falha ao salvar ${table}.`, response.status, data);
  return (data ?? []) as T[];
}

export async function insertRow<T>(table: string, token: string, row: Partial<T>) {
  const [created] = await upsertRows<T>(table, token, [row]);
  return created;
}

export async function patchRow<T>(table: string, token: string, id: string, patch: Partial<T>) {
  const { url } = requireSupabaseEnv();
  const response = await fetchSupabase(
    `Atualizar ${table}`,
    `${url}/rest/v1/${table}?id=eq.${encodeURIComponent(id)}`,
    {
      method: "PATCH",
      headers: getHeaders(token),
      body: JSON.stringify(patch),
    },
  );
  const data = await parseJson(response);
  if (!response.ok)
    throw new SupabaseRestError(`Falha ao atualizar ${table}.`, response.status, data);
  return (Array.isArray(data) ? data[0] : data) as T;
}

export async function deleteRows(table: string, token: string, query: string) {
  const { url } = requireSupabaseEnv();
  const response = await fetchSupabase(`Excluir ${table}`, `${url}/rest/v1/${table}?${query}`, {
    method: "DELETE",
    headers: getHeaders(token, "return=minimal"),
  });
  const data = await parseJson(response);
  if (!response.ok)
    throw new SupabaseRestError(`Falha ao excluir ${table}.`, response.status, data);
  return true;
}

export async function callRpc<TResponse>(fn: string, token: string, payload?: object) {
  const { url } = requireSupabaseEnv();
  const response = await fetchSupabase(`RPC ${fn}`, `${url}/rest/v1/rpc/${fn}`, {
    method: "POST",
    headers: getHeaders(token),
    body: JSON.stringify(payload ?? {}),
  });
  const data = await parseJson(response);
  if (!response.ok) throw new SupabaseRestError(`RPC ${fn} retornou erro.`, response.status, data);
  return data as TResponse;
}

export async function callEdgeFunction<TResponse>(
  functionName: string,
  token: string,
  payload?: object,
) {
  const { url } = requireSupabaseEnv();
  const response = await fetchSupabase(
    `Funcao ${functionName}`,
    `${url}/functions/v1/${functionName}`,
    {
      method: "POST",
      headers: getFunctionHeaders(token),
      body: JSON.stringify(payload ?? {}),
    },
  );
  const data = await parseJson(response);
  if (!response.ok) {
    const detail = readableError(data);
    throw new SupabaseRestError(
      detail || `A função ${functionName} retornou erro.`,
      response.status,
      data,
    );
  }
  return data as TResponse;
}

export function createAdminUser(token: string, payload: AdminCreateUserPayload) {
  return callEdgeFunction<{ ok: true; userId: string }>("admin-users", token, payload);
}

export async function uploadStorageObject(bucket: string, path: string, token: string, file: File) {
  const { url, anonKey } = requireSupabaseEnv();
  const response = await fetchSupabase(
    `Upload ${bucket}`,
    `${url}/storage/v1/object/${bucket}/${path}`,
    {
      method: "POST",
      headers: {
        apikey: anonKey,
        Authorization: `Bearer ${token}`,
        "Content-Type": file.type || "application/octet-stream",
        "x-upsert": "false",
      },
      body: file,
    },
  );
  const data = await parseJson(response);
  if (!response.ok)
    throw new SupabaseRestError(`Falha ao enviar arquivo para ${bucket}.`, response.status, data);
  return { path, publicUrl: `${url}/storage/v1/object/public/${bucket}/${path}` };
}
