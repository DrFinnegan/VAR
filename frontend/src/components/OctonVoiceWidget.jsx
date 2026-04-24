import { useState, useRef, useEffect, useCallback } from "react";
import axios from "axios";
import { toast } from "sonner";
import { Mic, X, Loader2, Waves, MessageSquareText, Ear, EarOff, Volume2, Sliders, Check, Play, Pause } from "lucide-react";
import { OctonBrainLogo } from "./OctonBrainLogo";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

// Curated American-English TTS voices shown in the picker.
// Source: OpenAI TTS voice catalogue; labels tuned for VAR persona.
const VOICE_OPTIONS = [
  { id: "nova",    label: "Nova",    desc: "Warm · female",           gender: "F" },
  { id: "shimmer", label: "Shimmer", desc: "Bright · female",         gender: "F" },
  { id: "coral",   label: "Coral",   desc: "Friendly · female",       gender: "F" },
  { id: "ash",     label: "Ash",    desc: "Charismatic · male",       gender: "M" },
  { id: "echo",    label: "Echo",    desc: "News-anchor · male",      gender: "M" },
  { id: "onyx",    label: "Onyx",    desc: "Deep · male",             gender: "M" },
  { id: "sage",    label: "Sage",    desc: "Conversational · unisex", gender: "U" },
  { id: "alloy",   label: "Alloy",   desc: "Neutral · unisex",        gender: "U" },
];

/**
 * Floating OCTON voice assistant — bottom-right of the dashboard.
 * Flow: click mic → record → stop (auto after silence or manual) →
 *      upload → transcribe → chat → TTS playback + transcript bubble.
 */
