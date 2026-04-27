/**
 * Live VAR Page — primary control-room dashboard.
 * Drives incident creation, live video stage, OCTON analysis panel, and
 * the right-rail decision controls. Wires up the global voice-action
 * dispatcher so "Hey OCTON, confirm" can act on the selected incident.
 */
import { useCallback, useEffect, useState } from "react";
import axios from "axios";
import { toast } from "sonner";
import {
  Video, AlertTriangle, CheckCircle2, XCircle, Clock, RefreshCw, Upload,
  Brain, Target, Wifi, WifiOff, Image as ImageIcon, History, FileText,
  Sparkles, BookOpen, GitBranch, Columns,
} from "lucide-react";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Textarea } from "../components/ui/textarea";
import { Label } from "../components/ui/label";
import { Progress } from "../components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogDescription } from "../components/ui/dialog";
import { ScrollArea } from "../components/ui/scroll-area";

import { API } from "../lib/api";
import { incidentTypeConfig } from "../lib/config";
import { useAuth } from "../contexts/AuthContext";
import { useSelectedIncidentId, frameCaptureRef } from "../contexts/SelectedIncidentContext";
import { useWebSocket } from "../hooks/useWebSocket";
import { exportAnalysisPDF } from "../utils/pdfExport";

import { OctonBrainLogo } from "../components/OctonBrainLogo";
import { ConfidenceScore, CopyButton, CurtainSection } from "../components/OctonAnalysisParts";
import { IncidentBadge, DecisionBadge } from "../components/Badges";
import { DecisionTicker } from "../components/DecisionTicker";
import { BrainPathway } from "../components/BrainPathway";
import { VideoStage } from "../components/VideoStage";
import { DecisionComparisonMode } from "../components/DecisionComparisonMode";

