"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type State = { error?: string; message?: string };

/**
 * Small form bound to a Server Action, with inline feedback (error or
 * confirmation) announced to screen readers. Used across master data pages.
 */
export function ActionForm(props: {
  action: (prev: State, fd: FormData) => Promise<State>;
  submitLabel: string;
  pendingLabel?: string;
  variant?: "default" | "outline" | "destructive";
  confirm?: string;
  className?: string;
  /** For grid layouts: put the submit button on its own full-width row. */
  stacked?: boolean;
  children?: React.ReactNode;
}) {
  const [state, action, pending] = useActionState<State, FormData>(props.action, {});
  return (
    <form
      action={action}
      className={cn("flex flex-wrap items-end gap-2", props.className)}
      onSubmit={(e) => {
        if (props.confirm && !confirm(props.confirm)) e.preventDefault();
      }}
    >
      {props.children}
      <div className={props.stacked ? "col-span-full" : "contents"}>
        <Button type="submit" variant={props.variant ?? "default"} disabled={pending}>
          {pending ? (props.pendingLabel ?? "Menyimpan…") : props.submitLabel}
        </Button>
      </div>
      <p role="status" aria-live="polite" className={cn("col-span-full w-full text-sm", state.error ? "text-status-intervensi" : "text-status-cakap")}>
        {state.error ?? state.message ?? ""}
      </p>
    </form>
  );
}
