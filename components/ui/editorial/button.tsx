import Link from "next/link";
import { Button as ButtonPrimitive } from "@base-ui/react/button";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

export const editorialButtonVariants = cva(
  "inline-flex items-center justify-center gap-2 rounded-none border px-5 py-3 font-display text-xs font-black uppercase tracking-[0.14em] transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 disabled:pointer-events-none disabled:opacity-50",
  {
    variants: {
      variant: {
        primary:
          "border-ed-accent bg-ed-accent text-ed-on-accent hover:bg-ed-primary hover:border-ed-primary",
        ghost:
          "border-[color:var(--ed-line-strong)] bg-transparent text-current hover:border-ed-accent hover:text-ed-accent",
        dark:
          "border-ed-on-dark bg-ed-on-dark text-ed-ink hover:border-ed-accent hover:bg-ed-accent hover:text-ed-on-accent",
      },
      size: {
        default: "min-h-12",
        compact: "min-h-10 px-4 py-2 text-[0.68rem]",
      },
    },
    defaultVariants: {
      variant: "primary",
      size: "default",
    },
  },
);

type EditorialButtonProps = React.ComponentProps<typeof ButtonPrimitive> &
  VariantProps<typeof editorialButtonVariants>;

export function EditorialButton({
  className,
  variant,
  size,
  ...props
}: EditorialButtonProps) {
  return (
    <ButtonPrimitive
      className={cn(editorialButtonVariants({ variant, size }), className)}
      {...props}
    />
  );
}

type EditorialButtonLinkProps = React.ComponentProps<typeof Link> &
  VariantProps<typeof editorialButtonVariants>;

export function EditorialButtonLink({
  className,
  variant,
  size,
  ...props
}: EditorialButtonLinkProps) {
  return (
    <Link
      className={cn(editorialButtonVariants({ variant, size }), className)}
      {...props}
    />
  );
}
