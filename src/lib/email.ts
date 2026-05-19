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

/**
 * Booking reminder email — fired by the hourly cron when an event is 24h or
 * 2h away. `lead` controls the copy ("Tomorrow" vs "In 2 hours") so the same
 * helper handles both windows.
 */
export async function sendBookingReminderEmail(opts: {
  to: string;
  parentName?: string | null;
  tenantName: string;
  tenantSlug: string;
  programName: string;
  startsAt: Date;
  endsAt: Date;
  locationName?: string | null;
  lead: "24h" | "2h";
}) {
  const resend = new Resend(env.AUTH_RESEND_KEY);
  const greetingName = opts.parentName ? opts.parentName.split(" ")[0] : null;
  const leadCopy = opts.lead === "24h" ? "Tomorrow" : "In 2 hours";
  const dateLine = format(opts.startsAt, "EEEE, MMMM d");
  const timeLine = `${format(opts.startsAt, "h:mm a")} – ${format(opts.endsAt, "h:mm a")}`;

  const html = `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"><title>Reminder: ${escapeHtml(opts.programName)}</title></head>
<body style="margin:0;padding:0;background:#050A07;font-family:-apple-system,system-ui,sans-serif;color:#F5F7F4;">
  <div style="max-width:560px;margin:0 auto;padding:32px 24px;">
    <div style="margin-bottom:24px;">
      <span style="font-size:18px;font-weight:800;letter-spacing:-0.04em;color:#F5F7F4;">${escapeHtml(opts.tenantName)}</span>
    </div>
    <div style="background:#0F1C17;border:1px solid rgba(255,255,255,0.14);border-radius:12px;padding:32px;">
      <p style="margin:0 0 8px;color:#94A39B;font-size:12px;text-transform:uppercase;letter-spacing:0.12em;">${leadCopy} · reminder</p>
      <h1 style="margin:0 0 16px;font-size:22px;font-weight:700;letter-spacing:-0.02em;color:#F5F7F4;">${escapeHtml(opts.programName)}</h1>
      ${greetingName ? `<p style="margin:0 0 12px;color:#C4CDC7;">Hi ${escapeHtml(greetingName)},</p>` : ""}
      <p style="margin:0 0 16px;color:#C4CDC7;line-height:1.6;">
        Quick reminder — your session with <strong style="color:#F5F7F4;">${escapeHtml(opts.tenantName)}</strong> is ${leadCopy.toLowerCase()}.
      </p>
      <div style="border-top:1px solid rgba(255,255,255,0.14);border-bottom:1px solid rgba(255,255,255,0.14);padding:14px 0;margin:16px 0;">
        <table style="width:100%;font-size:14px;color:#F5F7F4;">
          <tr><td style="padding:4px 0;color:#94A39B;width:90px;">When</td><td style="padding:4px 0;font-weight:600;">${escapeHtml(dateLine)}<br><span style="color:#C4CDC7;font-weight:400;">${escapeHtml(timeLine)}</span></td></tr>
          ${opts.locationName ? `<tr><td style="padding:4px 0;color:#94A39B;">Where</td><td style="padding:4px 0;">${escapeHtml(opts.locationName)}</td></tr>` : ""}
        </table>
      </div>
      <p style="margin:16px 0 0;color:#94A39B;font-size:12px;line-height:1.6;">
        Need to reschedule? Reply to this email and ${escapeHtml(opts.tenantName)} will help.
      </p>
    </div>
    <p style="margin:20px 0 0;color:#5A6A62;font-size:12px;text-align:center;">
      Powered by KickNScream · Manage notification preferences in your portal.
    </p>
  </div>
</body></html>`;

  const text = `Reminder: ${opts.programName}\n${leadCopy} · ${dateLine}\n${timeLine}${
    opts.locationName ? `\nLocation: ${opts.locationName}` : ""
  }\n\nReply to this email if you need to reschedule.`;

  await resend.emails.send({
    from: env.EMAIL_FROM,
    to: opts.to,
    subject: `${leadCopy} · ${opts.programName} reminder`,
    html,
    text,
  });
}

/**
 * 1:1 direct message email — used by the coach Messages module when sending
 * a reply that should also go out by email (in-app delivery is unconditional;
 * email respects UserPreferences.emailMessages).
 */
