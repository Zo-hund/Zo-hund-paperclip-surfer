import React, { useRef, useEffect } from "react";
import QRCode from "qrcode";

interface CertificateQrProps {
  verifyUrl: string;
  size?: number;
}

export function CertificateQr({ verifyUrl, size = 120 }: CertificateQrProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (!canvasRef.current) return;
    QRCode.toCanvas(canvasRef.current, verifyUrl, {
      width: size,
      margin: 1,
      color: { dark: "#000000", light: "#ffffff" },
    }).catch(() => {
      // silently ignore — QR is a nice-to-have
    });
  }, [verifyUrl, size]);

  return <canvas ref={canvasRef} width={size} height={size} className="rounded" />;
}
