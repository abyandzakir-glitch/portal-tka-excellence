"use server";

import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { queryAsUser, requireUser } from "@/lib/auth/session";
import { schools, subjects, tryouts, tryoutSchools } from "@/lib/db/schema";
import { commitBatch, discardDraft, rollbackBatch } from "@/lib/import/db/commit";
import { ImportError, mappingUpdateSchema, rowEditSchema, type BatchConfig, type BatchOptions, type BatchSource } from "@/lib/import/db/config";
import { createDraftBatch, remapBatch } from "@/lib/import/db/create";
import { loadBatch, stageBatch } from "@/lib/import/db/stage";
import { friendlyError } from "@/lib/import/server/errors";
import type { TkaImportKind } from "@/lib/import/pipeline";
import { readTabularFile } from "@/lib/import/sheet";
import { parseWeekStart } from "@/lib/import/values";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export interface ActionState {
  error?: string;
  message?: string;
}

const WRITERS = ["super_admin", "school_admin"] as const;
const KIND_BY_SLUG = { kisi: "tryout_blueprint", hasil: "tryout_results", latihan: "practice_logs" } as const satisfies Record<
  string,
  TkaImportKind
>;

const uuid = z.uuid("Pilihan tidak valid.");
const optionalUuid = z.preprocess((v) => (v === "" || v == null ? undefined : v), uuid.optional());

const startSchema = z.discriminatedUnion("jenis", [
  z.object({
    jenis: z.literal("kisi"),
    modus: z.enum(["baru", "ubah"]),
    to: optionalUuid,
    nama: z.string().trim().max(120).optional(),
    tanggal: z.string().optional(),
    mapel: optionalUuid,
    peserta: z.array(uuid).default([]),
  }),
  z.object({ jenis: z.literal("hasil"), to: uuid, sekolah: optionalUuid }),
  z.object({ jenis: z.literal("latihan"), sekolah: optionalUuid, pekan: z.string().optional() }),
]);

function safeFilename(name: string) {
  const cleaned = name.normalize("NFKD").replace(/[^\w.-]+/g, "_").replace(/_+/g, "_");
  return cleaned.slice(-120) || "unggahan";
}

