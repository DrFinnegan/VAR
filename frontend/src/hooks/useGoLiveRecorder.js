/**
 * useGoLiveRecorder — keeps a circular ~`bufferSeconds` window of the
 * GO LIVE MediaStream encoded as MP4/WebM. When the operator creates
 * an incident, `getClipBlob()` returns the most-recent N seconds so the
 * backend can persist it and PDFs / audit chain entries can attach the
 * exact moment the verdict was made.
 *
 * Why MediaRecorder + slicing?
 * - Live broadcasts can run for hours; we never want to buffer the whole
 *   feed. Instead we tell MediaRecorder to emit small chunks every 1 s
 *   and we keep the last `bufferSeconds` worth in memory.
 * - When you ask for the clip we concatenate the buffered chunks and
 *   return a Blob ready to upload.
 *
 * Browser support: Chrome/Edge produce `video/webm;codecs=vp9` natively
 * (which is fine — backend re-encodes to MP4 via ffmpeg).
 */
import { useEffect, useRef, useState } from "react";

const PREFERRED_MIME = [
  "video/webm;codecs=vp9,opus",
  "video/webm;codecs=vp8,opus",
  "video/webm;codecs=h264",
  "video/webm",
  "video/mp4",
];

function pickMime() {
  if (typeof MediaRecorder === "undefined") return null;
  for (const m of PREFERRED_MIME) {
    try { if (MediaRecorder.isTypeSupported(m)) return m; } catch { /* */ }
  }
  return null;
}

export function useGoLiveRecorder(stream, bufferSeconds = 8) {
  const recorderRef = useRef(null);
  const chunksRef = useRef([]); // [{blob, t}]
  const [active, setActive] = useState(false);
  const mimeRef = useRef(null);

  useEffect(() => {
    if (!stream) {
      setActive(false);
      try { recorderRef.current?.stop(); } catch { /* */ }
      recorderRef.current = null;
      chunksRef.current = [];
      return;
    }
    const mime = pickMime();
    mimeRef.current = mime;
    if (!mime) {
      console.warn("MediaRecorder: no supported MIME — clip capture disabled");
      return;
    }
    let rec;
    try {
      rec = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 2_500_000 });
    } catch (e) {
      console.warn("MediaRecorder construct failed:", e);
      return;
    }
    rec.ondataavailable = (e) => {
      if (!e.data || e.data.size === 0) return;
      const now = Date.now();
      chunksRef.current.push({ blob: e.data, t: now });
      // Keep ~ bufferSeconds + 2s of padding
      const cutoff = now - (bufferSeconds + 2) * 1000;
      while (chunksRef.current.length && chunksRef.current[0].t < cutoff) {
        chunksRef.current.shift();
      }
    };
    rec.onstart = () => setActive(true);
    rec.onstop = () => setActive(false);
    try {
      rec.start(1000); // 1s timeslice
      recorderRef.current = rec;
    } catch (e) {
      console.warn("MediaRecorder start failed:", e);
    }
    return () => {
      try { rec.stop(); } catch { /* */ }
    };
  }, [stream, bufferSeconds]);

  /** Returns a Blob containing the most-recent `bufferSeconds` of footage,
   *  or null if no chunks were captured. */
  const getClipBlob = async () => {
    const chunks = chunksRef.current.slice();
    if (!chunks.length) return null;
    return new Blob(chunks.map((c) => c.blob), { type: mimeRef.current || "video/webm" });
  };

  return { active, getClipBlob, mime: mimeRef.current };
}

/** Convenience: returns base64 (no data URL prefix) of the buffered clip. */
export async function clipBlobToBase64(blob) {
  if (!blob) return null;
  return await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const url = String(reader.result || "");
      resolve(url.split(",")[1] || null);
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}
