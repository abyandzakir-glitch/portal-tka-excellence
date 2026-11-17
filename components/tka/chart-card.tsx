"use client";

import { Table2, BarChart3 } from "lucide-react";
import { useId, useState } from "react";
import { cn } from "@/lib/utils";

/**
 * Card around every chart (§12): clear title, period note, and a table view
 * twin so no value is reachable through colour or hover alone.
 */
export function ChartCard(props: {
  title: string;
  subtitle?: string;
  period?: string;
  table?: React.ReactNode;
  className?: string;
  children: React.ReactNode;
  actions?: React.ReactNode;
}) {
  const [showTable, setShowTable] = useState(false);
  const id = useId();
  return (
    <section aria-labelledby={id} className={cn("flex min-w-0 flex-col rounded-lg border border-border bg-white", props.className)}>
      <header className="flex flex-wrap items-start justify-between gap-2 px-4 pt-4">
        <div className="min-w-0">
          <h3 id={id} className="font-heading text-base font-semibold leading-snug">{props.title}</h3>
          {props.subtitle || props.period ? (
            <p className="text-xs text-brand-gray-light">{[props.subtitle, props.period].filter(Boolean).join(" · ")}</p>
          ) : null}
        </div>
        <div className="flex items-center gap-2">
          {props.actions}
          {props.table ? (
            <button
              type="button"
              onClick={() => setShowTable((v) => !v)}
              aria-pressed={showTable}
              className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs text-brand-blue hover:bg-muted focus-visible:outline-2 focus-visible:outline-brand-sky"
            >
              {showTable ? <BarChart3 aria-hidden="true" className="size-3.5" /> : <Table2 aria-hidden="true" className="size-3.5" />}
              {showTable ? "Lihat grafik" : "Lihat tabel"}
            </button>
          ) : null}
        </div>
      </header>
      <div className="min-w-0 flex-1 p-4 pt-3">{showTable && props.table ? <div className="overflow-x-auto">{props.table}</div> : props.children}</div>
    </section>
  );
}

export function MiniTable({ head, rows }: { head: string[]; rows: (string | number)[][] }) {
  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="border-b border-border text-left text-brand-gray-light">
          {head.map((h, i) => (
            <th key={i} scope="col" className={cn("py-1.5 pr-3 font-medium", i > 0 && "text-right")}>{h}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((r, i) => (
          <tr key={i} className="border-b border-border/60 last:border-0">
            {r.map((c, j) => (
              <td key={j} className={cn("py-1.5 pr-3", j > 0 && "text-right tabular-nums")}>{c}</td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function ChartEmpty({ message, action }: { message: string; action?: { href: string; label: string } }) {
  return (
    <div className="flex h-48 flex-col items-center justify-center gap-2 rounded-md border border-dashed border-border text-center text-sm text-brand-gray-light">
      <p className="max-w-sm">{message}</p>
      {action ? (
        <a href={action.href} className="font-medium text-brand-blue hover:underline">
          {action.label} →
        </a>
      ) : null}
    </div>
  );
}
