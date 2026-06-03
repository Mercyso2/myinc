import { useCallback, useEffect, useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ErrorState, LoadingState, PublishLogTable } from "@/components/social-components";
import { useAuth } from "@/lib/auth";
import { logRepository } from "@/lib/repositories/log-repository";
import type { SystemLog } from "@/lib/social-types";
import type { SystemLogRow } from "@/lib/supabase/types";

export const Route = createFileRoute("/logs")({
  head: () => ({ meta: [{ title: "Logs — MYINC" }] }),
  component: Logs,
});

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

function download(name: string, content: string, type: string) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = name;
  anchor.click();
  URL.revokeObjectURL(url);
}

function Logs() {
  const { session, isLocalFallback } = useAuth();
  const [logs, setLogs] = useState<SystemLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [moduleFilter, setModuleFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");

  const load = useCallback(
    async function load() {
      setLoading(true);
      setError("");
      try {
        if (isLocalFallback) {
          throw new Error(
            "Fallback local não carrega logs falsos. Configure Supabase para logs reais.",
          );
        }
        if (!session) throw new Error("Sessão expirada. Faça login novamente.");
        const rows = await logRepository.list(
          session.access_token,
          "select=*&order=created_at.desc&limit=500",
        );
        setLogs(rows.map(mapLog));
      } catch (err) {
        setError(err instanceof Error ? err.message : "Falha ao carregar logs reais.");
      } finally {
        setLoading(false);
      }
    },
    [isLocalFallback, session],
  );

  useEffect(() => {
    void load();
  }, [load]);

  const filtered = useMemo(
    () =>
      logs.filter((log) => {
        const text =
          `${log.module} ${log.status} ${log.friendlyMessage} ${log.technicalDetail}`.toLowerCase();
        return (
          text.includes(query.toLowerCase()) &&
          (!moduleFilter || log.module === moduleFilter) &&
          (!statusFilter || log.status === statusFilter)
        );
      }),
    [logs, moduleFilter, query, statusFilter],
  );

  return (
    <div className="mx-auto max-w-7xl space-y-7">
      <PageHeader
        title="Logs e Monitoramento"
        description="Histórico real de planejamento, IA, imagem, upload, Meta, banco, aprovações, exclusões, arquivamentos e ações humanas."
        actions={
          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={() =>
                download("logs-myinc.json", JSON.stringify(filtered, null, 2), "application/json")
              }
            >
              Exportar JSON
            </Button>
            <Button
              variant="outline"
              onClick={() =>
                download(
                  "logs-myinc.csv",
                  filtered
                    .map((l) => [l.date, l.module, l.status, l.friendlyMessage].join(","))
                    .join("\n"),
                  "text/csv",
                )
              }
            >
              Exportar CSV
            </Button>
            <Button
              className="bg-gradient-primary text-primary-foreground"
              onClick={() => void load()}
            >
              Atualizar logs
            </Button>
          </div>
        }
      />
      <div className="grid gap-3 rounded-3xl border border-border bg-card p-4 shadow-soft md:grid-cols-3">
        <Input
          placeholder="Buscar texto"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <Input
          placeholder="Filtrar módulo ex.: meta"
          value={moduleFilter}
          onChange={(e) => setModuleFilter(e.target.value)}
        />
        <Input
          placeholder="Filtrar status ex.: erro"
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
        />
      </div>
      {loading ? <LoadingState label="Carregando logs reais..." /> : null}
      {error ? <ErrorState message={error} /> : null}
      <PublishLogTable logs={filtered} />
    </div>
  );
}
