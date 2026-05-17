import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { aiEnabled, getAnthropic, AI_MODEL, SESSION_NOTE_SYSTEM_PROMPT } from "@/lib/ai";

export const runtime = "nodejs";
export const maxDuration = 60;

const BodySchema = z.object({
  bullets: z.string().min(1).max(4000),
  playerName: z.string().min(1).max(120).optional(),
  programName: z.string().min(1).max(120).optional(),
  context: z.string().max(2000).optional(),
});

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!aiEnabled()) {
    return NextResponse.json(
      { error: "AI assist is not configured on this server." },
      { status: 503 }
    );
  }

  let body: z.infer<typeof BodySchema>;
  try {
    const json = await req.json();
    body = BodySchema.parse(json);
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const client = getAnthropic();

  const userPrompt = [
    body.playerName ? `Player: ${body.playerName}` : null,
    body.programName ? `Session: ${body.programName}` : null,
    body.context ? `Context: ${body.context}` : null,
    "",
    "Coach's notes:",
    body.bullets,
  ]
    .filter((x) => x !== null)
    .join("\n");

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      try {
        const aiStream = client.messages.stream({
          model: AI_MODEL,
          max_tokens: 1024,
          thinking: { type: "adaptive" },
          system: [
            {
              type: "text",
              text: SESSION_NOTE_SYSTEM_PROMPT,
              cache_control: { type: "ephemeral" },
            },
          ],
          messages: [{ role: "user", content: userPrompt }],
        });

        for await (const event of aiStream) {
          if (
            event.type === "content_block_delta" &&
            event.delta.type === "text_delta"
          ) {
            controller.enqueue(encoder.encode(event.delta.text));
          }
        }
        controller.close();
      } catch (err) {
        const msg = err instanceof Error ? err.message : "AI stream failed";
        controller.enqueue(encoder.encode(`\n\n_Error: ${msg}_`));
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Accel-Buffering": "no",
    },
  });
}
