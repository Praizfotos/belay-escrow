import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-2xs font-semibold transition-colors",
  {
    variants: {
      variant: {
        lime: "bg-accent-soft text-accent-ink border border-accent/40",
        dark: "bg-ink text-white border border-transparent",
        outline: "bg-transparent text-ink border border-line",
        solid: "bg-ink text-white border border-transparent",
        white: "bg-surface text-ink border border-line",
        warn: "bg-warn-soft text-warn border border-warn/25",
        danger: "bg-danger-soft text-danger border border-danger/25",
      },
    },
    defaultVariants: {
      variant: "lime",
    },
  }
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return (
    <span className={cn(badgeVariants({ variant }), className)} {...props} />
  );
}

export { Badge, badgeVariants };
