import { GameShell } from "@/components/game/GameShell";
import { useAuth } from "@/hooks/use-auth";
import { LogOut } from "lucide-react";
import { useNavigate } from "react-router";

export default function Dashboard() {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();

  const handleSignOut = async () => {
    await signOut();
    navigate("/");
  };

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-background text-foreground">
      <header className="flex h-12 shrink-0 items-center justify-between border-b border-border/60 px-4 sm:px-6">
        <div className="flex items-center gap-3">
          <span className="text-[11px] font-semibold uppercase tracking-[0.32em]">
            Meridian
          </span>
          <span className="h-4 w-px bg-border/70" />
          <span className="text-[11px] text-muted-foreground">
            Neighbourhood market simulator
          </span>
        </div>
        <div className="flex items-center gap-3">
          <span className="hidden text-[11px] text-muted-foreground sm:inline">
            {user?.email ?? user?.name ?? "Guest"}
          </span>
          <button
            type="button"
            onClick={handleSignOut}
            className="flex cursor-pointer items-center gap-1.5 rounded-md border border-border/70 px-2.5 py-1 text-[11px] text-muted-foreground transition-colors hover:text-foreground"
          >
            <LogOut className="size-3" />
            Sign out
          </button>
        </div>
      </header>

      <main className="relative min-h-0 flex-1">
        <GameShell />
      </main>
    </div>
  );
}
