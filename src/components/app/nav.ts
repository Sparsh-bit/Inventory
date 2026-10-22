import {
  BarChart3, Boxes, ClipboardList, Factory, LayoutDashboard, Package, Receipt, ScanBarcode, Settings, Truck, Upload, Users,
  type LucideIcon,
} from "lucide-react";
import type { Permission } from "@/lib/permissions";

export interface NavItem {
  title: string;
  href: string;
  icon: LucideIcon;
  permission?: Permission;
  keywords?: string;
  children?: { title: string; href: string; permission?: Permission }[];
}

export const NAV: { label: string; items: NavItem[] }[] = [
  {
    label: "Sell",
    items: [
      { title: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
      { title: "Point of Sale", href: "/pos", icon: ScanBarcode, permission: "pos:sell", keywords: "billing checkout new sale" },
      { title: "Sales & Invoices", href: "/sales", icon: Receipt, permission: "sales:read", keywords: "bills returns" },
      { title: "Customers", href: "/customers", icon: Users, permission: "parties:read" },
    ],
  },
  {
    label: "Stock",
    items: [
      { title: "Products", href: "/products", icon: Package, permission: "products:read", keywords: "items catalog barcode labels" },
      {
        title: "Inventory", href: "/inventory", icon: Boxes, permission: "stock:read", keywords: "stock levels",
        children: [
          { title: "Stock levels", href: "/inventory" },
          { title: "Adjust stock", href: "/inventory/adjust", permission: "stock:write" },
          { title: "Transfer", href: "/inventory/transfer", permission: "stock:write" },
          { title: "Stock count", href: "/inventory/count", permission: "stock:write" },
          { title: "Serial numbers", href: "/inventory/serials" },
          { title: "Movement history", href: "/inventory/history" },
        ],
      },
      { title: "Purchases", href: "/purchases", icon: Truck, permission: "purchases:read", keywords: "purchase orders receive goods" },
      { title: "Suppliers", href: "/suppliers", icon: Factory, permission: "purchases:read", keywords: "vendors" },
    ],
  },
  {
    label: "Manage",
    items: [
      { title: "Reports", href: "/reports", icon: BarChart3, permission: "reports:read", keywords: "gst analytics profit" },
      { title: "Import", href: "/import", icon: Upload, permission: "import:run", keywords: "csv excel upload" },
      { title: "Audit log", href: "/settings/audit", icon: ClipboardList, permission: "audit:read" },
      { title: "Settings", href: "/settings", icon: Settings, keywords: "printer scanner tax business members" },
    ],
  },
];
