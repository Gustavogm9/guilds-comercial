type EmailAddress = {
  email: string;
  name?: string;
};

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

export function getAppUrl() {
  if (process.env.NEXT_PUBLIC_APP_URL) return process.env.NEXT_PUBLIC_APP_URL.replace(/\/$/, "");
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return "http://localhost:3000";
}

export async function sendTransactionalEmail(input: {
  to: EmailAddress[];
  subject: string;
  htmlContent: string;
}) {
  const apiKey = process.env.BREVO_API_KEY;
  if (!apiKey) return { sent: false, skipped: true };

  const senderEmail = process.env.FROM_EMAIL ?? "hello@guilds.com.br";
  const senderName = process.env.FROM_NAME ?? "Equipe Guilds";

  const res = await fetch("https://api.brevo.com/v3/smtp/email", {
    method: "POST",
    headers: {
      accept: "application/json",
      "api-key": apiKey,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      sender: { name: senderName, email: senderEmail },
      to: input.to,
      subject: input.subject,
      htmlContent: input.htmlContent,
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Brevo retornou ${res.status}: ${body}`);
  }

  return { sent: true, skipped: false };
}

export async function sendInviteEmail(input: {
  email: string;
  orgName: string;
  inviterName: string;
  inviteUrl: string;
  role: string;
}) {
  const orgName = escapeHtml(input.orgName);
  const inviterName = escapeHtml(input.inviterName);
  const inviteUrl = escapeHtml(input.inviteUrl);
  const role = escapeHtml(input.role);

  return sendTransactionalEmail({
    to: [{ email: input.email }],
    subject: `${input.inviterName} convidou voce para o Guilds Comercial`,
    htmlContent: `
      <p>Ola,</p>
      <p><strong>${inviterName}</strong> convidou voce para entrar na operacao comercial da <strong>${orgName}</strong> como <strong>${role}</strong>.</p>
      <p><a href="${inviteUrl}" style="display:inline-block;padding:12px 18px;border-radius:8px;background:#2563eb;color:#fff;text-decoration:none;font-weight:600">Aceitar convite</a></p>
      <p>Se o botao nao funcionar, copie este link no navegador:<br><a href="${inviteUrl}">${inviteUrl}</a></p>
      <p>Equipe Guilds</p>
    `,
  });
}

export async function sendWelcomeEmail(input: { email: string; name: string; orgName: string }) {
  const name = escapeHtml(input.name);
  const orgName = escapeHtml(input.orgName);
  const appUrl = escapeHtml(getAppUrl());

  return sendTransactionalEmail({
    to: [{ email: input.email, name: input.name }],
    subject: "Bem-vindo ao Guilds Comercial",
    htmlContent: `
      <p>Ola ${name},</p>
      <p>Sua conta da <strong>${orgName}</strong> foi criada com sucesso.</p>
      <p>O proximo passo e adicionar seus leads, convidar o time e testar a automacao do funil com IA.</p>
      <p><a href="${appUrl}/hoje">Acessar o Guilds Comercial</a></p>
      <p>Equipe Guilds</p>
    `,
  });
}
