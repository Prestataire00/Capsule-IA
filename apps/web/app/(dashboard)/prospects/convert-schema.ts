import { z } from 'zod';

export const ConvertProspectSchema = z.object({ prospectId: z.string().uuid() });
export type ConvertProspectInput = z.infer<typeof ConvertProspectSchema>;
