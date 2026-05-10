import { z } from 'zod';
import { defineEvent, z_uuid } from './envelope';

export const OrganizationCreated = defineEvent({
  type: 'identity.organization.created',
  aggregateType: 'organization',
  payload: {
    name: z.string().min(1),
    slug: z.string().min(1),
    siret: z.string().length(14).nullable(),
    contactEmail: z.string().email(),
    createdByUserId: z_uuid,
  },
});

export const UserInvited = defineEvent({
  type: 'identity.user.invited',
  aggregateType: 'invitation',
  payload: {
    invitationId: z_uuid,
    email: z.string().email(),
    role: z.enum(['owner', 'admin', 'gestionnaire', 'comptable', 'formateur']),
    expiresAt: z.coerce.date(),
    invitedBy: z_uuid,
  },
});

export const UserActivated = defineEvent({
  type: 'identity.user.activated',
  aggregateType: 'user',
  payload: {
    userId: z_uuid,
    email: z.string().email(),
    invitationId: z_uuid.nullable(),
  },
});

export const MemberRoleChanged = defineEvent({
  type: 'identity.member.role-changed',
  aggregateType: 'member',
  payload: {
    memberId: z_uuid,
    userId: z_uuid,
    fromRole: z.enum(['owner', 'admin', 'gestionnaire', 'comptable', 'formateur']),
    toRole: z.enum(['owner', 'admin', 'gestionnaire', 'comptable', 'formateur']),
  },
});
