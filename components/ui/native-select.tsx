import { ChevronDown } from "lucide-react";

import { cn } from "@/lib/utils";

function NativeSelect({
  className,
  ...props
}: React.ComponentProps<"select">) {
  return (
    <div data-slot="native-select-wrapper" className="relative">
      <select
        data-slot="native-select"
        className={cn(
          "w-full appearance-none rounded-lg border border-input bg-background px-3 py-2.5 pr-9 font-body text-sm text-foreground outline-none transition-shadow focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 [.dark_&]:[color-scheme:dark]",
          className
        )}
        {...props}
      />
      <ChevronDown
        aria-hidden="true"
        data-slot="native-select-icon"
        className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
      />
    </div>
  );
}

function NativeSelectOption(props: React.ComponentProps<"option">) {
  return <option data-slot="native-select-option" {...props} />;
}

export { NativeSelect, NativeSelectOption };
