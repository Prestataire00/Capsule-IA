import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { env } from '@/env.mjs';
import { generateApprenantUrl } from '@/shared/lib/apprenant-token';
import { verifierSecretMachine } from '@/shared/lib/http/cron-auth';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const admin = () =>
  createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

/**
 * Ces deux points d'entrée écrivent des données fictives avec la clé service
 * role, et le GET énumère toutes les organisations de la plateforme. C'est un
 * outil de développement : il n'a rien à faire en production, où un secret
 * fuité suffirait à polluer la base d'un client réel.
 *
 * Secret en en-tête uniquement (jamais `?secret=`, qui finit dans les journaux).
 */
function indisponibleEnProduction(): NextResponse | null {
  if (env.NODE_ENV !== 'production') return null;
  return NextResponse.json({ error: 'not_available_in_production' }, { status: 404 });
}

// GET : liste les orgs existantes pour récupérer l'organization_id cible.
// Usage : curl -H "x-cron-secret: <CRON_SECRET>" …/api/admin/seed-demo
export async function GET(req: NextRequest) {
  const bloque = indisponibleEnProduction();
  if (bloque) return bloque;
  if (!verifierSecretMachine(req)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  const sb = admin();
  const { data, error } = await sb
    .schema('app')
    .from('organizations')
    .select('id, name, slug')
    .order('created_at', { ascending: true });
  if (error) {
    return NextResponse.json({ error: 'orgs_list_failed', details: error.message }, { status: 500 });
  }
  return NextResponse.json({ organizations: data ?? [] });
}

export async function POST(req: NextRequest) {
  const bloque = indisponibleEnProduction();
  if (bloque) return bloque;
  if (!verifierSecretMachine(req)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const sb = admin();

  // 1. Organization cible.
  // Si ?org=<uuid> fourni : on sème dans cette org existante (cas réel — l'org
  // doit correspondre au claim JWT de l'utilisateur pour que RLS rende visible).
  // Sinon : org "Démo" isolée (back-compat / smoke test).
  const targetOrgParam = req.nextUrl.searchParams.get('org');
  let orgId: string;
  let orgName: string;

  if (targetOrgParam) {
    const { data: targetOrg } = await sb
      .schema('app')
      .from('organizations')
      .select('id, name')
      .eq('id', targetOrgParam)
      .maybeSingle();
    if (!targetOrg) {
      return NextResponse.json({ error: 'org_not_found', details: targetOrgParam }, { status: 400 });
    }
    orgId = (targetOrg as { id: string }).id;
    orgName = (targetOrg as { name: string }).name;
  } else {
    const orgSlug = 'demo-formation-ia-infinity';
    const { data: existingOrg } = await sb
      .schema('app')
      .from('organizations')
      .select('id, name')
      .eq('slug', orgSlug)
      .maybeSingle();

    if (existingOrg) {
      orgId = (existingOrg as { id: string }).id;
      orgName = (existingOrg as { name: string }).name;
    } else {
      const { data: newOrg, error: orgErr } = await sb
        .schema('app')
        .from('organizations')
        .insert({
          slug: orgSlug,
          name: 'Démo Formation',
          legal_name: 'Démo Formation SAS',
          siret: '00000000000000',
          declaration_activite: '11 75 00000 75',
          contact_email: 'demo@i-a-infinity.com',
          contact_phone: '+33 1 23 45 67 89',
          address: { line1: '12 rue de la République', postal_code: '75011', city: 'Paris', country: 'France' },
        })
        .select('id, name')
        .single();
      if (orgErr || !newOrg) {
        return NextResponse.json({ error: 'org_create_failed', details: orgErr?.message }, { status: 500 });
      }
      orgId = (newOrg as { id: string }).id;
      orgName = (newOrg as { name: string }).name;
    }
  }

  // 2. Formation
  const { data: existingFormation } = await sb
    .schema('app')
    .from('formations')
    .select('id')
    .eq('organization_id', orgId)
    .eq('code', 'DEMO-COMPTA')
    .maybeSingle();

  let formationId: string;
  if (existingFormation) {
    formationId = (existingFormation as { id: string }).id;
  } else {
    const { data: newFormation, error: fErr } = await sb
      .schema('app')
      .from('formations')
      .insert({
        organization_id: orgId,
        code: 'DEMO-COMPTA',
        title: 'Comptabilité initiale pour TPE',
        slug: 'demo-compta-tpe',
        summary: 'Maîtriser les écritures de base et la TVA en 14 heures.',
        description: 'Formation pratique destinée aux entrepreneurs souhaitant tenir leur comptabilité au quotidien.',
        objectives: [
          'Comprendre le plan comptable général',
          'Saisir les écritures courantes',
          'Calculer et déclarer la TVA',
        ],
        prerequisites: ['Niveau Bac', 'Pas de prérequis comptable'],
        target_audience: 'Entrepreneurs, gérants TPE',
        evaluation_method: 'QCM final + cas pratique',
        pedagogical_method: 'Alternance théorie / exercices guidés',
        default_modality: 'presentiel',
        default_duration_hours: 14,
        default_price_cents: 90000,
        is_published: true,
      })
      .select('id')
      .single();
    if (fErr || !newFormation) {
      return NextResponse.json({ error: 'formation_create_failed', details: fErr?.message }, { status: 500 });
    }
    formationId = (newFormation as { id: string }).id;
  }

  // 3. Learner
  const learnerEmail = 'marie.curie+demo@i-a-infinity.com';
  const { data: existingLearner } = await sb
    .schema('app')
    .from('learners')
    .select('id, first_name, last_name, email')
    .eq('organization_id', orgId)
    .eq('email', learnerEmail)
    .maybeSingle();

  let learnerId: string;
  let learnerName: string;
  if (existingLearner) {
    const l = existingLearner as { id: string; first_name: string; last_name: string; email: string };
    learnerId = l.id;
    learnerName = `${l.first_name} ${l.last_name}`;
  } else {
    const { data: newLearner, error: lErr } = await sb
      .schema('app')
      .from('learners')
      .insert({
        organization_id: orgId,
        first_name: 'Marie',
        last_name: 'Curie',
        email: learnerEmail,
        phone: '+33 6 12 34 56 78',
        birth_date: '1995-06-15',
        address: { line1: '8 rue Pasteur', postal_code: '75015', city: 'Paris', country: 'France' },
      })
      .select('id, first_name, last_name')
      .single();
    if (lErr || !newLearner) {
      return NextResponse.json({ error: 'learner_create_failed', details: lErr?.message }, { status: 500 });
    }
    const l = newLearner as { id: string; first_name: string; last_name: string };
    learnerId = l.id;
    learnerName = `${l.first_name} ${l.last_name}`;
  }

  // 4. Dossier
  const year = new Date().getFullYear();
  const dossierRef = `DEMO-${year}-001`;
  const { data: existingDossier } = await sb
    .schema('app')
    .from('dossiers')
    .select('id, reference')
    .eq('organization_id', orgId)
    .eq('reference', dossierRef)
    .maybeSingle();

  let dossierId: string;
  if (existingDossier) {
    dossierId = (existingDossier as { id: string }).id;
  } else {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() + 7);
    const endDate = new Date(startDate);
    endDate.setDate(endDate.getDate() + 14);
    const { data: newDossier, error: dErr } = await sb
      .schema('app')
      .from('dossiers')
      .insert({
        organization_id: orgId,
        reference: dossierRef,
        learner_id: learnerId,
        formation_id: formationId,
        formation_snapshot: {
          title: 'Comptabilité initiale pour TPE',
          objectives: ['Plan comptable', 'Écritures', 'TVA'],
        },
        status: 'active',
        modality: 'presentiel',
        start_date: startDate.toISOString().slice(0, 10),
        end_date: endDate.toISOString().slice(0, 10),
        total_hours: 14,
        total_amount_cents: 90000,
        currency: 'EUR',
      })
      .select('id')
      .single();
    if (dErr || !newDossier) {
      return NextResponse.json({ error: 'dossier_create_failed', details: dErr?.message }, { status: 500 });
    }
    dossierId = (newDossier as { id: string }).id;
  }

  // 5. 2 sessions (J+7 matin, J+14 matin)
  const { data: existingSessions } = await sb
    .schema('app')
    .from('sessions')
    .select('id')
    .eq('dossier_id', dossierId);

  const sessions = (existingSessions ?? []) as { id: string }[];
  if (sessions.length === 0) {
    const start1 = new Date();
    start1.setDate(start1.getDate() + 7);
    start1.setHours(9, 0, 0, 0);
    const end1 = new Date(start1);
    end1.setHours(12, 30, 0, 0);

    const start2 = new Date(start1);
    start2.setDate(start2.getDate() + 7);
    const end2 = new Date(end1);
    end2.setDate(end2.getDate() + 7);

    const { data: sessionsCreated, error: sErr } = await sb
      .schema('app')
      .from('sessions')
      .insert([
        { organization_id: orgId, dossier_id: dossierId, title: 'Séance 1 — Plan comptable', modality: 'presentiel', status: 'planned', starts_at: start1.toISOString(), ends_at: end1.toISOString(), location: 'Salle Pasteur · 8 rue Pasteur, 75015 Paris' },
        { organization_id: orgId, dossier_id: dossierId, title: 'Séance 2 — TVA & cas pratiques', modality: 'presentiel', status: 'planned', starts_at: start2.toISOString(), ends_at: end2.toISOString(), location: 'Salle Pasteur · 8 rue Pasteur, 75015 Paris' },
      ])
      .select('id');

    if (sErr) {
      return NextResponse.json({ error: 'sessions_create_failed', details: sErr.message }, { status: 500 });
    }

    // session_participants : ajouter Marie comme apprenant à chaque session
    if (sessionsCreated && sessionsCreated.length > 0) {
      // Lien dossier ↔ session (lu par l'onglet Sessions et la carte Sessions).
      const sessionDossierRows = sessionsCreated.map((s) => ({
        session_id: (s as { id: string }).id,
        dossier_id: dossierId,
        organization_id: orgId,
      }));
      await sb.schema('app').from('session_dossiers').insert(sessionDossierRows);

      const participantRows = sessionsCreated.map((s) => ({
        session_id: (s as { id: string }).id,
        organization_id: orgId,
        participant_kind: 'learner',
        learner_id: learnerId,
        is_required: true,
      }));
      await sb.schema('app').from('session_participants').insert(participantRows);
    }
  }

  // 6. Génère l'URL apprenant
  if (!env.PUBLIC_APP_URL) {
    return NextResponse.json({ error: 'public_app_url_missing' }, { status: 500 });
  }
  const apprenantLink = await generateApprenantUrl(
    { learnerId, organizationId: orgId, dossierId },
    env.PUBLIC_APP_URL,
  );

  return NextResponse.json({
    ok: true,
    message: 'Démo seed créée. Toutes les ressources sont prêtes.',
    organization: { id: orgId, name: orgName },
    learner: { id: learnerId, name: learnerName, email: learnerEmail },
    dossier: { id: dossierId, reference: dossierRef },
    urls: {
      apprenant: apprenantLink.url,
      apprenantExpiresAt: apprenantLink.expiresAt.toISOString(),
      dossierDashboard: `${env.PUBLIC_APP_URL.replace(/\/$/, '')}/dossiers/${dossierId}`,
      emargementsList: `${env.PUBLIC_APP_URL.replace(/\/$/, '')}/dossiers/${dossierId}/emargements`,
      accesApprenantUI: `${env.PUBLIC_APP_URL.replace(/\/$/, '')}/dossiers/${dossierId}/acces-apprenant`,
      conventionPDF: `${env.PUBLIC_APP_URL.replace(/\/$/, '')}/api/dossiers/${dossierId}/convention.pdf`,
    },
  });
}
