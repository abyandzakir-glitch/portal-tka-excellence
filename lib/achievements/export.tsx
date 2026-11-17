import "server-only";
import { loadMasterLogo, registerPdfFonts } from "@/lib/pdf/theme";
import { Document, Image, Page, renderToBuffer, StyleSheet, Text, View } from "@react-pdf/renderer";
import { formatNumber } from "@/lib/format/id";
import { buildXlsx } from "@/lib/import/templates/xlsx";
import { ACHIEVEMENT_TEMPLATE_HEADERS } from "@/lib/import/templates/achievements";
import { CATEGORY_LABEL, LEVEL_LABEL, LEVELS, RANK_LABEL } from "./labels";
import type { AchievementView } from "./load";

export interface ExportMeta {
  title: string;
  periodLabel: string;
  filterLabel: string;
  generatedAt: string;
  schoolCode: (id: string) => string;
}

const ddmmyyyy = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;

/**
 * Excel export: "Data Prestasi" uses the canonical 10-column template layout
 * (so it can be re-imported), plus "Ringkasan" with the key numbers.
 */
export function achievementsXlsx(view: AchievementView, meta: ExportMeta): Uint8Array {
  const data = [
    [...ACHIEVEMENT_TEMPLATE_HEADERS, "Poin"],
    ...view.records.map((a) => [
      ddmmyyyy(a.achievedOn),
      meta.schoolCode(a.schoolId),
      a.participants.map((p) => p.rawName).join(", "),
      a.competitionName,
      a.category,
      a.level,
      a.rank,
      a.organizer,
      a.evidenceUrl,
      a.notes,
      a.points,
    ]),
  ];
  const k = view.kpis;
  const summary = [
    [meta.title],
    [`${meta.periodLabel}${meta.filterLabel ? ` · ${meta.filterLabel}` : ""}`],
    [`Dibuat ${meta.generatedAt}`],
    [null],
    ["Ringkasan", "Periode ini", "Periode yang sama tahun lalu"],
    ["Total prestasi", k.total, k.previousTotal],
    ["Siswa berprestasi (unik)", k.students, k.previousStudents],
    ["Tingkat nasional & internasional", k.nationalPlus, k.previousNationalPlus],
    ["Poin Prestasi", k.points, null],
    [null],
    ["Sekolah", ...LEVELS.map((l) => LEVEL_LABEL[l]), "Tidak diketahui", "Total", "Poin"],
    ...view.schools.map((s) => {
      const c = view.bySchoolLevel[s.id]!;
      return [s.code, ...LEVELS.map((l) => c[l]), c.KOSONG, Object.values(c).reduce((a, b) => a + b, 0), view.pointsBySchool.find((p) => p.schoolId === s.id)?.points ?? 0];
    }),
  ];
  return buildXlsx([
    { name: "Ringkasan", rows: summary, widths: [34, 16, 16, 16, 16, 16, 16, 10] },
    { name: "Data Prestasi", rows: data, widths: [12, 12, 36, 44, 16, 18, 18, 30, 30, 40, 8] },
  ]);
}

const s = StyleSheet.create({
  page: { padding: 32, fontSize: 9, fontFamily: "Albert Sans", color: "#4D4D4F" },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 6 },
  strip: { height: 4, backgroundColor: "#0E4E96", marginBottom: 12 },
  title: { fontSize: 15, fontFamily: "Cabin", fontWeight: 700, color: "#0E4E96" },
  meta: { fontSize: 8.5, color: "#6B6B6E", marginTop: 2 },
  kpis: { flexDirection: "row", gap: 8, marginBottom: 12 },
  kpi: { flex: 1, borderWidth: 0.5, borderColor: "#E6E6E8", borderRadius: 4, padding: 8 },
  kpiValue: { fontSize: 16, fontFamily: "Cabin", fontWeight: 700, marginTop: 2 },
  h2: { fontSize: 10.5, fontFamily: "Cabin", fontWeight: 700, marginTop: 8, marginBottom: 4 },
  row: { flexDirection: "row", borderBottomWidth: 0.5, borderBottomColor: "#E6E6E8", paddingVertical: 2.5 },
  th: { fontFamily: "Albert Sans", fontWeight: 600, color: "#6B6B6E" },
  footer: { position: "absolute", bottom: 18, left: 32, right: 32, fontSize: 7.5, color: "#6B6B6E", flexDirection: "row", justifyContent: "space-between" },
});

