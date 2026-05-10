/**
 * lib/whatsapp-parser.ts
 *
 * Parser de exportações de conversa do WhatsApp (.txt).
 *
 * Suporta formatos:
 *   Android: [09/05/2025, 14:32:45] João Silva: Mensagem
 *   iOS:     [09/05/2025 14:32:45] João Silva: Mensagem
 *   Novo:    09/05/2025, 14:32 - João Silva: Mensagem
 *
 * Funcionalidades:
 *   - Detecção do nome do vendedor (remetente "Você" / "You" / nome configurado)
 *   - Normalização de timestamps
 *   - Detecção de mídia omitida
 *   - Identificação de mensagens do sistema
 */

export type MensagemParsed = {
  remetente: string;
  eh_vendedor: boolean;
  conteudo: string | null;
  tipo_midia: "imagem" | "audio" | "video" | "documento" | "figurinha" | null;
  enviada_em: Date;
};

export type ResultadoParse = {
  contato_nome: string | null;
  total_msgs: number;
  primeira_msg: Date | null;
  ultima_msg: Date | null;
  mensagens: MensagemParsed[];
  erros: number;
};

// Padrões de timestamp
const PATTERNS = [
  // [09/05/2025, 14:32:45] Nome: texto
  /^\[(\d{1,2}\/\d{1,2}\/\d{2,4}),\s*(\d{1,2}:\d{2}(?::\d{2})?)\]\s*([^:]+?):\s*([\s\S]*)$/,
  // [09/05/2025 14:32:45] Nome: texto (iOS sem vírgula)
  /^\[(\d{1,2}\/\d{1,2}\/\d{2,4})\s+(\d{1,2}:\d{2}(?::\d{2})?)\]\s*([^:]+?):\s*([\s\S]*)$/,
  // 09/05/2025, 14:32 - Nome: texto (formato mais novo)
  /^(\d{1,2}\/\d{1,2}\/\d{2,4}),\s*(\d{1,2}:\d{2}(?::\d{2})?)\s*-\s*([^:]+?):\s*([\s\S]*)$/,
  // 09/05/2025 14:32 - Nome: texto
  /^(\d{1,2}\/\d{1,2}\/\d{2,4})\s+(\d{1,2}:\d{2}(?::\d{2})?)\s*-\s*([^:]+?):\s*([\s\S]*)$/,
];

const MIDIA_PATTERNS: Record<MensagemParsed["tipo_midia"] & string, RegExp> = {
  imagem:    /\.(jpg|jpeg|png|gif|webp)\s*\(arquivo\s*anexado\)|<mídia\s*omitida>|<Media\s*omitted>|image\s*omitted|imagem\s*ocultada/i,
  audio:     /\.(mp3|ogg|opus|m4a)\s*\(arquivo\s*anexado\)|áudio\s*omitido|audio\s*omitted/i,
  video:     /\.(mp4|mov|avi)\s*\(arquivo\s*anexado\)|vídeo\s*omitido|video\s*omitted/i,
  documento: /\.(pdf|docx?|xlsx?|zip)\s*\(arquivo\s*anexado\)|documento\s*omitido/i,
  figurinha: /figurinha\s*omitida|sticker\s*omitted/i,
};

const SYSTEM_MSGS = [
  /mensagens e chamadas neste grupo/i,
  /as mensagens são protegidas/i,
  /this group is now secured/i,
  /messages to this group are now secured/i,
  /adicionou você/i,
  /you were added/i,
  /criou o grupo/i,
  /created group/i,
  /saiu do grupo/i,
  /left the group/i,
];

const VENDEDOR_KEYS = ["você", "you", "me", "eu"];

function parseTimestamp(date: string, time: string): Date | null {
  try {
    const [d, m, y] = date.split("/").map(Number);
    const [h, min, sec] = time.split(":").map(Number);
    const year = y < 100 ? 2000 + y : y;
    const dt = new Date(year, m - 1, d, h, min, sec || 0);
    return isNaN(dt.getTime()) ? null : dt;
  } catch {
    return null;
  }
}

function detectMidia(conteudo: string): MensagemParsed["tipo_midia"] {
  for (const [tipo, re] of Object.entries(MIDIA_PATTERNS)) {
    if (re.test(conteudo)) return tipo as MensagemParsed["tipo_midia"];
  }
  return null;
}

function isSystemMsg(conteudo: string): boolean {
  return SYSTEM_MSGS.some(re => re.test(conteudo));
}

export function parseWhatsappExport(
  texto: string,
  nomeVendedor?: string | null,
): ResultadoParse {
  const linhas = texto.split(/\r?\n/);
  const mensagens: MensagemParsed[] = [];
  let erros = 0;
  let pendente: { match: RegExpMatchArray; linhas: string[] } | null = null;

  const ehVendedor = (nome: string): boolean => {
    const n = nome.trim().toLowerCase();
    if (nomeVendedor && n.includes(nomeVendedor.toLowerCase())) return true;
    return VENDEDOR_KEYS.some(k => n === k);
  };

  function flushPendente() {
    if (!pendente) return;
    const [, dateStr, timeStr, remetente, primLinha] = pendente.match;
    const ts = parseTimestamp(dateStr, timeStr);
    if (!ts) { erros++; pendente = null; return; }

    const conteudoRaw = [primLinha, ...pendente.linhas].join("\n").trim();
    if (isSystemMsg(conteudoRaw)) { pendente = null; return; }

    const midia = detectMidia(conteudoRaw);
    mensagens.push({
      remetente: remetente.trim(),
      eh_vendedor: ehVendedor(remetente),
      conteudo: midia ? null : conteudoRaw || null,
      tipo_midia: midia,
      enviada_em: ts,
    });
    pendente = null;
  }

  for (const linha of linhas) {
    if (!linha.trim()) continue;
    let matched = false;
    for (const pattern of PATTERNS) {
      const m = linha.match(pattern);
      if (m) {
        flushPendente();
        pendente = { match: m, linhas: [] };
        matched = true;
        break;
      }
    }
    if (!matched && pendente) {
      // Continuação de mensagem multiline
      pendente.linhas.push(linha);
    }
  }
  flushPendente();

  // Detecta contato principal (remetente não-vendedor mais frequente)
  const freq = new Map<string, number>();
  for (const m of mensagens) {
    if (!m.eh_vendedor) freq.set(m.remetente, (freq.get(m.remetente) ?? 0) + 1);
  }
  let contatoNome: string | null = null;
  let maxFreq = 0;
  for (const [nome, cnt] of freq.entries()) {
    if (cnt > maxFreq) { maxFreq = cnt; contatoNome = nome; }
  }

  return {
    contato_nome: contatoNome,
    total_msgs: mensagens.length,
    primeira_msg: mensagens[0]?.enviada_em ?? null,
    ultima_msg: mensagens[mensagens.length - 1]?.enviada_em ?? null,
    mensagens,
    erros,
  };
}
