"use client";

import { useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Copy, Check, ExternalLink, Download } from "lucide-react";
import { toast } from "sonner";

export function ShareProgramDialog({
  open,
  onOpenChange,
  programName,
  url,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  programName: string;
  url: string;
}) {
  const [copied, setCopied] = useState(false);

  async function copyUrl() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      toast.success("Link copied to clipboard");
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Copy failed — select the text manually");
    }
  }

  function downloadQr() {
    const svg = document.getElementById(`qr-${programName}`);
    if (!svg) return;
    const xml = new XMLSerializer().serializeToString(svg);
    const blob = new Blob([xml], { type: "image/svg+xml" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${programName.toLowerCase().replace(/\s+/g, "-")}-qr.svg`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Share &ldquo;{programName}&rdquo;</DialogTitle>
          <DialogDescription>
            Send this link or scan the QR — parents land directly on the booking page.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* URL row */}
          <div className="flex gap-2">
            <Input
              value={url}
              readOnly
              onClick={(e) => e.currentTarget.select()}
              className="font-mono text-xs"
            />
            <Button type="button" variant="primary" size="md" onClick={copyUrl}>
              {copied ? (
                <>
                  <Check className="h-4 w-4" />
                  Copied
                </>
              ) : (
                <>
                  <Copy className="h-4 w-4" />
                  Copy
                </>
              )}
            </Button>
          </div>

          {/* QR code */}
          <div className="flex flex-col items-center gap-3 p-6 rounded-md bg-pitch-900 border border-line">
            <div className="bg-white p-3 rounded-md">
              <QRCodeSVG
                id={`qr-${programName}`}
                value={url}
                size={192}
                level="M"
                bgColor="#FFFFFF"
                fgColor="#0A1410"
              />
            </div>
            <p className="text-xs text-ink-500">Point a phone camera at the code to open the booking page</p>
          </div>
        </div>

        <DialogFooter className="flex flex-row gap-2 sm:justify-between">
          <Button type="button" variant="ghost" size="sm" onClick={downloadQr}>
            <Download className="h-3.5 w-3.5" />
            Download QR
          </Button>
          <Button type="button" variant="secondary" size="sm" asChild>
            <a href={url} target="_blank" rel="noreferrer">
              <ExternalLink className="h-3.5 w-3.5" />
              Open in new tab
            </a>
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
