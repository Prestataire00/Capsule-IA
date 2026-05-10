# Prompts opérationnels — i-a-infinity OF

Templates **starters** pour Cursor / Windsurf chat. Ils référencent les livrables architecture et forcent la cohérence.

## Comment utiliser

1. Ouvre les livrables pertinents en contexte (`@docs/architecture/03-domain-models.md`, etc.).
2. Choisis le template ci-dessous.
3. Remplis les `[BRACKETS]`.
4. Envoie à l'IA.
5. **Toujours** lance les tests après génération.

## Index

| Tâche | Prompt |
|---|---|
| Créer un nouveau bounded context | `add-bounded-context.md` |
| Ajouter un domain event | `add-event.md` |
| Ajouter un handler du dispatcher | `add-handler.md` |
| Ajouter une RLS policy | `add-rls-policy.md` |
| Créer une Server Action | `add-server-action.md` |
| Ajouter un use case à un agrégat existant | `add-use-case.md` |
| Créer une migration Supabase | `add-migration.md` |
| Écrire un test (unit/integration/pgTAP) | `add-test.md` |
| Debug un test qui échoue | `debug-failing-test.md` |
| Audit sécurité d'une feature | `security-audit.md` |

## Bootstrap des 11 features restantes

Templates dans `features/` :

- `crm.md` — companies, contacts, learners
- `catalog.md` — formations, modules
- `scheduling.md` — sessions, créneaux, Zoom
- `attendance.md` — feuilles d'émargement, signatures
- `documents.md` — templates, génération, signatures électroniques
- `qualiopi.md` — preuves, checklists, exports
- `questionnaire.md` — positionnement, satisfaction
- `complaint.md` — réclamations, indicateur 31
- `billing.md` — factures, paiements
- `automation.md` — workflows configurables (V2)
- `notification.md` — log d'envois, templates email

## Anti-patterns à BANNIR

- "Implémente toute la feature X en un coup" → découper en domain → app → infra → ui.
- "Skippe le domain, c'est juste du CRUD" → toujours passer par le domain.
- "Bypass RLS en service_role pour cet écran admin" → écrire la policy.
- "Mets une vérif de rôle dans le middleware" → `requireRoles` Server Action + RLS.
- "Génère le DOCX dans le Server Action" → Edge Function dédiée.
- "Catch + log l'erreur, on verra plus tard" → Result typé OU re-throw mapped.
- "Mock Supabase dans les tests d'intégration" → vrai Supabase local.
