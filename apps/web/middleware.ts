import type { NextRequest } from 'next/server';
import { updateSession } from '@/shared/lib/supabase/middleware';

export const config = {
  // Exclut les internals Next, les webhooks/health/cron, ET les fichiers statiques de `public/`
  // (images, polices) : sinon le middleware redirige ces assets vers /login (requêtes sans cookie,
  // notamment le fetch interne de l'optimiseur /_next/image) → logo cassé partout.
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|api/webhooks|api/health|api/cron|.*\\.(?:png|jpe?g|gif|svg|ico|webp|avif|woff2?|ttf|otf)$).*)',
  ],
};

export const middleware = async (req: NextRequest) => {
  const res = await updateSession(req);
  res.headers.set('x-actor-ip', req.headers.get('x-forwarded-for')?.split(',')[0] ?? '');
  res.headers.set('x-actor-user-agent', req.headers.get('user-agent') ?? '');
  return res;
};
