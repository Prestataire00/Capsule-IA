import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import { env } from '@/env.mjs';

// Décodage léger du payload JWT (claims custom 'role' + 'aal'). Pas de
// vérification de signature ici : la session est validée par getUser ci-dessus ;
// on ne lit ces claims que pour router. atob = compatible Edge runtime.
function decodeClaims(token: string | undefined): { role?: string; aal?: string } {
  if (!token) return {};
  try {
    const part = token.split('.')[1];
    if (!part) return {};
    const json = atob(part.replace(/-/g, '+').replace(/_/g, '/'));
    const p = JSON.parse(json) as { role?: string; aal?: string };
    return { role: p.role, aal: p.aal };
  } catch {
    return {};
  }
}

// Redirection d'enrôlement (flux MFA existant) + préfixes exemptés du gate :
// la page d'enrôlement elle-même (anti-lock-out), l'auth, et les pages publiques.
const MFA_ENROLL_PATH = '/parametres/securite';
const MFA_EXEMPT = ['/parametres/securite', '/login', '/auth', '/signer', '/questionnaire', '/inscription', '/espace'];

// Routes accessibles SANS session (le reste exige une connexion). Volontairement
// SANS '/parametres/securite' : cette page est protégée (≠ exemption MFA).
const PUBLIC_PREFIXES = ['/login', '/auth', '/signer', '/questionnaire', '/inscription', '/espace'];

export const updateSession = async (req: NextRequest) => {
  const res = NextResponse.next({ request: { headers: req.headers } });
  const supabase = createServerClient(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        get: (name: string) => req.cookies.get(name)?.value,
        set: (name: string, value: string, options: CookieOptions) => {
          res.cookies.set({ name, value, ...options });
        },
        remove: (name: string, options: CookieOptions) => {
          res.cookies.set({ name, value: '', ...options });
        },
      },
    },
  );
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // ── Gate d'authentification ──────────────────────────────────────────────
  // Un visiteur non connecté sur une route protégée est renvoyé vers /login.
  // Exemptés : assets, API (auth propre), et les routes publiques (login, auth,
  // signature/questionnaire/inscription par token, espace apprenant).
  {
    const path = req.nextUrl.pathname;
    const isPublic =
      path.startsWith('/_next') ||
      path.startsWith('/api') ||
      path === '/favicon.ico' ||
      PUBLIC_PREFIXES.some((p) => path === p || path.startsWith(`${p}/`));
    if (!user && !isPublic) {
      const url = req.nextUrl.clone();
      url.pathname = '/login';
      url.search = `?redirectedFrom=${encodeURIComponent(path)}`;
      return NextResponse.redirect(url);
    }
  }

  // ── Gate 2FA admin (4.1) — INERTE tant que ENFORCE_ADMIN_MFA !== 'true'. ──
  // Un admin/owner sans session AAL2 est redirigé vers le flux d'enrôlement
  // existant (/parametres/securite/mfa). Aucune incidence sur les autres rôles
  // ni le public. Activation manuelle par variable d'env après test.
  if (env.ENFORCE_ADMIN_MFA === 'true') {
    const path = req.nextUrl.pathname;
    const exempt =
      path.startsWith('/_next') ||
      path.startsWith('/api') ||
      MFA_EXEMPT.some((p) => path === p || path.startsWith(`${p}/`));
    if (!exempt) {
      const { data: { session } } = await supabase.auth.getSession();
      const { role, aal } = decodeClaims(session?.access_token);
      if ((role === 'owner' || role === 'admin') && aal !== 'aal2') {
        const url = req.nextUrl.clone();
        url.pathname = `${MFA_ENROLL_PATH}/mfa`;
        url.search = '';
        return NextResponse.redirect(url);
      }
    }
  }

  return res;
};