export default function OctonVoiceWidget({ selectedIncidentId, onVoiceAction }) {
  const [open, setOpen] = useState(false);
  const [recording, setRecording] = useState(false);
  const [thinking, setThinking] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [sessionId, setSessionId] = useState(null);
  const [messages, setMessages] = useState([]); // {role, text}
  const [levels, setLevels] = useState([0, 0, 0, 0, 0]); // audio bars
  const [wakeOn, setWakeOn] = useState(false);
  const [wakeSupported, setWakeSupported] = useState(true);
  const [pendingAudioUrl, setPendingAudioUrl] = useState(null);
  // Persisted American-English voice choice
  const [voiceName, setVoiceName] = useState(() => {
    try { return window.localStorage.getItem("octon-voice") || "nova"; }
    catch { return "nova"; }
  });
  const [showVoicePicker, setShowVoicePicker] = useState(false);
  const [previewingVoice, setPreviewingVoice] = useState(null);
  const previewAudioRef = useRef(null);

  // Load persisted voice preference from the backend on first open so the
  // user's choice carries across devices. Fall back to localStorage if the
  // backend hasn't been reached yet (offline or not authenticated).
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const r = await axios.get(`${API}/preferences`, { withCredentials: true });
        const v = r.data?.voice;
        if (!cancelled && v && v !== voiceName) {
          setVoiceName(v);
          try { window.localStorage.setItem("octon-voice", v); } catch {/* ignore */}
        }
      } catch { /* unauthenticated or offline — keep localStorage value */ }
    })();
    return () => { cancelled = true; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Stop any in-flight preview when the picker closes
  useEffect(() => {
    if (!showVoicePicker && previewAudioRef.current) {
      try { previewAudioRef.current.pause(); } catch {/* ignore */}
      setPreviewingVoice(null);
    }
  }, [showVoicePicker]);

  const playVoicePreview = useCallback(async (voiceId) => {
    // Toggle: if the same voice is already playing, stop it
    if (previewingVoice === voiceId && previewAudioRef.current) {
      try { previewAudioRef.current.pause(); } catch {/* ignore */}
      setPreviewingVoice(null);
      return;
    }
    // Stop any currently playing preview
    if (previewAudioRef.current) {
      try { previewAudioRef.current.pause(); } catch {/* ignore */}
    }
    setPreviewingVoice(voiceId);
    try {
      const el = new Audio(`${API}/voice/sample?voice=${encodeURIComponent(voiceId)}`);
      el.onended = () => setPreviewingVoice(cur => (cur === voiceId ? null : cur));
      el.onerror = () => {
        setPreviewingVoice(cur => (cur === voiceId ? null : cur));
        toast.error("Could not play sample");
      };
      previewAudioRef.current = el;
      await el.play();
    } catch (err) {
      setPreviewingVoice(null);
      if (err?.name === "NotAllowedError") {
        toast.error("Browser blocked audio — click the voice row again.");
      } else {
        toast.error(`Sample error: ${err?.message || err?.name || "unknown"}`);
      }
    }
  }, [previewingVoice]);

  const changeVoice = useCallback(async (voiceId) => {
    setVoiceName(voiceId);
    try { window.localStorage.setItem("octon-voice", voiceId); } catch {/* ignore */}
    // Fire-and-forget server persistence so the choice follows the user
    try {
      await axios.put(`${API}/preferences`, { voice: voiceId }, { withCredentials: true });
    } catch { /* degrade silently — localStorage still has the value */ }
  }, []);

  const wakeRecRef = useRef(null);
  const wakeRestartTimerRef = useRef(null);

  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  const audioCtxRef = useRef(null);
  const analyserRef = useRef(null);
  const audioElRef = useRef(null);
  const streamRef = useRef(null);
  const rafRef = useRef(null);

  const stopAudioAnalysis = useCallback(() => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
    try { analyserRef.current?.disconnect(); } catch {/* ignore */}
    analyserRef.current = null;
    if (audioCtxRef.current && audioCtxRef.current.state !== "closed") {
      audioCtxRef.current.close().catch(() => {});
    }
    audioCtxRef.current = null;
    setLevels([0, 0, 0, 0, 0]);
  }, []);

  const startAudioAnalysis = useCallback((stream) => {
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const src = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 64;
      src.connect(analyser);
      audioCtxRef.current = ctx;
      analyserRef.current = analyser;
      const data = new Uint8Array(analyser.frequencyBinCount);
      const tick = () => {
        if (!analyserRef.current) return;
        analyser.getByteFrequencyData(data);
        const bins = 5;
        const step = Math.floor(data.length / bins);
        const next = Array.from({ length: bins }, (_, i) => {
          let s = 0;
          for (let j = 0; j < step; j++) s += data[i * step + j] || 0;
          return Math.min(1, (s / step) / 180);
        });
        setLevels(next);
        rafRef.current = requestAnimationFrame(tick);
      };
      tick();
    } catch {
      /* audio viz best-effort */
    }
  }, []);

  const startRecording = useCallback(async () => {
    if (recording || thinking) return;
    // ── Pre-flight checks so users get an actionable error, not a blank fail ──
    if (typeof window === "undefined" || !window.isSecureContext) {
      toast.error("Microphone needs HTTPS. Open the app on its https:// URL.");
      return;
    }
    if (!navigator.mediaDevices?.getUserMedia) {
      toast.error("This browser does not support microphone capture. Try Chrome / Edge / Firefox.");
      return;
    }
    if (typeof window.MediaRecorder === "undefined") {
      toast.error("This browser does not support MediaRecorder. Try a Chromium-based browser.");
      return;
    }

    // Pick the best MIME type the browser can actually encode.
    const pickMime = () => {
      const candidates = [
        "audio/webm;codecs=opus",
        "audio/webm",
        "audio/ogg;codecs=opus",
        "audio/mp4",
        "audio/mpeg",
      ];
      for (const m of candidates) {
        try { if (window.MediaRecorder.isTypeSupported(m)) return m; } catch {/* noop */}
      }
      return ""; // let browser pick default
    };
    const mimeType = pickMime();
    const fileExt = mimeType.includes("mp4") ? "mp4" : mimeType.includes("ogg") ? "ogg" : mimeType.includes("mpeg") ? "mp3" : "webm";

    let stream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch (err) {
      // Surface the ACTUAL reason so the user can fix it instead of seeing a generic toast.
      const name = err?.name || "";
      if (name === "NotAllowedError" || name === "PermissionDeniedError") {
        toast.error("Microphone permission was denied. Click the 🔒 icon in the URL bar → Allow microphone → reload.");
      } else if (name === "NotFoundError" || name === "DevicesNotFoundError") {
        toast.error("No microphone was detected on this device.");
      } else if (name === "NotReadableError" || name === "TrackStartError") {
        toast.error("Microphone is in use by another app. Close Zoom/Meet/Teams and try again.");
      } else if (name === "OverconstrainedError") {
        toast.error("Microphone does not support the required settings.");
      } else if (name === "SecurityError") {
        toast.error("Browser blocked the microphone for security reasons. Ensure you are on HTTPS.");
      } else {
        toast.error(`Microphone error: ${err?.message || name || "unknown"}`);
      }
      return;
    }

    try {
      streamRef.current = stream;
      startAudioAnalysis(stream);
      audioChunksRef.current = [];
      const mr = mimeType
        ? new MediaRecorder(stream, { mimeType })
        : new MediaRecorder(stream);
      mr.ondataavailable = (e) => { if (e.data.size > 0) audioChunksRef.current.push(e.data); };
      mr.onstop = async () => {
        stopAudioAnalysis();
        try { stream.getTracks().forEach(t => t.stop()); } catch { /* ignore */ }
        const blobType = mr.mimeType || mimeType || "audio/webm";
        const blob = new Blob(audioChunksRef.current, { type: blobType });
        if (blob.size < 1500) {
          toast.error("Recording too short — hold the mic for ~1 second");
          return;
        }
        await processAudio(blob, fileExt);
      };
      mediaRecorderRef.current = mr;
      mr.start();
      setRecording(true);
      // Safety auto-stop after 25 s
      setTimeout(() => {
        if (mr.state === "recording") mr.stop();
      }, 25000);
    } catch (err) {
      try { stream.getTracks().forEach(t => t.stop()); } catch {/* ignore */}
      toast.error(`Recorder init failed: ${err?.message || err?.name || "unknown"}`);
    }
  }, [recording, thinking, startAudioAnalysis, stopAudioAnalysis]);

  const stopRecording = useCallback(() => {
    const mr = mediaRecorderRef.current;
    if (mr && mr.state === "recording") {
      mr.stop();
    }
    setRecording(false);
  }, []);

  const processAudio = useCallback(async (blob, fileExt = "webm") => {
    setThinking(true);
    // Insert a placeholder "thinking" bubble right away so the user never
    // stares at a frozen UI between transcribe → chat → TTS.
    const thinkingId = `thinking-${Date.now()}`;
    try {
      // 1) Transcribe
      const fd = new FormData();
      fd.append("audio", blob, `voice.${fileExt}`);
      const trans = await axios.post(`${API}/voice/transcribe`, fd, { withCredentials: true });
      const userText = (trans.data?.text || "").trim();
      if (!userText) {
        toast.info("Didn't catch that — try again");
        return;
      }
      setMessages(m => [
        ...m,
        { role: "user", text: userText },
        { id: thinkingId, role: "octon", text: "…", placeholder: true },
      ]);

      // 2) Chat + TTS
      const chat = await axios.post(
        `${API}/voice/chat`,
        {
          text: userText,
          session_id: sessionId,
          selected_incident_id: selectedIncidentId || null,
          include_audio: true,
          voice: voiceName,
        },
        { withCredentials: true }
      );
      const { reply_text, audio_base64, audio_mime, session_id: sid, action, action_args, action_confidence } = chat.data || {};
      if (sid) setSessionId(sid);
      if (reply_text) {
        // Replace the placeholder bubble with the real reply
        setMessages(m => m.map(x => x.id === thinkingId
          ? { role: "octon", text: reply_text, action }
          : x));
      } else {
        setMessages(m => m.filter(x => x.id !== thinkingId));
      }

      // Dispatch voice action (if any)
      if (action && action !== "chat" && action_confidence >= 0.6 && onVoiceAction) {
        try { await onVoiceAction(action, action_args || {}); } catch { /* ignore */ }
      }

      // 3) Play audio
      if (audio_base64 && audioElRef.current) {
        try {
          // Convert base64 → Blob → object URL. Chrome handles large Blob
          // URLs far better than very long data: URLs, and Safari sometimes
          // refuses data: URLs for <audio> entirely.
          const mime = audio_mime || "audio/mpeg";
          const bin = atob(audio_base64);
          const bytes = new Uint8Array(bin.length);
          for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
          const blob = new Blob([bytes], { type: mime });
          const url = URL.createObjectURL(blob);
          const audioEl = audioElRef.current;
          // Clean up a previous object URL if present
          if (audioEl._octonPrevUrl) {
            try { URL.revokeObjectURL(audioEl._octonPrevUrl); } catch {/* noop */}
          }
          audioEl._octonPrevUrl = url;
          audioEl.src = url;
          audioEl.onended = () => setSpeaking(false);
          audioEl.onerror = () => {
            setSpeaking(false);
            toast.error("Could not play OCTON audio");
          };
          setSpeaking(true);
          const playPromise = audioEl.play();
          if (playPromise && typeof playPromise.then === "function") {
            playPromise.catch((err) => {
              setSpeaking(false);
              if (err?.name === "NotAllowedError") {
                // Chrome blocked autoplay (the await broke the user-gesture chain).
                // Offer a one-tap unlock: clicking the mic (or any button in the
                // panel) will play the stored audio.
                setPendingAudioUrl(url);
                toast.info("Browser blocked audio autoplay — tap the speaker button to hear OCTON.", { duration: 6000 });
              } else {
                toast.error(`Playback failed: ${err?.message || err?.name || "unknown"}`);
              }
            });
          }
        } catch (e) {
          setSpeaking(false);
          toast.error(`Audio decode failed: ${e?.message || "unknown"}`);
        }
      }
    } catch (err) {
      // Remove the thinking placeholder on error so the UI isn't left stuck
      setMessages(m => m.filter(x => x.id !== thinkingId));
      const detail = err?.response?.data?.detail || err?.message || "unknown";
      // Highlight a specific, common root cause so users can act on it fast
      if (/budget|quota|insufficient|401|402|429/i.test(String(detail))) {
        toast.error("LLM budget exhausted. Top up at Profile → Universal Key → Add Balance.");
      } else if (/transcri/i.test(String(detail))) {
        toast.error(`Transcription failed: ${detail}`);
      } else {
        toast.error(`OCTON error: ${detail}`);
      }
    } finally {
      setThinking(false);
    }
  }, [sessionId, selectedIncidentId, onVoiceAction, voiceName]);

  const toggleRecording = () => {
    if (recording) stopRecording();
    else startRecording();
  };

  // Once the panel is opened (a user gesture), prime the <audio> element so
  // subsequent .play() calls that happen after an async await chain aren't
  // blocked by Chrome's autoplay policy. We load and pause on a 1x1 silent
  // MP3 data URL — that counts as "user-initiated audio playback" from then on.
  useEffect(() => {
    if (!open || !audioElRef.current) return;
    const el = audioElRef.current;
    // Tiny silent MP3 (~1ms, base64). Safe to load once per mount.
    const SILENT_MP3 =
      "data:audio/mpeg;base64,//uQxAAAAAAAAAAAAAAAAAAAAAAAWGluZwAAAA8AAAACAAACcQCA" +
      "gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIA==";
    try {
      el.muted = true;
      el.src = SILENT_MP3;
      const p = el.play();
      if (p && typeof p.then === "function") {
        p.then(() => { el.pause(); el.currentTime = 0; el.muted = false; })
         .catch(() => { el.muted = false; /* still ok, nothing to do */ });
      } else {
        el.muted = false;
      }
    } catch { /* best effort */ }
  }, [open]);

  const clearConversation = () => {
    setMessages([]);
    setSessionId(null);
    toast.info("Conversation cleared");
  };

  // ── Wake-word "Hey OCTON" via Web Speech API (client-side, free) ──
  const stopWakeListener = useCallback(() => {
    if (wakeRestartTimerRef.current) { clearTimeout(wakeRestartTimerRef.current); wakeRestartTimerRef.current = null; }
    try { wakeRecRef.current?.stop(); } catch {/* ignore */}
    wakeRecRef.current = null;
  }, []);

  const startWakeListener = useCallback(() => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) {
      setWakeSupported(false);
      toast.error("Wake-word needs Chrome/Edge — not supported here");
      return;
    }
    stopWakeListener();
    const rec = new SR();
    rec.continuous = true;
    rec.interimResults = true;
    rec.lang = "en-US";

    rec.onresult = (event) => {
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const transcript = event.results[i][0].transcript.toLowerCase();
        // Very tolerant — catches "hey octon", "hey oxton", "hey octan", "hey octopus" etc
        if (/\bhey\s*(o(c|x|k|g)t(on|an|in|um|us)?|octopus)\b/i.test(transcript)) {
          try { rec.stop(); } catch {/* ignore */}
          toast.success("OCTON wake word detected — listening");
          setTimeout(() => startRecording(), 150);
          return;
        }
      }
    };
    rec.onerror = (e) => {
      // NB: "no-speech" and "aborted" are expected, recover silently
      if (e.error !== "no-speech" && e.error !== "aborted") {
        console.warn("wake listener error", e.error);
      }
    };
    rec.onend = () => {
      // Auto-restart while wake is still enabled and we're not mid-record/thinking
      if (wakeRecRef.current === rec && !recording && !thinking) {
        wakeRestartTimerRef.current = setTimeout(() => {
          try { rec.start(); } catch {/* ignore */}
        }, 500);
      }
    };

    try {
      rec.start();
      wakeRecRef.current = rec;
    } catch (e) {
      console.warn("wake start failed", e);
    }
  }, [stopWakeListener, startRecording, recording, thinking]);

  const toggleWake = useCallback(() => {
    if (wakeOn) {
      stopWakeListener();
      setWakeOn(false);
      toast.info("Wake-word off");
    } else {
      setWakeOn(true);
      startWakeListener();
      toast.success("Say \u201cHey OCTON\u201d to activate");
    }
  }, [wakeOn, stopWakeListener, startWakeListener]);

  // Pause wake listener during active recording / thinking so it doesn't re-trigger on OCTON's own voice
  useEffect(() => {
    if (!wakeOn) return;
    if (recording || thinking || speaking) {
      stopWakeListener();
    } else {
      startWakeListener();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wakeOn, recording, thinking, speaking]);

  useEffect(() => () => stopWakeListener(), [stopWakeListener]);

  useEffect(() => {
    const el = audioElRef.current;
    if (!el) return;
    const onEnd = () => setSpeaking(false);
    el.addEventListener("ended", onEnd);
    el.addEventListener("pause", onEnd);
    return () => {
      el.removeEventListener("ended", onEnd);
      el.removeEventListener("pause", onEnd);
    };
  }, []);

  return (
    <>
      <audio ref={audioElRef} preload="auto" className="hidden" />

      {/* Floating launcher */}
      {!open && (
        <div className="fixed bottom-24 right-6 z-[60] flex items-center gap-2" data-testid="octon-voice-dock">
          {/* Always-visible "Talk to OCTON VAR" pill */}
          <button
            onClick={() => setOpen(true)}
            data-testid="octon-voice-label"
            className="h-10 px-3 flex items-center gap-2 border border-[#00E5FF]/40 bg-[#050505]/90 hover:bg-[#00E5FF]/10 transition-all"
            style={{ boxShadow: "0 0 14px rgba(0,229,255,0.18)" }}
          >
            <Waves className="w-3 h-3 text-[#00E5FF] animate-pulse" />
            <span className="text-[10px] font-heading font-bold tracking-[0.22em] uppercase text-[#00E5FF]">
              Talk to OCTON VAR
            </span>
          </button>
          {/* Brain launcher */}
          <button
            onClick={() => setOpen(true)}
            data-testid="octon-voice-launcher"
            className="h-14 w-14 flex items-center justify-center border border-[#00E5FF]/40 bg-[#050505] hover:bg-[#00E5FF]/10 transition-all group relative"
            style={{ boxShadow: "0 0 24px rgba(0,229,255,0.25), inset 0 0 20px rgba(0,229,255,0.05)" }}
            title="Talk to OCTON VAR"
          >
            <div className="absolute inset-0 border border-[#00E5FF]/60 animate-pulse" style={{ margin: 3 }} />
            <div className="relative">
              <OctonBrainLogo size={30} />
            </div>
            <span className="absolute -top-1 -right-1 text-[7px] font-mono font-bold text-[#00E5FF] bg-black px-1 border border-[#00E5FF]/40 tracking-widest">AI</span>
          </button>
        </div>
      )}

      {/* Dock panel */}
      {open && (
        <div
          className="fixed bottom-24 right-6 z-[60] w-[380px] max-h-[640px] flex flex-col border border-[#00E5FF]/30 bg-[#050505]/95 backdrop-blur-md"
          style={{ boxShadow: "0 0 40px rgba(0,229,255,0.2), inset 0 0 60px rgba(0,229,255,0.04)" }}
          data-testid="octon-voice-panel"
        >
          {/* Accent strip */}
          <div className="absolute top-0 left-0 w-full h-[2px] bg-gradient-to-r from-transparent via-[#00E5FF] to-transparent opacity-70" />
          {/* Corner brackets */}
          <div className="absolute top-2 left-2 w-3 h-3 border-l border-t border-[#00E5FF]/40 pointer-events-none" />
          <div className="absolute top-2 right-2 w-3 h-3 border-r border-t border-[#00E5FF]/40 pointer-events-none" />
          <div className="absolute bottom-2 left-2 w-3 h-3 border-l border-b border-[#00E5FF]/40 pointer-events-none" />
          <div className="absolute bottom-2 right-2 w-3 h-3 border-r border-b border-[#00E5FF]/40 pointer-events-none" />

          {/* Header */}
          <div className="flex items-center justify-between px-4 pt-4 pb-3 border-b border-white/[0.06]">
            <div className="flex items-center gap-2.5">
              <div className="relative">
                <div className="absolute inset-0 bg-[#00E5FF]/15 rounded-full blur-md" />
                <OctonBrainLogo size={28} />
              </div>
              <div>
                <h2 className="text-sm font-heading font-black text-white tracking-tight uppercase leading-none" style={{ textShadow: "0 0 8px #00E5FF33" }}>OCTON</h2>
                <p className="text-[8px] font-mono text-[#00E5FF]/60 tracking-[0.25em] mt-1">
                  {recording ? "LISTENING" : thinking ? "THINKING" : speaking ? "SPEAKING" : wakeOn ? "ARMED \u00B7 SAY \u201CHEY OCTON\u201D" : "STANDBY"}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-1 relative">
              {/* ── Voice picker ── */}
              <button
                onClick={() => setShowVoicePicker(v => !v)}
                className={`h-7 px-2 flex items-center gap-1 text-[9px] font-mono uppercase tracking-[0.15em] border transition-all ${
                  showVoicePicker
                    ? "text-[#00E5FF] border-[#00E5FF]/50 bg-[#00E5FF]/[0.1]"
                    : "text-gray-400 border-white/10 hover:text-[#00E5FF] hover:border-[#00E5FF]/40"
                }`}
                title={`Voice: ${voiceName}`}
                data-testid="octon-voice-picker-toggle"
              >
                <Sliders className="w-3 h-3" />
                <span>{voiceName.toUpperCase()}</span>
              </button>
              {showVoicePicker && (
                <div
                  className="absolute top-9 right-0 z-[70] w-60 bg-[#050505] border border-[#00E5FF]/30 shadow-[0_0_30px_rgba(0,229,255,0.2)]"
                  data-testid="octon-voice-picker-menu"
                >
                  <div className="px-3 py-2 border-b border-white/[0.06] flex items-center justify-between">
                    <span className="text-[9px] font-mono uppercase tracking-[0.25em] text-[#00E5FF]">// Voice (US English)</span>
                    <button
                      onClick={() => setShowVoicePicker(false)}
                      className="text-gray-500 hover:text-white"
                      aria-label="Close voice picker"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                  <div className="max-h-[280px] overflow-y-auto octon-scrollbar py-1">
                    {VOICE_OPTIONS.map(v => {
                      const isSelected = voiceName === v.id;
                      const isPreviewing = previewingVoice === v.id;
                      return (
                        <div
                          key={v.id}
                          className={`w-full flex items-center justify-between gap-2 px-3 py-2 transition-all ${
                            isSelected
                              ? "bg-[#00E5FF]/[0.08] border-l-2 border-[#00E5FF]"
                              : "border-l-2 border-transparent hover:bg-white/[0.04]"
                          }`}
                          data-testid={`octon-voice-option-${v.id}`}
                        >
                          {/* Preview button */}
                          <button
                            onClick={(e) => { e.stopPropagation(); playVoicePreview(v.id); }}
                            className={`flex-none h-7 w-7 flex items-center justify-center border transition-all ${
                              isPreviewing
                                ? "border-[#00FF88] bg-[#00FF88]/15 text-[#00FF88] animate-pulse"
                                : "border-white/10 hover:border-[#00E5FF]/60 text-gray-400 hover:text-[#00E5FF]"
                            }`}
                            title={isPreviewing ? "Stop preview" : `Preview ${v.label}`}
                            data-testid={`octon-voice-preview-${v.id}`}
                          >
                            {isPreviewing ? <Pause className="w-3 h-3" /> : <Play className="w-3 h-3" />}
                          </button>
                          {/* Select row (label + gender chip + check) */}
                          <button
                            onClick={() => { changeVoice(v.id); setShowVoicePicker(false); toast.success(`Voice set to ${v.label}`); }}
                            className="flex-1 flex items-center justify-between gap-2 text-left"
                            data-testid={`octon-voice-select-${v.id}`}
                          >
                            <div className="flex flex-col gap-0.5 min-w-0">
                              <span className={`text-[11px] font-mono font-bold tracking-wide truncate ${isSelected ? "text-[#00E5FF]" : "text-white"}`}>
                                {v.label}
                              </span>
                              <span className="text-[9px] font-mono text-gray-500 tracking-wide truncate">{v.desc}</span>
                            </div>
                            <div className="flex items-center gap-1 flex-none">
                              <span className="text-[8px] font-mono text-gray-600 px-1 border border-white/10">{v.gender}</span>
                              {isSelected && <Check className="w-3 h-3 text-[#00E5FF]" />}
                            </div>
                          </button>
                        </div>
                      );
                    })}
                  </div>
                  <div className="px-3 py-1.5 border-t border-white/[0.06] text-[8px] font-mono text-gray-600 tracking-[0.2em] uppercase">
                    // syncs across your devices · ▶ to preview
                  </div>
                </div>
              )}
              {wakeSupported && (
                <button
                  onClick={toggleWake}
                  className={`h-7 px-2 flex items-center gap-1 text-[9px] font-mono uppercase tracking-[0.15em] border transition-all ${
                    wakeOn
                      ? "text-[#00FF88] border-[#00FF88]/40 bg-[#00FF88]/[0.08] hover:bg-[#00FF88]/[0.15]"
                      : "text-gray-500 border-white/10 hover:text-white hover:border-white/30"
                  }`}
                  title={wakeOn ? "Wake-word ON — say \u201cHey OCTON\u201d" : "Enable wake-word"}
                  data-testid="octon-wake-toggle"
                >
                  {wakeOn ? <Ear className="w-3 h-3" /> : <EarOff className="w-3 h-3" />}
                  {wakeOn ? "WAKE" : "WAKE"}
                  {wakeOn && <span className="w-1 h-1 bg-[#00FF88] rounded-full animate-pulse ml-0.5" />}
                </button>
              )}
              {messages.length > 0 && (
                <button
                  onClick={clearConversation}
                  className="h-7 w-7 flex items-center justify-center text-gray-500 hover:text-white border border-white/10 hover:border-white/30 transition-all"
                  title="Clear conversation"
                  data-testid="octon-voice-clear"
                >
                  <MessageSquareText className="w-3.5 h-3.5" />
                </button>
              )}
              <button
                onClick={() => { stopRecording(); stopWakeListener(); setWakeOn(false); setOpen(false); }}
                className="h-7 w-7 flex items-center justify-center text-gray-500 hover:text-white border border-white/10 hover:border-white/30 transition-all"
                title="Close"
                data-testid="octon-voice-close"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Transcript */}
          <div className="flex-1 overflow-y-auto octon-scrollbar px-4 py-4 space-y-3 min-h-[180px]" data-testid="octon-voice-transcript">
            {messages.length === 0 ? (
              <div className="text-center pt-6 pb-2">
                <p className="text-[11px] font-mono text-gray-500 tracking-wide">Tap the mic and ask me anything.</p>
                <p className="text-[9px] font-mono text-gray-600 tracking-wider mt-2 uppercase">// "Explain the selected incident"</p>
                <p className="text-[9px] font-mono text-gray-600 tracking-wider uppercase">// "How many red cards this match?"</p>
                <p className="text-[9px] font-mono text-gray-600 tracking-wider uppercase">// "Cite IFAB Law 12"</p>
              </div>
            ) : (
              messages.map((m, i) => (
                <div key={m.id || i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`} data-testid={`voice-msg-${m.role}-${i}`}>
                  <div
                    className={`max-w-[85%] px-3 py-2 border text-xs leading-relaxed ${
                      m.role === "user"
                        ? "border-white/10 bg-white/[0.04] text-gray-300"
                        : "border-[#00E5FF]/30 bg-[#00E5FF]/[0.06] text-white"
                    }`}
                  >
                    {m.role === "octon" && (
                      <div className="flex items-center gap-1.5 mb-1 flex-wrap">
                        <div className="w-1 h-1 bg-[#00E5FF]" />
                        <span className="text-[8px] font-mono text-[#00E5FF] tracking-[0.25em]">OCTON</span>
                        {m.placeholder && (
                          <span className="text-[8px] font-mono text-[#FFB800] tracking-[0.25em] animate-pulse">THINKING…</span>
                        )}
                        {m.action && m.action !== "chat" && (
                          <span className="text-[8px] font-mono text-[#00FF88] tracking-[0.2em] px-1 py-0.5 border border-[#00FF88]/30 bg-[#00FF88]/[0.05] uppercase">
                            → {m.action.replace(/_/g, " ")}
                          </span>
                        )}
                      </div>
                    )}
                    {m.placeholder ? (
                      <span className="inline-flex gap-1 items-center">
                        <span className="w-1.5 h-1.5 bg-[#00E5FF] animate-bounce" style={{ animationDelay: "0ms" }} />
                        <span className="w-1.5 h-1.5 bg-[#00E5FF] animate-bounce" style={{ animationDelay: "120ms" }} />
                        <span className="w-1.5 h-1.5 bg-[#00E5FF] animate-bounce" style={{ animationDelay: "240ms" }} />
                      </span>
                    ) : m.text}
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Mic panel */}
          <div className="px-4 py-4 border-t border-white/[0.06] relative">
            {/* Audio bars */}
            <div className="flex items-end justify-center gap-1.5 h-8 mb-3">
              {levels.map((v, i) => (
                <div
                  key={i}
                  className="w-1.5 rounded-sm transition-all duration-75"
                  style={{
                    height: `${Math.max(8, v * 32)}px`,
                    backgroundColor: recording ? "#00E5FF" : "#1a1a1a",
                    boxShadow: recording ? `0 0 6px #00E5FF${Math.floor(v * 160).toString(16).padStart(2, "0")}` : "none",
                    opacity: recording ? 0.4 + v * 0.6 : 0.3,
                  }}
                />
              ))}
            </div>

            {/* Mic button */}
            <div className="flex items-center justify-center gap-3">
              <button
                onClick={toggleRecording}
                disabled={thinking}
                data-testid="octon-mic-button"
                className={`h-14 w-14 flex items-center justify-center border-2 transition-all relative ${
                  recording
                    ? "border-[#FF2A2A] bg-[#FF2A2A]/15 hover:bg-[#FF2A2A]/25"
                    : thinking
                    ? "border-[#FFB800]/60 bg-[#FFB800]/10 cursor-wait"
                    : "border-[#00E5FF]/60 bg-[#00E5FF]/10 hover:bg-[#00E5FF]/20 hover:border-[#00E5FF]"
                }`}
                style={{
                  boxShadow: recording
                    ? "0 0 24px rgba(255,42,42,0.5)"
                    : thinking
                    ? "0 0 20px rgba(255,184,0,0.4)"
                    : "0 0 20px rgba(0,229,255,0.3)",
                }}
                title={recording ? "Stop recording" : thinking ? "Processing…" : "Start recording"}
              >
                {recording && <div className="absolute inset-0 border-2 border-[#FF2A2A] animate-ping" />}
                {thinking ? (
                  <Loader2 className="w-6 h-6 text-[#FFB800] animate-spin" />
                ) : speaking ? (
                  <Waves className="w-6 h-6 text-[#00E5FF] animate-pulse" />
                ) : (
                  <Mic className={`w-6 h-6 ${recording ? "text-[#FF2A2A]" : "text-[#00E5FF]"}`} />
                )}
              </button>
              {/* Manual-play unlock button (appears when browser blocked autoplay) */}
              {pendingAudioUrl && !speaking && (
                <button
                  onClick={() => {
                    const el = audioElRef.current;
                    if (!el) return;
                    // This click IS a user gesture, so play() will succeed
                    el.play().then(() => {
                      setSpeaking(true);
                      setPendingAudioUrl(null);
                    }).catch(() => {
                      toast.error("Still blocked — check your tab's audio permission");
                    });
                  }}
                  className="h-12 px-3 flex items-center gap-2 border-2 border-[#FFB800]/60 bg-[#FFB800]/10 hover:bg-[#FFB800]/25 transition-all octon-pulse-amber"
                  data-testid="octon-voice-unlock"
                  title="Tap to hear OCTON's reply (autoplay blocked)"
                >
                  <Volume2 className="w-5 h-5 text-[#FFB800]" />
                  <span className="text-[9px] font-mono font-bold tracking-[0.15em] uppercase text-[#FFB800]">
                    Play Reply
                  </span>
                </button>
              )}
            </div>
            <p className="text-center text-[9px] font-mono text-gray-500 tracking-[0.2em] uppercase mt-2">
              {recording ? "TAP TO STOP" : thinking ? "TRANSCRIBING…" : speaking ? "OCTON SPEAKING" : "TAP TO TALK"}
            </p>
          </div>
        </div>
      )}
    </>
  );
}
