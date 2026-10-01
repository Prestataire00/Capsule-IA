// ARCHETYPE: shared
// Le corps HTML d'une proposition, sur le modèle de celles de Laurie. Module pur.
// L'en-tête (logo, identité légale de l'organisme) est posé par
// `wrapGeneratedHtml`, comme pour les autres documents générés.

import { baseTarifaire, euros, formuleTarif, lignesDevis, scenarios, type ContenuProposition, type LigneLibelle, type Objectif } from './contenu';

const ACCENT = '#4c1d95';
const FOND = '#f3effa';

const e = (t: string | number | null | undefined): string =>
  String(t ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const titreSection = (t: string) =>
  `<h2 style="font-size:13px;letter-spacing:.04em;text-transform:uppercase;color:${ACCENT};border-bottom:1px solid ${ACCENT};padding-bottom:4px;margin:26px 0 12px;">${e(t)}</h2>`;

const tableLibelles = (lignes: LigneLibelle[]) =>
  lignes.length === 0
    ? ''
    : `<table style="width:100%;border-collapse:collapse;font-size:13px;margin:8px 0;">${lignes
        .map(
          (l) =>
            `<tr><th style="width:28%;text-align:left;vertical-align:top;background:${FOND};color:${ACCENT};padding:8px 10px;border:1px solid #e4e4e7;">${e(l.libelle)}</th><td style="padding:8px 10px;border:1px solid #e4e4e7;white-space:pre-line;">${e(l.valeur)}</td></tr>`,
        )
        .join('')}</table>`;

const coches = (liste: Objectif[]) =>
  `<ul style="list-style:none;padding:0;margin:6px 0;">${liste
    .map((o) => `<li style="margin:5px 0 5px 18px;"><span style="color:${ACCENT};margin-left:-18px;">✓</span> <strong>${e(o.verbe)}</strong> ${e(o.texte)}</li>`)
    .join('')}</ul>`;

const puces = (liste: string[]) =>
  liste.length ? `<ul style="margin:6px 0 6px 20px;padding:0;">${liste.map((x) => `<li style="margin:3px 0;">${e(x)}</li>`).join('')}</ul>` : '';

const minutes = (m: number) => (m >= 60 && m % 60 === 0 ? `${m / 60} h` : m > 60 ? `${Math.floor(m / 60)} h ${m % 60}` : `${m} min`);
const heures = (h: number) => `${h.toLocaleString('fr-FR', { maximumFractionDigits: 2 })} h`;

export function propositionHtml(c: ContenuProposition, opts: { version: number; organisme: string }): string {
  const s: string[] = [];

  s.push(`<section style="background:${ACCENT};color:#fff;padding:20px 22px;margin-bottom:8px;">
    <h1 style="font-size:24px;margin:0 0 6px;color:#fff;">${e(c.titre)}</h1>
    ${c.sous_titre ? `<p style="font-style:italic;margin:0 0 8px;font-size:14px;">${e(c.sous_titre)}</p>` : ''}
    ${c.bandeau ? `<p style="margin:0;font-size:13px;opacity:.9;">${e(c.bandeau)}</p>` : ''}
  </section>
  <p style="font-size:11px;color:#71717a;margin:0 0 4px;">Proposition V${opts.version} — ${e(opts.organisme)}</p>`);

  if (c.presentation.length) {
    s.push(titreSection('Présentation'));
    s.push(c.presentation.map((p) => `<p style="margin:0 0 10px;">${e(p)}</p>`).join(''));
  }

  s.push(titreSection('Vue d’ensemble du programme'));
  s.push(`<table style="width:100%;border-collapse:collapse;margin:8px 0;"><tr>
    <td style="background:${FOND};padding:12px 14px;border:1px solid #e4e4e7;"><div style="font-size:14px;">Durée totale du programme</div><div style="font-size:12px;color:#71717a;">${e(c.rythme)}</div></td>
    <td style="background:${FOND};padding:12px 14px;border:1px solid #e4e4e7;text-align:right;font-size:28px;font-weight:700;color:${ACCENT};">${heures(c.duree_totale_heures)}</td>
  </tr></table>`);
  if (c.fil_rouge.length) {
    s.push(`<h3 style="font-size:14px;color:${ACCENT};margin:16px 0 6px;">${e(c.fil_rouge_titre)}</h3>`);
    s.push(`<table style="width:100%;border-collapse:collapse;font-size:12.5px;"><tr style="background:${ACCENT};color:#fff;">
      <th style="padding:7px;text-align:left;">Brique</th><th style="padding:7px;text-align:left;">Ce que c'est</th><th style="padding:7px;text-align:left;">Exemple</th></tr>${c.fil_rouge
        .map((f, i) => `<tr style="background:${i % 2 ? '#fff' : FOND};"><td style="padding:7px;border:1px solid #e4e4e7;color:${ACCENT};font-weight:600;">${e(f.brique)}</td><td style="padding:7px;border:1px solid #e4e4e7;">${e(f.definition)}</td><td style="padding:7px;border:1px solid #e4e4e7;">${e(f.exemple)}</td></tr>`)
        .join('')}</table>`);
  }

  s.push(titreSection('Informations générales'));
  s.push(tableLibelles(c.informations));

  if (c.objectifs.length) {
    s.push(titreSection('Objectifs globaux de la formation'));
    s.push('<p style="margin:0 0 4px;">À l’issue de cette formation, les participants seront capables de :</p>');
    s.push(coches(c.objectifs));
  }
  if (c.competences.length) {
    s.push(titreSection('Compétences visées'));
    s.push(coches(c.competences));
  }

  const tousModules = c.sessions.flatMap((x) => x.modules);
  if (tousModules.length) {
    s.push(titreSection('Récapitulatif des modules'));
    s.push(`<table style="width:100%;border-collapse:collapse;font-size:13px;"><tr style="background:${ACCENT};color:#fff;"><th style="padding:7px;width:40px;">N°</th><th style="padding:7px;text-align:left;">Module</th><th style="padding:7px;width:80px;">Durée</th></tr>${c.sessions
      .map(
        (se) =>
          `<tr><td colspan="3" style="background:#e9e1f6;color:${ACCENT};font-weight:600;padding:6px 8px;">${e(se.titre)}${se.duree_heures ? ` (${heures(se.duree_heures)})` : ''}</td></tr>${se.modules
            .map((m) => `<tr><td style="padding:6px;border:1px solid #e4e4e7;text-align:center;">${m.numero}</td><td style="padding:6px 8px;border:1px solid #e4e4e7;font-weight:600;">${e(m.titre)}</td><td style="padding:6px;border:1px solid #e4e4e7;text-align:center;">${minutes(m.duree_minutes)}</td></tr>`)
            .join('')}`,
      )
      .join('')}<tr style="background:${ACCENT};color:#fff;"><td></td><td style="padding:7px;text-align:right;font-weight:700;">TOTAL</td><td style="padding:7px;text-align:center;font-weight:700;">${heures(c.duree_totale_heures)}</td></tr></table>`);

    s.push(titreSection('Détail des modules'));
    for (const se of c.sessions) {
      s.push(`<div style="background:${ACCENT};color:#fff;font-weight:700;padding:5px 8px;margin:16px 0 8px;font-size:13px;">${e(se.titre.toUpperCase())}${se.duree_heures ? ` (${heures(se.duree_heures)})` : ''}</div>`);
      for (const m of se.modules) {
        s.push(`<h3 style="font-size:15px;color:${ACCENT};margin:14px 0 4px;">Module ${m.numero} – ${e(m.titre)} (${minutes(m.duree_minutes)})</h3>`);
        if (m.objectifs.length) s.push(`<p style="font-weight:600;color:#0f766e;margin:4px 0 0;">Objectifs pédagogiques</p>${coches(m.objectifs.map((o) => ({ verbe: '', texte: o })))}`);
        if (m.contenus.length) s.push(`<p style="font-weight:600;color:#0f766e;margin:4px 0 0;">Contenu détaillé</p>${puces(m.contenus)}`);
        if (m.livrables) s.push(`<p style="margin:6px 0;"><span style="color:#0f766e;font-weight:600;">✓ Livrables :</span> ${e(m.livrables)}</p>`);
      }
    }
    if (c.intersession) s.push(`<p style="margin:10px 0;"><strong>Intersession :</strong> ${e(c.intersession)}</p>`);
  }

  if (c.adaptation.length) {
    s.push(titreSection('Adaptation des ateliers par groupes'));
    s.push(puces(c.adaptation));
  }
  if (c.livrables.length) {
    s.push(titreSection('Livrables remis à l’entreprise'));
    s.push(puces(c.livrables));
  }

  s.push(titreSection('Méthodes et moyens pédagogiques et techniques'));
  s.push(tableLibelles([
    { libelle: 'Méthodes', valeur: c.methodes.join('\n') },
    { libelle: 'Moyens', valeur: c.moyens.join('\n') },
    { libelle: 'Encadrement', valeur: c.encadrement },
  ].filter((l) => l.valeur.trim())));

  if (c.evaluation.length) {
    s.push(titreSection('Modalités de suivi et d’évaluation'));
    s.push(tableLibelles(c.evaluation));
  }
  if (c.accueil.length) {
    s.push(titreSection('Modalités d’accueil et d’accompagnement'));
    s.push(tableLibelles(c.accueil));
  }

  s.push(titreSection('Tarif'));
  if (c.finale) {
    // Finale : la seule ligne du devis, sans les scénarios d'effectif.
    const cellule = `padding:7px;border:1px solid #e4e4e7;`;
    const lignes = lignesDevis(c);
    s.push(`<table style="width:100%;border-collapse:collapse;font-size:13px;"><tr style="background:${ACCENT};color:#fff;"><th style="padding:7px;text-align:left;">Désignation</th><th style="padding:7px;">Quantité</th><th style="padding:7px;">Prix unitaire HT</th><th style="padding:7px;">Total HT</th></tr>${lignes
      .map((l) => `<tr style="background:${FOND};"><td style="${cellule}"><strong>${e(l.description)}</strong><br><span style="color:#52525b;">${e(l.details)}</span></td><td style="${cellule}text-align:center;">${l.quantite.toLocaleString('fr-FR', { maximumFractionDigits: 2 })}</td><td style="${cellule}text-align:right;">${euros(l.prixUnitaireCents)}</td><td style="${cellule}text-align:right;font-weight:700;">${euros(Math.round(l.quantite * l.prixUnitaireCents))}</td></tr>`)
      .join('')}</table>`);
    s.push(`<p style="font-size:16px;font-weight:700;color:${ACCENT};margin:14px 0 4px;">Total : ${euros(lignes.reduce((t, l) => t + Math.round(l.quantite * l.prixUnitaireCents), 0))} HT</p>`);
    if (c.tarif.financement) s.push(`<p style="margin:0;">${e(c.tarif.financement)}</p>`);
    return `<article style="font-family:Arial,Helvetica,sans-serif;font-size:14px;color:#18181b;line-height:1.5;">${s.join('\n')}</article>`;
  }
  s.push(`<p style="margin:0 0 8px;">Tarif : <strong>${e(baseTarifaire(c.tarif))}</strong>.</p>`);
  const sc = scenarios(c.tarif);
  if (sc.length > 1) {
    s.push(`<table style="width:100%;border-collapse:collapse;font-size:13px;"><tr style="background:${ACCENT};color:#fff;"><th style="padding:7px;text-align:left;">Nombre de participants</th><th style="padding:7px;">Format ${heures(c.tarif.heures)}</th></tr>${sc
      .map((x, i) => `<tr style="background:${i % 2 ? '#fff' : FOND};"><td style="padding:7px;border:1px solid #e4e4e7;color:${ACCENT};font-weight:600;">${x.participants} participants</td><td style="padding:7px;border:1px solid #e4e4e7;text-align:center;${x.retenu ? 'font-weight:700;' : ''}">${euros(x.totalCents)} HT</td></tr>`)
      .join('')}</table>`);
  }
  s.push(`<p style="font-size:16px;font-weight:700;color:${ACCENT};margin:14px 0 4px;">Formule proposée : ${e(formuleTarif(c.tarif))}</p>`);
  if (c.tarif.financement) s.push(`<p style="margin:0;">${e(c.tarif.financement)}</p>`);

  return `<article style="font-family:Arial,Helvetica,sans-serif;font-size:14px;color:#18181b;line-height:1.5;">${s.join('\n')}</article>`;
}
