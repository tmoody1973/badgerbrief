import { ImageResponse } from "next/og";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#c5050c",
          border: "10px solid #1c1b1a",
          color: "#fff7ed",
          fontSize: 96,
          fontWeight: 900,
          letterSpacing: -4,
        }}
      >
        BB
      </div>
    ),
    size,
  );
}
