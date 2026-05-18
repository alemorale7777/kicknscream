"use client";

import { useState, useTransition } from "react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { updateTenantDomainAction } from "@/actions/tenant";
import { Globe, Loader2, ExternalLink, Copy, CheckCircle2 } from "lucide-react";

/**
 * Custom-domain card on /admin/branding. Stores the requested domain on
 * the tenant row and surfaces the DNS records the owner has to add at
 * their registrar before the platform host can serve traffic from it.
 *
 * Provisioning the domain in Vercel (the API call that triggers cert
 * issuance) is still a manual step today — the card shows the exact
 * commands so the operator can do it themselves until we hook the
 * Vercel Domains API.
 */
export function CustomDomainCard({
  tenantId,
  initialDomain,
}: {
  tenantId: string;
  initialDomain: string | null;
}) {
  const [domain, setDomain] = useState(initialDomain ?? "");
  const [saved, setSaved] = useState(initialDomain ?? "");
  const [pending, startTransition] = useTransition();

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
        toast.success(value ? `Domain set to ${value}` : "Custom domain cleared");
      } catch (e) {
        toast.error((e as Error).message);
      }
    });
  }

  function copy(text: string) {
    navigator.clipboard
      .writeText(text)
      .then(() => toast.success("Copied"))
      .catch(() => toast.error("Could not copy — paste manually"));
  }

  const isApex = saved && !saved.includes(".") ? false : saved && saved.split(".").length === 2;

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
          here, then add it to the Vercel project and create the DNS records
          shown below.
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
          <div className="flex items-center gap-2 text-xs">
            <Badge
              variant="outline"
              className="border-turf-400/40 text-turf-300 bg-turf-400/10"
            >
              <CheckCircle2 className="h-3 w-3 mr-1" />
              Saved
            </Badge>
            <span className="text-ink-500">
              Now finish setup at your registrar + on Vercel.
            </span>
          </div>

          <ol className="space-y-3 text-sm text-ink-300">
            <li className="space-y-1.5">
              <p className="font-medium text-ink-50">
                1. Add the domain to the Vercel project
              </p>
              <p className="text-xs text-ink-500">
                Run the Vercel CLI command below or paste{" "}
                <span className="font-mono">{saved}</span> into the project&apos;s
                Domains settings on vercel.com.
              </p>
              <div className="flex items-center gap-2 rounded-md border border-line bg-pitch-900/40 px-3 py-2 font-mono text-xs">
                <span className="flex-1 truncate">vercel domains add {saved}</span>
                <button
                  type="button"
                  onClick={() => copy(`vercel domains add ${saved}`)}
                  className="text-ink-500 hover:text-ink-50"
                >
                  <Copy className="h-3.5 w-3.5" />
                </button>
              </div>
            </li>

            <li className="space-y-1.5">
              <p className="font-medium text-ink-50">
                2. Create the DNS record at your registrar
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
                            copy(isApex ? "76.76.21.21" : "cname.vercel-dns.com")
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
                3. Verify in the Vercel dashboard
              </p>
              <p className="text-xs text-ink-500">
                Vercel issues the SSL cert automatically once the DNS records
                propagate (usually under 5 minutes — sometimes up to an hour).
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
        </div>
      )}
    </Card>
  );
}
