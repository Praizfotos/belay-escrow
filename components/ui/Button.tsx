"use client";

import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md font-semibold transition-colors duration-150 disabled:pointer-events-none disabled:opacity-50 active:opacity-90",
  {
    variants: {
      variant: {
        // Primary action = ink. The lime accent is reserved for indicators,
        // success states and the rare hero CTA.
        primary:
          "bg-ink text-white hover:bg-ink-soft",
        secondary:
          "bg-surface text-ink border border-line hover:border-muted-faint",
        accent:
          "bg-accent text-ink hover:brightness-95",
        dark: "bg-ink text-white hover:bg-ink-soft",
        ghost: "text-ink hover:bg-ink/5",
        "ghost-white": "text-white hover:bg-white/10",
        outline:
          "border border-ink text-ink hover:bg-ink hover:text-white",
        "outline-lime":
          "border border-accent text-accent hover:bg-accent hover:text-ink",
        destructive: "bg-danger text-white hover:brightness-90",
      },
      size: {
        sm: "px-3 py-1.5 text-sm rounded-sm",
        md: "px-4 py-2.5 text-sm",
        lg: "px-6 py-3 text-sm",
        xl: "px-8 py-4 text-base",
        icon: "h-9 w-9 rounded-md",
      },
    },
    defaultVariants: {
      variant: "primary",
      size: "md",
    },
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
  loading?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, loading, children, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        disabled={loading || props.disabled}
        {...props}
      >
        {loading ? (
          <>
            <span className="h-4 w-4 rounded-full border-2 border-current border-t-transparent animate-spin" />
            {children}
          </>
        ) : (
          children
        )}
      </Comp>
    );
  }
);
Button.displayName = "Button";

export { Button, buttonVariants };
