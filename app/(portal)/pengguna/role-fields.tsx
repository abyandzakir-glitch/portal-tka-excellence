"use client";

import { useState } from "react";
import { Label } from "@/components/ui/label";

const selectClass = "h-9 w-full rounded-lg border border-input bg-white px-2 text-sm focus-visible:outline-2 focus-visible:outline-brand-sky";

const OPTIONS = [
  { value: "viewer", label: "Manajemen (hanya melihat, 5 sekolah)" },
  { value: "school_admin", label: "Admin Sekolah (input data sekolahnya)" },
  { value: "super_admin", label: "Super Admin (Yayasan, akses penuh)" },
] as const;

/** Role + school pickers; the school field appears only for Admin Sekolah. */
export function RoleFields(props: {
  idPrefix: string;
  schools: { id: string; name: string }[];
  defaultRole?: string;
  defaultSchool?: string | null;
}) {
  const [role, setRole] = useState(props.defaultRole ?? "viewer");
  return (
    <>
      <div className="space-y-1">
        <Label htmlFor={`${props.idPrefix}-peran`}>Peran</Label>
        <select id={`${props.idPrefix}-peran`} name="peran" value={role} onChange={(e) => setRole(e.target.value)} className={selectClass}>
          {OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
      </div>
      {role === "school_admin" ? (
        <div className="space-y-1">
          <Label htmlFor={`${props.idPrefix}-sekolah`}>Sekolah</Label>
          <select id={`${props.idPrefix}-sekolah`} name="sekolah" defaultValue={props.defaultSchool ?? ""} required className={selectClass}>
            <option value="" disabled>Pilih sekolah…</option>
            {props.schools.map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
        </div>
      ) : (
        <input type="hidden" name="sekolah" value="" />
      )}
    </>
  );
}
