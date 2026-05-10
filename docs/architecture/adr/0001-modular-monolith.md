# ADR 0001 — Modular monolith, pas microservices

**Date** : 2026-05-10
**Statut** : Accepté

## Contexte

Équipe dev petite (1–3 personnes). SaaS B2B vertical pour OF français. Volume V1 estimé < 1000 OF, < 100 dossiers/mois/OF.

## Décision

On part sur un **monolith modulaire** Next.js + Supabase. Les bounded contexts DDD sont des dossiers, pas des services réseau.

## Conséquences

**Positives** :
- Refactoring inter-context simple (move file, rename import).
- Pas de coordination de versions multiples en prod.
- Pas de coût d'infra microservices (CI/CD multiples, RPC, observabilité distribuée).
- TypeScript de bout en bout, types partagés.

**Négatives** :
- Couplage technique forcé (un crash pète tout).
- Build time grandit linéairement avec les features.
- Si un context devient massif, l'extraction sera coûteuse — mais on l'a anticipée par l'isolation des `features/<context>/`.

## Alternatives écartées

- **Microservices** : trop de cérémonie pour le profil d'équipe.
- **DB par tenant** : ingérable en migration, pas de réel bénéfice de sécu vs RLS.
- **Event sourcing complet** : complexité (snapshots, rebuild) sans bénéfice requis.

## Trigger de réévaluation

Réévaluer si :
- L'équipe dépasse 8 devs.
- Un context atteint > 30k LOC.
- Un context a un profil de scaling clairement différent (ex : génération de doc en pic à 10x trafic général).
