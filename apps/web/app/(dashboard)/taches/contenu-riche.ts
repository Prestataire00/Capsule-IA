// Mise en forme du détail riche, commune à l'éditeur et à l'affichage d'une tâche :
// ce que l'on voit en écrivant est ce que l'on relit dans la liste.
export const CONTENU_RICHE = [
  'prose prose-sm dark:prose-invert max-w-none',
  '[&_p]:my-1 [&_ul]:my-1 [&_ol]:my-1 [&_h2]:mt-3 [&_h2]:mb-1 [&_h3]:mt-2 [&_h3]:mb-1',
  '[&_mark]:rounded-sm [&_mark]:px-0.5',
  '[&_table]:w-full [&_table]:border-collapse [&_table]:my-2 [&_table]:text-[12px]',
  '[&_th]:border [&_th]:border-zinc-300 dark:[&_th]:border-zinc-700 [&_th]:bg-zinc-50 dark:[&_th]:bg-zinc-800/60',
  '[&_th]:px-2 [&_th]:py-1 [&_th]:text-left [&_th]:font-semibold',
  '[&_td]:border [&_td]:border-zinc-300 dark:[&_td]:border-zinc-700 [&_td]:px-2 [&_td]:py-1 [&_td]:align-top',
  '[&_.selectedCell]:bg-orange-50 dark:[&_.selectedCell]:bg-orange-950/40',
].join(' ');
