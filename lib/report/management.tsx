import "server-only";
import { Document, Image, Page, Polygon, Rect, renderToBuffer, StyleSheet, Svg, Text, View } from "@react-pdf/renderer";
import { CATEGORY_LABEL, LEVEL_LABEL, LEVELS } from "@/lib/achievements/labels";
import { loadAchievementView, parseAchievementFilters, type AchievementView } from "@/lib/achievements/load";
import type { RlsTx } from "@/lib/db/rls";
import { formatNumber, formatPercent, formatWeek, weekStartOf } from "@/lib/format/id";
import { INPUT_STATUS_LABEL, type InputStatus } from "@/lib/metrics/input-status";
import { loadMasterLogo, PDF_COLORS as C, PDF_FONTS as F, registerPdfFonts } from "@/lib/pdf/theme";
import { loadWeekStatus, type SchoolWeekStatus } from "@/lib/queries/input-status";
import { parseTkaFilters, SUBJECT_CODES, SUBJECT_LABEL, type SubjectCode } from "@/lib/tka/filters";
import { loadContext, loadNetworkView, type Kpis } from "@/lib/tka/load";

/**
 * Laporan Manajemen (CLAUDE.md §11 Fase 5): one PDF with the TKA summary per
 * subject, achievements recap, and this week's input completeness. Built from
 * the same loaders as the dashboards, so the numbers always match.
 */

type Params = Record<string, string | string[] | undefined>;

export interface ManagementReport {
  periodLabel: string;
  tka: {
    code: SubjectCode;
    name: string;
    kpis: Kpis;
    bySchool: { code: string; name: string; tryoutName: string | null; average: number | null; n: number }[];
    weakest: { code: string; name: string; level: string; ratio: number | null; items: number }[];
  }[];
  achievements: AchievementView;
  input: { weekStart: string; schools: SchoolWeekStatus[] };
}

export async function loadManagementReport(tx: RlsTx, raw: Params, today: string): Promise<ManagementReport | null> {
  const tka: ManagementReport["tka"] = [];
  let first: Awaited<ReturnType<typeof loadContext>> = null;
  for (const code of SUBJECT_CODES) {
    const ctx = await loadContext(tx, parseTkaFilters({ ...raw, mapel: code, sekolah: undefined }), today);
    if (!ctx) return null;
    first ??= ctx;
    const net = await loadNetworkView(tx, ctx);
    tka.push({
      code,
      name: SUBJECT_LABEL[code],
      kpis: net.kpis,
      bySchool: ctx.schools.map((s) => {
        const last = net.trend.find((t) => t.id === s.id)?.points.filter((p) => p.average != null).at(-1);
        return { code: s.code, name: s.name, tryoutName: last?.tryoutName ?? null, average: last?.average ?? null, n: last?.n ?? 0 };
      }),
      weakest: net.weakest.slice(0, 5).map((w) => ({ code: w.code, name: w.name, level: w.level.toUpperCase(), ratio: w.ratio, items: w.items })),
    });
  }
  const ctx = first!;
  const achievements = await loadAchievementView(tx, ctx, parseAchievementFilters({ ...raw, sekolah: undefined }), null);
  const weekStart = weekStartOf(ctx.period.asOf);
  return { periodLabel: ctx.period.label, tka, achievements, input: { weekStart, schools: await loadWeekStatus(tx, weekStart) } };
}

// ---------------------------------------------------------------------------
// PDF
// ---------------------------------------------------------------------------

const PAGE_W = 595.28;
const PAD = 36;
const CONTENT_W = PAGE_W - PAD * 2;

const s = StyleSheet.create({
  page: { paddingHorizontal: PAD, paddingTop: PAD, paddingBottom: 48, fontSize: 9, color: C.text, ...F.body },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end", marginBottom: 8 },
  title: { fontSize: 17, color: C.blue, ...F.heading },
  sub: { fontSize: 9, color: C.muted, marginTop: 2 },
  h2: { fontSize: 12.5, color: C.blue, marginTop: 14, marginBottom: 6, ...F.heading },
  h3: { fontSize: 10, marginTop: 8, marginBottom: 3, ...F.headingSemi },
  kpis: { flexDirection: "row", gap: 6, marginBottom: 4 },
  kpi: { flex: 1, borderWidth: 0.6, borderColor: C.border, borderRadius: 3, padding: 6 },
  kpiLabel: { fontSize: 7.5, color: C.muted },
  kpiValue: { fontSize: 15, marginTop: 1, ...F.heading },
  kpiNote: { fontSize: 7, color: C.muted, marginTop: 1 },
  row: { flexDirection: "row", borderBottomWidth: 0.5, borderBottomColor: C.border, paddingVertical: 3 },
  th: { color: C.muted, fontSize: 8, ...F.bodyBold },
  note: { fontSize: 7.5, color: C.muted, marginTop: 3 },
  footer: { position: "absolute", bottom: 20, left: PAD, right: PAD, fontSize: 7, color: C.muted, flexDirection: "row", justifyContent: "space-between" },
});

