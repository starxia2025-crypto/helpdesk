export function getDefaultRouteForRole(role?: string | null): string {
  if (!role) return "/";
  return role === "usuario_cliente" ? "/tickets" : "/dashboard";
}
