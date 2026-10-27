import { randomUUID } from "node:crypto";
export function deliveryService(db, secretVault) {
  const ready = (channel) =>
    channel === "email"
      ? !!(
          process.env.CRM_MAIL_GATEWAY_URL &&
          process.env.CRM_MAIL_GATEWAY_TOKEN &&
          process.env.CRM_MAIL_FROM
        )
      : channel === "whatsapp"
        ? !!(
            process.env.CRM_WHATSAPP_GATEWAY_URL &&
            process.env.CRM_WHATSAPP_GATEWAY_TOKEN
          )
        : false;
  function queue({ workspace, channel = "email", to, subject, body, dedupe }) {
    if (dedupe) {
      const existing = db
        .prepare("SELECT id,status FROM outbox WHERE workspace=? AND dedupe=?")
        .get(workspace, dedupe);
      if (existing) return existing;
    }
    if (!to || String(to).length > 250)
      throw Error("Choose a delivery recipient.");
    if (channel === "email" && !/^\S+@\S+\.\S+$/.test(to))
      throw Error("Enter a valid email recipient.");
    if (channel === "whatsapp" && !/^\+\d{10,15}$/.test(to))
      throw Error("Use an international WhatsApp number.");
    const id = randomUUID(),
      status = ready(channel) ? "queued" : "blocked";
    const encrypted = secretVault.seal(JSON.stringify(body));
    db.prepare(
      "INSERT OR IGNORE INTO outbox(id,workspace,channel,recipient,subject,encrypted_body,status,created,dedupe) VALUES(?,?,?,?,?,?,?,?,?)",
    ).run(
      id,
      workspace,
      channel,
      to,
      String(subject).slice(0, 200),
      encrypted,
      status,
      new Date().toISOString(),
      dedupe || id,
    );
    return { id, status };
  }
  async function send(id, workspace) {
    const row = db
      .prepare("SELECT * FROM outbox WHERE id=? AND workspace=?")
      .get(id, workspace);
    if (!row) throw Error("Message not found.");
    if (row.status === "sent") return { status: "sent" };
    if (row.status === "sending")
      throw Error("Message already being processed.");
    if (!ready(row.channel))
      return {
        status: "blocked",
        reason: "Delivery provider is not configured.",
      };
    const endpoint =
        process.env[
          row.channel === "email"
            ? "CRM_MAIL_GATEWAY_URL"
            : "CRM_WHATSAPP_GATEWAY_URL"
        ],
      token =
        process.env[
          row.channel === "email"
            ? "CRM_MAIL_GATEWAY_TOKEN"
            : "CRM_WHATSAPP_GATEWAY_TOKEN"
        ];
    const url = new URL(endpoint);
    if (
      url.protocol !== "https:" &&
      !(
        process.env.CRM_ALLOW_LOCAL_GATEWAY === "true" &&
        ["127.0.0.1", "localhost"].includes(url.hostname)
      )
    )
      throw Error("Delivery gateways must use HTTPS.");
    db.prepare(
      "UPDATE outbox SET status='sending',attempts=attempts+1,last_error=NULL WHERE id=?",
    ).run(id);
    try {
      const response = await fetch(endpoint, {
        method: "POST",
        redirect: "error",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
          "Idempotency-Key": row.id,
        },
        body: JSON.stringify({
          from: process.env.CRM_MAIL_FROM,
          to: row.recipient,
          subject: row.subject,
          ...JSON.parse(secretVault.open(row.encrypted_body).toString()),
        }),
        signal: AbortSignal.timeout(15000),
      });
      if (!response.ok)
        throw Error("Provider rejected delivery (" + response.status + ").");
      db.prepare("UPDATE outbox SET status='sent',sent=? WHERE id=?").run(
        new Date().toISOString(),
        id,
      );
      return { status: "sent" };
    } catch {
      db.prepare(
        "UPDATE outbox SET status='failed',last_error='Delivery failed; verify provider receipt before retrying.' WHERE id=?",
      ).run(id);
      return { status: "failed" };
    }
  }
  return { ready, queue, send };
}