export async function sendDirectMessageEmail(opts: {
  to: string;
  recipientName?: string | null;
  senderName: string;
  tenantName: string;
  tenantSlug: string;
  subject: string;
  bodyText: string;
  replyUrl: string;
}) {
  const resend = new Resend(env.AUTH_RESEND_KEY);
  const greetingName = opts.recipientName ? opts.recipientName.split(" ")[0] : null;
  const bodyHtml = opts.bodyText
    .split(/\n{2,}/)
    .map((p) => `<p style="margin:8px 0;">${escapeHtml(p).replace(/\n/g, "<br>")}</p>`)
    .join("");

  const html = `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"><title>${escapeHtml(opts.subject)}</title></head>
<body style="margin:0;padding:0;background:#050A07;font-family:-apple-system,system-ui,sans-serif;color:#F5F7F4;">
  <div style="max-width:560px;margin:0 auto;padding:32px 24px;">
    <div style="margin-bottom:24px;">
      <span style="font-size:18px;font-weight:800;letter-spacing:-0.04em;color:#F5F7F4;">${escapeHtml(opts.tenantName)}</span>
    </div>
    <div style="background:#0F1C17;border:1px solid rgba(255,255,255,0.14);border-radius:12px;padding:32px;">
      <p style="margin:0 0 8px;color:#94A39B;font-size:12px;text-transform:uppercase;letter-spacing:0.12em;">Message from ${escapeHtml(opts.senderName)}</p>
      <h1 style="margin:0 0 16px;font-size:20px;font-weight:700;letter-spacing:-0.02em;color:#F5F7F4;">${escapeHtml(opts.subject)}</h1>
      ${greetingName ? `<p style="margin:0 0 12px;color:#C4CDC7;">Hi ${escapeHtml(greetingName)},</p>` : ""}
      <div style="color:#C4CDC7;font-size:15px;line-height:1.7;">${bodyHtml}</div>
      <div style="margin:24px 0 0;border-top:1px solid rgba(255,255,255,0.14);padding-top:16px;">
        <a href="${escapeHtml(opts.replyUrl)}" style="display:inline-block;background:#1FB663;color:#0A1410;text-decoration:none;font-weight:600;font-size:14px;padding:10px 16px;border-radius:8px;">Reply in app</a>
      </div>
    </div>
    <p style="margin:20px 0 0;color:#5A6A62;font-size:11px;text-align:center;">
      Sent via KickNScream · Reply to this email to respond directly.
    </p>
  </div>
</body></html>`;

  await resend.emails.send({
    from: env.EMAIL_FROM,
    to: opts.to,
    subject: opts.subject,
    html,
    text: `${opts.senderName} (${opts.tenantName}):\n\n${opts.bodyText}\n\nReply: ${opts.replyUrl}`,
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

export async function sendRefundConfirmation(opts: {
  to: string;
  parentName: string;
  tenantName: string;
  tenantSlug: string;
  programName: string | null;
  amountCents: number;
  fullRefund: boolean;
  reason: string | null;
}) {
  const resend = new Resend(env.AUTH_RESEND_KEY);
  const amountLabel = formatCents(opts.amountCents);
  const reasonLine = opts.reason
    ? `<p style="margin:0 0 12px;color:#94A39B;font-size:13px;">Reason on record: <span style="color:#C4CDC7;">${escapeHtml(opts.reason)}</span></p>`
    : "";
  const html = `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"><title>Refund issued</title></head>
<body style="margin:0;padding:0;background:#050A07;font-family:-apple-system,system-ui,sans-serif;color:#F5F7F4;">
  <div style="max-width:560px;margin:0 auto;padding:32px 24px;">
    <div style="margin-bottom:32px;">
      <span style="font-size:22px;font-weight:800;letter-spacing:-0.04em;color:#F5F7F4;">KICK<span style="color:#1FB663;">N</span>SCREAM</span>
      <span style="display:inline-block;width:6px;height:6px;border-radius:50%;background:#E8FF3C;margin-left:6px;vertical-align:middle;"></span>
    </div>
    <div style="background:#0F1C17;border:1px solid rgba(255,255,255,0.14);border-radius:12px;padding:32px;">
      <p style="margin:0 0 8px;color:#94A39B;font-size:12px;text-transform:uppercase;letter-spacing:0.12em;">Refund issued</p>
      <h1 style="margin:0 0 16px;font-size:24px;font-weight:700;letter-spacing:-0.02em;color:#F5F7F4;">${amountLabel} refunded</h1>
      <p style="margin:0 0 12px;color:#C4CDC7;line-height:1.6;">Hi ${escapeHtml(opts.parentName.split(" ")[0])},</p>
      <p style="margin:0 0 16px;color:#C4CDC7;line-height:1.6;">
        ${escapeHtml(opts.tenantName)} just refunded ${amountLabel}${opts.programName ? ` from ${escapeHtml(opts.programName)}` : ""}.
        ${opts.fullRefund ? "The invoice is voided in full." : "This is a partial refund — the rest of the invoice stays paid."}
      </p>
      <p style="margin:0 0 12px;color:#C4CDC7;line-height:1.6;font-size:13px;">
        The money is on its way back to the card or account you originally paid with.
        Most banks show it in 5–10 business days; some show it the next day.
      </p>
      ${reasonLine}
      <p style="margin:16px 0 0;color:#94A39B;font-size:12px;line-height:1.6;">
        Questions about the refund? Reply to this email and ${escapeHtml(opts.tenantName)} will help.
      </p>
    </div>
    <p style="margin:20px 0 0;color:#5A6A62;font-size:12px;text-align:center;">Powered by KickNScream</p>
  </div>
</body></html>`;

  const text = `${opts.tenantName} refunded ${amountLabel}${opts.programName ? ` from ${opts.programName}` : ""}.\n${
    opts.fullRefund ? "The invoice is voided in full." : "Partial refund — the rest of the invoice stays paid."
  }\nMost banks show it in 5–10 business days.\n${opts.reason ? `Reason on record: ${opts.reason}` : ""}`;

  await resend.emails.send({
    from: env.EMAIL_FROM,
    to: opts.to,
    subject: `Refund issued · ${opts.tenantName}`,
    html,
    text,
  });
}

export async function sendPackCompletedEmail(opts: {
  to: string;
  parentName: string;
  tenantName: string;
  tenantSlug: string;
  programName: string;
  programId: string;
  packSize: number;
}) {
  const resend = new Resend(env.AUTH_RESEND_KEY);
  const bookHref = `${env.NEXTAUTH_URL}/${opts.tenantSlug}/book/${opts.programId}`;
  const html = `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"><title>Your pack is finished</title></head>
<body style="margin:0;padding:0;background:#050A07;font-family:-apple-system,system-ui,sans-serif;color:#F5F7F4;">
  <div style="max-width:560px;margin:0 auto;padding:32px 24px;">
    <div style="margin-bottom:32px;">
      <span style="font-size:22px;font-weight:800;letter-spacing:-0.04em;color:#F5F7F4;">KICK<span style="color:#1FB663;">N</span>SCREAM</span>
      <span style="display:inline-block;width:6px;height:6px;border-radius:50%;background:#E8FF3C;margin-left:6px;vertical-align:middle;"></span>
    </div>
    <div style="background:#0F1C17;border:1px solid rgba(255,255,255,0.14);border-radius:12px;padding:32px;">
      <p style="margin:0 0 8px;color:#94A39B;font-size:12px;text-transform:uppercase;letter-spacing:0.12em;">All ${opts.packSize} sessions used</p>
      <h1 style="margin:0 0 16px;font-size:24px;font-weight:700;letter-spacing:-0.02em;color:#F5F7F4;">${escapeHtml(opts.programName)}</h1>
      <p style="margin:0 0 12px;color:#C4CDC7;line-height:1.6;">Hi ${escapeHtml(opts.parentName.split(" ")[0])},</p>
      <p style="margin:0 0 16px;color:#C4CDC7;line-height:1.6;">
        You've used the last session in your ${opts.packSize}-pack with ${escapeHtml(opts.tenantName)}.
        Nice work showing up — that's the whole game.
      </p>
      <p style="margin:16px 0 0;">
        <a href="${escapeHtml(bookHref)}" style="display:inline-block;background:#1FB663;color:#050A07;text-decoration:none;padding:10px 18px;border-radius:8px;font-weight:600;">
          Buy another pack →
        </a>
      </p>
    </div>
    <p style="margin:20px 0 0;color:#5A6A62;font-size:12px;text-align:center;">Powered by KickNScream</p>
  </div>
</body></html>`;

  const text = `You've used the last session in your ${opts.packSize}-pack of ${opts.programName} with ${opts.tenantName}.\nBuy another: ${bookHref}`;

  await resend.emails.send({
    from: env.EMAIL_FROM,
    to: opts.to,
    subject: `Your ${opts.programName} pack is finished`,
    html,
    text,
  });
}

export async function sendResumeBookingEmail(opts: {
  to: string;
  parentName: string;
  tenantName: string;
  tenantSlug: string;
  programName: string;
  startsAt: Date;
  resumeUrl: string;
}) {
  const resend = new Resend(env.AUTH_RESEND_KEY);
  const dateLine = format(opts.startsAt, "EEEE, MMMM d · h:mm a");
  const html = `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"><title>Pick up where you left off</title></head>
<body style="margin:0;padding:0;background:#050A07;font-family:-apple-system,system-ui,sans-serif;color:#F5F7F4;">
  <div style="max-width:560px;margin:0 auto;padding:32px 24px;">
    <div style="margin-bottom:32px;">
      <span style="font-size:22px;font-weight:800;letter-spacing:-0.04em;color:#F5F7F4;">KICK<span style="color:#1FB663;">N</span>SCREAM</span>
      <span style="display:inline-block;width:6px;height:6px;border-radius:50%;background:#E8FF3C;margin-left:6px;vertical-align:middle;"></span>
    </div>
    <div style="background:#0F1C17;border:1px solid rgba(255,255,255,0.14);border-radius:12px;padding:32px;">
      <p style="margin:0 0 8px;color:#94A39B;font-size:12px;text-transform:uppercase;letter-spacing:0.12em;">Booking draft saved</p>
      <h1 style="margin:0 0 16px;font-size:24px;font-weight:700;letter-spacing:-0.02em;color:#F5F7F4;">Pick up where you left off</h1>
      <p style="margin:0 0 12px;color:#C4CDC7;line-height:1.6;">Hi ${escapeHtml(opts.parentName.split(" ")[0])},</p>
      <p style="margin:0 0 16px;color:#C4CDC7;line-height:1.6;">
        You started booking <strong style="color:#F5F7F4;">${escapeHtml(opts.programName)}</strong>
        with ${escapeHtml(opts.tenantName)} for <strong style="color:#F5F7F4;">${escapeHtml(dateLine)}</strong>.
        Click below to finish — the slot is held for the next 15 minutes.
      </p>
      <p style="margin:16px 0 0;">
        <a href="${escapeHtml(opts.resumeUrl)}" style="display:inline-block;background:#1FB663;color:#050A07;text-decoration:none;padding:10px 18px;border-radius:8px;font-weight:600;">
          Finish booking →
        </a>
      </p>
    </div>
    <p style="margin:20px 0 0;color:#5A6A62;font-size:12px;text-align:center;">Powered by KickNScream</p>
  </div>
</body></html>`;
  const text = `Pick up where you left off booking ${opts.programName} with ${opts.tenantName} for ${dateLine}.\n${opts.resumeUrl}\n\nThe slot is held for 15 minutes.`;
  await resend.emails.send({
    from: env.EMAIL_FROM,
    to: opts.to,
    subject: `Pick up where you left off · ${opts.tenantName}`,
    html,
    text,
  });
}

type DigestKid = {
  firstName: string;
  lastName: string;
  attendedThisWeek: number;
  totalThisWeek: number;
  packBalance: number | null;
  packSize: number | null;
  notes: Array<{ content: string; eventTitle: string; createdAt: Date }>;
  nextSession: { title: string; startsAt: Date } | null;
};

export async function sendFamilyDigestEmail(opts: {
  to: string;
  parentName: string;
  tenantName: string;
  tenantSlug: string;
  kids: DigestKid[];
}) {
  const resend = new Resend(env.AUTH_RESEND_KEY);
  const kidBlocks = opts.kids
    .map(
      (k) => `
    <div style="background:#0F1C17;border:1px solid rgba(255,255,255,0.14);border-radius:12px;padding:20px;margin-bottom:12px;">
      <h2 style="margin:0 0 12px;font-size:18px;font-weight:700;letter-spacing:-0.02em;color:#F5F7F4;">${escapeHtml(k.firstName)} ${escapeHtml(k.lastName)}</h2>
      ${
        k.totalThisWeek > 0
          ? `<p style="margin:0 0 8px;color:#C4CDC7;font-size:14px;">📅 ${k.attendedThisWeek} of ${k.totalThisWeek} sessions this week</p>`
          : ""
      }
      ${
        k.packBalance !== null && k.packSize !== null
          ? `<p style="margin:0 0 8px;color:#C4CDC7;font-size:14px;">🎟️ ${k.packBalance} of ${k.packSize} sessions left in pack</p>`
          : ""
      }
      ${
        k.nextSession
          ? `<p style="margin:0 0 8px;color:#C4CDC7;font-size:14px;">⏭️ Next: ${escapeHtml(k.nextSession.title)} · ${format(k.nextSession.startsAt, "EEE, MMM d · h:mm a")}</p>`
          : ""
      }
      ${
        k.notes.length > 0
          ? `<div style="border-top:1px solid rgba(255,255,255,0.08);margin-top:12px;padding-top:12px;">
              <p style="margin:0 0 8px;color:#94A39B;font-size:11px;text-transform:uppercase;letter-spacing:0.12em;">Coach notes</p>
              ${k.notes
                .slice(0, 3)
                .map(
                  (n) => `<p style="margin:0 0 8px;color:#C4CDC7;font-size:14px;line-height:1.5;"><em style="color:#94A39B;">${escapeHtml(n.eventTitle)}:</em> ${escapeHtml(n.content.slice(0, 200))}${n.content.length > 200 ? "…" : ""}</p>`
                )
                .join("")}
            </div>`
          : ""
      }
    </div>
  `
    )
    .join("");

  const html = `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"><title>This week with ${escapeHtml(opts.tenantName)}</title></head>
<body style="margin:0;padding:0;background:#050A07;font-family:-apple-system,system-ui,sans-serif;color:#F5F7F4;">
  <div style="max-width:560px;margin:0 auto;padding:32px 24px;">
    <div style="margin-bottom:32px;">
      <span style="font-size:22px;font-weight:800;letter-spacing:-0.04em;color:#F5F7F4;">KICK<span style="color:#1FB663;">N</span>SCREAM</span>
      <span style="display:inline-block;width:6px;height:6px;border-radius:50%;background:#E8FF3C;margin-left:6px;vertical-align:middle;"></span>
    </div>
    <p style="margin:0 0 16px;color:#94A39B;font-size:12px;text-transform:uppercase;letter-spacing:0.12em;">Week recap · ${escapeHtml(opts.tenantName)}</p>
    <h1 style="margin:0 0 16px;font-size:28px;font-weight:700;letter-spacing:-0.03em;color:#F5F7F4;">Hi ${escapeHtml(opts.parentName.split(" ")[0])} 👋</h1>
    ${kidBlocks}
    <p style="margin:20px 0 0;color:#5A6A62;font-size:12px;text-align:center;">
      Powered by KickNScream · <a href="${env.NEXTAUTH_URL}/account/notifications" style="color:#5A6A62;">manage email settings</a>
    </p>
  </div>
</body></html>`;
  const text = `This week with ${opts.tenantName}\n\n${opts.kids
    .map(
      (k) =>
        `${k.firstName}: ${k.attendedThisWeek}/${k.totalThisWeek} sessions${
          k.packBalance !== null ? `, ${k.packBalance}/${k.packSize} left in pack` : ""
        }${k.notes.length ? `\n  Notes: ${k.notes.map((n) => n.content.slice(0, 80)).join("; ")}` : ""}`
    )
    .join("\n\n")}`;

  await resend.emails.send({
    from: env.EMAIL_FROM,
    to: opts.to,
    subject: `This week with ${opts.tenantName}`,
    html,
    text,
  });
}
