// ARCHETYPE: shared
// Rendu fidèle de la maquette « Programme de formation » Capsule IA.
// Composant présentational PUR (aucun hook, aucun handler) → rendu côté serveur
// pour la page publique et l'aperçu, imprimable tel quel (bouton navigateur).
// Le look est entièrement piloté par le thème via variables CSS : changer une
// couleur ou la police dans l'éditeur se répercute ici sans toucher au code.

import {
  Award,
  Calendar,
  Clock,
  Euro,
  MapPin,
  Monitor,
  Users,
  Wrench,
  type LucideIcon,
} from 'lucide-react';
import type { MetaIcon, Programme, ProgrammeSection, ProgrammeTheme } from './types';

const ICONS: Record<MetaIcon, LucideIcon> = {
  clock: Clock,
  calendar: Calendar,
  location: MapPin,
  remote: Monitor,
  users: Users,
  tools: Wrench,
  euro: Euro,
  award: Award,
};

/** Convertit le thème en variables CSS consommées par la feuille de style. */
function themeVars(t: ProgrammeTheme): React.CSSProperties {
  return {
    // eslint-disable-next-line @typescript-eslint/consistent-type-assertions
    ...( {
      '--pf-primary': t.primaryColor,
      '--pf-secondary': t.secondaryColor,
      '--pf-on-primary': t.onPrimaryColor,
      '--pf-accent': t.accentColor,
      '--pf-surface': t.surfaceColor,
      '--pf-surface-alt': t.surfaceAltColor,
      '--pf-text': t.textColor,
      '--pf-muted': t.mutedColor,
      '--pf-border': t.borderColor,
      '--pf-radius': `${t.cornerRadius}px`,
      fontFamily: t.fontFamily,
    } as React.CSSProperties),
  };
}

function SectionBar({ title, upper }: { title: string; upper: boolean }) {
  return <div className={`pf-bar${upper ? ' pf-upper' : ''}`}>{title}</div>;
}

function KeyValue({ rows }: { rows: Array<{ label: string; value: string }> }) {
  if (rows.length === 0) return null;
  return (
    <div className="pf-kv">
      {rows.map((r, i) => (
        <div className="pf-kv-row" key={i}>
          <div className="pf-kv-label">{r.label}</div>
          <div className="pf-kv-value">{r.value}</div>
        </div>
      ))}
    </div>
  );
}

function Bullets({ items }: { items: string[] }) {
  const clean = items.filter((s) => s.trim() !== '');
  if (clean.length === 0) return null;
  return (
    <ul className="pf-bullets pf-panel">
      {clean.map((it, i) => (
        <li key={i}>{it}</li>
      ))}
    </ul>
  );
}

