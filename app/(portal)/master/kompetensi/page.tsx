import type { Metadata } from "next";
import { Suspense } from "react";
import { PageHeader, TableSkeleton } from "@/components/layout/page";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { queryAsUser, requireUser } from "@/lib/auth/session";
import { LEVEL_LABEL } from "@/lib/brand/schools";
import { listCompetencyTree } from "@/lib/queries/master";

export const metadata: Metadata = { title: "Kompetensi" };

export default function CompetenciesPage() {
  return (
    <>
      <PageHeader
        title="Kerangka Kompetensi"
        description="Mapel → Elemen → Sub-elemen, mengikuti Kerangka Asesmen TKA Pusmendik Kemendikdasmen. Setiap butir soal TO dipetakan ke satu sub-elemen."
      />
      <Suspense fallback={<TableSkeleton />}>
        <CompetencyTree />
      </Suspense>
    </>
  );
}

async function CompetencyTree() {
  await requireUser();
  const tree = await queryAsUser((tx) => listCompetencyTree(tx));
  return (
    <div className="grid gap-4 xl:grid-cols-2">
      {tree.map((subject) => (
        <Card key={subject.id} id={subject.id} className="scroll-mt-24">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              {subject.name}
              <Badge variant="secondary">{LEVEL_LABEL[subject.level]}</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ol className="space-y-4">
              {subject.elements.map((el) => (
                <li key={el.id}>
                  <p className="font-semibold text-brand-gray">
                    <span className="mr-2 font-mono text-xs text-brand-gray-light">{el.code}</span>
                    {el.name}
                  </p>
                  <ul className="mt-1 space-y-1 border-l-2 border-brand-blue-tint pl-4">
                    {el.children.map((sub) => (
                      <li key={sub.id} className="text-sm">
                        <span className="mr-2 font-mono text-xs text-brand-gray-light">{sub.code}</span>
                        {sub.name}
                      </li>
                    ))}
                  </ul>
                </li>
              ))}
            </ol>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
