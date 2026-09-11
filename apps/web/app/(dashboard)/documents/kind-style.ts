// Pictogramme + accent par type de document (charte v4.1 « vivant »), partagé par les listes Documents et Modèles.
import type { ComponentType } from 'react';
import {
  Award,
  BadgeCheck,
  BookOpen,
  CalendarDays,
  ClipboardCheck,
  ClipboardList,
  FileSignature,
  FileText,
  Receipt,
  Scale,
} from 'lucide-react';
import type { Accent } from '@/shared/ui/kpi-card';

type KindStyle = { icon: ComponentType<{ className?: string }>; accent: Accent };

const KIND_STYLES: Record<string, KindStyle> = {
  convention: { icon: FileSignature, accent: 'orange' },
  convocation: { icon: CalendarDays, accent: 'blue' },
  programme: { icon: BookOpen, accent: 'teal' },
  attestation_presence: { icon: Award, accent: 'emerald' },
  attestation_fin: { icon: Award, accent: 'emerald' },
  certificat_realisation: { icon: BadgeCheck, accent: 'emerald' },
  reglement_interieur: { icon: Scale, accent: 'purple' },
  livret_accueil: { icon: BookOpen, accent: 'sky' },
  devis: { icon: Receipt, accent: 'amber' },
  facture: { icon: Receipt, accent: 'emerald' },
  feuille_emargement: { icon: ClipboardCheck, accent: 'blue' },
  questionnaire: { icon: ClipboardList, accent: 'blue' },
};

const FALLBACK: KindStyle = { icon: FileText, accent: 'orange' };

export const kindStyle = (kind: string): KindStyle => KIND_STYLES[kind] ?? FALLBACK;
