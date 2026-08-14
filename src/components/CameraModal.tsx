import React, { useState, useRef, useEffect } from "react";
import { Camera, X, RefreshCw, Check, AlertCircle, ShieldCheck, HelpCircle, Upload, Image as ImageIcon } from "lucide-react";

interface CameraModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCapture: (file: File) => void;
  title?: string;
}

export default function CameraModal({ isOpen, onClose, onCapture, title = "Capture Lab Report Photo" }: CameraModalProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const fallbackFileRef = useRef<HTMLInputElement | null>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [capturedImage, setCapturedImage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [errorType, setErrorType] = useState<"permission" | "notFound" | "general" | null>(null);
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState<string>("");
  const [isStarting, setIsStarting] = useState(false);
  const [showPermissionHelp, setShowPermissionHelp] = useState(false);

  useEffect(() => {
    if (isOpen) {
      startCamera();
    } else {
      stopCamera();
    }
    return () => {
      stopCamera();
    };
  }, [isOpen]);

  const stopCamera = () => {
    if (stream) {
      stream.getTracks().forEach(track => {
        try {
          track.stop();
        } catch {
          // ignore
        }
      });
      setStream(null);
    }
  };

  const startCamera = async (deviceId?: string) => {
    setError(null);
    setErrorType(null);
    setIsStarting(true);
    stopCamera();

    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error("Web camera is not supported or restricted in this browser frame.");
      }

      if (navigator.mediaDevices.enumerateDevices) {
        try {
          const devs = await navigator.mediaDevices.enumerateDevices();
          const videoDevs = devs.filter(d => d.kind === "videoinput");
          setDevices(videoDevs);
        } catch {
          // non-blocking
        }
      }

      const constraints: MediaStreamConstraints = {
        video: deviceId
          ? { deviceId: { exact: deviceId }, width: { ideal: 1920 }, height: { ideal: 1080 } }
          : { facingMode: "environment", width: { ideal: 1920 }, height: { ideal: 1080 } }
      };

      const mediaStream = await navigator.mediaDevices.getUserMedia(constraints);
      setStream(mediaStream);

      if (videoRef.current) {
        videoRef.current.srcObject = mediaStream;
        await videoRef.current.play().catch(e => console.warn("Video play error:", e));
      }
    } catch (err: any) {
      console.warn("Camera access message:", err?.name, err?.message);
      const msg = err?.message || "";
      const name = err?.name || "";

      if (
        name === "NotAllowedError" ||
        name === "PermissionDeniedError" ||
        name === "SecurityError" ||
        msg.toLowerCase().includes("permission") ||
        msg.toLowerCase().includes("dismissed") ||
        msg.toLowerCase().includes("denied")
      ) {
        setErrorType("permission");
        setError("Camera permission was dismissed or not granted. You can retry with permission or take a photo using your device's native camera.");
      } else if (name === "NotFoundError" || name === "DevicesNotFoundError") {
        setErrorType("notFound");
        setError("No camera hardware detected. You can select a photo or scan from your files.");
      } else {
        setErrorType("general");
        setError(msg || "Could not open camera viewfinder. You can upload a photo from your device.");
      }
    } finally {
      setIsStarting(false);
    }
  };

  const handleDeviceChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const devId = e.target.value;
    setSelectedDeviceId(devId);
    startCamera(devId);
  };

  const handleFallbackFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      onCapture(file);
      handleCloseModal();
    }
  };

  const handleSnap = () => {
    if (!videoRef.current) return;
    const video = videoRef.current;
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth || 1280;
    canvas.height = video.videoHeight || 720;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const dataUrl = canvas.toDataURL("image/jpeg", 0.92);
    setCapturedImage(dataUrl);
    stopCamera();
  };

  const handleRetake = () => {
    setCapturedImage(null);
    startCamera(selectedDeviceId);
  };

  const handleConfirm = () => {
    if (!capturedImage) return;

    fetch(capturedImage)
      .then(res => res.blob())
      .then(blob => {
        const file = new File([blob], `report_camera_${Date.now()}.jpg`, { type: "image/jpeg" });
        onCapture(file);
        handleCloseModal();
      })
      .catch(err => {
        console.error("Failed to convert image:", err);
      });
  };

  const handleCloseModal = () => {
    stopCamera();
    setCapturedImage(null);
    setError(null);
    setErrorType(null);
    setShowPermissionHelp(false);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-md animate-fade-in">
      {/* Hidden fallback file input that invokes device camera/gallery natively */}
      <input
        type="file"
        ref={fallbackFileRef}
        onChange={handleFallbackFileSelect}
        accept="image/*"
        capture="environment"
        className="hidden"
      />

      <div className="bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl max-w-xl w-full p-6 shadow-2xl space-y-4 overflow-hidden relative text-slate-800 dark:text-slate-100">
        {/* Modal Header */}
        <div className="flex items-center justify-between pb-3 border-b border-slate-200 dark:border-slate-800">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-emerald-600/10 text-emerald-600 dark:text-emerald-400 rounded-xl">
              <Camera size={18} />
            </div>
            <div>
              <h3 className="text-base font-black text-slate-900 dark:text-slate-100 leading-tight">
                {title}
              </h3>
              <p className="text-xs text-slate-600 dark:text-slate-400 font-medium">
                Hold document steady under clear lighting
              </p>
            </div>
          </div>
          <button
            onClick={handleCloseModal}
            className="p-1.5 rounded-xl text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100 hover:bg-slate-200/70 dark:hover:bg-slate-800 transition-colors cursor-pointer"
          >
            <X size={18} />
          </button>
        </div>

        {/* Device Switcher if multiple webcams exist */}
        {devices.length > 1 && !capturedImage && !error && (
          <div className="flex items-center gap-2 text-xs text-slate-700 dark:text-slate-300 bg-white dark:bg-slate-800 p-2.5 rounded-xl border border-slate-200 dark:border-slate-700">
            <span className="font-bold text-slate-900 dark:text-slate-100">Active Camera:</span>
            <select
              value={selectedDeviceId}
              onChange={handleDeviceChange}
              className="flex-1 bg-slate-100 dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg px-2.5 py-1 text-xs font-semibold text-slate-800 dark:text-slate-200 outline-none"
            >
              {devices.map((d, idx) => (
                <option key={d.deviceId || idx} value={d.deviceId}>
                  {d.label || `Camera ${idx + 1}`}
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Viewfinder / Preview Area */}
        <div className="relative aspect-[4/3] bg-slate-200/90 dark:bg-slate-950 rounded-2xl overflow-hidden flex items-center justify-center border-2 border-slate-300 dark:border-slate-800 shadow-inner">
          {error ? (
            <div className="p-5 text-center space-y-3.5 max-w-md bg-white dark:bg-slate-900 rounded-2xl m-3 border border-slate-200 dark:border-slate-800 shadow-sm">
              <div className="w-10 h-10 rounded-full bg-amber-500/10 text-amber-600 dark:text-amber-400 flex items-center justify-center mx-auto">
                <AlertCircle size={24} />
              </div>
              <div className="space-y-1">
                <h4 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                  {errorType === "permission" ? "Camera Permission Needed" : "Camera Access Notice"}
                </h4>
                <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                  {error}
                </p>
              </div>

              {/* Action options when camera is dismissed / blocked */}
              <div className="pt-1 flex flex-col gap-2">
                <button
                  type="button"
                  onClick={() => fallbackFileRef.current?.click()}
                  className="w-full py-2.5 px-3 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl transition-all flex items-center justify-center gap-1.5 shadow-sm cursor-pointer active:scale-98"
                >
                  <Camera size={14} />
                  <span>Take Photo with Device Camera / File</span>
                </button>

                <button
                  type="button"
                  onClick={() => startCamera(selectedDeviceId)}
                  className="w-full py-2 px-3 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 text-xs font-bold rounded-xl transition-all flex items-center justify-center gap-1.5 cursor-pointer border border-slate-300 dark:border-slate-700"
                >
                  <RefreshCw size={13} />
                  <span>Retry Live Camera Stream</span>
                </button>

                {errorType === "permission" && (
                  <button
                    type="button"
                    onClick={() => setShowPermissionHelp(!showPermissionHelp)}
                    className="w-full py-1.5 px-3 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 text-[11px] font-medium transition-all flex items-center justify-center gap-1 cursor-pointer"
                  >
                    <HelpCircle size={12} />
                    <span>{showPermissionHelp ? "Hide Browser Permission Guide" : "How to Allow Camera in Browser"}</span>
                  </button>
                )}
              </div>

              {showPermissionHelp && (
                <div className="p-3 bg-slate-50 dark:bg-slate-950/60 rounded-xl border border-slate-200 dark:border-slate-800 text-left text-[11px] text-slate-700 dark:text-slate-300 space-y-1.5">
                  <p className="font-bold text-slate-900 dark:text-slate-100">To allow camera permissions in Chrome / Safari / Edge:</p>
                  <ol className="list-decimal pl-4 space-y-1">
                    <li>Click the 🔒 icon or camera icon in the top browser address bar.</li>
                    <li>Toggle <strong>Camera</strong> to <strong>Allow</strong>.</li>
                    <li>Click <strong>"Retry Live Camera Stream"</strong> above.</li>
                  </ol>
                </div>
              )}
            </div>
          ) : capturedImage ? (
            <img
              src={capturedImage}
              alt="Report Captured Frame"
              className="w-full h-full object-contain bg-slate-100 dark:bg-slate-950"
            />
          ) : (
            <>
              <video
                ref={videoRef}
                playsInline
                muted
                className="w-full h-full object-cover"
              />
              {/* Document Alignment Frame Overlay */}
              <div className="absolute inset-6 border-2 border-dashed border-emerald-500 rounded-xl pointer-events-none flex flex-col justify-between p-3">
                <div className="flex justify-between text-[10px] font-extrabold uppercase tracking-wider text-emerald-950 bg-emerald-100/90 border border-emerald-300 px-2.5 py-1 rounded-lg w-fit shadow-xs">
                  Position Lab Report Here
                </div>
                <div className="text-[10px] font-extrabold text-slate-900 bg-white/90 border border-slate-300 px-2.5 py-1 rounded-lg self-center shadow-xs">
                  Ensure text & numbers are clearly readable
                </div>
              </div>
            </>
          )}

          {isStarting && !error && !capturedImage && (
            <div className="absolute inset-0 bg-slate-100/90 dark:bg-slate-900/90 flex flex-col items-center justify-center gap-2 text-emerald-600 dark:text-emerald-400 text-xs font-bold">
              <RefreshCw className="animate-spin" size={22} />
              <span>Initializing camera stream...</span>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="flex items-center justify-between pt-2 border-t border-slate-200 dark:border-slate-800">
          {capturedImage ? (
            <div className="flex items-center gap-2 w-full">
              <button
                type="button"
                onClick={handleRetake}
                className="flex-1 py-2.5 px-4 bg-slate-200 hover:bg-slate-300 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-100 font-bold text-xs rounded-xl transition-all flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <RefreshCw size={14} />
                <span>Retake Photo</span>
              </button>
              <button
                type="button"
                onClick={handleConfirm}
                className="flex-1 py-2.5 px-4 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-xl transition-all flex items-center justify-center gap-1.5 cursor-pointer shadow-md shadow-emerald-600/20"
              >
                <Check size={14} />
                <span>Use Photo For Report Extraction</span>
              </button>
            </div>
          ) : (
            <div className="flex items-center justify-between w-full gap-2">
              <button
                type="button"
                onClick={handleCloseModal}
                className="py-2.5 px-4 bg-slate-200 hover:bg-slate-300 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-100 font-bold text-xs rounded-xl transition-all cursor-pointer"
              >
                Cancel
              </button>
              
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => fallbackFileRef.current?.click()}
                  className="py-2.5 px-3.5 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 font-bold text-xs rounded-xl border border-slate-300 dark:border-slate-700 transition-all flex items-center gap-1.5 cursor-pointer"
                >
                  <Upload size={14} />
                  <span>Choose File</span>
                </button>
                <button
                  type="button"
                  disabled={!!error || isStarting}
                  onClick={handleSnap}
                  className="py-2.5 px-6 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white font-bold text-xs rounded-xl transition-all flex items-center gap-2 cursor-pointer shadow-md shadow-emerald-600/20 active:scale-98"
                >
                  <Camera size={16} />
                  <span>Snap Photo Now</span>
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
