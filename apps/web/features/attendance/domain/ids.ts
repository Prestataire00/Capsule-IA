import type { Brand } from '@/shared/lib/branded';
import { makeId } from '@/shared/lib/branded';

export type AttendanceSheetId = Brand<string, 'AttendanceSheetId'>;
export type SignatureId = Brand<string, 'SignatureId'>;
export type TokenJti = Brand<string, 'TokenJti'>;
export type SessionId = Brand<string, 'SessionId'>;
export type ZoomMeetingId = Brand<string, 'ZoomMeetingId'>;

export const AttendanceSheetId = makeId<'AttendanceSheetId'>();
export const SignatureId = makeId<'SignatureId'>();
export const TokenJti = makeId<'TokenJti'>();
export const SessionId = makeId<'SessionId'>();
export const ZoomMeetingId = makeId<'ZoomMeetingId'>();
