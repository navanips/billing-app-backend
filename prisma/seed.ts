import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { PERMISSIONS } from "../src/constants/permissions";

const prisma = new PrismaClient();

const DEFAULT_MASTER_PASSWORD = "ChangeMe123!";

async function main() {
  // --- Master account ---
  const passwordHash = await bcrypt.hash(DEFAULT_MASTER_PASSWORD, 10);
  const master = await prisma.user.upsert({
    where: { email: "master@shop.local" },
    update: {},
    create: { name: "Shop Master", email: "master@shop.local", passwordHash, role: "MASTER" },
  });
  console.log(`Master account ready: ${master.email} / ${DEFAULT_MASTER_PASSWORD} (change this after first login!)`);

  // --- Default permissions ---
  // Branch Manager: everything except staff management and settings.
  // Staff: view-only — can bill and see products, nothing else.
  const defaults: Record<string, Record<string, boolean>> = {
    "products.create": { BRANCH_MANAGER: true, STAFF: false },
    "products.edit": { BRANCH_MANAGER: true, STAFF: false },
    "products.delete": { BRANCH_MANAGER: false, STAFF: false },
    "billing.view_all": { BRANCH_MANAGER: true, STAFF: false },
    "staff.manage": { BRANCH_MANAGER: false, STAFF: false },
    "settings.manage": { BRANCH_MANAGER: false, STAFF: false },
  };

  for (const perm of PERMISSIONS) {
    for (const role of ["BRANCH_MANAGER", "STAFF"] as const) {
      await prisma.rolePermission.upsert({
        where: { role_permissionKey: { role, permissionKey: perm.key } },
        update: {},
        create: { role, permissionKey: perm.key, granted: defaults[perm.key]?.[role] ?? false },
      });
    }
  }
  console.log("Default permissions set for Branch Manager and Staff.");

  // --- Settings ---
  await prisma.settings.upsert({
    where: { id: 1 },
    update: {},
    create: { id: 1, companyName: "My Shop" },
  });

  // --- Sample products ---
  const products = [
    { name: "Wireless Mouse", category: "Electronics", unit: "pcs", price: 799, qty: 42 },
    { name: "Notebook A5", category: "Stationery", unit: "pcs", price: 60, qty: 150 },
    { name: "Steel Water Bottle", category: "Home", unit: "pcs", price: 349, qty: 8 },
    { name: "USB-C Cable", category: "Electronics", unit: "pcs", price: 249, qty: 0 },
    { name: "Ballpoint Pen (Box of 10)", category: "Stationery", unit: "box", price: 120, qty: 65 },
  ];

  for (const p of products) {
    await prisma.product.upsert({
      where: { name: p.name },
      update: {},
      create: p,
    });
  }
  console.log(`Seeded ${products.length} products.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
