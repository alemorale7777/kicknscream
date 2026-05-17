import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-[background,box-shadow,transform,color] duration-[180ms] ease-[cubic-bezier(0.2,0,0,1)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-flood-400 focus-visible:ring-offset-2 focus-visible:ring-offset-pitch-900 disabled:pointer-events-none disabled:opacity-40 active:scale-[0.98]",
  {
    variants: {
      variant: {
        primary:
          "bg-turf-400 text-pitch-950 hover:bg-turf-300 hover:shadow-[0_0_28px_-8px_var(--color-turf-400)]",
        accent:
          "bg-flood-400 text-pitch-950 hover:bg-flood-300 hover:shadow-[0_0_32px_-4px_var(--color-flood-400)]",
        secondary:
          "bg-pitch-700 text-ink-50 border border-line hover:bg-pitch-600 hover:border-ink-700",
        outline:
          "border border-line bg-transparent text-ink-50 hover:bg-pitch-800 hover:border-turf-400/60",
        ghost: "text-ink-300 hover:text-ink-50 hover:bg-pitch-800",
        destructive:
          "bg-danger text-pitch-950 hover:opacity-90 hover:shadow-[0_0_28px_-8px_var(--color-danger)]",
        link: "text-turf-300 underline-offset-4 hover:text-turf-200 hover:underline",
      },
      size: {
        sm: "h-8 px-3 text-xs rounded-md",
        md: "h-10 px-4",
        lg: "h-12 px-6 text-base",
        icon: "h-10 w-10",
        iconSm: "h-8 w-8",
      },
    },
    defaultVariants: { variant: "primary", size: "md" },
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return <Comp className={cn(buttonVariants({ variant, size, className }))} ref={ref} {...props} />;
  }
);
Button.displayName = "Button";

export { Button, buttonVariants };
