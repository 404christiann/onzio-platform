"use client";

import { useRender } from "@base-ui/react/use-render";
import { PanelLeftIcon } from "lucide-react";
import * as React from "react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

/**
 * Trimmed, basecn-styled port of shadcn's Sidebar. Unlike the upstream
 * component this app does not have a desktop icon-collapse mode or a Base UI
 * Sheet-based mobile drawer — AdminShell already has its own proven mobile
 * off-canvas toggle (fixed panel + translate-x + overlay), so this component
 * reuses that pattern instead of pulling in Sheet/Tooltip/Separator/Input.
 */

const SIDEBAR_WIDTH = "16rem";

type SidebarContextProps = {
  openMobile: boolean;
  setOpenMobile: (open: boolean) => void;
  toggleSidebar: () => void;
};

const SidebarContext = React.createContext<SidebarContextProps | null>(null);

function useSidebar() {
  const context = React.useContext(SidebarContext);
  if (!context) {
    throw new Error("useSidebar must be used within a SidebarProvider.");
  }
  return context;
}

function SidebarProvider({
  open,
  onOpenChange,
  className,
  style,
  children,
  ...props
}: React.ComponentProps<"div"> & {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}) {
  const [internalOpen, setInternalOpen] = React.useState(false);
  const openMobile = open ?? internalOpen;
  const setOpenMobile = onOpenChange ?? setInternalOpen;

  const toggleSidebar = React.useCallback(() => {
    setOpenMobile(!openMobile);
  }, [openMobile, setOpenMobile]);

  const contextValue = React.useMemo<SidebarContextProps>(
    () => ({ openMobile, setOpenMobile, toggleSidebar }),
    [openMobile, setOpenMobile, toggleSidebar]
  );

  return (
    <SidebarContext.Provider value={contextValue}>
      <div
        data-slot="sidebar-wrapper"
        style={{ "--sidebar-width": SIDEBAR_WIDTH, ...style } as React.CSSProperties}
        className={cn("group/sidebar-wrapper flex min-h-svh w-full", className)}
        {...props}
      >
        {children}
      </div>
    </SidebarContext.Provider>
  );
}

function Sidebar({
  className,
  children,
  ...props
}: React.ComponentProps<"div">) {
  const { openMobile, setOpenMobile } = useSidebar();

  return (
    <>
      {/* Mobile overlay */}
      {openMobile ? (
        <div
          aria-hidden="true"
          className="fixed inset-0 z-20 bg-black/40 lg:hidden"
          onClick={() => setOpenMobile(false)}
        />
      ) : null}

      <div
        data-slot="sidebar"
        data-state={openMobile ? "expanded" : "collapsed"}
        className={cn(
          "bg-sidebar text-sidebar-foreground border-sidebar-border fixed inset-y-0 left-0 z-30 flex h-screen h-[100dvh] max-h-screen max-h-[100dvh] w-[--sidebar-width] flex-col overflow-hidden border-r transition-transform duration-200 ease-linear lg:sticky lg:top-0 lg:inset-y-auto lg:z-auto lg:flex lg:h-screen lg:h-[100dvh] lg:max-h-screen lg:max-h-[100dvh] lg:self-start lg:translate-x-0",
          openMobile ? "translate-x-0" : "-translate-x-full lg:translate-x-0",
          className
        )}
        {...props}
      >
        {children}
      </div>
    </>
  );
}

function SidebarTrigger({
  className,
  onClick,
  ...props
}: React.ComponentProps<typeof Button>) {
  const { toggleSidebar } = useSidebar();

  return (
    <Button
      data-slot="sidebar-trigger"
      variant="ghost"
      size="icon"
      className={cn("size-8", className)}
      onClick={(event) => {
        onClick?.(event);
        toggleSidebar();
      }}
      {...props}
    >
      <PanelLeftIcon />
      <span className="sr-only">Toggle Sidebar</span>
    </Button>
  );
}

function SidebarHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="sidebar-header"
      className={cn("flex flex-col gap-2 p-3", className)}
      {...props}
    />
  );
}

function SidebarFooter({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="sidebar-footer"
      className={cn("flex flex-col gap-2 p-3", className)}
      {...props}
    />
  );
}

function SidebarContent({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="sidebar-content"
      className={cn("flex min-h-0 flex-1 flex-col gap-2 overflow-auto", className)}
      {...props}
    />
  );
}

function SidebarGroup({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="sidebar-group"
      className={cn("relative flex w-full min-w-0 flex-col p-2", className)}
      {...props}
    />
  );
}

function SidebarGroupLabel({
  className,
  render = <div />,
  ...props
}: React.ComponentProps<"div"> & { render?: useRender.RenderProp }) {
  return useRender({
    render,
    props: {
      "data-slot": "sidebar-group-label",
      className: cn(
        "text-sidebar-foreground/70 flex h-8 shrink-0 items-center rounded-md px-2 text-xs font-medium outline-none [&>svg]:size-4 [&>svg]:shrink-0",
        className
      ),
      ...props,
    },
  });
}

function SidebarGroupContent({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="sidebar-group-content"
      className={cn("w-full text-sm", className)}
      {...props}
    />
  );
}

function SidebarMenu({ className, ...props }: React.ComponentProps<"ul">) {
  return (
    <ul
      data-slot="sidebar-menu"
      className={cn("flex w-full min-w-0 flex-col gap-1", className)}
      {...props}
    />
  );
}

function SidebarMenuItem({ className, ...props }: React.ComponentProps<"li">) {
  return (
    <li
      data-slot="sidebar-menu-item"
      className={cn("group/menu-item relative", className)}
      {...props}
    />
  );
}

function SidebarMenuButton({
  render = <button />,
  isActive = false,
  className,
  ...props
}: React.ComponentProps<"button"> & {
  render?: useRender.RenderProp;
  isActive?: boolean;
}) {
  return useRender({
    render,
    props: {
      "data-slot": "sidebar-menu-button",
      "data-active": isActive,
      className: cn(
        "peer/menu-button flex w-full items-center gap-2 overflow-hidden rounded-md p-2 text-left text-sm outline-none transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground disabled:pointer-events-none disabled:opacity-50 data-[active=true]:bg-sidebar-accent data-[active=true]:font-medium data-[active=true]:text-sidebar-accent-foreground [&>span:last-child]:truncate [&>svg]:size-[22px] [&>svg]:shrink-0",
        className
      ),
      ...props,
    },
  });
}

export {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
  useSidebar,
};
