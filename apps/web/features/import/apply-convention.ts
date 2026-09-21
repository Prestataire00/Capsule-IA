import 'server-only';
import { randomUUID } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import { generateDossierReference } from '@/features/crm/prospect-conversion/dossier-reference';
import { slugify } from '@/features/formations/mapping';
import { DEFAULT_THEME, type Programme, type ProgrammeSection } from '@/features/formations/programme/types';
import { persistGeneratedDocument } from '@/features/documents/persist-document';
import { nettoyerHtmlDocument } from '@/shared/lib/html/sanitize-document-html';
import { parisIso } from './paris-time';
import type { ConventionImport, ImportFormation, ImportSummary } from './convention-types';

export type { ImportSummary };

/**
 * Le prompt d'extraction demande au modèle d'émettre du HTML, à partir d'un
 * document que nous n'écrivons pas. `normalizeImport` tronque et met en liste
 * blanche les valeurs, mais ne touche pas au balisage : c'est ici qu'on l'ôte
 * de ce qui pourrait s'exécuter chez un lecteur du catalogue public.
 */
function nettoyerFormationImportee(f: ImportFormation): ImportFormation {
  return {
    ...f,
    programContent: nettoyerHtmlDocument(f.programContent),
    pedagogicalMethod: nettoyerHtmlDocument(f.pedagogicalMethod),
    evaluationMethod: nettoyerHtmlDocument(f.evaluationMethod),
    accessibilityInfo: nettoyerHtmlDocument(f.accessibilityInfo),
    teachingTeam: nettoyerHtmlDocument(f.teachingTeam),
  };
}

/**
 * Création dans le CRM de ce qu'une convention contient : le client, la
 * formation sur mesure (avec son programme et ses modules), les séances aux
 * dates convenues, et la tâche de récupération de la liste nominative quand la
 * convention ne nomme pas les stagiaires.
 *
 * Aucun document financier n'est créé : le tarif lu est enregistré sur la
 * formation et les séances, le devis reste un acte volontaire.
 *
 * Idempotence : le client est réutilisé s'il existe (SIRET, sinon raison
 * sociale), les apprenants nommés aussi (e-mail, sinon nom complet). Les
 * formations et les séances, elles, sont créées à chaque import — relancer deux
 * fois le même fichier crée deux jeux de séances.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Client = SupabaseClient<any, any, any>;

const nettoieSiret = (v: string): string | null => {
  const chiffres = v.replace(/\D/g, '');
  return chiffres.length === 14 ? chiffres : null;
};

/** Code interne libre mais unique par organisme : on suffixe jusqu'à trouver. */
async function codeDisponible(sb: Client, organizationId: string, base: string): Promise<string> {
  const racine = (slugify(base) || 'formation').slice(0, 24);
  for (let i = 0; i < 20; i++) {
    const code = i === 0 ? racine : `${racine}-${i + 1}`;
    const { data } = await sb
      .schema('app')
      .from('formations')
      .select('id')
      .eq('organization_id', organizationId)
      .eq('code', code)
      .maybeSingle();
    if (!data) return code;
  }
  return `${racine}-${Date.now().toString(36)}`.slice(0, 40);
}

