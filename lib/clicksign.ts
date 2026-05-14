type JsonApiRecord = {
  id?: string;
  type?: string;
  attributes?: Record<string, unknown>;
  links?: Record<string, unknown>;
  relationships?: Record<string, unknown>;
};

type JsonApiResponse = {
  data?: JsonApiRecord | JsonApiRecord[];
  errors?: Array<{ title?: string; detail?: string; code?: string }>;
  meta?: Record<string, unknown>;
};

export type ClicksignSignerInput = {
  name: string;
  email: string;
  phoneNumber?: string | null;
  documentation?: string | null;
};

function baseUrl() {
  const explicit = process.env.CLICKSIGN_BASE_URL?.replace(/\/$/, "");
  if (explicit) return explicit;
  return process.env.CLICKSIGN_ENV === "production"
    ? "https://app.clicksign.com/api/v3"
    : "https://sandbox.clicksign.com/api/v3";
}

function accessToken() {
  const token = process.env.CLICKSIGN_ACCESS_TOKEN;
  if (!token) throw new Error("Configure CLICKSIGN_ACCESS_TOKEN para enviar contratos para assinatura.");
  return token;
}

function firstId(response: JsonApiResponse) {
  const data = Array.isArray(response.data) ? response.data[0] : response.data;
  return data?.id ?? null;
}

function firstLinks(response: JsonApiResponse) {
  const data = Array.isArray(response.data) ? response.data[0] : response.data;
  return data?.links ?? {};
}

async function request(path: string, init: RequestInit = {}) {
  const res = await fetch(`${baseUrl()}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${accessToken()}`,
      "Content-Type": "application/vnd.api+json",
      Accept: "application/vnd.api+json",
      ...(init.headers ?? {}),
    },
  });

  const text = await res.text();
  const json = text ? JSON.parse(text) as JsonApiResponse : {};
  if (!res.ok) {
    const detail = json.errors?.map((err) => err.detail || err.title || err.code).filter(Boolean).join("; ");
    throw new Error(`Clicksign ${res.status}: ${detail || text || res.statusText}`);
  }
  return json;
}

export async function createClicksignEnvelope(input: { name: string; deadlineAt?: string | null; locale?: string }) {
  const response = await request("/envelopes", {
    method: "POST",
    body: JSON.stringify({
      data: {
        type: "envelopes",
        attributes: {
          name: input.name,
          locale: input.locale ?? "pt-BR",
          ...(input.deadlineAt ? { deadline_at: input.deadlineAt } : {}),
        },
      },
    }),
  });
  return { id: firstId(response), payload: response };
}

export async function uploadClicksignDocument(input: {
  envelopeId: string;
  filename: string;
  mimeType: string;
  base64: string;
}) {
  const contentBase64 = input.base64.startsWith("data:")
    ? input.base64
    : `data:${input.mimeType};base64,${input.base64}`;
  const response = await request(`/envelopes/${encodeURIComponent(input.envelopeId)}/documents`, {
    method: "POST",
    body: JSON.stringify({
      data: {
        type: "documents",
        attributes: {
          filename: input.filename,
          content_base64: contentBase64,
        },
      },
    }),
  });
  return { id: firstId(response), payload: response };
}

export async function createClicksignSigner(envelopeId: string, signer: ClicksignSignerInput) {
  const response = await request(`/envelopes/${encodeURIComponent(envelopeId)}/signers`, {
    method: "POST",
    body: JSON.stringify({
      data: {
        type: "signers",
        attributes: {
          name: signer.name,
          email: signer.email,
          ...(signer.phoneNumber ? { phone_number: signer.phoneNumber } : {}),
          ...(signer.documentation ? { documentation: signer.documentation } : {}),
        },
      },
    }),
  });
  return { id: firstId(response), links: firstLinks(response), payload: response };
}

export async function activateClicksignEnvelope(envelopeId: string) {
  const response = await request(`/envelopes/${encodeURIComponent(envelopeId)}`, {
    method: "PATCH",
    body: JSON.stringify({
      data: {
        type: "envelopes",
        id: envelopeId,
        attributes: { status: "running" },
      },
    }),
  });
  return { id: firstId(response) ?? envelopeId, payload: response };
}

export async function getClicksignEnvelope(envelopeId: string) {
  return request(`/envelopes/${encodeURIComponent(envelopeId)}`, { method: "GET" });
}
