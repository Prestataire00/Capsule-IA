import { CompetencyDateInvalid } from './errors';
import type { CompetencyId, TrainerId } from '@/features/dossier/domain/ids';

export type CompetencyKind = 'diploma' | 'certification' | 'experience' | 'cv';
export type CompetencyStatus = 'valid' | 'expiring_soon' | 'expired' | 'no_expiry';

const EXPIRING_SOON_DAYS = 90;

export type TrainerCompetencyProps = {
  id: CompetencyId;
  trainerId: TrainerId;
  kind: CompetencyKind;
  title: string;
  issuer: string | null;
  obtainedAt: Date | null;
  expiresAt: Date | null;
  documentPath: string | null;
};

export class TrainerCompetency {
  private constructor(private props: TrainerCompetencyProps) {}

  static create(props: TrainerCompetencyProps): TrainerCompetency {
    if (props.obtainedAt && props.expiresAt && props.expiresAt <= props.obtainedAt) {
      throw new CompetencyDateInvalid();
    }
    return new TrainerCompetency({ ...props });
  }

  static hydrate(props: TrainerCompetencyProps): TrainerCompetency {
    return new TrainerCompetency({ ...props });
  }

  get id() { return this.props.id; }
  get trainerId() { return this.props.trainerId; }
  get kind() { return this.props.kind; }
  get title() { return this.props.title; }
  get issuer() { return this.props.issuer; }
  get obtainedAt() { return this.props.obtainedAt; }
  get expiresAt() { return this.props.expiresAt; }
  get documentPath() { return this.props.documentPath; }

  get status(): CompetencyStatus {
    if (!this.props.expiresAt) return 'no_expiry';
    const now = new Date();
    if (this.props.expiresAt <= now) return 'expired';
    const daysLeft = (this.props.expiresAt.getTime() - now.getTime()) / 86_400_000;
    return daysLeft <= EXPIRING_SOON_DAYS ? 'expiring_soon' : 'valid';
  }

  toPersistence() {
    return {
      id: this.props.id,
      trainer_id: this.props.trainerId,
      kind: this.props.kind,
      title: this.props.title,
      issuer: this.props.issuer,
      obtained_at: this.props.obtainedAt?.toISOString().slice(0, 10) ?? null,
      expires_at: this.props.expiresAt?.toISOString().slice(0, 10) ?? null,
      document_path: this.props.documentPath,
    };
  }
}
