# Runbook — Rotation `TOKEN_SIGNING_KEY`

> **Statut** : stub V1. À étoffer au premier incident réel ou avant rotation planifiée.
> **Décision V1** : pas de rotation automatique (cf. [archi §Open Issues #3](../architecture-i-a-infinity-of-2026-05-16.md)).

## Quand utiliser

- **`TOKEN_SIGNING_KEY` compromise** : fuite suspectée, dépôt par erreur dans git, ex-employé avec accès, machine de dev volée
- **Rotation préventive** : annuelle (recommandé V1.5+) ou trimestrielle (recommandé V2 commercial)

## Impact

⚠ **Tous les tokens HMAC en vol seront invalidés instantanément** :

| Type token | TTL | Impact |
|---|---|---|
| Signature document | 30 j | Apprenants reçoivent 401 sur leur lien email → ré-envoi requis |
| Questionnaire | 14 j | Idem questionnaires non remplis |
| Émargement (QR) | durée session + 2h | **Critique si session en cours** → planifier hors heures de formation |
| Invitation membre | 7 j | Membres invités devront être ré-invités |

## Prérequis

- [ ] Identifier la **fenêtre d'impact minimum** (idéalement nuit / weekend / hors créneaux de formation)
- [ ] **Compter les tokens pending** à invalider :
  ```sql
  SELECT 'document_signatures' AS kind, count(*) FROM document_signatures WHERE status='pending'
  UNION ALL
  SELECT 'questionnaire_assignments', count(*) FROM questionnaire_assignments WHERE status='pending'
  UNION ALL
  SELECT 'attendance_sheets', count(*) FROM attendance_sheets WHERE status='open'
  UNION ALL
  SELECT 'invitations', count(*) FROM invitations WHERE accepted_at IS NULL AND expires_at > now();
  ```
- [ ] Préparer **template email** "lien invalidé, voici le nouveau"
- [ ] Vérifier accès Supabase CLI + droits secrets
- [ ] Prévenir les OF actifs si fenêtre d'impact > 1h

## Procédure

1. **Générer nouvelle clé** :
   ```bash
   openssl rand -base64 32
   ```
2. **Déployer le secret Supabase** :
   ```bash
   supabase secrets set TOKEN_SIGNING_KEY=<nouvelle_cle>
   ```
3. **Forcer redéploiement Edge Functions** (recharge les secrets en mémoire) :
   ```bash
   supabase functions deploy sign-document
   supabase functions deploy answer-questionnaire
   ```
4. **Marquer les tokens pending comme invalidés** (script à préparer, idempotent) :
   ```sql
   UPDATE document_signatures   SET status='revoked', revoked_reason='key_rotation', revoked_at=now() WHERE status='pending';
   UPDATE questionnaire_assignments SET status='revoked' WHERE status='pending';
   UPDATE attendance_sheets     SET status='cancelled' WHERE status='open';
   UPDATE invitations           SET expires_at=now() WHERE accepted_at IS NULL;
   ```
5. **Ré-émettre** les tokens critiques (signatures Qualiopi pending, émargements en cours) via Server Actions batch :
   - `reissueSignatureRequestsAction(reason='key_rotation')`
   - `reissueQuestionnaireAssignmentsAction()`
   - Re-créer les attendance_sheets en cours si formateur encore actif
6. **Notifier** les utilisateurs affectés par email (template préparé en prérequis)

## Post-check

- [ ] **Smoke test** : signer un document de test, vérifier que ça marche
- [ ] **Sentry / logs** : zéro erreur 401 anormale sur les 30 min suivant la rotation
- [ ] **Compteur tokens pending** revenu à un niveau normal sous 24h
- [ ] **Audit** : entrée `audit.audit_log` traçant la rotation (qui, quand, pourquoi)
- [ ] **Sortir l'ancienne clé** de tous les secret stores (1Password, machine de dev, etc.)

## Post-mortem (si rotation forcée par incident)

- [ ] Document écrit dans `docs/runbooks/post-mortems/YYYY-MM-DD-token-key-leak.md`
- [ ] Cause racine identifiée + correctif
- [ ] Évaluer si schéma 2-clés (current + previous) doit être avancé en priorité

## Liens

- Architecture : [`docs/architecture-i-a-infinity-of-2026-05-16.md`](../architecture-i-a-infinity-of-2026-05-16.md) §Open Issues #3
- Edge Functions : [`docs/architecture/07-edge-functions.md`](../architecture/07-edge-functions.md)
- Secrets management : à compléter
