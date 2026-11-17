"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  LabelList,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { SeriesStyle } from "@/lib/tka/colors";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];
const X_FORMATS = {
  date: (x: string) => `${Number(x.slice(8, 10))} ${MONTHS[Number(x.slice(5, 7)) - 1]}`,
  week: (x: string) => `Pekan ${Number(x.slice(8, 10))} ${MONTHS[Number(x.slice(5, 7)) - 1]}`,
} as const;

/** Recessive chrome (dataviz: hairline solid grid, muted ink). */
const GRID = "#e6e6e8";
const AXIS = "#6b6b6e";
const SURFACE = "#ffffff";

export interface ChartSeries {
  id: string;
  label: string;
  style: SeriesStyle;
  /** Values by x key; null = no data. Extra info shown in the tooltip. */
  points: { x: string; value: number | null; note?: string }[];
}

// ---------------------------------------------------------------------------
// Markers — shape is a second identity channel besides colour.
// ---------------------------------------------------------------------------

function Marker({ cx, cy, style, r = 4.5 }: { cx?: number; cy?: number; style: SeriesStyle; r?: number }) {
  if (cx == null || cy == null || Number.isNaN(cx) || Number.isNaN(cy)) return null;
  const common = { fill: style.color, stroke: SURFACE, strokeWidth: 2 };
  switch (style.marker) {
    case "square":
      return <rect x={cx - r} y={cy - r} width={r * 2} height={r * 2} {...common} />;
    case "triangle":
      return <polygon points={`${cx},${cy - r - 1} ${cx + r + 1},${cy + r} ${cx - r - 1},${cy + r}`} {...common} />;
    case "diamond":
      return <polygon points={`${cx},${cy - r - 1} ${cx + r + 1},${cy} ${cx},${cy + r + 1} ${cx - r - 1},${cy}`} {...common} />;
    case "cross":
      return (
        <g>
          <path d={`M${cx - r},${cy - r}L${cx + r},${cy + r}M${cx + r},${cy - r}L${cx - r},${cy + r}`} stroke={SURFACE} strokeWidth={5} />
          <path d={`M${cx - r},${cy - r}L${cx + r},${cy + r}M${cx + r},${cy - r}L${cx - r},${cy + r}`} stroke={style.color} strokeWidth={2.5} />
        </g>
      );
    default:
      return <circle cx={cx} cy={cy} r={r} {...common} />;
  }
}

export function SeriesLegend({ series }: { series: { id: string; label: string; style: SeriesStyle }[] }) {
  if (series.length < 2) return null;
  return (
    <ul className="mb-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-brand-gray" aria-label="Keterangan seri">
      {series.map((s) => (
        <li key={s.id} className="inline-flex items-center gap-1.5">
          <svg width="28" height="12" aria-hidden="true">
            <line x1="1" y1="6" x2="27" y2="6" stroke={s.style.color} strokeWidth="2" strokeDasharray={s.style.dash || undefined} />
            <Marker cx={14} cy={6} style={s.style} r={3.5} />
          </svg>
          {s.label}
        </li>
      ))}
    </ul>
  );
}

const fmt = (v: number, unit: "score" | "percent" | "count") =>
  unit === "percent"
    ? `${(v * 100).toLocaleString("id-ID", { maximumFractionDigits: 1 })}%`
    : v.toLocaleString("id-ID", { maximumFractionDigits: unit === "score" ? 2 : 0 });

