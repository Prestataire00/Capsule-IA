import { NextResponse, type NextRequest } from 'next/server';
import { env } from '@/env.mjs';
import { supabaseServer } from '@/shared/lib/supabase/server';
import { accessibleSession } from '@/features/attendance/access';
import { issueAttendanceLink } from '@/features/attendance/issue-attendance-link';
import { loadSessionEmargement } from '@/features/attendance/queries/load-session-emargement';
import { renderQrCardsPdf, type QrCard } from '@/features/attendance/qr-cards-pdf';
import { loadOrgIdentity } from '@/features/documents/load-org-identity';
import { orgIdentityLines } from '@/features/documents/legal/org-identity';
import { renderQrPng } from '@/shared/lib/qr';

export const dynamic = 'force-dynamic';

/**
 * La planche s'ouvre dans un onglet : ce qui n'est pas un PDF doit donc rester
 * lisible en pleine page.
 *
 * Elle répondait en JSON brut — `{"error":"aucun_qr_a_imprimer"}` — y compris
 * dans le cas le plus banal : tout le monde a déjà signé, il n'y a rien à
 * imprimer. Un plein écran d'erreur pour une bonne nouvelle.
 */
function pageHtml(titre: string, message: string, retour: string | null, status: number): NextResponse {
  const html = `<!DOCTYPE html><html lang="fr"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${titre}</title>
<style>
  :root { color-scheme: light dark; }
  body { margin:0; min-height:100vh; display:grid; place-items:center; padding:24px;
         font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;
         background:#fafafa; color:#18181b; }
  .carte { max-width:420px; text-align:center; background:#fff; border:1px solid #e4e4e7;
           border-radius:14px; padding:28px 24px; box-shadow:0 1px 2px rgba(0,0,0,.05); }
  h1 { font-size:17px; font-weight:600; margin:0 0 8px; letter-spacing:-.01em; }
  p { font-size:14px; line-height:1.55; color:#52525b; margin:0; }
  a { display:inline-block; margin-top:18px; font-size:13px; font-weight:600;
      color:#ea580c; text-decoration:none; }
  a:hover { text-decoration:underline; }
  @media (prefers-color-scheme: dark) {
    body { background:#09090b; color:#fafafa; }
    .carte { background:#18181b; border-color:#27272a; }
    p { color:#a1a1aa; }
  }
</style></head><body><div class="carte">
<h1>${titre}</h1><p>${message}</p>
${retour ? `<a href="${retour}">Revenir à la feuille d’émargement</a>` : ''}
</div></body></html>`;
  return new NextResponse(html, {
    status,
    headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'private, no-store' },
  });
}

const HALF_DAY: Record<string, string> = { morning: 'Matin', afternoon: 'Après-midi', full: 'Journée', evening: 'Soirée' };
const jour = (iso: string) =>
  new Intl.DateTimeFormat('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'Europe/Paris' }).format(new Date(iso));

// Planche PDF des QR personnels d'une séance (ou d'une seule feuille, ?sheet=),
// pour les apprenants qui n'ont pas fini de signer. Réservée à l'équipe et au
// formateur de la séance.
export async function GET(req: NextRequest, { params }: { params: { sessionId: string } }) {
  const retour = `/sessions/${params.sessionId}/emargements`;

  if (!env.PUBLIC_APP_URL) {
    return pageHtml(
      'Adresse publique non configurée',
      'Les QR renvoient vers l’application : sans PUBLIC_APP_URL, le lien qu’ils porteraient ne mènerait nulle part. À renseigner dans la configuration du serveur.',
      null,
      500,
    );
  }

  const acces = await accessibleSession(params.sessionId);
  if (!acces.ok) {
    return acces.error === 'unauthenticated'
      ? pageHtml('Session expirée', 'Reconnectez-vous, puis rouvrez la planche de QR.', null, 401)
      : pageHtml('Séance inaccessible', 'Cette séance n’est pas la vôtre, ou votre rôle ne gère pas l’émargement.', null, 404);
  }

  const vue = await loadSessionEmargement(supabaseServer(), params.sessionId);
  if (!vue) return pageHtml('Séance introuvable', 'Cette séance n’existe plus.', null, 404);
  const seule = req.nextUrl.searchParams.get('sheet');

  const cards: QrCard[] = [];
  // « Personne à faire signer » et « personne d'inscrit » appellent deux gestes
  // différents : attendre, ou rattacher les stagiaires au dossier.
  let attendus = 0;
  for (const sheet of vue.sheets) {
    if (sheet.finalized || (seule && sheet.id !== seule)) continue;
    for (const p of sheet.participants) {
      if (p.kind === 'learner' && p.expected) attendus += 1;
      if (p.kind !== 'learner' || !p.expected || (p.state !== 'a_signer' && p.state !== 'entree_seule')) continue;
      const lien = await issueAttendanceLink({
        sheetId: sheet.id,
        signerId: p.id,
        signerKind: 'learner',
        baseUrl: env.PUBLIC_APP_URL,
        channel: 'equipe',
        issuedBy: acces.userId,
      });
      if (!lien.ok) continue;
      const png = await renderQrPng(lien.link.url, { width: 300 });
      cards.push({
        name: p.fullName,
        formationTitle: vue.session.title ?? 'Formation',
        slotLabel: `${jour(sheet.windowStart)} · ${HALF_DAY[sheet.halfDay] ?? 'Journée'}`,
        qrDataUrl: `data:image/png;base64,${png.toString('base64')}`,
      });
    }
  }
  // Rien à imprimer n'est pas une panne : c'est le plus souvent que tout le
  // monde a signé. Répondre 404 donnait un plein écran d'erreur pour une bonne
  // nouvelle — et laissait croire que la fonction était cassée.
  if (cards.length === 0) {
    const ou = seule ? 'cette demi-journée' : 'cette séance';
    return attendus === 0
      ? pageHtml(
          'Aucun stagiaire inscrit',
          `Aucun stagiaire n’est attendu sur ${ou}. Rattachez-les au dossier, puis revenez imprimer leurs QR.`,
          retour,
          200,
        )
      : pageHtml(
          'Tout le monde a signé',
          attendus === 1
            ? `Le seul stagiaire attendu sur ${ou} a déjà signé : il n’y a aucun QR à imprimer.`
            : `Les ${attendus} stagiaires attendus sur ${ou} ont déjà signé : il n’y a aucun QR à imprimer.`,
          retour,
          200,
        );
  }

  const identity = await loadOrgIdentity(supabaseServer() as never, acces.value.organization_id);
  const pdf = await renderQrCardsPdf(
    `Émargement — ${vue.session.title ?? 'Séance'} · ${jour(vue.session.startsAt)}`,
    cards,
    orgIdentityLines(identity),
  );
  return new NextResponse(new Uint8Array(pdf), {
    status: 200,
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="qr-emargement-${vue.session.startsAt.slice(0, 10)}.pdf"`,
      'Cache-Control': 'private, no-store',
    },
  });
}
