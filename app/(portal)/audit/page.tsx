import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { and, asc, desc, eq, gte, like, lt, sql, type SQL } from "drizzle-orm";
import { History } from "lucide-react";
import { z } from "zod";
import { EmptyState, PageHeader, TableSkeleton } from "@/components/layout/page";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ACTION_LABEL, diffRows, ENTITY_LABEL, summarize } from "@/lib/audit/format";
import { queryAsUser, requireUser } from "@/lib/auth/session";
import { auditLogs, profiles, schools } from "@/lib/db/schema";
import { TIME_ZONE } from "@/lib/format/id";
import { formatDateTime } from "../input/status";

export const metadata: Metadata = { title: "Audit Log" };

const PAGE_SIZE = 50;
const selectClass = "h-9 w-full rounded-lg border border-input bg-white px-2 text-sm focus-visible:outline-2 focus-visible:outline-brand-sky";
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

const filterSchema = z.object({
  entitas: z.string().refine((v) => v in ENTITY_LABEL).optional().catch(undefined),
  aksi: z.enum(["insert", "update", "delete", "bulk"]).optional().catch(undefined),
  pengguna: z.uuid().optional().catch(undefined),
  sekolah: z.uuid().optional().catch(undefined),
  dari: isoDate.optional().catch(undefined),
  sampai: isoDate.optional().catch(undefined),
  hal: z.coerce.number().int().min(1).max(10_000).catch(1).default(1),
});

export default function AuditLogPage(props: PageProps<"/audit">) {
  return (
    <>
      <PageHeader
        title="Audit Log"
        description="Riwayat setiap penambahan, perubahan, penghapusan, dan impor data: siapa, kapan, dan apa yang berubah. Isi file unggahan tidak ditampilkan di sini."
      />
      <Suspense fallback={<TableSkeleton rows={10} />}>
        <Content searchParams={props.searchParams} />
      </Suspense>
    </>
  );
}

