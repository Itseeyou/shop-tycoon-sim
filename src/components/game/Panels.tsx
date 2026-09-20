import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { CATEGORIES, PRODUCTS, getProduct } from "@/game/data/products";
import type { Game } from "@/game/Game";
import type { CategoryId, GameSnapshot } from "@/game/types";
import { cn, formatDelta, formatMoney } from "@/lib/utils";
import { X } from "lucide-react";

// ------------------------------------------------------------------- chrome

interface PanelShellProps {
  title: string;
  subtitle: string;
  onClose: () => void;
  children: React.ReactNode;
  footer?: React.ReactNode;
  width?: string;
}

function PanelShell({
  title,
  subtitle,
  onClose,
  children,
  footer,
  width = "max-w-4xl",
}: PanelShellProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6">
      <button
        type="button"
        aria-label="Close panel"
        onClick={onClose}
        className="absolute inset-0 cursor-pointer bg-foreground/20 backdrop-blur-sm"
      />
      <div
        className={cn(
          "relative flex max-h-[88vh] w-full flex-col overflow-hidden rounded-xl border border-border/70 bg-background",
          width,
        )}
      >
        <header className="flex items-start justify-between gap-6 border-b border-border/60 px-6 py-5">
          <div>
            <p className="text-[10px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
              {subtitle}
            </p>
            <h2 className="mt-1.5 text-xl font-semibold tracking-tight">{title}</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="-mr-1 cursor-pointer rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
          >
            <X className="size-4" />
          </button>
        </header>
        <div className="flex-1 overflow-y-auto px-6 py-6">{children}</div>
        {footer && (
          <footer className="border-t border-border/60 bg-muted/40 px-6 py-4">{footer}</footer>
        )}
      </div>
    </div>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[10px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
      {children}
    </p>
  );
}

function Row({
  label,
  value,
  muted = false,
}: {
  label: string;
  value: string;
  muted?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between gap-6 border-b border-border/50 py-2.5 last:border-b-0">
      <span className={cn("text-sm", muted && "text-muted-foreground")}>{label}</span>
      <span className="tabular-nums text-sm font-medium">{value}</span>
    </div>
  );
}

function MetricCard({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div className="rounded-lg border border-border/70 px-4 py-3">
      <SectionLabel>{label}</SectionLabel>
      <p className="mt-1.5 tabular-nums text-lg font-semibold tracking-tight">{value}</p>
      {note && <p className="mt-0.5 text-[11px] text-muted-foreground">{note}</p>}
    </div>
  );
}

function Stepper({
  value,
  onChange,
  min = 1,
  max = 20,
}: {
  value: number;
  onChange: (next: number) => void;
  min?: number;
  max?: number;
}) {
  return (
    <div className="flex items-center rounded-md border border-border/70">
      <button
        type="button"
        onClick={() => onChange(Math.max(min, value - 1))}
        className="cursor-pointer px-2 py-1 text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
      >
        −
      </button>
      <span className="w-8 text-center tabular-nums text-sm">{value}</span>
      <button
        type="button"
        onClick={() => onChange(Math.min(max, value + 1))}
        className="cursor-pointer px-2 py-1 text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
      >
        +
      </button>
    </div>
  );
}

/** Total units of a product currently sitting on shelves. */
export function shelfStockOf(game: Game, productId: string): number {
  let total = 0;
  for (const shelf of game.shelves) {
    for (const level of shelf.data.levels) {
      if (level.productId === productId) total += level.stock;
    }
  }
  return total;
}

// -------------------------------------------------------------------- order

