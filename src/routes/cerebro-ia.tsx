import { useCallback, useEffect, useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Brain, Plus, RotateCcw, TestTube2 } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  EmptyState,
  ErrorState,
  LoadingState,
  PromptTemplateEditor,
  RuleEditor,
} from "@/components/social-components";
import { useAuth } from "@/lib/auth";
import { getFirstAccessibleBrand } from "@/lib/repositories/brand-repository";
import {
  aiBrainRuleRepository,
  aiPromptTemplateRepository,
  listActiveRules,
  type AIBrainRuleRow,
  type AIPromptTemplateRow,
} from "@/lib/repositories/ai-brain-repository";
import type { AIBrainRule, AIPromptTemplate } from "@/lib/social-types";

export const Route = createFileRoute("/cerebro-ia")({
  head: () => ({ meta: [{ title: "Cérebro da IA — MYINC" }] }),
  component: CerebroIA,
});

function mapRule(row: AIBrainRuleRow): AIBrainRule {
  return {
    id: row.id,
    name: row.name,
    category: row.category,
    content: row.content,
    active: row.active,
    priority: row.priority,
    defaultContent: row.default_content ?? row.content,
  } as AIBrainRule;
}

function mapPrompt(row: AIPromptTemplateRow): AIPromptTemplate {
  return {
    id: row.id,
    name: row.name,
    content: row.content,
    note: row.note ?? "",
    versions: Array.isArray(row.version_history) ? row.version_history.map((v) => String(v)) : [],
  };
}

