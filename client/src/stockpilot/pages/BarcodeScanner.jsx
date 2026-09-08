import React, { useCallback, useEffect, useRef, useState } from "react";
import { Barcode, Package, RefreshCw } from "lucide-react";
import { BrowserMultiFormatReader } from "@zxing/browser";
import Card from "../components/ui/Card";
import Button from "../components/ui/Button";
import { api } from "../../api";

const SAME_BARCODE_COOLDOWN_MS = 2500;

export default function BarcodeScannerPage({ t }) {
  const [error, setError] = useState("");
  const [cameraStatus, setCameraStatus] = useState("idle");
  const scanningRef = useRef(false);
  const [cameraError, setCameraError] = useState("");
  const [connectionKey, setConnectionKey] = useState("");
  const [connected, setConnected] = useState(false);
  const [connectionError, setConnectionError] = useState("");
  const [connecting, setConnecting] = useState(false);
  const [phoneToken, setPhoneToken] = useState(() => window.sessionStorage.getItem("pospilot.scannerToken") || "");
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const zxingControlsRef = useRef(null);
  const animationRef = useRef(null);
  const lastDetectedRef = useRef({ value: "", at: 0, armed: true });
  const lastPublishedRef = useRef({ value: "", at: 0 });
  const detectionResetRef = useRef(null);
  const cameraStatusResetRef = useRef(null);

  const showCameraStatus = useCallback((status) => {
    setCameraStatus(status);
    if (cameraStatusResetRef.current) window.clearTimeout(cameraStatusResetRef.current);
    cameraStatusResetRef.current = window.setTimeout(() => {
      setCameraStatus("idle");
      cameraStatusResetRef.current = null;
    }, 1000);
  }, []);

  const acceptDetectedBarcode = useCallback((value) => {
    const now = Date.now();
    const lastDetected = lastDetectedRef.current;
    if (lastDetected.value === value && !lastDetected.armed) return false;
    lastDetectedRef.current = { value, at: now, armed: false };
    if (detectionResetRef.current) window.clearTimeout(detectionResetRef.current);
    return true;
  }, []);

  const scheduleDetectionReset = useCallback(() => {
    if (detectionResetRef.current) window.clearTimeout(detectionResetRef.current);
    detectionResetRef.current = window.setTimeout(() => {
      lastDetectedRef.current = { value: "", at: 0, armed: true };
    }, 800);
  }, []);

  const lookupBarcode = useCallback(async (value) => {
    const trimmedValue = value.trim();
    if (!trimmedValue || scanningRef.current) return;
    const now = Date.now();
    const lastPublished = lastPublishedRef.current;
    if (lastPublished.value === trimmedValue && now - lastPublished.at < SAME_BARCODE_COOLDOWN_MS) return;

    scanningRef.current = true;
    setError("");
    try {
      await api.publishBarcodeScan(trimmedValue, phoneToken);
      lastPublishedRef.current = { value: trimmedValue, at: Date.now() };
      showCameraStatus("success");
    } catch (requestError) {
      setError(requestError.message || `No product found for ${trimmedValue}`);
      showCameraStatus("error");
    } finally {
      scanningRef.current = false;
    }
  }, [phoneToken, showCameraStatus]);

  const connectScanner = async (event) => {
    event.preventDefault();
    if (!connectionKey.trim() || connecting) return;
    setConnecting(true);
    setConnectionError("");
    try {
      const result = await api.connectBarcodePairing(connectionKey, phoneToken);
      window.sessionStorage.setItem("pospilot.scannerToken", result.phoneToken);
      setPhoneToken(result.phoneToken);
      setConnected(true);
    } catch (requestError) {
      setConnectionError(requestError.message || "Unable to connect to cashier");
    } finally {
      setConnecting(false);
    }
  };

  useEffect(() => {
    if (!connected) return undefined;
    let cancelled = false;

    const startCamera = async () => {
      if (!navigator.mediaDevices?.getUserMedia) {
        setCameraError("Camera access is not available. Open this app over HTTPS and allow camera permissions.");
        return;
      }
      try {
        if (!("BarcodeDetector" in window)) {
          const reader = new BrowserMultiFormatReader();
          zxingControlsRef.current = await reader.decodeFromConstraints(
            { video: { facingMode: { ideal: "environment" } }, audio: false },
            videoRef.current,
            async (result) => {
              if (!result) {
                scheduleDetectionReset();
                return;
              }
              const detected = result?.getText()?.trim();
              if (!detected || cancelled || scanningRef.current || !acceptDetectedBarcode(detected)) return;
              await lookupBarcode(detected);
            },
          );
          return;
        }

        const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "environment" } }, audio: false });
        if (cancelled) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }
        streamRef.current = stream;
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
        const detector = new window.BarcodeDetector({ formats: ["ean_13", "ean_8", "upc_a", "upc_e", "code_128", "code_39", "itf", "qr_code"] });
        const detect = async () => {
          if (cancelled || !videoRef.current || videoRef.current.readyState < 2) return;
          try {
            const results = await detector.detect(videoRef.current);
            const detected = results[0]?.rawValue?.trim();
            if (detected && !scanningRef.current && acceptDetectedBarcode(detected)) {
              await lookupBarcode(detected);
            } else if (!detected) {
              scheduleDetectionReset();
            }
          } catch (_error) {
            // Keep scanning; camera frames can be unavailable briefly while the video starts.
          }
          animationRef.current = requestAnimationFrame(detect);
        };
        animationRef.current = requestAnimationFrame(detect);
      } catch (requestError) {
        setCameraError(requestError.name === "NotAllowedError" ? "Camera permission was denied." : "Unable to open the camera.");
      }
    };

    setCameraError("");
    startCamera();
    return () => {
      cancelled = true;
      const animationFrame = animationRef.current;
      const detectionReset = detectionResetRef.current;
      const cameraStatusReset = cameraStatusResetRef.current;
      const controls = zxingControlsRef.current;
      const stream = streamRef.current;
      const video = videoRef.current;
      if (animationFrame) cancelAnimationFrame(animationFrame);
      if (detectionReset) window.clearTimeout(detectionReset);
      if (cameraStatusReset) window.clearTimeout(cameraStatusReset);
      controls?.stop();
      zxingControlsRef.current = null;
      stream?.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
      if (video) video.srcObject = null;
    };
  }, [connected, acceptDetectedBarcode, lookupBarcode, scheduleDetectionReset]);

  useEffect(() => {
    if (!connected || !phoneToken) return undefined;
    const sendHeartbeat = () => {
      api.heartbeatBarcodePairing(phoneToken).catch(() => {});
    };
    sendHeartbeat();
    const heartbeatTimer = window.setInterval(sendHeartbeat, 3000);
    return () => window.clearInterval(heartbeatTimer);
  }, [connected, phoneToken]);

  return (
    <div className="space-y-5">
      <Card t={t} className="p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl flex items-center justify-center" style={{ background: t.primarySoft, color: t.primary }}>
              <Barcode size={25} />
            </div>
            <div>
              <p className="text-[10px] uppercase font-bold tracking-widest" style={{ color: t.primary }}>Tools</p>
              <h2 className="text-xl font-extrabold" style={{ color: t.text }}>Barcode Scanner</h2>
              <p className="text-sm mt-1" style={{ color: t.sub }}>Scan a product barcode to send it to the cashier.</p>
            </div>
          </div>
          {connected && <div className="flex flex-wrap gap-2"><Button t={t} variant="outline" type="button" onClick={() => setError("")}><RefreshCw size={15} /> Clear status</Button></div>}
        </div>
      </Card>

      <div className="grid grid-cols-1 gap-5 items-start">
        <Card t={t} className="p-5">
          {!connected ? (
            <form onSubmit={connectScanner} className="max-w-xl mx-auto py-10">
              <div className="text-center">
                <Barcode size={42} className="mx-auto" style={{ color: t.primary }} />
                <h3 className="text-xl font-extrabold mt-4" style={{ color: t.text }}>Connect to cashier</h3>
                <p className="text-sm mt-2" style={{ color: t.sub }}>Enter the scanner key shown in the cashier status panel.</p>
              </div>
              <input value={connectionKey} onChange={(event) => setConnectionKey(event.target.value.toUpperCase())} placeholder="Enter connection key" autoComplete="off" autoFocus className="w-full mt-6 px-4 py-4 rounded-xl text-center text-lg tracking-[0.3em] outline-none" style={{ background: t.bg, color: t.text, border: `2px solid ${connectionError ? t.danger : t.primary}` }} aria-label="Cashier connection key" />
              {connectionError && <p className="mt-3 text-sm text-center" style={{ color: t.danger }}>{connectionError}</p>}
              <Button t={t} type="submit" className="w-full mt-5" disabled={!connectionKey.trim() || connecting}>{connecting ? "Connecting..." : "Connect scanner"}</Button>
            </form>
          ) : (
          <>
          <div className={`barcode-camera barcode-camera--${cameraStatus}`}><video ref={videoRef} className="w-full aspect-video object-cover" muted playsInline aria-label="Barcode camera view" /></div>
          {cameraError && <div className="mt-4 rounded-xl px-4 py-3 text-sm" style={{ background: t.warningSoft, color: t.text }}>{cameraError}</div>}
          {error && <div className="mt-5 rounded-xl px-4 py-3 text-sm" style={{ background: t.dangerSoft, color: t.danger }}>{error}</div>}

          {!cameraError && <div className="mt-6 rounded-2xl p-10 text-center" style={{ background: t.bg, border: `1px dashed ${t.border}` }}><Package size={30} className="mx-auto" style={{ color: t.sub }} /><p className="font-semibold mt-3" style={{ color: t.text }}>Ready to scan</p><p className="text-sm mt-1" style={{ color: t.sub }}>Scanned barcodes are sent to the paired cashier automatically.</p></div>}
          </>
          )}
        </Card>

      </div>
    </div>
  );
}
