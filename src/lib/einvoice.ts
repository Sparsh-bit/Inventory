// GST e-invoice (INV-01, schema v1.1) and e-way bill JSON builders + pre-submission validation.
import { isValidGstin } from "./gstin";

/** Our unit codes → GST Unique Quantity Codes. */
export const UQC: Record<string, string> = {
  pcs: "PCS", box: "BOX", pack: "PAC", pair: "PRS", dozen: "DOZ", set: "SET", bottle: "BTL", strip: "OTH", kg: "KGS", l: "LTR", m: "MTR",
};

const r2 = (n: number) => Math.round(n * 100) / 100;
const r3 = (n: number) => Math.round(n * 1000) / 1000;
const rupees = (minor: number) => r2(minor / 100);

export interface Party {
  gstin: string;
  legalName: string;
  tradeName?: string;
  address1: string;
  address2?: string;
  location: string;
  pin: string;
  stateCode: string;
  phone?: string;
  email?: string;
}

export interface EinvLine {
  name: string;
  hsn: string;
  qty: number; // scaled integer
  scale: number;
  unit: string;
  discount: number; // minor, as charged (incl. tax when inclusive)
  taxable: number; // minor
  rateBp: number;
  cessBp: number;
  inclusive: boolean;
  cgst: number;
  sgst: number;
  igst: number;
  cess: number;
  total: number;
  serials?: string[];
  batchNo?: string;
}

export interface EinvInput {
  docType: "INV" | "CRN";
  docNo: string;
  docDate: string; // dd/mm/yyyy
  seller: Party;
  buyer: Party; // stateCode = place of supply
  lines: EinvLine[];
  roundOff: number; // minor
  grandTotal: number; // minor
  original?: { no: string; date: string }; // for credit notes
}

function party(p: Party) {
  return {
    Gstin: p.gstin, LglNm: p.legalName, ...(p.tradeName && p.tradeName !== p.legalName ? { TrdNm: p.tradeName } : {}),
    Addr1: p.address1, ...(p.address2 ? { Addr2: p.address2 } : {}), Loc: p.location, Pin: Number(p.pin), Stcd: p.stateCode,
    ...(p.phone && /^\d{6,12}$/.test(p.phone.replace(/\D/g, "")) ? { Ph: p.phone.replace(/\D/g, "").slice(-12) } : {}),
    ...(p.email ? { Em: p.email } : {}),
  };
}

/** Builds the NIC INV-01 v1.1 JSON. Inclusive prices are expressed tax-exclusive as the schema requires. */
export function buildEinvoice(i: EinvInput) {
  const items = i.lines.map((l, idx) => {
    const qty = r3(l.qty / l.scale);
    // Discount ex-tax: inclusive discounts carried tax, exclusive ones did not.
    const discountEx = l.inclusive ? Math.round((l.discount * 10000) / (10000 + l.rateBp + l.cessBp)) : l.discount;
    const totAmt = rupees(l.taxable + discountEx);
    return {
      SlNo: String(idx + 1),
      PrdDesc: l.name.slice(0, 300),
      IsServc: l.hsn.startsWith("99") ? "Y" : "N",
      HsnCd: l.hsn,
      Qty: qty,
      Unit: UQC[l.unit] ?? "OTH",
      UnitPrice: qty ? r3(totAmt / qty) : totAmt,
      TotAmt: totAmt,
      Discount: rupees(discountEx),
      AssAmt: rupees(l.taxable),
      GstRt: l.rateBp / 100,
      IgstAmt: rupees(l.igst),
      CgstAmt: rupees(l.cgst),
      SgstAmt: rupees(l.sgst),
      CesRt: l.cessBp / 100,
      CesAmt: rupees(l.cess),
      TotItemVal: rupees(l.total),
      ...(l.serials?.length ? { PrdSlNo: l.serials.join(",").slice(0, 20) } : {}),
      ...(l.batchNo ? { BchDtls: { Nm: l.batchNo.slice(0, 20) } } : {}),
    };
  });
  const sum = (k: "AssAmt" | "CgstAmt" | "SgstAmt" | "IgstAmt" | "CesAmt") => r2(items.reduce((a, it) => a + it[k], 0));
  return {
    Version: "1.1",
    TranDtls: { TaxSch: "GST", SupTyp: "B2B", RegRev: "N", IgstOnIntra: "N" },
    DocDtls: { Typ: i.docType, No: i.docNo, Dt: i.docDate },
    SellerDtls: party(i.seller),
    BuyerDtls: { ...party(i.buyer), Pos: i.buyer.stateCode },
    ItemList: items,
    ValDtls: {
      AssVal: sum("AssAmt"), CgstVal: sum("CgstAmt"), SgstVal: sum("SgstAmt"), IgstVal: sum("IgstAmt"), CesVal: sum("CesAmt"),
      StCesVal: 0, Discount: 0, OthChrg: 0, RndOffAmt: rupees(i.roundOff), TotInvVal: rupees(i.grandTotal),
    },
    ...(i.original ? { RefDtls: { PrecDocDtls: [{ InvNo: i.original.no, InvDt: i.original.date }] } } : {}),
  };
}
export type Einvoice = ReturnType<typeof buildEinvoice>;

