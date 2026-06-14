# Suivi heures + absences/abandons — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Calculer en temps réel les heures dispensées (OF) et suivies (apprenant) par dossier, gérer absences/abandons, et alerter quand la projection passe sous le volume financé.

**Architecture:** Snapshot `dossier_hours_tracking` recalculé par une RPC SQL (`recompute_dossier_hours`) déclenchée par un trigger sur `attendance_signatures` (via outbox) + appels directs (abandon, bouton). L'alerte at_risk (false→true) crée une `app.notifications` dans la RPC même. UI = onglet « Heures » du dossier.

**Tech Stack:** Postgres/Supabase (migrations, PL/pgSQL SECURITY DEFINER, trigger, RLS, pgTAP), Next.js 14 (Server Actions, dispatcher outbox), Vitest.

---

## Conventions & contexte (vérifiés)

- Helper RLS : `app.current_organization_id()`. Dispatcher : `apps/web/app/api/cron/dispatch-events/route.ts`.
- Event de signature existant : **`attendance.signature.captured`** (cf. `apps/web/features/_events`).
- Sessions d'un dossier : **`app.session_dossiers(session_id, dossier_id)`** (0052). `session_status` : `planned`/`in_progress`/`done`/`cancelled`. `attendance_status` : `present`/`absent`/`absent_justified`/`late`/`remote`.
- `attendance_sheets(session_id, dossier_id nullable, status)` ; `attendance_signatures(attendance_sheet_id, participant_kind, learner_id, status)`.
- **Numérotation** : dernier sur `main` = `0060`. Ce plan utilise **`0061`–`0062`** (+ test `0061`). ⚠️ `main` avance (sessions parallèles) → avant merge, `git pull --rebase` et renuméroter au prochain libre si collision.

