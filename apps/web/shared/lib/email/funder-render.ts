// Module pur (pas de `server-only`) : rend le sujet et le corps HTML d'un email
// financeur à partir d'un template porté par une étape de playbook. La mise en
// page complète (logo, footer) est appliquée côté serveur par `funderEmail()`
// dans templates.ts ; ici on ne produit que le contenu, pour rester testable.

export type FunderEmailTemplate = {
  subjectTemplate: string;
  bodyTemplate: string;
};

const escapeHtml = (s: string): string =>
  s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

// Remplace {{cle}} par vars[cle]. Une clé absente devient une chaîne vide
// (jamais le littéral {{...}} dans l'email envoyé au financeur).
const fill = (tpl: string, vars: Record<string, string>): string =>
  tpl.replace(/\{\{\s*([a-z_]+)\s*\}\}/gi, (_match, key: string) => vars[key] ?? '');

/** Rend le sujet (texte) et le corps (HTML échappé, sauts de ligne en <br/>). */
export function renderFunderEmail(
  tpl: FunderEmailTemplate,
  vars: Record<string, string>,
): { subject: string; bodyHtml: string } {
  const subject = fill(tpl.subjectTemplate, vars);
  const bodyHtml = escapeHtml(fill(tpl.bodyTemplate, vars)).replace(/\n/g, '<br/>');
  return { subject, bodyHtml };
}
