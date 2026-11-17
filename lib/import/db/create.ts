/**
 * Creates a draft batch from an uploaded file (CLAUDE.md §9.3 steps 1–3, 9):
 * detects the data sheet and header row, maps columns automatically — or
 * re-uses the mapping this school confirmed last time for the same header
 * layout — and stages the preview rows.
 */
import { and, desc, eq, isNull } from "drizzle-orm";
import type { RlsTx } from "@/lib/db/rls";
import { importBatches, mappingProfiles } from "@/lib/db/schema";
import { autoMap, headerSignature, headersAt, type ColumnMapping } from "../mapping";
import { detectLayout, fieldSetFor, type TkaImportKind } from "../pipeline";
import type { SheetData } from "../sheet";
import type { BatchConfig, BatchOptions } from "./config";
import { stageBatch } from "./stage";

export interface CreateDraftInput {
  id: string;
  kind: TkaImportKind;
  /** null only for network-wide blueprint imports by Super Admin. */
  schoolId: string | null;
  filename: string;
  filePath: string | null;
  sheets: SheetData[];
  options: BatchOptions;
  userId: string;
}

async function savedMapping(tx: RlsTx, schoolId: string | null, kind: TkaImportKind, headers: string[]): Promise<ColumnMapping | null> {
  const [profile] = await tx
    .select({ mappingJson: mappingProfiles.mappingJson })
    .from(mappingProfiles)
    .where(
      and(
        schoolId ? eq(mappingProfiles.schoolId, schoolId) : isNull(mappingProfiles.schoolId),
        eq(mappingProfiles.type, kind),
        eq(mappingProfiles.headerSignature, headerSignature(headers)),
      ),
    )
    .orderBy(desc(mappingProfiles.updatedAt))
    .limit(1);
  const columns = (profile?.mappingJson as { columns?: ColumnMapping } | undefined)?.columns;
  return columns && columns.length === headers.length ? columns : null;
}

export async function createDraftBatch(tx: RlsTx, input: CreateDraftInput): Promise<BatchConfig> {
  const set = fieldSetFor(input.kind);
  const layout = detectLayout(input.sheets, set) ?? (() => {
    const headers = headersAt(input.sheets[0]!.rows, 0);
    return { sheetIndex: 0, headerRowIndex: 0, headers, ...autoMap(headers, set) };
  })();

  const profileColumns = await savedMapping(tx, input.schoolId, input.kind, layout.headers);
  const config: BatchConfig = {
    kind: input.kind,
    sheetIndex: layout.sheetIndex,
    headerRowIndex: layout.headerRowIndex,
    headers: layout.headers,
    columns: profileColumns ?? layout.columns,
    fromProfile: Boolean(profileColumns),
    edits: {},
    options: input.options,
    fileIssues: [],
    summary: { total: 0, ok: 0, warning: 0, error: 0, skipped: 0 },
  };

  await tx.insert(importBatches).values({
    id: input.id,
    schoolId: input.schoolId,
    type: input.kind,
    filePath: input.filePath,
    originalFilename: input.filename,
    mappingJson: config,
    sourceJson: { sheets: input.sheets },
    tryoutId: input.options.tryoutId ?? null,
    status: "draft",
    createdBy: input.userId,
  });
  return stageBatch(tx, input.id);
}

/** Changes sheet / header row / column mapping of a draft and re-validates. */
export async function remapBatch(
  tx: RlsTx,
  batchId: string,
  sheets: SheetData[],
  update: { sheetIndex: number; headerRowIndex: number; columns: ColumnMapping | null },
  kind: TkaImportKind,
): Promise<BatchConfig> {
  const sheet = sheets[update.sheetIndex];
  if (!sheet) throw new Error("sheet out of range");
  const headers = headersAt(sheet.rows, update.headerRowIndex);
  // A new sheet or header row invalidates the old mapping: map automatically again.
  const columns = update.columns && update.columns.length === headers.length ? update.columns : autoMap(headers, fieldSetFor(kind)).columns;
  return stageBatch(tx, batchId, {
    sheetIndex: update.sheetIndex,
    headerRowIndex: update.headerRowIndex,
    headers,
    columns,
    fromProfile: false,
    // Edits are keyed by spreadsheet row: they no longer apply after the layout changes.
    ...(update.columns ? {} : { edits: {} }),
  });
}
