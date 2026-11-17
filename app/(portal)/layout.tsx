import Link from "next/link";
import { Suspense } from "react";
import { DiagonalMotif } from "@/components/brand/diagonal-motif";
import { MasterLogo } from "@/components/brand/logo";
import { MobileNav } from "@/components/layout/mobile-nav";
import { SidebarNav } from "@/components/layout/sidebar-nav";
import { UserMenu } from "@/components/layout/user-menu";
import { Skeleton } from "@/components/ui/skeleton";
import { requireUser } from "@/lib/auth/session";
import { navForRole } from "@/lib/nav";

/**
 * Portal shell. The static frame (header, logo, motif) renders immediately;
 * everything that depends on the session sits behind <Suspense>, as required
 * with cacheComponents (reading cookies outside a boundary is a build error).
 */
export default function PortalLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col">
      <a
        href="#konten"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-white focus:px-4 focus:py-2 focus:text-brand-blue"
      >
        Lewati ke konten utama
      </a>
      <header className="sticky top-0 z-40 bg-white">
        <div className="flex h-16 items-center gap-2 px-3 lg:px-4">
          <Suspense fallback={<div className="size-8 lg:hidden" />}>
            <MobileNavForUser />
          </Suspense>
          <Link href="/" aria-label="Beranda Portal Academic Excellence" className="-my-3 rounded-md focus-visible:outline-2 focus-visible:outline-brand-sky">
            <MasterLogo height={30} priority />
          </Link>
          <span className="hidden border-l border-border pl-4 font-heading text-base font-semibold text-brand-gray sm:block">
            Portal Academic Excellence
          </span>
          <div className="ml-auto">
            <Suspense fallback={<Skeleton className="h-8 w-40" />}>
              <UserMenuForUser />
            </Suspense>
          </div>
        </div>
        <DiagonalMotif variant="strip" tone="blue" />
      </header>

      <div className="flex flex-1">
        <aside className="hidden w-60 shrink-0 border-r border-border bg-white px-3 py-6 lg:block">
          <Suspense fallback={<NavSkeleton />}>
            <SidebarForUser />
          </Suspense>
        </aside>
        <main id="konten" className="min-w-0 flex-1 bg-muted/40 px-4 py-6 lg:px-8">
          {children}
        </main>
      </div>
    </div>
  );
}

async function SidebarForUser() {
  const user = await requireUser();
  return <SidebarNav sections={navForRole(user.role)} />;
}

async function MobileNavForUser() {
  const user = await requireUser();
  return <MobileNav sections={navForRole(user.role)} />;
}

async function UserMenuForUser() {
  const user = await requireUser();
  return <UserMenu user={user} />;
}

function NavSkeleton() {
  return (
    <div className="space-y-3" aria-hidden="true">
      {Array.from({ length: 8 }, (_, i) => (
        <Skeleton key={i} className="h-8 w-full" />
      ))}
    </div>
  );
}
