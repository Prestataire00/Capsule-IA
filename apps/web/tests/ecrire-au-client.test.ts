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
const EXPEDITEUR = lire('../shared/lib/email/expediteur-organisme.ts');

describe('l’envoi part de l’organisme', () => {
  it('par le même canal que les convocations', () => {
    expect(ACTION).toMatch(/import \{ sendEmail[^}]*\} from '@\/shared\/lib\/email\/resend'/);
    // On vise l'usage, pas le mot : le composant cite `mailto:` dans son
    // en-tête, précisément pour dire ce qu'il remplace.
    expect(COMPOSANT).not.toMatch(/href=\{?["`']?mailto:/);
  });

  it('sous l’adresse configurée, jamais celle de l’utilisateur', () => {
    // La fiche de l'organisme, sinon `EMAIL_FROM`, sinon la boîte SMTP, sinon
    // le bac à sable. Rien dans cette chaîne ne dépend de qui clique.
    expect(RESEND).toContain('const fromAddress');
    expect(ACTION).not.toMatch(/from:\s*(garde|ctx|user)/);
  });

  it('et cette adresse est celle du CRM, pas une variable de serveur', () => {
    // « Je veux que ça parte de cette adresse mail là, comme ça les échanges
    // seront visibles : contact@capsuleia.fr » — l'adresse est déjà dans le
    // CRM (`organizations.contact_email`) : la lire là permet de la changer
    // dans les paramètres, sans redéploiement.
    expect(EXPEDITEUR).toContain("select('name, contact_email')");
    expect(ACTION).toContain('await expediteurDeLOrganisme(sb, garde.member.organizationId)');
    expect(ACTION).toContain('from: expediteur.from');
  });

  it('les réponses reviennent à la boîte partagée', () => {
    // Le but de la demande : que l'échange soit visible de tous. Un « From »
    // réécrit en route ne doit pas renvoyer la réponse ailleurs.
    expect(ACTION).toContain('replyTo: expediteur.email');
  });

  it('un nom d’organisme ne peut pas casser l’en-tête', () => {
    // Une virgule ou un chevron dans le nom fait partir le message à côté, ou
    // pas du tout.
    expect(EXPEDITEUR).toContain('const nomAffichable');
    expect(EXPEDITEUR).toMatch(/replace\(\/\[<>"\\r\\n\]\/g/);
  });

  it('une adresse absente ou mal saisie n’empêche pas d’écrire', () => {
    // On retombe sur la configuration du serveur, et l'écran le dit.
    expect(EXPEDITEUR).toContain("source: 'serveur'");
    expect(COMPOSANT).toContain('adresseDeLOrganisme');
    expect(COMPOSANT).toContain('vient de la configuration du serveur');
  });

  it('et un domaine non vérifié n’avale pas le message', () => {
    // Resend refuse un « from » dont le domaine n'est pas vérifié (HTTP 422).
    // Renvoyer sous l'adresse du serveur, en gardant le « Répondre à » de
    // l'organisme, vaut mieux qu'un message qui ne part pas.
    expect(ACTION).toContain("envoi.reason === 'send_failed'");
    expect(ACTION).toContain("source: 'repli'");
    expect(ACTION).toContain('domaine à vérifier');
  });

  it('et l’écran dit LAQUELLE, avant d’envoyer', () => {
    // « De quelle adresse ça part ? » n'avait de réponse nulle part — ni dans
    // l'application, ni dans le journal des envois. Une configuration qu'on ne
    // peut pas lire finit par expédier depuis le bac à sable sans que personne
    // le remarque.
    expect(COMPOSANT).toContain('Le message part de <strong');
    expect(COMPOSANT).toContain('{expediteur}');
    expect(COMPOSANT).toContain('pas dans votre boîte personnelle');
  });

  it('et prévient quand rien n’est configuré', () => {
    // Une adresse de bac à sable chez un client fait mauvais effet.
    expect(COMPOSANT).toContain('bacASable');
    expect(COMPOSANT).toContain('bac à sable de Resend');
    // Et dit OÙ corriger : l'adresse se saisit dans Paramètres → Organisation,
    // pas dans une variable de serveur que Laurie n'a pas la main pour changer.
    expect(COMPOSANT).toMatch(/adresse de contact de l’organisme dans[\s\n]*Paramètres/);
  });

  it('l’expéditeur est lu sur le serveur, pas deviné', () => {
    expect(RESEND).toContain('export const adresseExpediteur');
    expect(RESEND).toContain('export const expedieDepuisLeBacASable');
  });
});

describe('l’échange laisse une trace', () => {
  it('dans le journal des e-mails du dossier', () => {
    // C'est `sendEmail` qui journalise : une ligne sans dossier n'apparaîtrait
    // pas dans l'historique du dossier, d'où le contexte passé à l'envoi.
    expect(ACTION).toContain("kind: 'message_direct'");
    expect(ACTION).toContain('dossierId: p.data.dossierId');
    expect(ACTION).toContain('organizationId: garde.member.organizationId');
    expect(RESEND).toContain('async function logEmailSend');
  });

  it('même quand l’envoi échoue', () => {
    // Un envoi raté sans trace se rejoue à l'identique, et personne ne sait
    // qu'il a déjà échoué.
    expect(RESEND).toContain("status: result.ok ? 'sent' : 'failed'");
    expect(ACTION).toMatch(/Journalisé dans les deux cas/);
  });

  it('et l’on sait qui a écrit, et depuis quelle adresse', () => {
    expect(ACTION).toContain('expediteur: expediteur.from');
    expect(ACTION).toContain('par: garde.member.userId');
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
