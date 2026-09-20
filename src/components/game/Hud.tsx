import type { Game } from "@/game/Game";
import type { GameSnapshot } from "@/game/types";
import { formatMoney } from "@/lib/utils";
import { cn } from "@/lib/utils";
import {
  BarChart3,
  BookOpen,
  Hammer,
  HelpCircle,
  Pause,
  Package,
  Tags,
  Wallet,
} from "lucide-react";

interface HudProps {
  game: Game;
  snapshot: GameSnapshot;
}

function Micro({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <span
      className={cn(
        "text-[10px] font-medium uppercase tracking-[0.18em] text-muted-foreground",
        className,
      )}
    >
      {children}
    </span>
  );
}

function StatBlock({
  label,
  value,
  emphasis = false,
}: {
  label: string;
  value: string;
  emphasis?: boolean;
}) {
  return (
    <div className="flex flex-col gap-0.5">
      <Micro>{label}</Micro>
      <span
        className={cn(
          "tabular-nums leading-none",
          emphasis ? "text-2xl font-semibold tracking-tight" : "text-base font-medium",
        )}
      >
        {value}
      </span>
    </div>
  );
}

export function Hud({ game, snapshot }: HudProps) {
  const serving = game.checkout.serving;
  const progress = game.checkout.servingProgress;
  const showPlayOverlay =
    !snapshot.pointerLocked && !snapshot.panel && !snapshot.paused;

  return (
    <div className="pointer-events-none absolute inset-0 select-none text-foreground">
      {/* Top bar ------------------------------------------------------------ */}
      <div className="absolute inset-x-0 top-0 flex items-start justify-between gap-4 p-4 sm:p-6">
        <div className="flex items-center gap-3 rounded-lg border border-border/70 bg-background/80 px-4 py-3 backdrop-blur-md">
          <div className="flex flex-col gap-1">
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold tracking-tight">Meridian Market</span>
              <span
                className={cn(
                  "rounded-full border px-2 py-0.5 text-[10px] font-medium uppercase tracking-[0.16em]",
                  snapshot.shopOpen
                    ? "border-foreground/25 bg-foreground text-background"
                    : "border-border/70 text-muted-foreground",
                )}
              >
                {snapshot.shopOpen ? "Open" : "Closed"}
              </span>
            </div>
            <div className="flex items-center gap-3">
              <Micro>
                Day {snapshot.day} · {snapshot.clock}
              </Micro>
              <Micro>Rep {snapshot.reputation.toFixed(0)}</Micro>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex items-center gap-6 rounded-lg border border-border/70 bg-background/80 px-4 py-3 backdrop-blur-md">
            <StatBlock label="Balance" value={formatMoney(snapshot.money)} emphasis />
            <div className="h-8 w-px bg-border/70" />
            <StatBlock label="Today" value={formatMoney(snapshot.revenueToday)} />
            <div className="hidden h-8 w-px bg-border/70 sm:block" />
            <div className="hidden sm:block">
              <StatBlock label="In store" value={String(snapshot.customersInStore)} />
            </div>
          </div>
        </div>
      </div>

      {/* Day progress rail --------------------------------------------------- */}
      <div className="absolute inset-x-0 top-0 h-0.5 bg-transparent">
        <div
          className="h-full bg-foreground/40 transition-[width] duration-500 ease-linear"
          style={{ width: `${Math.min(100, snapshot.dayProgress * 100)}%` }}
        />
      </div>

      {/* Active event banner -------------------------------------------------- */}
      {snapshot.eventName && (
        <div className="absolute left-1/2 top-24 -translate-x-1/2">
          <div className="rounded-lg border border-border/70 bg-background/85 px-5 py-3 text-center backdrop-blur-md">
            <Micro>{`${Math.ceil(snapshot.activeEventRemaining)}s · event`}</Micro>
            <p className="mt-1 text-sm font-medium tracking-tight">{snapshot.eventName}</p>
          </div>
        </div>
      )}

      {/* Crosshair ----------------------------------------------------------- */}
      <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
        <div
          className={cn(
            "size-1.5 rounded-full transition-all duration-150",
            snapshot.prompt ? "bg-background shadow-[0_0_0_2px_rgba(0,0,0,0.35)]" : "bg-background/50",
          )}
        />
      </div>

      {/* Interaction prompt -------------------------------------------------- */}
      {(snapshot.prompt || snapshot.promptHint) && !snapshot.buildMode && (
        <div className="absolute left-1/2 top-[calc(50%+2.25rem)] -translate-x-1/2 text-center">
          <div className="rounded-md border border-border/70 bg-background/85 px-3.5 py-2 backdrop-blur-md">
            {snapshot.prompt && (
              <p className="text-sm font-medium tracking-tight">{snapshot.prompt}</p>
            )}
            {snapshot.promptHint && (
              <p className="mt-0.5 text-[11px] text-muted-foreground">{snapshot.promptHint}</p>
            )}
          </div>
        </div>
      )}

      {/* Checkout progress ---------------------------------------------------- */}
      {serving && (
        <div className="absolute left-1/2 top-[calc(50%+6rem)] w-64 -translate-x-1/2">
          <div className="rounded-md border border-border/70 bg-background/85 px-4 py-3 backdrop-blur-md">
            <div className="flex items-center justify-between">
              <Micro>Serving</Micro>
              <Micro>{`${serving.cart.length} items`}</Micro>
            </div>
            <div className="mt-2 h-1 w-full overflow-hidden rounded-full bg-border/60">
              <div
                className="h-full bg-foreground"
                style={{ width: `${progress * 100}%` }}
              />
            </div>
          </div>
        </div>
      )}

      {/* Build mode banner ---------------------------------------------------- */}
      {snapshot.buildMode && (
        <div className="absolute left-1/2 top-[calc(50%+2.25rem)] -translate-x-1/2 text-center">
          <div className="rounded-md border border-border bg-background/90 px-4 py-3 backdrop-blur-md">
            <p className="text-sm font-medium tracking-tight">
              Placing shelf · {formatMoney(snapshot.buildCost)}
            </p>
            <p className="mt-0.5 text-[11px] text-muted-foreground">
              Q / E rotate · Click or Space place · X remove · B exit
            </p>
          </div>
        </div>
      )}

      {/* Held item ------------------------------------------------------------ */}
      {snapshot.held && (
        <div className="absolute bottom-6 left-1/2 -translate-x-1/2">
          <div className="flex items-center gap-3 rounded-md border border-border/70 bg-background/85 px-4 py-2.5 backdrop-blur-md">
            <Package className="size-4" />
            <div className="flex flex-col">
              <Micro>Carrying</Micro>
              <span className="text-sm font-medium">
                {snapshot.held.units} units in case
              </span>
            </div>
            <div className="h-6 w-px bg-border/70" />
            <Micro>G to drop</Micro>
          </div>
        </div>
      )}

      {/* Notice --------------------------------------------------------------- */}
      {snapshot.notice && (
        <div className="absolute bottom-24 left-1/2 w-[min(28rem,calc(100%-2rem))] -translate-x-1/2">
          <div
            className={cn(
              "rounded-lg border bg-background/90 px-4 py-3 text-center backdrop-blur-md",
              snapshot.notice.kind === "bad" ? "border-foreground/30" : "border-border/70",
            )}
          >
            <p className="text-sm leading-5 tracking-tight">{snapshot.notice.text}</p>
          </div>
        </div>
      )}

      {/* Quick actions -------------------------------------------------------- */}
      <div className="pointer-events-auto absolute bottom-4 right-4 flex items-center gap-1.5 rounded-lg border border-border/70 bg-background/80 p-1.5 backdrop-blur-md sm:bottom-6 sm:right-6">
        <QuickButton
          icon={<Package className="size-4" />}
          label="Order"
          onClick={() => game.openPanel("order")}
        />
        <QuickButton
          icon={<Tags className="size-4" />}
          label="Prices"
          onClick={() => game.openPanel("pricing")}
        />
        <QuickButton
          icon={<Wallet className="size-4" />}
          label="Ledger"
          onClick={() => game.openPanel("ledger")}
        />
        <QuickButton
          icon={<BarChart3 className="size-4" />}
          label="Stats"
          onClick={() => game.openPanel("stats")}
        />
        <QuickButton
          icon={<Hammer className="size-4" />}
          label="Build"
          active={snapshot.buildMode}
          onClick={() => game.build.toggle()}
        />
        <QuickButton
          icon={<BookOpen className="size-4" />}
          label="Save"
          onClick={() => game.openPanel("save")}
        />
        <QuickButton
          icon={<HelpCircle className="size-4" />}
          label="Help"
          onClick={() => game.openPanel("help")}
        />
        <div className="mx-1 h-6 w-px bg-border/70" />
        <QuickButton
          icon={<Pause className="size-4" />}
          label="Pause"
          onClick={() => game.setPaused(true)}
        />
      </div>

      {/* Movement hint -------------------------------------------------------- */}
      <div className="absolute bottom-6 left-6 hidden flex-col gap-1 lg:flex">
        <Micro>WASD move · Shift sprint · Ctrl crouch · E interact · G drop</Micro>
        <Micro>B build · O order · P prices · L ledger · Esc pause</Micro>
      </div>

      {/* Click to play -------------------------------------------------------- */}
      {showPlayOverlay && (
        <button
          type="button"
          onClick={() => game.requestLock()}
          className="pointer-events-auto absolute inset-0 flex cursor-pointer items-center justify-center bg-foreground/25 backdrop-blur-[3px]"
        >
          <div className="rounded-xl border border-border/70 bg-background/95 px-8 py-7 text-center">
            <Micro>Paused</Micro>
            <p className="mt-2 text-xl font-semibold tracking-tight">Click to play</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Mouse look · WASD to walk · Esc for the menu
            </p>
          </div>
        </button>
      )}
    </div>
  );
}

function QuickButton({
  icon,
  label,
  onClick,
  active = false,
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  active?: boolean;
}) {
  return (
    <button
      type="button"
      title={label}
      onClick={onClick}
      className={cn(
        "flex cursor-pointer flex-col items-center gap-1 rounded-md px-2.5 py-2 text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground",
        active && "bg-foreground text-background hover:bg-foreground hover:text-background",
      )}
    >
      {icon}
      <span className="text-[10px] font-medium uppercase tracking-[0.12em]">{label}</span>
    </button>
  );
}
