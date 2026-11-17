import { Construction } from "lucide-react";
import { EmptyState, PageHeader } from "./page";

/** Placeholder for pages scheduled in later phases (CLAUDE.md §11). */
export function ComingSoon({ title, phase, description }: { title: string; phase: number; description: string }) {
  return (
    <>
      <PageHeader title={title} description={description} />
      <EmptyState
        icon={Construction}
        title={`Sedang dibangun (Fase ${phase})`}
        description="Halaman ini akan tersedia pada tahap pengembangan berikutnya."
      />
    </>
  );
}