/** Step 1 of the wizard: upload + options. Creates a draft and opens its preview. */
export async function startImport(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireUser(WRITERS);
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) return { error: "Pilih file yang akan diunggah." };

  const parsed = startSchema.safeParse({
    jenis: formData.get("jenis"),
    modus: formData.get("modus") ?? undefined,
    to: formData.get("to") ?? undefined,
    nama: formData.get("nama") ?? undefined,
    tanggal: formData.get("tanggal") ?? undefined,
    mapel: formData.get("mapel") ?? undefined,
    peserta: formData.getAll("peserta"),
    sekolah: formData.get("sekolah") ?? undefined,
    pekan: formData.get("pekan") ?? undefined,
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Isian formulir belum lengkap." };
  const input = parsed.data;
  const kind = KIND_BY_SLUG[input.jenis];
  const id = randomUUID();

  try {
    const sheets = readTabularFile(new Uint8Array(await file.arrayBuffer()), file.name);

    // Resolve the batch's school and options with RLS, so nobody can target another school.
    const { schoolId, options } = await queryAsUser(async (tx) => {
      const ownSchool = user.role === "school_admin" ? user.schoolId : null;

      if (input.jenis === "kisi") {
        if (input.modus === "ubah") {
          if (!input.to) throw new ImportError("Pilih try out yang kisi-kisinya akan diperbarui.");
          const [t] = await tx.select().from(tryouts).where(eq(tryouts.id, input.to)).limit(1);
          if (!t) throw new ImportError("Try out tidak ditemukan.");
          if (ownSchool && t.ownerSchoolId !== ownSchool) {
            throw new ImportError("Kisi-kisi TO bersama jaringan hanya bisa diubah oleh Super Admin.");
          }
          return { schoolId: t.ownerSchoolId, options: { tryoutId: t.id } satisfies BatchOptions };
        }
        const name = input.nama?.trim();
        if (!name) throw new ImportError("Isi nama try out.");
        const date = input.tanggal && /^\d{4}-\d{2}-\d{2}$/.test(input.tanggal) ? input.tanggal : null;
        if (!date) throw new ImportError("Isi tanggal pelaksanaan try out.");
        if (!input.mapel) throw new ImportError("Pilih mapel try out.");
        const [subject] = await tx.select().from(subjects).where(eq(subjects.id, input.mapel)).limit(1);
        if (!subject) throw new ImportError("Mapel tidak ditemukan.");
        const levelSchools = await tx.select({ id: schools.id }).from(schools).where(eq(schools.level, subject.level));
        let schoolIds: string[];
        if (ownSchool) {
          if (!levelSchools.some((s) => s.id === ownSchool)) throw new ImportError("Mapel ini bukan untuk jenjang sekolah Anda.");
          schoolIds = [ownSchool];
        } else {
          schoolIds = input.peserta.filter((p) => levelSchools.some((s) => s.id === p));
          if (!schoolIds.length) throw new ImportError(`Pilih minimal satu sekolah ${subject.level.toUpperCase()} peserta try out.`);
        }
        return {
          schoolId: ownSchool,
          options: {
            newTryout: { name, date, level: subject.level, subjectId: subject.id, ownerSchoolId: ownSchool, schoolIds },
          } satisfies BatchOptions,
        };
      }

      const schoolId = ownSchool ?? input.sekolah;
      if (!schoolId) throw new ImportError("Pilih sekolah.");

      if (input.jenis === "hasil") {
        const participants = await tx.select().from(tryoutSchools).where(eq(tryoutSchools.tryoutId, input.to));
        if (!participants.some((p) => p.schoolId === schoolId)) {
          throw new ImportError("Sekolah ini tidak terdaftar sebagai peserta try out tersebut.");
        }
        return { schoolId, options: { tryoutId: input.to } satisfies BatchOptions };
      }

      const pekan = input.pekan?.trim() ? parseWeekStart(input.pekan.trim()) : null;
      if (input.pekan?.trim() && !pekan) throw new ImportError("Tanggal pekan tidak valid.");
      return { schoolId, options: { defaultWeek: pekan } satisfies BatchOptions };
    });

    // Keep the original file (§9.3 step 8). Uses the user's session: Storage policies apply.
    const filePath = `${schoolId ?? "network"}/${id}/${safeFilename(file.name)}`;
    const supabase = await createSupabaseServerClient();
    const { error: uploadError } = await supabase.storage
      .from("imports")
      .upload(filePath, file, { contentType: file.type || "application/octet-stream", upsert: false });
    if (uploadError) {
      console.error("[import] storage upload failed:", uploadError.message);
      throw new ImportError("File asli gagal disimpan ke penyimpanan. Coba unggah ulang; bila berulang, hubungi Super Admin.");
    }

    await queryAsUser((tx) =>
      createDraftBatch(tx, { id, kind, schoolId, filename: file.name, filePath, sheets, options, userId: user.id }),
    );
  } catch (e) {
    return { error: friendlyError(e) };
  }
  redirect(`/input/batch/${id}`);
}

/** Step 2: change sheet / header row / column mapping. */
export async function updateMapping(batchId: string, payload: unknown): Promise<ActionState> {
  await requireUser(WRITERS);
  const parsed = mappingUpdateSchema.safeParse(payload);
  if (!parsed.success || !uuid.safeParse(batchId).success) return { error: "Pemetaan kolom tidak valid." };
  try {
    await queryAsUser(async (tx) => {
      const batch = await loadBatch(tx, batchId);
      const config = batch.mappingJson as BatchConfig;
      const source = batch.sourceJson as BatchSource;
      const layoutChanged = parsed.data.sheetIndex !== config.sheetIndex || parsed.data.headerRowIndex !== config.headerRowIndex;
      if (!source.sheets[parsed.data.sheetIndex]) throw new ImportError("Sheet yang dipilih tidak ada di file.");
      await remapBatch(
        tx,
        batchId,
        source.sheets,
        { ...parsed.data, columns: layoutChanged ? null : parsed.data.columns },
        config.kind,
      );
    });
  } catch (e) {
    return { error: friendlyError(e) };
  }
  refresh();
  return { message: "Pemetaan diperbarui dan data diperiksa ulang." };
}

/** Step 3: correct one row directly in the preview. */
export async function saveRowEdit(batchId: string, payload: unknown): Promise<ActionState> {
  await requireUser(WRITERS);
  const parsed = rowEditSchema.safeParse(payload);
  if (!parsed.success || !uuid.safeParse(batchId).success) return { error: "Perubahan tidak valid." };
  try {
    await queryAsUser(async (tx) => {
      const batch = await loadBatch(tx, batchId);
      const config = batch.mappingJson as BatchConfig;
      const edits = { ...config.edits, [parsed.data.rowNumber]: { ...(config.edits[parsed.data.rowNumber] ?? {}), ...parsed.data.values } };
      await stageBatch(tx, batchId, { edits });
    });
  } catch (e) {
    return { error: friendlyError(e) };
  }
  refresh();
  return { message: `Baris ${parsed.data.rowNumber} diperbarui.` };
}

/** Step 4: save. */
export async function commitImport(batchId: string): Promise<ActionState> {
  const user = await requireUser(WRITERS);
  if (!uuid.safeParse(batchId).success) return { error: "Data impor tidak valid." };
  let saved = 0;
  try {
    ({ saved } = await queryAsUser((tx) => commitBatch(tx, batchId, user.id)));
  } catch (e) {
    return { error: friendlyError(e) };
  }
  refresh();
  return { message: `${saved} baris berhasil disimpan.` };
}

export async function rollbackImport(batchId: string): Promise<ActionState> {
  const user = await requireUser(["super_admin"]);
  if (!uuid.safeParse(batchId).success) return { error: "Data impor tidak valid." };
  try {
    await queryAsUser((tx) => rollbackBatch(tx, batchId, user.id));
  } catch (e) {
    return { error: friendlyError(e) };
  }
  refresh();
  return { message: "Data dari unggahan ini sudah dibatalkan." };
}

export async function discardImport(batchId: string): Promise<ActionState> {
  await requireUser(WRITERS);
  if (!uuid.safeParse(batchId).success) return { error: "Data impor tidak valid." };
  try {
    await queryAsUser((tx) => discardDraft(tx, batchId));
  } catch (e) {
    return { error: friendlyError(e) };
  }
  redirect("/input");
}