/** Programme imprimable depuis les modules lus : la fiche n'est pas qu'un résumé. */
function programmeDepuisImport(f: ImportFormation, orgName: string): Programme {
  const sections: ProgrammeSection[] = [];

  const infos: Array<{ label: string; value: string }> = [
    { label: 'Public cible', value: f.targetAudience },
    { label: 'Prérequis', value: f.prerequisites.join(' · ') },
    { label: 'Durée', value: f.durationHours ? `${f.durationHours} heures` : '' },
    { label: 'Délai d’accès', value: f.accessDelay },
  ].filter((r) => r.value.trim() !== '');
  if (infos.length > 0) {
    sections.push({ id: 'keyvalue-0', type: 'keyvalue', title: 'Informations générales', rows: infos });
  }

  if (f.objectives.length > 0) {
    sections.push({ id: 'bullets-1', type: 'bullets', title: 'Objectifs pédagogiques', items: f.objectives });
  }

  if (f.modules.length > 0) {
    sections.push({
      id: 'modules-2',
      type: 'modules',
      title: 'Détail du programme',
      overviewTitle: 'Vue d’ensemble',
      overview: f.modules.map((m, i) => ({
        code: m.code || `Module ${i + 1}`,
        title: m.title,
        durationLabel: m.durationLabel,
      })),
      totalLabel: 'Durée totale du programme',
      totalValue: f.durationHours ? `${f.durationHours} heures` : '',
      modules: f.modules.map((m, i) => ({
        code: m.code || `Module ${i + 1}`,
        title: m.title,
        durationLabel: m.durationLabel,
        submodules: [
          {
            code: m.code || `M${i + 1}`,
            title: m.title,
            durationLabel: m.durationLabel,
            contenu: m.contenu,
            objectifs: m.objectifs,
          },
        ],
      })),
    });
  }

  for (const [i, bloc] of [
    { title: 'Méthodes et moyens pédagogiques', html: f.pedagogicalMethod },
    { title: 'Modalités d’évaluation', html: f.evaluationMethod },
    { title: 'Accessibilité', html: f.accessibilityInfo },
    { title: 'Équipe pédagogique', html: f.teachingTeam },
  ].entries()) {
    if (bloc.html.trim() !== '') {
      sections.push({ id: `richtext-${3 + i}`, type: 'richtext', title: bloc.title, html: bloc.html });
    }
  }

  return {
    schemaVersion: 1,
    theme: DEFAULT_THEME,
    header: {
      logoUrl: '',
      kicker: 'Programme de formation',
      orgName,
      title: f.title,
      subtitle: f.subtitle,
      metaItems: [
        ...(f.durationHours ? [{ icon: 'clock' as const, text: `${f.durationHours} heures` }] : []),
        { icon: 'location' as const, text: f.modality === 'distanciel' ? 'Distanciel' : f.modality === 'hybride' ? 'Hybride' : 'Présentiel' },
      ],
    },
    sections,
    footer: { legalLine: orgName, lines: [], versionLine: '' },
  };
}

