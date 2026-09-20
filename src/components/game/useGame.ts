import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { Game } from "@/game/Game";
import type { GameSnapshot } from "@/game/types";

/**
 * Mounts the Three.js game onto a canvas exactly once and exposes its snapshot
 * to React through an external store subscription.
 *
 * Creation is deferred by one animation frame so React StrictMode's
 * mount → unmount → mount cycle cannot build two renderers on one canvas.
 */
export function useGame() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const gameRef = useRef<Game | null>(null);
  const [game, setGame] = useState<Game | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let frame = 0;
    let created: Game | null = null;

    frame = requestAnimationFrame(() => {
      if (gameRef.current) return;
      created = new Game(canvas);
      created.start();
      gameRef.current = created;
      setGame(created);
    });

    return () => {
      cancelAnimationFrame(frame);
      if (created) {
        created.dispose();
        gameRef.current = null;
        setGame(null);
      }
    };
  }, []);

  const subscribe = useCallback(
    (onChange: () => void) => {
      if (!game) return () => {};
      return game.subscribe(onChange);
    },
    [game],
  );

  const getSnapshot = useCallback((): GameSnapshot | null => {
    return game ? game.getSnapshot() : null;
  }, [game]);

  const snapshot = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);

  return { canvasRef, game, snapshot };
}

/** Stable subscription for reading a specific game instance's snapshot. */
export function useGameSnapshot(game: Game | null): GameSnapshot | null {
  const subscribe = useCallback(
    (onChange: () => void) => (game ? game.subscribe(onChange) : () => {}),
    [game],
  );
  const getSnapshot = useCallback<() => GameSnapshot | null>(
    () => (game ? game.getSnapshot() : null),
    [game],
  );
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}
