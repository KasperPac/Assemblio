type Env = Partial<Record<string, string | undefined>>;

export function getSupabaseProjectRef(env: Env = process.env): string | null {
  const explicit = env.SUPABASE_PROJECT_REF?.trim();
  if (explicit) return explicit;

  const url = env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  if (!url) return null;

  try {
    const hostname = new URL(url).hostname;
    const suffix = ".supabase.co";
    if (!hostname.endsWith(suffix)) return null;
    return hostname.slice(0, -suffix.length) || null;
  } catch {
    return null;
  }
}
