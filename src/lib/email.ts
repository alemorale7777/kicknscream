import { Resend } from "resend";
import { env } from "./env";
import { format } from "date-fns";

function escapeHtml(s: string) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function formatCents(cents: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);
}

export async function sendBookingConfirmation(opts: {
  to: string;
  parentName: string;
  tenantName: string;
  tenantSlug: string;
  programName: string;
  startsAt: Date;
  endsAt: Date;
  amountCents: number;
  pendingPayment?: boolean;
}) {
  const resend = new Resend(env.AUTH_RESEND_KEY);
  const dateLine = format(opts.startsAt, "EEEE, MMMM d");
  const timeLine = `${format(opts.startsAt, "h:mm a")} – ${format(opts.endsAt, "h:mm a")}`;

  const statusBlock = opts.pendingPayment
    ? `<div style="border:1px solid rgba(255,179,71,0.4);background:rgba(255,179,71,0.1);color:#FFB347;border-radius:8px;padding:14px;margin:16px 0;font-size:13px;">
        <strong>Payment pending.</strong> ${escapeHtml(opts.tenantName)} will reach out about payment shortly.
      </div>`
    : opts.amountCents > 0
      ? `<div style="border:1px solid rgba(31,182,99,0.4);background:rgba(31,182,99,0.1);color:#4DDF8A;border-radius:8px;padding:14px;margin:16px 0;font-size:13px;">
          <strong>${formatCents(opts.amountCents)} paid.</strong> Receipt is attached to this booking.
        </div>`
      : `<div style="border:1px solid rgba(31,182,99,0.4);background:rgba(31,182,99,0.1);color:#4DDF8A;border-radius:8px;padding:14px;margin:16px 0;font-size:13px;">
          You're all set — no payment required.
        </div>`;

  const html = `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"><title>Booking confirmed</title></head>
<body style="margin:0;padding:0;background:#050A07;font-family:-apple-system,system-ui,sans-serif;color:#F5F7F4;">
  <div style="max-width:560px;margin:0 auto;padding:32px 24px;">
    <div style="margin-bottom:32px;">
      <span style="font-size:22px;font-weight:800;letter-spacing:-0.04em;color:#F5F7F4;">KICK<span style="color:#1FB663;">N</span>SCREAM</span>
      <span style="display:inline-block;width:6px;height:6px;border-radius:50%;background:#E8FF3C;margin-left:6px;vertical-align:middle;"></span>
    </div>

    <div style="background:#0F1C17;border:1px solid rgba(255,255,255,0.14);border-radius:12px;padding:32px;">
      <p style="margin:0 0 8px;color:#94A39B;font-size:12px;text-transform:uppercase;letter-spacing:0.12em;">Booking confirmed</p>
      <h1 style="margin:0 0 16px;font-size:24px;font-weight:700;letter-spacing:-0.02em;color:#F5F7F4;">${escapeHtml(opts.programName)}</h1>

      <p style="margin:0 0 8px;color:#C4CDC7;line-height:1.6;">Hi ${escapeHtml(opts.parentName.split(" ")[0])},</p>
      <p style="margin:0 0 16px;color:#C4CDC7;line-height:1.6;">
        Your booking with <strong style="color:#F5F7F4;">${escapeHtml(opts.tenantName)}</strong> is locked in.
      </p>

      <div style="border-top:1px solid rgba(255,255,255,0.14);border-bottom:1px solid rgba(255,255,255,0.14);padding:14px 0;margin:16px 0;">
        <table style="width:100%;font-size:14px;color:#F5F7F4;">
          <tr><td style="padding:4px 0;color:#94A39B;width:90px;">When</td><td style="padding:4px 0;font-weight:600;">${escapeHtml(dateLine)}<br><span style="color:#C4CDC7;font-weight:400;">${escapeHtml(timeLine)}</span></td></tr>
          <tr><td style="padding:4px 0;color:#94A39B;">Program</td><td style="padding:4px 0;">${escapeHtml(opts.programName)}</td></tr>
        </table>
      </div>

      ${statusBlock}

      <p style="margin:16px 0 0;color:#94A39B;font-size:12px;line-height:1.6;">
        Need to change something? Reply to this email and ${escapeHtml(opts.tenantName)} will help.
      </p>
    </div>

    <p style="margin:20px 0 0;color:#5A6A62;font-size:12px;text-align:center;">
      Powered by KickNScream
    </p>
  </div>
</body></html>`;

  const text = `Your booking with ${opts.tenantName} is confirmed.\n\n${opts.programName}\n${dateLine}\n${timeLine}\n\n${
    opts.pendingPayment
      ? "Payment pending — they will reach out."
      : opts.amountCents > 0
        ? `${formatCents(opts.amountCents)} paid.`
        : "No payment required."
  }`;

  await resend.emails.send({
    from: env.EMAIL_FROM,
    to: opts.to,
    subject: `Booking confirmed · ${opts.programName}`,
    html,
    text,
  });
}

