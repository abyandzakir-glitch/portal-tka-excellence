import Link from "next/link";
import { MASTERY_STATUS_LABEL } from "@/lib/metrics/mastery";
import type { HeatmapData } from "@/lib/tka/load";
import { cn } from "@/lib/utils";
import { STATUS_STYLE, StatusLegend } from "./status";

const pct = (r: number | null) => (r == null ? "–" : `${(r * 100).toLocaleString("id-ID", { maximumFractionDigits: 0 })}%`);

/**
 * Competency heatmap (§7.2a/b): rows = sub-competencies grouped by element,
 * columns = schools or classes, cells = % mastery coloured by status (tint +
 * icon, text stays in body ink). Every cell links to the weakest students.
 * Rendered as a real table, so it is its own accessible table view.
 */
export function Heatmap(props: { data: HeatmapData; href: (rowId: string, colId: string) => string; colHeading: string; caption: string }) {
  const { rows, cols, cells } = props.data;
  const groups: { key: string; title: string; rows: typeof rows }[] = [];
  for (const r of rows) {
    const key = `${r.level}|${r.elementName ?? ""}`;
    let g = groups.find((x) => x.key === key);
    if (!g) groups.push((g = { key, title: `${r.elementName ?? "Lainnya"}${new Set(rows.map((x) => x.level)).size > 1 ? ` (${r.level.toUpperCase()})` : ""}`, rows: [] }));
    g.rows.push(r);
  }
  return (
    <div className="space-y-3">
      <StatusLegend />
      <div className="overflow-x-auto">
        <table className="w-full min-w-[560px] border-separate border-spacing-0.5 text-sm">
          <caption className="sr-only">{props.caption}</caption>
          <thead>
            <tr>
              <th scope="col" className="sticky left-0 z-10 bg-white px-2 py-1.5 text-left font-medium text-brand-gray-light">Sub-kompetensi</th>
              {cols.map((c) => (
                <th key={c.id} scope="col" className="px-2 py-1.5 text-center font-mono text-xs font-medium text-brand-gray-light">
                  {c.label}
                </th>
              ))}
            </tr>
          </thead>
          {groups.map((g) => (
            <tbody key={g.key}>
              <tr>
                <th scope="colgroup" colSpan={cols.length + 1} className="px-2 pb-0.5 pt-3 text-left text-xs font-semibold uppercase tracking-wide text-brand-gray-light">
                  {g.title}
                </th>
              </tr>
              {g.rows.map((r) => (
                <tr key={r.id}>
                  <th scope="row" className="sticky left-0 z-10 max-w-72 bg-white px-2 py-1 text-left font-normal" title={r.code}>
                    {r.name}
                  </th>
                  {cols.map((c) => {
                    const cell = cells[`${r.id}|${c.id}`];
                    if (!cell) {
                      return (
                        <td key={c.id} className="px-2 py-1 text-center text-xs text-brand-gray-light">
                          <span aria-label="Tidak berlaku untuk jenjang ini">·</span>
                        </td>
                      );
                    }
                    const st = STATUS_STYLE[cell.status];
                    const label = `${r.name}, ${props.colHeading} ${c.label}: ${pct(cell.ratio)}, ${MASTERY_STATUS_LABEL[cell.status]}, ${cell.items} butir`;
                    return (
                      <td key={c.id} className={cn("rounded-sm p-0", st.bg)}>
                        <Link
                          href={props.href(r.id, c.id)}
                          aria-label={label}
                          title={`${MASTERY_STATUS_LABEL[cell.status]} · ${cell.items} butir`}
                          className="flex min-h-9 items-center justify-center gap-1 px-2 py-1 tabular-nums text-brand-gray hover:outline-2 hover:outline-brand-blue focus-visible:outline-2 focus-visible:outline-brand-sky"
                        >
                          <st.icon aria-hidden="true" className={cn("size-3.5 shrink-0", st.text)} />
                          {cell.status === "kurang_data" ? "–" : pct(cell.ratio)}
                        </Link>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          ))}
        </table>
      </div>
      <p className="text-xs text-brand-gray-light">Klik sel untuk melihat daftar siswa dan penguasaannya pada kompetensi tersebut.</p>
    </div>
  );
}

/** Ranked list of the weakest competencies (bars with the value as text). */
export function WeakestList(props: { items: { id: string; name: string; elementName: string | null; ratio: number | null; status: keyof typeof STATUS_STYLE; items: number; level: string }[]; href: (id: string) => string }) {
  if (!props.items.length) return <p className="text-sm text-brand-gray-light">Belum ada kompetensi dengan data yang cukup.</p>;
  return (
    <ol className="space-y-3">
      {props.items.map((c, i) => {
        const st = STATUS_STYLE[c.status];
        return (
          <li key={c.id}>
            <Link href={props.href(c.id)} className="group block rounded-md focus-visible:outline-2 focus-visible:outline-brand-sky">
              <div className="flex items-baseline justify-between gap-2 text-sm">
                <span className="min-w-0">
                  <span className="mr-1 text-brand-gray-light">{i + 1}.</span>
                  <span className="font-medium group-hover:text-brand-blue">{c.name}</span>
                  <span className="block truncate pl-4 text-xs text-brand-gray-light">
                    {c.elementName} · {c.level.toUpperCase()} · {c.items} butir
                  </span>
                </span>
                <span className="inline-flex shrink-0 items-center gap-1 tabular-nums">
                  <st.icon aria-hidden="true" className={cn("size-3.5", st.text)} />
                  {pct(c.ratio)}
                </span>
              </div>
              <div className="mt-1 h-2 rounded-full bg-muted" aria-hidden="true">
                <div className="h-2 rounded-full bg-brand-blue" style={{ width: `${Math.max(2, (c.ratio ?? 0) * 100)}%` }} />
              </div>
            </Link>
          </li>
        );
      })}
    </ol>
  );
}