export async function achievementsPdf(view: AchievementView, meta: ExportMeta): Promise<Uint8Array> {
  registerPdfFonts();
  const logo = await loadMasterLogo();
  const k = view.kpis;
  const vs = (cur: number, prev: number) => (prev ? `${cur >= prev ? "+" : ""}${Math.round(((cur - prev) / prev) * 100)}% vs tahun lalu (${prev})` : `tahun lalu: ${prev}`);
  const doc = (
    <Document title={meta.title} author="Portal Academic Excellence — Sekolah Talenta Juara">
      <Page size="A4" orientation="landscape" style={s.page}>
        <View style={s.header} fixed>
          <View>
            <Text style={s.title}>{meta.title}</Text>
            <Text style={s.meta}>
              {meta.periodLabel}
              {meta.filterLabel ? ` · ${meta.filterLabel}` : ""}
            </Text>
          </View>
          {/* react-pdf <Image> has no alt attribute; the title text carries the meaning. */}
          {/* eslint-disable-next-line jsx-a11y/alt-text */}
          {logo ? <Image src={{ data: logo, format: "png" }} style={{ height: 28 }} /> : null}
        </View>
        <View style={s.strip} fixed />
        <View style={s.kpis}>
          {[
            ["Total prestasi", k.total, vs(k.total, k.previousTotal)],
            ["Siswa berprestasi (unik)", k.students, vs(k.students, k.previousStudents)],
            ["Nasional & internasional", k.nationalPlus, vs(k.nationalPlus, k.previousNationalPlus)],
            ["Poin Prestasi", k.points, "bobot tingkat × peringkat"],
          ].map(([label, value, note]) => (
            <View key={String(label)} style={s.kpi}>
              <Text>{label}</Text>
              <Text style={s.kpiValue}>{typeof value === "number" ? formatNumber(value) : String(value)}</Text>
              <Text style={s.meta}>{note}</Text>
            </View>
          ))}
        </View>
        <Text style={s.h2}>Sekolah × tingkat</Text>
        <View style={[s.row, s.th]}>
          <Text style={{ width: "16%" }}>Sekolah</Text>
          {LEVELS.map((l) => (
            <Text key={l} style={{ width: "12%", textAlign: "right" }}>{LEVEL_LABEL[l]}</Text>
          ))}
          <Text style={{ width: "12%", textAlign: "right" }}>Tidak diketahui</Text>
          <Text style={{ width: "10%", textAlign: "right" }}>Total</Text>
          <Text style={{ width: "10%", textAlign: "right" }}>Poin</Text>
        </View>
        {view.schools.map((sc) => {
          const c = view.bySchoolLevel[sc.id]!;
          return (
            <View key={sc.id} style={s.row}>
              <Text style={{ width: "16%" }}>{sc.code}</Text>
              {[...LEVELS, "KOSONG" as const].map((l) => (
                <Text key={l} style={{ width: "12%", textAlign: "right" }}>{c[l]}</Text>
              ))}
              <Text style={{ width: "10%", textAlign: "right" }}>{Object.values(c).reduce((a, b) => a + b, 0)}</Text>
              <Text style={{ width: "10%", textAlign: "right" }}>{formatNumber(view.pointsBySchool.find((p) => p.schoolId === sc.id)?.points ?? 0)}</Text>
            </View>
          );
        })}
        <Text style={s.h2}>Daftar prestasi ({view.records.length})</Text>
        <View style={[s.row, s.th]} fixed>
          <Text style={{ width: "9%" }}>Tanggal</Text>
          <Text style={{ width: "9%" }}>Sekolah</Text>
          <Text style={{ width: "24%" }}>Siswa/Tim</Text>
          <Text style={{ width: "28%" }}>Lomba</Text>
          <Text style={{ width: "10%" }}>Kategori</Text>
          <Text style={{ width: "10%" }}>Tingkat</Text>
          <Text style={{ width: "10%" }}>Peringkat</Text>
        </View>
        {view.records.map((a) => (
          <View key={a.id} style={s.row} wrap={false}>
            <Text style={{ width: "9%" }}>{ddmmyyyy(a.achievedOn)}</Text>
            <Text style={{ width: "9%" }}>{meta.schoolCode(a.schoolId)}</Text>
            <Text style={{ width: "24%", paddingRight: 8 }}>{a.participants.map((p) => p.rawName).join(", ") || "–"}</Text>
            <Text style={{ width: "28%", paddingRight: 8 }}>{a.competitionName}</Text>
            <Text style={{ width: "10%" }}>{a.category ? CATEGORY_LABEL[a.category] : "–"}</Text>
            <Text style={{ width: "10%" }}>{a.level ? LEVEL_LABEL[a.level] : "–"}</Text>
            <Text style={{ width: "10%" }}>{a.rank ? RANK_LABEL[a.rank] : "–"}</Text>
          </View>
        ))}
        <View style={s.footer} fixed>
          <Text>Sekolah Talenta Juara · Developing Capable Muslim Leaders · Dokumen internal — berisi data siswa</Text>
          <Text render={({ pageNumber, totalPages }) => `${meta.generatedAt} · hal. ${pageNumber}/${totalPages}`} />
        </View>
      </Page>
    </Document>
  );
  return new Uint8Array(await renderToBuffer(doc));
}
