import "server-only";
import { appendFile, mkdir } from "node:fs/promises";
import nodemailer, { type Transporter } from "nodemailer";
import { env } from "@/env";

let transport: Transporter | null = null;

const escapeHtml = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

export async function sendMail(to: string, subject: string, text: string, link?: { url: string; label: string }) {
  const sink = env.MAIL_SINK ?? (env.SMTP_URL ? "smtp" : "console");
  const body = link ? `${text}\n\n${link.label}: ${link.url}` : text;

  if (sink === "file") {
    await mkdir(".data", { recursive: true });
    await appendFile(".data/mail.log", JSON.stringify({ to, subject, body, url: link?.url, at: new Date().toISOString() }) + "\n");
    return;
  }
  if (sink === "console" || !env.SMTP_URL) {
    if (env.NODE_ENV === "production") console.warn(`[mail] SMTP_URL not configured; email to ${to} not sent`);
    console.info(`[mail] to=${to} subject="${subject}"\n${body}`);
    return;
  }
  transport ??= nodemailer.createTransport(env.SMTP_URL);
  const html = `<div style="font-family:system-ui,sans-serif;max-width:520px;margin:auto;padding:24px">
    <h2 style="margin:0 0 12px">${escapeHtml(subject)}</h2>
    <p style="color:#444;line-height:1.5">${escapeHtml(text)}</p>
    ${link ? `<p><a href="${escapeHtml(link.url)}" style="display:inline-block;background:#111;color:#fff;padding:10px 18px;border-radius:8px;text-decoration:none">${escapeHtml(link.label)}</a></p>
    <p style="color:#888;font-size:12px">Or paste this link into your browser:<br>${escapeHtml(link.url)}</p>` : ""}
  </div>`;
  await transport.sendMail({ from: env.MAIL_FROM, to, subject, text: body, html });
}
