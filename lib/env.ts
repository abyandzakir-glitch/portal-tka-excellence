import { z } from "zod";

/**
 * Environment variables, validated lazily so `next build` and unit tests do
 * not require secrets. Server-only values must never be imported by client code.
 */
const publicSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.url(),
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: z.string().min(1),
});

const serverSchema = publicSchema.extend({
  /** Pooled connection (Supavisor, transaction mode) used by the app at runtime. */
  DATABASE_URL: z.string().min(1),
  /** Secret key for admin operations (inviting users). Server only. */
  SUPABASE_SECRET_KEY: z.string().min(1),
  ANTHROPIC_API_KEY: z.string().optional(),
  ANTHROPIC_MODEL: z.string().optional(),
});

export type ServerEnv = z.infer<typeof serverSchema>;

function format(error: z.ZodError) {
  return error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
}

export function publicEnv() {
  const parsed = publicSchema.safeParse({
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  });
  if (!parsed.success) throw new Error(`Konfigurasi .env.local belum lengkap: ${format(parsed.error)}`);
  return parsed.data;
}

let cached: ServerEnv | undefined;
export function serverEnv(): ServerEnv {
  if (cached) return cached;
  const parsed = serverSchema.safeParse(process.env);
  if (!parsed.success) throw new Error(`Konfigurasi .env.local belum lengkap: ${format(parsed.error)}`);
  cached = parsed.data;
  return cached;
}
