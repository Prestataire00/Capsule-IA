// Émargement : justificatifs d'absence (modèle Edusign) — dépôt, décision, confidentialité.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { cleanFileName, sniffJustification } from '@/features/attendance/justification-rules';

const lire = (rel: string) => fs.readFileSync(path.resolve(__dirname, rel), 'utf-8');
const SQL = lire('../../../supabase/migrations/0149_emargement_justificatifs.sql');
const octets = (...parts: (number[] | string)[]) =>
  Uint8Array.from(parts.flatMap((p) => (typeof p === 'string' ? [...p].map((c) => c.charCodeAt(0)) : p)).concat(Array(16).fill(0)));

describe('type réel du fichier', () => {
  it('reconnaît PDF, PNG, JPEG, WEBP et les photos HEIC d’iPhone', () => {
    expect(sniffJustification(octets('%PDF-1.7'))?.mime).toBe('application/pdf');
    expect(sniffJustification(octets([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))?.mime).toBe('image/png');
    expect(sniffJustification(octets([0xff, 0xd8, 0xff, 0xe0]))?.mime).toBe('image/jpeg');
    expect(sniffJustification(octets('RIFF', [0, 0, 0, 0], 'WEBP'))?.mime).toBe('image/webp');
    expect(sniffJustification(octets([0, 0, 0, 0x18], 'ftypheic'))?.mime).toBe('image/heic');
  });

  it('refuse un exécutable déguisé, quel que soit son nom', () => {
    expect(sniffJustification(octets('MZ', [0x90, 0]))).toBeNull();
    expect(sniffJustification(octets('<html><script>'))).toBeNull();
  });

  it('nettoie le nom affiché et impose l’extension réelle', () => {
    expect(cleanFileName('C:\\Users\\moi\\arrêt maladie.exe', 'pdf')).toBe('arrêt maladie.pdf');
    expect(cleanFileName('../../etc/passwd', 'png')).toBe('passwd.png');
    expect(cleanFileName('', 'jpg')).toBe('justificatif.jpg');
  });
});

describe('confidentialité (0149)', () => {
  it('lecture réservée aux rôles qui gèrent l’émargement, aucune écriture directe', () => {
    expect(SQL).toContain('FORCE ROW LEVEL SECURITY');
    expect(SQL).toContain("app.current_role() IN ('owner', 'admin', 'gestionnaire', 'formateur')");
    expect(SQL).not.toMatch(/FOR (INSERT|UPDATE|DELETE|ALL)/);
    expect(SQL).toContain('REVOKE ALL ON app.attendance_justifications FROM PUBLIC, anon, authenticated');
  });

  it('seau privé, fichiers servis par URL signée après garde', () => {
    expect(SQL).toMatch(/'attendance-justifications',\s+false/);
    const ouvrir = lire('../app/api/attendance/justifications/[id]/route.ts');
    expect(ouvrir).toContain('accessibleSheet(j.attendance_sheet_id)');
    expect(ouvrir).toContain('createSignedUrl(j.storage_path, 60)');
  });
});

describe('dépôt et décision', () => {
  it('l’apprenant dépose avec son lien (jeton émis, non révoqué) ou son espace (séance de son dossier)', () => {
    const lien = lire('../app/api/signer/[token]/justificatif/route.ts');
    expect(lien).toContain("jeton.status === 'revoked'");
    const espace = lire('../app/api/espace/[token]/justificatif/route.ts');
    expect(espace).toContain('!duDossier || !attendu');
  });

  it('l’équipe décide ; une acceptation n’efface jamais une signature', () => {
    const actions = lire('../app/(dashboard)/dossiers/[id]/emargements/[sessionId]/actions.ts');
    expect(actions).toContain(".eq('decision' as never, 'en_attente' as never)");
    const service = lire('../features/attendance/justifications.ts');
    expect(service).toContain('isSelfSigned(');
    expect(service).toContain("statut === 'finalized' || statut === 'completed'");
  });
});