/** Mirrors the IRP's own checks so problems are fixed before calling the government API. */
export function validateEinvoice(e: Einvoice): string[] {
  const err: string[] = [];
  const s = e.SellerDtls;
  const b = e.BuyerDtls;
  const len = (v: string | undefined, min: number, max: number) => !!v && v.length >= min && v.length <= max;
  if (!isValidGstin(s.Gstin)) err.push("Your GSTIN is missing or invalid (Settings → Business profile).");
  if (!isValidGstin(b.Gstin)) err.push("The customer's GSTIN is missing or invalid.");
  if (isValidGstin(s.Gstin) && s.Gstin.slice(0, 2) !== s.Stcd) err.push("Your GST state does not match the state code in your GSTIN.");
  if (isValidGstin(b.Gstin) && b.Gstin.slice(0, 2) !== b.Stcd) err.push("The customer's state does not match their GSTIN.");
  if (!len(s.LglNm, 3, 100)) err.push("Your legal name must be 3–100 characters.");
  if (!len(b.LglNm, 3, 100)) err.push("Customer name must be 3–100 characters.");
  if (!len(s.Addr1, 1, 100)) err.push("Your address line 1 is required.");
  if (!len(b.Addr1, 1, 100)) err.push("Customer address line 1 is required.");
  if (!len(s.Loc, 3, 50)) err.push("Your city must be 3–50 characters.");
  if (!len(b.Loc, 3, 100)) err.push("Customer city must be 3–100 characters.");
  if (!(s.Pin >= 100000 && s.Pin <= 999999)) err.push("Your PIN code must be 6 digits.");
  if (!(b.Pin >= 100000 && b.Pin <= 999999)) err.push("Customer PIN code must be 6 digits.");
  if (!/^\d{1,2}$/.test(s.Stcd) || !/^\d{1,2}$/.test(b.Stcd)) err.push("State codes are required.");
  if (!/^[a-zA-Z1-9][a-zA-Z0-9/-]{0,15}$/.test(e.DocDtls.No)) err.push(`Invoice number "${e.DocDtls.No}" must be at most 16 characters (letters, digits, / and -) and not start with 0, / or -.`);
  if (!/^\d{2}\/\d{2}\/\d{4}$/.test(e.DocDtls.Dt)) err.push("Invoice date is invalid.");
  if (!e.ItemList.length || e.ItemList.length > 1000) err.push("An e-invoice needs 1 to 1000 items.");
  e.ItemList.forEach((it) => {
    if (!/^(\d{4}|\d{6}|\d{8})$/.test(it.HsnCd)) err.push(`Item ${it.SlNo} (${it.PrdDesc}): HSN/SAC code must be 4, 6 or 8 digits.`);
    if (Math.abs(r2(it.AssAmt + it.CgstAmt + it.SgstAmt + it.IgstAmt + it.CesAmt) - it.TotItemVal) > 1) err.push(`Item ${it.SlNo}: tax amounts do not add up.`);
  });
  const lines = r2(e.ItemList.reduce((a, it) => a + it.TotItemVal, 0));
  if (Math.abs(r2(lines + e.ValDtls.RndOffAmt) - e.ValDtls.TotInvVal) > 1) err.push("Invoice total does not match the sum of items.");
  if (Math.abs(e.ValDtls.RndOffAmt) > 99.99) err.push("Round-off must be between -99.99 and 99.99.");
  return err;
}