export const LiveVARPage = () => {
  const { user } = useAuth();
  const [incidents, setIncidents] = useState([]);
  const [selectedIncident, setSelectedIncident] = useState(null);
  const { setId: setGlobalSelectedId, voiceActionHandler } = useSelectedIncidentId();
  useEffect(() => {
    setGlobalSelectedId(selectedIncident?.id || null);
  }, [selectedIncident?.id, setGlobalSelectedId]);
  const [analytics, setAnalytics] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showNewIncident, setShowNewIncident] = useState(false);
  const [newIncident, setNewIncident] = useState({ incident_type: "foul", description: "", timestamp_in_match: "", team_involved: "", player_involved: "", image_base64: null, video_base64: null });
  const [previewImage, setPreviewImage] = useState(null);
  const [previewVideo, setPreviewVideo] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [showComparison, setShowComparison] = useState(false);

  const wsConnected = useWebSocket(useCallback((msg) => {
    if (msg.type === "incident_created" || msg.type === "decision_made" || msg.type === "analysis_complete") {
      fetchData();
      if (msg.type === "incident_created") toast.info(msg.message);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []));

  const fetchData = useCallback(async () => {
    try {
      const [incRes, anaRes] = await Promise.all([
        axios.get(`${API}/incidents?limit=20`),
        axios.get(`${API}/analytics/overview`),
      ]);
      setIncidents(incRes.data);
      setAnalytics(anaRes.data);
      if (incRes.data.length > 0 && !selectedIncident) setSelectedIncident(incRes.data[0]);
    } catch { toast.error("Failed to load data"); }
    finally { setLoading(false); }
  }, [selectedIncident]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleImageChange = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onloadend = () => {
      const b64 = reader.result.split(",")[1];
      setNewIncident(prev => ({ ...prev, image_base64: b64 }));
      setPreviewImage(reader.result);
    };
    reader.readAsDataURL(file);
  };

  const handleVideoChange = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 12 * 1024 * 1024) {
      toast.error(`Video too large (${(file.size / 1024 / 1024).toFixed(1)} MB). Max 12 MB — please trim the clip.`);
      e.target.value = "";
      return;
    }
    toast.info(`Reading ${(file.size / 1024 / 1024).toFixed(1)} MB clip…`);
    const reader = new FileReader();
    reader.onloadend = () => {
      const b64 = reader.result.split(",")[1];
      setNewIncident(prev => ({ ...prev, video_base64: b64 }));
      setPreviewVideo(URL.createObjectURL(file));
      toast.success("Video ready — OCTON will extract a frame for analysis on submit");
    };
    reader.onerror = () => toast.error("Could not read the video file");
    reader.readAsDataURL(file);
  };

  const handleCreateIncident = async () => {
    if (!newIncident.description) { toast.error("Provide a description"); return; }
    setSubmitting(true);
    try {
      const res = await axios.post(`${API}/incidents`, newIncident);
      toast.success("OCTON analysis complete!");
      const warnings = res.data?.storage_warnings || [];
      warnings.forEach(w => {
        toast.warning(w.message, { duration: 8000 });
      });
      setSelectedIncident(res.data);
      setShowNewIncident(false);
      setNewIncident({ incident_type: "foul", description: "", timestamp_in_match: "", team_involved: "", player_involved: "", image_base64: null, video_base64: null });
      setPreviewImage(null);
      fetchData();
    } catch { toast.error("Failed to create incident"); }
    finally { setSubmitting(false); }
  };

  const handleReanalyze = async () => {
    if (!selectedIncident) return;
    try {
      toast.loading("OCTON reanalyzing...");
      const res = await axios.post(`${API}/incidents/${selectedIncident.id}/reanalyze`);
      setSelectedIncident(res.data);
      toast.dismiss();
      toast.success("Lightning speed reanalysis complete!");
      fetchData();
    } catch { toast.dismiss(); toast.error("Reanalysis failed"); }
  };

  const handleDecision = async (status, decision) => {
    if (!selectedIncident) return;
    try {
      const res = await axios.put(`${API}/incidents/${selectedIncident.id}/decision`, {
        decision_status: status, final_decision: decision, decided_by: user?.name || "VAR_Operator"
      });
      setSelectedIncident(res.data);
      toast.success("Decision recorded!"); fetchData();
    } catch { toast.error("Failed to record decision"); }
  };

  if (loading) return (
    <div className="flex-1 flex items-center justify-center bg-[#050505]">
      <div className="text-center"><div className="text-sm font-mono text-[#00E5FF] animate-pulse">INITIALIZING OCTON VAR...</div><Progress value={65} className="w-64 mt-4" /></div>
    </div>
  );

  const analysis = selectedIncident?.ai_analysis;

  // Voice action dispatcher — "Hey OCTON, confirm" etc. (registered once per change)
  voiceActionHandler.current = async (action, args) => {
    if (!selectedIncident && ["confirm_decision","overturn_decision","reanalyze","export_pdf","promote_training","open_precedents"].includes(action)) {
      toast.error("No incident selected"); return;
    }
    switch (action) {
      case "confirm_decision":
        await handleDecision("confirmed", analysis?.suggested_decision || selectedIncident?.final_decision || "Confirmed by voice");
        break;
      case "overturn_decision":
        await handleDecision("overturned", selectedIncident?.final_decision || "Overturned by voice — specify ruling");
        break;
      case "reanalyze":
        await handleReanalyze();
        break;
      case "export_pdf": {
        let audit = null;
        try { const r = await axios.post(`${API}/audit/register`, { incident_id: selectedIncident.id }); audit = r.data; } catch { /* degrade */ }
        const frame = (typeof frameCaptureRef.current === "function") ? frameCaptureRef.current() : null;
        try { exportAnalysisPDF(selectedIncident, analysis, audit, { frameImage: frame }); toast.success("Report exported"); } catch { toast.error("Export failed"); }
        break;
      }
      case "promote_training":
        try {
          const r = await axios.post(`${API}/incidents/${selectedIncident.id}/promote-to-training`);
          toast.success(r.data?.status === "already_promoted" ? "Already in library" : "Promoted to Training Library");
        } catch (e) { toast.error(e?.response?.data?.detail || "Promotion failed"); }
        break;
      case "open_incident": {
        const idx = Math.max(1, Math.min(incidents.length, Number(args?.index || 1))) - 1;
        const target = incidents[idx];
        if (target) { setSelectedIncident(target); toast.info(`Incident ${idx+1} loaded`); }
        break;
      }
      default: break;
    }
  };

  return (
    <div className="flex-1 min-w-0 p-4 space-y-4 bg-[#050505] grid-overlay overflow-y-auto h-screen" data-testid="live-var-dashboard">
      <DecisionTicker incidents={incidents} onSelect={(inc) => setSelectedIncident(inc)} />

      {/* Header */}
      <div className="flex items-center justify-between border-b border-white/[0.06] pb-4">
        <div className="flex items-center gap-4">
          <div className="relative flex-none">
            <div className="absolute inset-0 rounded-full bg-[#00E5FF]/10 blur-xl" />
            <OctonBrainLogo size={56} />
          </div>
          <div>
            <div className="flex items-center gap-3 mb-1">
              <div className="w-[3px] h-9 bg-[#00E5FF]" style={{ boxShadow: "0 0 10px #00E5FFbb" }} />
              <h1 className="text-4xl font-heading font-black text-white tracking-tighter uppercase leading-none">
                OCTON <span className="text-[#00E5FF]" style={{ textShadow: "0 0 16px #00E5FF88" }}>VAR</span>
              </h1>
              <span className="px-1.5 py-0.5 border border-[#00E5FF]/30 text-[8px] font-mono tracking-[0.2em] text-[#00E5FF]/80 bg-[#00E5FF]/[0.05]">NEOCORTEX · v2.1</span>
            </div>
            <div className="flex items-center gap-2 mt-1 ml-[12px]">
              <div className="w-1 h-1 bg-[#00E5FF]/60 animate-pulse" />
              <p className="text-[10px] font-mono text-gray-500 tracking-[0.15em] uppercase">
                Forensic Incident Analysis · Dual-Brain Decision Support
              </p>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 px-3 py-1.5 border border-white/[0.08] bg-[#0A0A0A] relative">
            <div className="absolute top-0 left-0 w-full h-[1px]" style={{ backgroundColor: wsConnected ? "#00FF88" : "#FF2A2A", opacity: 0.5 }} />
            {wsConnected ? <Wifi className="w-3 h-3 text-[#00FF88] glow-green" /> : <WifiOff className="w-3 h-3 text-[#FF2A2A]" />}
            <span className="text-[10px] font-mono tracking-[0.2em]" style={{ color: wsConnected ? '#00FF88' : '#FF2A2A' }}>{wsConnected ? "LIVE SYNC" : "OFFLINE"}</span>
            {wsConnected && <span className="w-1.5 h-1.5 bg-[#00FF88] animate-pulse rounded-full" />}
          </div>
          <Button onClick={() => setShowComparison(!showComparison)} className={`rounded-none font-heading font-bold text-xs tracking-[0.1em] h-9 px-4 active:scale-[0.98] transition-all ${showComparison ? 'bg-[#00E5FF] text-black hover:bg-[#00E5FF]/90' : 'bg-transparent text-[#00E5FF] border border-[#00E5FF]/30 hover:bg-[#00E5FF]/10 hover:border-[#00E5FF]/60'}`} data-testid="comparison-mode-toggle"><Columns className="w-3.5 h-3.5 mr-2" />COMPARE</Button>
          <Dialog open={showNewIncident} onOpenChange={setShowNewIncident}>
            <DialogTrigger asChild>
              <Button className="bg-white text-black hover:bg-gray-200 rounded-none font-heading font-bold text-xs tracking-[0.1em] h-9 px-5 active:scale-[0.98] transition-all" data-testid="new-incident-button"><Upload className="w-3.5 h-3.5 mr-2" />NEW INCIDENT</Button>
            </DialogTrigger>
            <DialogContent className="bg-[#121212] border-white/10 text-white max-w-lg max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle className="font-heading text-xl">Report New Incident</DialogTitle>
                <DialogDescription className="text-gray-400">Submit for OCTON lightning speed analysis</DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label className="text-gray-300">Incident Type</Label>
                  <Select value={newIncident.incident_type} onValueChange={v => setNewIncident({...newIncident, incident_type: v})}>
                    <SelectTrigger className="bg-[#050505] border-white/10 text-white rounded-none"><SelectValue /></SelectTrigger>
                    <SelectContent className="bg-[#121212] border-white/10">
                      {Object.entries(incidentTypeConfig).map(([k, v]) => <SelectItem key={k} value={k} className="text-white">{v.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label className="text-gray-300">Description</Label>
                  <Textarea placeholder="Describe the incident..." value={newIncident.description} onChange={e => setNewIncident({...newIncident, description: e.target.value})} className="bg-[#050505] border-white/10 text-white rounded-none min-h-[80px]" data-testid="incident-description-input" />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2"><Label className="text-gray-300">Match Time</Label><Input placeholder="e.g., 45:30" value={newIncident.timestamp_in_match} onChange={e => setNewIncident({...newIncident, timestamp_in_match: e.target.value})} className="bg-[#050505] border-white/10 text-white rounded-none" /></div>
                  <div className="space-y-2"><Label className="text-gray-300">Team</Label><Input placeholder="Team name" value={newIncident.team_involved} onChange={e => setNewIncident({...newIncident, team_involved: e.target.value})} className="bg-[#050505] border-white/10 text-white rounded-none" /></div>
                </div>
                <div className="space-y-2"><Label className="text-gray-300">Player Involved</Label><Input placeholder="Player name" value={newIncident.player_involved} onChange={e => setNewIncident({...newIncident, player_involved: e.target.value})} className="bg-[#050505] border-white/10 text-white rounded-none" /></div>
                <div className="space-y-2">
                  <Label className="text-gray-300">Upload Frame / Image</Label>
                  <div className="border border-dashed border-white/20 rounded-none p-4 text-center hover:border-[#00E5FF]/50 transition-colors">
                    <input type="file" accept="image/jpeg,image/png,image/webp" onChange={handleImageChange} className="hidden" id="image-upload" data-testid="image-upload-input" />
                    <label htmlFor="image-upload" className="cursor-pointer">
                      {previewImage ? (
                        <img src={previewImage} alt="Preview" className="max-h-32 mx-auto rounded-none" />
                      ) : (
                        <div className="space-y-2"><ImageIcon className="w-8 h-8 text-gray-400 mx-auto" /><p className="text-xs text-gray-400">Click to upload JPEG, PNG, or WebP</p></div>
                      )}
                    </label>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label className="text-gray-300">Video Clip (optional)</Label>
                  <div className="border border-dashed border-white/20 p-4 text-center hover:border-[#00E5FF]/50 transition-colors">
                    <input type="file" accept="video/mp4,video/webm" onChange={handleVideoChange} className="hidden" id="video-upload" data-testid="video-upload-input" />
                    <label htmlFor="video-upload" className="cursor-pointer">
                      {previewVideo ? (
                        <video src={previewVideo} className="max-h-24 mx-auto" muted />
                      ) : (
                        <div className="space-y-2"><Video className="w-8 h-8 text-gray-400 mx-auto" /><p className="text-xs text-gray-400">Upload MP4 or WebM video clip</p></div>
                      )}
                    </label>
                  </div>
                </div>
              </div>
              <DialogFooter>
                <Button variant="ghost" onClick={() => { setShowNewIncident(false); setPreviewImage(null); setPreviewVideo(null); }} className="text-gray-400 hover:text-white">Cancel</Button>
                <Button onClick={handleCreateIncident} disabled={submitting} className="bg-[#00E5FF] text-black hover:bg-[#00E5FF]/80 rounded-none" data-testid="submit-incident-button">
                  {submitting ? "ANALYZING..." : "SUBMIT & ANALYZE"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-[1px] bg-white/[0.04]">
        {[
          { label: "TOTAL INCIDENTS", value: analytics?.total_incidents || 0, icon: AlertTriangle, color: "#FFB800", hint: "ingested" },
          { label: "AVG CONFIDENCE", value: `${analytics?.average_confidence_score?.toFixed(1) || 0}%`, icon: Brain, color: "#00E5FF", hint: "neocortex" },
          { label: "AVG DECISION TIME", value: `${analytics?.average_decision_time_seconds?.toFixed(1) || 0}s`, icon: Clock, color: "#00FF88", hint: "per call" },
          { label: "ACCURACY RATE", value: `${analytics?.decision_accuracy_rate?.toFixed(1) || 0}%`, icon: Target, color: "#00FF88", hint: "vs ref panel" },
        ].map(({ label, value, icon: Icon, color, hint }) => (
          <div key={label} className="group bg-gradient-to-br from-[#0A0A0A] to-[#070707] p-4 relative overflow-hidden hover:from-[#0C0C0C] transition-colors mil-corner" data-testid={`stat-${label.toLowerCase().replace(/\s+/g, '-')}`}>
            <div className="absolute inset-0 mil-grid opacity-40 pointer-events-none" />
            <div className="absolute top-0 left-0 w-12 h-[2px]" style={{ backgroundColor: color, boxShadow: `0 0 8px ${color}` }} />
            <div className="absolute top-1.5 right-1.5 w-1.5 h-1.5 border-r border-t" style={{ borderColor: `${color}66` }} />
            <div className="absolute bottom-1.5 left-1.5 w-1.5 h-1.5 border-l border-b" style={{ borderColor: `${color}66` }} />
            <div className="absolute -top-8 -right-8 w-24 h-24 rounded-full opacity-0 group-hover:opacity-20 transition-opacity" style={{ backgroundColor: color, filter: "blur(30px)" }} />

            <div className="flex items-start justify-between relative">
              <div className="min-w-0">
                <p className="text-[9px] font-mono uppercase tracking-[0.25em] text-gray-500">{label}</p>
                <p className="text-[26px] font-mono font-bold mt-1 leading-none tracking-tight" style={{ color, textShadow: `0 0 12px ${color}44` }}>{value}</p>
                <p className="text-[8px] font-mono uppercase tracking-[0.2em] text-gray-600 mt-2">// {hint}</p>
              </div>
              <div className="flex-none relative">
                <Icon className="w-5 h-5 opacity-40 group-hover:opacity-80 transition-opacity" style={{ color }} />
                <div className="absolute inset-0 opacity-0 group-hover:opacity-60 transition-opacity" style={{ filter: `drop-shadow(0 0 4px ${color})` }}>
                  <Icon className="w-5 h-5" style={{ color }} />
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Main Grid */}
      <div className="grid grid-cols-1 md:grid-cols-12 gap-6">
        <div className="col-span-1 md:col-span-8 lg:col-span-9 space-y-4">
          {showComparison ? (
            <DecisionComparisonMode incident={selectedIncident} onClose={() => setShowComparison(false)} />
          ) : (
            <VideoStage incident={selectedIncident} onAnalyze={handleReanalyze} previewVideo={previewVideo} />
          )}
          {analysis && <BrainPathway analysis={analysis} />}
          <div className="border border-white/[0.08] bg-[#0A0A0A] p-4" data-testid="timeline-scrubber">
            <div className="flex items-center justify-between mb-3">
              <span className="text-[10px] font-heading font-bold uppercase tracking-[0.2em] text-gray-500">INCIDENT TIMELINE</span>
              <span className="text-[10px] font-mono text-gray-600">{incidents.length} EVENTS</span>
            </div>
            <div className="h-1 bg-white/[0.06] relative">
              {incidents.slice(0, 10).map((inc, i) => {
                const sc = inc.decision_status === 'confirmed' ? '#00FF88' : inc.decision_status === 'overturned' ? '#FF2A2A' : '#FFB800';
                return <div key={inc.id} className="absolute w-2.5 h-2.5 -top-[3px] cursor-pointer hover:scale-150 transition-transform" style={{ left: `${(i+1)*9}%`, backgroundColor: sc }} onClick={() => setSelectedIncident(inc)} title={inc.incident_type} />;
              })}
              <div className="absolute h-full bg-[#00E5FF]/20" style={{ width: '45%' }} />
            </div>
          </div>
        </div>

        {/* Right Panel */}
        <div className="col-span-1 md:col-span-4 lg:col-span-3 space-y-4">
          {selectedIncident && analysis && (
            <div className="border border-white/[0.08] bg-gradient-to-b from-[#0A0A0A] to-[#050505] relative overflow-hidden" data-testid="octon-analysis-panel">
              <div className="absolute top-0 left-0 w-full h-[2px] bg-gradient-to-r from-transparent via-[#00E5FF] to-transparent opacity-60" />
              <div className="absolute top-2 left-2 w-3 h-3 border-l border-t border-[#00E5FF]/40 pointer-events-none" />
              <div className="absolute top-2 right-2 w-3 h-3 border-r border-t border-[#00E5FF]/40 pointer-events-none" />
              <div className="absolute bottom-2 left-2 w-3 h-3 border-l border-b border-[#00E5FF]/40 pointer-events-none" />
              <div className="absolute bottom-2 right-2 w-3 h-3 border-r border-b border-[#00E5FF]/40 pointer-events-none" />

              <div className="p-4">
                <div className="flex items-center justify-between mb-4 pb-3 border-b border-white/[0.06]">
                  <div className="flex items-center gap-2">
                    <div className="relative">
                      <Brain className="w-4 h-4 text-[#00E5FF]" />
                      <div className="absolute inset-0 w-4 h-4 bg-[#00E5FF]/30 blur-md" />
                    </div>
                    <div className="flex flex-col">
                      <span className="text-[10px] font-heading font-bold uppercase tracking-[0.22em] text-[#00E5FF]">OCTON ANALYSIS</span>
                      <span className="text-[8px] font-mono uppercase tracking-[0.2em] text-gray-600">Neocortex · v2.1</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Button variant="ghost" size="sm" onClick={handleReanalyze} className="text-[#00E5FF] hover:text-[#00E5FF] hover:bg-[#00E5FF]/10 h-7 w-7 p-0 border border-[#00E5FF]/20 hover:border-[#00E5FF]/50 rounded-none transition-all" data-testid="reanalyze-button" title="Re-run analysis"><RefreshCw className="w-3.5 h-3.5" /></Button>
                    <Button variant="ghost" size="sm" onClick={async () => {
                      let audit = null;
                      try {
                        const res = await axios.post(`${API}/audit/register`, { incident_id: selectedIncident.id }, { withCredentials: true });
                        audit = res.data;
                      } catch (e) { /* degrade to unsigned export */ }
                      const frame = (typeof frameCaptureRef.current === "function") ? frameCaptureRef.current() : null;
                      try { const fn = exportAnalysisPDF(selectedIncident, analysis, audit, { frameImage: frame }); toast.success(audit ? `Signed report exported · ${fn}` : `Report exported · ${fn}`); }
                      catch (e) { toast.error("PDF export failed"); }
                    }} className="text-[#FFB800] hover:text-[#FFB800] hover:bg-[#FFB800]/10 h-7 px-2 p-0 border border-[#FFB800]/30 hover:border-[#FFB800]/60 rounded-none transition-all flex items-center gap-1" data-testid="export-pdf-button" title="Export signed forensic PDF report">
                      <FileText className="w-3.5 h-3.5" />
                      <span className="text-[9px] font-mono tracking-[0.15em]">PDF</span>
                    </Button>
                    {["confirmed", "overturned"].includes(selectedIncident?.decision_status) && (
                      <Button variant="ghost" size="sm" onClick={async () => {
                        try {
                          const res = await axios.post(`${API}/incidents/${selectedIncident.id}/promote-to-training`, {}, { withCredentials: true });
                          if (res.data?.status === "already_promoted") toast.info("Already in Training Library");
                          else toast.success("Promoted to Training Library");
                        } catch (e) {
                          toast.error(e?.response?.data?.detail || "Promotion failed");
                        }
                      }} className="text-[#B366FF] hover:text-[#B366FF] hover:bg-[#B366FF]/10 h-7 px-2 p-0 border border-[#B366FF]/30 hover:border-[#B366FF]/60 rounded-none transition-all flex items-center gap-1" data-testid="promote-training-button" title="Promote this decision into the Training Library">
                        <Sparkles className="w-3.5 h-3.5" />
                        <span className="text-[9px] font-mono tracking-[0.15em]">TRAIN</span>
                      </Button>
                    )}
                  </div>
                </div>

                <div className="py-3">
                  <ConfidenceScore
                    score={analysis.final_confidence || analysis.confidence_score || 0}
                    uplift={analysis.confidence_uplift || 0}
                    precedentCount={analysis.precedent_strong_matches || 0}
                    hipBonus={analysis.hippocampus_bonus || 0}
                    base={analysis.base_confidence || 0}
                    hip={analysis.hippocampus?.initial_confidence || 0}
                    neo={analysis.neo_cortex?.confidence_score || 0}
                    divergence={analysis.pathway_divergence || 0}
                    weighting={analysis.weighting || null}
                  />
                </div>

                {analysis.critical_trigger && (
                  <div
                    className="mx-auto -mt-1 mb-2 flex items-center gap-2 px-3 py-1.5 border border-[#FF2A2A]/60 bg-[#FF2A2A]/[0.08] w-fit octon-pulse-red"
                    data-testid="critical-trigger-chip"
                    title="IFAB Law 12 mandates this sending-off offence — confidence floored at 92%"
                  >
                    <AlertTriangle className="w-3 h-3 text-[#FF2A2A]" />
                    <span className="text-[9px] font-heading font-bold tracking-[0.2em] text-[#FF2A2A] uppercase">
                      IFAB AUTOMATIC RED
                    </span>
                    <span className="text-[8px] font-mono text-[#FF6666] uppercase tracking-[0.15em]">
                      · {String(analysis.critical_trigger).replace(/_/g, " ")}
                    </span>
                    {analysis.critical_floor_applied && (
                      <span className="text-[7px] font-mono text-[#FFB380] px-1 border border-[#FF2A2A]/40" title="Confidence was raised to the 92% floor by the IFAB rule">
                        FLOORED 92%
                      </span>
                    )}
                  </div>
                )}

                <div className="mt-4 border border-[#00E5FF]/20 bg-[#00E5FF]/[0.04] p-3 relative">
                  <div className="absolute top-0 left-0 w-full h-[1px] bg-gradient-to-r from-[#00E5FF]/60 to-transparent" />
                  <div className="flex items-center gap-2 mb-1.5">
                    <Target className="w-3 h-3 text-[#00E5FF]" />
                    <span className="text-[9px] font-mono uppercase tracking-[0.25em] text-[#00E5FF]/80">SUGGESTED DECISION</span>
                    {analysis.visual_evidence_source && (
                      <span
                        className="ml-auto text-[8px] font-mono uppercase tracking-[0.15em] px-1.5 py-0.5 border"
                        style={{
                          color: analysis.visual_evidence_source === "video_frame" ? "#00FF88" : analysis.visual_evidence_source === "image" ? "#00E5FF" : "#FFB800",
                          borderColor: analysis.visual_evidence_source ? "rgba(0,229,255,0.3)" : "rgba(255,184,0,0.3)",
                          backgroundColor: "rgba(0,229,255,0.05)",
                        }}
                        data-testid="visual-evidence-badge"
                        title={analysis.visual_evidence_source === "video_frame" ? "Neo Cortex analysed an extracted video frame" : analysis.visual_evidence_source === "image" ? "Neo Cortex analysed the uploaded still frame" : "Text-only analysis — no visual evidence"}
                      >
                        {analysis.visual_evidence_source === "video_frame" ? "VIDEO FRAME" : analysis.visual_evidence_source === "image" ? "STILL FRAME" : "TEXT ONLY"}
                      </span>
                    )}
                  </div>
                  <p className="text-sm font-body text-white leading-relaxed" data-testid="suggested-decision">{analysis.suggested_decision}</p>
                </div>

                <div className="mt-3 space-y-2">
                  <CurtainSection
                    icon={BookOpen}
                    title="Reasoning"
                    accent="#00E5FF"
                    testId="reasoning-curtain"
                  >
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-[8px] font-mono uppercase tracking-[0.3em] text-gray-600">NEOCORTEX RATIONALE</span>
                      <CopyButton text={analysis.reasoning} label="COPY" accent="#00E5FF" testId="copy-reasoning-btn" />
                    </div>
                    <div className="max-h-[300px] overflow-y-auto pr-2 octon-scrollbar" data-testid="reasoning-scroll">
                      <p className="text-xs font-body text-gray-300 leading-relaxed whitespace-pre-wrap">
                        {analysis.reasoning}
                      </p>
                    </div>
                  </CurtainSection>

                  {analysis.neo_cortex_notes && (
                    <CurtainSection
                      icon={Sparkles}
                      title="Neo Cortex"
                      accent="#B366FF"
                      testId="neocortex-curtain"
                    >
                      <div className="max-h-[260px] overflow-y-auto pr-2 octon-scrollbar" data-testid="neocortex-scroll">
                        <p className="text-xs font-body text-[#CFA8FF] leading-relaxed italic whitespace-pre-wrap">
                          {analysis.neo_cortex_notes}
                        </p>
                      </div>
                    </CurtainSection>
                  )}

                  {Array.isArray(analysis.key_factors) && analysis.key_factors.length > 0 && (
                    <CurtainSection
                      icon={GitBranch}
                      title="Key Factors"
                      accent="#FFB800"
                      count={analysis.key_factors.length}
                      testId="keyfactors-curtain"
                    >
                      <div className="flex flex-wrap gap-1.5">
                        {analysis.key_factors.map((f, i) => (
                          <span
                            key={i}
                            className="text-[10px] font-mono text-[#FFB800] bg-[#FFB800]/[0.06] px-2 py-1 border border-[#FFB800]/20 hover:border-[#FFB800]/50 hover:bg-[#FFB800]/10 transition-colors"
                          >
                            {f}
                          </span>
                        ))}
                      </div>
                    </CurtainSection>
                  )}

                  {Array.isArray(analysis.precedents_used) && analysis.precedents_used.length > 0 && (
                    <CurtainSection
                      icon={BookOpen}
                      title="Precedents"
                      accent="#B366FF"
                      count={analysis.precedents_used.length}
                      defaultOpen={analysis.confidence_uplift > 0}
                      testId="precedents-curtain"
                    >
                      <div className="max-h-[360px] overflow-y-auto pr-2 octon-scrollbar space-y-2" data-testid="precedents-scroll">
                        {analysis.precedents_used.map((p, i) => (
                          <div
                            key={p.id || i}
                            className="border border-[#B366FF]/20 bg-[#B366FF]/[0.04] p-2 hover:border-[#B366FF]/40 transition-colors"
                            data-testid={`precedent-${i}`}
                          >
                            <div className="flex items-start justify-between gap-2">
                              <div className="flex items-center gap-2 min-w-0">
                                <span className="text-[9px] font-mono text-[#B366FF] font-bold">#{i + 1}</span>
                                <span className="text-[11px] font-body text-white font-semibold truncate">{p.title}</span>
                              </div>
                              <span className="text-[9px] font-mono text-[#B366FF] flex-none px-1 border border-[#B366FF]/30" style={{ backgroundColor: "#B366FF10" }}>
                                {(p.similarity * 100).toFixed(1)}%
                              </span>
                            </div>
                            <p className="text-[10px] font-mono text-[#00FF88]/80 mt-1">→ {p.correct_decision}</p>
                            {p.match_context && (p.match_context.teams || p.match_context.year) && (
                              <p className="text-[9px] font-mono text-gray-600 mt-0.5">
                                {p.match_context.teams} {p.match_context.competition ? `· ${p.match_context.competition}` : ""} {p.match_context.year ? `· ${p.match_context.year}` : ""}
                              </p>
                            )}
                          </div>
                        ))}
                      </div>
                    </CurtainSection>
                  )}
                </div>

                <div className="flex items-center justify-between text-[9px] font-mono text-gray-600 pt-3 mt-3 border-t border-white/[0.06]">
                  <div className="flex items-center gap-1.5">
                    <History className="w-3 h-3" />
                    <span>HISTORY: <span className="text-gray-400">{analysis.similar_historical_cases}</span></span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Clock className="w-3 h-3" />
                    <span className="text-gray-400">{analysis.total_processing_time_ms}ms</span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {selectedIncident?.decision_status === 'pending' && (
            <div className="border border-white/[0.08] bg-[#0A0A0A]">
              <div className="p-3 border-b border-white/[0.06]"><span className="text-[10px] font-heading font-bold uppercase tracking-[0.2em] text-gray-500">DECISION</span></div>
              <div className="p-3 space-y-2">
                <Button className="w-full h-12 bg-[#00FF88]/[0.06] text-[#00FF88] border border-[#00FF88]/20 hover:bg-[#00FF88]/15 hover:border-[#00FF88]/40 rounded-none font-heading font-bold text-xs tracking-[0.15em] uppercase transition-all active:scale-[0.98]" onClick={() => handleDecision('confirmed', analysis?.suggested_decision || 'Confirmed')} data-testid="confirm-decision-button"><CheckCircle2 className="w-4 h-4 mr-2" />CONFIRM</Button>
                <Button className="w-full h-12 bg-[#FF2A2A]/[0.06] text-[#FF2A2A] border border-[#FF2A2A]/20 hover:bg-[#FF2A2A]/15 hover:border-[#FF2A2A]/40 rounded-none font-heading font-bold text-xs tracking-[0.15em] uppercase transition-all active:scale-[0.98]" onClick={() => handleDecision('overturned', 'Decision Overturned')} data-testid="override-decision-button"><XCircle className="w-4 h-4 mr-2" />OVERTURN</Button>
              </div>
            </div>
          )}

          {selectedIncident && (
            <div className="border border-white/[0.08] bg-[#0A0A0A]">
              <div className="p-3 border-b border-white/[0.06] flex items-center justify-between"><IncidentBadge type={selectedIncident.incident_type} /><DecisionBadge status={selectedIncident.decision_status} /></div>
              <div className="p-3 space-y-3">
                <p className="text-xs font-body text-gray-400 leading-relaxed">{selectedIncident.description}</p>
                <div className="grid grid-cols-2 gap-2 text-[10px]">
                  {selectedIncident.timestamp_in_match && <div><span className="font-mono text-gray-600">TIME</span><span className="text-white ml-1.5">{selectedIncident.timestamp_in_match}</span></div>}
                  {selectedIncident.team_involved && <div><span className="font-mono text-gray-600">TEAM</span><span className="text-white ml-1.5">{selectedIncident.team_involved}</span></div>}
                  {selectedIncident.player_involved && <div className="col-span-2"><span className="font-mono text-gray-600">PLAYER</span><span className="text-white ml-1.5">{selectedIncident.player_involved}</span></div>}
                </div>
                {selectedIncident.final_decision && <div className="pt-2 border-t border-white/[0.06]"><span className="text-[10px] font-mono text-gray-600">FINAL</span><p className="text-xs text-white mt-1">{selectedIncident.final_decision}</p></div>}
              </div>
            </div>
          )}

          <div className="border border-white/[0.08] bg-[#0A0A0A]">
            <div className="p-3 border-b border-white/[0.06]"><span className="text-[10px] font-heading font-bold uppercase tracking-[0.2em] text-gray-500">RECENT INCIDENTS</span></div>
            <ScrollArea className="h-[200px]">
              {incidents.slice(0, 10).map(inc => (
                <div key={inc.id} onClick={() => setSelectedIncident(inc)} className={`px-3 py-2.5 cursor-pointer border-b border-white/[0.04] hover:bg-white/[0.03] transition-colors ${selectedIncident?.id === inc.id ? 'bg-white/[0.06] border-l-2 border-l-[#00E5FF]' : ''}`} data-testid={`incident-item-${inc.id}`}>
                  <div className="flex items-center justify-between"><IncidentBadge type={inc.incident_type} /><span className="text-[10px] font-mono text-gray-600">{inc.timestamp_in_match || '--:--'}</span></div>
                  <p className="text-[10px] text-gray-500 mt-1 truncate">{inc.description}</p>
                </div>
              ))}
            </ScrollArea>
          </div>
        </div>
      </div>
    </div>
  );
};

export default LiveVARPage;
