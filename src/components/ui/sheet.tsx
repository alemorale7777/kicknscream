"use client";

import * as React from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

const Sheet = DialogPrimitive.Root;
const SheetTrigger = DialogPrimitive.Trigger;
const SheetClose = DialogPrimitive.Close;
const SheetPortal = DialogPrimitive.Portal;

const SheetOverlay = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Overlay>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Overlay>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Overlay
    ref={ref}
    data-sheet-overlay=""
    className={cn("fixed inset-0 z-50 bg-pitch-950/80 backdrop-blur-sm", className)}
    {...props}
  />
));
SheetOverlay.displayName = "SheetOverlay";

// Escape and outside-click dismissal are delegated to Radix defaults —
// {...props} below forwards onEscapeKeyDown / onPointerDownOutside if a
// consumer ever needs to override, but Sheet's <Root open onOpenChange/>
// API is enough for dismiss to fire onOpenChange(false). Do not add a
// preventDefault here without a clear reason; an audit reported dismiss
// was broken but the wrapper was correct — likely a stale runtime.
const SheetContent = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content>
>(({ className, children, ...props }, ref) => (
  <SheetPortal>
    <SheetOverlay />
    <DialogPrimitive.Content
      ref={ref}
      data-sheet-content=""
      className={cn(
        // Under 768px the sheet anchors to the bottom edge as a 90vh bottom
        // sheet — easier thumb reach on phones, lines up with mobile
        // conventions for action drawers. At md+ it slides in from the right
        // as a 480px-wide side drawer.
        "fixed z-50 flex flex-col bg-pitch-800 shadow-2xl shadow-pitch-950/60",
        "inset-x-0 bottom-0 h-[90vh] max-h-[90vh] rounded-t-xl border-t border-line",
        "md:inset-y-0 md:right-0 md:left-auto md:bottom-auto md:h-full md:max-h-full md:w-full md:max-w-[480px] md:rounded-none md:border-t-0 md:border-l",
        "ring-1 ring-inset ring-pitch-700/60",
        "focus:outline-none",
        className
      )}
      {...props}
    >
      {children}
      <DialogPrimitive.Close className="absolute right-4 top-4 rounded-sm text-ink-500 transition-colors hover:text-ink-50 focus:outline-none focus:ring-2 focus:ring-flood-400 focus:ring-offset-2 focus:ring-offset-pitch-900">
        <X className="h-4 w-4" />
        <span className="sr-only">Close</span>
      </DialogPrimitive.Close>
    </DialogPrimitive.Content>
  </SheetPortal>
));
SheetContent.displayName = "SheetContent";

const SheetHeader = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div
    className={cn("flex flex-col gap-1 border-b border-line px-6 py-5", className)}
    {...props}
  />
);
SheetHeader.displayName = "SheetHeader";

const SheetBody = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div className={cn("flex-1 overflow-y-auto px-6 py-5", className)} {...props} />
);
SheetBody.displayName = "SheetBody";

const SheetFooter = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div
    className={cn(
      "flex items-center justify-between gap-2 border-t border-line bg-pitch-800 px-6 py-4",
      className
    )}
    {...props}
  />
);
SheetFooter.displayName = "SheetFooter";

const SheetTitle = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Title>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Title>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Title
    ref={ref}
    className={cn("text-lg font-semibold leading-none tracking-tight", className)}
    {...props}
  />
));
SheetTitle.displayName = "SheetTitle";

const SheetDescription = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Description>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Description>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Description
    ref={ref}
    className={cn("text-sm text-ink-500", className)}
    {...props}
  />
));
SheetDescription.displayName = "SheetDescription";

export {
  Sheet,
  SheetTrigger,
  SheetClose,
  SheetPortal,
  SheetOverlay,
  SheetContent,
  SheetHeader,
  SheetBody,
  SheetFooter,
  SheetTitle,
  SheetDescription,
};