export function OrderPanel({ game, onClose }: { game: Game; onClose: () => void }) {
  const [qty, setQty] = useState<Record<string, number>>({});
  const prices = game.economy.prices;
  const freeSlots = game.world.boxSlots.filter(
    (slot) =>
      !game.boxes.some(
        (box) => Math.hypot(box.position.x - slot.x, box.position.z - slot.z) < 0.4,
      ),
  ).length;

  const grouped = useMemo(() => {
    const map = new Map<CategoryId, typeof PRODUCTS>();
    for (const category of CATEGORIES) {
      map.set(
        category.id,
        PRODUCTS.filter((product) => product.category === category.id),
      );
    }
    return map;
  }, []);

  const order = (productId: string) => {
    const cases = qty[productId] ?? 1;
    const result = game.economy.orderCase(productId, cases);
    if (result.ok) {
      const product = getProduct(productId);
      game.notify(
        `Delivered ${cases} case${cases === 1 ? "" : "s"} of ${product?.name ?? "stock"} · −${formatMoney(result.cost)}`,
        "good",
      );
      game.audio.play("money", { volume: 0.6 });
      setQty((prev) => ({ ...prev, [productId]: 1 }));
    } else {
      game.notify(result.reason ?? "Order failed", "bad");
      game.audio.play("error");
    }
  };

  return (
    <PanelShell
      title="Order stock"
      subtitle="Supplier catalogue"
      onClose={onClose}
      footer={
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-xs text-muted-foreground">
            Cases are delivered to the storage area at the back of the shop.
          </p>
          <div className="flex items-center gap-6">
            <div className="text-right">
              <SectionLabel>Balance</SectionLabel>
              <p className="tabular-nums text-sm font-semibold">{formatMoney(game.money)}</p>
            </div>
            <div className="text-right">
              <SectionLabel>Storage free</SectionLabel>
              <p className="tabular-nums text-sm font-semibold">
                {freeSlots} / {game.world.boxSlots.length}
              </p>
            </div>
          </div>
        </div>
      }
    >
      <div className="flex flex-col gap-8">
        {CATEGORIES.map((category) => {
          const items = grouped.get(category.id) ?? [];
          if (items.length === 0) return null;
          return (
            <section key={category.id} className="flex flex-col gap-3">
              <div className="flex items-center gap-3">
                <SectionLabel>{category.name}</SectionLabel>
                <div className="h-px flex-1 bg-border/60" />
              </div>
              <div className="flex flex-col divide-y divide-border/50">
                {items.map((product) => {
                  const cost = game.economy.costOf(product.id) * product.caseSize;
                  const onShelf = shelfStockOf(game, product.id);
                  const retail = prices[product.id] ?? product.price;
                  const margin = (retail - product.cost) / Math.max(0.01, retail);
                  const cases = qty[product.id] ?? 1;
                  return (
                    <div
                      key={product.id}
                      className="grid grid-cols-1 items-center gap-3 py-3 sm:grid-cols-[1fr_auto_auto_auto_auto]"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">{product.name}</p>
                        <p className="text-[11px] text-muted-foreground">
                          {product.caseSize} per case · on shelf {onShelf} · margin{" "}
                          {(margin * 100).toFixed(0)}%
                        </p>
                      </div>
                      <div className="w-24 text-right">
                        <p className="tabular-nums text-sm">{formatMoney(cost)}</p>
                        <p className="text-[11px] text-muted-foreground">per case</p>
                      </div>
                      <div className="w-20 text-right">
                        <p className="tabular-nums text-sm">{formatMoney(retail)}</p>
                        <p className="text-[11px] text-muted-foreground">retail</p>
                      </div>
                      <Stepper
                        value={cases}
                        onChange={(next) => setQty((prev) => ({ ...prev, [product.id]: next }))}
                      />
                      <Button
                        size="sm"
                        variant="outline"
                        className="cursor-pointer"
                        disabled={game.money < cost * cases || freeSlots < cases}
                        onClick={() => order(product.id)}
                      >
                        Order
                      </Button>
                    </div>
                  );
                })}
              </div>
            </section>
          );
        })}
      </div>
    </PanelShell>
  );
}

// ------------------------------------------------------------------ pricing

