// « Dans un dossier, quand je clique sur envoyer un mail, ça ne doit pas être
// mon mail perso mais celui relié dans le CRM » — 25/09/2026.
//
// Les liens d'e-mail du dossier étaient des `mailto:` : ils ouvraient la
// messagerie personnelle de celui qui clique. Trois conséquences, toutes
// silencieuses — le client recevait un message d'une adresse privée, l'échange
// n'apparaissait nulle part dans le CRM, et la réponse partait dans une boîte
// que personne d'autre ne relit. Un dossier suivi à trois n'a pas de
// correspondance privée.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const lire = (rel: string) => fs.readFileSync(path.resolve(__dirname, rel), 'utf-8');
const ACTION = lire('../app/(dashboard)/dossiers/[id]/ecrire-actions.ts');
const COMPOSANT = lire('../app/(dashboard)/dossiers/[id]/ecrire.client.tsx');
const PAGE = lire('../app/(dashboard)/dossiers/[id]/page.tsx');
const RESEND = lire('../shared/lib/email/resend.ts');

describe('l’envoi part de l’organisme', () => {
  it('par le même canal que les convocations', () => {
    expect(ACTION).toContain("import { sendEmail } from '@/shared/lib/email/resend'");
    // On vise l'usage, pas le mot : le composant cite `mailto:` dans son
    // en-tête, précisément pour dire ce qu'il remplace.
    expect(COMPOSANT).not.toMatch(/href=\{?["`']?mailto:/);
  });

  it('sous l’adresse configurée, jamais celle de l’utilisateur', () => {
    // `EMAIL_FROM` si définie, sinon la boîte SMTP, sinon le bac à sable.
    // Rien dans cette chaîne ne dépend de qui clique.
    expect(RESEND).toContain('const fromAddress');
    expect(ACTION).not.toMatch(/from:\s*(garde|ctx|user)/);
  });

  it('et l’écran le dit', () => {
    // Sinon on croit écrire depuis sa propre boîte, et on attend une réponse
    // qui n'y arrivera jamais.
    expect(COMPOSANT).toContain('sous l’adresse de l’organisme');
    expect(COMPOSANT).toContain('pas dans votre boîte personnelle');
  });
});

describe('l’échange laisse une trace', () => {
  it('dans le journal des e-mails du dossier', () => {
    expect(ACTION).toContain("from('email_log')");
    expect(ACTION).toContain("kind: 'message_direct'");
    expect(ACTION).toContain('dossier_id: p.data.dossierId');
  });

  it('même quand l’envoi échoue', () => {
    // Un envoi raté sans trace se rejoue à l'identique, et personne ne sait
    // qu'il a déjà échoué.
    expect(ACTION).toContain("status: envoi.ok ? 'sent' : 'failed'");
    expect(ACTION).toMatch(/Journalisé dans les deux cas/);
  });

  it('et l’on sait qui a écrit', () => {
    expect(ACTION).toContain('metadata: { par: garde.member.userId }');
  });
});

describe('ce que la saisie borne', () => {
  it('le dossier doit appartenir à l’organisme', () => {
    // L'identifiant vient de l'écran.
    expect(ACTION).toContain("eq('organization_id', garde.member.organizationId)");
  });

  it('objet et message sont obligatoires', () => {
    expect(ACTION).toContain("min(1, 'Indiquez un objet.')");
    expect(ACTION).toContain("min(1, 'Écrivez votre message.')");
  });

  it('le message est échappé avant d’être mis en page', () => {
    // Il finit dans du HTML envoyé à un tiers.
    expect(ACTION).toContain('const echapper');
    expect(ACTION).toContain('echapper(p)');
  });

  it('et ses alinéas survivent', () => {
    // Envoyé brut, un texte écrit en plusieurs paragraphes arrive en un bloc.
    expect(ACTION).toContain("split(/\\n{2,}/)");
    expect(ACTION).toContain("replace(/\\n/g, '<br>')");
  });
});

describe('les destinataires', () => {
  it('sont proposés, pas à recopier', () => {
    // Une adresse recopiée est une adresse fausse un jour sur dix.
    expect(PAGE).toContain('destinatairesConnus');
    expect(PAGE).toContain("role: 'référent'");
    expect(PAGE).toContain("role: 'stagiaire'");
  });

  it('et ceux sans adresse ne sont pas proposés', () => {
    expect(PAGE).toContain('.filter((l) => l.email)');
  });
});
