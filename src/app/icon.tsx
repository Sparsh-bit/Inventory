import { ImageResponse } from "next/og";

export function generateImageMetadata() {
  return [
    { id: "192", size: { width: 192, height: 192 }, contentType: "image/png" },
    { id: "512", size: { width: 512, height: 512 }, contentType: "image/png" },
  ];
}

export default async function Icon({ id }: { id: Promise<string | number> }) {
  const size = Number(await id);
  return new ImageResponse(
    (
      <div style={{ width: size, height: size, display: "flex", alignItems: "center", justifyContent: "center", background: "#4a3fd6", borderRadius: size * 0.22 }}>
        <svg width={size * 0.62} height={size * 0.62} viewBox="6 5 20 22" fill="none" stroke="#fff" strokeWidth={1.8} strokeLinejoin="round">
          <path d="M8 11.5 16 7l8 4.5v9L16 25l-8-4.5z" />
          <path d="M8 11.5 16 16l8-4.5M16 16v9" />
        </svg>
      </div>
    ),
    { width: size, height: size },
  );
}
