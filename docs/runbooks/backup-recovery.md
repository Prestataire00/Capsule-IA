# Runbook — Backup & Recovery

> **Statut** : stub V1. À étoffer au premier incident réel ou test de restauration semestriel.
> **Décision V1** : pas de PITR, backup daily Supabase Pro (cf. [archi §Open Issues #5](../architecture-i-a-infinity-of-2026-05-16.md)).

## Quand utiliser

- **Perte de données suspectée** (corruption, suppression accidentelle, bug en prod)
- **Restauration ponctuelle** d'une table après opération destructive
- **Test de restauration** (à exécuter tous les 6 mois minimum — calendrier ops)

## Politique V1 (rappel)

| Métrique | Cible V1 | Mise en œuvre |
|---|---|---|
| **Backup** | Quotidien auto, rétention 7 j | Supabase Pro plan |
| **RPO** (Recovery Point Objective) | ≤ 24h | Conséquence du backup daily |
| **RTO** (Recovery Time Objective) | ≤ 4h | Procédure de restauration + redéploiement |
| **PITR** | Non disponible | Upgrade plan Team requis (~+100 $/mois) — reporté V1.5 |

## Pré-check incident

⚠ **Avant de toucher à quoi que ce soit** :

- [ ] **Évaluer le scope** : 1 OF affecté ? plusieurs ? tout ? quelle table ?
- [ ] **Évaluer l'âge** : depuis combien de temps les données sont-elles affectées ? Avant ou après le dernier backup (généralement 00h00 UTC) ?
- [ ] **Stopper la cause** : si bug en prod cause la corruption, désactiver le feature flag concerné ou rollback déploiement **AVANT** de restaurer (sinon nouvelle corruption immédiate)
- [ ] **Snapshot état courant** : `pg_dump` rapide ou export de la table problématique pour analyse post-mortem (preuve)
- [ ] **Geler les écritures** sur les tables affectées si possible (mettre les Server Actions en mode read-only via feature flag)

## Procédure restauration complète DB

1. **Identifier le backup cible** dans console Supabase → Database → Backups → choisir la date d'avant l'incident
2. **Créer un projet de restauration** : Supabase restaure dans un **nouveau projet** (jamais en place) → "Restore to new project"
3. **Attendre la fin de la restauration** (peut prendre 10-30 min selon taille DB)
4. **Comparer les données** :
   - Query diff sur tables clés : `organizations`, `dossiers` récents, `audit.audit_log`
   - Vérifier counts et samples
5. **Décision** :
   - **Restauration totale** : swap le projet de restauration en prod (changer DATABASE_URL Railway + DNS Supabase Auth)
   - **Restauration partielle** : export sélectif depuis le projet de restauration (`pg_dump -t <table>`) + import en prod sur les lignes affectées
6. **Replay** des opérations critiques perdues si possible :
   - `infra.domain_events` du projet restauré peuvent contenir des events non traités → ré-injecter
   - `audit.audit_log` peut servir à reconstruire des opérations user

## Procédure restauration partielle (table unique)

Si l'incident est cantonné à 1 table (ex : `dossiers` corrompu pour 1 OF) :

1. Identifier le backup, restaurer dans projet temporaire
2. Depuis le projet temporaire :
   ```bash
   pg_dump --data-only -t app.dossiers --where "organization_id='<uuid>'" -h <backup_host> > restore.sql
   ```
3. Sur prod : `BEGIN; DELETE FROM app.dossiers WHERE organization_id = '<uuid>'; \i restore.sql; COMMIT;`
4. Vérifier intégrité (counts, FKs)
5. **Replay events outbox** depuis la date d'incident pour les handlers manqués

## Communication aux OF

**Si RPO réel > 6h** (impact métier réel pour les OF actifs ce jour-là) :

**Template email** :
> Bonjour,
>
> Nous avons subi un incident technique qui nous a contraints à restaurer notre base de données à l'état du **[DATE HEURE]**. Les saisies effectuées entre cette date et maintenant sont perdues et doivent être ressaisies.
>
> Nous vous accompagnons individuellement pour identifier les éléments à recréer en priorité (dossiers actifs, signatures pending). Notre support reste à votre disposition à [contact].
>
> Toutes nos excuses pour la gêne occasionnée.

**Si RPO < 6h** : communication interne seulement, pas d'impact sensible côté OF.

## Post-incident

- [ ] **Post-mortem écrit** dans `docs/runbooks/post-mortems/YYYY-MM-DD-<incident>.md`
- [ ] **Cause racine identifiée** + correctif déployé
- [ ] **Audit log** vérifié : qui a fait quoi, quand, depuis quelle IP
- [ ] **Évaluer si l'incident justifie d'accélérer l'upgrade Supabase Team** (PITR) → décision business

## Test de restauration semestriel

À planifier tous les 6 mois (calendrier ops) :

- [ ] Restaurer un backup dans un projet test
- [ ] Vérifier intégrité (counts, samples sur tables clés)
- [ ] Mesurer **RTO réel** (temps total restauration + smoke test)
- [ ] Mettre à jour ce runbook si la procédure Supabase a évolué
- [ ] Détruire le projet test après validation

## Liens

- Architecture : [`docs/architecture-i-a-infinity-of-2026-05-16.md`](../architecture-i-a-infinity-of-2026-05-16.md) §Open Issues #5
- Supabase docs backup : https://supabase.com/docs/guides/platform/backups
- Runbook deployment : [`docs/runbooks/deployment.md`](./deployment.md)
