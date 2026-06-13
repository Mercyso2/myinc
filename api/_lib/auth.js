import { bearer, env } from "./env.js";
import { appProfileForUser, authUser } from "./supabase.js";

export async function requireUserOrSecret(req) {
  const token = bearer(req);
  const secret = env("CRON_SECRET");
  if (secret && token === secret) return { actor: "cron", user: null, profile: null };
  const user = await authUser(token);
  const profile = await appProfileForUser(user);
  if (profile && ["disabled", "inactive", "blocked"].includes(String(profile.status))) throw Object.assign(new Error("Usuário bloqueado/inativo."), { statusCode: 403 });
  return { actor: "user", user, profile };
}

export async function requireAdmin(req) {
  const auth = await requireUserOrSecret(req);
  if (auth.actor === "cron") return auth;
  if (auth.profile?.role !== "admin") throw Object.assign(new Error("Apenas administradores ativos podem executar esta ação."), { statusCode: 403 });
  return auth;
}
