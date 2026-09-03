// Dépôt délégué à `upload-fichier.ts` : autorisation explicite puis écriture en
// service role, au lieu de s'en remettre aux seules policies de stockage (CAP-25).
import { deposerFichierFormateur } from '../../upload-fichier';

export async function POST(req: Request, { params }: { params: { id: string } }) {
  return deposerFichierFormateur(req, params.id, {
    bucket: 'trainer-contracts',
    maxOctets: 10 * 1024 * 1024,
    types: { 'application/pdf': 'pdf' },
    chemin: (orgId, trainerId) => `${orgId}/${trainerId}/contract.pdf`,
    colonne: 'contract_path',
  });
}