function TooltipBox({
  active,
  payload,
  label,
  series,
  unit,
  xLabel,
}: {
  active?: boolean;
  payload?: { dataKey?: string | number; value?: number | null }[];
  label?: string;
  series: ChartSeries[];
  unit: "score" | "percent" | "count";
  xLabel: (x: string) => string;
}) {
  if (!active || !payload?.length || label == null) return null;
  return (
    <div className="rounded-md border border-border bg-white px-3 py-2 text-xs shadow-sm">
      <p className="mb-1 font-medium text-brand-gray">{xLabel(label)}</p>
      <ul className="space-y-0.5">
        {series.map((s) => {
          const pt = s.points.find((p) => p.x === label);
          if (!pt || pt.value == null) return null;
          return (
            <li key={s.id} className="flex items-center gap-2">
              <svg width="10" height="10" aria-hidden="true">
                <Marker cx={5} cy={5} style={s.style} r={3.5} />
              </svg>
              <span className="text-brand-gray-light">{s.label}</span>
              <span className="ml-auto pl-3 font-medium tabular-nums text-brand-gray">{fmt(pt.value, unit)}</span>
              {pt.note ? <span className="text-brand-gray-light">{pt.note}</span> : null}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/**
 * Lines over time (TO trend, weekly practice). One y-axis only. A target line
 * is drawn when given. Endpoints are direct-labelled when there are ≤ 4 series.
 */
export function LineTrend(props: {
  series: ChartSeries[];
  unit: "score" | "percent" | "count";
  /** How x keys (ISO dates) are labelled: TO date or week start. */
  xFormat: "date" | "week";
  yDomain?: [number, number];
  target?: number | null;
  height?: number;
  ariaLabel: string;
}) {
  const xLabel = X_FORMATS[props.xFormat];
  const xs = [...new Set(props.series.flatMap((s) => s.points.map((p) => p.x)))].sort();
  const rows = xs.map((x) => {
    const row: Record<string, string | number | null> = { x };
    for (const s of props.series) row[s.id] = s.points.find((p) => p.x === x)?.value ?? null;
    return row;
  });
  const labelEnds = props.series.length <= 4;
  const tick = (v: number) => (props.unit === "percent" ? `${Math.round(v * 100)}%` : v.toLocaleString("id-ID"));
  return (
    <div role="img" aria-label={props.ariaLabel}>
      <SeriesLegend series={props.series} />
      <div style={{ height: props.height ?? 260 }}>
        <ResponsiveContainer width="100%" height="100%">
          {/* Right margin holds end labels and the target label, outside the plot so they never sit on a line. */}
          <LineChart data={rows} margin={{ top: 8, right: labelEnds || props.target != null ? 64 : 16, bottom: 4, left: 0 }}>
            <CartesianGrid stroke={GRID} vertical={false} />
            <XAxis dataKey="x" tickFormatter={xLabel} tick={{ fill: AXIS, fontSize: 12 }} stroke={GRID} tickMargin={6} />
            {/* Counts always start at zero so changes are not exaggerated. */}
            <YAxis domain={props.yDomain ?? (props.unit === "count" ? [0, "auto"] : ["auto", "auto"])} tickFormatter={tick} tick={{ fill: AXIS, fontSize: 12 }} stroke={GRID} width={48} />
            {props.target != null ? (
              <ReferenceLine
                y={props.target}
                stroke="#4d4d4f"
                strokeDasharray="4 4"
                label={{ value: `Target ${props.target}`, position: "right", fill: "#4d4d4f", fontSize: 11 }}
              />
            ) : null}
            <Tooltip
              cursor={{ stroke: "#b5b5b8", strokeWidth: 1 }}
              content={(p) => <TooltipBox {...(p as object)} series={props.series} unit={props.unit} xLabel={xLabel} />}
            />
            {props.series.map((s) => (
              <Line
                key={s.id}
                dataKey={s.id}
                name={s.label}
                stroke={s.style.color}
                strokeWidth={2}
                strokeDasharray={s.style.dash || undefined}
                connectNulls
                isAnimationActive={false}
                dot={(d: { cx?: number; cy?: number; key?: React.Key | null; value?: unknown }) =>
                  d.value == null ? <g key={d.key ?? undefined} /> : <Marker key={d.key ?? undefined} cx={d.cx} cy={d.cy} style={s.style} />
                }
                activeDot={(d: { cx?: number; cy?: number }) => <Marker cx={d.cx} cy={d.cy} style={s.style} r={6} />}
              >
                {labelEnds ? (
                  <LabelList
                    dataKey={s.id}
                    content={(lp: { x?: number | string; y?: number | string; index?: number; value?: unknown }) => {
                      const last = rows.map((r) => r[s.id]).findLastIndex((v) => v != null);
                      if (lp.index !== last || lp.value == null) return null;
                      return (
                        <text x={Number(lp.x) + 10} y={Number(lp.y) + 4} fontSize={11} fill="#4d4d4f">
                          {s.label}
                        </text>
                      );
                    }}
                  />
                ) : null}
              </Line>
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

/** Score distribution as small multiples: one histogram per group, shared y scale. */
export function HistogramMultiples(props: {
  groups: { id: string; label: string; note: string | null; style: SeriesStyle; bins: { label: string; count: number }[] }[];
}) {
  const max = Math.max(1, ...props.groups.flatMap((g) => g.bins.map((b) => b.count)));
  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {props.groups.map((g) => (
        <figure key={g.id} className="min-w-0" aria-label={`Sebaran nilai ${g.label}`}>
          <figcaption className="mb-1 flex items-baseline justify-between gap-2 text-xs">
            <span className="font-medium text-brand-gray">{g.label}</span>
            <span className="truncate text-brand-gray-light">{g.note ?? "Belum ada nilai"}</span>
          </figcaption>
          <div style={{ height: 120 }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={g.bins} margin={{ top: 4, right: 4, bottom: 0, left: -24 }} barCategoryGap={2}>
                <CartesianGrid stroke={GRID} vertical={false} />
                <XAxis dataKey="label" tick={{ fill: AXIS, fontSize: 10 }} stroke={GRID} interval={1} />
                <YAxis domain={[0, max]} ticks={[...new Set([0, Math.ceil(max / 2), max])]} allowDecimals={false} tick={{ fill: AXIS, fontSize: 10 }} stroke={GRID} />
                <Tooltip
                  cursor={{ fill: "#f2f2f3" }}
                  content={({ active, payload }) =>
                    active && payload?.length ? (
                      <div className="rounded-md border border-border bg-white px-2 py-1 text-xs shadow-sm">
                        Nilai {String(payload[0]!.payload.label)}: <span className="font-medium">{String(payload[0]!.value)} siswa</span>
                      </div>
                    ) : null
                  }
                />
                <Bar dataKey="count" fill={g.style.color} radius={[4, 4, 0, 0]} isAnimationActive={false} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </figure>
      ))}
    </div>
  );
}
