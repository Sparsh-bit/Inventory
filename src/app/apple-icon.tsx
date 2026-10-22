import { ImageResponse } from "next/og";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div style={{ width: 180, height: 180, display: "flex", alignItems: "center", justifyContent: "center", background: "#4a3fd6" }}>
        <svg width={112} height={112} viewBox="6 5 20 22" fill="none" stroke="#fff" strokeWidth={1.8} strokeLinejoin="round">
          <path d="M8 11.5 16 7l8 4.5v9L16 25l-8-4.5z" />
          <path d="M8 11.5 16 16l8-4.5M16 16v9" />
        </svg>
      </div>
    ),
    size,
  );
}
