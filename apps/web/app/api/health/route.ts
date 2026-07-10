import 'server-only';
import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/shared/lib/supabase/admin';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

type CheckStatus = 'ok' | 'fail';
type Check = { name: string; status: CheckStatus; latency_ms: number; error?: string };

const HEALTH_TIMEOUT_MS = 2_000;

const withTimeout = async <T>(p: Promise<T>, ms: number, label: string): Promise<T> => {
  let timer: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([
      p,
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => reject(new Error(`${label}_timeout_${ms}ms`)), ms);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
};

const check = async (name: string, fn: () => Promise<void>): Promise<Check> => {
  const started = Date.now();
  try {
    await withTimeout(fn(), HEALTH_TIMEOUT_MS, name);
    return { name, status: 'ok', latency_ms: Date.now() - started };
  } catch (e) {
    return {
      name,
      status: 'fail',
      latency_ms: Date.now() - started,
      error: e instanceof Error ? e.message : 'unknown_error',
    };
  }
};

export async function GET() {
  const sb = supabaseAdmin();

  const checks = await Promise.all([
    check('db', async () => {
      // ping minimaliste : sélectionne 1 ligne sur une table système RLS-safe
      const { error } = await sb.schema('app').from('organizations').select('id').limit(1);
      if (error) throw new Error(error.message);
    }),
    check('auth', async () => {
      const { error } = await sb.auth.admin.listUsers({ perPage: 1, page: 1 });
      if (error) throw new Error(error.message);
    }),
    check('storage', async () => {
      const { error } = await sb.storage.listBuckets();
      if (error) throw new Error(error.message);
    }),
  ]);

  const allOk = checks.every((c) => c.status === 'ok');
  const body = {
    status: allOk ? 'ok' : 'degraded',
    timestamp: new Date().toISOString(),
    uptime_s: Math.floor(process.uptime()),
    checks,
  };

  // Le healthcheck Railway ne doit PAS mettre toute l'app hors ligne quand une
  // dépendance externe est dégradée (ex. projet Supabase en pause) : tant que le
  // process Node répond, on renvoie 200 ; le détail « degraded » reste dans le
  // corps pour le monitoring. Avant : 503 → déploiement jugé non sain par Railway
  // → « The train has not arrived at the station » = app entièrement inaccessible.
  return NextResponse.json(body, {
    status: 200,
    headers: { 'Cache-Control': 'no-store, max-age=0' },
  });
}
