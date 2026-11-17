"use client";

import { useState } from "react";
import { Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { LEVEL_LABEL, LEVELS, type Level } from "@/lib/achievements/labels";
import { cn } from "@/lib/utils";

const GRID = "#e6e6e8";
const AXIS = "#6b6b6e";

/**
 * Ordered levels -> one-hue ordinal ramp, validated with the dataviz palette
 * validator (--ordinal: monotone lightness, visible steps, light end ≥ 2:1).
 * Unknown level is neutral gray.
 */
export const LEVEL_COLOR: Record<Level | "KOSONG", string> = {
  KOTA_KABUPATEN: "#86ACDD",
  PROVINSI: "#4F84C9",
  NASIONAL: "#255BA6",
  INTERNASIONAL: "#0E3F7A",
  KOSONG: "#C4C4C7",
};
const LEVEL_ORDER = [...LEVELS, "KOSONG"] as const;
const levelLabel = (l: Level | "KOSONG") => (l === "KOSONG" ? "Tidak diketahui" : LEVEL_LABEL[l]);

const fmtInt = (n: number) => n.toLocaleString("id-ID");
const pct = (n: number, total: number) => (total ? `${Math.round((n / total) * 100)}%` : "0%");

/** Horizontal stacked bars: one bar per school, segments by level (2px surface gaps). */
export function SchoolLevelBars(props: { rows: { label: string; href: string; counts: Record<Level | "KOSONG", number> }[] }) {
  const max = Math.max(1, ...props.rows.map((r) => LEVEL_ORDER.reduce((s, l) => s + r.counts[l], 0)));
  return (
    <div className="space-y-3">
      <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-brand-gray" aria-label="Keterangan tingkat">
        {LEVEL_ORDER.map((l) => (
          <li key={l} className="inline-flex items-center gap-1.5">
            <span aria-hidden="true" className="inline-block size-3 rounded-sm" style={{ background: LEVEL_COLOR[l] }} />
            {levelLabel(l)}
          </li>
        ))}
      </ul>
      <ul className="space-y-2.5">
        {props.rows.map((r) => {
          const total = LEVEL_ORDER.reduce((s, l) => s + r.counts[l], 0);
          return (
            <li key={r.label} className="grid grid-cols-[6.5rem_minmax(0,1fr)_2.5rem] items-center gap-2 text-sm">
              <a href={r.href} className="truncate font-mono text-xs text-brand-blue hover:underline">{r.label}</a>
              <div className="flex h-6 gap-[2px]" style={{ width: `${(total / max) * 100}%` }} role="img" aria-label={`${r.label}: ${LEVEL_ORDER.map((l) => `${levelLabel(l)} ${r.counts[l]}`).join(", ")}`}>
                {LEVEL_ORDER.filter((l) => r.counts[l] > 0).map((l, i, arr) => (
                  <div
                    key={l}
                    title={`${levelLabel(l)}: ${r.counts[l]}`}
                    className={cn("h-full", i === 0 && "rounded-l", i === arr.length - 1 && "rounded-r")}
                    style={{ flexGrow: r.counts[l], flexBasis: 0, background: LEVEL_COLOR[l] }}
                  />
                ))}
              </div>
              <span className="text-right tabular-nums">{fmtInt(total)}</span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/** Two-part share as one segmented bar with counts and percentages (replaces a 2-slice donut). */
export function SplitBar(props: { parts: { label: string; value: number; color: string }[] }) {
  const total = props.parts.reduce((s, p) => s + p.value, 0);
  if (!total) return <p className="text-sm text-brand-gray-light">Belum ada data.</p>;
  return (
    <div className="space-y-3">
      <div className="flex h-10 gap-[2px]" role="img" aria-label={props.parts.map((p) => `${p.label} ${p.value} (${pct(p.value, total)})`).join(", ")}>
        {props.parts
          .filter((p) => p.value > 0)
          .map((p, i, arr) => (
            <div
              key={p.label}
              className={cn("flex h-full items-center justify-center overflow-hidden text-sm font-medium text-white", i === 0 && "rounded-l-md", i === arr.length - 1 && "rounded-r-md")}
              style={{ flexGrow: p.value, flexBasis: 0, background: p.color }}
              title={`${p.label}: ${p.value}`}
            >
              {p.value / total >= 0.12 ? pct(p.value, total) : ""}
            </div>
          ))}
      </div>
      <ul className="grid gap-1 text-sm sm:grid-cols-3">
        {props.parts.map((p) => (
          <li key={p.label} className="flex items-center gap-2">
            <span aria-hidden="true" className="inline-block size-3 rounded-sm" style={{ background: p.color }} />
            <span>{p.label}</span>
            <span className="ml-auto font-semibold tabular-nums">{fmtInt(p.value)}</span>
            <span className="w-10 text-right text-brand-gray-light tabular-nums">{pct(p.value, total)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Nominal categories: one colour for every bar (no value ramp), value labels at bar ends. */
export function CategoryBars(props: { rows: { label: string; value: number; href: string }[] }) {
  const max = Math.max(1, ...props.rows.map((r) => r.value));
  return (
    <ul className="space-y-2">
      {props.rows.map((r) => (
        <li key={r.label} className="grid grid-cols-[7.5rem_minmax(0,1fr)] items-center gap-2 text-sm">
          <a href={r.href} className="truncate text-brand-blue hover:underline">{r.label}</a>
          <span className="flex items-center gap-2">
            <span className="h-5 rounded-r bg-brand-blue" style={{ width: `${Math.max(r.value ? 2 : 0, (r.value / max) * 85)}%` }} aria-hidden="true" />
            <span className="tabular-nums">{fmtInt(r.value)}</span>
          </span>
        </li>
      ))}
    </ul>
  );
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];
const monthLabel = (k: string) => `${MONTHS[Number(k.slice(5, 7)) - 1]} ${k.slice(2, 4)}`;
const weekLabel = (k: string) => `${Number(k.slice(8, 10))} ${MONTHS[Number(k.slice(5, 7)) - 1]}`;

function Toggle({ value, current, set, children }: { value: string; current: string; set: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={value === current}
      onClick={set}
      className={cn("rounded-md px-2.5 py-1 text-xs focus-visible:outline-2 focus-visible:outline-brand-sky", value === current ? "bg-brand-blue text-white" : "text-brand-gray hover:bg-muted")}
    >
      {children}
    </button>
  );
}

/** Monthly/weekly trend; per period (bars) or cumulative (line) — one measure at a time, one axis. */
export function TrendChart(props: { monthly: { key: string; count: number; cumulative: number }[]; weekly: { key: string; count: number; cumulative: number }[] }) {
  const [by, setBy] = useState<"month" | "week">("month");
  const [mode, setMode] = useState<"count" | "cumulative">("count");
  const data = by === "month" ? props.monthly : props.weekly;
  const label = by === "month" ? monthLabel : weekLabel;
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        <span className="inline-flex rounded-lg border border-input p-0.5">
          <Toggle value="month" current={by} set={() => setBy("month")}>Bulanan</Toggle>
          <Toggle value="week" current={by} set={() => setBy("week")}>Pekanan</Toggle>
        </span>
        <span className="inline-flex rounded-lg border border-input p-0.5">
          <Toggle value="count" current={mode} set={() => setMode("count")}>Per periode</Toggle>
          <Toggle value="cumulative" current={mode} set={() => setMode("cumulative")}>Kumulatif</Toggle>
        </span>
      </div>
      <div style={{ height: 240 }} role="img" aria-label={`Grafik jumlah prestasi ${by === "month" ? "per bulan" : "per pekan"}${mode === "cumulative" ? " (kumulatif)" : ""}`}>
        <ResponsiveContainer width="100%" height="100%">
          {mode === "count" ? (
            <BarChart data={data} margin={{ top: 8, right: 8, bottom: 4, left: -16 }} barCategoryGap={2}>
              <CartesianGrid stroke={GRID} vertical={false} />
              <XAxis dataKey="key" tickFormatter={label} tick={{ fill: AXIS, fontSize: 11 }} stroke={GRID} interval="preserveStartEnd" />
              <YAxis allowDecimals={false} tick={{ fill: AXIS, fontSize: 11 }} stroke={GRID} />
              <Tooltip cursor={{ fill: "#f2f2f3" }} formatter={(v) => [`${v} prestasi`, "Jumlah"]} labelFormatter={(k) => label(String(k))} />
              <Bar dataKey="count" fill="#0E4E96" radius={[4, 4, 0, 0]} isAnimationActive={false} />
            </BarChart>
          ) : (
            <LineChart data={data} margin={{ top: 8, right: 8, bottom: 4, left: -16 }}>
              <CartesianGrid stroke={GRID} vertical={false} />
              <XAxis dataKey="key" tickFormatter={label} tick={{ fill: AXIS, fontSize: 11 }} stroke={GRID} interval="preserveStartEnd" />
              <YAxis allowDecimals={false} domain={[0, "auto"]} tick={{ fill: AXIS, fontSize: 11 }} stroke={GRID} />
              <Tooltip formatter={(v) => [`${v} prestasi`, "Kumulatif"]} labelFormatter={(k) => label(String(k))} />
              <Line dataKey="cumulative" stroke="#0E4E96" strokeWidth={2} dot={{ r: 3, fill: "#0E4E96", stroke: "#fff", strokeWidth: 2 }} isAnimationActive={false} />
            </LineChart>
          )}
        </ResponsiveContainer>
      </div>
    </div>
  );
}
