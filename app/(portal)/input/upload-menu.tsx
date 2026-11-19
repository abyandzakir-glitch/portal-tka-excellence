"use client";

import Link from "next/link";
import { Menu as MenuPrimitive } from "@base-ui/react/menu";
import { ChevronDown, ClipboardList, ListChecks, NotebookPen, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";

const ITEMS = [
  { href: "/input/unggah/hasil", label: "Hasil Try Out", hint: "Jawaban per soal atau nilai total", icon: ListChecks },
  { href: "/input/unggah/latihan", label: "Latihan Pekanan", hint: "Soal dikerjakan & benar per siswa", icon: NotebookPen },
  { href: "/input/unggah/kisi", label: "Kisi-kisi Try Out", hint: "Sekali, sebelum hasil TO", icon: ClipboardList },
] as const;

/** "Unggah data" dropdown on Input Pekanan: the weekly TKA upload kinds. */
export function UploadMenu() {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={<Button className="h-9 gap-2 px-3" />}>
        <Upload aria-hidden="true" className="size-4" />
        Unggah data
        <ChevronDown aria-hidden="true" className="size-4" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-72">
        {ITEMS.map((it) => (
          <MenuPrimitive.LinkItem
            key={it.href}
            render={<Link href={it.href} />}
            className="flex items-start gap-2.5 rounded-md px-2 py-2 text-sm outline-hidden focus:bg-accent focus:text-accent-foreground"
          >
            <it.icon aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-brand-blue" />
            <span>
              <span className="block font-medium text-brand-gray">{it.label}</span>
              <span className="block text-xs text-brand-gray-light">{it.hint}</span>
            </span>
          </MenuPrimitive.LinkItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
