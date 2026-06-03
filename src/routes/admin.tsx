import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Database, Lock, RadioTower, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  ConnectionStatus,
  ErrorState,
  LoadingState,
  PublishLogTable,
} from "@/components/social-components";
import { ReleaseStatusCard } from "@/components/release-status";
import { useAuth } from "@/lib/auth";
import { callEdgeFunction, createAdminUser, isSupabaseConfigured } from "@/lib/supabase/client";
import { logRepository } from "@/lib/repositories/log-repository";
import type { SystemLog } from "@/lib/social-types";
import type { SystemLogRow } from "@/lib/supabase/types";

export const Route = createFileRoute("/admin")({
  head: () => ({ meta: [{ title: "Painel ADM — MYINC" }] }),
  component: Admin,
});

type AdminStatus = {
  ok: boolean;
  admin?: boolean;
  error?: string;
  environment?: Record<string, boolean | string | null>;
  database?: { connected: boolean; tables: Record<string, boolean> };
  storage?: Record<string, boolean>;
  edgeFunctions?: Record<string, boolean>;
};

function mapLog(row: SystemLogRow): SystemLog {
  return {
    id: row.id,
    date: new Date(row.created_at).toLocaleString("pt-BR"),
    type: row.module,
    user: row.user_id ?? "sistema",
    module: row.module,
    status: row.status,
    friendlyMessage: row.friendly_message,
    technicalDetail: row.technical_detail ?? "",
    postId: row.post_id ?? undefined,
  };
}

