/**
 * GoLiveButton — taps `navigator.mediaDevices.getDisplayMedia()` so the
 * operator can share any browser tab / window / screen showing a live
 * football broadcast. The MediaStream is attached to the LiveVAR stage
 * video element (via the `[data-octon-stage="true"]` selector) so the
 * OFFSIDE Quick-Fire pill captures live broadcast frames in real time.
 *
 * Works with any legal subscription the operator already has open
 * (Sky Go, fuboTV, BBC iPlayer, Apple TV web, Premier League Player…).
 * No third-party API. No licensing. Pure browser permissions model.
 *
 * RTMP fallback: if the operator has an OBS push set up, see
 * /api/live/rtmp/* on the backend (see routes/live_ingest.py).
 */
import { useEffect, useRef, useState } from "react";
import { Radio, Square, Loader2 } from "lucide-react";
import { Button } from "./ui/button";
import { toast } from "sonner";

export default function GoLiveButton({ onLiveStart, onLiveEnd }) {
  const [live, setLive] = useState(false);
  const [busy, setBusy] = useState(false);
  const streamRef = useRef(null);

  const stop = () => {
    try {
      streamRef.current?.getTracks?.().forEach((t) => t.stop());
    } catch { /* ignore */ }
    streamRef.current = null;
    setLive(false);
    onLiveEnd?.();
  };

  useEffect(() => () => stop(), []); // eslint-disable-line react-hooks/exhaustive-deps

  const start = async () => {
    if (busy) return;
    if (live) { stop(); return; }
    if (!navigator.mediaDevices?.getDisplayMedia) {
      toast.error("Browser doesn't support screen capture", {
        description: "Use a recent Chrome/Edge/Firefox build.",
      });
      return;
    }
    setBusy(true);
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: { frameRate: { ideal: 30, max: 60 } },
        audio: false,
      });
      streamRef.current = stream;
      // Attach to the stage video. We mount a hidden <video> if there
      // isn't an active video (e.g. no incident loaded) so the Quick-Fire
      // pill can still grab frames.
      const stage = document.querySelector('[data-octon-stage="true"]');
      if (!stage) {
        toast.error("LiveVAR stage not ready");
        stop();
        return;
      }
      let vid = stage.querySelector("video");
      if (!vid) {
        vid = document.createElement("video");
        vid.muted = true;
        vid.autoplay = true;
        vid.playsInline = true;
        vid.style.cssText = "width:100%;height:100%;object-fit:contain;background:#000;";
        vid.setAttribute("data-octon-live-feed", "true");
        // Insert under the stage so it's the FIRST video selector hits.
        stage.insertBefore(vid, stage.firstChild);
      }
      vid.srcObject = stream;
      try { await vid.play(); } catch { /* autoplay safe */ }
      // Operator-facing: track the user closing the browser-share UI.
      stream.getVideoTracks()[0].addEventListener("ended", stop);
      setLive(true);
      toast.success("LIVE feed connected", {
        description: "Broadcast is now feeding the OCTON stage. Click ⚡ OFFSIDE any time to analyse the current moment.",
        duration: 6000,
      });
      onLiveStart?.(stream);
    } catch (err) {
      if (err && err.name === "NotAllowedError") {
        toast.warning("Screen-share cancelled");
      } else {
        toast.error("Couldn't start live feed", {
          description: err?.message || String(err),
        });
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <Button
      onClick={start}
      disabled={busy}
      data-testid="go-live-button"
      className={`rounded-none font-heading font-bold text-[10px] tracking-[0.15em] h-9 px-3 active:scale-[0.98] transition-all disabled:opacity-60 ${
        live
          ? "bg-[#FF3333] text-black hover:bg-[#FF3333]/90"
          : "bg-transparent text-[#FF3333] border border-[#FF3333]/40 hover:bg-[#FF3333]/10 hover:border-[#FF3333]/70"
      }`}
      title="Share any browser tab/window showing a live broadcast — OCTON will analyse it in real time"
    >
      {busy ? (
        <Loader2 className="w-3 h-3 mr-1.5 animate-spin" />
      ) : live ? (
        <Square className="w-3 h-3 mr-1.5 fill-current" />
      ) : (
        <Radio className="w-3 h-3 mr-1.5" />
      )}
      {live ? "STOP LIVE" : "GO LIVE"}
    </Button>
  );
}
