import { z } from 'zod';

const envSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
  TOKEN_SIGNING_KEY: z.string().min(32),
  RESEND_API_KEY: z.string().optional(),
  ANTHROPIC_API_KEY: z.string().optional(),
  LEGIFRANCE_CLIENT_ID: z.string().optional(),
  LEGIFRANCE_CLIENT_SECRET: z.string().optional(),
  EMAIL_FROM: z.string().email().optional(),
  OF_NOTIFICATION_EMAIL: z.string().email().optional(),
  PUBLIC_APP_URL: z.string().url().optional(),
  ZOOM_API_KEY: z.string().optional(),
  ZOOM_API_SECRET: z.string().optional(),
  ZOOM_SECRETS_KEY: z.string().optional(),
  STRIPE_WEBHOOK_SECRET: z.string().optional(),
  CRON_SECRET: z.string().min(32),
  // Gate 2FA admin (4.1) : enforcement OFF par défaut (variable absente).
  // Mettre 'true' une fois le flux d'enrôlement /securite testé en prod.
  ENFORCE_ADMIN_MFA: z.string().optional(),
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
});

const parsed = envSchema.safeParse(process.env);
if (!parsed.success) {
  console.error('❌ Invalid env:', parsed.error.flatten().fieldErrors);
  throw new Error('Invalid environment variables');
}

export const env = parsed.data;
