import "server-only";
import { loadMasterLogo, registerPdfFonts } from "@/lib/pdf/theme";
import { Document, Image, Page, renderToBuffer, StyleSheet, Text, View } from "@react-pdf/renderer";
import { buildXlsx } from "@/lib/import/templates/xlsx";
import { MASTERY_STATUS_LABEL } from "@/lib/metrics/mastery";
import type { InterventionGroup } from "./load";

export interface ExportMeta {
  schoolName: string;
  subjectName: string;
  periodLabel: string;
  includeDeveloping: boolean;
  generatedAt: string;
}

const pct = (r: number | null) => (r == null ? "–" : `${(r * 100).toLocaleString("id-ID", { maximumFractionDigits: 1 })}%`);

/** Excel: one summary sheet + one long table (one row per student × competency). */
export function interventionGroupsXlsx(groups: InterventionGroup[], meta: ExportMeta): Uint8Array {
  const summary = [
    ["Kelompok Intervensi"],
    [`${meta.schoolName} · ${meta.subjectName} · ${meta.periodLabel}`],
    [meta.includeDeveloping ? "Siswa berstatus Perlu Intervensi dan Berkembang" : "Siswa berstatus Perlu Intervensi"],
    [`Dibuat ${meta.generatedAt}`],
    [null],
    ["Elemen", "Sub-kompetensi", "Jumlah siswa"],
    ...groups.map((g) => [g.competency.elementName, g.competency.name, g.students.length]),
  ];
  const detail = [
    ["Elemen", "Sub-kompetensi", "Nama Siswa", "NIS", "Kelas", "Penguasaan", "Status"],
    ...groups.flatMap((g) =>
      g.students.map((s) => [
        g.competency.elementName,
        g.competency.name,
        s.fullName,
        s.nis,
        s.className,
        s.ratio == null ? null : Math.round(s.ratio * 1000) / 10,
        MASTERY_STATUS_LABEL[s.status],
      ]),
    ),
  ];
  return buildXlsx([
    { name: "Ringkasan", rows: summary, widths: [28, 60, 14] },
    { name: "Daftar Siswa", rows: detail, widths: [28, 60, 32, 12, 8, 12, 18] },
  ]);
}

const styles = StyleSheet.create({
  page: { padding: 32, fontSize: 9, fontFamily: "Albert Sans", color: "#4D4D4F" },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 6 },
  strip: { height: 4, backgroundColor: "#0E4E96", marginBottom: 14 },
  title: { fontSize: 15, fontFamily: "Cabin", fontWeight: 700, color: "#0E4E96" },
  meta: { fontSize: 9, color: "#6B6B6E", marginTop: 2 },
  group: { marginBottom: 12 },
  groupTitle: { fontSize: 10.5, fontFamily: "Cabin", fontWeight: 700, marginBottom: 1 },
  groupSub: { fontSize: 8, color: "#6B6B6E", marginBottom: 4 },
  row: { flexDirection: "row", borderBottomWidth: 0.5, borderBottomColor: "#E6E6E8", paddingVertical: 2.5 },
  th: { fontFamily: "Albert Sans", fontWeight: 600, color: "#6B6B6E" },
  c1: { width: "6%" },
  c2: { width: "44%" },
  c3: { width: "16%" },
  c4: { width: "10%" },
  c5: { width: "12%", textAlign: "right" },
  c6: { width: "12%", textAlign: "right" },
  footer: { position: "absolute", bottom: 18, left: 32, right: 32, fontSize: 7.5, color: "#6B6B6E", flexDirection: "row", justifyContent: "space-between" },
});

export async function interventionGroupsPdf(groups: InterventionGroup[], meta: ExportMeta): Promise<Uint8Array> {
  registerPdfFonts();
  const logo = await loadMasterLogo();
  const doc = (
    <Document title={`Kelompok Intervensi ${meta.schoolName}`} author="Portal Academic Excellence — Sekolah Talenta Juara">
      <Page size="A4" style={styles.page}>
        <View style={styles.header} fixed>
          <View>
            <Text style={styles.title}>Kelompok Intervensi</Text>
            <Text style={styles.meta}>
              {meta.schoolName} · {meta.subjectName} · {meta.periodLabel}
            </Text>
            <Text style={styles.meta}>{meta.includeDeveloping ? "Status Perlu Intervensi dan Berkembang" : "Status Perlu Intervensi"}</Text>
          </View>
          {/* react-pdf <Image> has no alt attribute; the title text above carries the meaning. */}
          {/* eslint-disable-next-line jsx-a11y/alt-text */}
          {logo ? <Image src={{ data: logo, format: "png" }} style={{ height: 30 }} /> : null}
        </View>
        <View style={styles.strip} fixed />
        {groups.length === 0 ? <Text>Tidak ada siswa pada kategori ini untuk periode yang dipilih.</Text> : null}
        {groups.map((g) => (
          <View key={g.competency.id} style={styles.group} wrap>
            <Text style={styles.groupTitle}>{g.competency.name}</Text>
            <Text style={styles.groupSub}>
              {g.competency.elementName} · {g.students.length} siswa
            </Text>
            <View style={[styles.row, styles.th]}>
              <Text style={styles.c1}>No</Text>
              <Text style={styles.c2}>Nama</Text>
              <Text style={styles.c3}>NIS</Text>
              <Text style={styles.c4}>Kelas</Text>
              <Text style={styles.c5}>Penguasaan</Text>
              <Text style={styles.c6}>Status</Text>
            </View>
            {g.students.map((s, i) => (
              <View key={s.id} style={styles.row} wrap={false}>
                <Text style={styles.c1}>{i + 1}</Text>
                <Text style={styles.c2}>{s.fullName}</Text>
                <Text style={styles.c3}>{s.nis}</Text>
                <Text style={styles.c4}>{s.className ?? "–"}</Text>
                <Text style={styles.c5}>{pct(s.ratio)}</Text>
                <Text style={styles.c6}>{MASTERY_STATUS_LABEL[s.status]}</Text>
              </View>
            ))}
          </View>
        ))}
        <View style={styles.footer} fixed>
          <Text>Sekolah Talenta Juara · Developing Capable Muslim Leaders · Dokumen internal — berisi data siswa</Text>
          <Text render={({ pageNumber, totalPages }) => `${meta.generatedAt} · hal. ${pageNumber}/${totalPages}`} />
        </View>
      </Page>
    </Document>
  );
  return new Uint8Array(await renderToBuffer(doc));
}
