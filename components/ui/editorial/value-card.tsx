import { cn } from "@/lib/utils";

export function EditorialValueCard({
  index,
  title,
  children,
  className,
}: {
  index: number;
  title: React.ReactNode;
  children?: React.ReactNode;
  className?: string;
}) {
  return (
    <article
      className={cn(
        "value-card grid min-h-44 content-between border border-[color:var(--ed-line)] bg-ed-panel-glass p-6",
        className,
      )}
    >
      <span className="font-display text-sm font-black text-ed-accent">
        {String(index).padStart(2, "0")}
      </span>
      <div className="grid gap-3">
        <h3 className="text-2xl uppercase leading-none">{title}</h3>
        {children ? <div className="text-sm leading-6 text-ed-muted">{children}</div> : null}
      </div>
    </article>
  );
}
