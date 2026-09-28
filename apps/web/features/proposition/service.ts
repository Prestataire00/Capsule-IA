import 'server-only';
// Produire une version de proposition, de bout en bout.
//
// Programme + demande + notes → proposition (IA) → contrôle du cadre → devis
// brouillon → document imprimable → historique de la demande. La version
// précédente est archivée, et son devis annulé : on ne laisse pas partir deux
// prix différents pour la même demande.

import type { SupabaseClient } from '@supabase/supabase-js';
import { setQuoteStatus } from '@/features/billing/quotes/quote-service';
import { wrapGeneratedHtml } from '@/features/documents/templates/wrap-generated-html';
import { resolveOrgVariables } from '@/features/documents/templates/resolve-org-variables';
import { controlerCadre, type ContenuProposition } from './contenu';
import { genererProposition, type ContexteProposition } from './generer-avec-ia';
import { propositionHtml } from './proposition-html';
import { creerDevisProposition, type ClientDemande } from './devis';

export const BUCKET_PROGRAMMES = 'prospect-documents';

export type VersionResultat =
  | { ok: true; propositionId: string; version: number; alertes: string[] }
  | { ok: false; erreur: string };

type Prospect = {
  id: string;
  organization_id: string;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  situation: string | null;
  company_name: string | null;
  company_siret: string | null;
  company_address: Record<string, string | null> | null;
  referent_name: string | null;
  referent_email: string | null;
  funder_kind: string | null;
  funder_kinds: string[] | null;
  formation_id: string | null;
  custom_formation_title: string | null;
  custom_formation_hours: number | null;
  custom_formation_price_cents: number | null;
  preferred_modality: string | null;
  preferred_start_date: string | null;
  employees_to_train: number | null;
  message: string | null;
  internal_notes: string | null;
  needs_analysis: unknown;
};

const adresse = (a: Record<string, string | null> | null): string | null => {
  if (!a) return null;
  const s = [a.line1, a.line2, [a.postal_code, a.city].filter(Boolean).join(' ')].filter((x) => x && String(x).trim()).join(', ');
  return s || null;
};

const MESSAGES: Record<string, string> = {
  no_api_key: 'Clé Anthropic absente : la génération par IA n’est pas configurée.',
  refus: 'L’IA a décliné la demande. Reformulez les consignes ou vérifiez le programme.',
  tronque: 'La proposition était trop longue pour être rédigée d’un coup. Réessayez, ou raccourcissez les consignes.',
  echec: 'La génération a échoué. Réessayez dans un instant.',
};

async function chargerProspect(sb: SupabaseClient, prospectId: string): Promise<Prospect | null> {
  const { data } = await sb
    .schema('app')
    .from('prospects')
    .select(
      'id, organization_id, first_name, last_name, email, situation, company_name, company_siret, company_address, referent_name, referent_email, funder_kind, funder_kinds, formation_id, custom_formation_title, custom_formation_hours, custom_formation_price_cents, preferred_modality, preferred_start_date, employees_to_train, message, internal_notes, needs_analysis',
    )
    .eq('id', prospectId)
    .is('deleted_at', null)
    .maybeSingle();
  return (data as Prospect | null) ?? null;
}

