import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { defaultBrandId, selectRows, signIn, supabaseConfigured } from "./api";
import type { AppUser, Session } from "./types";
const KEY = "myinc.session.v2";
type AuthContextValue = { session: Session | null; profile: AppUser | null; loading: boolean; isAuthenticated: boolean; isAdmin: boolean; login: (login: string, password: string) => Promise<void>; logout: () => void; };
const AuthContext = createContext<AuthContextValue | null>(null);
function readStored(): Session | null { try { const raw = localStorage.getItem(KEY); return raw ? (JSON.parse(raw) as Session) : null; } catch { localStorage.removeItem(KEY); return null; } }
function writeStored(session: Session | null) { if (session) localStorage.setItem(KEY, JSON.stringify(session)); else localStorage.removeItem(KEY); }
function localSession(login: string): Session { return { access_token: "local-dev-token", refresh_token: "local-dev-token", localOnly: true, user: { id: "local-rodrigo-admin", email: `${login}@myinc.local` } }; }
async function loadProfile(session: Session | null): Promise<AppUser | null> {
  if (!session) return null;
  if (session.localOnly) return { id: "local-rodrigo-admin", role: "admin", status: "active", brand_id: defaultBrandId() };
  const byAuth = await selectRows<AppUser>("app_users", session.access_token, `select=*&auth_user_id=eq.${encodeURIComponent(session.user.id)}&limit=1`).catch(() => []);
  if (byAuth[0]) return { ...byAuth[0], brand_id: byAuth[0].brand_id || defaultBrandId() };
  if (session.user.email) {
    const byEmail = await selectRows<AppUser>("app_users", session.access_token, `select=*&email=eq.${encodeURIComponent(session.user.email)}&limit=1`).catch(() => []);
    if (byEmail[0]) return { ...byEmail[0], brand_id: byEmail[0].brand_id || defaultBrandId() };
  }
  return { id: session.user.id, role: "user", status: "active", brand_id: defaultBrandId() };
}
export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<AppUser | null>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => { let mounted = true; const stored = readStored(); setSession(stored); loadProfile(stored).then((profile) => mounted && setProfile(profile)).finally(() => mounted && setLoading(false)); return () => { mounted = false; }; }, []);
  const value = useMemo<AuthContextValue>(() => ({ session, profile, loading, isAuthenticated: Boolean(session), isAdmin: profile?.role === "admin", async login(loginValue, password) { let next: Session; if (!supabaseConfigured && loginValue === "rodrigo" && password === "rodrigo") next = localSession(loginValue); else next = await signIn(loginValue, password); setSession(next); writeStored(next); setProfile(await loadProfile(next)); }, logout() { setSession(null); setProfile(null); writeStored(null); } }), [session, profile, loading]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
export function useAuth() { const value = useContext(AuthContext); if (!value) throw new Error("useAuth precisa estar dentro de AuthProvider"); return value; }
