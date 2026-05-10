// ARCHETYPE: shared
export function KeyboardFooter({ shortcuts, version = 'v0.0.1' }: {
  shortcuts: string;
  version?: string;
}) {
  return (
    <div className="border-t border-zinc-200/60 dark:border-zinc-800 px-6 py-2 text-[10px] text-zinc-400 dark:text-zinc-500 font-mono flex justify-between">
      <span>{shortcuts}</span>
      <span>{version}</span>
    </div>
  );
}
