import type { supabaseServer } from './server';

/**
 * Type du client Supabase côté serveur, **par inférence**.
 *
 * `SupabaseClient<Database>` fige une arité de génériques qui a changé au fil des
 * versions de `supabase-js` : la forme retournée par `createServerClient` n'est
 * plus assignable à cette annotation, ce qui produisait une cascade d'erreurs de
 * typecheck sans le moindre défaut réel (audit CAP-06). Le type suit désormais la
 * fabrique et survivra aux montées de version.
 */
export type ServerSupabase = ReturnType<typeof supabaseServer>;