/** Brand motif (§5.4): solid strip with a darker diagonal cut, used sparingly. */
function Strip() {
  const h = 7;
  return (
    <Svg width={CONTENT_W} height={h} style={{ marginBottom: 10 }}>
      <Rect x={0} y={0} width={CONTENT_W} height={h} fill={C.sky} />
      <Polygon points={`${CONTENT_W - 150},${h} ${CONTENT_W - 135},0 ${CONTENT_W},0 ${CONTENT_W},${h}`} fill={C.skyDeep} />
      <Polygon points={`${CONTENT_W - 60},${h} ${CONTENT_W - 45},0 ${CONTENT_W},0 ${CONTENT_W},${h}`} fill={C.skyDeeper} />
    </Svg>
  );
}

function Kpi({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <View style={s.kpi}>
      <Text style={s.kpiLabel}>{label}</Text>
      <Text style={s.kpiValue}>{value}</Text>
      {note ? <Text style={s.kpiNote}>{note}</Text> : null}
    </View>
  );
}

const score = (v: number | null) => (v == null ? "–" : v.toLocaleString("id-ID", { maximumFractionDigits: 1 }));
const signed = (v: number | null) => (v == null ? "" : `${v > 0 ? "+" : ""}${v.toLocaleString("id-ID", { maximumFractionDigits: 1 })}`);
const statusText = (st: InputStatus | null) => (st ? INPUT_STATUS_LABEL[st] : "–");