function CerebroIA() {
  const { session, profile } = useAuth();
  const [brandId, setBrandId] = useState("");
  const [rules, setRules] = useState<AIBrainRule[]>([]);
  const [prompts, setPrompts] = useState<AIPromptTemplate[]>([]);
  const [samplePrompt, setSamplePrompt] = useState(
    "Carregue regras reais para montar o prompt mestre.",
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    if (!session) return;
    setLoading(true);
    setError("");
    try {
      const resolvedBrandId =
        profile?.brand_id ?? (await getFirstAccessibleBrand(session.access_token))?.id;
      if (!resolvedBrandId)
        throw new Error("Nenhuma marca encontrada para carregar o Cérebro da IA.");
      setBrandId(resolvedBrandId);
      const [ruleRows, promptRows] = await Promise.all([
        aiBrainRuleRepository.listByBrand(
          session.access_token,
          resolvedBrandId,
          "order=priority.asc",
        ),
        aiPromptTemplateRepository.listByBrand(
          session.access_token,
          resolvedBrandId,
          "order=created_at.desc",
        ),
      ]);
      setRules(ruleRows.map(mapRule));
      setPrompts(promptRows.map(mapPrompt));
      setSamplePrompt(
        `REGRAS ATIVAS:\n${
          ruleRows
            .filter((r) => r.active)
            .map((r) => `- ${r.category}: ${r.content}`)
            .join("\n") || "Nenhuma regra ativa."
        }\n\nPROMPTS BASE:\n${promptRows.map((p) => `- ${p.name}: ${p.content}`).join("\n") || "Nenhum prompt base."}`,
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao carregar Cérebro da IA.");
    } finally {
      setLoading(false);
    }
  }, [profile?.brand_id, session]);

  useEffect(() => {
    void load();
  }, [load]);

  async function run(label: string, action: () => Promise<unknown>) {
    setLoading(true);
    setError("");
    try {
      await action();
      toast.success(label);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ação do Cérebro IA falhou.");
    } finally {
      setLoading(false);
    }
  }

  const qualityCriteria = useMemo(
    () => [
      "Força da copy",
      "Clareza da mensagem",
      "Potencial de conversão",
      "Qualidade do prompt visual",
      "Aderência à marca",
      "Criatividade",
      "Adequação ao canal",
      "Risco de erro visual",
      "Chance de parecer genérico",
    ],
    [],
  );

  async function createRule() {
    if (!session || !brandId) return;
    await run("Regra criada no Cérebro IA local.", () =>
      aiBrainRuleRepository.create(session.access_token, {
        brand_id: brandId,
        name: "Nova regra MYINC",
        category: "Qualidade",
        content: "Descreva a regra real da IA para melhorar os criativos da MYINC.",
        active: true,
        priority: 5,
      } as never),
    );
  }

  async function createPrompt() {
    if (!session || !brandId) return;
    await run("Prompt base criado e já disponível para o Cérebro IA.", () =>
      aiPromptTemplateRepository.create(session.access_token, {
        brand_id: brandId,
        name: "Novo prompt base MYINC",
        content:
          "Crie conteúdo premium para incorporadora/construtora MYINC. Use tom sofisticado, arquitetura, confiança, qualidade de vida, localização estratégica e CTA claro. Evite conteúdo genérico, promessas exageradas e excesso de texto na arte.",
        note: "Prompt base criado manualmente no modo local.",
        active: true,
        version_history: ["v1 criado manualmente"],
      } as Partial<AIPromptTemplateRow>),
    );
  }

  async function testPrompt() {
    if (!session || !brandId) return;
    setLoading(true);
    try {
      const active = await listActiveRules(session.access_token, brandId);
      const promptRows = await aiPromptTemplateRepository.listByBrand(
        session.access_token,
        brandId,
        "order=created_at.desc",
      );
      setSamplePrompt(
        `Prompt mestre validado com ${active.length} regras e ${promptRows.length} prompts base.\n\nREGRAS:\n${active.map((r) => `${r.category}: ${r.content}`).join("\n")}\n\nPROMPTS BASE:\n${promptRows.map((p) => `${p.name}: ${p.content}`).join("\n\n")}`,
      );
      toast.success("Prompt montado a partir do Cérebro IA local.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao testar prompt.");
    } finally {
      setLoading(false);
    }
  }

  async function saveRule(rule: AIBrainRule) {
    if (!session) return;
    await run("Regra salva.", () =>
      aiBrainRuleRepository.update(session.access_token, rule.id, {
        name: rule.name,
        content: rule.content,
        active: rule.active,
        priority: rule.priority,
      } as Partial<AIBrainRuleRow>),
    );
  }

  async function duplicateRule(rule: AIBrainRule) {
    if (!session || !brandId) return;
    await run("Regra duplicada como inativa.", () =>
      aiBrainRuleRepository.create(session.access_token, {
        brand_id: brandId,
        name: `${rule.name} cópia`,
        category: rule.category,
        content: rule.content,
        active: false,
        priority: rule.priority + 1,
      } as Partial<AIBrainRuleRow>),
    );
  }

  async function archiveRule(rule: AIBrainRule) {
    if (!session) return;
    await run("Regra arquivada e removida dos prompts.", () =>
      aiBrainRuleRepository.archive(session.access_token, rule.id, {
        active: false,
      } as Partial<AIBrainRuleRow>),
    );
  }

  async function savePrompt(prompt: AIPromptTemplate) {
    if (!session) return;
    await run("Prompt base salvo.", () =>
      aiPromptTemplateRepository.update(session.access_token, prompt.id, {
        name: prompt.name,
        note: prompt.note,
        content: prompt.content,
        active: true,
        version_history: [...prompt.versions, `editado em ${new Date().toLocaleString("pt-BR")}`],
      } as Partial<AIPromptTemplateRow>),
    );
  }

  async function duplicatePrompt(prompt: AIPromptTemplate) {
    if (!session || !brandId) return;
    await run("Prompt base duplicado.", () =>
      aiPromptTemplateRepository.create(session.access_token, {
        brand_id: brandId,
        name: `${prompt.name} cópia`,
        note: prompt.note,
        content: prompt.content,
        active: true,
        version_history: [...prompt.versions, "duplicado"],
      } as Partial<AIPromptTemplateRow>),
    );
  }

  async function archivePrompt(prompt: AIPromptTemplate) {
    if (!session) return;
    await run("Prompt base arquivado.", () =>
      aiPromptTemplateRepository.archive(session.access_token, prompt.id, {
        active: false,
      } as Partial<AIPromptTemplateRow>),
    );
  }

  async function deletePrompt(prompt: AIPromptTemplate) {
    if (!session) return;
    await run("Prompt base excluído definitivamente.", () =>
      aiPromptTemplateRepository.hardDelete(session.access_token, prompt.id),
    );
  }

  return (
    <div className="mx-auto max-w-7xl space-y-7">
      <PageHeader
        title="Cérebro da IA"
        description="Regras e prompts base locais usados pela produção, carrosséis, Reels, imagens e automação 100%."
        actions={
          <div className="flex flex-wrap gap-2">
            <Button
              className="rounded-full bg-gradient-primary text-primary-foreground"
              disabled={loading || !brandId}
              onClick={createRule}
            >
              <Plus className="h-4 w-4" />
              Nova regra
            </Button>
            <Button
              variant="outline"
              className="rounded-full"
              disabled={loading || !brandId}
              onClick={createPrompt}
            >
              <Plus className="h-4 w-4" />
              Novo prompt base
            </Button>
            <Button
              variant="outline"
              className="rounded-full"
              disabled
              title="Em breve: restaurar seed padrão completo."
            >
              <RotateCcw className="h-4 w-4" />
              Restaurar padrões
            </Button>
          </div>
        }
      />
      {loading ? <LoadingState label="Sincronizando Cérebro da IA local..." /> : null}
      {error ? <ErrorState message={error} /> : null}
      <div className="rounded-3xl border border-border bg-sidebar p-6 text-sidebar-foreground shadow-elevated">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-sidebar-primary">
              Prompt mestre automático
            </p>
            <h2 className="mt-2 text-2xl font-bold">
              O sistema une marca, regras, prompts base, biblioteca e feedback humano antes de
              chamar a IA.
            </h2>
            <p className="mt-2 max-w-3xl text-sm text-sidebar-foreground/65">
              A produção em massa e o botão Fazer tudo 100% automático usam este cérebro como base.
            </p>
          </div>
          <Button
            variant="secondary"
            className="rounded-full"
            disabled={loading || !brandId}
            onClick={testPrompt}
          >
            <TestTube2 className="h-4 w-4" />
            Testar prompt
          </Button>
        </div>
        <details className="mt-5 rounded-2xl bg-black/20 p-4">
          <summary className="cursor-pointer font-semibold text-sidebar-primary">
            Ver exemplo de prompt mestre
          </summary>
          <pre className="mt-4 max-h-80 whitespace-pre-wrap text-xs leading-relaxed text-sidebar-foreground/75">
            {samplePrompt}
          </pre>
        </details>
      </div>
      <Tabs defaultValue="regras" className="space-y-5">
        <TabsList className="flex h-auto flex-wrap justify-start rounded-2xl bg-muted p-1">
          <TabsTrigger value="regras">
            <Brain className="mr-2 h-4 w-4" />
            Regras ativas
          </TabsTrigger>
          <TabsTrigger value="prompts">Prompts Base da IA</TabsTrigger>
          <TabsTrigger value="qualidade">Score e feedback</TabsTrigger>
        </TabsList>
        <TabsContent value="regras">
          {rules.length ? (
            <RuleEditor
              rules={rules}
              onChange={saveRule}
              onDuplicate={duplicateRule}
              onArchive={archiveRule}
            />
          ) : (
            <EmptyState
              title="Nenhuma regra real"
              description="Crie uma regra para alimentar os prompts da IA."
            />
          )}
        </TabsContent>
        <TabsContent value="prompts">
          {prompts.length ? (
            <PromptTemplateEditor
              prompts={prompts}
              onChange={savePrompt}
              onDuplicate={duplicatePrompt}
              onArchive={archivePrompt}
              onDelete={deletePrompt}
            />
          ) : (
            <EmptyState
              title="Nenhum prompt base"
              description="Clique em Novo prompt base para versionar o comportamento da IA."
              action={
                <Button
                  className="bg-gradient-primary text-primary-foreground"
                  onClick={createPrompt}
                >
                  <Plus className="h-4 w-4" /> Criar primeiro prompt base
                </Button>
              }
            />
          )}
        </TabsContent>
        <TabsContent value="qualidade">
          <div className="grid gap-4 md:grid-cols-2">
            {qualityCriteria.map((criterion) => (
              <div
                key={criterion}
                className="rounded-3xl border border-border bg-card p-5 shadow-soft"
              >
                <h3 className="font-bold">{criterion}</h3>
                <p className="mt-2 text-sm text-muted-foreground">
                  Critério usado para avaliar se a produção está digna de incorporadora premium.
                </p>
                <Textarea
                  className="mt-4"
                  defaultValue={`Avaliar ${criterion.toLowerCase()} com nota de 0 a 100 e sugerir melhoria se ficar abaixo de 85.`}
                />
              </div>
            ))}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
