import { ImageResponse } from "next/og";

/**
 * Ícone PWA gerado em runtime — placeholder com "G" do logo Guilds.
 * Para substituir por PNG real, apague este arquivo e coloque
 * `app/icon.png` (256x256). O Next pega automaticamente.
 *
 * Cor primary: #4c5ee4 (hsl(233 72% 43%) — bate com --primary do tema light).
 */
export const runtime = "edge";
export const size = { width: 256, height: 256 };
export const contentType = "image/png";

export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          fontSize: 160,
          background: "linear-gradient(135deg, #4c5ee4 0%, #5a6cf6 100%)",
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: "white",
          fontWeight: 800,
          fontFamily: "system-ui, sans-serif",
          letterSpacing: -8,
          boxShadow: "inset 0 4px 0 rgba(255,255,255,0.18), inset 0 -4px 0 rgba(0,0,0,0.10)",
          borderRadius: 48,
        }}
      >
        G
      </div>
    ),
    size
  );
}
