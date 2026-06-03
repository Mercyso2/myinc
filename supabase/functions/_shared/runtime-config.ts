export const RUNTIME_KEYS = [
  "OPENAI_API_KEY",
  "OPENAI_TEXT_MODEL",
  "OPENAI_IMAGE_MODEL",
  "OPENAI_IMAGE_FALLBACK_MODELS",
  "OPENAI_IMAGE_QUALITY",
  "OPENAI_IMAGE_FORMAT",
  "ENABLE_OPENAI_VIDEO",
  "OPENAI_VIDEO_MODEL",
  "OPENAI_VIDEO_SIZE",
  "OPENAI_VIDEO_SECONDS",
  "OPENAI_VIDEO_POLL_TIMEOUT_SECONDS",
  "OPENAI_VIDEO_POLL_INTERVAL_SECONDS",
  "META_GRAPH_VERSION",
  "META_PAGE_ACCESS_TOKEN",
  "META_PAGE_ID",
  "FACEBOOK_PAGE_ID",
  "META_INSTAGRAM_BUSINESS_ID",
  "MEDIA_BUCKET",
  "PUBLIC_MEDIA_BASE_URL",
  "ALLOW_LOCAL_PUBLISH_SIMULATION",
  "DEFAULT_TIMEZONE",
] as const;

export type RuntimeKey = (typeof RUNTIME_KEYS)[number];
export type RuntimeConfig = Record<string, string | null>;

type SupabaseLike = {
  from: (table: string) => {
    select: (columns: string) => {
      in: (column: string, values: readonly string[]) => Promise<{ data: Array<{ key: string; value: string }> | null; error: { message?: string } | null }>;
    };
  };
};

export async function loadRuntimeConfig(supabase: SupabaseLike): Promise<RuntimeConfig> {
  const config: RuntimeConfig = {};

  for (const key of RUNTIME_KEYS) {
    config[key] = Deno.env.get(key) ?? null;
  }

  try {
    const { data, error } = await supabase
      .from("runtime_secrets")
      .select("key,value")
      .in("key", RUNTIME_KEYS);

    if (!error && Array.isArray(data)) {
      for (const row of data) {
        if (row.key && row.value !== undefined && row.value !== null && String(row.value).trim()) {
          config[row.key] = String(row.value).trim();
        }
      }
    }
  } catch {
    // Table may not exist yet. Edge Functions still work with Deno.env fallbacks.
  }

  return config;
}

export function cfg(config: RuntimeConfig, key: string, fallback = "") {
  return config[key] ?? Deno.env.get(key) ?? fallback;
}

export function requiredCfg(config: RuntimeConfig, key: string, context = "Operação real") {
  const value = cfg(config, key);
  if (!value) throw new Error(`${key} ausente no painel/Secrets. ${context} não executada.`);
  return value;
}

export function boolCfg(config: RuntimeConfig, key: string, fallback = false) {
  const value = cfg(config, key);
  if (!value) return fallback;
  return ["1", "true", "yes", "sim", "on", "ativo", "enabled"].includes(value.toLowerCase());
}

export function hasCfg(config: RuntimeConfig, key: string) {
  return Boolean(cfg(config, key));
}

export function publicRuntimeStatus(config: RuntimeConfig) {
  return {
    openaiApiKey: hasCfg(config, "OPENAI_API_KEY"),
    openaiTextModel: cfg(config, "OPENAI_TEXT_MODEL", "gpt-4.1-mini"),
    openaiImageModel: cfg(config, "OPENAI_IMAGE_MODEL", "gpt-image-2"),
    openaiImageQuality: cfg(config, "OPENAI_IMAGE_QUALITY", "high"),
    enableOpenaiVideo: cfg(config, "ENABLE_OPENAI_VIDEO", "false"),
    openaiVideoModel: cfg(config, "OPENAI_VIDEO_MODEL", "sora-2-pro"),
    metaPageAccessToken: hasCfg(config, "META_PAGE_ACCESS_TOKEN"),
    metaPageId: hasCfg(config, "META_PAGE_ID") || hasCfg(config, "FACEBOOK_PAGE_ID"),
    metaInstagramBusinessId: hasCfg(config, "META_INSTAGRAM_BUSINESS_ID"),
    publicMediaBaseUrl: hasCfg(config, "PUBLIC_MEDIA_BASE_URL"),
    mediaBucket: cfg(config, "MEDIA_BUCKET", "creative-media"),
  };
}
