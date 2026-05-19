"use client";

import { useEffect, useState, useTransition } from "react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import {
  updateTenantDomainAction,
  refreshTenantDomainStatusAction,
} from "@/actions/tenant";
import {
  Globe,
  Loader2,
  ExternalLink,
  Copy,
  CheckCircle2,
  AlertTriangle,
  Clock,
  RefreshCw,
} from "lucide-react";

type DomainStatus = "pending_dns" | "verified" | "misconfigured" | "unknown";

/**
 * Custom-domain card on /admin/branding. Stores the requested domain on
 * the tenant row, calls the Vercel Domains API on save (when configured),
 * and polls every 20s while the domain is in a pre-verified state.
 *
 * When the Vercel API isn't configured (no VERCEL_TOKEN), the action
 * returns provisionWarning and we surface the manual CLI/dashboard steps.
 */
export function CustomDomainCard({
  tenantId,
  initialDomain,
  initialStatus,
}: {
  tenantId: string;
  initialDomain: string | null;
  initialStatus: string | null;
}) {
  const [domain, setDomain] = useState(initialDomain ?? "");
  const [saved, setSaved] = useState(initialDomain ?? "");
  const [status, setStatus] = useState<string | null>(initialStatus);
  const [manualOnly, setManualOnly] = useState(false);
  const [pending, startTransition] = useTransition();
  const [refreshing, startRefresh] = useTransition();

  function save(next: string) {
    startTransition(async () => {
      try {
        const result = await updateTenantDomainAction({
          tenantId,
          customDomain: next,
        });
        const value = result.customDomain ?? "";
        setSaved(value);
        setDomain(value);
        setStatus(result.customDomainStatus ?? null);
        setManualOnly(Boolean(result.provisionWarning));
        if (result.provisionWarning) {
          toast.message(result.provisionWarning);
        } else {
          toast.success(
            value ? `Domain set to ${value}` : "Custom domain cleared"
          );
        }
      } catch (e) {
        toast.error((e as Error).message);
      }
    });
  }

  function refresh() {
    startRefresh(async () => {
      try {
        const result = await refreshTenantDomainStatusAction({ tenantId });
        setStatus(result.customDomainStatus ?? null);
      } catch {
        // Silent — the manual refresh button still toasts on poll failure.
      }
    });
  }

  // Auto-poll while the domain is in a non-terminal state. Verified is
  // terminal; misconfigured we still poll in case the user fixes DNS.
  useEffect(() => {
    if (!saved || manualOnly) return;
    if (status === "verified") return;
    const id = setInterval(() => {
      refreshTenantDomainStatusAction({ tenantId })
        .then((r) => setStatus(r.customDomainStatus ?? null))
        .catch(() => {});
    }, 20_000);
    return () => clearInterval(id);
  }, [tenantId, saved, status, manualOnly]);

  function copy(text: string) {
    navigator.clipboard
      .writeText(text)
      .then(() => toast.success("Copied"))
      .catch(() => toast.error("Could not copy — paste manually"));
  }

  const isApex =
    saved && !saved.includes(".") ? false : saved && saved.split(".").length === 2;

  return (
    <Card className="p-5 space-y-4">
      <div>
        <p className="text-xs uppercase tracking-[0.2em] text-ink-500 inline-flex items-center gap-1.5">
          <Globe className="h-3 w-3" />
          Custom domain
        </p>
        <h2 className="text-lg font-semibold tracking-[-0.02em] mt-1">
          Bring your own domain
        </h2>
        <p className="text-xs text-ink-500 mt-1 max-w-prose">
          Serve your public page from <span className="font-mono">coach.yourdomain.com</span>{" "}
          or <span className="font-mono">yourdomain.com</span>. Save the domain
          here and we&apos;ll add it to the platform and check the DNS
          configuration automatically.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto] gap-2 items-end">
        <div className="space-y-1.5">
          <Label htmlFor="customDomain">Domain</Label>
          <Input
            id="customDomain"
            value={domain}
            onChange={(e) => setDomain(e.target.value)}
            placeholder="coach.example.com"
            className="font-mono"
          />
        </div>
        <div className="flex gap-2">
          {saved && (
            <Button
              type="button"
              variant="ghost"
              onClick={() => save("")}
              disabled={pending}
            >
              Clear
            </Button>
          )}
          <Button
            type="button"
            variant="primary"
            onClick={() => save(domain.trim())}
            disabled={pending || domain.trim() === saved}
          >
            {pending && <Loader2 className="h-4 w-4 animate-spin" />}
            Save
          </Button>
        </div>
      </div>

      {saved && (
        <div className="space-y-4 pt-2">
          <div className="flex items-center gap-2 text-xs flex-wrap">
            <StatusBadge status={(status as DomainStatus) ?? "unknown"} />
            {!manualOnly && status && status !== "verified" && (
              <button
                type="button"
                onClick={refresh}
                className="inline-flex items-center gap-1 text-ink-500 hover:text-ink-50"
                disabled={refreshing}
              >
                <RefreshCw
                  className={`h-3 w-3 ${refreshing ? "animate-spin" : ""}`}
                />
                Check again
              </button>
            )}
          </div>

          {status === "verified" ? (
            <p className="text-sm text-ink-300">
              <span className="font-mono">{saved}</span> is live and serving
              your public page. SSL is issued automatically.
            </p>
          ) : (
            <ol className="space-y-3 text-sm text-ink-300">
              {manualOnly && (
                <li className="space-y-1.5">
                  <p className="font-medium text-ink-50">
                    1. Add the domain to the Vercel project
                  </p>
                  <p className="text-xs text-ink-500">
                    Run the Vercel CLI command below or paste{" "}
                    <span className="font-mono">{saved}</span> into the
                    project&apos;s Domains settings on vercel.com.
                  </p>
                  <div className="flex items-center gap-2 rounded-md border border-line bg-pitch-900/40 px-3 py-2 font-mono text-xs">
                    <span className="flex-1 truncate">
                      vercel domains add {saved}
                    </span>
                    <button
                      type="button"
                      onClick={() => copy(`vercel domains add ${saved}`)}
                      className="text-ink-500 hover:text-ink-50"
                    >
                      <Copy className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </li>
              )}

              <li className="space-y-1.5">
                <p className="font-medium text-ink-50">
                  {manualOnly ? "2." : "1."} Create the DNS record at your registrar
                </p>
                <p className="text-xs text-ink-500">
                  {isApex
                    ? "Apex domain — use an A record."
                    : "Subdomain — use a CNAME record."}
                </p>
                <div className="rounded-md border border-line bg-pitch-900/40">
                  <table className="w-full text-xs font-mono">
                    <tbody>
                      <tr className="border-b border-line">
                        <td className="px-3 py-2 text-ink-500 w-24">Type</td>
                        <td className="px-3 py-2">{isApex ? "A" : "CNAME"}</td>
                      </tr>
                      <tr className="border-b border-line">
                        <td className="px-3 py-2 text-ink-500">Name</td>
                        <td className="px-3 py-2 inline-flex items-center gap-2">
                          <span>{isApex ? "@" : saved.split(".")[0]}</span>
                        </td>
                      </tr>
                      <tr>
                        <td className="px-3 py-2 text-ink-500">Value</td>
                        <td className="px-3 py-2 inline-flex items-center gap-2 w-full">
                          <span className="flex-1">
                            {isApex ? "76.76.21.21" : "cname.vercel-dns.com"}
                          </span>
                          <button
                            type="button"
                            onClick={() =>
                              copy(
                                isApex ? "76.76.21.21" : "cname.vercel-dns.com"
                              )
                            }
                            className="text-ink-500 hover:text-ink-50"
                          >
                            <Copy className="h-3.5 w-3.5" />
                          </button>
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </li>

              <li className="space-y-1.5">
                <p className="font-medium text-ink-50">
                  {manualOnly ? "3." : "2."} Wait for verification
                </p>
                <p className="text-xs text-ink-500">
                  We check every 20 seconds. Most DNS records propagate in
                  under 5 minutes — sometimes up to an hour.
                </p>
                <a
                  href="https://vercel.com/docs/projects/domains/add-a-domain"
                  target="_blank"
                  rel="noreferrer noopener"
                  className="inline-flex items-center gap-1 text-xs text-flood-400 hover:text-flood-400/80"
                >
                  <ExternalLink className="h-3 w-3" />
                  Vercel docs · adding a domain
                </a>
              </li>
            </ol>
          )}
        </div>
      )}
    </Card>
  );
}

function StatusBadge({ status }: { status: DomainStatus }) {
  if (status === "verified") {
    return (
      <Badge
        variant="outline"
        className="border-turf-400/40 text-turf-300 bg-turf-400/10"
      >
        <CheckCircle2 className="h-3 w-3 mr-1" />
        Verified
      </Badge>
    );
  }
  if (status === "misconfigured") {
    return (
      <Badge
        variant="outline"
        className="border-flood-400/40 text-flood-400 bg-flood-400/10"
      >
        <AlertTriangle className="h-3 w-3 mr-1" />
        Misconfigured DNS
      </Badge>
    );
  }
  if (status === "pending_dns") {
    return (
      <Badge
        variant="outline"
        className="border-ink-500/40 text-ink-300 bg-pitch-900/40"
      >
        <Clock className="h-3 w-3 mr-1" />
        Pending DNS
      </Badge>
    );
  }
  return (
    <Badge
      variant="outline"
      className="border-ink-500/40 text-ink-300 bg-pitch-900/40"
    >
      <Clock className="h-3 w-3 mr-1" />
      Awaiting check
    </Badge>
  );
}