export function PricingPanel({ game, onClose }: { game: Game; onClose: () => void }) {
  const [, force] = useState(0);
  const prices = game.economy.prices;
  const rerender = () => force((n) => n + 1);

  const applyAll = (factor: number) => {
    for (const product of PRODUCTS) {
      game.economy.setPrice(product.id, (prices[product.id] ?? product.price) * factor);
    }
    game.audio.play("ui");
    game.notify("Prices adjusted across the catalogue", "info");
  };

  return (
    <PanelShell
      title="Shelf pricing"
      subtitle="Price elasticity"
      onClose={onClose}
      footer={
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="max-w-md text-xs text-muted-foreground">
            Cheaper prices win more sales; expensive prices protect your margin but cost
            reputation and footfall. The fair-price guide keeps you balanced.
          </p>
          <div className="flex items-center gap-2">
            <Button size="sm" variant="outline" className="cursor-pointer" onClick={() => applyAll(0.9)}>
              −10% all
            </Button>
            <Button size="sm" variant="outline" className="cursor-pointer" onClick={() => applyAll(1.1)}>
              +10% all
            </Button>
          </div>
        </div>
      }
    >
      <div className="flex flex-col gap-8">
        {CATEGORIES.map((category) => {
          const items = PRODUCTS.filter((product) => product.category === category.id);
          return (
            <section key={category.id} className="flex flex-col gap-3">
              <div className="flex items-center gap-3">
                <SectionLabel>{category.name}</SectionLabel>
                <div className="h-px flex-1 bg-border/60" />
              </div>
              <div className="flex flex-col divide-y divide-border/50">
                {items.map((product) => {
                  const price = prices[product.id] ?? product.price;
                  const suggested = Math.round(product.cost * 2.1 * 100) / 100;
                  const margin = (price - product.cost) / Math.max(0.01, price);
                  const demandTag =
                    price <= suggested * 0.95
                      ? "Bargain"
                      : price >= suggested * 1.25
                        ? "Steep"
                        : "Fair";
                  return (
                    <div
                      key={product.id}
                      className="grid grid-cols-1 items-center gap-3 py-3 sm:grid-cols-[minmax(0,1fr)_auto_auto_auto]"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">{product.name}</p>
                        <p className="text-[11px] text-muted-foreground">
                          cost {formatMoney(product.cost)} · margin {(margin * 100).toFixed(0)}% ·{" "}
                          {demandTag}
                        </p>
                      </div>
                      <input
                        type="range"
                        min={Math.round(product.cost * 100) / 100}
                        max={Math.round(product.cost * 3 * 100) / 100}
                        step={0.05}
                        value={price}
                        onChange={(event) => {
                          game.economy.setPrice(product.id, Number(event.target.value));
                          rerender();
                        }}
                        className="h-1 w-40 cursor-pointer accent-foreground"
                        aria-label={`Price for ${product.name}`}
                      />
                      <div className="w-16 text-right tabular-nums text-sm">
                        {formatMoney(price)}
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          game.economy.setPrice(product.id, suggested);
                          game.audio.play("ui", { volume: 0.5 });
                          rerender();
                        }}
                        className="cursor-pointer text-[11px] text-muted-foreground underline underline-offset-4 transition-colors hover:text-foreground"
                      >
                        use {formatMoney(suggested)}
                      </button>
                    </div>
                  );
                })}
              </div>
            </section>
          );
        })}
      </div>
    </PanelShell>
  );
}

// -------------------------------------------------------------------- shelf

