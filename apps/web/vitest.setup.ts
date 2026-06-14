// Provides dummy values for the variables validated by `@/env.mjs` so that
// modules importing it (signed tokens, etc.) can load under Vitest. Individual
// tests may override these before their own dynamic imports.
const defaults: Record<string, string> = {
  NEXT_PUBLIC_SUPABASE_URL: 'http://localhost:54321',
  NEXT_PUBLIC_SUPABASE_ANON_KEY: 'test-anon-key',
  SUPABASE_SERVICE_ROLE_KEY: 'test-service-role-key',
  TOKEN_SIGNING_KEY: 'dGVzdC1zaWduaW5nLWtleS1iYXNlNjQtMzItY2hhcnM=',
  CRON_SECRET: 'test-cron-secret-at-least-32-characters-long',
  NODE_ENV: 'test',
};

for (const [key, value] of Object.entries(defaults)) {
  process.env[key] = process.env[key] ?? value;
}
