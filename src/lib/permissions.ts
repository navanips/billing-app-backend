import { Role } from "@prisma/client";
import { prisma } from "./prisma";
import { PERMISSION_KEYS, PermissionKey } from "../constants/permissions";

export async function getEffectivePermissions(role: Role): Promise<PermissionKey[]> {
  if (role === "MASTER") return PERMISSION_KEYS;

  const rows = await prisma.rolePermission.findMany({
    where: { role, granted: true },
  });
  const granted = new Set(rows.map((r) => r.permissionKey));
  return PERMISSION_KEYS.filter((key) => granted.has(key));
}

export async function hasPermission(role: Role, key: PermissionKey): Promise<boolean> {
  if (role === "MASTER") return true;
  const row = await prisma.rolePermission.findUnique({
    where: { role_permissionKey: { role, permissionKey: key } },
  });
  return !!row?.granted;
}
