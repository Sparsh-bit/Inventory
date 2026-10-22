import Link from "next/link";
import { Barcode, Printer, ShieldCheck, Smartphone } from "lucide-react";
import { Logo } from "@/components/app/logo";

const POINTS = [
  { icon: Barcode, title: "Scan anything", text: "USB and Bluetooth scanners, or just your phone camera." },
  { icon: Printer, title: "Print receipts", text: "58/80mm thermal printers, A4 GST invoices and barcode labels." },
  { icon: Smartphone, title: "Works everywhere", text: "Desktop, tablet or phone. Install it like an app." },
  { icon: ShieldCheck, title: "Secure by default", text: "Two-factor login, roles and a full audit trail." },
];

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid min-h-dvh lg:grid-cols-[1fr_minmax(0,560px)]">
      <aside className="relative hidden overflow-hidden bg-primary text-primary-foreground lg:flex lg:flex-col lg:justify-between lg:p-12">
        <div aria-hidden className="pointer-events-none absolute inset-0 opacity-[0.12] [background-image:radial-gradient(circle_at_1px_1px,currentColor_1px,transparent_0)] [background-size:22px_22px]" />
        <Link href="/" className="relative">
          <Logo className="text-lg [&_rect]:fill-primary-foreground [&_path]:stroke-primary" />
        </Link>
        <div className="relative max-w-md space-y-8">
          <h2 className="text-3xl font-semibold leading-tight tracking-tight">Inventory and billing that keeps up with your counter.</h2>
          <ul className="space-y-5">
            {POINTS.map(({ icon: Icon, title, text }) => (
              <li key={title} className="flex gap-3">
                <span className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-lg bg-primary-foreground/15">
                  <Icon className="size-4" />
                </span>
                <span>
                  <span className="block font-medium">{title}</span>
                  <span className="text-sm text-primary-foreground/75">{text}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>
        <p className="relative text-sm text-primary-foreground/60">© {new Date().getFullYear()} StockPilot</p>
      </aside>
      <main className="flex flex-col justify-center px-4 py-10 sm:px-10">
        <div className="mx-auto w-full max-w-sm">
          <Link href="/" className="mb-10 inline-block lg:hidden">
            <Logo />
          </Link>
          {children}
        </div>
      </main>
    </div>
  );
}
