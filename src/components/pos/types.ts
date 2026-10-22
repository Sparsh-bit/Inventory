import type { VariantHit } from "@/server/services/products";

export interface CartLine {
  key: string;
  hit: VariantHit;
  qty: number; // scaled integer
  discount: number; // minor units
  unitPrice: number; // minor units (override or hit.salePrice)
  batchId: string | null;
}

export interface PosCustomer {
  id: string;
  name: string;
  phone: string;
  stateCode: string;
  taxId: string;
  balance: number;
}

export interface PosConfig {
  orgStateCode: string;
  roundOff: boolean;
  allowNegativeStock: boolean;
  upiId: string;
  orgName: string;
}
