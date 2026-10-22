"use client";
// Per-device printer setup. Lives in localStorage because each counter PC/phone has its own printer.

export type Transport = "browser" | "serial" | "usb" | "bluetooth" | "bridge";

export interface PrinterProfile {
  transport: Transport;
  width: 58 | 80;
  baudRate: number;
  bridgeUrl: string;
  bridgeKey: string;
  autoPrint: boolean;
  openDrawer: boolean;
  invoiceFormat: "thermal" | "a4";
}

const KEY = "stockpilot.printer";
export const DEFAULT_PROFILE: PrinterProfile = { transport: "browser", width: 80, baudRate: 9600, bridgeUrl: "http://127.0.0.1:9123", bridgeKey: "", autoPrint: true, openDrawer: false, invoiceFormat: "thermal" };

export function loadProfile(): PrinterProfile {
  try {
    return { ...DEFAULT_PROFILE, ...(JSON.parse(localStorage.getItem(KEY) ?? "{}") as Partial<PrinterProfile>) };
  } catch {
    return DEFAULT_PROFILE;
  }
}

export function saveProfile(p: PrinterProfile) {
  try {
    localStorage.setItem(KEY, JSON.stringify(p));
  } catch {}
}

export const supports = () => ({
  serial: typeof navigator !== "undefined" && "serial" in navigator,
  usb: typeof navigator !== "undefined" && "usb" in navigator,
  bluetooth: typeof navigator !== "undefined" && "bluetooth" in navigator,
});

/* ----- minimal Web Serial / WebUSB / Web Bluetooth typings (not in lib.dom yet) ----- */
interface SerialPortLike { open(o: { baudRate: number }): Promise<void>; close(): Promise<void>; writable: WritableStream<Uint8Array> | null; readable: unknown }
interface USBEndpointLike { direction: "in" | "out"; type: string; endpointNumber: number }
interface USBDeviceLike {
  opened: boolean; configuration: { interfaces: { interfaceNumber: number; alternate: { endpoints: USBEndpointLike[] } }[] } | null;
  open(): Promise<void>; selectConfiguration(n: number): Promise<void>; claimInterface(n: number): Promise<void>; transferOut(ep: number, data: Uint8Array): Promise<unknown>;
}
interface BTCharLike { properties: { write: boolean; writeWithoutResponse: boolean }; writeValueWithoutResponse?(d: Uint8Array): Promise<void>; writeValue(d: Uint8Array): Promise<void> }
type Nav = Navigator & {
  serial?: { requestPort(): Promise<SerialPortLike>; getPorts(): Promise<SerialPortLike[]> };
  usb?: { requestDevice(o: { filters: object[] }): Promise<USBDeviceLike>; getDevices(): Promise<USBDeviceLike[]> };
  bluetooth?: { requestDevice(o: object): Promise<{ gatt?: { connect(): Promise<{ getPrimaryServices(): Promise<{ getCharacteristics(): Promise<BTCharLike[]> }[]> }> } }> };
};
const nav = () => navigator as Nav;

// Common BLE thermal printer services (generic "18F0", Xprinter/Goojprt and others).
const BLE_SERVICES = ["000018f0-0000-1000-8000-00805f9b34fb", "e7810a71-73ae-499d-8c15-faa9aef0c3f2", "49535343-fe7d-4ae5-8fa9-9fafd205e455", "0000ff00-0000-1000-8000-00805f9b34fb"];

let btChar: BTCharLike | null = null;

/** Ask the user to choose a device (must run from a click). */
export async function pairPrinter(t: Transport): Promise<string> {
  if (t === "serial") {
    await nav().serial!.requestPort();
    return "Printer port selected";
  }
  if (t === "usb") {
    await nav().usb!.requestDevice({ filters: [] });
    return "USB printer selected";
  }
  if (t === "bluetooth") {
    const dev = await nav().bluetooth!.requestDevice({ acceptAllDevices: true, optionalServices: BLE_SERVICES });
    btChar = await findBtCharacteristic(dev);
    return "Bluetooth printer connected";
  }
  return "Ready";
}

async function findBtCharacteristic(dev: Awaited<ReturnType<NonNullable<Nav["bluetooth"]>["requestDevice"]>>) {
  const server = await dev.gatt!.connect();
  for (const svc of await server.getPrimaryServices()) {
    for (const c of await svc.getCharacteristics()) if (c.properties.write || c.properties.writeWithoutResponse) return c;
  }
  throw new Error("This Bluetooth device has no printable channel");
}

/** Sends raw ESC/POS bytes. Throws with a human message on failure. */
export async function sendRaw(p: PrinterProfile, data: Uint8Array) {
  if (p.transport === "serial") {
    const port = (await nav().serial?.getPorts())?.[0];
    if (!port) throw new Error("No printer paired. Open Settings → Printer & scanner.");
    await port.open({ baudRate: p.baudRate }).catch((e: DOMException) => {
      if (e.name !== "InvalidStateError") throw e; // already open
    });
    const writer = port.writable!.getWriter();
    try {
      await writer.write(data);
    } finally {
      writer.releaseLock();
      await port.close().catch(() => undefined);
    }
    return;
  }
  if (p.transport === "usb") {
    const dev = (await nav().usb?.getDevices())?.[0];
    if (!dev) throw new Error("No USB printer paired. Open Settings → Printer & scanner.");
    if (!dev.opened) await dev.open();
    if (!dev.configuration) await dev.selectConfiguration(1);
    const iface = dev.configuration!.interfaces.find((i) => i.alternate.endpoints.some((e) => e.direction === "out" && e.type === "bulk"));
    if (!iface) throw new Error("This USB device doesn't look like a printer");
    await dev.claimInterface(iface.interfaceNumber).catch(() => undefined);
    const ep = iface.alternate.endpoints.find((e) => e.direction === "out" && e.type === "bulk")!;
    for (let i = 0; i < data.length; i += 4096) await dev.transferOut(ep.endpointNumber, data.slice(i, i + 4096));
    return;
  }
  if (p.transport === "bluetooth") {
    if (!btChar) throw new Error("Reconnect the Bluetooth printer in Settings → Printer & scanner (browsers forget it on reload).");
    for (let i = 0; i < data.length; i += 180) {
      const chunk = data.slice(i, i + 180);
      if (btChar.properties.writeWithoutResponse && btChar.writeValueWithoutResponse) await btChar.writeValueWithoutResponse(chunk);
      else await btChar.writeValue(chunk);
    }
    return;
  }
  if (p.transport === "bridge") {
    const res = await fetch(`${p.bridgeUrl.replace(/\/$/, "")}/print`, { method: "POST", headers: { "Content-Type": "application/octet-stream", "X-Bridge-Key": p.bridgeKey }, body: data as BodyInit });
    if (!res.ok) throw new Error(`Print bridge error: ${await res.text().catch(() => res.status)}`);
    return;
  }
  throw new Error("Browser printing doesn't send raw data");
}

/** Prints a page (receipt/invoice) through the browser's print dialog using a hidden iframe. */
export function browserPrint(url: string) {
  const old = document.getElementById("print-frame");
  old?.remove();
  const f = document.createElement("iframe");
  f.id = "print-frame";
  f.title = "Print";
  f.style.cssText = "position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden";
  f.src = url;
  document.body.appendChild(f);
}
