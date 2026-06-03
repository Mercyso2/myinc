export const isProduction = import.meta.env.VITE_APP_ENV === "production";
export const isDemoMode =
  import.meta.env.VITE_DEMO_MODE === "true" || import.meta.env.DEMO_MODE === "true";

export function assertDemoAllowed() {
  if (isProduction && !isDemoMode) {
    throw new Error(
      "Dados mock bloqueados em produção. Configure Supabase ou ative DEMO_MODE=true explicitamente.",
    );
  }
}