export async function sendSessionNoteEmail(opts: {
  to: string;
  parentName: string;
  tenantName: string;
  tenantSlug: string;
  playerName: string;
  coachName: string;
  eventTitle: string;
  eventDate: Date;
  content: string;
}) {
  const resend = new Resend(env.AUTH_RESEND_KEY);
  const dateLine = format(opts.eventDate, "EEEE, MMMM d · h:mm a");
  const renderedContent = renderMarkdownToInlineHtml(opts.content);

  const html = `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"><title>Session note from ${escapeHtml(opts.tenantName)}</title></head>
<body style="margin:0;padding:0;background:#050A07;font-family:-apple-system,system-ui,sans-serif;color:#F5F7F4;">
  <div style="max-width:560px;margin:0 auto;padding:32px 24px;">
    <div style="margin-bottom:32px;">
      <span style="font-size:22px;font-weight:800;letter-spacing:-0.04em;color:#F5F7F4;">KICK<span style="color:#1FB663;">N</span>SCREAM</span>
      <span style="display:inline-block;width:6px;height:6px;border-radius:50%;background:#E8FF3C;margin-left:6px;vertical-align:middle;"></span>
    </div>
    <div style="background:#0F1C17;border:1px solid rgba(255,255,255,0.14);border-radius:12px;padding:32px;">
      <p style="margin:0 0 8px;color:#94A39B;font-size:12px;text-transform:uppercase;letter-spacing:0.12em;">Session note</p>
      <h1 style="margin:0 0 4px;font-size:22px;font-weight:700;letter-spacing:-0.02em;color:#F5F7F4;">${escapeHtml(opts.playerName)}</h1>
      <p style="margin:0 0 16px;color:#94A39B;font-size:13px;">${escapeHtml(opts.eventTitle)} · ${escapeHtml(dateLine)}</p>
      <div style="border-top:1px solid rgba(255,255,255,0.14);padding-top:16px;margin-top:8px;color:#C4CDC7;font-size:15px;line-height:1.7;">
        ${renderedContent}
      </div>
      <p style="margin:24px 0 0;color:#5A6A62;font-size:12px;line-height:1.6;">
        Sent by <strong style="color:#94A39B;">${escapeHtml(opts.coachName)}</strong> at ${escapeHtml(opts.tenantName)}.<br>
        Reply to this email to follow up directly.
      </p>
    </div>
    <p style="margin:20px 0 0;color:#5A6A62;font-size:12px;text-align:center;">Powered by KickNScream</p>
  </div>
</body></html>`;

  const text = `Session note for ${opts.playerName}\n${opts.eventTitle} · ${dateLine}\nFrom ${opts.coachName} at ${opts.tenantName}\n\n${opts.content}`;

  await resend.emails.send({
    from: env.EMAIL_FROM,
    to: opts.to,
    subject: `Session note · ${opts.playerName} · ${opts.eventTitle}`,
    html,
    text,
  });
}

export async function sendBroadcastEmail(opts: {
  to: string;
  recipientName?: string | null;
  tenantName: string;
  tenantSlug: string;
  subject: string;
  bodyMarkdown: string;
}) {
  const resend = new Resend(env.AUTH_RESEND_KEY);
  const rendered = renderMarkdownToInlineHtml(opts.bodyMarkdown);
  const greetingName = opts.recipientName ? opts.recipientName.split(" ")[0] : null;

  const html = `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"><title>${escapeHtml(opts.subject)}</title></head>
<body style="margin:0;padding:0;background:#050A07;font-family:-apple-system,system-ui,sans-serif;color:#F5F7F4;">
  <div style="max-width:560px;margin:0 auto;padding:32px 24px;">
    <div style="margin-bottom:24px;">
      <span style="font-size:18px;font-weight:800;letter-spacing:-0.04em;color:#F5F7F4;">${escapeHtml(opts.tenantName)}</span>
    </div>
    <div style="background:#0F1C17;border:1px solid rgba(255,255,255,0.14);border-radius:12px;padding:32px;">
      <h1 style="margin:0 0 16px;font-size:22px;font-weight:700;letter-spacing:-0.02em;color:#F5F7F4;">${escapeHtml(opts.subject)}</h1>
      ${greetingName ? `<p style="margin:0 0 16px;color:#C4CDC7;">Hi ${escapeHtml(greetingName)},</p>` : ""}
      <div style="color:#C4CDC7;font-size:15px;line-height:1.7;">${rendered}</div>
    </div>
    <p style="margin:20px 0 0;color:#5A6A62;font-size:11px;text-align:center;">
      Sent by ${escapeHtml(opts.tenantName)} via KickNScream · Reply to this email to respond directly.
    </p>
  </div>
</body></html>`;

  await resend.emails.send({
    from: env.EMAIL_FROM,
    to: opts.to,
    subject: opts.subject,
    html,
    text: opts.bodyMarkdown,
  });
}

function renderMarkdownToInlineHtml(raw: string): string {
  const escaped = escapeHtml(raw);
  const lines = escaped.split(/\n/);
  const out: string[] = [];
  let inList = false;
  for (const line of lines) {
    const trimmed = line.trim();
    const bulletMatch = /^[-*]\s+(.+)/.exec(trimmed);
    if (bulletMatch) {
      if (!inList) {
        out.push('<ul style="margin:8px 0;padding-left:20px;">');
        inList = true;
      }
      out.push(`<li style="margin:4px 0;">${inlineFormat(bulletMatch[1])}</li>`);
      continue;
    }
    if (inList) {
      out.push("</ul>");
      inList = false;
    }
    if (trimmed === "") {
      out.push("<br>");
    } else {
      out.push(`<p style="margin:8px 0;">${inlineFormat(trimmed)}</p>`);
    }
  }
  if (inList) out.push("</ul>");
  return out.join("");
}

function inlineFormat(s: string): string {
  return s
    .replace(/\*\*(.+?)\*\*/g, '<strong style="color:#F5F7F4;">$1</strong>')
    .replace(/\*(.+?)\*/g, "<em>$1</em>")
    .replace(/`(.+?)`/g, '<code style="background:rgba(255,255,255,0.08);padding:2px 4px;border-radius:3px;font-family:ui-monospace,monospace;">$1</code>');
}
