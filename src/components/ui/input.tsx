import * as React from "react";
import { cn } from "@/lib/utils";

const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  ({ className, type, ...props }, ref) => (
    <input
      type={type}
      ref={ref}
      className={cn(
        "flex h-10 w-full rounded-md border border-line bg-pitch-800 px-3 py-2 text-sm text-ink-50 placeholder:text-ink-700",
        "transition-colors duration-[120ms]",
        "focus-visible:outline-none focus-visible:border-turf-400 focus-visible:ring-2 focus-visible:ring-turf-400/30",
        "file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-ink-300",
        "disabled:cursor-not-allowed disabled:opacity-50",
        className
      )}
      {...props}
    />
  )
);
Input.displayName = "Input";

const Textarea = React.forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement>>(
  ({ className, ...props }, ref) => (
    <textarea
      ref={ref}
      className={cn(
        "flex min-h-[80px] w-full rounded-md border border-line bg-pitch-800 px-3 py-2 text-sm text-ink-50 placeholder:text-ink-700",
        "transition-colors duration-[120ms]",
        "focus-visible:outline-none focus-visible:border-turf-400 focus-visible:ring-2 focus-visible:ring-turf-400/30",
        "disabled:cursor-not-allowed disabled:opacity-50",
        className
      )}
      {...props}
    />
  )
);
Textarea.displayName = "Textarea";

export { Input, Textarea };
