// ARCHETYPE: command
// Proxy serveur de la recherche d'entreprises (API publique recherche-entreprises.api.gouv.fr).
// Évite le blocage CORS/CSP d'un fetch direct depuis le navigateur.
import { NextResponse, type NextRequest } from 'next/server';

export const dynamic = 'force-dynamic';

const UPSTREAM = 'https://recherche-entreprises.api.gouv.fr/search';

export async function GET(req: NextRequest): Promise<Response> {
  const q = req.nextUrl.searchParams.get('q')?.trim() ?? '';
  if (q.length < 3) return NextResponse.json({ results: [] });

  const perPage = req.nextUrl.searchParams.get('per_page') ?? '8';
  const url = `${UPSTREAM}?q=${encodeURIComponent(q)}&per_page=${encodeURIComponent(perPage)}`;

  try {
    const res = await fetch(url, {
      headers: { Accept: 'application/json' },
      // Cache léger côté serveur : les résultats SIRENE bougent peu.
      next: { revalidate: 3600 },
    });
    if (!res.ok) {
      return NextResponse.json({ results: [], error: `upstream_${res.status}` }, { status: 200 });
    }
    const data = await res.json();
    return NextResponse.json({ results: Array.isArray(data?.results) ? data.results : [] });
  } catch (e) {
    console.error('[sirene/search] upstream failed', e);
    return NextResponse.json({ results: [], error: 'upstream_unreachable' }, { status: 200 });
  }
}
