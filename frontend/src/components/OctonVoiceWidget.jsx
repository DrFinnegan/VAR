import { useState, useRef, useEffect, useCallback } from "react";
import axios from "axios";
import { toast } from "sonner";
import { Mic, X, Loader2, Waves, MessageSquareText, Ear, EarOff } from "lucide-react";
import { OctonBrainLogo } from "./OctonBrainLogo";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

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
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      startAudioAnalysis(stream);
      audioChunksRef.current = [];
      // Prefer webm/opus — best browser support for MediaRecorder
      const mr = new MediaRecorder(stream, { mimeType: "audio/webm" });
      mr.ondataavailable = (e) => { if (e.data.size > 0) audioChunksRef.current.push(e.data); };
      mr.onstop = async () => {
        stopAudioAnalysis();
        try { stream.getTracks().forEach(t => t.stop()); } catch { /* ignore */ }
        const blob = new Blob(audioChunksRef.current, { type: "audio/webm" });
        if (blob.size < 1500) {
          toast.error("Recording too short — hold the mic a bit longer");
          return;
        }
        await processAudio(blob);
      };
      mediaRecorderRef.current = mr;
      mr.start();
      setRecording(true);
      // Safety auto-stop after 25 s
      setTimeout(() => {
        if (mr.state === "recording") mr.stop();
      }, 25000);
    } catch (err) {
      toast.error("Microphone access denied");
    }
  }, [recording, thinking, startAudioAnalysis, stopAudioAnalysis]);

  const stopRecording = useCallback(() => {
    const mr = mediaRecorderRef.current;
    if (mr && mr.state === "recording") {
      mr.stop();
    }
    setRecording(false);
  }, []);

  const processAudio = useCallback(async (blob) => {
    setThinking(true);
    try {
      // 1) Transcribe
      const fd = new FormData();
      fd.append("audio", blob, "voice.webm");
      const trans = await axios.post(`${API}/voice/transcribe`, fd, { withCredentials: true });
      const userText = (trans.data?.text || "").trim();
      if (!userText) {
        toast.info("Didn't catch that — try again");
        return;
      }
      setMessages(m => [...m, { role: "user", text: userText }]);

      // 2) Chat + TTS
      const chat = await axios.post(
        `${API}/voice/chat`,
        {
          text: userText,
          session_id: sessionId,
          selected_incident_id: selectedIncidentId || null,
          include_audio: true,
          voice: "onyx",
        },
        { withCredentials: true }
      );
      const { reply_text, audio_base64, audio_mime, session_id: sid, action, action_args, action_confidence } = chat.data || {};
      if (sid) setSessionId(sid);
      if (reply_text) setMessages(m => [...m, { role: "octon", text: reply_text, action }]);

      // Dispatch voice action (if any)
      if (action && action !== "chat" && action_confidence >= 0.6 && onVoiceAction) {
        try { await onVoiceAction(action, action_args || {}); } catch { /* ignore */ }
      }

      // 3) Play audio
      if (audio_base64 && audioElRef.current) {
        audioElRef.current.src = `data:${audio_mime || "audio/mpeg"};base64,${audio_base64}`;
        audioElRef.current.play().catch(() => {});
        setSpeaking(true);
      }
    } catch (err) {
      toast.error(err?.response?.data?.detail || "OCTON couldn't respond — try again");
    } finally {
      setThinking(false);
    }
  }, [sessionId, selectedIncidentId, onVoiceAction]);

  const toggleRecording = () => {
    if (recording) stopRecording();
    else startRecording();
  };

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
        <button
          onClick={() => setOpen(true)}
          data-testid="octon-voice-launcher"
          className="fixed bottom-6 right-6 z-[60] h-14 w-14 flex items-center justify-center border border-[#00E5FF]/40 bg-[#050505] hover:bg-[#00E5FF]/10 transition-all group"
          style={{ boxShadow: "0 0 24px rgba(0,229,255,0.25), inset 0 0 20px rgba(0,229,255,0.05)" }}
          title="Talk to OCTON"
        >
          <div className="absolute inset-0 border border-[#00E5FF]/60 animate-pulse" style={{ margin: 3 }} />
          <div className="relative">
            <OctonBrainLogo size={30} />
          </div>
          <span className="absolute -top-1 -right-1 text-[7px] font-mono font-bold text-[#00E5FF] bg-black px-1 border border-[#00E5FF]/40 tracking-widest">AI</span>
        </button>
      )}

      {/* Dock panel */}
      {open && (
        <div
          className="fixed bottom-6 right-6 z-[60] w-[380px] max-h-[640px] flex flex-col border border-[#00E5FF]/30 bg-[#050505]/95 backdrop-blur-md"
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
            <div className="flex items-center gap-1">
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
                <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`} data-testid={`voice-msg-${m.role}-${i}`}>
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
                        {m.action && m.action !== "chat" && (
                          <span className="text-[8px] font-mono text-[#00FF88] tracking-[0.2em] px-1 py-0.5 border border-[#00FF88]/30 bg-[#00FF88]/[0.05] uppercase">
                            → {m.action.replace(/_/g, " ")}
                          </span>
                        )}
                      </div>
                    )}
                    {m.text}
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
            <div className="flex items-center justify-center">
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
