import { Hud } from "./Hud";
import {
  HelpPanel,
  LedgerPanel,
  OrderPanel,
  PauseMenu,
  PricingPanel,
  SavePanel,
  SettingsPanel,
  ShelfPanel,
  StatsPanel,
} from "./Panels";
import { useGame } from "./useGame";

/**
 * The playable screen: a single canvas that owns the renderer for its whole
 * lifetime, with a React HUD and modal management panels layered on top.
 */
export function GameShell() {
  const { canvasRef, game, snapshot } = useGame();

  const close = () => game?.closePanel();

  return (
    <div className="relative h-full w-full overflow-hidden bg-background">
      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full touch-none" />

      {game && snapshot && (
        <>
          <Hud game={game} snapshot={snapshot} />

          {snapshot.panel === "order" && <OrderPanel game={game} onClose={close} />}
          {snapshot.panel === "pricing" && <PricingPanel game={game} onClose={close} />}
          {snapshot.panel === "ledger" && <LedgerPanel game={game} onClose={close} />}
          {snapshot.panel === "stats" && (
            <StatsPanel game={game} snapshot={snapshot} onClose={close} />
          )}
          {snapshot.panel === "settings" && <SettingsPanel game={game} onClose={close} />}
          {snapshot.panel === "help" && <HelpPanel onClose={close} />}
          {snapshot.panel === "save" && <SavePanel game={game} onClose={close} />}
          {snapshot.panel === "shelf" && (
            <ShelfPanel
              game={game}
              shelfId={snapshot.panelShelfId}
              onClose={close}
            />
          )}

          {snapshot.paused && snapshot.panel === null && (
            <PauseMenu game={game} onClose={() => game.setPaused(false)} />
          )}
        </>
      )}
    </div>
  );
}
