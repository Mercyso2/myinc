import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { toast } from "sonner";
import {
  isSupabaseConfigured,
  signInWithPassword,
  signOut,
  type SupabaseSession,
} from "@/lib/supabase/client";

const STORAGE_KEY = "myinc.supabase.session.v1";
const isProduction = import.meta.env.VITE_APP_ENV === "production";

interface LocalAdminSession extends SupabaseSession {
  localOnly?: true;
}

type AuthRole = "admin" | "editor" | "aprovador" | "viewer" | "user";

interface AuthProfile {
  id: string;
  role: AuthRole;
  brand_id?: string | null;
  status?: string | null;
}

interface AuthContextValue {
  session: SupabaseSession | null;
  profile: AuthProfile | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  isAdmin: boolean;
  isLocalFallback: boolean;
  login: (login: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

function readStoredSession() {
  if (typeof window === "undefined") return null;

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as SupabaseSession;
  } catch {
    window.localStorage.removeItem(STORAGE_KEY);
    return null;
  }
}

function writeStoredSession(session: SupabaseSession | null) {
  if (typeof window === "undefined") return;

  if (session) {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
  } else {
    window.localStorage.removeItem(STORAGE_KEY);
  }
}

function createLocalAdminSession(login: string): LocalAdminSession {
  return {
    localOnly: true,
    access_token: "local-admin-development-session",
    refresh_token: "local-admin-development-session",
    user: { id: "local-rodrigo-admin", email: `${login}@myinc.local` },
  };
}

function isActiveStatus(status?: string | null) {
  return !status || status === "active";
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<SupabaseSession | null>(null);
  const [profile, setProfile] = useState<AuthProfile | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const loadProfileForSession = useCallback(async (nextSession: SupabaseSession | null) => {
    if (!nextSession) {
      setProfile(null);
      return;
    }

    if ((nextSession as LocalAdminSession).localOnly) {
      setProfile({ id: "local-rodrigo-admin", role: "admin", status: "active" });
      return;
    }

    if (!isSupabaseConfigured) {
      setProfile({ id: nextSession.user.id, role: "user", status: "active" });
      return;
    }

    try {
      const { selectRows } = await import("@/lib/supabase/client");

      // Busca principal: vínculo correto pelo auth_user_id.
      let rows = await selectRows<AuthProfile>(
        "app_users",
        nextSession.access_token,
        `select=id,role,brand_id,status&auth_user_id=eq.${nextSession.user.id}&limit=1`,
      );

      // Fallback importante: se o auth_user_id ainda não estiver vinculado,
      // tenta achar pelo e-mail do usuário autenticado.
      if (!rows.length && nextSession.user.email) {
        rows = await selectRows<AuthProfile>(
          "app_users",
          nextSession.access_token,
          `select=id,role,brand_id,status&email=eq.${encodeURIComponent(nextSession.user.email)}&limit=1`,
        );
      }

      const nextProfile = rows[0];

      if (!nextProfile) {
        setProfile({ id: nextSession.user.id, role: "user", status: "active" });
        return;
      }

      if (!isActiveStatus(nextProfile.status)) {
        throw new Error("Usuário desativado, bloqueado ou sem status ativo.");
      }

      setProfile(nextProfile);
    } catch (err) {
      console.error("Falha ao carregar perfil app_users:", err);
      setProfile({ id: nextSession.user.id, role: "user", status: "active" });
    }
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function restoreSession() {
      const stored = readStoredSession();

      if (!stored) {
        if (!cancelled) {
          setSession(null);
          setProfile(null);
          setIsLoading(false);
        }
        return;
      }

      if (!cancelled) {
        setSession(stored);
      }

      await loadProfileForSession(stored);

      if (!cancelled) {
        setIsLoading(false);
      }
    }

    void restoreSession();

    return () => {
      cancelled = true;
    };
  }, [loadProfileForSession]);

  const value = useMemo<AuthContextValue>(
    () => ({
      session,
      profile,
      isLoading,
      isAuthenticated: Boolean(session),
      isAdmin: profile?.role === "admin",
      isLocalFallback: Boolean((session as LocalAdminSession | null)?.localOnly),

      async login(login, password) {
        if (isProduction && !isSupabaseConfigured) {
          throw new Error(
            "Supabase não configurado em produção. Defina VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY.",
          );
        }

        if (
          !isProduction &&
          !isSupabaseConfigured &&
          login === "rodrigo" &&
          password === "rodrigo"
        ) {
          const localSession = createLocalAdminSession(login);
          setSession(localSession);
          setProfile({ id: "local-rodrigo-admin", role: "admin", status: "active" });
          writeStoredSession(localSession);
          toast.warning(
            "Login local liberado. Configure Supabase para autenticação real em produção.",
          );
          return;
        }

        const nextSession = await signInWithPassword(login, password);
        setSession(nextSession);
        writeStoredSession(nextSession);
        await loadProfileForSession(nextSession);

        toast.success("Login realizado com segurança.");
      },

      async logout() {
        if (session && !(session as LocalAdminSession).localOnly && isSupabaseConfigured) {
          await signOut(session);
        }

        setSession(null);
        setProfile(null);
        writeStoredSession(null);
        toast.info("Sessão encerrada.");
      },
    }),
    [isLoading, loadProfileForSession, profile, session],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth deve ser usado dentro de AuthProvider");
  return context;
}
