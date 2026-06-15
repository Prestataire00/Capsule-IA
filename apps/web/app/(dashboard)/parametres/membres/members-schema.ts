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
