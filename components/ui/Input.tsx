"use client";

import React from "react";
import { cn } from "@/lib/utils";

// ─── Input ────────────────────────────────────────────────────────────────────

export interface InputProps
  extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  hint?: string;
  leading?: React.ReactNode;   // icon/text inside left edge
  trailing?: React.ReactNode;  // icon/text inside right edge
}

const FIELD_BASE =
  "w-full rounded-md border bg-surface px-3.5 py-2.5 text-sm text-ink transition-colors duration-150 " +
  "placeholder:text-muted-faint border-line hover:border-muted-faint";

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  (
    {
      label,
      error,
      hint,
      leading,
      trailing,
      className,
      id,
      required,
      ...props
    },
    ref
  ) => {
    const inputId = id ?? label?.toLowerCase().replace(/\s+/g, "-");

    return (
      <div className="flex flex-col gap-1.5">
        {label && (
          <label htmlFor={inputId} className="t-eyebrow">
            {label}
            {required && <span className="ml-0.5 text-danger">*</span>}
          </label>
        )}

        <div className="relative flex items-center">
          {leading && (
            <div className="pointer-events-none absolute left-3 flex items-center text-muted-faint">
              {leading}
            </div>
          )}

          <input
            ref={ref}
            id={inputId}
            required={required}
            aria-invalid={error ? true : undefined}
            className={cn(
              FIELD_BASE,
              error && "border-danger hover:border-danger",
              leading && "pl-9",
              trailing && "pr-9",
              className,
            )}
            {...props}
          />

          {trailing && (
            <div className="pointer-events-none absolute right-3 flex items-center text-muted-faint">
              {trailing}
            </div>
          )}
        </div>

        {error && <p className="text-xs font-medium text-danger">{error}</p>}
        {hint && !error && <p className="text-xs text-muted-faint">{hint}</p>}
      </div>
    );
  }
);

Input.displayName = "Input";

// ─── Textarea variant ─────────────────────────────────────────────────────────

export interface TextareaProps
  extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  error?: string;
  hint?: string;
}

export const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ label, error, hint, className, id, required, ...props }, ref) => {
    const inputId = id ?? label?.toLowerCase().replace(/\s+/g, "-");

    return (
      <div className="flex flex-col gap-1.5">
        {label && (
          <label htmlFor={inputId} className="t-eyebrow">
            {label}
            {required && <span className="ml-0.5 text-danger">*</span>}
          </label>
        )}
        <textarea
          ref={ref}
          id={inputId}
          required={required}
          aria-invalid={error ? true : undefined}
          className={cn(
            FIELD_BASE,
            "resize-none",
            error && "border-danger hover:border-danger",
            className,
          )}
          rows={3}
          {...props}
        />
        {error && <p className="text-xs font-medium text-danger">{error}</p>}
        {hint && !error && <p className="text-xs text-muted-faint">{hint}</p>}
      </div>
    );
  }
);

Textarea.displayName = "Textarea";
