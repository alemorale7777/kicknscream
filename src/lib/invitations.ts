import { randomBytes } from "node:crypto";
import { Resend } from "resend";
import { env } from "./env";

export function generateInvitationToken(): string {
  return randomBytes(32).toString("base64url");
}

export function getInvitationUrl(token: string): string {
  return `${env.NEXTAUTH_URL}/invite/${token}`;
}

export async function sendInvitationEmail(opts: {
  to: string;
  tenantName: string;
  tenantSlug: string;
  inviterName: string;
  role: string;
  acceptUrl: string;
}) {
  const resend = new Resend(env.AUTH_RESEND_KEY);

  const roleLabel = opts.role.charAt(0) + opts.role.slice(1).toLowerCase();

  const html = `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"><title>${opts.tenantName} invited you to KickNScream</title></head>
<body style="margin:0;padding:0;background:#050A07;font-family:-apple-system,system-ui,sans-serif;color:#F5F7F4;">
  <div style="max-width:560px;margin:0 auto;padding:32px 24px;">
    <div style="margin-bottom:32px;">
      <span style="font-size:22px;font-weight:800;letter-spacing:-0.04em;color:#F5F7F4;">KICK<span style="color:#1FB663;">N</span>SCREAM</span>
      <span style="display:inline-block;width:6px;height:6px;border-radius:50%;background:#E8FF3C;margin-left:6px;vertical-align:middle;"></span>
    </div>

    <div style="background:#0F1C17;border:1px solid rgba(255,255,255,0.14);border-radius:12px;padding:32px;">
      <p style="margin:0 0 8px;color:#94A39B;font-size:12px;text-transform:uppercase;letter-spacing:0.12em;">You're invited</p>
      <h1 style="margin:0 0 16px;font-size:24px;font-weight:700;letter-spacing:-0.02em;color:#F5F7F4;">Join ${opts.tenantName}</h1>
      <p style="margin:0 0 24px;color:#C4CDC7;line-height:1.6;">
        ${escapeHtml(opts.inviterName)} invited you to join <strong style="color:#F5F7F4;">${escapeHtml(opts.tenantName)}</strong> on KickNScream as
        <span style="display:inline-block;border:1px solid rgba(31,182,99,0.4);background:rgba(31,182,99,0.1);color:#4DDF8A;border-radius:9999px;padding:2px 10px;font-size:11px;font-weight:600;letter-spacing:0.08em;text-transform:uppercase;">${escapeHtml(roleLabel)}</span>.
      </p>

      <a href="${opts.acceptUrl}" style="display:inline-block;padding:14px 28px;background:#E8FF3C;color:#050A07;text-decoration:none;border-radius:8px;font-weight:700;letter-spacing:-0.01em;font-size:15px;">Accept invitation →</a>

      <p style="margin:24px 0 0;color:#5A6A62;font-size:12px;line-height:1.6;">
        Or copy and paste this link into your browser:<br>
        <span style="color:#94A39B;word-break:break-all;font-family:ui-monospace,monospace;">${opts.acceptUrl}</span>
      </p>
    </div>

    <p style="margin:24px 0 0;color:#5A6A62;font-size:12px;line-height:1.6;text-align:center;">
      Didn't expect this email? You can ignore it — your account stays unchanged.
    </p>
  </div>
</body></html>`;

  await resend.emails.send({
    from: env.EMAIL_FROM,
    to: opts.to,
    subject: `${opts.inviterName} invited you to ${opts.tenantName} on KickNScream`,
    html,
    text: `${opts.inviterName} invited you to join ${opts.tenantName} on KickNScream as ${roleLabel}.\n\nAccept here: ${opts.acceptUrl}\n\nIf you weren't expecting this, just ignore the email.`,
  });
}

function escapeHtml(s: string) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
