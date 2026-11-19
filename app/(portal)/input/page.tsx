import type { Metadata } from "next";
import { Suspense } from "react";
import { PageHeader, TableSkeleton } from "@/components/layout/page";
import { InputBoard } from "./week-status";

export const metadata: Metadata = { title: "Input Pekanan" };

export default function InputPekananPage(props: PageProps<"/input">) {
  return (
    <Suspense
      fallback={
        <>
          <PageHeader title="Input Pekanan" />
          <TableSkeleton rows={8} />
        </>
      }
    >
      <InputBoard searchParams={props.searchParams} />
    </Suspense>
  );
}
