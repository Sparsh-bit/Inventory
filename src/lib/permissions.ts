export const ROLES = ["owner", "manager", "cashier", "stockkeeper"] as const;
export type Role = (typeof ROLES)[number];

export const ROLE_LABELS: Record<Role, string> = {
  owner: "Owner",
  manager: "Manager",
  cashier: "Cashier",
  stockkeeper: "Stock keeper",
};

export type Permission =
  | "settings:manage"
  | "members:manage"
  | "products:read"
  | "products:write"
  | "stock:read"
  | "stock:write"
  | "purchases:read"
  | "purchases:write"
  | "pos:sell"
  | "sales:read"
  | "sales:return"
  | "sales:void"
  | "price:override"
  | "parties:read"
  | "parties:write"
  | "reports:read"
  | "cost:read"
  | "audit:read"
  | "import:run"
  | "ledger:reverse";

const MANAGER: Permission[] = [
  "products:read", "products:write", "stock:read", "stock:write", "purchases:read", "purchases:write",
  "pos:sell", "sales:read", "sales:return", "sales:void", "price:override", "parties:read", "parties:write",
  "reports:read", "cost:read", "audit:read", "import:run", "ledger:reverse",
];

const MATRIX: Record<Role, ReadonlySet<Permission>> = {
  owner: new Set<Permission>([...MANAGER, "settings:manage", "members:manage"]),
  manager: new Set(MANAGER),
  cashier: new Set<Permission>(["products:read", "stock:read", "pos:sell", "sales:read", "parties:read", "parties:write"]),
  stockkeeper: new Set<Permission>(["products:read", "products:write", "stock:read", "stock:write", "purchases:read", "purchases:write", "parties:read", "import:run"]),
};

/** Cost prices are for people who see margins or buy stock, not for cashiers. */
export const seesCost = (role: Role) => can(role, "cost:read") || can(role, "purchases:write");

export function can(role: Role, p: Permission): boolean {
  return MATRIX[role]?.has(p) ?? false;
}

export function isRole(r: unknown): r is Role {
  return typeof r === "string" && (ROLES as readonly string[]).includes(r);
}
