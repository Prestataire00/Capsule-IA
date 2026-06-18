import { z } from 'zod';

export const MEMBER_ROLES = ['owner', 'admin', 'gestionnaire', 'comptable', 'formateur'] as const;
export type MemberRole = (typeof MEMBER_ROLES)[number];

export const ChangeMemberRoleSchema = z.object({
  memberId: z.string().uuid(),
  role: z.enum(MEMBER_ROLES),
});
export type ChangeMemberRoleInput = z.infer<typeof ChangeMemberRoleSchema>;

export const DeactivateMemberSchema = z.object({
  memberId: z.string().uuid(),
});
export type DeactivateMemberInput = z.infer<typeof DeactivateMemberSchema>;

/** Rôles assignables à l'invitation (pas `owner` : un seul propriétaire). */
export const ADD_MEMBER_ROLES = ['admin', 'gestionnaire', 'comptable', 'formateur'] as const;
export type AddMemberRole = (typeof ADD_MEMBER_ROLES)[number];

export const AddMemberSchema = z.object({
  email: z.string().trim().email(),
  fullName: z.string().trim().min(1, 'Le nom est requis').max(120),
  role: z.enum(ADD_MEMBER_ROLES),
});
export type AddMemberInput = z.infer<typeof AddMemberSchema>;
