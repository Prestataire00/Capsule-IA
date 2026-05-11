import 'server-only';
import {
  generateSignatureToken,
  type SignaturePayload,
} from '@/shared/lib/signature-token';

export type GenerateSignatureUrlInput = SignaturePayload & {
  readonly baseUrl: string;
};

export type SignatureUrl = {
  readonly url: string;
  readonly token: string;
  readonly jti: string;
  readonly expiresAt: Date;
};

export const generateSignatureUrl = async (
  input: GenerateSignatureUrlInput,
): Promise<SignatureUrl> => {
  const signed = await generateSignatureToken({
    attendanceSheetId: input.attendanceSheetId,
    signerId: input.signerId,
    signerKind: input.signerKind,
  });
  return {
    url: `${input.baseUrl.replace(/\/$/, '')}/signer/${signed.token}`,
    token: signed.token,
    jti: signed.jti,
    expiresAt: signed.expiresAt,
  };
};
