import { cn } from "@/lib/utils";

export function EditorialSectionHeading({
  eyebrow,
  title,
  children,
  className,
  titleClassName,
}: {
  eyebrow?: string;
  title: React.ReactNode;
  children?: React.ReactNode;
  className?: string;
  titleClassName?: string;
}) {
  return (
    <header className={cn("grid gap-5", className)}>
      {eyebrow ? <span className="eyebrow">{eyebrow}</span> : null}
      <h2
        className={cn(
          "max-w-[11ch] text-[clamp(3rem,10vw,8.5rem)] font-black uppercase leading-[0.82]",
          titleClassName,
        )}
      >
        {title}
      </h2>
      {children ? <div className="max-w-2xl text-lg leading-8 text-ed-muted">{children}</div> : null}
    </header>
  );
}
