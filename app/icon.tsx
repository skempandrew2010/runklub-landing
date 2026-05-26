import { ImageResponse } from "next/og"

export const size = { width: 512, height: 512 }
export const contentType = "image/png"

export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: 512,
          height: 512,
          background: "#0D0D0D",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 512 512'%3E%3Crect width='512' height='512' fill='%230D0D0D'/%3E%3Cg fill='%23C5F135' stroke='%23C5F135' stroke-linecap='round' stroke-linejoin='round'%3E%3Ccircle cx='272' cy='88' r='52'/%3E%3Cline x1='258' y1='138' x2='245' y2='170' stroke-width='28'/%3E%3Ccircle cx='245' cy='170' r='22'/%3E%3Cline x1='245' y1='170' x2='218' y2='258' stroke-width='32'/%3E%3Cline x1='245' y1='170' x2='308' y2='118' stroke-width='28'/%3E%3Ccircle cx='308' cy='118' r='20'/%3E%3Cline x1='308' y1='118' x2='358' y2='72' stroke-width='26'/%3E%3Ccircle cx='358' cy='72' r='18'/%3E%3Cline x1='245' y1='170' x2='302' y2='208' stroke-width='28'/%3E%3Ccircle cx='302' cy='208' r='20'/%3E%3Cline x1='302' y1='208' x2='338' y2='238' stroke-width='26'/%3E%3Ccircle cx='338' cy='238' r='18'/%3E%3Ccircle cx='218' cy='258' r='24'/%3E%3Cline x1='218' y1='258' x2='165' y2='338' stroke-width='30'/%3E%3Ccircle cx='165' cy='338' r='22'/%3E%3Cline x1='165' y1='338' x2='112' y2='292' stroke-width='28'/%3E%3Ccircle cx='112' cy='292' r='18'/%3E%3Cline x1='218' y1='258' x2='265' y2='342' stroke-width='30'/%3E%3Ccircle cx='265' cy='342' r='22'/%3E%3Cline x1='265' y1='342' x2='316' y2='398' stroke-width='28'/%3E%3Ccircle cx='316' cy='398' r='18'/%3E%3C/g%3E%3C/svg%3E"
          width={512}
          height={512}
          alt=""
        />
      </div>
    ),
    { ...size }
  )
}
