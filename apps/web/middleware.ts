import type { NextRequest } from 'next/server';
import { updateSession } from '@/shared/lib/supabase/middleware';

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|api/webhooks|api/health|api/cron).*)'],
};

export const middleware = async (req: NextRequest) => {
  const res = await updateSession(req);
  res.headers.set('x-actor-ip', req.headers.get('x-forwarded-for')?.split(',')[0] ?? '');
  res.headers.set('x-actor-user-agent', req.headers.get('user-agent') ?? '');
  return res;
};
