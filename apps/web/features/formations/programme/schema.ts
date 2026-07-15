// ARCHETYPE: shared
// Schéma Zod du Programme — partagé entre l'éditeur (client) et la Server Action
// de sauvegarde. Miroir de types.ts ; sert de garde-fou avant persistance JSON.

import { z } from 'zod';

const themeSchema = z.object({
  primaryColor: z.string().max(40),
  secondaryColor: z.string().max(40),
  onPrimaryColor: z.string().max(40),
  accentColor: z.string().max(40),
  surfaceColor: z.string().max(40),
  surfaceAltColor: z.string().max(40),
  textColor: z.string().max(40),
  mutedColor: z.string().max(40),
  borderColor: z.string().max(40),
  fontFamily: z.string().max(200),
  uppercaseHeadings: z.boolean(),
  cornerRadius: z.number().min(0).max(40),
});

const metaItemSchema = z.object({
  icon: z.enum(['clock', 'calendar', 'location', 'remote', 'users', 'tools', 'euro', 'award']),
  text: z.string().max(200),
});

const headerSchema = z.object({
  logoUrl: z.string().max(500000), // autorise un data-URI
  kicker: z.string().max(200),
  orgName: z.string().max(200),
  title: z.string().max(300),
  subtitle: z.string().max(300),
  metaItems: z.array(metaItemSchema).max(10),
});

const kvRow = z.object({ label: z.string().max(200), value: z.string().max(8000) });
const overviewCard = z.object({ code: z.string().max(60), title: z.string().max(300), durationLabel: z.string().max(40) });
const moduleSub = z.object({
  code: z.string().max(40),
  title: z.string().max(300),
  durationLabel: z.string().max(40),
  contenu: z.array(z.string().max(2000)).max(60),
  objectifs: z.array(z.string().max(2000)).max(60),
});
const moduleSchema = z.object({
  code: z.string().max(40),
  title: z.string().max(300),
  durationLabel: z.string().max(40),
  submodules: z.array(moduleSub).max(30),
});
const scheduleRow = z.object({ time: z.string().max(60), label: z.string().max(400), duration: z.string().max(40) });

const sectionSchema = z.discriminatedUnion('type', [
  z.object({ id: z.string().max(60), type: z.literal('richtext'), title: z.string().max(200), html: z.string().max(50000) }),
  z.object({ id: z.string().max(60), type: z.literal('keyvalue'), title: z.string().max(200), rows: z.array(kvRow).max(40) }),
  z.object({ id: z.string().max(60), type: z.literal('bullets'), title: z.string().max(200), items: z.array(z.string().max(2000)).max(80) }),
  z.object({
    id: z.string().max(60),
    type: z.literal('modules'),
    title: z.string().max(200),
    overviewTitle: z.string().max(200),
    overview: z.array(overviewCard).max(12),
    totalLabel: z.string().max(200),
    totalValue: z.string().max(80),
    modules: z.array(moduleSchema).max(20),
  }),
  z.object({
    id: z.string().max(60),
    type: z.literal('schedule'),
    title: z.string().max(200),
    columns: z.tuple([z.string().max(60), z.string().max(60), z.string().max(60)]),
    rows: z.array(scheduleRow).max(60),
  }),
]);

const footerSchema = z.object({
  legalLine: z.string().max(400),
  lines: z.array(z.string().max(400)).max(12),
  versionLine: z.string().max(200),
});

export const programmeSchema = z.object({
  schemaVersion: z.literal(1),
  theme: themeSchema,
  header: headerSchema,
  sections: z.array(sectionSchema).max(40),
  footer: footerSchema,
});
