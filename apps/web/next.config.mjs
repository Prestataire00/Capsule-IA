/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  eslint: {
    // Remis en vigueur le 19/09/2026, les 25 violations restantes ayant été
    // corrigées. C'est le lint qui a révélé qu'une empreinte de preuve de
    // signature était calculée puis jetée (0183).
    ignoreDuringBuilds: false,
  },
  typescript: {
    // Le déploiement échoue désormais si le code ne compile pas. Il passait
    // auparavant quoi qu'il arrive : c'est ainsi qu'une régression de typage
    // est partie en production le 14/09/2026 (un composant client important un
    // module `server-only`). Les 13 erreurs qui subsistaient ont été corrigées
    // le 19/09/2026 ; `pnpm typecheck` doit rester à zéro.
    ignoreBuildErrors: false,
  },
  experimental: {
    serverActions: {
      bodySizeLimit: '5mb',
    },
  },
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '*.supabase.co',
      },
    ],
  },

  // ── Security headers (OWASP baseline) ──────────────────────────────────────
  // Documentation : https://owasp.org/www-project-secure-headers/
  async headers() {
    const supabaseHost = (() => {
      try {
        const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
        return url ? new URL(url).host : null;
      } catch {
        return null;
      }
    })();

    // CSP — démarrage strict mais compatible Next 14 App Router + Supabase.
    // 'unsafe-inline' sur style-src toléré (Tailwind inline) ; 'unsafe-inline'
    // sur script-src toléré tant que Next 14 inline ses scripts hydratation
    // (à durcir via nonce middleware en sprint dédié).
    const connectSrc = ["'self'", 'https://*.supabase.co', 'wss://*.supabase.co'];
    if (supabaseHost) {
      connectSrc.push(`https://${supabaseHost}`, `wss://${supabaseHost}`);
    }

    const csp = [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob: https://*.supabase.co",
      "font-src 'self' data:",
      `connect-src ${connectSrc.join(' ')}`,
      "frame-ancestors 'none'",
      "form-action 'self'",
      "base-uri 'self'",
      "object-src 'none'",
      'upgrade-insecure-requests',
    ].join('; ');

    const securityHeaders = [
      { key: 'Content-Security-Policy', value: csp },
      {
        key: 'Strict-Transport-Security',
        value: 'max-age=63072000; includeSubDomains; preload',
      },
      { key: 'X-Frame-Options', value: 'DENY' },
      { key: 'X-Content-Type-Options', value: 'nosniff' },
      { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
      {
        key: 'Permissions-Policy',
        value: 'camera=(), microphone=(), geolocation=(), interest-cohort=()',
      },
      { key: 'X-DNS-Prefetch-Control', value: 'on' },
    ];

    return [
      {
        source: '/:path*',
        headers: securityHeaders,
      },
    ];
  },
};

export default nextConfig;
