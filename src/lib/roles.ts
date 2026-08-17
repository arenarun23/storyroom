// 최고관리자는 이 이메일에만 부여될 수 있다 (sql/05_superadmin.sql의 DB
// CHECK 제약과 반드시 일치해야 한다 — 이 상수는 UI/서버 액션의 편의용이고,
// 실제 강제는 DB 제약이 담당한다).
export const SUPER_ADMIN_EMAIL = "arenarun23@gmail.com";

export function isAdminRole(role: string | null | undefined): boolean {
  return role === "admin" || role === "super_admin";
}