export function ShelfPanel({
  game,
  shelfId,
  onClose,
}: {
  game: Game;
  shelfId: number | null;
  onClose: () => void;
}) {
  const [, force] = useState(0);
  const shelf = game.shelves.find((item) => item.data.id === shelfId);
  const rerender = () => force((n) => n + 1);

  if (!shelf) {
    return (
      <PanelShell title="Shelf" subtitle="Fixture" onClose={onClose}>
        <p className="text-sm text-muted-foreground">This shelf is no longer in the shop.</p>
      </PanelShell>
    );
  }

  const total = shelf.totalStock;

  return (
    <PanelShell
      title="Shelf contents"
      subtitle={`Fixture · ${total} of ${shelf.capacity} slots filled`}
      onClose={onClose}
      width="max-w-2xl"
      footer={
        <p className="text-xs text-muted-foreground">
          Carry a case from storage and press E on this shelf to stock it.
        </p>
      }
    >
      <div className="flex flex-col divide-y divide-border/50">
        {shelf.data.levels.map((level, index) => {
          const product = level.productId ? getProduct(level.productId) : undefined;
          const price = product ? (game.economy.prices[product.id] ?? product.price) : 0;
          return (
            <div key={index} className="flex items-center justify-between gap-4 py-4">
              <div className="min-w-0">
                <p className="text-[11px] uppercase tracking-[0.16em] text-muted-foreground">
                  Level {index + 1}
                </p>
                <p className="truncate text-sm font-medium">
                  {product ? product.name : "Empty"}
                </p>
                <p className="text-[11px] text-muted-foreground">
                  {level.stock} units · {product ? formatMoney(price) : "—"}
                </p>
              </div>
              <Button
                size="sm"
                variant="outline"
                className="cursor-pointer"
                disabled={level.stock === 0 && !level.productId}
                onClick={() => {
                  level.stock = 0;
                  level.productId = null;
                  shelf.sync(game.economy.prices);
                  game.notify("Shelf level cleared", "info");
                  rerender();
                }}
              >
                Clear
              </Button>
            </div>
          );
        })}
      </div>
    </PanelShell>
  );
}

// ------------------------------------------------------------------- ledger

export function LedgerPanel({ game, onClose }: { game: Game; onClose: () => void }) {
  const { finances, stats, revenueToday, expensesToday, money, day, dayProgress } = game.economy;
  const net = revenueToday - expensesToday;
  const dailyBurn = 180 + 95;
  const runway = money / dailyBurn;

  return (
    <PanelShell
      title="Finances"
      subtitle="Ledger & overheads"
      onClose={onClose}
      width="max-w-3xl"
      footer={
        <p className="text-xs text-muted-foreground">
          Rent and utilities are charged automatically when the trading day ends.
        </p>
      }
    >
      <div className="flex flex-col gap-8">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <MetricCard label="Today revenue" value={formatMoney(revenueToday)} />
          <MetricCard label="Today costs" value={formatMoney(expensesToday)} />
          <MetricCard
            label="Net"
            value={formatDelta(net)}
            note={net >= 0 ? "profitable so far" : "running at a loss"}
          />
          <MetricCard
            label="Runway"
            value={`${Math.max(0, runway).toFixed(1)} days`}
            note="at full daily overhead"
          />
        </div>

        <div className="grid gap-8 sm:grid-cols-2">
          <section>
            <SectionLabel>Lifetime</SectionLabel>
            <div className="mt-3">
              <Row label="Total revenue" value={formatMoney(finances.revenue)} />
              <Row label="Total expenses" value={formatMoney(finances.expenses)} />
              <Row
                label="Net profit"
                value={formatDelta(finances.revenue - finances.expenses)}
              />
              <Row label="Items sold" value={String(stats.itemsSold)} />
              <Row label="Customers served" value={String(stats.customersServed)} />
            </div>
          </section>
          <section>
            <SectionLabel>Where the money goes</SectionLabel>
            <div className="mt-3">
              <Row label="Stock orders" value={formatMoney(finances.restock)} />
              <Row label="Rent" value={formatMoney(finances.rent)} />
              <Row label="Utilities" value={formatMoney(finances.utilities)} />
              <Row label="Shelving" value={formatMoney(finances.shelves)} />
            </div>
          </section>
        </div>

        <section>
          <SectionLabel>Trading day {day}</SectionLabel>
          <div className="mt-3">
            <div className="h-1 w-full overflow-hidden rounded-full bg-border/60">
              <div className="h-full bg-foreground" style={{ width: `${dayProgress * 100}%` }} />
            </div>
            <div className="mt-2 flex items-center justify-between">
              <span className="text-[11px] text-muted-foreground">
                {(dayProgress * 100).toFixed(0)}% of the working day elapsed
              </span>
              <span className="text-[11px] text-muted-foreground">
                {game.economy.clockLabel}
              </span>
            </div>
          </div>
        </section>
      </div>
    </PanelShell>
  );
}

