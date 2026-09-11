// ARCHETYPE: shared
export function KeyboardFooter({ shortcuts, version = 'v0.0.1' }: {
  shortcuts: string;
  version?: string;
}) {
  return (
    <div className="border-t border-zinc-200/70 dark:border-zinc-800 px-6 py-2 text-[11px] text-zinc-400 dark:text-zinc-500 flex justify-between">
      <span className="font-mono">{shortcuts}</span>
      <span className="tabular-nums">{version}</span>
    </div>
  );
}