export async function applyConventionImport(
  sb: Client,
  args: {
    organizationId: string;
    userId: string;
    payload: ConventionImport;
    /** PDF d'origine, archivés comme documents de l'organisme. */
    pdfs?: ReadonlyArray<{ name: string; bytes: Uint8Array }>;
  },
): Promise<ImportSummary> {
  const { organizationId, userId, payload } = args;
  const resume: ImportSummary = {
    companyId: null,
    companyCreated: false,
    contactCreated: false,
    dossierId: null,
    dossierReference: null,
    formations: [],
    sessions: 0,
    learners: 0,
    funders: 0,
    trainers: 0,
    taskCreated: false,
    documents: 0,
    warnings: [],
  };

  const { data: orgRow } = await sb.schema('app').from('organizations').select('name').eq('id', organizationId).maybeSingle();
  const orgName = (orgRow as { name: string } | null)?.name ?? 'Organisme de formation';

  // ── Client ────────────────────────────────────────────────────────────────
  const siret = nettoieSiret(payload.client.siret);
  if (payload.client.name.trim() !== '' || siret) {
    let existante: { id: string } | null = null;
    if (siret) {
      const { data } = await sb
        .schema('app')
        .from('companies')
        .select('id')
        .eq('organization_id', organizationId)
        .eq('siret', siret)
        .is('deleted_at', null)
        .maybeSingle();
      existante = data as { id: string } | null;
    }
    if (!existante && payload.client.name.trim() !== '') {
      const { data } = await sb
        .schema('app')
        .from('companies')
        .select('id')
        .eq('organization_id', organizationId)
        .ilike('name', payload.client.name.trim())
        .is('deleted_at', null)
        .maybeSingle();
      existante = data as { id: string } | null;
    }

    if (existante) {
      resume.companyId = existante.id;
    } else {
      const { data, error } = await sb
        .schema('app')
        .from('companies')
        .insert({
          organization_id: organizationId,
          name: payload.client.name.trim() || payload.client.legalName.trim() || 'Client',
          legal_name: payload.client.legalName.trim() || null,
          siret,
          address: payload.client.address.trim() ? { line1: payload.client.address.trim() } : {},
          contact_email: payload.client.contactEmail || null,
          contact_phone: payload.client.contactPhone || null,
          notes: payload.notes || null,
          created_by: userId,
          updated_by: userId,
        } as never)
        .select('id')
        .single();
      if (error || !data) resume.warnings.push('Le client n’a pas pu être créé.');
      else {
        resume.companyId = (data as { id: string }).id;
        resume.companyCreated = true;
      }
    }
  } else {
    resume.warnings.push('Aucun client identifié dans les documents.');
  }

  // Représentant signataire → contact de l'entreprise, et référent du dossier
  // (destinataire de la convention, des devis et des factures).
  let contactId: string | null = null;
  if (resume.companyId && payload.client.representativeLastName.trim() !== '') {
    const { data: dejaLa } = await sb
      .schema('app')
      .from('contacts')
      .select('id')
      .eq('company_id', resume.companyId)
      .ilike('last_name', payload.client.representativeLastName.trim())
      .is('deleted_at', null)
      .maybeSingle();
    if (dejaLa) contactId = (dejaLa as { id: string }).id;
    else {
      const { data: cree, error } = await sb
        .schema('app')
        .from('contacts')
        .insert({
          organization_id: organizationId,
          company_id: resume.companyId,
          first_name: payload.client.representativeFirstName.trim() || '—',
          last_name: payload.client.representativeLastName.trim(),
          email: payload.client.contactEmail || null,
          phone: payload.client.contactPhone || null,
          position: payload.client.representativeRole.trim() || 'Représentant légal',
          is_primary: true,
        } as never)
        .select('id')
        .single();
      if (!error && cree) {
        contactId = (cree as { id: string }).id;
        resume.contactCreated = true;
      }
    }

    // Les documents existants (convention, devis, factures) s'adressent au
    // contact de la fiche entreprise : on le renseigne s'il est vide, pour que
    // le signataire soit destinataire même hors du chemin « référent ».
    if (contactId) {
      const nomReferent = `${payload.client.representativeFirstName} ${payload.client.representativeLastName}`.trim();
      const { data: entreprise } = await sb
        .schema('app')
        .from('companies')
        .select('contact_name, contact_email')
        .eq('id', resume.companyId)
        .maybeSingle();
      const actuel = entreprise as { contact_name: string | null; contact_email: string | null } | null;
      const maj: Record<string, unknown> = {};
      if (!actuel?.contact_name && nomReferent) maj.contact_name = nomReferent;
      if (!actuel?.contact_email && payload.client.contactEmail) maj.contact_email = payload.client.contactEmail;
      if (Object.keys(maj).length > 0) {
        await sb.schema('app').from('companies').update(maj as never).eq('id', resume.companyId);
      }
    }
  }

  // ── Formations sur mesure ─────────────────────────────────────────────────
  const nbParticipants = payload.participants.count && payload.participants.count > 0 ? payload.participants.count : null;

  // L'import ne déduit aucun montant : il enregistre ce que la convention dit,
  // rien d'autre (consigne d'Ismael). Le tarif y est global — un forfait de
  // groupe — et il est conservé tel quel sur le dossier et sur la fiche
  // (`priceEntrepriseCents`). Le tarif par stagiaire était auparavant calculé
  // en divisant ce forfait par l'effectif annoncé : un chiffre inventé, qui
  // s'affichait comme un tarif contractuel et sous-facturait dès qu'un
  // stagiaire manquait à l'appel (10 × 90 € = 900 €, au lieu des 1 440 €
  // signés). Tant que personne ne le renseigne, ce tarif reste à zéro.

  for (const brute of payload.formations) {
    if (brute.title.trim() === '') continue;
    // Ces champs sont du HTML produit par le modèle à partir d'un PDF fourni
    // par le client, et ils finissent sur la fiche publique du catalogue :
    // entrée non fiable. On nettoie une fois, avant toutes les écritures qui
    // suivent (description, metadata.catalog, programme imprimable).
    const f = nettoyerFormationImportee(brute);
    const code = await codeDisponible(sb, organizationId, f.title);
    const catalog = {
      subtitle: f.subtitle,
      programContent: f.programContent,
      pedagogicalMethod: f.pedagogicalMethod,
      accessibilityInfo: f.accessibilityInfo,
      accessDelay: f.accessDelay,
      teachingTeam: f.teachingTeam,
      effectifMax: nbParticipants,
      priceEntrepriseCents: payload.pricing.totalHtCents,
      priceMode: 'ht',
      importPricing: {
        totalHtCents: payload.pricing.totalHtCents,
        vatRate: payload.pricing.vatRate,
        paymentTerms: payload.pricing.paymentTerms,
      },
      importedFrom: 'convention',
      programme: programmeDepuisImport(f, orgName),
    };

    const ligne: Record<string, unknown> = {
      organization_id: organizationId,
      code,
      slug: slugify(code),
      title: f.title.trim(),
      summary: f.subtitle || null,
      description: f.programContent || null,
      objectives: f.objectives,
      prerequisites: f.prerequisites,
      target_audience: f.targetAudience || null,
      evaluation_method: f.evaluationMethod || null,
      pedagogical_method: f.pedagogicalMethod || null,
      default_modality: f.modality,
      default_duration_hours: Number(f.durationHours || 0) || 0,
      // Non renseigné : la convention donne un forfait, pas un prix unitaire.
      default_price_cents: 0,
      is_published: false,
      metadata: { catalog },
      created_by: userId,
      updated_by: userId,
    };
    // Formation rattachée au client (0162) ; si la colonne manque, on crée
    // quand même la formation, sans le lien.
    const avecClient = resume.companyId
      ? { ...ligne, client_kind: 'company', client_company_id: resume.companyId }
      : ligne;

    let creee: { id: string } | null = null;
    const premier = await sb.schema('app').from('formations').insert(avecClient as never).select('id').single();
    if (premier.error && resume.companyId) {
      const repli = await sb.schema('app').from('formations').insert(ligne as never).select('id').single();
      creee = (repli.data as { id: string } | null) ?? null;
      if (repli.error) resume.warnings.push(`Formation « ${f.title} » non créée : ${repli.error.message}`);
      else resume.warnings.push('Formations sur mesure indisponibles sur cette base : le lien au client n’a pas été posé.');
    } else {
      creee = (premier.data as { id: string } | null) ?? null;
      if (premier.error) resume.warnings.push(`Formation « ${f.title} » non créée : ${premier.error.message}`);
    }
    if (creee) resume.formations.push({ id: creee.id, title: f.title.trim() });
  }

  // Formation sur mesure : la convention n'annexe pas toujours son programme,
  // et beaucoup d'affaires intra n'en ont pas au moment de la signature. Le
  // dossier exige pourtant une formation (`formation_id NOT NULL`) : plutôt
  // que d'échouer — et de ne rien créer du tout — on en ouvre une au nom de
  // l'objet écrit dans la convention, hors catalogue, à compléter depuis le
  // dossier quand le programme sera écrit.
  let formationId = resume.formations[0]?.id ?? null;
  if (!formationId) {
    const titre = (payload.dossier.objective || '').trim() || `Formation sur mesure — ${payload.client.name.trim() || 'client'}`;
    const code = await codeDisponible(sb, organizationId, titre);
    const { data, error } = await sb
      .schema('app')
      .from('formations')
      .insert({
        organization_id: organizationId,
        code,
        slug: slugify(code),
        title: titre.slice(0, 200),
        default_modality: 'presentiel',
        default_duration_hours: 0,
        is_published: false,
        metadata: {
          catalog: {
            importedFrom: 'convention',
            // Repéré par l'écran du dossier, qui propose alors d'écrire le
            // programme ou de l'importer depuis un PDF.
            programmeACompleter: true,
            priceEntrepriseCents: payload.pricing.totalHtCents,
          },
        },
      } as never)
      .select('id')
      .single();
    if (error || !data) {
      resume.warnings.push("La formation du dossier n'a pas pu être ouverte : le dossier n'a pas été créé.");
    } else {
      formationId = (data as { id: string }).id;
      resume.formations.push({ id: formationId, title: titre });
      resume.warnings.push(
        'Aucun programme dans la convention : une formation sur mesure a été ouverte pour ce client, à compléter depuis le dossier.',
      );
    }
  }

  // ── Apprenants nommés (rare : la liste est souvent annexée plus tard) ─────
  const learnerIds: string[] = [];
  for (const p of payload.participants.named) {
    if (p.lastName.trim() === '' && p.firstName.trim() === '') continue;
    let trouve: { id: string } | null = null;
    if (p.email) {
      const { data } = await sb
        .schema('app')
        .from('learners')
        .select('id')
        .eq('organization_id', organizationId)
        .eq('email', p.email)
        .is('deleted_at', null)
        .maybeSingle();
      trouve = data as { id: string } | null;
    }
    if (!trouve) {
      const { data, error } = await sb
        .schema('app')
        .from('learners')
        .insert({
          organization_id: organizationId,
          first_name: p.firstName.trim() || '—',
          last_name: p.lastName.trim() || '—',
          email: p.email || null,
        } as never)
        .select('id')
        .single();
      if (error || !data) continue;
      trouve = data as { id: string };
      resume.learners += 1;
    }
    learnerIds.push(trouve.id);
  }

  // ── Dossier du client ─────────────────────────────────────────────────────
  // Le dossier est la vue qui rassemble tout : formation, séances, documents,
  // Qualiopi, facturation. Il exige un titulaire (`learner_id NOT NULL`) : sans
  // liste nominative, on pose un titulaire provisoire, sur une adresse en
  // `.invalid` (RFC 2606) pour qu'aucun envoi automatique ne parte vers un
  // destinataire inventé.
  if (formationId) {
    const dates = payload.sessions.map((s) => s.date).sort();
    const debut = dates[0] ?? new Date().toISOString().slice(0, 10);
    const fin = dates[dates.length - 1] ?? debut;

    let titulaire = learnerIds[0] ?? null;
    if (!titulaire) {
      const emailProvisoire = `liste-a-venir.${(resume.companyId ?? organizationId).slice(0, 8)}@import.invalid`;
      const { data: dejaLa } = await sb
        .schema('app')
        .from('learners')
        .select('id')
        .eq('organization_id', organizationId)
        .eq('email', emailProvisoire)
        .is('deleted_at', null)
        .maybeSingle();
      if (dejaLa) titulaire = (dejaLa as { id: string }).id;
      else {
        const { data, error } = await sb
          .schema('app')
          .from('learners')
          .insert({
            organization_id: organizationId,
            company_id: resume.companyId,
            first_name: 'Stagiaires',
            last_name: 'à désigner',
            email: emailProvisoire,
            notes: 'Titulaire provisoire créé à l’import de la convention — à remplacer par la liste nominative.',
          } as never)
          .select('id')
          .single();
        if (error) resume.warnings.push('Titulaire provisoire du dossier non créé : le dossier n’a pas pu être ouvert.');
        else titulaire = (data as { id: string }).id;
      }
    }

    if (titulaire) {
      const dossierId = randomUUID();
      const reference = generateDossierReference(dossierId, Number(debut.slice(0, 4)));
      const heures = Number(payload.formations[0]?.durationHours || 0) || 1;
      // Insertion directe, pas `save_dossier` : cette fonction exige
      // `app.current_organization_id()`, or nous écrivons en service role —
      // aucun contexte utilisateur, donc elle refuserait l'appel. Les modules
      // lus ne sont pas au catalogue : ils vivent dans le programme de la
      // formation, pas en lignes de dossier.
      const { error: erreur } = await sb
        .schema('app')
        .from('dossiers')
        .insert({
          id: dossierId,
          organization_id: organizationId,
          reference,
          learner_id: titulaire,
          company_id: resume.companyId,
          // Référent : destinataire des documents, et personne affichée tant
          // que la liste nominative n'est pas arrivée (0167).
          contact_id: contactId,
          formation_id: formationId,
          formation_snapshot: {},
          // Une convention signée n'est plus un brouillon : l'affaire est engagée.
          status: payload.dossier.signedOn ? 'scheduled' : 'draft',
          modality: payload.formations[0]?.modality ?? 'presentiel',
          start_date: debut,
          end_date: fin,
          total_hours: heures,
          total_amount_cents: payload.pricing.totalHtCents,
          currency: 'EUR',
          // Cadre C du BPF, déduit de la convention quand elle le cite.
          action_type: payload.dossier.actionType || null,
          trainee_category: payload.dossier.traineeCategory || null,
          notes:
            [
              payload.dossier.objective ? `Objet : ${payload.dossier.objective}` : null,
              payload.dossier.sanction ? `Sanction : ${payload.dossier.sanction}` : null,
              payload.dossier.place ? `Lieu : ${payload.dossier.place}` : null,
            ]
              .filter(Boolean)
              .join('\n') || null,
          // Tout ce que la convention dit et que le modèle ne range pas ailleurs
          // reste consultable, plutôt que perdu.
          metadata: {
            imported_from: 'convention',
            payment_terms: payload.pricing.paymentTerms,
            payment_method: payload.dossier.paymentMethod || null,
            retractation_days: payload.dossier.retractationDays,
            signed_on: payload.dossier.signedOn || null,
            signed_place: payload.dossier.signedPlace || null,
            total_ttc_cents: payload.dossier.totalTtcCents,
            annex_fees_cents: payload.dossier.annexFeesCents,
            vat_rate: payload.pricing.vatRate,
            participants_announced: payload.participants.count,
            participants_groups: payload.participants.groups || null,
          },
          created_by: userId,
        } as never);
      if (erreur) resume.warnings.push(`Dossier non créé : ${erreur.message}`);
      else {
        resume.dossierId = dossierId;
        resume.dossierReference = reference;
      }
    }
  }

  // ── Financeurs nommés par la convention ───────────────────────────────────
  if (resume.dossierId) {
    for (const f of payload.dossier.funders) {
      const { data: existant } = await sb
        .schema('app')
        .from('funders')
        .select('id')
        .eq('organization_id', organizationId)
        .ilike('name', f.name)
        .is('deleted_at', null)
        .maybeSingle();
      let funderId = (existant as { id: string } | null)?.id ?? null;
      if (!funderId) {
        const { data: cree } = await sb
          .schema('app')
          .from('funders')
          .insert({ organization_id: organizationId, kind: f.kind, name: f.name } as never)
          .select('id')
          .single();
        funderId = (cree as { id: string } | null)?.id ?? null;
      }
      if (!funderId) continue;
      const { error } = await sb
        .schema('app')
        .from('dossier_funders')
        .upsert(
          {
            organization_id: organizationId,
            dossier_id: resume.dossierId,
            funder_id: funderId,
            amount_cents: f.amountCents ?? 0,
            external_file_number: f.fileNumber || null,
          } as never,
          { onConflict: 'dossier_id,funder_id' },
        );
      if (!error) resume.funders += 1;
    }
  }

  // ── Formateurs nommés, rapprochés de vos fiches ───────────────────────────
  // On ne crée pas de formateur : un homonyme inventé serait pire qu'un manque.
  const trainerIds: string[] = [];
  for (const nom of payload.dossier.trainerNames) {
    const mots = nom.trim().split(/\s+/).filter(Boolean);
    const patronyme = mots[mots.length - 1];
    if (!patronyme || patronyme.length < 2) continue;
    const { data: candidats } = await sb
      .schema('app')
      .from('trainers')
      .select('id, first_name, last_name')
      .eq('organization_id', organizationId)
      .ilike('last_name', patronyme)
      .is('deleted_at', null)
      .limit(5);
    const liste = (candidats ?? []) as { id: string; first_name: string | null; last_name: string | null }[];
    const exact = liste.find((t) => mots.some((m) => (t.first_name ?? '').toLowerCase() === m.toLowerCase()));
    const choisi = exact ?? (liste.length === 1 ? liste[0] : undefined);
    if (choisi && !trainerIds.includes(choisi.id)) trainerIds.push(choisi.id);
    else if (!choisi) resume.warnings.push(`Formateur « ${nom} » non reconnu : rattachez-le à la main.`);
  }
  if (resume.dossierId && trainerIds.length > 0) {
    const { error } = await sb
      .schema('app')
      .from('dossier_trainers')
      .upsert(
        trainerIds.map((id, i) => ({
          dossier_id: resume.dossierId,
          trainer_id: id,
          organization_id: organizationId,
          is_lead: i === 0,
        })) as never,
        { onConflict: 'dossier_id,trainer_id' },
      );
    if (!error) resume.trainers = trainerIds.length;
  }

  // ── Séances ───────────────────────────────────────────────────────────────
  const sessionIds: string[] = [];
  for (const s of payload.sessions) {
    const debut = parisIso(s.date, s.startTime);
    const fin = parisIso(s.date, s.endTime);
    if (!debut || !fin) continue;

    const ligne: Record<string, unknown> = {
      organization_id: organizationId,
      // Rattachée au dossier : c'est lui qui porte les heures, l'émargement et
      // la conformité de l'affaire.
      dossier_id: resume.dossierId,
      formation_id: formationId,
      title: s.label || null,
      modality: s.modality,
      status: 'planned',
      starts_at: debut,
      ends_at: fin,
      location: s.location || null,
      // Idem pour la séance : répartir le forfait entre les séances serait
      // encore une invention.
      price_cents: null,
    };
    const avecClient = resume.companyId ? { ...ligne, company_id: resume.companyId } : ligne;

    let sessionId: string | null = null;
    const premier = await sb.schema('app').from('sessions').insert(avecClient as never).select('id').single();
    if (premier.error && resume.companyId) {
      const repli = await sb.schema('app').from('sessions').insert(ligne as never).select('id').single();
      sessionId = (repli.data as { id: string } | null)?.id ?? null;
    } else {
      sessionId = (premier.data as { id: string } | null)?.id ?? null;
    }
    if (!sessionId) {
      resume.warnings.push(`Séance « ${s.label || s.date} » non créée.`);
      continue;
    }
    resume.sessions += 1;
    sessionIds.push(sessionId);

    if (learnerIds.length > 0) {
      await sb
        .schema('app')
        .from('session_participants')
        .upsert(
          learnerIds.map((id) => ({
            session_id: sessionId,
            organization_id: organizationId,
            participant_kind: 'learner',
            learner_id: id,
            source: 'manual_add',
          })) as never,
          { onConflict: 'session_id,participant_kind,participant_id' },
        );
    }
  }

  // Formateur sur chaque séance : c'est ce qui lui ouvre son espace et son
  // émargement, et ce qui alimente le coût formateur de la séance.
  if (trainerIds.length > 0 && sessionIds.length > 0) {
    await sb
      .schema('app')
      .from('session_trainers')
      .upsert(
        sessionIds.flatMap((sid) =>
          trainerIds.map((tid, i) => ({
            session_id: sid,
            organization_id: organizationId,
            trainer_id: tid,
            is_lead: i === 0,
          })),
        ) as never,
        { onConflict: 'session_id,trainer_id' },
      );
    await sb
      .schema('app')
      .from('session_participants')
      .upsert(
        sessionIds.flatMap((sid) =>
          trainerIds.map((tid) => ({
            session_id: sid,
            organization_id: organizationId,
            participant_kind: 'trainer',
            trainer_id: tid,
            source: 'manual_add',
          })),
        ) as never,
        { onConflict: 'session_id,participant_kind,participant_id' },
      );
  }

  // ── Liste nominative manquante → tâche ────────────────────────────────────
  if (learnerIds.length === 0) {
    const premiere = [...payload.sessions].sort((a, b) => a.date.localeCompare(b.date))[0]?.date ?? null;
    // Dix jours avant la première séance — mais jamais dans le passé : une
    // convention signée tardivement donnerait une tâche déjà en retard à sa
    // création, ce qui la ferait passer pour un oubli.
    const aujourdHui = new Date().toISOString().slice(0, 10);
    const dixJoursAvant = premiere
      ? new Date(new Date(`${premiere}T00:00:00Z`).getTime() - 10 * 24 * 3600_000).toISOString().slice(0, 10)
      : null;
    const echeance = dixJoursAvant ? (dixJoursAvant < aujourdHui ? aujourdHui : dixJoursAvant) : null;
    const nomClient = payload.client.name.trim() || 'client';
    const { error } = await sb
      .schema('app')
      .from('tasks')
      .insert({
        organization_id: organizationId,
        title: `Liste nominative des stagiaires — ${nomClient}`.slice(0, 200),
        description:
          `À récupérer auprès de ${nomClient} avant la première séance.` +
          (payload.participants.groups ? ` Répartition annoncée : ${payload.participants.groups}.` : '') +
          (nbParticipants ? ` ${nbParticipants} stagiaires prévus.` : '') +
          ' Les dossiers seront créés à réception des noms.',
        assignee_user_id: userId,
        status: 'todo',
        priority: 'high',
        due_date: echeance,
        created_by: userId,
      } as never);
    if (!error) resume.taskCreated = true;
  }

  // ── Archivage des PDF source ──────────────────────────────────────────────
  for (const pdf of args.pdfs ?? []) {
    const convention = /convention/i.test(pdf.name);
    try {
      await persistGeneratedDocument(sb as never, {
        organizationId,
        // Rattaché au dossier : la convention doit se retrouver dans l'onglet
        // Documents de l'affaire, pas seulement dans la GED de l'organisme.
        dossierId: resume.dossierId,
        kind: convention ? 'convention' : 'programme',
        title: pdf.name.replace(/\.pdf$/i, '').slice(0, 200),
        bytes: pdf.bytes,
        generationInput: { imported: true, source: pdf.name },
        metadata: { imported_from: 'convention', company_id: resume.companyId },
      });
      resume.documents += 1;
    } catch (e) {
      console.error('[import convention] archivage impossible', pdf.name, e);
      resume.warnings.push(`Le fichier « ${pdf.name} » n’a pas pu être archivé.`);
    }
  }

  return resume;
}
