// `env.mjs` est un module JavaScript : sans déclaration, TypeScript le traite en
// `any` implicite et refuse chaque import sous `noImplicitAny`. C'était l'origine
// de 91 des 140 erreurs de typecheck relevées le 2026-08-30 (audit CAP-06) — soit
// autant de fichiers privés de toute vérification sur leur usage des variables
// d'environnement.
//
// Cette déclaration doit rester le reflet exact du schéma zod de `env.mjs` :
// requis = `string`, `.optional()` = `string | undefined`.
declare module '@/env.mjs' {
  export const env: {
    readonly NEXT_PUBLIC_SUPABASE_URL: string;
    readonly NEXT_PUBLIC_SUPABASE_ANON_KEY: string;
    readonly SUPABASE_SERVICE_ROLE_KEY: string;
    readonly TOKEN_SIGNING_KEY: string;
    readonly CRON_SECRET: string;
    readonly NODE_ENV: 'development' | 'test' | 'production';
    readonly RESEND_API_KEY?: string;
    readonly RESEND_WEBHOOK_SECRET?: string;
    readonly SMTP_HOST?: string;
    readonly SMTP_PORT?: string;
    readonly SMTP_USER?: string;
    readonly SMTP_PASS?: string;
    readonly ANTHROPIC_API_KEY?: string;
    readonly LEGIFRANCE_CLIENT_ID?: string;
    readonly LEGIFRANCE_CLIENT_SECRET?: string;
    readonly EMAIL_FROM?: string;
    readonly OF_NOTIFICATION_EMAIL?: string;
    readonly PUBLIC_APP_URL?: string;
    readonly GOOGLE_CLIENT_ID?: string;
    readonly GOOGLE_CLIENT_SECRET?: string;
    readonly ZOOM_API_KEY?: string;
    readonly ZOOM_API_SECRET?: string;
    readonly ZOOM_SECRETS_KEY?: string;
    readonly STRIPE_WEBHOOK_SECRET?: string;
    readonly ENFORCE_ADMIN_MFA?: string;
  };
}
