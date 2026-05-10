// Mock responses pour l'assistant IA — sera remplacé par une vraie API plus tard.

type Reply = { content: string; suggestions?: string[] };

const replies: { match: RegExp; reply: Reply }[] = [
  {
    match: /qualiopi.*bloqu|indicateur.*manquant|qualiopi.*pr[êe]t/i,
    reply: {
      content:
        "Vous avez **3 dossiers** avec des indicateurs Qualiopi bloquants :\n\n• **DOS-2026-0001** (Alice Martin) — I10 Positionnement, I22 Émargement, I27 Satisfaction froid\n• **DOS-2026-0003** (Cécile Da Silva) — I27 Satisfaction froid\n• **DOS-2026-0004** (David Léon) — 6 indicateurs (dossier en draft)\n\nLes plus urgents : **I22 sur DOS-2026-0001** car la session du 12/11 a une feuille d'émargement non finalisée.",
      suggestions: [
        'Relance Alice Martin pour le questionnaire',
        'Voir le détail Qualiopi de DOS-2026-0001',
      ],
    },
  },
  {
    match: /document.*signer|à signer/i,
    reply: {
      content:
        "**18 documents** sont en attente de signature :\n\n• 12 conventions apprenant (dont 3 envoyées il y a +7 jours sans relance)\n• 4 attestations de présence en attente formateur\n• 2 règlements intérieurs apprenant\n\nLes 3 plus anciens : DOS-2026-0001 (envoyé 14/04), DOS-2026-0009 (envoyé 16/04), DOS-2026-0012 (envoyé 18/04).",
      suggestions: [
        'Renvoyer une relance pour les 3 plus anciens',
        'Voir tous les documents à signer',
      ],
    },
  },
  {
    match: /heure.*r[ée]alis|combien.*heure/i,
    reply: {
      content:
        "**1 248 heures** réalisées ce mois (+8% vs mois dernier).\n\nRépartition :\n• Présentiel : 720 h (58%)\n• Distanciel : 408 h (33%)\n• Hybride : 120 h (9%)\n\nFormateur le plus actif : **Marc Dupont** avec 312 h (3 dossiers en cours).",
      suggestions: ['Voir le planning de Marc Dupont', 'Export comptable des heures'],
    },
  },
  {
    match: /r[ée]capitulatif|r[ée]cap.*semaine|qu[''']est.*pass[ée]/i,
    reply: {
      content:
        "**Récap de la semaine** (12 — 18 mai 2026) :\n\n📊 **Activité**\n• 24 sessions tenues, 92% de présence\n• 8 documents signés\n• 12 questionnaires complétés (NPS moyen 8.4)\n\n⚠️ **Points d'attention**\n• 2 réclamations ouvertes (1 high)\n• 1 facture en retard (3 500 €)\n• 7 émargements à finaliser\n\n✅ **Bonnes nouvelles**\n• 2 nouveaux apprenants inscrits\n• Dossier DOS-2026-0005 prêt à être clôturé",
      suggestions: ['Clôturer DOS-2026-0005', 'Traiter la réclamation high'],
    },
  },
  {
    match: /r[ée]clamation|plainte/i,
    reply: {
      content:
        "**2 réclamations ouvertes** :\n\n🔴 **REC-2026-0008** — *Salle inadaptée RQTH* (severity high, ouverte depuis 4j)\n   ↳ assignée à Sophie Dubois\n   ↳ liée à DOS-2026-0001 (Alice Martin)\n\n🟡 **REC-2026-0007** — *Formateur en retard de 30 min* (medium, 2j)\n   ↳ pas encore assignée\n   ↳ liée à DOS-2026-0003",
      suggestions: ['Assigner REC-2026-0007', 'Marquer REC-2026-0008 résolue'],
    },
  },
  {
    match: /facture|relance|impay/i,
    reply: {
      content:
        "**1 facture en retard** :\n\n• **FAC-2026-0011** — 800 €, échéance 15/04, **35 jours de retard**\n• Pas de relance envoyée\n• Pas de dossier lié (facturation directe)\n\nVoulez-vous que je rédige un email de relance ?",
      suggestions: ['Rédiger un email de relance', 'Voir toutes les factures'],
    },
  },
  {
    match: /aide|peux.*faire|capacit[ée]|que.*fait/i,
    reply: {
      content:
        "Je peux vous aider sur :\n\n• **Suivi Qualiopi** : indicateurs bloquants, dossiers à risque\n• **Gestion documents** : qui doit signer quoi, relances\n• **Activité** : heures, sessions, présences\n• **Facturation** : impayés, relances\n• **Qualité** : réclamations, satisfaction (NPS)\n• **Récaps** : journée, semaine, mois\n\nPosez votre question en langage naturel.",
      suggestions: [
        'Quels dossiers Qualiopi sont bloqués ?',
        'Récap de la semaine',
        'Combien d\'heures réalisées ce mois ?',
      ],
    },
  },
];

const fallback: Reply = {
  content:
    "Je n'ai pas trouvé de réponse précise à votre question. Je peux vous aider sur le suivi Qualiopi, la gestion documentaire, l'activité, la facturation ou les réclamations. Reformulez ou choisissez une suggestion ci-dessous.",
  suggestions: [
    'Quels dossiers Qualiopi sont bloqués ?',
    'Documents à signer',
    'Récap de la semaine',
  ],
};

export const askAi = (question: string): Reply => {
  for (const r of replies) {
    if (r.match.test(question)) return r.reply;
  }
  return fallback;
};

export const initialSuggestions = [
  'Quels dossiers Qualiopi sont bloqués ?',
  'Récap de la semaine',
  'Documents à signer',
  'Combien d\'heures réalisées ce mois ?',
];
