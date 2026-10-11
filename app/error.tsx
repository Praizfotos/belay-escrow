"use client";

import { useEffect, useState } from "react";
import { newCorrelationId, reportError } from "@/lib/observability/logger";
import { userFacingMessage } from "@/lib/errors/userMessage";

export default function ErrorBoundary({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  // Generated per error so the id shown to the user matches the reported one.
  const [correlationId] = useState(newCorrelationId);

  // Raw `error.message` is not safe to render: the Supabase paths re-throw
  // PostgREST errors, so this used to be able to print row-level-security and
  // schema text at the user. Messages the app authored for people still show;
  // everything else becomes a generic line and the detail goes to the log only.
  const { message, wasSuppressed } = userFacingMessage(error);

  useEffect(() => {
    // The full error always reaches the reporter — the suppression above changes
    // what is displayed, never what is recorded. `digest` is React's own id for
    // the server-side error, and is what ties this to the server log line.
    reportError("ui.render_error", error, {
      correlationId,
      fields: {
        digest: error.digest,
        boundary: "app/error",
        // Makes the substitution visible rather than silent, so a message that
        // should have been user-facing can be spotted and reworded.
        messageSuppressed: wasSuppressed,
      },
    });
  }, [error, correlationId, wasSuppressed]);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-paper p-4 text-center">
      <div className="card-flat w-full max-w-md p-6">
        <h2 className="t-h3 mb-2 text-danger">Something went wrong</h2>
        <p className="mb-6 text-sm text-muted">{message}</p>
        <button
          type="button"
          onClick={() => reset()}
          className="btn-primary w-full"
        >
          Try again
        </button>
        {/* Gives the user something to quote in a support report that points
            straight at the reported error. */}
        <p className="mt-4 break-all font-mono text-2xs text-muted-faint">
          Reference: {error.digest ?? correlationId}
        </p>
      </div>
    </div>
  );
}
