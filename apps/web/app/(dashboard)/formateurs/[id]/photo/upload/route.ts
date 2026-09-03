// Dépôt délégué à `upload-fichier.ts` : autorisation explicite puis écriture en
// service role, au lieu de s'en remettre aux seules policies de stockage (CAP-25).
import { deposerFichierFormateur } from '../../upload-fichier';

export async function POST(req: Request, { params }: { params: { id: string } }) {
  return deposerFichierFormateur(req, params.id, {
    bucket: 'trainer-photos',
    maxOctets: 2 * 1024 * 1024,
    types: { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp' },
    chemin: (orgId, trainerId, ext) => `${orgId}/${trainerId}.${ext}`,
    colonne: 'photo_path',
  });
}
