import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, BarChart3, Barcode, Boxes, Check, ChevronRight, CircleDollarSign, ClipboardList, PackageCheck, Printer, ShieldCheck, Smartphone, Sparkles, Store, Users } from "lucide-react";
import { auth } from "@/server/auth";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { Logo } from "@/components/app/logo";
import { Button } from "@/components/ui/button";
import { LandingMotion } from "@/components/landing/landing-motion";
import { GlowingCard, GlowingCards } from "@/components/lightswind/glowing-cards";

export const metadata: Metadata = {
  title: "StockPilot — Make every day in business run smoother",
  description: "A calm, capable workspace for inventory, billing and point of sale. Made for the people who keep business moving.",
};

const FEATURES = [
  { icon: Barcode, title: "Checkout at your pace", text: "Scan, add, discount, split and settle bills without losing your place." },
  { icon: Boxes, title: "Stock you can trust", text: "Track variants, batches, expiry dates, transfers and every stock movement." },
  { icon: BarChart3, title: "A clearer picture", text: "See what is selling, what needs a reorder and what is still owed." },
  { icon: Printer, title: "Ready for the counter", text: "Print GST invoices, thermal receipts and barcode labels from your setup." },
  { icon: Users, title: "Work better together", text: "Give every teammate the right access and keep a record of key changes." },
  { icon: ShieldCheck, title: "Your business, protected", text: "Secure sign-in, role-based access and private business data by default." },
];

