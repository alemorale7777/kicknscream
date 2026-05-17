import { Wordmark } from "@/components/brand/Wordmark";
import { ChalkGrid } from "@/components/brand/ChalkGrid";
import { WifiOff } from "lucide-react";

export const metadata = { title: "Offline" };

export default function OfflinePage() {
  return (
    <main className="relative min-h-screen flex items-center justify-center p-6 overflow-hidden bg-pitch-900">
      <ChalkGrid />
      <div className="relative w-full max-w-md space-y-8 text-center">
        <div className="flex justify-center">
          <Wordmark size="lg" />
        </div>
        <div className="space-y-3">
          <div className="mx-auto h-14 w-14 rounded-full bg-pitch-800 border border-line flex items-center justify-center text-ink-300">
            <WifiOff className="h-6 w-6" />
          </div>
          <h1 className="text-3xl font-bold tracking-[-0.03em]">You&apos;re offline</h1>
          <p className="text-ink-500 max-w-sm mx-auto">
            Reconnect and we&apos;ll pick up right where you left off. Schedules, rosters, and notes are
            waiting for you.
          </p>
        </div>
      </div>
    </main>
  );
}
