import { FormEvent, useState } from "react";
import { createFileRoute, useNavigate, useSearch } from "@tanstack/react-router";
import { Lock, LogIn, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { MyIncLogo } from "@/components/myinc-logo";
import { useAuth } from "@/lib/auth";
import { isSupabaseConfigured } from "@/lib/supabase/client";

export const Route = createFileRoute("/login")({
  head: () => ({ meta: [{ title: "Login — MYINC" }] }),
  component: LoginPage,
});

function LoginPage() {
  const [login, setLogin] = useState("rodrigo");
  const [password, setPassword] = useState("rodrigo");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const auth = useAuth();
  const navigate = useNavigate();
  const search = useSearch({ strict: false }) as { redirect?: string };

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError("");
    setLoading(true);
    try {
      await auth.login(login.trim(), password);
      await navigate({ to: search.redirect ?? "/" });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível entrar.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-[radial-gradient(circle_at_top,#ff6b2c22,transparent_36%),#09090b] px-4 py-10">
      <div className="w-full max-w-md rounded-[2rem] border border-white/10 bg-card/95 p-8 shadow-elevated backdrop-blur-xl">
        <div className="flex justify-center">
          <MyIncLogo variant="white" className="h-9" />
        </div>
        <div className="mt-8 text-center">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-primary">
            <ShieldCheck className="h-7 w-7" />
          </div>
          <h1 className="mt-5 text-2xl font-bold tracking-tight">Acesso administrativo</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Entre com o usuário inicial <b>rodrigo</b> e senha <b>rodrigo</b>. Em produção, crie
            rodrigo@myinc.local no Supabase Auth e altere a senha após o primeiro acesso.
          </p>
        </div>
        <form onSubmit={submit} className="mt-8 space-y-4">
          <label className="space-y-2">
            <span className="text-sm font-semibold">Usuário ou e-mail</span>
            <Input value={login} onChange={(event) => setLogin(event.target.value)} />
          </label>
          <label className="space-y-2">
            <span className="text-sm font-semibold">Senha</span>
            <Input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
          </label>
          {error && (
            <div className="rounded-2xl border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
              {error}
            </div>
          )}
          {!isSupabaseConfigured && (
            <div className="rounded-2xl border border-warning/30 bg-warning/10 p-3 text-sm text-warning">
              Supabase ainda não está configurado. O login rodrigo/rodrigo funciona apenas como
              bootstrap local para preparar a produção.
            </div>
          )}
          <Button
            type="submit"
            disabled={loading}
            className="w-full rounded-full bg-gradient-primary text-primary-foreground shadow-glow"
          >
            {loading ? <Lock className="h-4 w-4 animate-pulse" /> : <LogIn className="h-4 w-4" />}
            Entrar
          </Button>
        </form>
      </div>
    </div>
  );
}
