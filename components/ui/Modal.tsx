"use client";

import React, { useEffect, useId, useRef } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { motion, AnimatePresence } from "framer-motion";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ModalProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  description?: string;
  children: React.ReactNode;
  size?: "sm" | "md" | "lg" | "xl";
  /** Prevent closing when clicking the backdrop */
  disableBackdropClose?: boolean;
  className?: string;
}

const sizeClasses: Record<NonNullable<ModalProps["size"]>, string> = {
  sm: "max-w-sm",
  md: "max-w-md",
  lg: "max-w-lg",
  xl: "max-w-2xl",
};

// ─── Modal ────────────────────────────────────────────────────────────────────

export function Modal({
  open,
  onClose,
  title,
  description,
  children,
  size = "md",
  disableBackdropClose = false,
  className,
}: ModalProps) {
  const titleId = useId();
  const descriptionId = useId();
  const returnFocusRef = useRef<HTMLElement | null>(null);
  const wasOpenRef = useRef(false);

  const restoreFocus = () => {
    const target = returnFocusRef.current;
    if (target && document.contains(target)) target.focus();
    returnFocusRef.current = null;
  };

  useEffect(() => {
    if (open && !wasOpenRef.current) {
      returnFocusRef.current = document.activeElement as HTMLElement | null;
    }
    wasOpenRef.current = open;

    if (open) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  return (
    <Dialog.Root
      open={open}
      onOpenChange={(nextOpen) => {
        if (nextOpen) {
          returnFocusRef.current = document.activeElement as HTMLElement | null;
        } else {
          onClose();
        }
      }}
    >
      <Dialog.Portal>
        <AnimatePresence>
          {open && (
            <>
              <Dialog.Overlay asChild forceMount>
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.2 }}
                  className="fixed inset-0 z-50 bg-ink/40"
                  onClick={disableBackdropClose ? undefined : onClose}
                  aria-hidden="true"
                />
              </Dialog.Overlay>

              {/* Radix owns the dialog semantics, focus trap and keyboard
                  handling on <Dialog.Content>; the motion.div only animates
                  the panel visually inside it. This keeps every Radix prop
                  (onEscapeKeyDown, onCloseAutoFocus, …) typed and handled by
                  Radix itself instead of forwarding them to framer-motion. */}
              <Dialog.Content
                forceMount
                aria-describedby={description ? descriptionId : undefined}
                className={cn(
                  "fixed z-50 w-full max-w-[calc(100vw-1rem)]",
                  "left-0 right-0 bottom-0 sm:bottom-auto",
                  "sm:left-1/2 sm:right-auto sm:top-1/2 sm:-translate-x-1/2 sm:-translate-y-1/2",
                  sizeClasses[size],
                  className
                )}
                onEscapeKeyDown={(event) => {
                  event.preventDefault();
                  onClose();
                }}
                onCloseAutoFocus={(event) => {
                  event.preventDefault();
                  restoreFocus();
                }}
              >
                <motion.div
                  initial={{ opacity: 0, y: 24 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 16 }}
                  transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
                  className={cn(
                    "relative flex flex-col w-full overflow-hidden",
                    "bg-surface border border-line shadow-pop",
                    "max-h-[92dvh] sm:max-h-[85dvh]",
                    "rounded-t-lg sm:rounded-lg"
                  )}
                  onClick={(e) => e.stopPropagation()}
                >
                  <div className="flex justify-center pt-3 sm:hidden">
                    <div className="w-8 h-1 rounded-full bg-line" />
                  </div>

                  {(title || description) && (
                    <div className="flex items-start justify-between gap-4 px-5 sm:px-6 pt-4 sm:pt-6 pb-0 shrink-0">
                      <div>
                        {title && (
                          <Dialog.Title asChild>
                            <h2 id={titleId} className="t-h3 text-ink">
                              {title}
                            </h2>
                          </Dialog.Title>
                        )}
                        {description && (
                          <Dialog.Description asChild>
                            <p id={descriptionId} className="mt-1 text-sm text-muted">
                              {description}
                            </p>
                          </Dialog.Description>
                        )}
                      </div>
                      <Dialog.Close asChild>
                        <button
                          onClick={onClose}
                          className="shrink-0 w-7 h-7 rounded-sm flex items-center justify-center text-muted-faint hover:text-ink hover:bg-paper transition-colors"
                          aria-label="Close modal"
                        >
                          <X size={15} />
                        </button>
                      </Dialog.Close>
                    </div>
                  )}

                  {!title && (
                    <Dialog.Title className="sr-only">Dialog</Dialog.Title>
                  )}

                  {!title && !description && (
                    <Dialog.Close asChild>
                      <button
                        onClick={onClose}
                        className="absolute top-4 right-4 z-10 w-7 h-7 rounded-sm flex items-center justify-center text-muted-faint hover:text-ink hover:bg-paper transition-colors"
                        aria-label="Close modal"
                      >
                        <X size={15} />
                      </button>
                    </Dialog.Close>
                  )}

                  <div className="px-5 sm:px-6 py-5 sm:py-6 overflow-y-auto flex-1 min-h-0">
                    {children}
                  </div>
                </motion.div>
              </Dialog.Content>
            </>
          )}
        </AnimatePresence>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

// ─── Modal footer helper ──────────────────────────────────────────────────────

export function ModalFooter({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex items-center justify-end gap-2 pt-4 mt-2 border-t border-line",
        className
      )}
    >
      {children}
    </div>
  );
}
