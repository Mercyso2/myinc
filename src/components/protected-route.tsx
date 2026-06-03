import { Navigate, useRouterState } from "@tanstack/react-router";
import { Loader2 } from "lucide-react";
import { useAuth } from "@/lib/auth";

export function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoading, isAdmin } = useAuth();
  const pathname = useRouterState({ select: (state) => state.location.pathname });

  if (pathname === "/login") return <>{children}</>;

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background text-muted-foreground">
        <Loader2 className="mr-2 h-4 w-4 animate-spin text-primary" />
        Validando sessão...
      </div>
    );
  }

  if (!isAuthenticated) return <Navigate to="/login" search={{ redirect: pathname }} />;

  if (pathname.startsWith("/admin") && !isAdmin) {
    return (
      <div className="mx-auto max-w-xl rounded-3xl border border-destructive/25 bg-destructive/10 p-6 text-destructive shadow-soft">
        Painel ADM restrito a usuários administradores. Faça login com um perfil admin.
      </div>
    );
  }

  return <>{children}</>;
}
