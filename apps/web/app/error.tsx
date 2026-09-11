'use client';

import { PageError } from '@/shared/ui/page-error';

export default function Erreur({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <PageError error={error} reset={reset} />;
}
