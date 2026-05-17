# ADR 0004 — Gotenberg self-host pour PDF preuves Qualiopi

**Date** : 2026-05-16
**Statut** : Accepté

## Contexte

L'application génère des documents administratifs depuis des templates DOCX via **docxtemplater + PizZip** dans une Edge Function Deno (`generate-document`) : convention, convocation, attestation, RI, programme, facture, feuille d'émargement.

**Format DOCX vs PDF** :
- **DOCX** convient pour la plupart des documents : les utilisateurs (OF, formateurs, apprenants) peuvent ouvrir/imprimer/éditer ; c'est la pratique en France pour les conventions et programmes.
- **PDF immuable** est requis pour les **preuves Qualiopi terminales** :
  - attestation de fin de formation (indicateur I22)
  - feuille d'émargement finalisée (I22, I23)
  - facture validée (preuve commerciale + comptable)

Ces preuves doivent être **hash-vérifiables (SHA-256), non éditables, immuables dans le temps** pour passer un audit.

**DOCX → PDF est un problème non trivial** :
- **LibreOffice** est la référence de fidélité (mise en page, polices, tableaux complexes)
- LibreOffice = ~200 Mo de binaire, impossible à embarquer dans une Edge Function Deno (limite ~50 Mo)
- Les solutions purement JS (puppeteer + HTML, jsPDF) sacrifient la fidélité ou exigent de re-coder les templates

## Décision

**Gotenberg auto-hébergé sur Railway** comme service HTTP dédié.

[Gotenberg](https://gotenberg.dev/) = wrapper Docker autour de **LibreOffice headless + Chromium**, expose une API HTTP propre (`POST /forms/libreoffice/convert` multipart upload DOCX → réponse PDF).

**Flow Edge Function `generate-document`** :
1. Produit le DOCX (docxtemplater + PizZip + variables du dossier)
2. Calcule hash SHA-256 du DOCX, stocke en BDD et dans Storage
3. **Si** `document.kind ∈ {attestation_finale, attendance_sheet_finalized, invoice_validated}` (= preuve Qualiopi terminale) :
   - POST le DOCX vers `${GOTENBERG_URL}/forms/libreoffice/convert`
   - Récupère le PDF
   - Calcule hash SHA-256 du PDF, stocke en BDD et dans Storage
   - Émet event `documents.pdf.generated` avec le hash
4. **Sinon** s'arrête au DOCX (90% des cas)

Gotenberg tournera sur une instance Railway Hobby dédiée (~5 $/mois), exposée uniquement au réseau interne (pas d'accès public).

## Conséquences

**Positives** :
- **Fidélité PDF parfaite** (LibreOffice rend le DOCX exactement comme Word/LibreOffice desktop, polices et mises en page complexes incluses)
- **Coût marginal** : ~5 $/mois, dans le budget NFR-012 (total V1 reste < 100 $/mois)
- **Service stateless** : pas de DB, simple à redéployer / scale horizontalement
- **API HTTP simple** : 1 POST multipart, 1 PDF en retour, intégration triviale
- **PDF généré uniquement quand requis** : 90% des docs restent en DOCX → économise CPU et Storage
- **Service auto-hosté = pas de lock-in** ni dépendance tarifaire d'un SaaS

**Négatives** :
- **Service supplémentaire à monitorer** : 1 instance Railway de plus, 1 healthcheck de plus, 1 cause de panne potentielle
- **Single Point of Failure pour preuves Qualiopi terminales** : si gotenberg down, attestation non livrable
  - **Mitigation** : retry × 3 avec backoff, puis dead-letter event `documents.pdf.generation_failed` + alerte ops + livraison **DOCX provisoire** à l'apprenant avec mention "PDF officiel sous 24h" + génération PDF asynchrone dès gotenberg réparé
- **Démarrage à froid ~10 s** (LibreOffice boot) : impact UX sur la 1ʳᵉ attestation après période d'inactivité
  - **Mitigation** : healthcheck Railway garde l'instance chaude OU pre-warm via cron toutes les 15 min en heures ouvrées
- **Sécurité** : LibreOffice a un historique de CVEs sur parsing de docs malicieux. Mitigation : gotenberg accepte uniquement des DOCX générés par nous (pas d'upload utilisateur)

## Alternatives écartées

- **CloudConvert SaaS** : ~$0.01 par conversion → ~30 $/mois pour 3000 PDF/an V1. Plus cher, dépendance externe critique, lock-in tarifaire incertain à V2 (10×).
- **docx → HTML → puppeteer-core en Edge Fn** : fidélité PDF imparfaite (mise en page DOCX vs HTML diverge sur tableaux complexes, polices, sauts de page), complexité élevée pour reproduire le rendu LibreOffice, debug pénible.
- **PDF natif depuis jsPDF côté serveur** : pas de templating riche (faut tout coder), incompatible avec les templates DOCX que les OF connaissent et veulent pouvoir éditer.
- **DOCX-only V1, PDF reporté à V2** : acceptable pour conventions et programmes, **inacceptable pour attestation finale** où la preuve Qualiopi immuable est exigée par l'auditeur. Refusé.
- **LibreOffice direct dans Edge Function** : impossible techniquement (~200 Mo de binaire, Edge Function limit ~50 Mo).
- **Microsoft Graph API (Word Online)** : nécessite licence M365 commercial + auth OAuth lourde, prix opaque, hors stack.
- **AWS Lambda + LibreOffice layer** : sort de la stack Supabase/Railway, complique le déploiement, coûts variables imprévisibles.

## Trigger de réévaluation

- **Volume > 50 PDF/jour** : passer instance Railway Pro (~20 $) ou évaluer Cloud Run / Fly.io pour scale-to-zero plus agressif
- **Instabilité** (> 1 incident gotenberg / mois) : migrer vers CloudConvert SaaS malgré le coût
- **Format DOCX accepté par auditeurs Qualiopi** (peu probable) : supprimer entièrement le service
- **Apparition d'un wrapper LibreOffice plus léger** déployable en Edge Function (sortie Wasm de LO ?) : réévaluer
