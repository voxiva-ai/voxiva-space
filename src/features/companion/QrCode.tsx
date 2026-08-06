import { useEffect, useRef } from "react";
import QRCode from "qrcode";

type QrCodeProps = {
  value: string;
  size?: number;
  label?: string;
};

/** Untitled UI–style QR: white pad + corner brackets (no Tailwind stack). */
export function CompanionQrCode({ value, size = 200, label }: QrCodeProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !value) return;
    void QRCode.toCanvas(canvas, value, {
      width: size,
      margin: 2,
      color: { dark: "#0a0e16", light: "#ffffff" },
      errorCorrectionLevel: "M",
    });
  }, [size, value]);

  return (
    <div className="vs-companionQr" style={{ width: size + 28, height: size + 28 }} aria-label={label}>
      <span className="vs-companionQrHandle is-tl" aria-hidden />
      <span className="vs-companionQrHandle is-tr" aria-hidden />
      <span className="vs-companionQrHandle is-br" aria-hidden />
      <span className="vs-companionQrHandle is-bl" aria-hidden />
      <canvas ref={canvasRef} width={size} height={size} />
    </div>
  );
}
