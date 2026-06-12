export const RUNTIME_KEYS = [
  "OPENAI_API_KEY",
  "OPENAI_TEXT_MODEL",
  "OPENAI_IMAGE_MODEL",
  "OPENAI_IMAGE_FALLBACK_MODELS",
  "OPENAI_IMAGE_QUALITY",
  "OPENAI_IMAGE_FORMAT",
  "OPENAI_IMAGE_SIZE_FEED",
  "OPENAI_IMAGE_SIZE_STORY",
  "OPENAI_IMAGE_SIZE_SQUARE",
  "OPENAI_IMAGE_SIZE_FACEBOOK",
  "ENABLE_OPENAI_VIDEO",
  "OPENAI_VIDEO_MODEL",
  "OPENAI_VIDEO_SIZE",
  "OPENAI_VIDEO_SECONDS",
  "OPENAI_VIDEO_POLL_TIMEOUT_SECONDS",
  "OPENAI_VIDEO_POLL_INTERVAL_SECONDS",
  "MOCK_AI_PROVIDER",
  "MOCK_META_PROVIDER",
  "CORS_ALLOW_ORIGIN",
  "META_GRAPH_VERSION",
  "META_PAGE_ACCESS_TOKEN",
  "META_PAGE_ID",
  "FACEBOOK_PAGE_ID",
  "META_INSTAGRAM_BUSINESS_ID",
  "MEDIA_BUCKET",
  "PUBLIC_MEDIA_BASE_URL",
  "ALLOW_LOCAL_PUBLISH_SIMULATION",
  "DEFAULT_TIMEZONE",
  "AI_STRICT_MODE",
  "QUEUE_PROCESS_ONE_AT_A_TIME",
  "QUEUE_MAX_TEXT_JOBS_PER_RUN",
  "QUEUE_MAX_IMAGE_JOBS_PER_RUN",
  "QUEUE_MAX_VIDEO_JOBS_PER_RUN",
  "QUEUE_MAX_ATTEMPTS",
  "QUEUE_BACKOFF_SECONDS",
  "MYINC_LIGHT_PROFILE_MODE",
] as const;

export type RuntimeKey = (typeof RUNTIME_KEYS)[number];
export type RuntimeConfig = Record<string, string | null>;

type SupabaseLike = {
  from: (table: string) => {
    select: (columns: string) => {
      in: (
        column: string,
        values: readonly string[],
      ) => Promise<{
        data: Array<{ key: string; value: string }> | null;
        error: { message?: string } | null;
      }>;
    };
  };
};

export function cfg(config: RuntimeConfig, key: string, fallback = "") {
  const value = config[key] ?? Deno.env.get(key) ?? fallback;
  return typeof value === "string" ? value.trim() : value;
}

export function getCorsHeaders(req: Request, runtime: RuntimeConfig = {}) {
  const configured = cfg(runtime, "CORS_ALLOW_ORIGIN", "*");
  const origin = req.headers.get("Origin")?.trim() ?? "";
  const allowed = configured
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  const configuredAllowsOrigin = allowed.includes("*") || allowed.includes(origin);

  // Edge Functions still validate JWT/permissions. Reflecting the browser origin prevents a stale
  // CORS_ALLOW_ORIGIN secret from blocking authenticated production calls after a domain change.
  const responseOrigin =
    origin && (configuredAllowsOrigin || origin.startsWith("https://"))
      ? origin
      : allowed[0] || "*";

  return {
    "Access-Control-Allow-Origin": responseOrigin,
    "Access-Control-Allow-Methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS",
    "Access-Control-Allow-Headers":
      req.headers.get("Access-Control-Request-Headers") ||
      "authorization, x-client-info, apikey, content-type, prefer, x-supabase-api-version",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin, Access-Control-Request-Headers",
  };
}

export function json(req: Request, body: unknown, status = 200, runtime: RuntimeConfig = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...getCorsHeaders(req, runtime),
      "Content-Type": "application/json",
    },
  });
}

export function options(req: Request, runtime: RuntimeConfig = {}) {
  return new Response("ok", {
    status: 200,
    headers: getCorsHeaders(req, runtime),
  });
}

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
    // A tabela pode ainda não existir. Nesse caso as Edge Functions usam Deno.env.
  }

  return config;
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

export function numberCfg(
  config: RuntimeConfig,
  key: string,
  fallback: number,
  min?: number,
  max?: number,
) {
  const raw = Number(cfg(config, key, String(fallback)));
  const value = Number.isFinite(raw) ? raw : fallback;
  const withMin = min === undefined ? value : Math.max(min, value);
  return max === undefined ? withMin : Math.min(max, withMin);
}

export function hasCfg(config: RuntimeConfig, key: string) {
  return Boolean(cfg(config, key));
}

export function publicRuntimeStatus(config: RuntimeConfig) {
  return {
    openaiApiKey: hasCfg(config, "OPENAI_API_KEY"),
    openaiTextModel: cfg(config, "OPENAI_TEXT_MODEL", "gpt-5.5"),
    openaiImageModel: cfg(config, "OPENAI_IMAGE_MODEL", "gpt-image-2"),
    openaiImageFallbackModels: cfg(
      config,
      "OPENAI_IMAGE_FALLBACK_MODELS",
      "gpt-image-1.5,gpt-image-1,gpt-image-1-mini",
    ),
    openaiImageQuality: cfg(config, "OPENAI_IMAGE_QUALITY", "high"),
    openaiImageSizeFeed: cfg(config, "OPENAI_IMAGE_SIZE_FEED", "1088x1360"),
    openaiImageSizeStory: cfg(config, "OPENAI_IMAGE_SIZE_STORY", "1088x1936"),
    enableOpenaiVideo: cfg(config, "ENABLE_OPENAI_VIDEO", "false"),
    openaiVideoModel: cfg(config, "OPENAI_VIDEO_MODEL", "sora-2-pro"),
    mockAiProvider: cfg(config, "MOCK_AI_PROVIDER", "false"),
    mockMetaProvider: cfg(config, "MOCK_META_PROVIDER", "false"),
    aiStrictMode: cfg(config, "AI_STRICT_MODE", "true"),
    queueProcessOneAtATime: cfg(config, "QUEUE_PROCESS_ONE_AT_A_TIME", "true"),
    queueMaxTextJobsPerRun: cfg(config, "QUEUE_MAX_TEXT_JOBS_PER_RUN", "1"),
    queueMaxImageJobsPerRun: cfg(config, "QUEUE_MAX_IMAGE_JOBS_PER_RUN", "1"),
    queueMaxVideoJobsPerRun: cfg(config, "QUEUE_MAX_VIDEO_JOBS_PER_RUN", "1"),
    myincLightProfileMode: cfg(config, "MYINC_LIGHT_PROFILE_MODE", "true"),
    metaPageAccessToken: hasCfg(config, "META_PAGE_ACCESS_TOKEN"),
    metaPageId: hasCfg(config, "META_PAGE_ID") || hasCfg(config, "FACEBOOK_PAGE_ID"),
    metaInstagramBusinessId: hasCfg(config, "META_INSTAGRAM_BUSINESS_ID"),
    publicMediaBaseUrl: hasCfg(config, "PUBLIC_MEDIA_BASE_URL"),
    mediaBucket: cfg(config, "MEDIA_BUCKET", "creative-media"),
  };
}