// -------------------------------------------------------------------- stats

export function StatsPanel({
  game,
  snapshot,
  onClose,
}: {
  game: Game;
  snapshot: GameSnapshot;
  onClose: () => void;
}) {
  const { stats, servedToday, lostToday } = game.economy;
  const stocked = new Set<string>();
  for (const shelf of game.shelves) {
    for (const level of shelf.data.levels) {
      if (level.productId && level.stock > 0) stocked.add(level.productId);
    }
  }
  const coverage = stocked.size / PRODUCTS.length;

  return (
    <PanelShell
      title="Shop statistics"
      subtitle="Performance"
      onClose={onClose}
      width="max-w-3xl"
    >
      <div className="flex flex-col gap-8">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <MetricCard label="Reputation" value={snapshot.reputation.toFixed(0)} note={game.reputation.label} />
          <MetricCard label="Days trading" value={String(stats.daysPlayed)} />
          <MetricCard label="Served today" value={String(servedToday)} />
          <MetricCard
            label="Lost today"
            value={String(lostToday)}
            note="shoppers who left empty-handed"
          />
        </div>

        <section>
          <SectionLabel>Reputation breakdown</SectionLabel>
          <div className="mt-3">
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-border/60">
              <div
                className="h-full bg-foreground"
                style={{ width: `${snapshot.reputation}%` }}
              />
            </div>
            <div className="mt-3 flex flex-col">
              {(game.reputation.lastReasons.length > 0
                ? game.reputation.lastReasons
                : ["No full day traded yet — close a day to see the breakdown."]
              ).map((reason) => (
                <span
                  key={reason}
                  className="border-b border-border/50 py-2 text-sm last:border-b-0"
                >
                  {reason}
                </span>
              ))}
            </div>
          </div>
        </section>

        <div className="grid gap-8 sm:grid-cols-2">
          <section>
            <SectionLabel>Operations</SectionLabel>
            <div className="mt-3">
              <Row label="Catalogue coverage" value={`${(coverage * 100).toFixed(0)}%`} />
              <Row label="Shelves installed" value={String(snapshot.shelfCount)} />
              <Row label="Cases in storage" value={String(snapshot.boxCount)} />
              <Row label="Cases ordered" value={String(stats.casesOrdered)} />
            </div>
          </section>
          <section>
            <SectionLabel>Records</SectionLabel>
            <div className="mt-3">
              <Row label="Best day revenue" value={formatMoney(stats.bestDay)} />
              <Row label="Lifetime revenue" value={formatMoney(stats.totalRevenue)} />
              <Row label="Lifetime costs" value={formatMoney(stats.totalExpenses)} />
              <Row
                label="Shoppers lost"
                value={String(stats.customersLost)}
              />
            </div>
          </section>
        </div>

        {game.lastDayReport && (
          <section>
            <SectionLabel>Last day report</SectionLabel>
            <div className="mt-3">
              <Row label="Revenue" value={formatMoney(game.lastDayReport.revenue)} />
              <Row label="Costs" value={formatMoney(game.lastDayReport.expenses)} />
              <Row label="Items sold" value={String(game.lastDayReport.itemsSold)} />
              <Row label="Customers served" value={String(game.lastDayReport.served)} />
            </div>
          </section>
        )}
      </div>
    </PanelShell>
  );
}

// ----------------------------------------------------------------- settings

