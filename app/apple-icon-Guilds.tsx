import { ImageResponse } from "next/og";

/**
 * Apple touch icon — usado por iOS quando o usuário adiciona à tela inicial.
 * iOS exige 180x180 sem cantos arredondados (o sistema já mascara).
 */
export const runtime = "edge";
export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          fontSize: 120,
          background: "linear-gradient(135deg, #4c5ee4 0%, #5a6cf6 100%)",
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: "white",
          fontWeight: 800,
          fontFamily: "system-ui, sans-serif",
          letterSpacing: -6,
        }}
      >
        G
      </div>
    ),
    size
  );
}
