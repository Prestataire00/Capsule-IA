# ADR 0002 — Outbox pattern pour l'asynchrone

**Date** : 2026-05-10
**Statut** : Accepté

## Contexte

Plusieurs effets de bord sont déclenchés par events métier (création dossier → génération documents + emails + Qualiopi). Il faut :
- Atomicité : event émis ⟺ état persisté.
- Au-moins-une-fois delivery.
- Retry + dead letter.

## Décision

**Outbox pattern dans Postgres** via la table `infra.domain_events`. INSERT dans la même transaction que l'écriture métier (RPC `save_dossier`). Un dispatcher Edge Function lu par `pg_cron` consomme la table et route vers les handlers.

## Conséquences

**Positives** :
- Atomicité parfaite (TX Postgres native).
- Aucune dépendance externe (pas de Kafka, RabbitMQ, SQS).
- Observabilité native (`SELECT * FROM infra.domain_events ORDER BY occurred_at DESC`).
- Replay trivial.

**Négatives** :
- Latence : dispatcher tourne toutes les 1 min → events typiquement ~30s de retard.
- Throughput : limité par les capacités Postgres (largement suffisant à notre échelle).

## Alternatives écartées

- **Kafka / RabbitMQ** : surdimensionné, infra à maintenir.
- **Supabase Realtime broadcast** : pas conçu pour des handlers métier critiques.
- **Émission directe depuis le code TS** : pas atomique avec la TX DB.

## Trigger de réévaluation

Si latence > 1 min devient un problème métier OU si `infra.domain_events` dépasse 10M lignes en plein, envisager partitionnement par mois (déjà préparé par l'index `(next_retry_at NULLS FIRST)`).
