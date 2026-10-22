import Link from "next/link";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { BarChart3, Barcode, Boxes, Printer, ShieldCheck, Smartphone, Store, Users } from "lucide-react";
import { auth } from "@/server/auth";
import { Logo } from "@/components/app/logo";
import { Button } from "@/components/ui/button";

const FEATURES = [
  { icon: Barcode, title: "Scan with anything", text: "USB & Bluetooth barcode guns, or your phone's camera. Pair a phone as a wireless scanner for any PC." },
  { icon: Printer, title: "Print instantly", text: "58mm/80mm thermal receipts with cash-drawer kick, A4 GST invoices and barcode label sheets." },
  { icon: Store, title: "Fast checkout", text: "Hold & recall bills, split payments, discounts, returns and credit sales with keyboard shortcuts." },
  { icon: Boxes, title: "Multi-location stock", text: "Variants, batches & expiry, transfers, stock counts and a complete movement history." },
  { icon: BarChart3, title: "Reports that matter", text: "Sales, profit, GST (HSN-wise), stock valuation, expiry and dues. Export to Excel." },
  { icon: Users, title: "Your whole team", text: "Owner, manager, cashier and stock-keeper roles with an audit trail of every change." },
  { icon: Smartphone, title: "Any device", text: "Runs in the browser on desktop, tablet and phone. Install it like an app." },
  { icon: ShieldCheck, title: "Secure", text: "Two-factor login, encrypted sessions, rate limiting and strict data isolation." },
];

export default async function HomePage() {
  if (await auth.api.getSession({ headers: await headers() })) redirect("/dashboard");
  return (
    <div className="min-h-dvh">
      <header className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4">
        <Logo />
        <nav className="flex items-center gap-2">
          <Button asChild variant="ghost">
            <Link href="/sign-in">Sign in</Link>
          </Button>
          <Button asChild>
            <Link href="/sign-up">Get started</Link>
          </Button>
        </nav>
      </header>
      <main>
        <section className="mx-auto max-w-4xl px-4 pb-16 pt-14 text-center sm:pt-24">
          <p className="mx-auto mb-5 inline-flex items-center gap-2 rounded-full border bg-muted/50 px-3 py-1 text-xs text-muted-foreground">
            For shops, pharmacies, wholesalers, restaurants & warehouses
          </p>
          <h1 className="text-balance text-4xl font-semibold tracking-tight sm:text-6xl">Inventory and billing for every kind of business</h1>
          <p className="mx-auto mt-5 max-w-2xl text-balance text-lg text-muted-foreground">
            Scan, sell, print and restock from one place. Use your barcode scanner and receipt printer — or just your phone.
          </p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <Button asChild size="lg" className="h-11 px-6">
              <Link href="/sign-up">Create your free account</Link>
            </Button>
            <Button asChild size="lg" variant="outline" className="h-11 px-6">
              <Link href="/sign-in">Sign in</Link>
            </Button>
          </div>
        </section>
        <section className="mx-auto grid max-w-6xl gap-4 px-4 pb-24 sm:grid-cols-2 lg:grid-cols-4">
          {FEATURES.map(({ icon: Icon, title, text }) => (
            <div key={title} className="rounded-xl border bg-card p-5">
              <span className="mb-3 grid size-9 place-items-center rounded-lg bg-primary/10 text-primary">
                <Icon className="size-4" />
              </span>
              <h3 className="font-medium">{title}</h3>
              <p className="mt-1 text-sm text-muted-foreground">{text}</p>
            </div>
          ))}
        </section>
      </main>
      <footer className="border-t py-6 text-center text-sm text-muted-foreground">© {new Date().getFullYear()} StockPilot</footer>
    </div>
  );
}