function ModulesSection({ s, upper }: { s: Extract<ProgrammeSection, { type: 'modules' }>; upper: boolean }) {
  return (
    <>
      <SectionBar title={s.title} upper={upper} />
      {s.overview.length > 0 && (
        <div className="pf-overview">
          {s.overview.map((c, i) => (
            <div className="pf-ov-card" key={i}>
              <div className="pf-ov-code">{c.code}</div>
              <div className="pf-ov-title">{c.title}</div>
              {c.durationLabel && <div className="pf-ov-dur">{c.durationLabel}</div>}
            </div>
          ))}
        </div>
      )}
      {(s.totalValue || s.totalLabel) && (
        <div className="pf-total">
          <span className="pf-total-label">{s.totalLabel}</span>
          <span className="pf-total-value">{s.totalValue}</span>
        </div>
      )}
      {s.modules.map((m, mi) => (
        <div className="pf-module" key={mi}>
          <div className="pf-module-head">
            <span className="pf-module-chip">{m.code}</span>
            <span className="pf-module-title">{m.title}</span>
            {m.durationLabel && <span className="pf-module-dur">{m.durationLabel}</span>}
          </div>
          {m.submodules.map((sub, si) => (
            <div className="pf-sub" key={si}>
              <div className="pf-sub-head">
                <span className="pf-sub-code">{sub.code}</span>
                <span className="pf-sub-title">{sub.title}</span>
                {sub.durationLabel && <span className="pf-sub-dur">{sub.durationLabel}</span>}
              </div>
              <div className="pf-sub-grid">
                <div className="pf-sub-contenu">
                  <div className="pf-sub-tag">Contenu</div>
                  <ul className="pf-bullets">
                    {sub.contenu.filter((x) => x.trim() !== '').map((x, xi) => (
                      <li key={xi}>{x}</li>
                    ))}
                  </ul>
                </div>
                <div className="pf-sub-obj">
                  <div className="pf-sub-obj-title">Objectifs pédagogiques</div>
                  <ul className="pf-bullets">
                    {sub.objectifs.filter((x) => x.trim() !== '').map((x, xi) => (
                      <li key={xi}>{x}</li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>
          ))}
        </div>
      ))}
    </>
  );
}

function ScheduleSection({ s, upper }: { s: Extract<ProgrammeSection, { type: 'schedule' }>; upper: boolean }) {
  if (s.rows.length === 0) return <SectionBar title={s.title} upper={upper} />;
  return (
    <>
      <SectionBar title={s.title} upper={upper} />
      <table className="pf-schedule">
        <thead>
          <tr>
            <th>{s.columns[0]}</th>
            <th>{s.columns[1]}</th>
            <th>{s.columns[2]}</th>
          </tr>
        </thead>
        <tbody>
          {s.rows.map((r, i) => (
            <tr key={i}>
              <td className="pf-sc-time">{r.time}</td>
              <td>{r.label}</td>
              <td className="pf-sc-dur">{r.duration}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}

function Section({ s, upper }: { s: ProgrammeSection; upper: boolean }) {
  if (s.type === 'modules') return <ModulesSection s={s} upper={upper} />;
  if (s.type === 'schedule') return <ScheduleSection s={s} upper={upper} />;
  return (
    <>
      <SectionBar title={s.title} upper={upper} />
      {s.type === 'richtext' && (
        <div className="pf-prose pf-panel" dangerouslySetInnerHTML={{ __html: s.html }} />
      )}
      {s.type === 'keyvalue' && <KeyValue rows={s.rows} />}
      {s.type === 'bullets' && <Bullets items={s.items} />}
    </>
  );
}

export function ProgrammeDocument({ programme }: { programme: Programme }) {
  const { theme, header, sections, footer } = programme;
  const upper = theme.uppercaseHeadings;
  return (
    <div className="pf-doc" style={themeVars(theme)}>
      <style dangerouslySetInnerHTML={{ __html: PROGRAMME_CSS }} />

      <header className="pf-header">
        {header.logoUrl && (
          <div className="pf-logo">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={header.logoUrl} alt="" />
          </div>
        )}
        <div className="pf-header-body">
          {header.orgName && <div className="pf-org">{header.orgName}</div>}
          {header.kicker && <div className="pf-kicker">{header.kicker}</div>}
          {header.title && <h1 className="pf-title">{header.title}</h1>}
          {header.subtitle && <div className="pf-subtitle">{header.subtitle}</div>}
          {header.metaItems.length > 0 && (
            <div className="pf-meta">
              {header.metaItems.map((m, i) => {
                const Icon = ICONS[m.icon];
                return (
                  <span className="pf-meta-item" key={i}>
                    <Icon className="pf-meta-icon" aria-hidden />
                    {m.text}
                  </span>
                );
              })}
            </div>
          )}
        </div>
      </header>

      <main className="pf-main">
        {sections.map((s) => (
          <section className="pf-section" key={s.id}>
            <Section s={s} upper={upper} />
          </section>
        ))}
      </main>

      <footer className="pf-footer">
        {footer.legalLine && <div className="pf-footer-legal">{footer.legalLine}</div>}
        {footer.lines.map((l, i) => (
          <div className="pf-footer-line" key={i}>
            {l}
          </div>
        ))}
        {footer.versionLine && <div className="pf-footer-version">{footer.versionLine}</div>}
      </footer>
    </div>
  );
}

// Feuille de style scopée sous .pf-doc. Toutes les couleurs/polices proviennent
// des variables CSS injectées par themeVars() → 100 % pilotable par le thème.
const PROGRAMME_CSS = `
.pf-doc {
  --pf-gap: 22px;
  color: var(--pf-text);
  background: #fff;
  max-width: 820px;
  margin: 0 auto;
  padding: 40px 44px 56px;
  font-size: 13px;
  line-height: 1.5;
  box-sizing: border-box;
}
.pf-doc * { box-sizing: border-box; }

/* En-tête */
.pf-header {
  display: flex;
  gap: 18px;
  align-items: center;
  background: var(--pf-primary);
  color: var(--pf-on-primary);
  padding: 22px 26px;
  border-radius: var(--pf-radius);
}
.pf-logo {
  flex: 0 0 auto;
  width: 92px; height: 92px;
  background: #fff;
  border-radius: var(--pf-radius);
  display: flex; align-items: center; justify-content: center;
  overflow: hidden;
}
.pf-logo img { max-width: 100%; max-height: 100%; object-fit: contain; }
.pf-header-body { min-width: 0; }
.pf-org { font-size: 30px; font-weight: 800; letter-spacing: .5px; line-height: 1.05; opacity: .92; }
.pf-kicker { font-size: 13px; opacity: .78; margin-top: 1px; }
.pf-title { font-size: 21px; font-weight: 800; margin: 12px 0 0; line-height: 1.15; }
.pf-subtitle { font-size: 14px; opacity: .82; margin-top: 2px; }
.pf-meta { display: flex; flex-wrap: wrap; gap: 16px; margin-top: 12px; font-size: 12px; opacity: .95; }
.pf-meta-item { display: inline-flex; align-items: center; gap: 6px; }
.pf-meta-icon { width: 14px; height: 14px; }

/* Sections */
.pf-main { margin-top: 26px; }
.pf-section { margin-top: var(--pf-gap); }
.pf-section:first-child { margin-top: 0; }
.pf-bar {
  background: var(--pf-primary);
  color: var(--pf-on-primary);
  font-weight: 700;
  font-size: 14px;
  letter-spacing: .3px;
  padding: 9px 16px;
  border-radius: var(--pf-radius);
}
.pf-bar.pf-upper { text-transform: uppercase; }

.pf-panel {
  background: var(--pf-surface);
  border: 1px solid var(--pf-border);
  border-radius: var(--pf-radius);
  padding: 14px 18px;
  margin-top: 10px;
}
.pf-prose :is(p, ul, ol) { margin: 0 0 8px; }
.pf-prose :is(p, ul, ol):last-child { margin-bottom: 0; }
.pf-prose strong { color: var(--pf-accent); }
.pf-prose table { border-collapse: collapse; width: 100%; margin: 8px 0; }
.pf-prose th, .pf-prose td { border: 1px solid var(--pf-border); padding: 6px 9px; text-align: left; }
.pf-prose th { background: var(--pf-surface-alt); color: var(--pf-accent); }

.pf-bullets { margin: 0; padding-left: 18px; }
.pf-bullets li { margin: 3px 0; }
ul.pf-bullets.pf-panel { padding-left: 34px; }

/* Tableau label / valeur */
.pf-kv {
  margin-top: 10px;
  border: 1px solid var(--pf-border);
  border-radius: var(--pf-radius);
  overflow: hidden;
}
.pf-kv-row { display: grid; grid-template-columns: 190px 1fr; }
.pf-kv-row + .pf-kv-row { border-top: 1px solid var(--pf-border); }
.pf-kv-label {
  background: var(--pf-surface);
  color: var(--pf-accent);
  font-weight: 700;
  padding: 9px 14px;
}
.pf-kv-value { padding: 9px 14px; white-space: pre-line; }

/* Vue d'ensemble modules */
.pf-overview { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; margin-top: 12px; }
.pf-ov-card {
  background: var(--pf-secondary);
  color: var(--pf-on-primary);
  border-radius: var(--pf-radius);
  padding: 12px;
  text-align: center;
}
.pf-ov-code { font-weight: 800; font-size: 13px; letter-spacing: .4px; }
.pf-ov-title { font-size: 12px; opacity: .92; margin-top: 4px; }
.pf-ov-dur { font-weight: 700; margin-top: 8px; }
.pf-total {
  display: flex; align-items: stretch; justify-content: space-between;
  margin-top: 10px; border: 1px solid var(--pf-border); border-radius: var(--pf-radius);
  overflow: hidden;
}
.pf-total-label { padding: 9px 14px; background: var(--pf-surface); flex: 1; }
.pf-total-value { padding: 9px 18px; background: var(--pf-primary); color: var(--pf-on-primary); font-weight: 700; }

/* Modules détaillés */
.pf-module { margin-top: 16px; }
.pf-module-head {
  display: flex; align-items: stretch; gap: 0;
  border-radius: var(--pf-radius); overflow: hidden;
}
.pf-module-chip { background: var(--pf-surface-alt); color: var(--pf-accent); font-weight: 800; padding: 9px 14px; }
.pf-module-title { background: var(--pf-primary); color: var(--pf-on-primary); font-weight: 700; padding: 9px 14px; flex: 1; text-transform: uppercase; letter-spacing: .3px; }
.pf-module-dur { background: var(--pf-surface); color: var(--pf-accent); font-weight: 700; padding: 9px 16px; display: flex; align-items: center; }
.pf-sub { margin-top: 10px; }
.pf-sub-head { background: var(--pf-surface); border-radius: var(--pf-radius); padding: 7px 14px; display: flex; gap: 8px; align-items: baseline; }
.pf-sub-code { color: var(--pf-accent); font-weight: 800; opacity: .8; }
.pf-sub-title { color: var(--pf-accent); font-weight: 700; }
.pf-sub-dur { margin-left: auto; color: var(--pf-muted); font-weight: 600; }
.pf-sub-grid { display: grid; grid-template-columns: 1.15fr 1fr; gap: 0; margin-top: 6px; }
.pf-sub-contenu { position: relative; background: var(--pf-surface); border: 1px solid var(--pf-border); padding: 12px 12px 12px 60px; }
.pf-sub-tag { position: absolute; left: 0; top: 0; bottom: 0; width: 48px; background: var(--pf-secondary); color: var(--pf-on-primary); font-size: 10px; font-weight: 700; writing-mode: horizontal-tb; display: flex; align-items: center; justify-content: center; text-align: center; padding: 4px; }
.pf-sub-obj { border: 1px solid var(--pf-border); border-left: 0; padding: 12px 14px; }
.pf-sub-obj-title { color: var(--pf-accent); font-weight: 700; margin-bottom: 6px; }

/* Déroulé horaire */
.pf-schedule { width: 100%; border-collapse: collapse; margin-top: 10px; border: 1px solid var(--pf-border); }
.pf-schedule th { background: var(--pf-primary); color: var(--pf-on-primary); text-align: left; padding: 8px 14px; font-size: 12px; }
.pf-schedule th:last-child, .pf-schedule .pf-sc-dur { text-align: right; }
.pf-schedule td { padding: 8px 14px; border-top: 1px solid var(--pf-border); }
.pf-schedule tbody tr:nth-child(even) { background: var(--pf-surface); }
.pf-sc-time { color: var(--pf-accent); font-weight: 700; white-space: nowrap; }
.pf-sc-dur { white-space: nowrap; color: var(--pf-muted); }

/* Pied de page */
.pf-footer { margin-top: 34px; padding-top: 12px; border-top: 2px solid var(--pf-primary); }
.pf-footer-legal { font-weight: 700; font-size: 12px; }
.pf-footer-line { color: var(--pf-muted); font-size: 11px; margin-top: 2px; }
.pf-footer-version { color: var(--pf-muted); font-size: 11px; margin-top: 8px; }

@media print {
  .pf-doc { max-width: none; margin: 0; padding: 0; font-size: 11.5px; }
  .pf-section, .pf-module, .pf-sub { break-inside: avoid; }
  .pf-header, .pf-bar, .pf-ov-card, .pf-module-title, .pf-schedule th, .pf-total-value {
    -webkit-print-color-adjust: exact; print-color-adjust: exact;
  }
}
`;
