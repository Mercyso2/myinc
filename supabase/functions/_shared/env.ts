export function env(name: string, fallback = ''): string {
  return Deno.env.get(name) ?? fallback;
}

export function envBool(name: string, fallback = false): boolean {
  const value = Deno.env.get(name);
  if (!value) return fallback;
  return ['1', 'true', 'yes', 'sim', 'on'].includes(value.toLowerCase());
}

export function envNumber(name: string, fallback: number): number {
  const value = Deno.env.get(name);
  if (!value) return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function requiredEnv(name: string): string {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`Secret/ENV obrigatório ausente: ${name}`);
  return value;
}

export function maskedEnv(name: string): { name: string; exists: boolean; preview: string | null } {
  const value = Deno.env.get(name);
  if (!value) return { name, exists: false, preview: null };
  if (value.length <= 8) return { name, exists: true, preview: '***' };
  return { name, exists: true, preview: `${value.slice(0, 4)}...${value.slice(-4)}` };
}

export function serviceRoleKey(): string {
  const legacy = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (legacy) return legacy;

  const secretKeys = Deno.env.get('SUPABASE_SECRET_KEYS');
  if (secretKeys) {
    try {
      const parsed = JSON.parse(secretKeys);
      if (parsed?.default) return parsed.default;
      const first = Object.values(parsed).find((v) => typeof v === 'string');
      if (first) return String(first);
    } catch (_error) {
      // Fallback below.
    }
  }

  throw new Error('Nenhuma chave admin encontrada. Configure SUPABASE_SERVICE_ROLE_KEY ou SUPABASE_SECRET_KEYS.');
}