> **Vérification** : staging `gxmsspevjqirfacvhxul` est à `0055` (les 0056‑0060 parallèles n'y sont pas). Mes migrations 0061‑0062 **ne dépendent pas** de 0056‑0060 → applicables sur staging-à-0055 via l'**API Management** (token) pour test fonctionnel (transaction `BEGIN…ROLLBACK`, `SET LOCAL session_replication_role=replica` pour insérer des dossiers de test). La **CI** (`supabase test db` sur Postgres neuf) valide la chaîne complète à l'ouverture de la PR. Régénération types : API `GET /v1/projects/<ref>/types/typescript` (la CLI échoue `major_version 17`). UA `curl/8.x` requis sinon Cloudflare `1010`.

## File Structure

**Migrations (créer)**
- `supabase/migrations/0061_dossier_abandon_and_hours.sql` — colonnes abandon sur `dossiers` + table `dossier_hours_tracking` + RLS.
- `supabase/migrations/0062_dossier_hours_engine.sql` — RPC `recompute_dossier_hours` (+ wrapper public) + trigger `attendance_signatures` → event `dossier.hours_dirty`.

**Tests pgTAP (créer)**
- `supabase/tests/0061_test_dossier_hours.sql`.

**App (créer)**
- `apps/web/app/(dashboard)/dossiers/[id]/heures/actions.ts` — `markDossierAbandoned`, `recomputeHoursNow`.
- `apps/web/app/(dashboard)/dossiers/[id]/heures/page.tsx` — UI (jauges + risque + abandon).

**App (modifier)**
- `apps/web/app/api/cron/dispatch-events/route.ts` — handler `recompute-dossier-hours`.
- `apps/web/shared/components/layout/tabs-nav.tsx` — onglet « Heures ».

---

### Task 1: Abandon + snapshot heures

**Files:**
- Create: `supabase/migrations/0061_dossier_abandon_and_hours.sql`

- [ ] **Step 1: Écrire la migration**

```sql
-- ============================================================================
-- 0061 — Abandon dossier (flag manuel) + snapshot de suivi des heures
-- ============================================================================

ALTER TABLE app.dossiers
  ADD COLUMN abandoned_at   DATE,
  ADD COLUMN abandon_reason TEXT;

CREATE TABLE app.dossier_hours_tracking (
  dossier_id UUID PRIMARY KEY REFERENCES app.dossiers(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES app.organizations(id) ON DELETE CASCADE,
  hours_planned            NUMERIC(8,2) NOT NULL DEFAULT 0,
  hours_delivered          NUMERIC(8,2) NOT NULL DEFAULT 0,
  hours_attended           NUMERIC(8,2) NOT NULL DEFAULT 0,
  hours_remaining_planned  NUMERIC(8,2) NOT NULL DEFAULT 0,
  projected_final_hours    NUMERIC(8,2) NOT NULL DEFAULT 0,
  attendance_rate          NUMERIC(5,2) NOT NULL DEFAULT 0,
  sessions_held            INT NOT NULL DEFAULT 0,
  absences_count           INT NOT NULL DEFAULT 0,
  justified_absences_count INT NOT NULL DEFAULT 0,
  at_risk BOOLEAN NOT NULL DEFAULT false,
  computed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX ix_dossier_hours_at_risk
  ON app.dossier_hours_tracking (organization_id) WHERE at_risk;

ALTER TABLE app.dossier_hours_tracking ENABLE ROW LEVEL SECURITY;

CREATE POLICY dossier_hours_tracking_rw ON app.dossier_hours_tracking
  FOR ALL TO authenticated
  USING (organization_id = app.current_organization_id())
  WITH CHECK (organization_id = app.current_organization_id());
```

- [ ] **Step 2: Vérif (staging via API ou CI)**

Run (staging): appliquer le fichier via l'API Management, puis
`select to_regclass('app.dossier_hours_tracking');`
Expected: la table existe ; colonnes `abandoned_at`/`abandon_reason` ajoutées à `dossiers`.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/0061_dossier_abandon_and_hours.sql
git commit -m "feat(heures): abandon dossier + snapshot dossier_hours_tracking + RLS"
```

---

### Task 2: Moteur de calcul + trigger temps réel

**Files:**
- Create: `supabase/migrations/0062_dossier_hours_engine.sql`

- [ ] **Step 1: Écrire la migration**

```sql
-- ============================================================================
-- 0062 — Moteur de suivi des heures + alerte sous-volume + trigger temps réel
-- ============================================================================

CREATE OR REPLACE FUNCTION app.recompute_dossier_hours(p_dossier_id UUID)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = app, public
AS $$
DECLARE
  v_org UUID; v_learner UUID; v_total NUMERIC; v_start DATE; v_end DATE; v_aband DATE;
  v_delivered NUMERIC := 0; v_attended NUMERIC := 0; v_remaining NUMERIC := 0;
  v_held INT := 0; v_abs INT := 0; v_abs_j INT := 0;
  v_projected NUMERIC; v_rate NUMERIC; v_at_risk BOOLEAN; v_was_at_risk BOOLEAN;
BEGIN
  SELECT organization_id, learner_id, total_hours, start_date, end_date, abandoned_at
    INTO v_org, v_learner, v_total, v_start, v_end, v_aband
  FROM app.dossiers WHERE id = p_dossier_id;
  IF v_org IS NULL THEN RETURN; END IF;

  -- Sessions du dossier (partagées incluses), hors annulées.
  WITH sess AS (
    SELECT DISTINCT s.id, s.duration_hours, s.status, s.starts_at, s.ends_at
    FROM app.session_dossiers sd
    JOIN app.sessions s ON s.id = sd.session_id
    WHERE sd.dossier_id = p_dossier_id AND s.status <> 'cancelled'
  ),
  classified AS (
    SELECT *,
      (status = 'done' OR ends_at < now())                       AS held,
      (v_aband IS NULL OR starts_at::date <= v_aband)            AS in_window
    FROM sess
  )
  SELECT
    COALESCE(sum(duration_hours) FILTER (WHERE held AND in_window), 0),
    COALESCE(sum(duration_hours) FILTER (WHERE NOT held AND in_window
             AND (v_aband IS NULL)), 0),
    COUNT(*) FILTER (WHERE held AND in_window)
  INTO v_delivered, v_remaining, v_held
  FROM classified;

  -- Heures suivies + absences (sessions tenues, présence de l'apprenant).
  WITH held_sessions AS (
    SELECT DISTINCT s.id, s.duration_hours
    FROM app.session_dossiers sd
    JOIN app.sessions s ON s.id = sd.session_id
    WHERE sd.dossier_id = p_dossier_id AND s.status <> 'cancelled'
      AND (s.status = 'done' OR s.ends_at < now())
      AND (v_aband IS NULL OR s.starts_at::date <= v_aband)
  ),
  sigs AS (
    SELECT hs.id, hs.duration_hours,
      bool_or(sig.status IN ('present','late','remote')) AS present,
      bool_or(sig.status = 'absent')           AS absent,
      bool_or(sig.status = 'absent_justified') AS absent_j
    FROM held_sessions hs
    LEFT JOIN app.attendance_sheets sh ON sh.session_id = hs.id
    LEFT JOIN app.attendance_signatures sig
      ON sig.attendance_sheet_id = sh.id
     AND sig.participant_kind = 'learner' AND sig.learner_id = v_learner
    GROUP BY hs.id, hs.duration_hours
  )
  SELECT
    COALESCE(sum(duration_hours) FILTER (WHERE present), 0),
    COUNT(*) FILTER (WHERE absent AND NOT present),
    COUNT(*) FILTER (WHERE absent_j AND NOT present)
  INTO v_attended, v_abs, v_abs_j
  FROM sigs;

  v_projected := v_attended + CASE WHEN v_aband IS NOT NULL THEN 0 ELSE v_remaining END;
  v_rate := CASE WHEN v_delivered > 0 THEN round(v_attended / v_delivered * 100, 2) ELSE 0 END;
  v_at_risk := v_projected < v_total;

  SELECT at_risk INTO v_was_at_risk FROM app.dossier_hours_tracking WHERE dossier_id = p_dossier_id;

  INSERT INTO app.dossier_hours_tracking AS h (
    dossier_id, organization_id, hours_planned, hours_delivered, hours_attended,
    hours_remaining_planned, projected_final_hours, attendance_rate, sessions_held,
    absences_count, justified_absences_count, at_risk, computed_at
  ) VALUES (
    p_dossier_id, v_org, v_total, v_delivered, v_attended, v_remaining, v_projected,
    v_rate, v_held, v_abs, v_abs_j, v_at_risk, now()
  )
  ON CONFLICT (dossier_id) DO UPDATE SET
    hours_planned = EXCLUDED.hours_planned, hours_delivered = EXCLUDED.hours_delivered,
    hours_attended = EXCLUDED.hours_attended, hours_remaining_planned = EXCLUDED.hours_remaining_planned,
    projected_final_hours = EXCLUDED.projected_final_hours, attendance_rate = EXCLUDED.attendance_rate,
    sessions_held = EXCLUDED.sessions_held, absences_count = EXCLUDED.absences_count,
    justified_absences_count = EXCLUDED.justified_absences_count, at_risk = EXCLUDED.at_risk,
    computed_at = now();

  -- Alerte au franchissement false -> true.
  IF v_at_risk AND COALESCE(v_was_at_risk, false) = false THEN
    INSERT INTO app.notifications (organization_id, channel, template_code, subject,
      payload, related_aggregate_type, related_aggregate_id)
    VALUES (v_org, 'in_app', 'dossier_hours_at_risk',
      'Dossier à risque de sous-volume',
      jsonb_build_object('dossier_id', p_dossier_id, 'projected', v_projected, 'planned', v_total),
      'dossier', p_dossier_id);
  END IF;
END $$;

REVOKE ALL ON FUNCTION app.recompute_dossier_hours(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.recompute_dossier_hours(UUID) TO service_role;

CREATE OR REPLACE FUNCTION public.recompute_dossier_hours(p_dossier_id UUID)
RETURNS VOID LANGUAGE sql SECURITY DEFINER SET search_path = app, public
AS $$ SELECT app.recompute_dossier_hours(p_dossier_id) $$;
REVOKE ALL ON FUNCTION public.recompute_dossier_hours(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.recompute_dossier_hours(UUID) TO service_role;

-- Temps réel : à chaque signature, émet un event léger par dossier lié à la session.
CREATE OR REPLACE FUNCTION app.tg_emit_hours_dirty()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = app, infra, public
AS $$
DECLARE v_org UUID; v_session UUID;
BEGIN
  SELECT sh.organization_id, sh.session_id INTO v_org, v_session
  FROM app.attendance_sheets sh WHERE sh.id = NEW.attendance_sheet_id;
  IF v_session IS NULL THEN RETURN NEW; END IF;

  INSERT INTO infra.domain_events (organization_id, aggregate_type, aggregate_id, type, payload)
  SELECT v_org, 'dossier', sd.dossier_id, 'dossier.hours_dirty',
         jsonb_build_object('dossier_id', sd.dossier_id)
  FROM app.session_dossiers sd WHERE sd.session_id = v_session;
  RETURN NEW;
END $$;

CREATE TRIGGER tg_attendance_sig_hours_dirty
AFTER INSERT OR UPDATE OF status ON app.attendance_signatures
FOR EACH ROW EXECUTE FUNCTION app.tg_emit_hours_dirty();
```

> **Note** : si `attendance_signatures` n'a pas de colonne `status` modifiable (vérifier), réduire le trigger à `AFTER INSERT`. La perf (un event par signature × dossiers liés) est acceptable : insert léger, recompute fait par le cron.

- [ ] **Step 2: Vérif (staging via API)**

Appliquer 0061+0062 sur staging via l'API, puis test fonctionnel en transaction rollback : créer dossier (10h prévues) + 1 session passée 7h + signature `present` → `recompute_dossier_hours` → attendu `hours_attended=7`, `at_risk` selon projection. Désactiver RLS le temps de la lecture (`ALTER TABLE … DISABLE ROW LEVEL SECURITY` dans la txn).

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/0062_dossier_hours_engine.sql
git commit -m "feat(heures): recompute_dossier_hours + alerte sous-volume + trigger temps réel"
```

---

### Task 3: Tests pgTAP

**Files:**
- Create: `supabase/tests/0061_test_dossier_hours.sql`

- [ ] **Step 1: Écrire le test**

```sql
BEGIN;
SELECT plan(4);
\i supabase/tests/_helpers.sql

SELECT tests.create_test_org('11111111-1111-1111-1111-111111111111', 'Org A');
INSERT INTO app.learners (id, organization_id, first_name, last_name, email)
VALUES ('1a000000-0000-0000-0000-0000000000h1','11111111-1111-1111-1111-111111111111','H','Un','h@ex.fr');
INSERT INTO app.formations (id, organization_id, code, title, slug, default_duration_hours)
VALUES ('1f000000-0000-0000-0000-0000000000h1','11111111-1111-1111-1111-111111111111','F-H','Form H','f-h',10);
INSERT INTO app.dossiers (id, organization_id, reference, learner_id, formation_id, formation_snapshot, modality, start_date, end_date, total_hours)
VALUES ('1d000000-0000-0000-0000-0000000000h1','11111111-1111-1111-1111-111111111111','D-H','1a000000-0000-0000-0000-0000000000h1','1f000000-0000-0000-0000-0000000000h1','{}'::jsonb,'presentiel', DATE '2026-07-01', DATE '2026-07-31', 10);
-- Session passée de 7h, partagée (lien dossier).
INSERT INTO app.sessions (id, organization_id, dossier_id, modality, starts_at, ends_at, status)
VALUES ('15000000-0000-0000-0000-0000000000h1','11111111-1111-1111-1111-111111111111','1d000000-0000-0000-0000-0000000000h1','presentiel', TIMESTAMPTZ '2026-06-01 09:00+02', TIMESTAMPTZ '2026-06-01 16:00+02','done');
INSERT INTO app.session_dossiers (session_id, dossier_id, organization_id)
VALUES ('15000000-0000-0000-0000-0000000000h1','1d000000-0000-0000-0000-0000000000h1','11111111-1111-1111-1111-111111111111');
INSERT INTO app.attendance_sheets (id, organization_id, dossier_id, session_id, status)
VALUES ('15h00000-0000-0000-0000-0000000000h1','11111111-1111-1111-1111-111111111111','1d000000-0000-0000-0000-0000000000h1','15000000-0000-0000-0000-0000000000h1','finalized');
INSERT INTO app.attendance_signatures (organization_id, attendance_sheet_id, participant_kind, learner_id, status)
VALUES ('11111111-1111-1111-1111-111111111111','15h00000-0000-0000-0000-0000000000h1','learner','1a000000-0000-0000-0000-0000000000h1','present');

SELECT app.recompute_dossier_hours('1d000000-0000-0000-0000-0000000000h1');

-- 1) dispensé = 7, suivi = 7.
SELECT is((SELECT hours_delivered FROM app.dossier_hours_tracking WHERE dossier_id='1d000000-0000-0000-0000-0000000000h1'), 7.00, 'dispensé = 7h');
SELECT is((SELECT hours_attended  FROM app.dossier_hours_tracking WHERE dossier_id='1d000000-0000-0000-0000-0000000000h1'), 7.00, 'suivi = 7h');
-- 2) Pas d'autre session planifiée -> projeté = 7 < 10 -> at_risk.
SELECT is((SELECT at_risk FROM app.dossier_hours_tracking WHERE dossier_id='1d000000-0000-0000-0000-0000000000h1'), true, 'at_risk car projeté 7 < 10');
-- 3) Une notification de risque créée.
SELECT isnt((SELECT count(*)::int FROM app.notifications WHERE related_aggregate_id='1d000000-0000-0000-0000-0000000000h1' AND template_code='dossier_hours_at_risk'), 0, 'notification at_risk créée');

SELECT * FROM finish();
ROLLBACK;
```

> **Avant d'écrire** : adapter aux helpers réels de `_helpers.sql`. Corriger l'UUID `15h00000…` (le `h` n'est pas hexadécimal) → utiliser un hex valide, ex. `15a00000-0000-0000-0000-000000000001`. Idem pour tous les UUID de test (uniquement 0-9a-f).

- [ ] **Step 2: Vérif** : `pnpm db:test` (CI) — 4 assertions vertes.

- [ ] **Step 3: Commit**

```bash
git add supabase/tests/0061_test_dossier_hours.sql
git commit -m "test(heures): pgTAP dispensé/suivi + at_risk + notification"
```

---

### Task 4: Handler dispatcher

**Files:**
- Modify: `apps/web/app/api/cron/dispatch-events/route.ts`

- [ ] **Step 1: Ajouter le handler + l'entrée registry**

Ajouter la fonction et l'entrée `'dossier.hours_dirty'` au `HANDLERS` existant (fusionner) :

```ts
async function recomputeDossierHours(event: DomainEvent, sb: Sb): Promise<HandlerResult> {
  const payload = event.payload as { dossier_id?: string };
  const dossierId = payload.dossier_id ?? (event.aggregate_type === 'dossier' ? event.aggregate_id : undefined);
  if (!dossierId) return { ok: false, error: 'dossier_id absent du payload' };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (sb as any).rpc('recompute_dossier_hours', { p_dossier_id: dossierId });
  return error ? { ok: false, error: error.message } : { ok: true };
}

// dans HANDLERS :
//   'dossier.hours_dirty': { 'recompute-dossier-hours': recomputeDossierHours },
```

- [ ] **Step 2: Vérif** : `pnpm lint apps/web/app/api/cron/dispatch-events/route.ts` (OK) ; build.

- [ ] **Step 3: Commit**

```bash
git add apps/web/app/api/cron/dispatch-events/route.ts
git commit -m "feat(heures): handler recompute-dossier-hours (outbox)"
```

---

### Task 5: Server Actions

**Files:**
- Create: `apps/web/app/(dashboard)/dossiers/[id]/heures/actions.ts`

- [ ] **Step 1: Écrire les actions**

```ts
'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@supabase/supabase-js';
import { env } from '@/env.mjs';

const admin = () =>
  createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

type ActionResult = { ok: true } | { ok: false; error: string };

async function recompute(sb: ReturnType<typeof admin>, dossierId: string): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (sb as any).rpc('recompute_dossier_hours', { p_dossier_id: dossierId });
}

export async function markDossierAbandoned(
  dossierId: string, date: string, reason: string,
): Promise<ActionResult> {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return { ok: false, error: 'Date invalide' };
  const sb = admin();
  const { error } = await sb.schema('app').from('dossiers')
    .update({ abandoned_at: date, abandon_reason: reason, updated_at: new Date().toISOString() })
    .eq('id', dossierId);
  if (error) return { ok: false, error: error.message };
  await recompute(sb, dossierId);
  revalidatePath(`/dossiers/${dossierId}/heures`);
  return { ok: true };
}

export async function recomputeHoursNow(dossierId: string): Promise<ActionResult> {
  const sb = admin();
  await recompute(sb, dossierId);
  revalidatePath(`/dossiers/${dossierId}/heures`);
  return { ok: true };
}
```

> **Vérif** : `markDossierAbandoned` met le statut via la table `dossiers` directement — le trigger Qualiopi (BEFORE UPDATE OF status) ne se déclenche PAS (on ne change pas `status`), OK. Exposition PostgREST de `recompute_dossier_hours` : wrapper public défini en 0062.

- [ ] **Step 2: Vérif** : `pnpm lint "apps/web/app/(dashboard)/dossiers/[id]/heures/actions.ts"`.

- [ ] **Step 3: Commit**

```bash
git add "apps/web/app/(dashboard)/dossiers/[id]/heures/actions.ts"
git commit -m "feat(heures): server actions abandon + recalcul"
```

---

### Task 6: UI — onglet « Heures »

**Files:**
- Create: `apps/web/app/(dashboard)/dossiers/[id]/heures/page.tsx`
- Modify: `apps/web/shared/components/layout/tabs-nav.tsx`

- [ ] **Step 1: Page (prod-safe : snapshot absent → 0)**

```tsx
// ARCHETYPE: workflow
// Justification: suivi heures dispensées/suivies + risque sous-volume + abandon.

import { notFound } from 'next/navigation';
import { supabaseServer } from '@/shared/lib/supabase/server';
import { SectionLabel } from '@/shared/ui/section-label';
import { InfoCallout } from '@/shared/ui/info-callout';
import { markDossierAbandoned, recomputeHoursNow } from './actions';

export default async function HeuresPage({ params }: { params: { id: string } }) {
  const sb = supabaseServer();
  const { data: dossier } = await sb.schema('app').from('dossiers')
    .select('id, total_hours, abandoned_at, abandon_reason').eq('id', params.id).maybeSingle();
  if (!dossier) notFound();

  const { data: h } = await sb.schema('app').from('dossier_hours_tracking')
    .select('hours_planned, hours_delivered, hours_attended, hours_remaining_planned, projected_final_hours, attendance_rate, sessions_held, absences_count, justified_absences_count, at_risk')
    .eq('dossier_id', params.id).maybeSingle();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const m = (h as any) ?? {};
  const planned = Number(m.hours_planned ?? (dossier as { total_hours?: number }).total_hours ?? 0);
  const abandoned = (dossier as { abandoned_at?: string }).abandoned_at;

  const Stat = ({ label, value, unit = 'h' }: { label: string; value: number; unit?: string }) => (
    <div className="bg-white dark:bg-zinc-900 border border-zinc-200/60 dark:border-zinc-800 rounded-lg px-4 py-3">
      <p className="text-[11px] uppercase tracking-wider text-zinc-500">{label}</p>
      <p className="text-[20px] font-medium">{value}{unit}</p>
    </div>
  );

  return (
    <div className="space-y-6">
      <header className="flex items-center justify-between">
        <SectionLabel>Suivi des heures</SectionLabel>
        <form action={async () => { 'use server'; await recomputeHoursNow(params.id); }}>
          <button type="submit" className="border border-zinc-200/60 dark:border-zinc-800 text-[13px] px-3 py-1.5 rounded-md hover:bg-zinc-50 dark:hover:bg-zinc-900 transition">Recalculer</button>
        </form>
      </header>

      {m.at_risk && (
        <InfoCallout tone="warning">
          <p className="font-medium">⚠️ Risque de sous-volume financeur</p>
          <p className="text-[11px] mt-1">Projeté {Number(m.projected_final_hours ?? 0)}h &lt; financé {planned}h.</p>
        </InfoCallout>
      )}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Stat label="Prévu (financé)" value={planned} />
        <Stat label="Dispensé (OF)" value={Number(m.hours_delivered ?? 0)} />
        <Stat label="Suivi (apprenant)" value={Number(m.hours_attended ?? 0)} />
        <Stat label="Projeté final" value={Number(m.projected_final_hours ?? 0)} />
      </div>

      <div className="flex gap-6 text-[13px] text-zinc-600 dark:text-zinc-400">
        <span>Assiduité : {Number(m.attendance_rate ?? 0)}%</span>
        <span>Absences : {Number(m.absences_count ?? 0)} (dont {Number(m.justified_absences_count ?? 0)} justifiées)</span>
        <span>Sessions tenues : {Number(m.sessions_held ?? 0)}</span>
      </div>

      <section className="border-t border-zinc-200/60 dark:border-zinc-800 pt-4">
        <SectionLabel className="mb-2">Abandon</SectionLabel>
        {abandoned ? (
          <p className="text-[13px]">Abandon enregistré le {new Date(abandoned).toLocaleDateString('fr-FR')}
            {(dossier as { abandon_reason?: string }).abandon_reason ? ` — ${(dossier as { abandon_reason?: string }).abandon_reason}` : ''}.</p>
        ) : (
          <form action={async (fd: FormData) => { 'use server'; await markDossierAbandoned(params.id, String(fd.get('date') ?? ''), String(fd.get('reason') ?? '')); }} className="flex items-end gap-2">
            <label className="text-[12px]">Date<input type="date" name="date" required className="block border rounded px-2 py-1 text-[13px]" /></label>
            <label className="text-[12px] flex-1">Motif<input type="text" name="reason" className="block w-full border rounded px-2 py-1 text-[13px]" /></label>
            <button type="submit" className="border border-zinc-200/60 dark:border-zinc-800 text-[13px] px-3 py-1.5 rounded-md hover:bg-zinc-50 dark:hover:bg-zinc-900 transition">Marquer un abandon</button>
          </form>
        )}
      </section>
    </div>
  );
}
```

> Aligner les classes sur la charte UI. `params` synchrone (Next 14). Casts `any` (types régénérés en fin de plan).

- [ ] **Step 2: Ajouter l'onglet « Heures » dans `tabs-nav.tsx`**

Ajouter dans le tableau `tabs` (après `sessions`) :
```ts
  { slug: 'heures', label: 'Heures' },
```

- [ ] **Step 3: Vérif** : `pnpm lint` (fichiers touchés) + `pnpm build`.

- [ ] **Step 4: Commit**

```bash
git add "apps/web/app/(dashboard)/dossiers/[id]/heures/page.tsx" apps/web/shared/components/layout/tabs-nav.tsx
git commit -m "feat(heures): onglet + page suivi heures (jauges, risque, abandon)"
```

---

### Task 7: Types + vérification finale

- [ ] **Step 1: Régénérer les types via API** (CLI bloquée `major_version 17`) :
`GET https://api.supabase.com/v1/projects/<ref>/types/typescript?included_schemas=public,app,audit,infra,reports` (header `User-Agent: curl/8.4.0`) → écrire le champ `.types` dans `apps/web/shared/types/database.ts`. Cibler le staging (à jour de 0061-0062) ou la prod si déjà appliquée.

- [ ] **Step 2: Suite** : `pnpm lint && pnpm build` (OK) ; la CI exécute `supabase test db` (pgTAP 0061) sur Postgres neuf.

- [ ] **Step 3: Commit**

```bash
git add apps/web/shared/types/database.ts
git commit -m "chore(heures): régénère les types DB"
```

---

## Self-Review

**Spec coverage :**
- Colonnes abandon + snapshot → Task 1.
- 2 KPI (dispensé/suivi) + remaining + projection + at_risk + absences → Task 2 (`recompute_dossier_hours`), testé Task 3.
- Temps réel (trigger signature → event → handler) → Tasks 2 (trigger) + 4 (handler).
- Alerte at_risk false→true → notification → Task 2 (dans la RPC), testé Task 3.
- Abandon (flag, arrêt du calcul) → Task 1 (colonnes) + Task 5 (action) + Task 2 (logique `v_aband`).
- UI jauges/risque/abandon + onglet → Task 6.
- RLS + pgTAP → Task 1 (RLS) + Task 3.

**Cohérence noms :** `recompute_dossier_hours(p_dossier_id)` Tasks 2/4/5 ; `dossier_hours_tracking` colonnes Tasks 1/2/6 ; event `dossier.hours_dirty` Tasks 2/4 ; `abandoned_at`/`abandon_reason` Tasks 1/2/5/6 ; `template_code='dossier_hours_at_risk'` Tasks 2/3.

**À confirmer à l'exécution (inline) :** helpers pgTAP réels + UUID hex valides dans le test ; colonne `status` de `attendance_signatures` (sinon trigger AFTER INSERT seul) ; exposition PostgREST (wrapper public OK) ; classes charte UI ; numérotation migrations vs `main`.

**Ordre/dépendances :** 1→2 (DB) → 3 (test) → 4 (handler) → 5 (actions) → 6 (UI) → 7 (types). Ne dépend PAS des migrations 0056-0060 (parallèles).

**Hors scope (V2) :** granularité demi-journée, abandon auto-détecté, re-facturation financeur, fusion avec `attendance_consolidated`.
