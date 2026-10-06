// Audit de bout en bout des corrections du point Capsule IA (06/10/2026),
// contre la base Supabase LOCALE (supabase start) : on crée un organisme de
// test et l'on exerce le vrai code — alertes, évaluations de fin, factures,
// fusions, espace apprenant, groupes, replays, ajout au scan, conventions.
// Ne s'exécute qu'avec AUDIT_LOCAL=1 et une URL locale : jamais en production.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { writeFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const URL_LOCALE = 'http://127.0.0.1:54321';
const actif = process.env.AUDIT_LOCAL === '1';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Sb = SupabaseClient<any, any, any>;

describe.skipIf(!actif)('audit local des corrections', () => {
  let sb: Sb;
  const ids: Record<string, string> = {};
  const suffixe = randomUUID().slice(0, 8);
  const maintenant = new Date();

  beforeAll(async () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = URL_LOCALE;
    process.env.SUPABASE_SERVICE_ROLE_KEY = process.env.AUDIT_SERVICE_KEY ?? '';
    process.env.PUBLIC_APP_URL = 'https://capsule.test';
    delete process.env.RESEND_API_KEY;
    delete process.env.SMTP_HOST;
    sb = createClient(URL_LOCALE, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
    const app = () => sb.schema('app');
    const un = async <T,>(p: PromiseLike<{ data: T | null; error: { message: string } | null }>, quoi: string): Promise<T> => {
      const { data, error } = await p;
      if (error || !data) throw new Error(`${quoi} : ${error?.message ?? 'vide'}`);
      return data;
    };

    // Comptes : direction (Faouzi, Ismael) et gestion (Laurie).
    for (const [cle, nom] of [['faouzi', 'Faouzi Test'], ['isma', 'Ismael Test'], ['laurie', 'Laurie Test']] as const) {
      const email = `${cle}.${suffixe}@capsule.test`;
      const { data, error } = await sb.auth.admin.createUser({ email, password: `Mdp-${suffixe}-x1`, email_confirm: true });
      if (error || !data.user) throw new Error(`compte ${cle} : ${error?.message}`);
      ids[cle] = data.user.id;
      await app().from('profiles').upsert({ user_id: data.user.id, email, full_name: nom } as never, { onConflict: 'user_id' });
    }
    ids.org = (await un(app().from('organizations').insert({ name: `Capsule test ${suffixe}`, slug: `capsule-${suffixe}`, contact_email: `contact.${suffixe}@capsule.test` } as never).select('id').single(), 'organisme') as { id: string }).id;
    await un(
      app().from('members').insert([
        { organization_id: ids.org, user_id: ids.faouzi, role: 'owner' },
        { organization_id: ids.org, user_id: ids.isma, role: 'admin' },
        { organization_id: ids.org, user_id: ids.laurie, role: 'gestionnaire' },
      ] as never).select('id'),
      'membres',
    );
    ids.company = (await un(app().from('companies').insert({ organization_id: ids.org, name: 'FRANCE METIERS TEST', contact_email: `rh.${suffixe}@client.test` } as never).select('id').single(), 'entreprise') as { id: string }).id;
    ids.contact = (await un(app().from('contacts').insert({ organization_id: ids.org, company_id: ids.company, first_name: 'Rita', last_name: 'Référente', email: `rita.${suffixe}@client.test` } as never).select('id').single(), 'référent') as { id: string }).id;
    const learner = async (prenom: string, nom: string, email: string) =>
      (await un(app().from('learners').insert({ organization_id: ids.org, first_name: prenom, last_name: nom, email, company_id: ids.company } as never).select('id').single(), `stagiaire ${prenom}`) as { id: string }).id;
    ids.sarah = await learner('Sarah', 'Barnier', `sarah.${suffixe}@client.test`);
    ids.greg = await learner('Grégory', 'Allegrini', `greg.${suffixe}@client.test`);
    ids.sarahDoublon = await learner('SARAH', 'barnier', `s.barnier.${suffixe}@client.test`);
    ids.formation = (await un(app().from('formations').insert({ organization_id: ids.org, title: 'Acculturation IA test', code: `IA-${suffixe}`, slug: `ia-${suffixe}`, default_duration_hours: 7 } as never).select('id').single(), 'formation') as { id: string }).id;
    const jour = maintenant.toISOString().slice(0, 10);
    ids.dossier = (await un(
      app()
        .from('dossiers')
        .insert({
          organization_id: ids.org,
          reference: `DOS-T-${suffixe}`,
          learner_id: ids.sarah,
          company_id: ids.company,
          contact_id: ids.contact,
          formation_id: ids.formation,
          formation_snapshot: {},
          modality: 'presentiel',
          start_date: jour,
          end_date: jour,
          total_hours: 7,
          total_amount_cents: 400000,
        } as never)
        .select('id')
        .single(),
      'dossier',
    ) as { id: string }).id;
    for (const l of [ids.sarah, ids.greg, ids.sarahDoublon]) {
      await app().from('dossier_learners' as never).upsert({ dossier_id: ids.dossier, learner_id: l, organization_id: ids.org } as never, { onConflict: 'dossier_id,learner_id' });
    }
    // Séance qui se termine dans 20 minutes (la dernière du dossier), et une plus ancienne.
    const seance = async (debut: Date, fin: Date) =>
      (await un(app().from('sessions').insert({ organization_id: ids.org, dossier_id: ids.dossier, formation_id: ids.formation, starts_at: debut.toISOString(), ends_at: fin.toISOString(), modality: 'presentiel', title: 'Séance test' } as never).select('id').single(), 'séance') as { id: string }).id;
    ids.seance = await seance(new Date(maintenant.getTime() - 3 * 3600_000), new Date(maintenant.getTime() + 20 * 60_000));
    ids.seanceAncienne = await seance(new Date(maintenant.getTime() - 48 * 3600_000), new Date(maintenant.getTime() - 45 * 3600_000));
    for (const sid of [ids.seance, ids.seanceAncienne]) await sb.schema('app').rpc('materialize_session_participants', { p_session_id: sid } as never);
    // Deux fiches pour le même formateur.
    const formateur = async (email: string, prenom: string) =>
      (await un(app().from('trainers').insert({ organization_id: ids.org, first_name: prenom, last_name: 'Le Pennec', email } as never).select('id').single(), 'formateur') as { id: string }).id;
    ids.formateur = await formateur(`isma.perso.${suffixe}@x.test`, 'Ismaël');
    ids.formateurDoublon = await formateur(`isma.pro.${suffixe}@x.test`, 'Ismael');
    await app().from('session_trainers' as never).insert([
      { session_id: ids.seance, trainer_id: ids.formateur, organization_id: ids.org, is_lead: true },
      { session_id: ids.seance, trainer_id: ids.formateurDoublon, organization_id: ids.org, is_lead: false },
      { session_id: ids.seanceAncienne, trainer_id: ids.formateurDoublon, organization_id: ids.org, is_lead: true },
    ] as never);
  }, 120_000);

  // Pour le parcours des écrans qui suit : les identifiants et mots de passe de test.
  afterAll(() => {
    if (process.env.AUDIT_OUT) writeFileSync(process.env.AUDIT_OUT, JSON.stringify({ ids, suffixe, motDePasse: `Mdp-${suffixe}-x1` }));
  });

  it('1. alerte de la direction : Faouzi et Ismael, pas Laurie qui crée, une seule fois', async () => {
    const { alerterDirectionNouveauDossier } = await import('../features/dossier/alerte-nouveau-dossier');
    await alerterDirectionNouveauDossier(sb, ids.dossier!, ids.laurie!);
    await alerterDirectionNouveauDossier(sb, ids.dossier!, ids.laurie!);
    const { data } = await sb.schema('app').from('notifications').select('recipient_user_id').eq('template_code', 'dossier.created').eq('related_aggregate_id', ids.dossier!);
    const dest = ((data ?? []) as Array<{ recipient_user_id: string }>).map((n) => n.recipient_user_id).sort();
    expect(dest).toEqual([ids.faouzi!, ids.isma!].sort());
  });

  it('2. score du test de positionnement', async () => {
    const { ensureNeedsAnalysisTemplate } = await import('../features/questionnaire/needs-analysis');
    const templateId = await ensureNeedsAnalysisTemplate(sb, ids.org);
    const { data: a } = await sb.schema('app').from('questionnaire_assignments').insert({ organization_id: ids.org, template_id: templateId, dossier_id: ids.dossier, recipient_kind: 'learner', recipient_learner_id: ids.greg, token_hash: `t-${randomUUID()}`, status: 'completed' } as never).select('id').single();
    await sb.schema('app').from('questionnaire_responses').insert({ organization_id: ids.org, assignment_id: (a as { id: string }).id, template_id: templateId, dossier_id: ids.dossier, answers: { currentLevel: 3, objectives: 'Gagner du temps' } } as never);
    const { scoresPositionnement, cleStagiaire } = await import('../features/questionnaire/scores-positionnement');
    const scores = await scoresPositionnement(sb, [{ learnerId: ids.greg!, dossierId: ids.dossier! }]);
    expect(scores.get(cleStagiaire(ids.greg!, ids.dossier!))?.libelle).toBe('3/5 · Intermédiaire');
  });

  it('3. évaluations de fin 30 min avant la fin de la dernière séance', async () => {
    const { lancerEvaluationsDeFin } = await import('../features/questionnaire/evaluations-de-fin');
    const r = await lancerEvaluationsDeFin(sb, maintenant);
    expect(r.errors).toEqual([]);
    expect(r.seances).toBeGreaterThanOrEqual(1);
    const { data: log } = await sb.schema('app').from('email_log' as never).select('recipient, kind').eq('organization_id', ids.org!).eq('kind', 'evaluations_fin');
    expect(((log ?? []) as Array<{ recipient: string }>).some((l) => JSON.stringify(l).includes(`rita.${suffixe}@client.test`))).toBe(true);
    // La séance ancienne n'est pas la dernière : rien pour elle.
    const { dossiersDontCestLaDerniere } = await import('../features/questionnaire/evaluations-de-fin');
    const ancienne = { id: ids.seanceAncienne!, organization_id: ids.org!, ends_at: new Date(maintenant.getTime() - 45 * 3600_000).toISOString(), dossier_id: ids.dossier!, company_id: null, formation_id: ids.formation! };
    expect(await dossiersDontCestLaDerniere(sb, ancienne, [ids.dossier!])).toEqual([]);
  });

  it('4. satisfaction entreprise 24 h après, une seule assignation', async () => {
    const { envoyerSatisfactionEntreprises } = await import('../features/questionnaire/evaluations-de-fin');
    const plusTard = new Date(maintenant.getTime() + 30 * 3600_000);
    const r1 = await envoyerSatisfactionEntreprises(sb, plusTard);
    const r2 = await envoyerSatisfactionEntreprises(sb, plusTard);
    expect(r1.errors).toEqual([]);
    expect(r2.errors).toEqual([]);
    const { data } = await sb.schema('app').from('questionnaire_assignments').select('id').eq('dossier_id', ids.dossier!).eq('recipient_kind', 'company_rep');
    expect((data ?? []).length).toBe(1);
  });

  it('5. factures dans l’espace entreprise : statut et reste à payer', async () => {
    const hier = new Date(maintenant.getTime() - 86_400_000).toISOString().slice(0, 10);
    const { data: f } = await sb.schema('app').from('invoices').insert({ organization_id: ids.org, reference: `F-T-${suffixe}`, dossier_id: ids.dossier, company_id: ids.company, status: 'issued', issued_at: hier, due_at: hier, subtotal_cents: 100000, vat_cents: 0, total_cents: 100000, currency: 'EUR' } as never).select('id').single();
    await sb.schema('app').from('invoices').insert({ organization_id: ids.org, reference: `F-D-${suffixe}`, dossier_id: ids.dossier, company_id: ids.company, status: 'draft', subtotal_cents: 5, vat_cents: 0, total_cents: 5, currency: 'EUR' } as never);
    const paiement = await sb.schema('app').from('payments').insert({ organization_id: ids.org, invoice_id: (f as { id: string }).id, amount_cents: 40000, method: 'virement', paid_at: maintenant.toISOString() } as never);
    expect(paiement.error).toBeNull();
    const { facturesDuReferent, factureDuReferent } = await import('../features/espace-entreprise/load');
    const factures = await facturesDuReferent(ids.contact!, ids.org!);
    expect(factures.map((x) => x.reference)).toEqual([`F-T-${suffixe}`]);
    expect(factures[0]).toMatchObject({ statut: 'en_retard', resteCents: 60000 });
    expect(await factureDuReferent(randomUUID(), ids.org!, (f as { id: string }).id)).toBe(false);
  });

  it('6. l’espace apprenant ne liste que les documents communs, jamais la convention d’entreprise', async () => {
    const doc = (titre: string, kind: string, visible: boolean) => ({ organization_id: ids.org, dossier_id: ids.dossier, kind, title: titre, status: 'ready', visible_entreprise: visible, is_current: true });
    await sb.schema('app').from('documents').insert([doc('Note interne', 'autre', false), doc('Règlement', 'autre', true), doc('Convention', 'convention', true)] as never);
    const { data } = await sb.schema('app').rpc('get_apprenant_resources', { p_learner_id: ids.sarah } as never);
    const titres = ((data as { documents: Array<{ title: string }> }).documents ?? []).map((d) => d.title);
    expect(titres).toContain('Règlement');
    expect(titres).not.toContain('Note interne');
    expect(titres).not.toContain('Convention');
  });

  it('7. fusion de deux fiches formateur', async () => {
    const { error } = await sb.schema('app').rpc('fusionner_formateurs', { p_garde: ids.formateur, p_doublon: ids.formateurDoublon } as never);
    expect(error).toBeNull();
    const { data: st } = await sb.schema('app').from('session_trainers' as never).select('session_id, trainer_id').in('session_id', [ids.seance!, ids.seanceAncienne!]);
    const lignes = (st ?? []) as unknown as Array<{ session_id: string; trainer_id: string }>;
    expect(lignes.every((l) => l.trainer_id === ids.formateur)).toBe(true);
    expect(lignes.filter((l) => l.session_id === ids.seance).length).toBe(1);
    const { data: t } = await sb.schema('app').from('trainers').select('deleted_at').eq('id', ids.formateurDoublon!).single();
    expect((t as { deleted_at: string | null }).deleted_at).not.toBeNull();
  });

  it('8. fusion de deux fiches apprenant', async () => {
    const { error } = await sb.schema('app').rpc('fusionner_apprenants', { p_garde: ids.sarah, p_doublon: ids.sarahDoublon } as never);
    expect(error).toBeNull();
    const { data } = await sb.schema('app').from('dossier_learners' as never).select('learner_id').eq('dossier_id', ids.dossier!);
    const inscrits = ((data ?? []) as unknown as Array<{ learner_id: string }>).map((x) => x.learner_id);
    expect(inscrits).not.toContain(ids.sarahDoublon);
    expect(inscrits.filter((x) => x === ids.sarah).length).toBe(1);
  });

  it('9. replays : lien web seulement, visible dans l’espace entreprise', async () => {
    const { enregistrerReplay, replaysDesSeances } = await import('../features/sessions/replays-store');
    expect((await enregistrerReplay({ organizationId: ids.org!, sessionId: ids.seance!, url: 'javascript:alert(1)', titre: null, userId: null })).ok).toBe(false);
    expect((await enregistrerReplay({ organizationId: ids.org!, sessionId: ids.seance!, url: 'https://tldv.io/app/meetings/abc', titre: 'Matin', userId: null })).ok).toBe(true);
    expect((await replaysDesSeances([ids.seance!])).get(ids.seance!)?.[0]?.source).toBe('tldv');
    const { chargerEspaceEntreprise } = await import('../features/espace-entreprise/load');
    const espace = await chargerEspaceEntreprise(ids.contact!, ids.org!);
    expect(espace?.dossiers[0]?.replays.map((r) => r.titre)).toContain('Matin');
  });

  it('10. groupes d’une entreprise : un porteur et un seul', async () => {
    const ok = await sb.schema('app').from('dossier_groupes' as never).insert({ organization_id: ids.org, company_id: ids.company, nom: 'Groupe A' } as never);
    expect(ok.error).toBeNull();
    const ko = await sb.schema('app').from('dossier_groupes' as never).insert({ organization_id: ids.org, nom: 'Sans porteur' } as never);
    expect(ko.error?.code).toBe('23514');
  });

  it('11. ajout au scan : fiche créée, rattachée au dossier, inscrite à la séance', async () => {
    const { inscrireLeJourJ } = await import('../features/attendance/inscrire-jour-j');
    const r = await inscrireLeJourJ(sb as never, { sessionId: ids.seance!, organizationId: ids.org!, prenom: 'Nouveau', nom: 'Venu', email: null });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.dossierId).toBe(ids.dossier);
    const { data: p } = await sb.schema('app').from('session_participants').select('source').eq('session_id', ids.seance!).eq('learner_id', r.learnerId);
    expect((p ?? []).length).toBe(1);
  });

  it('12. une seule convention courante par dossier, quel que soit le chemin', async () => {
    const { persistGeneratedDocument } = await import('../features/documents/persist-document');
    const { cleConvention } = await import('../features/documents/convention-destinataire');
    for (const titre of ['Convention depuis le dossier', 'Convention depuis la séance']) {
      await persistGeneratedDocument(sb as never, { organizationId: ids.org!, dossierId: ids.dossier!, kind: 'convention', title: titre, bytes: new TextEncoder().encode(titre), generationInput: {}, sourceKey: cleConvention(ids.dossier!) });
    }
    const { data } = await sb.schema('app').from('documents').select('title').eq('dossier_id', ids.dossier!).eq('source_key', cleConvention(ids.dossier!)).eq('is_current', true);
    expect(((data ?? []) as Array<{ title: string }>).map((d) => d.title)).toEqual(['Convention depuis la séance']);
  });
});
