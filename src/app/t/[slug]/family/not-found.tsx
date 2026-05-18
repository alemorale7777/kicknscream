"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Search } from "lucide-react";

/**
 * Family-portal scoped 404. Catches /family/kids/[id] with an invalid
 * id, /family/[anything-else], etc. Matches the branded treatment of
 * the rest of the family surfaces instead of falling through to the
 * default Next.js 404.
 */
export default function FamilyNotFoundPage() {
  // Extract the tenant slug from the current path so the "Back to home"
  // CTA links to /t/{slug}/family/home regardless of which family
  // subpath 404'd.
  const pathname = usePathname() ?? "";
  const match = pathname.match(/^\/t\/([^/]+)\//);
  const slug = match?.[1];
  const homeHref = slug ? `/t/${slug}/family/home` : "/";

  return (
    <div className="space-y-6">
      <Card className="p-10 text-center border-dashed">
        <div className="mx-auto h-12 w-12 rounded-full bg-pitch-700 text-ink-500 flex items-center justify-center mb-3">
          <Search className="h-6 w-6" />
        </div>
        <p className="text-lg font-semibold text-ink-50">Page not found</p>
        <p className="text-sm text-ink-500 mt-1 max-w-md mx-auto">
          The page you were looking for moved, was archived, or never existed.
        </p>
        <Button variant="primary" size="sm" asChild className="mt-5">
          <Link href={homeHref}>
            <ArrowLeft className="h-3.5 w-3.5" />
            Back to home
          </Link>
        </Button>
      </Card>
    </div>
  );
}