async function Content({ searchParams }: { searchParams: PageProps<"/audit">["searchParams"] }) {
  await requireUser(["super_admin"]);
  const raw = await searchParams;
  const one = (k: string) => (typeof raw[k] === "string" && raw[k] !== "" ? (raw[k] as string) : undefined);
  const f = filterSchema.parse({ entitas: one("entitas"), aksi: one("aksi"), pengguna: one("pengguna"), sekolah: one("sekolah"), dari: one("dari"), sampai: one("sampai"), hal: one("hal") });

  const where: SQL[] = [];
  if (f.entitas) where.push(eq(auditLogs.entity, f.entitas));
  if (f.aksi) where.push(f.aksi === "bulk" ? like(auditLogs.action, "bulk_%") : eq(auditLogs.action, f.aksi));
  if (f.pengguna) where.push(eq(auditLogs.userId, f.pengguna));
  if (f.sekolah) where.push(eq(auditLogs.schoolId, f.sekolah));
  if (f.dari) where.push(gte(auditLogs.createdAt, sql`(${f.dari}::date)::timestamp at time zone ${TIME_ZONE}`));
  if (f.sampai) where.push(lt(auditLogs.createdAt, sql`(${f.sampai}::date + 1)::timestamp at time zone ${TIME_ZONE}`));

  const { rows, users, schoolList } = await queryAsUser(async (tx) => {
    // Strip large columns in SQL: batch rows can carry uploaded file contents, which must not leave the database here.
    const strippedDiff = sql<unknown>`${auditLogs.diffJson} #- '{new,source_json}' #- '{old,source_json}' #- '{new,snapshot_json}' #- '{old,snapshot_json}' #- '{new,mapping_json}' #- '{old,mapping_json}'`;
    const rows = await tx
      .select({ id: auditLogs.id, userId: auditLogs.userId, action: auditLogs.action, entity: auditLogs.entity, schoolId: auditLogs.schoolId, createdAt: auditLogs.createdAt, diffJson: strippedDiff })
      .from(auditLogs)
      .where(where.length ? and(...where) : undefined)
      .orderBy(desc(auditLogs.createdAt), desc(auditLogs.id))
      .limit(PAGE_SIZE + 1)
      .offset((f.hal - 1) * PAGE_SIZE);
    const users = await tx.select({ id: profiles.id, name: profiles.fullName }).from(profiles).orderBy(asc(profiles.fullName));
    const schoolList = await tx.select({ id: schools.id, code: schools.schoolCode }).from(schools).orderBy(asc(schools.level), asc(schools.schoolCode));
    return { rows, users, schoolList };
  });
  const hasNext = rows.length > PAGE_SIZE;
  const shown = rows.slice(0, PAGE_SIZE);
  const userName = new Map(users.map((u) => [u.id, u.name]));
  const schoolCode = new Map(schoolList.map((s) => [s.id, s.code]));
  const names = new Map([...userName, ...schoolCode]);

  const pageHref = (p: number) => {
    const sp = new URLSearchParams();
    for (const k of ["entitas", "aksi", "pengguna", "sekolah", "dari", "sampai"] as const) if (f[k]) sp.set(k, f[k]!);
    if (p > 1) sp.set("hal", String(p));
    const qs = sp.toString();
    return qs ? `/audit?${qs}` : "/audit";
  };
  const filtered = Boolean(f.entitas || f.aksi || f.pengguna || f.sekolah || f.dari || f.sampai);

  return (
    <div className="space-y-4">
      <form method="get" action="/audit" className="grid gap-3 rounded-lg border border-border bg-white p-4 sm:grid-cols-3 lg:grid-cols-6" aria-label="Saring audit log">
        <div className="space-y-1">
          <Label htmlFor="entitas">Data</Label>
          <select id="entitas" name="entitas" defaultValue={f.entitas ?? ""} className={selectClass}>
            <option value="">Semua</option>
            {Object.entries(ENTITY_LABEL).map(([k, v]) => (
              <option key={k} value={k}>{v}</option>
            ))}
          </select>
        </div>
        <div className="space-y-1">
          <Label htmlFor="aksi">Aksi</Label>
          <select id="aksi" name="aksi" defaultValue={f.aksi ?? ""} className={selectClass}>
            <option value="">Semua</option>
            <option value="insert">Tambah</option>
            <option value="update">Ubah</option>
            <option value="delete">Hapus</option>
            <option value="bulk">Impor/massal</option>
          </select>
        </div>
        <div className="space-y-1">
          <Label htmlFor="pengguna">Pengguna</Label>
          <select id="pengguna" name="pengguna" defaultValue={f.pengguna ?? ""} className={selectClass}>
            <option value="">Semua</option>
            {users.map((u) => (
              <option key={u.id} value={u.id}>{u.name}</option>
            ))}
          </select>
        </div>
        <div className="space-y-1">
          <Label htmlFor="sekolah">Sekolah</Label>
          <select id="sekolah" name="sekolah" defaultValue={f.sekolah ?? ""} className={selectClass}>
            <option value="">Semua</option>
            {schoolList.map((s) => (
              <option key={s.id} value={s.id}>{s.code}</option>
            ))}
          </select>
        </div>
        <div className="space-y-1">
          <Label htmlFor="dari">Dari tanggal</Label>
          <Input id="dari" name="dari" type="date" defaultValue={f.dari} className="h-9" />
        </div>
        <div className="space-y-1">
          <Label htmlFor="sampai">Sampai tanggal</Label>
          <Input id="sampai" name="sampai" type="date" defaultValue={f.sampai} className="h-9" />
        </div>
        <div className="col-span-full flex items-center gap-3">
          <Button type="submit">Terapkan</Button>
          {filtered ? <Link href="/audit" className="text-sm text-brand-blue hover:underline">Hapus saringan</Link> : null}
        </div>
      </form>

      {shown.length === 0 ? (
        <EmptyState icon={History} title={filtered ? "Tidak ada catatan yang cocok" : "Belum ada catatan audit"} description={filtered ? "Coba longgarkan saringan." : undefined} />
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border bg-white">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Waktu</TableHead>
                <TableHead>Pengguna</TableHead>
                <TableHead>Aksi</TableHead>
                <TableHead>Data</TableHead>
                <TableHead>Sekolah</TableHead>
                <TableHead>Rincian</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {shown.map((r) => {
                const rows = diffRows(r.diffJson, names);
                const single = r.diffJson && typeof r.diffJson === "object" && ("old" in r.diffJson || "new" in r.diffJson);
                return (
                  <TableRow key={r.id} className="align-top">
                    <TableCell className="whitespace-nowrap tabular-nums">{formatDateTime(r.createdAt)}</TableCell>
                    <TableCell>{r.userId ? (userName.get(r.userId) ?? "Pengguna terhapus") : <span className="text-brand-gray-light">Sistem</span>}</TableCell>
                    <TableCell>{ACTION_LABEL[r.action] ?? r.action}</TableCell>
                    <TableCell>{ENTITY_LABEL[r.entity] ?? r.entity}</TableCell>
                    <TableCell className="font-mono text-xs">{r.schoolId ? (schoolCode.get(r.schoolId) ?? "–") : "–"}</TableCell>
                    <TableCell className="min-w-72 max-w-xl whitespace-normal">
                      <span className="block break-words">{summarize(r.action, r.diffJson, names) || "–"}</span>
                      {single && rows.length > 0 ? (
                        <details className="mt-1">
                          <summary className="cursor-pointer text-xs text-brand-blue">Lihat sebelum/sesudah</summary>
                          <table className="mt-1 w-full text-xs">
                            <thead className="text-left text-brand-gray-light">
                              <tr>
                                <th scope="col" className="py-1 pr-2 font-medium">Kolom</th>
                                <th scope="col" className="py-1 pr-2 font-medium">Sebelum</th>
                                <th scope="col" className="py-1 font-medium">Sesudah</th>
                              </tr>
                            </thead>
                            <tbody>
                              {rows.map((d) => (
                                <tr key={d.field} className="border-t border-border/60 align-top">
                                  <th scope="row" className="py-1 pr-2 text-left font-normal text-brand-gray-light">{d.label}</th>
                                  <td className="break-all py-1 pr-2">{d.before ?? ""}</td>
                                  <td className="break-all py-1">{d.after ?? ""}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </details>
                      ) : null}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}

      {f.hal > 1 || hasNext ? (
        <nav aria-label="Halaman" className="flex items-center justify-between text-sm">
          {f.hal > 1 ? <Link href={pageHref(f.hal - 1)} className="text-brand-blue hover:underline">← Lebih baru</Link> : <span />}
          <span className="text-brand-gray-light">Halaman {f.hal}</span>
          {hasNext ? <Link href={pageHref(f.hal + 1)} className="text-brand-blue hover:underline">Lebih lama →</Link> : <span />}
        </nav>
      ) : null}
    </div>
  );
}
