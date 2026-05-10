// ARCHETYPE: shared
export function EmptyState({ title, description, action }: {
  title: string;
  description?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="text-center py-16">
      <p className="text-[15px] font-medium">{title}</p>
      {description && <p className="text-[13px] text-zinc-500 dark:text-zinc-400 mt-1">{description}</p>}
      {action && <div className="mt-4 inline-block">{action}</div>}
    </div>
  );
}
