import "server-only";
import { appendFile, mkdir } from "node:fs/promises";
import path from "node:path";
import nodemailer, { type Transporter } from "nodemailer";
import { env } from "@/env";

let transport: Transporter | null = null;

const escapeHtml = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

export async function sendMail(to: string, subject: string, text: string, link?: { url: string; label: string }) {
  const sink = env.MAIL_SINK ?? (env.RESEND_API_KEY ? "resend" : env.SMTP_URL ? "smtp" : "console");
  const body = link ? `${text}\n\n${link.label}: ${link.url}` : text;

  if (sink === "file") {
    const mailFile = env.MAIL_FILE_PATH ?? ".data/mail.log";
    await mkdir(path.dirname(mailFile), { recursive: true });
    await appendFile(mailFile, JSON.stringify({ to, subject, body, url: link?.url, at: new Date().toISOString() }) + "\n");
    return;
  }
  if (sink === "console" || (sink === "smtp" && !env.SMTP_URL) || (sink === "resend" && !env.RESEND_API_KEY)) {
    if (env.NODE_ENV === "production") console.warn(`[mail] no RESEND_API_KEY or SMTP_URL configured; email to ${to} not sent`);
    console.info(`[mail] to=${to} subject="${subject}"\n${body}`);
    return;
  }
  const html = `<div style="font-family:system-ui,sans-serif;max-width:520px;margin:auto;padding:24px">
    <h2 style="margin:0 0 12px">${escapeHtml(subject)}</h2>
    <p style="color:#444;line-height:1.5">${escapeHtml(text)}</p>
    ${link ? `<p><a href="${escapeHtml(link.url)}" style="display:inline-block;background:#111;color:#fff;padding:10px 18px;border-radius:8px;text-decoration:none">${escapeHtml(link.label)}</a></p>
    <p style="color:#888;font-size:12px">Or paste this link into your browser:<br>${escapeHtml(link.url)}</p>` : ""}
  </div>`;
  if (sink === "resend") {
    // HTTPS API: works on hosts that block outgoing SMTP (e.g. Railway's Hobby plan).
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: env.MAIL_FROM, to: [to], subject, text: body, html }),
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) throw new Error(`Resend rejected the email (${res.status}): ${(await res.text()).slice(0, 300)}`);
    return;
  }
  transport ??= nodemailer.createTransport(env.SMTP_URL!);
  await transport.sendMail({ from: env.MAIL_FROM, to, subject, text: body, html });
}
