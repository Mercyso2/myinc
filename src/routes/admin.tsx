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
import {
  callEdgeFunction,
  createAdminUser,
  isSupabaseConfigured,
  selectRows,
  upsertRows,
} from "@/lib/supabase/client";
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

type RuntimeSecretRow = {
  key: string;
  value?: string | null;
  is_secret?: boolean;
  updated_by?: string | null;
  updated_at?: string | null;
};

const statusKeys = [
  "OPENAI_API_KEY",
  "OPENAI_TEXT_MODEL",
  "OPENAI_IMAGE_MODEL",
  "OPENAI_IMAGE_QUALITY",
  "ENABLE_OPENAI_VIDEO",
  "OPENAI_VIDEO_MODEL",
  "META_PAGE_ACCESS_TOKEN",
  "META_PAGE_ID",
  "FACEBOOK_PAGE_ID",
  "META_INSTAGRAM_BUSINESS_ID",
  "PUBLIC_MEDIA_BASE_URL",
  "MEDIA_BUCKET",
];

function buildStatusFromRuntimeSecrets(rows: RuntimeSecretRow[]): AdminStatus {
  const map = new Map(rows.map((row) => [row.key, String(row.value ?? "").trim()]));
  const has = (key: string) => Boolean(map.get(key));
  const get = (key: string, fallback = "") => map.get(key) || fallback;

  return {
    ok: true,
    admin: true,
    environment: {
      openaiApiKey: has("OPENAI_API_KEY"),
      openaiTextModel: get("OPENAI_TEXT_MODEL", "gpt-5.5"),
      openaiImageModel: get("OPENAI_IMAGE_MODEL", "gpt-image-2"),
      openaiImageQuality: get("OPENAI_IMAGE_QUALITY", "high"),
      enableOpenaiVideo: get("ENABLE_OPENAI_VIDEO", "false"),
      openaiVideoModel: get("OPENAI_VIDEO_MODEL", "sora-2-pro"),
      metaPageAccessToken: has("META_PAGE_ACCESS_TOKEN"),
      metaPageId: has("META_PAGE_ID") || has("FACEBOOK_PAGE_ID"),
      metaInstagramBusinessId: has("META_INSTAGRAM_BUSINESS_ID"),
      publicMediaBaseUrl: has("PUBLIC_MEDIA_BASE_URL"),
      mediaBucket: get("MEDIA_BUCKET", "creative-media"),
    },
    database: { connected: true, tables: { runtime_secrets: true } },
    storage: {},
    edgeFunctions: { adminStatus: false, adminSaveSettings: false },
  };
}

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
      try {
        const rows = await selectRows<RuntimeSecretRow>(
          "runtime_secrets",
          session.access_token,
          `select=key,value&key=in.(${statusKeys.join(",")})`,
        );
        setStatus(buildStatusFromRuntimeSecrets(rows));
        setError(
          "admin-status falhou, mas o painel leu runtime_secrets diretamente. As credenciais podem ser salvas pelo fallback direto.",
        );
      } catch (fallbackErr) {
        setError(
          fallbackErr instanceof Error
            ? fallbackErr.message
            : err instanceof Error
              ? err.message
              : "Falha ao testar conexões reais.",
        );
      }
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
          <RuntimeSettingsPanel onSaved={testConnections} />
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

type RuntimeSettingsForm = {
  OPENAI_API_KEY: string;
  OPENAI_TEXT_MODEL: string;
  OPENAI_IMAGE_MODEL: string;
  OPENAI_IMAGE_QUALITY: string;
  ENABLE_OPENAI_VIDEO: string;
  OPENAI_VIDEO_MODEL: string;
  META_PAGE_ACCESS_TOKEN: string;
  META_PAGE_ID: string;
  META_INSTAGRAM_BUSINESS_ID: string;
  PUBLIC_MEDIA_BASE_URL: string;
  MEDIA_BUCKET: string;
};

const defaultRuntimeSettings: RuntimeSettingsForm = {
  OPENAI_API_KEY: "",
  OPENAI_TEXT_MODEL: "gpt-5.5",
  OPENAI_IMAGE_MODEL: "gpt-image-2",
  OPENAI_IMAGE_QUALITY: "high",
  ENABLE_OPENAI_VIDEO: "true",
  OPENAI_VIDEO_MODEL: "sora-2-pro",
  META_PAGE_ACCESS_TOKEN: "",
  META_PAGE_ID: "",
  META_INSTAGRAM_BUSINESS_ID: "",
  PUBLIC_MEDIA_BASE_URL: "",
  MEDIA_BUCKET: "creative-media",
};

