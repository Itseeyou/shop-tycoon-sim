import { Button } from "@/components/ui/button";
import { motion } from "framer-motion";
import { useNavigate } from "react-router";

const EASE = [0.22, 1, 0.36, 1] as const;

function Reveal({
  children,
  delay = 0,
}: {
  children: React.ReactNode;
  delay?: number;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 14 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-80px" }}
      transition={{ duration: 0.6, delay, ease: EASE }}
    >
      {children}
    </motion.div>
  );
}

function Micro({ children }: { children: React.ReactNode }) {
  return (
    <span className="text-[10px] font-medium uppercase tracking-[0.24em] text-muted-foreground">
      {children}
    </span>
  );
}

/** Abstract shelving unit used as the hero visual — pure geometry, no assets. */
function ShelfGlyph() {
  const rows: { tints: string[] }[] = [
    { tints: ["bg-foreground/75", "bg-foreground/25", "bg-foreground", "bg-foreground/40"] },
    { tints: ["bg-foreground/30", "bg-foreground/70", "bg-foreground/20", "bg-foreground/55"] },
    { tints: ["bg-foreground", "bg-foreground/35", "bg-foreground/60", "bg-foreground/20"] },
  ];

  return (
    <div className="relative w-full max-w-md">
      <div className="rounded-xl border border-border/70 bg-card p-5">
        <div className="flex items-center justify-between">
          <Micro>Aisles 1–3</Micro>
          <div className="flex items-center gap-1.5">
            <span className="size-1.5 rounded-full bg-foreground" />
            <span className="size-1.5 rounded-full bg-foreground/30" />
            <span className="size-1.5 rounded-full bg-foreground/30" />
          </div>
        </div>

        <div className="mt-5 flex flex-col gap-4">
          {rows.map((row, rowIndex) => (
            <div key={rowIndex} className="flex flex-col gap-1.5">
              <div className="flex items-end gap-1.5">
                {row.tints.map((tint, i) => (
                  <motion.span
                    key={i}
                    initial={{ scaleY: 0.35, opacity: 0 }}
                    whileInView={{ scaleY: 1, opacity: 1 }}
                    viewport={{ once: true }}
                    transition={{
                      duration: 0.5,
                      delay: 0.1 + rowIndex * 0.12 + i * 0.05,
                      ease: EASE,
                    }}
                    style={{ transformOrigin: "bottom" }}
                    className={`h-9 flex-1 rounded-[3px] ${tint}`}
                  />
                ))}
              </div>
              <div className="h-px w-full bg-border" />
            </div>
          ))}
        </div>

        <div className="mt-5 flex items-center justify-between border-t border-border pt-4">
          <Micro>Stocked 92%</Micro>
          <Micro>12 shoppers</Micro>
        </div>
      </div>

      <motion.div
        initial={{ opacity: 0, y: 10 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        transition={{ duration: 0.6, delay: 0.5, ease: EASE }}
        className="absolute -bottom-5 -left-5 hidden rounded-lg border border-border/70 bg-background px-4 py-3 sm:block"
      >
        <Micro>Takings</Micro>
        <p className="mt-1 tabular-nums text-lg font-semibold tracking-tight">£1,284.60</p>
      </motion.div>
    </div>
  );
}

const LOOP = [
  {
    step: "01",
    title: "Order",
    body: "Work the buying list and pick the cases that carry the best margin for your shelves.",
  },
  {
    step: "02",
    title: "Stock",
    body: "Carry cases from the storage room and load every level of every fixture by hand.",
  },
  {
    step: "03",
    title: "Open",
    body: "Flip the sign, watch the footfall arrive, and keep the shelves from running empty.",
  },
  {
    step: "04",
    title: "Serve",
    body: "Scan the queue at the till before patience runs out, then bank the day's takings.",
  },
];

const SYSTEMS = [
  {
    title: "Dynamic economy",
    body: "Price elasticity, wholesale shifts and daily rent that punishes guesswork.",
  },
  {
    title: "Believable shoppers",
    body: "Seven personalities with their own budgets, baskets, patience and haggling.",
  },
  {
    title: "Manual checkout",
    body: "A real queue with real waiting times. Abandoned baskets dent your reputation.",
  },
  {
    title: "Reputation",
    body: "Availability, pricing fairness and service speed decide who walks through the door.",
  },
  {
    title: "Random events",
    body: "Supplier discounts, demand spikes, quiet spells and till malfunctions.",
  },
  {
    title: "Persistent saves",
    body: "Close the tab mid-shift and walk back into the shop exactly where you left it.",
  },
];

const STATS = [
  { value: "15", label: "Products" },
  { value: "7", label: "Shopper types" },
  { value: "3", label: "Shelf levels" },
  { value: "1", label: "Storefront" },
];

export default function Landing() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Nav */}
      <header className="sticky top-0 z-30 border-b border-border/60 bg-background/85 backdrop-blur-md">
        <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between px-6">
          <div className="flex items-center gap-3">
            <span className="text-[11px] font-semibold uppercase tracking-[0.34em]">
              Meridian
            </span>
          </div>
          <nav className="hidden items-center gap-8 md:flex">
            <a href="#loop" className="text-[12px] text-muted-foreground transition-colors hover:text-foreground">
              The loop
            </a>
            <a href="#systems" className="text-[12px] text-muted-foreground transition-colors hover:text-foreground">
              Systems
            </a>
            <a href="#start" className="text-[12px] text-muted-foreground transition-colors hover:text-foreground">
              Play
            </a>
          </nav>
          <Button
            variant="outline"
            className="cursor-pointer"
            onClick={() => navigate("/auth?returnTo=%2Fdashboard")}
          >
            Sign in
          </Button>
        </div>
      </header>

      {/* Hero */}
      <section className="mx-auto w-full max-w-6xl px-6 pb-24 pt-20 sm:pt-28">
        <div className="grid items-center gap-16 lg:grid-cols-2">
          <motion.div
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, ease: EASE }}
          >
            <Micro>First person · single storefront</Micro>
            <h1 className="mt-6 text-5xl font-semibold leading-[1.02] tracking-[-0.03em] sm:text-6xl">
              Run a shop that
              <br />
              actually pays its way.
            </h1>
            <p className="mt-7 max-w-lg text-[15px] leading-7 text-muted-foreground">
              Meridian is a first-person shop simulator built around one honest loop: buy
              stock, fill the shelves, open the doors and serve every customer before they
              run out of patience. No busywork, no filler — just the numbers and the till.
            </p>
            <div className="mt-10 flex flex-wrap items-center gap-3">
              <Button
                size="lg"
                className="cursor-pointer px-6"
                onClick={() => navigate("/auth?returnTo=%2Fdashboard")}
              >
                Start your shop
              </Button>
              <Button
                size="lg"
                variant="outline"
                className="cursor-pointer px-6"
                onClick={() => navigate("/auth?returnTo=%2Fdashboard")}
              >
                Continue a shift
              </Button>
            </div>
            <p className="mt-6 text-[11px] text-muted-foreground">
              Free while in beta · saves to this browser
            </p>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, scale: 0.97 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.8, delay: 0.15, ease: EASE }}
            className="flex justify-center lg:justify-end"
          >
            <ShelfGlyph />
          </motion.div>
        </div>
      </section>

      {/* Stats strip */}
      <section className="border-y border-border/60">
        <div className="mx-auto grid w-full max-w-6xl grid-cols-2 divide-x divide-border/60 px-6 sm:grid-cols-4">
          {STATS.map((stat, index) => (
            <Reveal key={stat.label} delay={index * 0.06}>
              <div className="px-6 py-8">
                <p className="tabular-nums text-3xl font-semibold tracking-tight">
                  {stat.value}
                </p>
                <p className="mt-2 text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
                  {stat.label}
                </p>
              </div>
            </Reveal>
          ))}
        </div>
      </section>

      {/* The loop */}
      <section id="loop" className="mx-auto w-full max-w-6xl px-6 py-24">
        <Reveal>
          <Micro>The gameplay loop</Micro>
          <h2 className="mt-5 max-w-2xl text-3xl font-semibold tracking-[-0.02em] sm:text-4xl">
            Four steps, repeated until you are turning a profit.
          </h2>
        </Reveal>

        <div className="mt-16 grid gap-px overflow-hidden rounded-xl border border-border/70 bg-border/70 sm:grid-cols-2 lg:grid-cols-4">
          {LOOP.map((item, index) => (
            <Reveal key={item.step} delay={index * 0.08}>
              <div className="flex h-full flex-col bg-background p-7">
                <span className="tabular-nums text-[11px] tracking-[0.2em] text-muted-foreground">
                  {item.step}
                </span>
                <h3 className="mt-6 text-lg font-medium tracking-tight">{item.title}</h3>
                <p className="mt-3 text-[13px] leading-6 text-muted-foreground">{item.body}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </section>

      {/* Systems */}
      <section id="systems" className="border-t border-border/60">
        <div className="mx-auto w-full max-w-6xl px-6 py-24">
          <Reveal>
            <Micro>Under the surface</Micro>
            <h2 className="mt-5 max-w-2xl text-3xl font-semibold tracking-[-0.02em] sm:text-4xl">
              Simulated, not scripted.
            </h2>
            <p className="mt-5 max-w-xl text-[15px] leading-7 text-muted-foreground">
              Every shopper makes a decision. Every price changes the odds. The systems are
              small, connected and predictable — which is what makes them worth mastering.
            </p>
          </Reveal>

          <div className="mt-16 grid gap-x-16 gap-y-10 sm:grid-cols-2 lg:grid-cols-3">
            {SYSTEMS.map((item, index) => (
              <Reveal key={item.title} delay={index * 0.05}>
                <div className="border-t border-border pt-6">
                  <h3 className="text-[15px] font-medium tracking-tight">{item.title}</h3>
                  <p className="mt-3 text-[13px] leading-6 text-muted-foreground">
                    {item.body}
                  </p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section id="start" className="border-t border-border/60">
        <div className="mx-auto w-full max-w-6xl px-6 py-24">
          <Reveal>
            <div className="flex flex-col items-start justify-between gap-10 rounded-xl border border-border/70 p-10 sm:p-14 lg:flex-row lg:items-center">
              <div className="max-w-xl">
                <Micro>Open for business</Micro>
                <h2 className="mt-5 text-3xl font-semibold tracking-[-0.02em] sm:text-4xl">
                  The first shift is the hardest.
                </h2>
                <p className="mt-4 text-[15px] leading-7 text-muted-foreground">
                  You start with two shelves, a handful of cases and barely enough cash for
                  the week's rent. Make the right calls and the shop pays for itself.
                </p>
              </div>
              <Button
                size="lg"
                className="cursor-pointer px-8"
                onClick={() => navigate("/auth?returnTo=%2Fdashboard")}
              >
                Enter the shop
              </Button>
            </div>
          </Reveal>
        </div>
      </section>

      <footer className="border-t border-border/60">
        <div className="mx-auto flex w-full max-w-6xl flex-col items-start justify-between gap-3 px-6 py-8 sm:flex-row sm:items-center">
          <span className="text-[11px] uppercase tracking-[0.24em] text-muted-foreground">
            Meridian Market
          </span>
          <span className="text-[11px] text-muted-foreground">
            A first-person shop simulator · v1
          </span>
        </div>
      </footer>
    </div>
  );
}
