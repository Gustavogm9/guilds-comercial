import crypto from "crypto";

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function stripJsonFence(value: string) {
  return value.trim().replace(/^```(?:json|html)?\s*/i, "").replace(/\s*```$/i, "");
}

export function buildContractHtml(input: {
  title: string;
  html?: string | null;
  text?: string | null;
  briefing?: string | null;
}) {
  if (input.html?.trim()) return input.html.trim();
  const body = escapeHtml(stripJsonFence(input.text || input.briefing || "Contrato sem conteudo."))
    .split(/\n{2,}/)
    .map((paragraph) => `<p>${paragraph.replaceAll("\n", "<br />")}</p>`)
    .join("\n");

  return `<!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(input.title)}</title>
  <style>
    body { font-family: Arial, sans-serif; color: #111827; line-height: 1.55; margin: 40px; }
    h1, h2, h3 { color: #0f172a; }
    p { margin: 0 0 12px; }
    table { width: 100%; border-collapse: collapse; }
    td, th { border: 1px solid #d1d5db; padding: 8px; }
  </style>
</head>
<body>
  <article>
    <h1>${escapeHtml(input.title)}</h1>
    ${body}
  </article>
</body>
</html>`;
}

export function htmlToBase64(html: string) {
  return Buffer.from(html, "utf8").toString("base64");
}

export function sha256(value: string) {
  return crypto.createHash("sha256").update(value).digest("hex");
}