async function contexte(sb: SupabaseClient, p: Prospect): Promise<ContexteProposition> {
  const [{ data: org }, { data: f }, { data: ev }] = await Promise.all([
    sb.schema('app').from('organizations').select('name, legal_name, address, declaration_activite, certifications').eq('id', p.organization_id).maybeSingle(),
    p.formation_id ? sb.schema('app').from('formations').select('title').eq('id', p.formation_id).maybeSingle() : Promise.resolve({ data: null }),
    sb
      .schema('app')
      .from('prospect_events')
      .select('payload, occurred_at')
      .eq('prospect_id', p.id)
      .eq('kind', 'comment')
      .order('occurred_at', { ascending: true }),
  ]);
  const o = (org ?? {}) as { name?: string; legal_name?: string | null; address?: { city?: string | null } | null; declaration_activite?: string | null; certifications?: string | null };
  // Les notes de suivi (appels, rendez-vous, e-mails) : c'est là que se
  // disent le tarif, l'effectif, les attentes du client.
  const notes = ((ev ?? []) as Array<{ payload: { text?: string; channel?: string; subject?: string } | null; occurred_at: string }>)
    .map((e) => {
      const t = [e.payload?.subject, e.payload?.text].filter(Boolean).join(' — ');
      return t ? `[${new Date(e.occurred_at).toLocaleDateString('fr-FR')}${e.payload?.channel ? `, ${e.payload.channel}` : ''}] ${t}` : null;
    })
    .filter((x): x is string => Boolean(x));
  if (p.internal_notes?.trim()) notes.unshift(p.internal_notes.trim());

  const besoin = p.needs_analysis && typeof p.needs_analysis === 'object' ? JSON.stringify(p.needs_analysis).slice(0, 4000) : null;
  return {
    organisme: {
      nom: o.name ?? 'Organisme de formation',
      raisonSociale: o.legal_name ?? null,
      ville: o.address?.city ?? null,
      nda: o.declaration_activite ?? null,
      certifications: o.certifications ?? null,
    },
    demande: {
      Demandeur: [p.first_name, p.last_name].filter(Boolean).join(' ') || null,
      Entreprise: p.company_name,
      Situation: p.situation,
      'Formation demandée': (f as { title?: string } | null)?.title ?? p.custom_formation_title,
      'Durée envisagée (h)': p.custom_formation_hours,
      'Prix indiqué (€ HT)': p.custom_formation_price_cents != null ? p.custom_formation_price_cents / 100 : null,
      'Modalité souhaitée': p.preferred_modality,
      'Début souhaité': p.preferred_start_date,
      'Salariés à former': p.employees_to_train,
      Financement: [p.funder_kind, ...(p.funder_kinds ?? [])].filter(Boolean).join(', ') || null,
      'Message du client': p.message,
      'Analyse du besoin': besoin,
    },
    notes,
  };
}

function clientDe(p: Prospect): ClientDemande {
  const entreprise = Boolean(p.company_name?.trim()) && p.situation !== 'particulier' && p.situation !== 'demandeur';
  const personne = [p.first_name, p.last_name].filter(Boolean).join(' ') || null;
  return {
    entreprise,
    nom: entreprise ? (p.company_name as string) : (personne ?? 'Client'),
    siret: entreprise ? p.company_siret : null,
    adresse: adresse(p.company_address),
    destinataireNom: entreprise ? (p.referent_name ?? personne) : personne,
    destinataireEmail: entreprise ? (p.referent_email ?? p.email) : p.email,
  };
}

export async function telechargerProgramme(sb: SupabaseClient, path: string): Promise<string | null> {
  const { data, error } = await sb.storage.from(BUCKET_PROGRAMMES).download(path);
  if (error || !data) {
    console.error('[proposition] programme illisible', path, error?.message);
    return null;
  }
  return Buffer.from(await data.arrayBuffer()).toString('base64');
}

/**
 * Crée la version suivante. `revision` absente = V1 (ou nouvelle base après
 * un nouveau programme) ; présente = V2, V3… à partir de la version active.
 */
