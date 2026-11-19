import { DiagonalMotif } from "@/components/brand/diagonal-motif";
import { MasterLogo } from "@/components/brand/logo";
import { TAGLINE } from "@/lib/brand/schools";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid min-h-screen lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]">
      {/* Brand hero: solid field + darker diagonal triangles (§5.4). */}
      <aside className="relative hidden overflow-hidden lg:block" aria-hidden="true">
        <DiagonalMotif variant="hero" tone="sky" className="absolute inset-0 h-full w-full" />
        <div className="relative flex h-full flex-col justify-between p-10 text-white">
          <MasterLogo negative height={56} priority />
          <div className="max-w-sm space-y-3 pb-6">
            <p className="font-heading text-3xl font-semibold leading-tight">{TAGLINE}</p>
            <p className="text-base text-white">
              Portal Academic Excellence — memantau kesiapan TKA dan prestasi siswa di lima sekolah Talenta Juara.
            </p>
          </div>
        </div>
      </aside>

      <main className="flex flex-col">
        <div className="lg:hidden">
          <DiagonalMotif variant="strip" />
        </div>
        <div className="flex flex-1 items-center justify-center px-6 py-12">
          <div className="w-full max-w-sm">{children}</div>
        </div>
      </main>
    </div>
  );
}
