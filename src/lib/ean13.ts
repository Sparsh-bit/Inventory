export function ean13CheckDigit(d12: string): number {
  let s = 0;
  for (let i = 0; i < 12; i++) s += Number(d12[i]) * (i % 2 ? 3 : 1);
  return (10 - (s % 10)) % 10;
}

export function isValidEan13(code: string): boolean {
  return /^\d{13}$/.test(code) && ean13CheckDigit(code.slice(0, 12)) === Number(code[12]);
}

/** In-store EAN-13 ("2" prefix is reserved for internal use by GS1). */
export function makeInternalEan13(seq: number): string {
  const d12 = "2" + String(seq).padStart(11, "0");
  if (d12.length !== 12) throw new Error("Barcode sequence exhausted");
  return d12 + ean13CheckDigit(d12);
}