export async function creerVersion(
  sb: SupabaseClient,
  args: {
    prospectId: string;
    userId: string | null;
    programmePath: string;
    programmeNom: string | null;
    revision?: { precedente: ContenuProposition; consignes: string };
  },
): Promise<VersionResultat> {
  const p = await chargerProspect(sb, args.prospectId);
  if (!p) return { ok: false, erreur: 'Demande introuvable.' };
  const pdf = await telechargerProgramme(sb, args.programmePath);
  if (!pdf) return { ok: false, erreur: 'Le programme déposé est illisible.' };

  const ctx = await contexte(sb, p);
  let r = await genererProposition(pdf, ctx, args.revision);
  if (!r.ok) return { ok: false, erreur: MESSAGES[r.raison] ?? MESSAGES.echec! };
  // Hors cadre (coaching, programme personnalisé…) : une correction ciblée,
  // puis on garde l'alerte si elle persiste — l'équipe tranche.
  let alertes = controlerCadre(r.contenu);
  if (alertes.length) {
    const corrige = await genererProposition(pdf, ctx, { precedente: r.contenu, consignes: args.revision?.consignes ?? 'Aucun autre changement.' }, alertes);
    if (corrige.ok) {
      r = corrige;
      alertes = controlerCadre(corrige.contenu);
    }
  }
  const contenu = r.contenu;

  const { data: derniere } = await sb
    .schema('app')
    .from('propositions')
    .select('id, version, quote_id, statut')
    .eq('prospect_id', p.id)
    .order('version', { ascending: false })
    .limit(1)
    .maybeSingle();
  const prec = derniere as { id: string; version: number; quote_id: string | null; statut: string } | null;
  if (prec?.statut === 'acceptee') return { ok: false, erreur: 'La proposition a déjà été acceptée : le client a signé.' };
  const version = (prec?.version ?? 0) + 1;

  // L'ancienne version s'archive avant que la nouvelle devienne active (une
  // seule active par demande), et son devis ne peut plus être signé.
  const { data: actives } = await sb
    .schema('app')
    .from('propositions')
    .select('id, quote_id')
    .eq('prospect_id', p.id)
    .eq('statut', 'active');
  for (const a of (actives ?? []) as Array<{ id: string; quote_id: string | null }>) {
    await sb.schema('app').from('propositions').update({ statut: 'archivee', updated_at: new Date().toISOString() } as never).eq('id', a.id);
    if (a.quote_id) await setQuoteStatus(sb, a.quote_id, p.organization_id, 'cancelled');
  }

  const devis = await creerDevisProposition(sb, {
    organizationId: p.organization_id,
    prospectId: p.id,
    formationId: p.formation_id,
    version,
    contenu,
    client: clientDe(p),
  });
  if (!devis.ok) console.error('[proposition] devis non créé', p.id, devis.erreur);

  const variables = await resolveOrgVariables(sb, p.organization_id);
  const html = wrapGeneratedHtml(propositionHtml(contenu, { version, organisme: variables['organisme_nom'] ?? '' }), variables);
  const { data: doc, error: dErr } = await sb
    .schema('app')
    .from('documents')
    .insert({
      organization_id: p.organization_id,
      dossier_id: null,
      kind: 'proposition',
      title: `Proposition V${version} — ${contenu.titre}`,
      status: 'ready',
      content_html: html,
      generated_at: new Date().toISOString(),
      generation_input: { prospect_id: p.id, version },
      metadata: { prospect_id: p.id, proposition_version: version },
    } as never)
    .select('id')
    .single();
  if (dErr) console.error('[proposition] document non créé', p.id, dErr.message);

  const { data: ins, error } = await sb
    .schema('app')
    .from('propositions')
    .insert({
      organization_id: p.organization_id,
      prospect_id: p.id,
      version,
      statut: 'active',
      contenu,
      consignes: args.revision?.consignes ?? null,
      programme_path: args.programmePath,
      programme_nom: args.programmeNom,
      quote_id: devis.ok ? devis.quoteId : null,
      document_id: (doc as { id: string } | null)?.id ?? null,
      alertes,
      created_by: args.userId,
    } as never)
    .select('id')
    .single();
  if (error || !ins) return { ok: false, erreur: `La proposition n’a pas pu être enregistrée : ${error?.message ?? 'erreur inconnue'}` };

  await sb.schema('app').from('prospect_events').insert({
    organization_id: p.organization_id,
    prospect_id: p.id,
    kind: 'proposition_generee',
    actor_user_id: args.userId,
    payload: { version, consignes: args.revision?.consignes ?? null, alertes: alertes.length },
  } as never);

  return { ok: true, propositionId: (ins as { id: string }).id, version, alertes };
}
