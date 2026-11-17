import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

export function PageHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description?: React.ReactNode;
  actions?: React.ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold">{title}</h1>
        {description ? <p className="max-w-3xl text-sm text-brand-gray-light">{description}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}
    </div>
  );
}

/** Helpful empty state (§12): explain why it is empty and what to do next. */
export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  className,
}: {
  icon: LucideIcon;
  title: string;
  description?: React.ReactNode;
  action?: { href: string; label: string };
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col items-center rounded-lg border border-dashed border-border bg-white px-6 py-12 text-center", className)}>
      <Icon aria-hidden="true" className="mb-3 size-10 text-brand-sky" />
      <p className="font-heading text-lg font-semibold text-brand-gray">{title}</p>
      {description ? <p className="mt-1 max-w-md text-sm text-brand-gray-light">{description}</p> : null}
      {action ? (
        <Link href={action.href} className="mt-4 text-sm font-medium text-brand-blue underline-offset-4 hover:underline">
          {action.label} →
        </Link>
      ) : null}
    </div>
  );
}

export function TableSkeleton({ rows = 8 }: { rows?: number }) {
  return (
    <div className="space-y-2 rounded-lg border border-border bg-white p-4" aria-busy="true" aria-label="Memuat data">
      <Skeleton className="h-8 w-full" />
      {Array.from({ length: rows }, (_, i) => (
        <Skeleton key={i} className="h-6 w-full" />
      ))}
    </div>
  );
}
