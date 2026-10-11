import Link from "next/link";
import { Zap, ArrowLeft } from "lucide-react";

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-paper px-4 text-center">
      <div className="mb-6 flex h-16 w-16 items-center justify-center rounded-xl bg-accent">
        <Zap size={28} className="text-ink" />
      </div>

      <p className="mb-2 text-6xl font-black leading-none tracking-tight text-ink">404</p>
      <h1 className="t-h2 mb-2 text-ink">Page not found</h1>
      <p className="mb-8 max-w-xs text-sm text-muted">
        The page you&apos;re looking for doesn&apos;t exist or has been moved.
      </p>

      <Link href="/" className="btn-primary">
        <ArrowLeft size={14} />
        Back to Home
      </Link>
    </div>
  );
}
