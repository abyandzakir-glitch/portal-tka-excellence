"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BarChart3,
  BookOpen,
  CalendarDays,
  DoorOpen,
  History,
  Home,
  Network,
  School,
  Settings,
  ShieldCheck,
  Trophy,
  Upload,
  Users,
  type LucideIcon, FileText, ClipboardList } from "lucide-react";
import type { NavSection } from "@/lib/nav";
import { cn } from "@/lib/utils";

const ICONS: Record<string, LucideIcon> = {
  home: Home,
  chart: BarChart3,
  trophy: Trophy,
  upload: Upload,
  school: School,
  calendar: CalendarDays,
  door: DoorOpen,
  users: Users,
  book: BookOpen,
  tree: Network,
  settings: Settings,
  shield: ShieldCheck,
  history: History,
  file: FileText,
  clipboard: ClipboardList,
};

function isActive(pathname: string, href: string) {
  return href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);
}

export function SidebarNav({ sections, onNavigate }: { sections: NavSection[]; onNavigate?: () => void }) {
  const pathname = usePathname();
  return (
    <nav aria-label="Navigasi utama" className="space-y-5">
      {sections.map((section, idx) => (
        <div key={section.title ?? idx} className="space-y-1">
          {section.title ? (
            <p className="px-3 pb-1 text-xs font-semibold uppercase tracking-wide text-brand-gray-light">
              {section.title}
            </p>
          ) : null}
          <ul className="space-y-0.5">
            {section.items.map((item) => {
              const Icon = ICONS[item.icon] ?? Home;
              const active = isActive(pathname, item.href);
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    onClick={onNavigate}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                      "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-sky",
                      active
                        ? "bg-brand-blue-tint text-brand-blue"
                        : "text-brand-gray hover:bg-muted hover:text-brand-blue",
                    )}
                  >
                    <Icon aria-hidden="true" className="size-4 shrink-0" />
                    {item.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}