export async function managementPdf(r: ManagementReport, meta: { generatedAt: string }): Promise<Uint8Array> {
  registerPdfFonts();
  const logo = await loadMasterLogo();
  const a = r.achievements;
  const prevPct = (cur: number, prev: number) => (prev ? `${cur >= prev ? "+" : ""}${Math.round(((cur - prev) / prev) * 100)}% vs tahun lalu (${formatNumber(prev)})` : `tahun lalu: ${formatNumber(prev)}`);

  const doc = (
    <Document title={`Laporan Manajemen — ${r.periodLabel}`} author="Portal Academic Excellence — Sekolah Talenta Juara" language="id">
      <Page size="A4" style={s.page}>
        <View style={s.header} fixed>
          <View>
            <Text style={s.title}>Laporan Manajemen Academic Excellence</Text>
            <Text style={s.sub}>{r.periodLabel} · Lima sekolah Talenta Juara</Text>
          </View>
          {/* react-pdf <Image> has no alt attribute; the title text carries the meaning. */}
          {/* eslint-disable-next-line jsx-a11y/alt-text */}
          {logo ? <Image src={{ data: logo, format: "png" }} style={{ height: 30 }} /> : null}
        </View>
        <View fixed>
          <Strip />
        </View>

        <Text style={[s.h2, { marginTop: 2 }]}>1. Persiapan TKA</Text>
        <Text style={{ marginBottom: 2 }}>
          <Text style={F.bodyBold}>{formatNumber(r.tka[0]!.kpis.needsIntervention)}</Text> dari {formatNumber(r.tka[0]!.kpis.students)} siswa perlu intervensi (status keseluruhan Perlu Intervensi atau berisiko); di antaranya{" "}
          <Text style={F.bodyBold}>{formatNumber(r.tka[0]!.kpis.atRisk)}</Text> siswa berisiko karena nilai TO di bawah target berturut-turut atau turun tajam (aturan di menu Pengaturan).
        </Text>
        {r.tka.map((t) => (
          <View key={t.code} wrap={false}>
            <Text style={s.h3}>{t.name}{t.kpis.target != null ? ` · target nilai ${t.kpis.target}` : ""}</Text>
            <View style={s.kpis}>
              <Kpi label="Rata-rata TO terakhir" value={score(t.kpis.average)} note={t.kpis.delta != null ? `${signed(t.kpis.delta)} vs TO sebelumnya` : "belum ada TO pembanding"} />
              <Kpi label="Siswa mencapai target" value={formatPercent(t.kpis.shareMeetingTarget)} />
              <Kpi label="Partisipasi TO" value={formatPercent(t.kpis.participation)} note={`${formatNumber(t.kpis.present)} dari ${formatNumber(t.kpis.expected)} siswa`} />
              <Kpi label="Soal latihan pekan ini" value={formatNumber(t.kpis.practiceThisWeek)} note={formatWeek(t.kpis.practiceWeekStart)} />
            </View>
          </View>
        ))}

        <Text style={s.h3}>Nilai TO terakhir per sekolah</Text>
        <View style={[s.row, s.th]}>
          <Text style={{ width: "34%" }}>Sekolah</Text>
          {r.tka.map((t) => (
            <Text key={t.code} style={{ width: "33%", textAlign: "right" }}>{t.name}</Text>
          ))}
        </View>
        {r.tka[0]!.bySchool.map((sc, i) => (
          <View key={sc.code} style={s.row} wrap={false}>
            <Text style={{ width: "34%" }}>{sc.name}</Text>
            {r.tka.map((t) => {
              const c = t.bySchool[i]!;
              return (
                <Text key={t.code} style={{ width: "33%", textAlign: "right" }}>
                  {score(c.average)}
                  <Text style={{ color: C.muted, fontSize: 7.5 }}>{c.tryoutName ? `  ${c.tryoutName} · ${formatNumber(c.n)} siswa` : ""}</Text>
                </Text>
              );
            })}
          </View>
        ))}

        <View wrap={false}>
          <Text style={s.h3}>Lima kompetensi terlemah di jaringan</Text>
          <View style={{ flexDirection: "row", gap: 12 }}>
            {r.tka.map((t) => (
              <View key={t.code} style={{ flex: 1 }}>
                <View style={[s.row, s.th]}>
                  <Text style={{ width: "66%" }}>{t.name}</Text>
                  <Text style={{ width: "12%" }}>Jenjang</Text>
                  <Text style={{ width: "22%", textAlign: "right" }}>Penguasaan</Text>
                </View>
                {t.weakest.length === 0 ? <Text style={s.note}>Data belum cukup.</Text> : null}
                {t.weakest.map((w) => (
                  <View key={`${w.level}-${w.code}`} style={s.row}>
                    <Text style={{ width: "66%", paddingRight: 4 }}>{w.name}</Text>
                    <Text style={{ width: "12%", color: C.muted }}>{w.level}</Text>
                    <Text style={{ width: "22%", textAlign: "right" }}>{formatPercent(w.ratio)}</Text>
                  </View>
                ))}
              </View>
            ))}
          </View>
          <Text style={s.note}>Penguasaan = gabungan jawaban TO (70%) dan latihan (30%), data 4 pekan terakhir dibobot lebih berat. Rumus lengkap: docs/METRICS.md.</Text>
        </View>

        <Text style={s.h2} break>2. Prestasi siswa</Text>
        <View style={s.kpis}>
          <Kpi label="Total prestasi" value={formatNumber(a.kpis.total)} note={prevPct(a.kpis.total, a.kpis.previousTotal)} />
          <Kpi label="Siswa berprestasi (unik)" value={formatNumber(a.kpis.students)} note={prevPct(a.kpis.students, a.kpis.previousStudents)} />
          <Kpi label="Nasional & internasional" value={formatNumber(a.kpis.nationalPlus)} note={prevPct(a.kpis.nationalPlus, a.kpis.previousNationalPlus)} />
          <Kpi label="Poin Prestasi" value={formatNumber(a.kpis.points)} note="bobot tingkat × peringkat" />
        </View>
        <Text style={s.h3}>Prestasi per sekolah dan tingkat</Text>
        <View style={[s.row, s.th]}>
          <Text style={{ width: "28%" }}>Sekolah</Text>
          {LEVELS.map((l) => (
            <Text key={l} style={{ width: "12%", textAlign: "right" }}>{LEVEL_LABEL[l]}</Text>
          ))}
          <Text style={{ width: "10%", textAlign: "right" }}>Lainnya</Text>
          <Text style={{ width: "7%", textAlign: "right" }}>Total</Text>
          <Text style={{ width: "7%", textAlign: "right" }}>Poin</Text>
        </View>
        {a.schools.map((sc) => {
          const c = a.bySchoolLevel[sc.id]!;
          return (
            <View key={sc.id} style={s.row} wrap={false}>
              <Text style={{ width: "28%" }}>{sc.name}</Text>
              {LEVELS.map((l) => (
                <Text key={l} style={{ width: "12%", textAlign: "right" }}>{formatNumber(c[l])}</Text>
              ))}
              <Text style={{ width: "10%", textAlign: "right" }}>{formatNumber(c.KOSONG)}</Text>
              <Text style={{ width: "7%", textAlign: "right" }}>{formatNumber(Object.values(c).reduce((x, y) => x + y, 0))}</Text>
              <Text style={{ width: "7%", textAlign: "right" }}>{formatNumber(a.pointsBySchool.find((p) => p.schoolId === sc.id)?.points ?? 0)}</Text>
            </View>
          );
        })}
        <Text style={s.note}>
          Akademik {formatNumber(a.academic.academic)} · Non-akademik {formatNumber(a.academic.nonAcademic)}
          {a.academic.unknown ? ` · belum dikategorikan ${formatNumber(a.academic.unknown)}` : ""}. Kategori terbanyak:{" "}
          {Object.entries(a.byCategory)
            .filter(([k, v]) => k !== "KOSONG" && v > 0)
            .sort((x, y) => y[1] - x[1])
            .slice(0, 3)
            .map(([k, v]) => `${CATEGORY_LABEL[k as keyof typeof CATEGORY_LABEL]} (${formatNumber(v)})`)
            .join(", ") || "–"}
          .
        </Text>

        <View wrap={false}>
          <Text style={s.h3}>Siswa dengan prestasi terbanyak</Text>
          <View style={[s.row, s.th]}>
            <Text style={{ width: "50%" }}>Nama</Text>
            <Text style={{ width: "26%" }}>Sekolah</Text>
            <Text style={{ width: "12%", textAlign: "right" }}>Prestasi</Text>
            <Text style={{ width: "12%", textAlign: "right" }}>Poin</Text>
          </View>
          {a.top.slice(0, 5).map((t) => (
            <View key={t.key} style={s.row}>
              <Text style={{ width: "50%" }}>{t.name}</Text>
              <Text style={{ width: "26%" }}>{a.schools.find((x) => x.id === t.schoolId)?.code ?? ""}</Text>
              <Text style={{ width: "12%", textAlign: "right" }}>{formatNumber(t.count)}</Text>
              <Text style={{ width: "12%", textAlign: "right" }}>{formatNumber(t.points)}</Text>
            </View>
          ))}
          {a.top.length === 0 ? <Text style={s.note}>Belum ada prestasi pada periode ini.</Text> : null}
        </View>

        <View wrap={false}>
          <Text style={s.h2}>3. Kelengkapan input {formatWeek(r.input.weekStart)}</Text>
          <View style={[s.row, s.th]}>
            <Text style={{ width: "34%" }}>Sekolah</Text>
            <Text style={{ width: "22%" }}>Hasil TO</Text>
            <Text style={{ width: "22%" }}>Latihan pekanan</Text>
            <Text style={{ width: "10%", textAlign: "right" }}>Prestasi</Text>
            <Text style={{ width: "12%", textAlign: "right" }}>Status</Text>
          </View>
          {r.input.schools.map((sc) => (
            <View key={sc.schoolId} style={s.row}>
              <Text style={{ width: "34%" }}>{sc.name}</Text>
              <Text style={{ width: "22%" }}>
                {sc.tryouts.length === 0 ? "Tidak ada TO" : sc.tryouts.map((t) => `${INPUT_STATUS_LABEL[t.status]}`).join(" / ")}
              </Text>
              <Text style={{ width: "22%" }}>{INPUT_STATUS_LABEL[sc.practice.status]} ({formatNumber(sc.practice.students)}/{formatNumber(sc.expected)})</Text>
              <Text style={{ width: "10%", textAlign: "right" }}>{formatNumber(sc.achievements.count)}</Text>
              <Text style={{ width: "12%", textAlign: "right", ...F.bodyBold }}>{statusText(sc.overall)}</Text>
            </View>
          ))}
          <Text style={s.note}>Lengkap = latihan semua siswa kelas 6/9 dan hasil TO (pekan ini atau pekan lalu, per butir) sudah masuk. Prestasi hanya informasi.</Text>
        </View>

        <View style={s.footer} fixed>
          <Text>Sekolah Talenta Juara · Developing Capable Muslim Leaders · Dokumen internal — berisi data siswa</Text>
          <Text render={({ pageNumber, totalPages }) => `${meta.generatedAt} · hal. ${pageNumber}/${totalPages}`} />
        </View>
      </Page>
    </Document>
  );
  return new Uint8Array(await renderToBuffer(doc));
}
