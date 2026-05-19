import { requireFamilyAccess } from "@/lib/tenant";
import { db } from "@/lib/db";
import { parentModelV2Enabled } from "@/lib/env";
import { PageHeader } from "@/components/chrome/PageHeader";
import { Card } from "@/components/ui/card";
import { WaiverList } from "@/components/family/WaiverList";
import { ScrollText } from "lucide-react";

export const metadata = { title: "Forms & waivers" };

export default async function FamilyFormsPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const { tenant, user, parent } = await requireFamilyAccess(slug);

  const playerWhere =
    parentModelV2Enabled() && parent
      ? { tenantId: tenant.id, parentRefId: parent.id }
      : {
          tenantId: tenant.id,
          OR: [
            { parentId: user.id },
            { parentLinks: { some: { parentUserId: user.id } } },
          ],
        };

  // Pull every waiver this tenant has + every signature this parent has
  // already submitted across their players. Then split into "needs
  // signature per kid" rows.
  const [waivers, players] = await Promise.all([
    db.waiver.findMany({
      where: { tenantId: tenant.id },
      orderBy: { title: "asc" },
    }),
    db.player.findMany({
      where: playerWhere,
      orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
    }),
  ]);

  if (waivers.length === 0 || players.length === 0) {
    return (
      <div className="space-y-6">
        <PageHeader
          eyebrow="Forms & waivers"
          title={tenant.name}
          description="Required forms appear here. Sign once per kid; the timestamp is kept for your records."
        />
        <Card className="p-10 text-center border-dashed">
          <ScrollText className="h-7 w-7 text-ink-700 mx-auto mb-3" />
          <p className="text-ink-300 font-medium">
            {players.length === 0
              ? "No players linked to your account yet"
              : `${tenant.name} hasn't published any waivers`}
          </p>
          <p className="text-xs text-ink-500 mt-1 max-w-sm mx-auto">
            {players.length === 0
              ? "When you book or your coach links your kid, they show up here."
              : "If there's paperwork you need to fill in, this is where it'll appear."}
          </p>
        </Card>
      </div>
    );
  }

  const signatures = await db.waiverSignature.findMany({
    where: {
      waiverId: { in: waivers.map((w) => w.id) },
      playerId: { in: players.map((p) => p.id) },
    },
  });
  const signedKey = (waiverId: string, playerId: string) =>
    `${waiverId}::${playerId}`;
  const signedSet = new Set(signatures.map((s) => signedKey(s.waiverId, s.playerId)));
  const signatureByKey = new Map(
    signatures.map((s) => [signedKey(s.waiverId, s.playerId), s])
  );

  const rows = waivers.flatMap((w) =>
    players.map((p) => {
      const key = signedKey(w.id, p.id);
      const sig = signatureByKey.get(key);
      return {
        waiverId: w.id,
        waiverTitle: w.title,
        waiverBody: w.body,
        required: w.required,
        playerId: p.id,
        playerName: `${p.firstName} ${p.lastName}`,
        signed: signedSet.has(key),
        signedAt: sig?.signedAt.toISOString() ?? null,
        signerName: sig?.signerName ?? null,
      };
    })
  );

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Forms & waivers"
        title={tenant.name}
        count={`${rows.filter((r) => !r.signed).length} pending · ${rows.filter((r) => r.signed).length} signed`}
        description="Sign once per kid. We record your name, the time, and your IP for the coach's records."
      />
      <WaiverList
        signerEmailHint={user.email ?? ""}
        defaultSignerName={user.name ?? ""}
        rows={rows}
      />
    </div>
  );
}
