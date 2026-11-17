import type { Role } from "@/lib/auth/roles";

export interface NavItem {
  href: string;
  label: string;
  icon: string; // lucide icon name, resolved in the client nav component
  roles?: readonly Role[]; // omitted = every role
}

export interface NavSection {
  title?: string;
  items: NavItem[];
}

const WRITERS = ["super_admin", "school_admin"] as const;
const SUPER = ["super_admin"] as const;

export const NAV: NavSection[] = [
  { items: [{ href: "/", label: "Beranda", icon: "home" }] },
  {
    title: "Dashboard",
    items: [
      { href: "/tka", label: "TKA", icon: "chart" },
      { href: "/prestasi", label: "Prestasi", icon: "trophy" },
    ],
  },
  {
    title: "Data",
    items: [{ href: "/input", label: "Input Pekanan", icon: "upload", roles: WRITERS }],
  },
  {
    title: "Master Data",
    items: [
      { href: "/master/sekolah", label: "Sekolah", icon: "school" },
      { href: "/master/tahun-ajaran", label: "Tahun Ajaran", icon: "calendar" },
      { href: "/master/kelas", label: "Kelas", icon: "door" },
      { href: "/master/siswa", label: "Siswa", icon: "users" },
      { href: "/master/mapel", label: "Mata Pelajaran", icon: "book" },
      { href: "/master/kompetensi", label: "Kompetensi", icon: "tree" },
    ],
  },
  {
    title: "Administrasi",
    items: [
      { href: "/pengaturan", label: "Pengaturan", icon: "settings", roles: SUPER },
      { href: "/pengguna", label: "Pengguna", icon: "shield", roles: SUPER },
      { href: "/audit", label: "Audit Log", icon: "history", roles: SUPER },
    ],
  },
];

export function navForRole(role: Role): NavSection[] {
  return NAV.map((s) => ({ ...s, items: s.items.filter((i) => !i.roles || i.roles.includes(role)) })).filter(
    (s) => s.items.length > 0,
  );
}