export interface EwbDetails {
  transMode: "1" | "2" | "3" | "4"; // road, rail, air, ship
  distance: number; // km, 0 = auto-calculate by PIN
  transId?: string; // transporter GSTIN / TRANSIN
  transName?: string;
  vehNo?: string;
  vehType?: "R" | "O"; // regular / over-dimensional
  transDocNo?: string;
  transDocDt?: string; // dd/mm/yyyy
}

/** Payload for "generate e-way bill by IRN" on the IRP. */
export function ewbByIrnPayload(irn: string, d: EwbDetails) {
  return {
    Irn: irn, Distance: d.distance, TransMode: d.transMode,
    ...(d.transId ? { TransId: d.transId } : {}), ...(d.transName ? { TransName: d.transName } : {}),
    ...(d.transDocNo ? { TransDocNo: d.transDocNo, TransDocDt: d.transDocDt } : {}),
    ...(d.vehNo ? { VehNo: d.vehNo.replace(/\s/g, "").toUpperCase(), VehType: d.vehType ?? "R" } : {}),
  };
}

/** E-way bill portal "bulk generation" JSON for one invoice (manual upload fallback). */
export function ewbBulkJson(e: Einvoice, d: EwbDetails) {
  const s = e.SellerDtls;
  const b = e.BuyerDtls;
  return {
    version: "1.0.0621",
    billLists: [{
      userGstin: s.Gstin, supplyType: "O", subSupplyType: 1, subSupplyDesc: "", docType: e.DocDtls.Typ === "CRN" ? "CHL" : "INV", docNo: e.DocDtls.No, docDate: e.DocDtls.Dt,
      transType: 1, fromGstin: s.Gstin, fromTrdName: s.LglNm, fromAddr1: s.Addr1, fromAddr2: s.Addr2 ?? "", fromPlace: s.Loc, fromPincode: s.Pin, fromStateCode: Number(s.Stcd), actualFromStateCode: Number(s.Stcd),
      toGstin: b.Gstin, toTrdName: b.LglNm, toAddr1: b.Addr1, toAddr2: b.Addr2 ?? "", toPlace: b.Loc, toPincode: b.Pin, toStateCode: Number(b.Pos), actualToStateCode: Number(b.Stcd),
      totalValue: e.ValDtls.AssVal, cgstValue: e.ValDtls.CgstVal, sgstValue: e.ValDtls.SgstVal, igstValue: e.ValDtls.IgstVal, cessValue: e.ValDtls.CesVal, cessNonAdvolValue: 0,
      OthValue: e.ValDtls.RndOffAmt, totInvValue: e.ValDtls.TotInvVal, transMode: Number(d.transMode), transDistance: d.distance, transporterName: d.transName ?? "", transporterId: d.transId ?? "",
      transDocNo: d.transDocNo ?? "", transDocDate: d.transDocDt ?? "", vehicleNo: d.vehNo?.replace(/\s/g, "").toUpperCase() ?? "", vehicleType: d.vehType ?? "R",
      itemList: e.ItemList.map((it, i) => ({
        itemNo: i + 1, productName: it.PrdDesc, productDesc: it.PrdDesc, hsnCode: Number(it.HsnCd), quantity: it.Qty, qtyUnit: it.Unit, taxableAmount: it.AssAmt,
        cgstRate: it.CgstAmt ? it.GstRt / 2 : 0, sgstRate: it.SgstAmt ? it.GstRt / 2 : 0, igstRate: it.IgstAmt ? it.GstRt : 0, cessRate: it.CesRt, cessNonAdvol: 0,
      })),
    }],
  };
}
