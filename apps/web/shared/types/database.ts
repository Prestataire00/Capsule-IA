// Placeholder — sera regénéré par `pnpm db:types` après le premier `supabase start`.
// Ne pas committer la version générée tant que les migrations bougent vite.

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type Database = Record<string, never>;
