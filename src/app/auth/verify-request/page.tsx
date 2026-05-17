import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Wordmark } from "@/components/brand/Wordmark";
import { ChalkGrid, Floodlight } from "@/components/brand/ChalkGrid";
import { Mail } from "lucide-react";

export const metadata = { title: "Check your email" };

export default function VerifyRequestPage() {
  return (
    <main className="relative min-h-screen flex items-center justify-center p-6 bg-pitch-900 overflow-hidden">
      <ChalkGrid />
      <Floodlight />

      <div className="relative w-full max-w-md space-y-8">
        <div className="flex flex-col items-center gap-3">
          <Wordmark size="lg" />
        </div>

        <Card>
          <CardHeader>
            <div className="mb-4 h-12 w-12 rounded-full bg-turf-400/15 text-turf-300 flex items-center justify-center">
              <Mail className="h-6 w-6" />
            </div>
            <CardTitle className="text-2xl">Check your email</CardTitle>
            <CardDescription>
              A sign-in link is on its way. Click it to continue — it works in any browser.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="rounded-md border border-line bg-pitch-700/50 p-4 text-sm text-ink-300 space-y-2">
              <p className="font-medium text-ink-50">Didn&apos;t get the email?</p>
              <ul className="list-disc list-inside text-ink-500 space-y-1 text-xs">
                <li>Check your spam folder</li>
                <li>Confirm you spelled your email correctly</li>
                <li>It can take 30–60 seconds to arrive</li>
              </ul>
            </div>
          </CardContent>
        </Card>

        <p className="text-center text-xs text-ink-500">
          You can close this tab once you&apos;ve clicked the link.
        </p>
      </div>
    </main>
  );
}
