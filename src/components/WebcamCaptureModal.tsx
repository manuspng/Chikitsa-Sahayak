import React, { useState, useEffect, useRef } from "react";
import { Camera, X, RefreshCw, SwitchCamera, AlertCircle, Upload } from "lucide-react";

interface WebcamCaptureModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCapture: (file: File) => void;
  title?: string;
}

export default function WebcamCaptureModal({
  isOpen,
  onClose,
  onCapture,
  title = "Take Report Photo with Camera",
}: WebcamCaptureModalProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const fileFallbackRef = useRef<HTMLInputElement>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState<string>("");
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [isFlashing, setIsFlashing] = useState<boolean>(false);

  // Stop camera tracks helper
  const stopCameraStream = (activeStream: MediaStream | null) => {
    if (activeStream) {
      activeStream.getTracks().forEach((track) => {
        try {
          track.stop();
        } catch {}
      });
    }
  };

  // 1. Initialize stream when modal opens
  useEffect(() => {
    if (!isOpen) {
      stopCameraStream(stream);
      setStream(null);
      return;
    }

    let isMounted = true;
    setIsLoading(true);
    setError(null);

    async function initCamera() {
      try {
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
          throw new Error("Camera API is not supported in this browser.");
        }

        // List video devices if supported
        try {
          const allDevices = await navigator.mediaDevices.enumerateDevices();
          const videoDevs = allDevices.filter((d) => d.kind === "videoinput");
          if (isMounted) {
            setDevices(videoDevs);
          }
        } catch {}

        const constraints: MediaStreamConstraints = {
          video: selectedDeviceId
            ? { deviceId: { exact: selectedDeviceId } }
            : {
                facingMode: "environment",
                width: { ideal: 1920, min: 1280 },
                height: { ideal: 1080, min: 720 },
              },
          audio: false,
        };

        const mediaStream = await navigator.mediaDevices.getUserMedia(constraints);

        if (!isMounted) {
          stopCameraStream(mediaStream);
          return;
        }

        setStream(mediaStream);
        if (videoRef.current) {
          videoRef.current.srcObject = mediaStream;
          videoRef.current.play().catch(() => {});
        }
        setIsLoading(false);
      } catch (err: any) {
        if (!isMounted) return;
        console.error("Camera access error:", err);
        setIsLoading(false);
        if (err.name === "NotAllowedError" || err.name === "PermissionDeniedError") {
          setError("Camera permission was denied. Please allow camera permissions in your browser address bar.");
        } else if (err.name === "NotFoundError" || err.name === "DevicesNotFoundError") {
          setError("No connected camera found on this computer.");
        } else {
          setError(err.message || "Failed to start camera. You can also choose a photo file from your PC.");
        }
      }
    }

    initCamera();

    return () => {
      isMounted = false;
      stopCameraStream(stream);
    };
  }, [isOpen, selectedDeviceId]);

  // Handle switching camera device
  const handleSwitchCamera = () => {
    if (devices.length < 2) return;
    const currentIndex = devices.findIndex((d) => d.deviceId === selectedDeviceId);
    const nextIndex = (currentIndex + 1) % devices.length;
    stopCameraStream(stream);
    setStream(null);
    setSelectedDeviceId(devices[nextIndex].deviceId);
  };

  // Capture frame from video canvas
  const handleCapture = () => {
    if (!videoRef.current) return;

    const video = videoRef.current;
    if (video.videoWidth === 0 || video.videoHeight === 0) return;

    setIsFlashing(true);
    setTimeout(() => setIsFlashing(false), 200);

    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    canvas.toBlob(
      (blob) => {
        if (!blob) return;
        const timestamp = new Date().toISOString().replace(/[-:T.]/g, "").slice(0, 14);
        const fileName = `pc-camera-report-${timestamp}.jpg`;
        const file = new File([blob], fileName, { type: "image/jpeg" });

        stopCameraStream(stream);
        setStream(null);
        onCapture(file);
        onClose();
      },
      "image/jpeg",
      0.95
    );
  };

  const handleClose = () => {
    stopCameraStream(stream);
    setStream(null);
    onClose();
  };

  const handleFallbackFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      onCapture(e.target.files[0]);
      handleClose();
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md animate-fade-in">
      {/* Hidden fallback input */}
      <input
        type="file"
        ref={fileFallbackRef}
        onChange={handleFallbackFileChange}
        accept="image/*"
        className="hidden"
      />

      <div className="relative w-full max-w-2xl bg-white dark:bg-slate-900 border-2 border-slate-300 dark:border-slate-700 rounded-3xl shadow-2xl overflow-hidden animate-zoom-in text-slate-950 dark:text-white flex flex-col">
        {/* Top Header */}
        <div className="p-4 px-6 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-slate-50 dark:bg-slate-950/50">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300">
              <Camera size={18} />
            </div>
            <div>
              <h3 className="text-sm font-black text-slate-950 dark:text-white font-serif-brand">
                {title}
              </h3>
              <p className="text-[11px] text-slate-600 dark:text-slate-400 font-bold">
                Position your lab report in good lighting and click Capture
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {devices.length > 1 && (
              <button
                type="button"
                onClick={handleSwitchCamera}
                className="p-2 rounded-xl text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-800 transition-colors cursor-pointer border border-slate-300 dark:border-slate-700 flex items-center gap-1 text-xs font-bold"
                title="Switch Camera"
              >
                <SwitchCamera size={15} />
                <span className="hidden sm:inline">Switch</span>
              </button>
            )}
            <button
              type="button"
              onClick={handleClose}
              className="p-2 rounded-xl text-slate-500 hover:text-slate-950 hover:bg-slate-200 dark:hover:bg-slate-800 dark:hover:text-white transition-colors cursor-pointer border border-slate-300 dark:border-slate-700"
              title="Close Camera"
            >
              <X size={16} />
            </button>
          </div>
        </div>

        {/* Viewfinder / Video Stream Area */}
        <div className="relative bg-black flex items-center justify-center min-h-[320px] max-h-[60vh] overflow-hidden">
          {/* Shutter flash animation */}
          {isFlashing && (
            <div className="absolute inset-0 bg-white z-20 pointer-events-none transition-opacity duration-200" />
          )}

          {isLoading && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-slate-950 text-white z-10">
              <RefreshCw className="animate-spin text-emerald-400" size={32} />
              <p className="text-xs font-bold text-slate-300">Starting PC Camera / Webcam...</p>
            </div>
          )}

          {error ? (
            <div className="p-6 text-center space-y-4 max-w-md">
              <div className="w-12 h-12 rounded-full bg-red-500/20 text-red-400 flex items-center justify-center mx-auto">
                <AlertCircle size={24} />
              </div>
              <p className="text-xs text-red-200 font-semibold leading-relaxed">
                {error}
              </p>
              <button
                type="button"
                onClick={() => fileFallbackRef.current?.click()}
                className="px-4 py-2 bg-emerald-700 hover:bg-emerald-800 text-white rounded-xl text-xs font-black shadow-md cursor-pointer inline-flex items-center gap-2"
              >
                <Upload size={14} />
                <span>Choose Photo File from PC</span>
              </button>
            </div>
          ) : (
            <>
              <video
                ref={videoRef}
                autoPlay
                playsInline
                muted
                className="w-full h-full object-contain max-h-[55vh]"
              />
              {/* Document Alignment Frame Guidelines */}
              <div className="absolute inset-8 border-2 border-dashed border-emerald-400/40 rounded-2xl pointer-events-none flex flex-col justify-between p-3">
                <div className="flex justify-between text-[10px] text-emerald-400 font-mono font-bold bg-black/40 px-2 py-0.5 rounded w-fit">
                  REPORT ALIGNMENT FRAME
                </div>
                <div className="text-center text-[10px] text-slate-300 bg-black/60 px-2 py-1 rounded w-fit mx-auto">
                  Hold document flat & well-lit
                </div>
              </div>
            </>
          )}
        </div>

        {/* Bottom Shutter Action Bar */}
        <div className="p-4 px-6 bg-slate-50 dark:bg-slate-950/80 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between">
          <button
            type="button"
            onClick={handleClose}
            className="px-4 py-2 rounded-xl text-xs font-black text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-800 cursor-pointer transition-colors border border-slate-300 dark:border-slate-700"
          >
            Cancel
          </button>

          {!error && !isLoading && (
            <button
              type="button"
              onClick={handleCapture}
              className="px-6 py-2.5 bg-emerald-600 hover:bg-emerald-500 active:scale-95 text-white rounded-2xl text-xs font-black shadow-lg shadow-emerald-900/30 flex items-center gap-2 cursor-pointer transition-all"
            >
              <div className="w-4 h-4 rounded-full border-2 border-white bg-white/40 animate-pulse" />
              <span>Capture Photo</span>
            </button>
          )}

          <button
            type="button"
            onClick={() => fileFallbackRef.current?.click()}
            className="px-3.5 py-2 rounded-xl text-[11px] font-bold text-slate-600 dark:text-slate-400 hover:text-slate-950 dark:hover:text-white cursor-pointer transition-colors"
            title="Upload photo file instead"
          >
            Upload File Instead
          </button>
        </div>
      </div>
    </div>
  );
}
