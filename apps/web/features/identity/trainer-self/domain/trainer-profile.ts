import type { TrainerId, OrganizationId, UserId } from '@/features/dossier/domain/ids';

export type TrainerProfileProps = {
  id: TrainerId;
  organizationId: OrganizationId;
  userId: UserId;
  firstName: string;
  lastName: string;
  email: string;
  phone: string | null;
  bio: string | null;
  specialties: string[];
  avatarPath: string | null;
  isInternal: boolean;
};

export type TrainerProfilePatch = {
  firstName?: string;
  lastName?: string;
  phone?: string | null;
  bio?: string | null;
  specialties?: string[];
  avatarPath?: string | null;
};

export class TrainerProfile {
  private constructor(private props: TrainerProfileProps) {}

  static hydrate(props: TrainerProfileProps): TrainerProfile {
    return new TrainerProfile({ ...props });
  }

  get id() { return this.props.id; }
  get organizationId() { return this.props.organizationId; }
  get firstName() { return this.props.firstName; }
  get lastName() { return this.props.lastName; }
  get email() { return this.props.email; }
  get phone() { return this.props.phone; }
  get bio() { return this.props.bio; }
  get specialties() { return [...this.props.specialties]; }
  get avatarPath() { return this.props.avatarPath; }
  get isInternal() { return this.props.isInternal; }

  applyPatch(patch: TrainerProfilePatch): void {
    if (patch.firstName !== undefined) {
      if (patch.firstName.trim().length === 0) throw new Error('firstName empty');
      if (patch.firstName.length > 100) throw new Error('firstName too long');
      this.props.firstName = patch.firstName.trim();
    }
    if (patch.lastName !== undefined) {
      if (patch.lastName.trim().length === 0) throw new Error('lastName empty');
      if (patch.lastName.length > 100) throw new Error('lastName too long');
      this.props.lastName = patch.lastName.trim();
    }
    if (patch.phone !== undefined) {
      if (patch.phone !== null && patch.phone.length > 30) throw new Error('phone too long');
      this.props.phone = patch.phone;
    }
    if (patch.bio !== undefined) {
      if (patch.bio !== null && patch.bio.length > 2000) throw new Error('bio too long');
      this.props.bio = patch.bio;
    }
    if (patch.specialties !== undefined) {
      if (patch.specialties.length > 12) throw new Error('too many specialties');
      this.props.specialties = patch.specialties.map(s => s.trim()).filter(Boolean);
    }
    if (patch.avatarPath !== undefined) {
      this.props.avatarPath = patch.avatarPath;
    }
  }

  toPersistence(): {
    id: TrainerId;
    first_name: string;
    last_name: string;
    phone: string | null;
    bio: string | null;
    specialties: string[];
    metadata: Record<string, unknown>;
  } {
    return {
      id: this.props.id,
      first_name: this.props.firstName,
      last_name: this.props.lastName,
      phone: this.props.phone,
      bio: this.props.bio,
      specialties: this.props.specialties,
      metadata: this.props.avatarPath ? { avatar_path: this.props.avatarPath } : {},
    };
  }
}