export default async function HomePage() {
  if (await auth.api.getSession({ headers: await headers() })) redirect("/dashboard");

  return (
    <div className="landing-page min-h-dvh overflow-hidden bg-background text-foreground">
      <div className="border-b border-primary/10 bg-primary/[0.045] px-4 py-2 text-center text-xs font-medium text-primary sm:text-sm">
        <span className="inline-flex items-center gap-2"><Sparkles className="size-3.5" /> The business workspace built for everyday momentum <ChevronRight className="size-3.5" /></span>
      </div>
      <header className="sticky top-0 z-40 border-b border-border/70 bg-background/85 backdrop-blur-xl">
        <div className="mx-auto flex h-[4.5rem] max-w-7xl items-center justify-between px-4 sm:px-6">
          <Link href="/" aria-label="StockPilot home" className="rounded-lg"><Logo /></Link>
          <nav aria-label="Main navigation" className="hidden items-center gap-8 text-sm text-muted-foreground md:flex">
            <a href="#features" className="transition-colors hover:text-foreground">What you can do</a>
            <a href="#workflow" className="transition-colors hover:text-foreground">Made for the day-to-day</a>
          </nav>
          <div className="flex items-center gap-2">
            <Button asChild variant="ghost" size="sm"><Link href="/sign-in">Sign in</Link></Button>
            <Button asChild size="sm" className="rounded-full px-4"><Link href="/sign-up">Get started <ArrowRight className="ml-1 size-4" /></Link></Button>
          </div>
        </div>
      </header>

      <main>
        <section className="landing-hero relative isolate">
          <div className="hero-orb hero-orb-one" aria-hidden="true" />
          <div className="hero-orb hero-orb-two" aria-hidden="true" />
          <div className="mx-auto grid max-w-7xl items-center gap-14 px-4 pb-20 pt-16 sm:px-6 sm:pb-28 sm:pt-24 lg:grid-cols-[1fr_0.94fr] lg:gap-12 lg:pt-28">
            <div className="landing-copy relative z-10 max-w-2xl">
              <p className="mb-6 inline-flex items-center gap-2 rounded-full border border-primary/15 bg-white/75 px-3.5 py-1.5 text-xs font-semibold text-primary shadow-sm shadow-primary/5">
                <span className="size-1.5 rounded-full bg-emerald-500" /> Inventory and billing, in sync
              </p>
              <h1 className="max-w-[13ch] text-balance text-[2.8rem] font-semibold leading-[1.04] tracking-[-0.055em] sm:text-6xl lg:text-[4.45rem]">
                Run your business with <span className="text-primary">room to grow.</span>
              </h1>
              <p className="mt-6 max-w-xl text-pretty text-base leading-7 text-muted-foreground sm:text-lg sm:leading-8">
                From the first scan of the day to the last stock check, keep your counter, inventory and team moving together.
              </p>
              <div className="mt-8 flex flex-wrap items-center gap-3">
                <Button asChild size="lg" className="h-12 rounded-full px-6 text-sm shadow-lg shadow-primary/20"><Link href="/sign-up">Create your workspace <ArrowRight className="ml-1 size-4" /></Link></Button>
                <Button asChild size="lg" variant="outline" className="h-12 rounded-full border-border/80 bg-white/70 px-6"><Link href="/sign-in">Sign in</Link></Button>
              </div>
              <div className="mt-8 flex flex-wrap gap-x-5 gap-y-2 text-xs font-medium text-muted-foreground">
                {["Works with your scanner", "Print-ready", "On desktop or phone"].map((label) => <span key={label} className="inline-flex items-center gap-1.5"><Check className="size-3.5 text-emerald-600" />{label}</span>)}
              </div>
            </div>

            <div className="landing-preview relative mx-auto w-full max-w-[610px] lg:mr-0">
              <div className="preview-halo" aria-hidden="true" />
              <div className="preview-window relative z-10 overflow-hidden rounded-[1.5rem] border border-white/90 bg-white/90 p-2.5 shadow-[0_30px_100px_-35px_rgba(40,54,110,0.28)] backdrop-blur-xl sm:rounded-[1.8rem] sm:p-3">
                <div className="overflow-hidden rounded-[1.1rem] border border-slate-200/80 bg-[#f8f9fc] sm:rounded-[1.4rem]">
                  <div className="flex h-12 items-center justify-between border-b border-slate-200/70 bg-white px-4 sm:px-5">
                    <div className="flex items-center gap-2"><span className="size-2 rounded-full bg-[#88c6a9]" /><span className="size-2 rounded-full bg-[#f1c879]" /><span className="size-2 rounded-full bg-[#e99e9e]" /></div>
                    <span className="rounded-md bg-slate-50 px-3 py-1 text-[10px] font-medium text-slate-400">stockpilot.app / overview</span>
                    <span className="grid size-7 place-items-center rounded-full bg-[#edf1ff] text-[10px] font-bold text-primary">SP</span>
                  </div>
                  <div className="grid min-h-[340px] grid-cols-[48px_1fr] sm:min-h-[385px] sm:grid-cols-[62px_1fr]">
                    <div className="flex flex-col items-center gap-5 border-r border-slate-200/60 bg-white py-5 text-slate-300">
                      <span className="grid size-7 place-items-center rounded-lg bg-primary text-white"><Store className="size-3.5" /></span>
                      {[BarChart3, Boxes, ClipboardList, Users].map((Icon, index) => <Icon key={index} className="size-4" />)}
                    </div>
                    <div className="p-4 sm:p-6">
                      <div className="flex items-start justify-between gap-3">
                        <div><p className="text-[10px] font-medium text-slate-400 sm:text-xs">Live business overview</p><h2 className="mt-1 text-base font-semibold tracking-tight text-slate-800 sm:text-xl">Good morning, Anaya</h2></div>
                        <span className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[9px] font-medium text-slate-500 sm:text-[10px]">All locations</span>
                      </div>
                      <div className="mt-5 grid grid-cols-2 gap-2.5 sm:mt-6 sm:grid-cols-3 sm:gap-3">
                        {[{label:"Today’s sales",value:"₹24,850",change:"↑ 12.8%"},{label:"Bills today",value:"38",change:"Avg. ₹654"},{label:"To collect",value:"₹8,200",change:"4 customers"}].map((item, i) => <div key={item.label} className={`rounded-xl border border-slate-200/70 bg-white p-3 sm:p-3.5 ${i===2?"hidden sm:block":""}`}><p className="text-[9px] font-medium text-slate-400 sm:text-[10px]">{item.label}</p><p className="mt-1 text-sm font-semibold tracking-tight text-slate-800 sm:text-lg">{item.value}</p><p className={`mt-1 text-[9px] ${i===2?"text-amber-600":"text-emerald-600"}`}>{item.change}</p></div>)}
                      </div>
                      <div className="mt-3 grid gap-3 sm:mt-4 sm:grid-cols-[1.5fr_1fr]">
                        <div className="rounded-xl border border-slate-200/70 bg-white p-3 sm:p-4"><div className="flex items-center justify-between"><div><p className="text-[10px] font-semibold text-slate-700 sm:text-xs">Sales this week</p><p className="mt-1 text-[9px] text-slate-400">A steady week so far</p></div><span className="text-[9px] font-medium text-primary">This week</span></div><div className="mt-3 flex h-[92px] items-end gap-2 border-b border-slate-100 px-1 sm:h-[112px]">{[34,55,43,72,60,86,68,95,76,100,84,91,73,100,80].map((height, index) => <span key={index} style={{height:`${height}%`}} className={`flex-1 rounded-t-[3px] ${index===13?"bg-primary":"bg-primary/15"}`} />)}</div><div className="mt-2 flex justify-between text-[8px] text-slate-400"><span>Mon</span><span>Wed</span><span>Fri</span><span>Sun</span></div></div>
                        <div className="rounded-xl border border-slate-200/70 bg-white p-3 sm:p-4"><div className="flex items-center justify-between"><p className="text-[10px] font-semibold text-slate-700 sm:text-xs">Stock to watch</p><span className="size-1.5 rounded-full bg-amber-400" /></div><div className="mt-3 space-y-3">{[{name:"Arabica coffee",count:"4 left",width:"22%"},{name:"Oat milk · 1L",count:"6 left",width:"36%"},{name:"Paper cups · M",count:"8 left",width:"48%"}].map((item)=><div key={item.name}><div className="flex justify-between gap-1 text-[8px] sm:text-[9px]"><span className="truncate text-slate-600">{item.name}</span><span className="shrink-0 text-amber-600">{item.count}</span></div><div className="mt-1 h-1 rounded-full bg-slate-100"><div style={{width:item.width}} className="h-full rounded-full bg-amber-400" /></div></div>)}</div><div className="mt-4 flex items-center gap-1 text-[9px] font-medium text-primary">Review stock <ArrowRight className="size-3" /></div></div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
              <div className="floating-note absolute -bottom-5 left-2 z-20 flex items-center gap-2.5 rounded-2xl border border-white bg-white/95 p-3 shadow-xl shadow-slate-900/10 sm:-left-6 sm:bottom-8 sm:p-3.5"><span className="grid size-9 place-items-center rounded-xl bg-emerald-50 text-emerald-700"><PackageCheck className="size-4" /></span><span><strong className="block text-xs text-slate-800">Stock is in sync</strong><span className="text-[10px] text-slate-500">Across all locations</span></span></div>
              <div className="floating-note-two absolute -right-2 -top-5 z-20 hidden items-center gap-2 rounded-2xl border border-white bg-white/95 p-3 shadow-xl shadow-slate-900/10 sm:flex"><span className="grid size-8 place-items-center rounded-xl bg-[#eef1ff] text-primary"><CircleDollarSign className="size-4" /></span><span><strong className="block text-xs text-slate-800">Sale complete</strong><span className="text-[10px] text-slate-500">Receipt is ready to print</span></span></div>
            </div>
          </div>
        </section>

        <section id="features" className="mx-auto max-w-7xl scroll-mt-24 px-4 py-20 sm:px-6 sm:py-28">
          <div className="mx-auto max-w-2xl text-center"><p className="text-xs font-semibold uppercase tracking-[0.16em] text-primary">One connected workspace</p><h2 className="mt-4 text-balance text-3xl font-semibold tracking-[-0.04em] sm:text-4xl">Less juggling. More good business days.</h2><p className="mt-4 text-sm leading-6 text-muted-foreground sm:text-base">The tools at your counter and the tools behind it, finally working from the same picture.</p></div>
          <GlowingCards className="mt-12 lg:mt-16" gap="1rem" padding="0" responsive>
            {FEATURES.map(({ icon: Icon, title, text }, index) => <GlowingCard key={title} className={`feature-card group basis-full p-6 sm:basis-[calc(50%-0.5rem)] sm:p-7 lg:basis-[calc(33.333%-0.75rem)] ${index===0?"feature-card-accent":""}`}><div className="feature-glow" aria-hidden="true"/><span className="relative mb-7 grid size-11 place-items-center rounded-xl border border-primary/10 bg-primary/[0.07] text-primary transition-colors group-hover:bg-primary group-hover:text-white"><Icon className="size-5" /></span><h3 className="relative text-base font-semibold tracking-tight">{title}</h3><p className="relative mt-2 max-w-[34ch] text-sm leading-6 text-muted-foreground">{text}</p></GlowingCard>)}
          </GlowingCards>
        </section>

        <section id="workflow" className="mx-auto max-w-7xl scroll-mt-24 px-4 pb-20 sm:px-6 sm:pb-28">
          <div className="workflow-panel relative overflow-hidden rounded-[1.7rem] border border-primary/10 px-6 py-10 sm:rounded-[2rem] sm:px-12 sm:py-14 lg:px-16">
            <div className="relative z-10 grid items-center gap-10 lg:grid-cols-[1fr_auto]">
              <div className="max-w-2xl"><p className="text-xs font-semibold uppercase tracking-[0.16em] text-primary">Built around your workflow</p><h2 className="mt-4 text-balance text-3xl font-semibold leading-tight tracking-[-0.04em] sm:text-4xl">Your counter moves fast. Your software should keep up.</h2><p className="mt-4 max-w-xl text-sm leading-6 text-muted-foreground sm:text-base">Plug in a barcode scanner and receipt printer, invite your team, and use StockPilot wherever the work takes you.</p></div>
              <Button asChild size="lg" className="h-12 rounded-full px-6"><Link href="/sign-up">Get your workspace <ArrowRight className="ml-1 size-4" /></Link></Button>
            </div>
            <div className="relative z-10 mt-9 flex flex-wrap gap-x-7 gap-y-3 border-t border-primary/10 pt-6 text-xs font-medium text-muted-foreground"><span className="inline-flex items-center gap-2"><Barcode className="size-4 text-primary" /> Scanner friendly</span><span className="inline-flex items-center gap-2"><Printer className="size-4 text-primary" /> Printer ready</span><span className="inline-flex items-center gap-2"><Smartphone className="size-4 text-primary" /> Works on your phone</span></div>
            <div className="workflow-blob" aria-hidden="true" />
          </div>
        </section>
      </main>
      <footer className="border-t border-border/70"><div className="mx-auto flex max-w-7xl flex-col gap-3 px-4 py-7 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between sm:px-6"><Logo /><span>© {new Date().getFullYear()} StockPilot. Made for the people who keep business moving.</span></div></footer>
      <LandingMotion />
    </div>
  );
}
