// The fixed set of permissions that can be granted to BRANCH_MANAGER and
// STAFF. MASTER always has all of these, hardcoded — it never reads from
// the RolePermission table. Baseline actions every logged-in role can do
// regardless of permissions (viewing products, creating a bill) aren't
// listed here since they're not gated at all.
export const PERMISSIONS = [
  { key: "products.create", label: "Add products", group: "Products" },
  { key: "products.edit", label: "Edit products", group: "Products" },
  { key: "products.delete", label: "Delete products", group: "Products" },
  { key: "billing.view_all", label: "View all staff's bills (not just their own)", group: "Billing" },
  { key: "staff.manage", label: "Manage staff accounts", group: "Staff" },
  { key: "settings.manage", label: "Edit company name & logo", group: "Settings" },
] as const;

export type PermissionKey = (typeof PERMISSIONS)[number]["key"];

export const PERMISSION_KEYS: PermissionKey[] = PERMISSIONS.map((p) => p.key);

export function isValidPermissionKey(key: string): key is PermissionKey {
  return PERMISSION_KEYS.includes(key as PermissionKey);
}