function ToggleRow({
  label,
  note,
  value,
  onChange,
}: {
  label: string;
  note: string;
  value: boolean;
  onChange: (next: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-6 border-b border-border/50 py-3.5 last:border-b-0">
      <div>
        <p className="text-sm font-medium">{label}</p>
        <p className="text-[11px] text-muted-foreground">{note}</p>
      </div>
      <button
        type="button"
        onClick={() => onChange(!value)}
        className={cn(
          "relative h-6 w-11 cursor-pointer rounded-full border transition-colors",
          value ? "border-foreground bg-foreground" : "border-border bg-muted",
        )}
        aria-pressed={value}
        aria-label={label}
      >
        <span
          className={cn(
            "absolute top-1 size-4 rounded-full bg-background transition-transform",
            value ? "translate-x-[26px]" : "translate-x-0.5",
          )}
        />
      </button>
    </div>
  );
}

export function SettingsPanel({ game, onClose }: { game: Game; onClose: () => void }) {
  return (
    <PanelShell
      title="Settings"
      subtitle="Preferences"
      onClose={onClose}
      width="max-w-xl"
      footer={
        <p className="text-xs text-muted-foreground">
          Settings are stored on this device and applied immediately.
        </p>
      }
    >
      <div className="flex flex-col gap-8">
        <section>
          <SectionLabel>Graphics quality</SectionLabel>
          <div className="mt-3 flex gap-2">
            {(["low", "medium", "high"] as const).map((tier) => (
              <button
                key={tier}
                type="button"
                onClick={() => game.setQuality(tier)}
                className={cn(
                  "flex-1 cursor-pointer rounded-md border px-4 py-2.5 text-sm capitalize transition-colors",
                  game.settings.quality === tier
                    ? "border-foreground bg-foreground text-background"
                    : "border-border/70 text-muted-foreground hover:text-foreground",
                )}
              >
                {tier}
              </button>
            ))}
          </div>
        </section>

        <section>
          <SectionLabel>Audio & effects</SectionLabel>
          <div className="mt-1">
            <ToggleRow
              label="Shadows"
              note="Dynamic shadow casting from the shop lighting"
              value={game.settings.shadows}
              onChange={(next) => game.setShadows(next)}
            />
            <ToggleRow
              label="Background music"
              note="Ambient procedural soundtrack"
              value={game.settings.music}
              onChange={(next) => game.setMusic(next)}
            />
            <ToggleRow
              label="Sound effects"
              note="Footsteps, tills, doors and pickups"
              value={game.settings.sfx}
              onChange={(next) => game.setSfx(next)}
            />
          </div>
        </section>

        <section>
          <SectionLabel>Performance</SectionLabel>
          <div className="mt-3">
            <Row label="Frame rate" value={`${game.getSnapshot().fps} fps`} muted />
            <Row label="Shoppers in store" value={String(game.customers.count)} muted />
          </div>
        </section>
      </div>
    </PanelShell>
  );
}

// --------------------------------------------------------------------- help

export function HelpPanel({ onClose }: { onClose: () => void }) {
  const controls: [string, string][] = [
    ["W A S D", "Walk around the shop"],
    ["Mouse", "Look around"],
    ["Shift", "Sprint"],
    ["Ctrl / C", "Crouch"],
    ["E", "Interact / pick up / stock / scan"],
    ["G", "Drop the case you are carrying"],
    ["B", "Build mode — place and remove shelves"],
    ["O / P / L / K", "Order stock · prices · ledger · stats"],
    ["Esc", "Pause menu"],
  ];
  const steps: [string, string][] = [
    ["1 · Order", "Use the stock terminal at the back (or press O) to buy cases."],
    ["2 · Stock", "Carry a case to a shelf and press E to load the shelves."],
    ["3 · Price", "Press P and keep prices near the fair-price guide."],
    ["4 · Open", "Press E on the shop sign by the door to open for business."],
    ["5 · Serve", "Stand behind the till and press E to scan each customer."],
    ["6 · Grow", "Bank the day's takings, reinvest in shelves and more stock."],
  ];

  return (
    <PanelShell
      title="How to play"
      subtitle="Getting started"
      onClose={onClose}
      width="max-w-3xl"
    >
      <div className="grid gap-10 sm:grid-cols-2">
        <section>
          <SectionLabel>The loop</SectionLabel>
          <div className="mt-3 flex flex-col">
            {steps.map(([title, body]) => (
              <div key={title} className="border-b border-border/50 py-3 last:border-b-0">
                <p className="text-sm font-medium">{title}</p>
                <p className="mt-0.5 text-[12px] leading-5 text-muted-foreground">{body}</p>
              </div>
            ))}
          </div>
        </section>
        <section>
          <SectionLabel>Controls</SectionLabel>
          <div className="mt-3 flex flex-col">
            {controls.map(([key, body]) => (
              <div
                key={key}
                className="flex items-baseline justify-between gap-4 border-b border-border/50 py-3 last:border-b-0"
              >
                <span className="rounded border border-border/70 px-2 py-0.5 font-mono text-[11px]">
                  {key}
                </span>
                <span className="text-right text-[12px] text-muted-foreground">{body}</span>
              </div>
            ))}
          </div>
        </section>
      </div>
    </PanelShell>
  );
}

// ----------------------------------------------------------------- save/pause

export function SavePanel({ game, onClose }: { game: Game; onClose: () => void }) {
  const [confirmNew, setConfirmNew] = useState(false);

  return (
    <PanelShell
      title="Save & load"
      subtitle="Progress"
      onClose={onClose}
      width="max-w-xl"
      footer={
        <p className="text-xs text-muted-foreground">
          Progress is saved to this browser, so you can close the tab and continue later.
        </p>
      }
    >
      <div className="flex flex-col gap-8">
        <section>
          <SectionLabel>Current game</SectionLabel>
          <div className="mt-3">
            <Row label="Day" value={String(game.economy.day)} muted />
            <Row label="Balance" value={formatMoney(game.money)} muted />
            <Row label="Reputation" value={game.reputation.label} muted />
          </div>
        </section>

        <div className="flex flex-wrap gap-2">
          <Button className="cursor-pointer" onClick={() => game.save()}>
            Save now
          </Button>
          <Button
            variant="outline"
            className="cursor-pointer"
            disabled={!game.hasSave()}
            onClick={() => {
              if (game.load()) onClose();
            }}
          >
            Load last save
          </Button>
        </div>

        <section className="rounded-lg border border-border/70 p-4">
          <SectionLabel>New shop</SectionLabel>
          <p className="mt-2 text-xs leading-5 text-muted-foreground">
            Starting over erases your saved shop, shelves, stock and statistics.
          </p>
          <div className="mt-3 flex gap-2">
            {confirmNew ? (
              <>
                <Button
                  variant="outline"
                  className="cursor-pointer"
                  onClick={() => {
                    game.newGame();
                    setConfirmNew(false);
                    onClose();
                  }}
                >
                  Yes, start over
                </Button>
                <Button
                  variant="ghost"
                  className="cursor-pointer"
                  onClick={() => setConfirmNew(false)}
                >
                  Cancel
                </Button>
              </>
            ) : (
              <Button
                variant="outline"
                className="cursor-pointer"
                onClick={() => setConfirmNew(true)}
              >
                New game
              </Button>
            )}
          </div>
        </section>
      </div>
    </PanelShell>
  );
}

export function PauseMenu({ game, onClose }: { game: Game; onClose: () => void }) {
  return (
    <PanelShell
      title="Paused"
      subtitle="Meridian Market"
      onClose={onClose}
      width="max-w-md"
      footer={
        <p className="text-xs text-muted-foreground">
          Press Esc to resume. The shop is frozen while this menu is open.
        </p>
      }
    >
      <div className="flex flex-col gap-2">
        <Button className="w-full cursor-pointer" onClick={onClose}>
          Resume trading
        </Button>
        <Button
          variant="outline"
          className="w-full cursor-pointer"
          onClick={() => game.openPanel("save")}
        >
          Save & load
        </Button>
        <Button
          variant="outline"
          className="w-full cursor-pointer"
          onClick={() => game.openPanel("settings")}
        >
          Settings
        </Button>
        <Button
          variant="outline"
          className="w-full cursor-pointer"
          onClick={() => game.save()}
        >
          Quick save
        </Button>
        <Button
          variant="ghost"
          className="w-full cursor-pointer"
          onClick={() => game.openPanel("help")}
        >
          How to play
        </Button>
      </div>
    </PanelShell>
  );
}