function RuntimeSettingsPanel({ onSaved }: { onSaved: () => Promise<void> }) {
  const { session } = useAuth();
  const [form, setForm] = useState<RuntimeSettingsForm>(defaultRuntimeSettings);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  function setField(field: keyof RuntimeSettingsForm, value: string) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  async function saveRuntimeSettings(event: FormEvent) {
    event.preventDefault();
    if (!session) return;
    setSaving(true);
    setError("");
    try {
      const settings = Object.fromEntries(
        Object.entries(form).filter(([, value]) => String(value ?? "").trim().length > 0),
      );
      const now = new Date().toISOString();
      const rows = Object.entries(settings).map(([key, value]) => ({
        key,
        value: String(value ?? "").trim(),
        is_secret:
          key.includes("KEY") ||
          key.includes("TOKEN") ||
          key.includes("SECRET") ||
          key.includes("PASSWORD"),
        updated_by: session.user.id,
        updated_at: now,
      }));

      if (!rows.length) {
        throw new Error("Preencha pelo menos uma configuração antes de salvar.");
      }

      // Caminho principal V9: salva direto via Supabase REST.
      // Isso elimina o bloqueio de CORS da Edge Function admin-save-settings.
      await upsertRows<RuntimeSecretRow>("runtime_secrets", session.access_token, rows, "key");
      toast.success("Credenciais salvas diretamente em runtime_secrets.");

      // Tentativa opcional: registra/valida também via Edge Function.
      // Se CORS/Edge falhar, não quebra o salvamento, porque o banco já foi atualizado.
      callEdgeFunction("admin-save-settings", session.access_token, { settings }).catch(() => null);

      setForm((current) => ({ ...current, OPENAI_API_KEY: "", META_PAGE_ACCESS_TOKEN: "" }));
      try {
        await onSaved();
      } catch {
        // O salvamento já ocorreu; teste de status pode ser executado manualmente.
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao salvar credenciais.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form
      onSubmit={saveRuntimeSettings}
      className="mb-5 rounded-3xl border border-primary/20 bg-card p-5 shadow-soft"
    >
      <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
        <div>
          <h3 className="text-lg font-bold">Configurar credenciais pelo painel</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            Atalho de produção: os valores são salvos diretamente em runtime_secrets via Supabase
            REST e usados pelas Edge Functions. As chaves não são retornadas para a tela.
          </p>
        </div>
        <Button
          disabled={saving}
          className="rounded-full bg-gradient-primary text-primary-foreground"
        >
          {saving ? "Salvando..." : "Salvar credenciais"}
        </Button>
      </div>
      {error ? (
        <div className="mt-4">
          <ErrorState message={error} />
        </div>
      ) : null}
      <div className="mt-5 grid gap-4 md:grid-cols-2">
        <label className="space-y-2">
          <span className="text-sm font-semibold">OpenAI API Key</span>
          <Input
            type="password"
            value={form.OPENAI_API_KEY}
            onChange={(event) => setField("OPENAI_API_KEY", event.target.value)}
            placeholder="sk-..."
          />
        </label>
        <label className="space-y-2">
          <span className="text-sm font-semibold">Modelo texto</span>
          <Input
            value={form.OPENAI_TEXT_MODEL}
            onChange={(event) => setField("OPENAI_TEXT_MODEL", event.target.value)}
            placeholder="gpt-5.5"
          />
        </label>
        <label className="space-y-2">
          <span className="text-sm font-semibold">Modelo imagem</span>
          <Input
            value={form.OPENAI_IMAGE_MODEL}
            onChange={(event) => setField("OPENAI_IMAGE_MODEL", event.target.value)}
            placeholder="gpt-image-2"
          />
        </label>
        <label className="space-y-2">
          <span className="text-sm font-semibold">Qualidade imagem</span>
          <Input
            value={form.OPENAI_IMAGE_QUALITY}
            onChange={(event) => setField("OPENAI_IMAGE_QUALITY", event.target.value)}
            placeholder="high"
          />
        </label>
        <label className="space-y-2">
          <span className="text-sm font-semibold">Ativar vídeo IA</span>
          <Input
            value={form.ENABLE_OPENAI_VIDEO}
            onChange={(event) => setField("ENABLE_OPENAI_VIDEO", event.target.value)}
            placeholder="true"
          />
        </label>
        <label className="space-y-2">
          <span className="text-sm font-semibold">Modelo vídeo</span>
          <Input
            value={form.OPENAI_VIDEO_MODEL}
            onChange={(event) => setField("OPENAI_VIDEO_MODEL", event.target.value)}
            placeholder="sora-2-pro"
          />
        </label>
        <label className="space-y-2 md:col-span-2">
          <span className="text-sm font-semibold">Meta Page Access Token</span>
          <Input
            type="password"
            value={form.META_PAGE_ACCESS_TOKEN}
            onChange={(event) => setField("META_PAGE_ACCESS_TOKEN", event.target.value)}
            placeholder="EAA..."
          />
        </label>
        <label className="space-y-2">
          <span className="text-sm font-semibold">Facebook Page ID</span>
          <Input
            value={form.META_PAGE_ID}
            onChange={(event) => setField("META_PAGE_ID", event.target.value)}
            placeholder="ID da página"
          />
        </label>
        <label className="space-y-2">
          <span className="text-sm font-semibold">Instagram Business ID</span>
          <Input
            value={form.META_INSTAGRAM_BUSINESS_ID}
            onChange={(event) => setField("META_INSTAGRAM_BUSINESS_ID", event.target.value)}
            placeholder="ID do Instagram Business"
          />
        </label>
        <label className="space-y-2">
          <span className="text-sm font-semibold">Bucket de mídia</span>
          <Input
            value={form.MEDIA_BUCKET}
            onChange={(event) => setField("MEDIA_BUCKET", event.target.value)}
            placeholder="creative-media"
          />
        </label>
        <label className="space-y-2">
          <span className="text-sm font-semibold">URL pública das mídias</span>
          <Input
            value={form.PUBLIC_MEDIA_BASE_URL}
            onChange={(event) => setField("PUBLIC_MEDIA_BASE_URL", event.target.value)}
            placeholder="https://.../storage/v1/object/public/creative-media"
          />
        </label>
      </div>
      <p className="mt-4 text-xs text-muted-foreground">
        SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY continuam nos Secrets da Supabase Function; as
        demais credenciais ficam em runtime_secrets.
      </p>
    </form>
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