function Admin() {
  const { session } = useAuth();
  const [status, setStatus] = useState<AdminStatus | null>(null);
  const [logs, setLogs] = useState<SystemLog[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const requiredTables = useMemo(
    () => [
      "app_users",
      "brands",
      "brand_profiles",
      "posts",
      "monthly_plans",
      "post_ideas",
      "media_assets",
      "library_items",
      "publish_queue",
      "system_logs",
    ],
    [],
  );

  const loadLogs = useCallback(async () => {
    if (!session) return;
    const rows = await logRepository.list(
      session.access_token,
      "select=*&order=created_at.desc&limit=100",
    );
    setLogs(rows.map(mapLog));
  }, [session]);

  async function testConnections() {
    if (!session) return;
    setLoading(true);
    setError("");
    try {
      const result = await callEdgeFunction<AdminStatus>("admin-status", session.access_token, {});
      setStatus(result);
      await loadLogs();
      toast.success("Status real atualizado.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao testar conexões reais.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void testConnections();
  }, [session]);

  const env = status?.environment ?? {};
  const tables = status?.database?.tables ?? {};
  const storage = status?.storage ?? {};

  return (
    <div className="mx-auto max-w-7xl space-y-7">
      <PageHeader
        title="Painel ADM / Configurações Técnicas"
        description="Status real de Supabase, Edge Functions, OpenAI, Meta, Storage, tabelas, usuários e logs. Segredos nunca são exibidos."
        actions={
          <Button
            className="rounded-full bg-gradient-primary text-primary-foreground"
            disabled={loading}
            onClick={testConnections}
          >
            <ShieldCheck className="h-4 w-4" />
            Testar conexões reais
          </Button>
        }
      />
      {loading ? <LoadingState label="Testando backend real..." /> : null}
      {error ? <ErrorState message={error} /> : null}
      <div className="rounded-3xl border border-border bg-card p-5 shadow-soft">
        <div className="flex gap-3">
          <Lock className="h-5 w-5 text-primary" />
          <p className="text-sm text-muted-foreground">
            <b className="text-foreground">Segurança:</b> tokens não são expostos no frontend. O
            Painel ADM chama admin-status no backend e recebe apenas booleanos/modelos, nunca
            segredos.
          </p>
        </div>
      </div>
      <Tabs defaultValue="chaves" className="space-y-5">
        <TabsList className="flex h-auto flex-wrap justify-start rounded-2xl bg-muted p-1">
          <TabsTrigger value="chaves">Chaves e APIs</TabsTrigger>
          <TabsTrigger value="publicacao">Publicação Meta</TabsTrigger>
          <TabsTrigger value="banco">Banco de dados</TabsTrigger>
          <TabsTrigger value="usuarios">Usuários</TabsTrigger>
          <TabsTrigger value="logs">Logs</TabsTrigger>
          <TabsTrigger value="versao">Versão estável</TabsTrigger>
        </TabsList>
        <TabsContent value="chaves">
          <div className="grid gap-4 md:grid-cols-2">
            <ConnectionStatus
              label="Supabase frontend"
              status={isSupabaseConfigured ? "online" : "offline"}
              detail="VITE_SUPABASE_URL/ANON_KEY na Vercel."
            />
            <ConnectionStatus
              label="Supabase backend"
              status={status?.database?.connected ? "online" : "offline"}
              detail="admin-status respondeu usando service role no backend."
            />
            <ConnectionStatus
              label="OpenAI texto"
              status={env.openaiApiKey && env.openaiTextModel ? "online" : "offline"}
              detail={`Modelo: ${env.openaiTextModel ?? "não configurado"}`}
            />
            <ConnectionStatus
              label="OpenAI imagem"
              status={env.openaiApiKey && env.openaiImageModel ? "online" : "offline"}
              detail={`Modelo: ${env.openaiImageModel ?? "não configurado"}`}
            />
          </div>
        </TabsContent>
        <TabsContent value="publicacao">
          <div className="grid gap-4 md:grid-cols-2">
            <ConnectionStatus
              label="Meta token"
              status={env.metaPageAccessToken ? "online" : "offline"}
              detail="META_PAGE_ACCESS_TOKEN presente no backend."
            />
            <ConnectionStatus
              label="Instagram Business"
              status={env.metaInstagramBusinessId ? "online" : "offline"}
              detail="META_INSTAGRAM_BUSINESS_ID presente."
            />
            <ConnectionStatus
              label="Facebook Page"
              status={env.metaPageId ? "online" : "offline"}
              detail="META_PAGE_ID/FACEBOOK_PAGE_ID configurados."
            />
            <ConnectionStatus
              label="URL pública HTTPS"
              status={env.publicMediaBaseUrl ? "online" : "offline"}
              detail="PUBLIC_MEDIA_BASE_URL configurado."
            />
          </div>
          <div className="mt-5 rounded-3xl border border-border bg-card p-5 shadow-soft">
            <h3 className="font-bold">Modos de publicação</h3>
            <p className="mt-2 text-sm text-muted-foreground">
              Publicação automática total permanece desabilitada até ser ativada por configuração
              explícita no backend.
            </p>
            <div className="mt-4 grid gap-3 md:grid-cols-3">
              <Button variant="outline" disabled>
                Manual
              </Button>
              <Button className="bg-gradient-primary text-primary-foreground" disabled>
                Semi-automático
              </Button>
              <Button variant="outline" disabled>
                Automático total bloqueado
              </Button>
            </div>
          </div>
        </TabsContent>
        <TabsContent value="banco">
          <div className="grid gap-4 md:grid-cols-2">
            <ConnectionStatus
              label="Conexão Postgres"
              status={status?.database?.connected ? "online" : "offline"}
              detail="Teste head nas tabelas principais."
            />
            {Object.entries(storage).map(([bucket, ok]) => (
              <ConnectionStatus
                key={bucket}
                label={`Storage ${bucket}`}
                status={ok ? "online" : "offline"}
                detail={
                  bucket === "creative-media"
                    ? "Deve ser público para Meta acessar."
                    : "Bucket esperado."
                }
              />
            ))}
          </div>
          <div className="mt-5 rounded-3xl border border-border bg-card p-5 shadow-soft">
            <h3 className="flex items-center gap-2 font-bold">
              <Database className="h-4 w-4 text-primary" />
              Tabelas obrigatórias
            </h3>
            <div className="mt-4 flex flex-wrap gap-2">
              {requiredTables.map((table) => (
                <span
                  key={table}
                  className={`rounded-full border px-3 py-1 text-xs ${tables[table] ? "border-success/30 bg-success/10 text-success" : "border-destructive/30 bg-destructive/10 text-destructive"}`}
                >
                  {table}
                </span>
              ))}
            </div>
          </div>
        </TabsContent>
        <TabsContent value="usuarios">
          <AdminUsersPanel />
        </TabsContent>
        <TabsContent value="logs">
          <div className="mb-4 flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => void loadLogs()}>
              Atualizar logs
            </Button>
            <Button
              variant="outline"
              onClick={() => navigator.clipboard.writeText(JSON.stringify(logs, null, 2))}
            >
              Copiar JSON
            </Button>
            <Button variant="outline" disabled>
              Limpar logs antigos indisponível
            </Button>
          </div>
          <PublishLogTable logs={logs} />
        </TabsContent>
        <TabsContent value="versao">
          <ReleaseStatusCard />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function AdminUsersPanel() {
  const { session, isLocalFallback } = useAuth();
  const [email, setEmail] = useState("");
  const [fullName, setFullName] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<"admin" | "user">("user");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  async function submit(event: FormEvent) {
    event.preventDefault();
    setError("");
    if (!session || isLocalFallback) {
      setError("Faça login real no Supabase para criar usuários.");
      return;
    }
    setLoading(true);
    try {
      await createAdminUser(session.access_token, { email, password, fullName, role });
      toast.success("Usuário criado no Auth e app_users.");
      setEmail("");
      setFullName("");
      setPassword("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao criar usuário.");
    } finally {
      setLoading(false);
    }
  }
  return (
    <div className="rounded-3xl border border-border bg-card p-5 shadow-soft">
      <h3 className="text-lg font-bold">Adicionar usuário</h3>
      <p className="mt-1 text-sm text-muted-foreground">
        Criação real via Edge Function admin-users.
      </p>
      {error ? (
        <div className="mt-3">
          <ErrorState message={error} />
        </div>
      ) : null}
      <form onSubmit={submit} className="mt-5 grid gap-4 md:grid-cols-2">
        <label className="space-y-2">
          <span className="text-sm font-semibold">Nome</span>
          <Input value={fullName} onChange={(event) => setFullName(event.target.value)} required />
        </label>
        <label className="space-y-2">
          <span className="text-sm font-semibold">E-mail</span>
          <Input
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            required
          />
        </label>
        <label className="space-y-2">
          <span className="text-sm font-semibold">Senha inicial</span>
          <Input
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder="mínimo 6 caracteres"
          />
        </label>
        <label className="space-y-2">
          <span className="text-sm font-semibold">Perfil</span>
          <Select value={role} onValueChange={(value) => setRole(value as "admin" | "user")}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="user">Usuário</SelectItem>
              <SelectItem value="admin">Admin</SelectItem>
            </SelectContent>
          </Select>
        </label>
        <div className="md:col-span-2">
          <Button
            disabled={loading}
            className="rounded-full bg-gradient-primary text-primary-foreground"
          >
            {loading ? "Criando..." : `Criar usuário ${role}`}
          </Button>
        </div>
      </form>
    </div>
  );
}
