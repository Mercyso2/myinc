import process from "node:process";

// Server-only config. The .server.ts suffix prevents Vite from bundling
// this file into the client — values here never reach the browser.
//
// On Cloudflare Workers, env binds at REQUEST time. Module-scope reads
// (e.g. `const x = process.env.X`) resolve to undefined — always read
// process.env INSIDE a function or handler.
//
// When to use which env-access pattern:
//   - .server.ts module (this file): server-only helpers reused across
//     handlers. Wrap reads in a function so they run per-request.
//   - inline process.env inside a createServerFn handler: one-off reads
//     not reused elsewhere.
//   - import.meta.env.VITE_FOO: PUBLIC config readable from both client
//     and server (analytics IDs, public URLs). Define in .env with the
//     VITE_ prefix. Never put secrets here — they ship to the browser.

export function getServerConfig() {
  return {
    nodeEnv: process.env.NODE_ENV,
    app: {
      version: process.env.APP_VERSION ?? "1.0.0",
      releaseChannel: process.env.APP_RELEASE_CHANNEL ?? "stable",
      environment: process.env.APP_ENV ?? process.env.NODE_ENV ?? "development",
    },
    openai: {
      apiKey: process.env.OPENAI_API_KEY,
      textModel: process.env.OPENAI_TEXT_MODEL ?? "gpt-4o",
      imageModel: process.env.OPENAI_IMAGE_MODEL ?? "gpt-image-1",
      imageGenerationApiUrl: process.env.IMAGE_GENERATION_API_URL,
      imageApiKey: process.env.IMAGE_API_KEY,
      useAiImages: process.env.USE_AI_IMAGES === "1",
      qualityAutoApproveScore: Number(process.env.QUALITY_AUTO_APPROVE_SCORE ?? 92),
    },
    meta: {
      graphVersion: process.env.META_GRAPH_VERSION ?? "v23.0",
      appId: process.env.META_APP_ID,
      appSecret: process.env.META_APP_SECRET,
      pageId: process.env.META_PAGE_ID,
      instagramBusinessId: process.env.META_INSTAGRAM_BUSINESS_ID,
      pageAccessToken: process.env.META_PAGE_ACCESS_TOKEN,
      facebookPageId: process.env.FACEBOOK_PAGE_ID,
    },
    media: {
      publicMediaBaseUrl: process.env.PUBLIC_MEDIA_BASE_URL,
    },
    database: {
      supabaseUrl: process.env.SUPABASE_URL,
      supabaseAnonKey: process.env.SUPABASE_ANON_KEY,
      supabaseServiceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY,
      databaseUrl: process.env.DATABASE_URL,
    },
    operations: {
      defaultTimezone: process.env.DEFAULT_TIMEZONE ?? "America/Sao_Paulo",
      publicationMode: process.env.DEFAULT_PUBLICATION_MODE ?? "semi_automatico",
      maxPostsPerDay: Number(process.env.MAX_POSTS_PER_DAY ?? 4),
    },
  };
}
