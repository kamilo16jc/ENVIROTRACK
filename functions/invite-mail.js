// ═══════════════════════════════════════════════════════════════
// EnviroTrack — the invite e-mail (new account → create your password)
// Table layout with inline styles: what Outlook and Gmail render the same.
// The two logos travel inside the message (cid: attachments) so they show
// even when the mail program blocks pictures from the internet.
// ═══════════════════════════════════════════════════════════════
const path = require("path");

const C = {
  page: "#eef1ef", card: "#ffffff", ink: "#1d2b23", text: "#3d4a42", muted: "#6b7770",
  line: "#dfe5e1", brand: "#2f5d46", brandDark: "#233f31", tint: "#f4f8f5", teal: "#0f5f63",
};
const ROLE_TEXT = {
  Inspector: "Inspector — collects and records environmental samples.",
  Manager: "QC Manager — reviews results, retests and corrective actions.",
  Administrator: "Administrator — manages users and the program settings.",
};
const esc = (t) => String(t == null ? "" : t).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

// logos: { envirotrack, caputo } — image sources (cid:… for the real e-mail, data: for a preview).
function inviteMail({ name, email, role, link, until, logos }) {
  const hello = name ? "Hello " + esc(String(name).split(/\s+/)[0]) + "," : "Hello,";
  const roleLine = ROLE_TEXT[role] || ROLE_TEXT.Inspector;
  const step = (n, title, text) => `
          <tr>
            <td width="34" valign="top" style="padding:0 0 14px 0">
              <div style="width:24px;height:24px;line-height:24px;border-radius:12px;background:${C.brand};color:#fff;font:700 12px/24px Segoe UI,Arial,sans-serif;text-align:center">${n}</div>
            </td>
            <td valign="top" style="padding:2px 0 14px 0;font:14px/1.5 Segoe UI,Arial,sans-serif;color:${C.text}">
              <b style="color:${C.ink}">${title}</b><br>${text}
            </td>
          </tr>`;
  const html = `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light"><meta name="supported-color-schemes" content="light">
<title>Your EnviroTrack account</title></head>
<body style="margin:0;padding:0;background:${C.page};-webkit-text-size-adjust:100%">
<div style="display:none;max-height:0;overflow:hidden;opacity:0">An EnviroTrack account was created for you. Create your password — the link works once.</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${C.page}">
  <tr><td align="center" style="padding:28px 12px">
    <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:600px">

      <!-- header: logos -->
      <tr><td style="background:${C.card};border-radius:12px 12px 0 0;border:1px solid ${C.line};border-bottom:0;padding:22px 32px">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
          <td align="left" valign="middle"><img src="${logos.envirotrack}" width="143" height="44" alt="EnviroTrack" style="display:block;border:0;outline:none"></td>
          <td align="right" valign="middle"><img src="${logos.caputo}" width="91" height="40" alt="Caputo Foods" style="display:block;border:0;outline:none;margin-left:auto"></td>
        </tr></table>
      </td></tr>
      <tr><td style="height:4px;line-height:4px;font-size:0;background:${C.brand}">&nbsp;</td></tr>

      <!-- body -->
      <tr><td style="background:${C.card};border:1px solid ${C.line};border-top:0;border-bottom:0;padding:34px 32px 8px 32px">
        <div style="font:600 11px/1 Segoe UI,Arial,sans-serif;letter-spacing:1.6px;text-transform:uppercase;color:${C.brand};margin:0 0 10px">Environmental Monitoring Program</div>
        <h1 style="margin:0 0 18px;font:700 24px/1.25 Segoe UI,Arial,sans-serif;color:${C.ink}">Welcome to EnviroTrack</h1>
        <p style="margin:0 0 16px;font:15px/1.6 Segoe UI,Arial,sans-serif;color:${C.text}">${hello}</p>
        <p style="margin:0 0 22px;font:15px/1.6 Segoe UI,Arial,sans-serif;color:${C.text}">An administrator created your EnviroTrack account. To start, create your own password with the button below.</p>

        <!-- account box -->
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${C.tint};border:1px solid ${C.line};border-radius:8px">
          <tr><td style="padding:12px 18px">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="font:13px/1.6 Segoe UI,Arial,sans-serif">
              <tr><td width="72" valign="top" style="color:${C.muted};padding:2px 0">Account</td><td valign="top" style="color:${C.ink};font-weight:700;padding:2px 0;word-break:break-all">${esc(email)}</td></tr>
              <tr><td width="72" valign="top" style="color:${C.muted};padding:2px 0">Role</td><td valign="top" style="color:${C.ink};padding:2px 0">${esc(roleLine)}</td></tr>
            </table>
          </td></tr>
        </table>

        <!-- button -->
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:26px 0 10px">
          <tr><td align="center" bgcolor="${C.brand}" style="border-radius:8px">
            <a href="${esc(link)}" target="_blank" style="display:inline-block;padding:14px 30px;font:600 15px/1 Segoe UI,Arial,sans-serif;color:#ffffff;text-decoration:none;border-radius:8px;background:${C.brand}">Create my password</a>
          </td></tr>
        </table>
        <p style="margin:0 0 28px;font:12px/1.6 Segoe UI,Arial,sans-serif;color:${C.muted}">The link works once and expires ${esc(until)} (Central time).<br>If the button does not work, copy this address into your browser:<br><span style="color:${C.teal};word-break:break-all">${esc(link)}</span></p>

        <!-- next steps -->
        <div style="border-top:1px solid ${C.line};padding-top:22px;margin-bottom:6px;font:600 13px/1 Segoe UI,Arial,sans-serif;color:${C.ink}">What happens next</div>
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top:12px">${
          step(1, "Create your password", "At least 8 characters, with letters and numbers.") +
          step(2, "Sign in to EnviroTrack", "With your work e-mail and the new password.") +
          step(3, "Set up two-step verification", "Scan the QR code with an authenticator app on your phone (Apple Passwords, Microsoft Authenticator or Google Authenticator). From then on, EnviroTrack asks for the 6-digit code after your password.")
        }</table>
      </td></tr>

      <!-- security note -->
      <tr><td style="background:${C.card};border:1px solid ${C.line};border-top:0;border-radius:0 0 12px 12px;padding:6px 32px 28px 32px">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-left:3px solid ${C.brand};background:${C.tint}">
          <tr><td style="padding:12px 16px;font:12px/1.6 Segoe UI,Arial,sans-serif;color:${C.text}">
            <b style="color:${C.ink}">Keep your account safe.</b> EnviroTrack will never ask for your password or your code by e-mail or phone. If you did not expect this message, ignore it and tell your supervisor.
          </td></tr>
        </table>
      </td></tr>

      <!-- footer -->
      <tr><td align="center" style="padding:20px 24px 6px;font:12px/1.6 Segoe UI,Arial,sans-serif;color:${C.muted}">
        <b style="color:${C.text}">Caputo Foods</b> · Environmental Monitoring · EnviroTrack
      </td></tr>
      <tr><td align="center" style="padding:0 24px 10px;font:11px/1.6 Segoe UI,Arial,sans-serif;color:#8a958e">
        Sent by EnviroTrack Support because an administrator created an account for ${esc(email)}.
      </td></tr>
    </table>
  </td></tr>
</table>
</body></html>`;

  const text = (name ? "Hello " + String(name).split(/\s+/)[0] + "," : "Hello,") + "\n\n" +
    "An administrator created your EnviroTrack account (" + email + ").\nRole: " + roleLine + "\n\n" +
    "Create your password here (the link works once and expires " + until + ", Central time):\n" + link + "\n\n" +
    "What happens next:\n1. Create your password (at least 8 characters, with letters and numbers).\n" +
    "2. Sign in to EnviroTrack with your work e-mail and the new password.\n" +
    "3. Set up two-step verification: scan the QR code with an authenticator app on your phone.\n\n" +
    "EnviroTrack will never ask for your password or your code by e-mail or phone.\n" +
    "If you did not expect this message, ignore it and tell your supervisor.\n\n— Caputo Foods · EnviroTrack";
  return { subject: "Your EnviroTrack account", html, text };
}

// The logo files sent inside the message.
const LOGO_FILES = {
  envirotrack: path.join(__dirname, "mail", "envirotrack-logo.png"),
  caputo: path.join(__dirname, "mail", "caputo-logo.png"),
};

module.exports = { inviteMail, LOGO_FILES };
