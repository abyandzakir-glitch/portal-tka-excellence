/** Role helpers shared by server and client code (no secrets here). */
export const ROLES = ["super_admin", "viewer", "school_admin", "teacher"] as const;
export type Role = (typeof ROLES)[number];

export const ROLE_LABEL: Record<Role, string> = {
  super_admin: "Super Admin (Yayasan)",
  viewer: "Manajemen",
  school_admin: "Admin Sekolah",
  teacher: "Guru / Wali Kelas",
};

export interface CurrentUser {
  id: string;
  email: string;
  fullName: string;
  role: Role;
  /** Set for school_admin and teacher; null for network-wide roles. */
  schoolId: string | null;
  schoolCode: string | null;
  schoolName: string | null;
}

/** Network-wide roles see all five schools. */
export function isNetworkRole(role: Role) {
  return role === "super_admin" || role === "viewer";
}

export function canWriteData(role: Role) {
  return role === "super_admin" || role === "school_admin";
}
