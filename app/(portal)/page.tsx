import Link from "next/link";
import { Suspense } from "react";
import { BarChart3, Trophy, Upload } from "lucide-react";
import { DiagonalMotif } from "@/components/brand/diagonal-motif";
import { SchoolLogo } from "@/components/brand/logo";
import { PageHeader, TableSkeleton } from "@/components/layout/page";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { canWriteData } from "@/lib/auth/roles";
import { queryAsUser, requireUser } from "@/lib/auth/session";
import { isSchoolCode, TAGLINE } from "@/lib/brand/schools";
import { formatNumber } from "@/lib/format/id";
import { listSchoolsWithCounts } from "@/lib/queries/master";

export default function HomePage() {
  return (
    <>
      <PageHeader title="Beranda" description={TAGLINE} />
      <Suspense fallback={<TableSkeleton rows={5} />}>
        <HomeContent />
      </Suspense>
    </>
  );
}

async function HomeContent() {
  const user = await requireUser();
  const allSchools = await queryAsUser((tx) => listSchoolsWithCounts(tx));
  const visible = user.schoolId ? allSchools.filter((s) => s.id === user.schoolId) : allSchools;

  const shortcuts = [
    { href: "/tka", label: "TKA Dashboard", desc: "Nilai try out, latihan, dan penguasaan kompetensi.", icon: BarChart3 },
    { href: "/prestasi", label: "Prestasi", desc: "Rekap prestasi per sekolah, tingkat, dan kategori.", icon: Trophy },
    canWriteData(user.role)
      ? { href: "/input", label: "Input Pekanan", desc: "Unggah data pekan ini dan pantau kelengkapannya.", icon: Upload }
      : { href: "/input", label: "Input Pekanan", desc: "Pantau sekolah mana yang sudah dan belum mengisi data pekan ini.", icon: Upload },
  ];

  return (
    <div className="space-y-8">
      <p className="text-base text-brand-gray">
        Assalamu&apos;alaikum, <span className="font-semibold">{user.fullName}</span>.
      </p>

      <section aria-labelledby="pintasan" className="space-y-3">
        <h2 id="pintasan" className="text-lg font-semibold">Pintasan</h2>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {shortcuts.map((s) => (
            <Link
              key={s.href}
              href={s.href}
              className="group flex gap-3 rounded-lg border border-border bg-white p-4 transition-colors hover:border-brand-blue focus-visible:outline-2 focus-visible:outline-brand-sky"
            >
              <s.icon aria-hidden="true" className="mt-0.5 size-5 text-brand-blue" />
              <span>
                <span className="block font-heading font-semibold text-brand-gray group-hover:text-brand-blue">{s.label}</span>
                <span className="block text-sm text-brand-gray-light">{s.desc}</span>
              </span>
            </Link>
          ))}
        </div>
      </section>

      <section aria-labelledby="sekolah" className="space-y-3">
        <h2 id="sekolah" className="text-lg font-semibold">
          {user.schoolId ? "Sekolah Anda" : "Jaringan Sekolah"}
        </h2>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
          {visible.map((s) => (
            <Card key={s.id} className="relative overflow-hidden">
              <DiagonalMotif
                variant="corner"
                tone={s.level === "sd" ? "red" : "blue"}
                className="absolute right-0 top-0 size-8"
              />
              <CardHeader className="pb-0">
                <CardTitle className="text-sm">
                  {/* The branch logo carries the school name; the -m offsets the logo's own clear space against the card padding. */}
                  {isSchoolCode(s.schoolCode) ? <SchoolLogo code={s.schoolCode} name={s.name} className="-m-4" /> : s.name}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="font-heading text-3xl font-semibold text-brand-gray">{formatNumber(s.studentCount)}</p>
                <p className="text-xs text-brand-gray-light">siswa aktif · {s.schoolCode}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>
    </div>
  );
}
