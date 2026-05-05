import { useState, useEffect, useCallback, useRef } from "react";
import axios from "axios";
import { toast } from "sonner";
import {
  BookOpen, Plus, Trash2, Upload, Sparkles, RefreshCw, Database,
  Search, Film, Image as ImageIcon, Check, Loader2, Globe, ExternalLink,
  Clock, Power, Zap, TrendingUp, Scale
} from "lucide-react";
import { Button } from "./components/ui/button";
import { Input } from "./components/ui/input";
import { Textarea } from "./components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "./components/ui/dialog";
import { Label } from "./components/ui/label";
import { ScrollArea } from "./components/ui/scroll-area";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const INCIDENT_TYPES = ["offside", "handball", "foul", "penalty", "goal_line", "red_card", "other"];
const TYPE_COLORS = {
  offside: "#FFB800", handball: "#FF2A2A", foul: "#00E5FF",
  penalty: "#FF2A2A", goal_line: "#00FF88", red_card: "#FF2A2A", other: "#FFFFFF",
};

const emptyForm = () => ({
  title: "", incident_type: "offside", correct_decision: "", rationale: "",
  keywords: "", tags: "", law_references: "", outcome: "",
  teams: "", competition: "", year: "",
});

export default function TrainingLibraryPage() {
  const [cases, setCases] = useState([]);
  const [stats, setStats] = useState({ total_cases: 0, by_type: [], with_media: 0, by_source: [], last_24h: 0, last_24h_web: 0, source_quality: [], vision_escalations: { total: 0, last_24h: 0, top_triggers: [] } });
  const [loading, setLoading] = useState(true);
  const [filterType, setFilterType] = useState("all");
  const [search, setSearch] = useState("");
  const [clauseFilter, setClauseFilter] = useState("");
  const [tagFilter, setTagFilter] = useState("");
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState(emptyForm());
  const [saving, setSaving] = useState(false);
  const [seeding, setSeeding] = useState(false);
  const [uploadingFor, setUploadingFor] = useState(null);
  const [showWeb, setShowWeb] = useState(false);
  const [webUrl, setWebUrl] = useState("");
  const [webLoading, setWebLoading] = useState(false);
  const [webResult, setWebResult] = useState(null);
  const [webLog, setWebLog] = useState([]);
  const [sched, setSched] = useState(null);
  const [feeds, setFeeds] = useState([]);
  const [newFeedUrl, setNewFeedUrl] = useState("");
  const [newFeedLabel, setNewFeedLabel] = useState("");
  const [schedBusy, setSchedBusy] = useState(false);

  const loadSched = useCallback(async () => {
    try {
      const r = await axios.get(`${API}/training/schedule`, { withCredentials: true });
      setSched(r.data?.config || null);
      setFeeds(r.data?.feeds || []);
    } catch { /* non-fatal */ }
  }, []);

  const loadWebLog = useCallback(async () => {
    try {
      const r = await axios.get(`${API}/training/ingest-log`, { params: { limit: 10 }, withCredentials: true });
      setWebLog(r.data || []);
    } catch { /* non-fatal */ }
  }, []);

  const handleScheduleToggle = async (enabled) => {
    setSchedBusy(true);
    try {
      const r = await axios.put(`${API}/training/schedule`, { enabled }, { withCredentials: true });
      setSched(r.data);
      toast.success(enabled ? "Auto-learn scheduler enabled" : "Auto-learn scheduler paused");
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Failed");
    } finally {
      setSchedBusy(false);
    }
  };

  const handleScheduleCron = async (hour, minute) => {
    setSchedBusy(true);
    try {
      const r = await axios.put(`${API}/training/schedule`, { cron_hour: hour, cron_minute: minute }, { withCredentials: true });
      setSched(r.data);
      toast.success(`Schedule set to ${String(hour).padStart(2,"0")}:${String(minute).padStart(2,"0")} UTC`);
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Failed");
    } finally {
      setSchedBusy(false);
    }
  };

  const handleRunNow = async () => {
    setSchedBusy(true);
    try {
      const r = await axios.post(`${API}/training/schedule/run-now`, {}, { withCredentials: true });
      const inserted = r.data?.total_inserted || 0;
      toast.success(inserted ? `Auto-ingested ${inserted} new precedent${inserted===1?"":"s"}` : "Run complete — no new precedents");
      await Promise.all([load(), loadWebLog(), loadSched()]);
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Run failed");
    } finally {
      setSchedBusy(false);
    }
  };

  const handleAddFeed = async () => {
    const url = (newFeedUrl || "").trim();
    if (!url.startsWith("http")) { toast.error("URL must start with http(s)"); return; }
    try {
      await axios.post(`${API}/training/feeds`, { url, label: newFeedLabel.trim() || url, enabled: true }, { withCredentials: true });
      setNewFeedUrl("");
      setNewFeedLabel("");
      toast.success("Feed added");
      await loadSched();
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Failed to add feed");
    }
  };

  const handleToggleFeed = async (feed) => {
    try {
      await axios.post(`${API}/training/feeds`, { url: feed.url, label: feed.label, enabled: !feed.enabled }, { withCredentials: true });
      await loadSched();
    } catch {
      toast.error("Failed to toggle feed");
    }
  };

  const handleDeleteFeed = async (feedId) => {
    if (!window.confirm("Remove this feed?")) return;
    try {
      await axios.delete(`${API}/training/feeds/${feedId}`, { withCredentials: true });
      await loadSched();
    } catch {
      toast.error("Failed to delete feed");
    }
  };

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = {};
      if (filterType !== "all") params.incident_type = filterType;
      if (search) params.q = search;
      if (clauseFilter) params.law_q = clauseFilter;
      if (tagFilter) params.tag = tagFilter;
      const [listRes, statsRes] = await Promise.all([
        axios.get(`${API}/training/cases`, { params, withCredentials: true }),
        axios.get(`${API}/training/stats`, { withCredentials: true }),
      ]);
      setCases(listRes.data || []);
      setStats(statsRes.data || { total_cases: 0, by_type: [], with_media: 0, by_source: [], last_24h: 0, last_24h_web: 0, source_quality: [], vision_escalations: { total: 0, last_24h: 0, top_triggers: [] } });
    } catch (e) {
      toast.error("Failed to load training library");
    } finally {
      setLoading(false);
    }
  }, [filterType, search, clauseFilter, tagFilter]);

  useEffect(() => { load(); }, [load]);

  const handleSeed = async () => {
    setSeeding(true);
    try {
      const res = await axios.post(`${API}/training/seed`, {}, { withCredentials: true });
      toast.success(`Seeded ${res.data.inserted} canonical cases (${res.data.skipped} already present)`);
      await load();
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Seed failed");
    } finally {
      setSeeding(false);
    }
  };

  const handleSave = async () => {
    if (!form.title || !form.correct_decision || !form.rationale) {
      toast.error("Title, Correct Decision and Rationale are required");
      return;
    }
    setSaving(true);
    try {
      const payload = {
        title: form.title,
        incident_type: form.incident_type,
        correct_decision: form.correct_decision,
        rationale: form.rationale,
        keywords: form.keywords.split(",").map(s => s.trim()).filter(Boolean),
        tags: form.tags.split(",").map(s => s.trim()).filter(Boolean),
        law_references: form.law_references.split(",").map(s => s.trim()).filter(Boolean),
        outcome: form.outcome || null,
        match_context: (form.teams || form.competition || form.year) ? {
          teams: form.teams || null,
          competition: form.competition || null,
          year: form.year ? parseInt(form.year) || form.year : null,
        } : null,
      };
      await axios.post(`${API}/training/cases`, payload, { withCredentials: true });
      toast.success("Training case added");
      setShowAdd(false);
      setForm(emptyForm());
      await load();
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Save failed");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id, title) => {
    if (!window.confirm(`Delete "${title}"?`)) return;
    try {
      await axios.delete(`${API}/training/cases/${id}`, { withCredentials: true });
      toast.success("Deleted");
      await load();
    } catch {
      toast.error("Delete failed");
    }
  };

  const handleUploadMedia = async (caseId, file) => {
    if (!file) return;
    setUploadingFor(caseId);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await axios.post(`${API}/training/cases/${caseId}/media`, fd, {
        withCredentials: true,
        headers: { "Content-Type": "multipart/form-data" },
      });
      const tagCount = res.data?.auto_tags?.length || 0;
      toast.success(`Media uploaded${tagCount ? ` · ${tagCount} visual tags auto-generated` : ""}`);
      await load();
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Upload failed");
    } finally {
      setUploadingFor(null);
    }
  };

  const handleWebIngest = async () => {
    const url = (webUrl || "").trim();
    if (!url.startsWith("http")) {
      toast.error("Enter a valid http(s) URL");
      return;
    }
    setWebLoading(true);
    setWebResult(null);
    try {
      const r = await axios.post(`${API}/training/ingest-url`, { url, auto_save: true }, { withCredentials: true });
      setWebResult(r.data);
      const n = r.data?.inserted || 0;
      if (n > 0) toast.success(`${n} new precedent${n === 1 ? "" : "s"} ingested from the web`);
      else if ((r.data?.accepted || 0) > 0) toast.info("Cases found but all already in library");
      else toast.info("No clear VAR decisions found in this article");
      await Promise.all([load(), loadWebLog()]);
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Ingestion failed");
    } finally {
      setWebLoading(false);
    }
  };

  const filteredCases = cases;

  return (
    <div className="flex-1 min-w-0 p-6 space-y-5 bg-[#050505] grid-overlay overflow-y-auto h-screen" data-testid="training-library-page">
      {/* Header */}
      <div className="flex items-start justify-between pb-4 border-b border-white/[0.06]">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <div className="w-[3px] h-9 bg-[#00E5FF] mr-1" style={{ boxShadow: "0 0 8px #00E5FFaa" }} />
            <h1 className="text-3xl font-heading font-black text-white tracking-tighter uppercase leading-none">
              TRAINING <span className="text-[#00E5FF]" style={{ textShadow: "0 0 14px #00E5FF66" }}>LIBRARY</span>
            </h1>
            <span className="px-1.5 py-0.5 border border-[#00E5FF]/30 text-[8px] font-mono tracking-[0.2em] text-[#00E5FF]/80 bg-[#00E5FF]/[0.05]">RAG · v1</span>
          </div>
          <p className="text-[10px] font-mono text-gray-500 tracking-[0.15em] uppercase ml-4">
            Ground-truth precedents that feed the Neocortex. Each match lifts analysis confidence.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Dialog open={showWeb} onOpenChange={(v) => { setShowWeb(v); if (v) { loadWebLog(); loadSched(); } }}>
            <DialogTrigger asChild>
              <Button className="bg-transparent text-[#B366FF] border border-[#B366FF]/40 hover:bg-[#B366FF]/10 hover:border-[#B366FF]/70 rounded-none font-heading font-bold text-xs tracking-[0.1em] h-9 px-4 transition-all" data-testid="web-ingest-button">
                <Globe className="w-3.5 h-3.5 mr-2" />
                LEARN FROM WEB
              </Button>
            </DialogTrigger>
            <DialogContent className="bg-[#0B0B0B] border-[#B366FF]/30 text-white max-w-3xl max-h-[92vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle className="font-heading text-lg tracking-wide flex items-center gap-2">
                  <Globe className="w-4 h-4 text-[#B366FF]" />
                  WEB-LEARNING · PULL FROM MATCH REPORT
                </DialogTitle>
              </DialogHeader>
              <div className="space-y-4 pt-2">
                <p className="text-[11px] font-mono text-gray-400 leading-relaxed">
                  Paste a URL to a public match report, video review or VAR-decision article.
                  OCTON will read the article, extract every unambiguous VAR-reviewable decision
                  via GPT-5.2, and add each as a ground-truth precedent in the Training Corpus.
                  New precedents lift analysis confidence for similar future incidents.
                </p>
                <div className="flex gap-2">
                  <Input
                    value={webUrl}
                    onChange={(e) => setWebUrl(e.target.value)}
                    placeholder="https://www.example.com/match-report/..."
                    className="bg-black/40 border-white/10 rounded-none text-white font-mono text-xs flex-1"
                    data-testid="web-url-input"
                    onKeyDown={(e) => { if (e.key === "Enter" && !webLoading) handleWebIngest(); }}
                  />
                  <Button
                    onClick={handleWebIngest}
                    disabled={webLoading || !webUrl.trim()}
                    className="bg-[#B366FF] text-black hover:bg-[#B366FF]/90 rounded-none h-9 px-5 font-heading font-bold text-xs tracking-[0.1em]"
                    data-testid="web-ingest-submit"
                  >
                    {webLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-2" /> : <Sparkles className="w-3.5 h-3.5 mr-2" />}
                    INGEST
                  </Button>
                </div>

                {webResult && (
                  <div className="border border-[#B366FF]/30 bg-[#B366FF]/[0.05] p-3 space-y-2">
                    <div className="flex items-baseline justify-between gap-2">
                      <h4 className="text-xs font-heading font-bold text-white truncate">
                        {webResult.article_title}
                      </h4>
                      <a href={webResult.url} target="_blank" rel="noreferrer" className="text-[#B366FF] text-[10px] font-mono flex items-center gap-1 hover:underline flex-none">
                        source <ExternalLink className="w-2.5 h-2.5" />
                      </a>
                    </div>
                    <div className="grid grid-cols-4 gap-2 text-[10px] font-mono">
                      <div className="text-gray-500">EXTRACTED: <span className="text-white">{webResult.extracted}</span></div>
                      <div className="text-gray-500">ACCEPTED: <span className="text-[#00FF88]">{webResult.accepted}</span></div>
                      <div className="text-gray-500">NEW: <span className="text-[#B366FF]">{webResult.inserted}</span></div>
                      <div className="text-gray-500">DUP: <span className="text-[#FFB800]">{webResult.skipped_existing}</span></div>
                    </div>
                    {webResult.cases?.length > 0 && (
                      <div className="space-y-1 pt-1">
                        {webResult.cases.map((c, i) => (
                          <div key={c.id || i} className="text-[11px] font-mono text-gray-300 border-l-2 border-[#00FF88]/40 pl-2">
                            <span className="text-[#00E5FF]">{c.incident_type?.toUpperCase()}</span>
                            {" · "}
                            <span className="text-white">{c.title}</span>
                            {" → "}
                            <span className="text-[#00FF88]">{c.correct_decision}</span>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Confidence Lift Report */}
                    {webResult.confidence_lift?.total_impacted > 0 && (
                      <div className="mt-3 pt-2 border-t border-[#00FF88]/20" data-testid="confidence-lift-report">
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center gap-2">
                            <TrendingUp className="w-3.5 h-3.5 text-[#00FF88]" />
                            <span className="text-[10px] font-heading font-bold uppercase tracking-[0.22em] text-[#00FF88]">
                              CONFIDENCE LIFT REPORT
                            </span>
                          </div>
                          <div className="flex items-center gap-2 text-[10px] font-mono text-gray-400">
                            <span>{webResult.confidence_lift.total_impacted} impacted · avg +{webResult.confidence_lift.avg_uplift_pct}%</span>
                            {webResult.confidence_lift.auto_rescored?.length > 0 && (
                              <span className="px-1.5 py-0.5 border border-[#B366FF]/40 bg-[#B366FF]/10 text-[#B366FF] text-[9px] tracking-[0.15em] font-bold" data-testid="auto-rescore-chip">
                                AUTO-RESCORED {webResult.confidence_lift.auto_rescored.length}
                              </span>
                            )}
                          </div>
                        </div>

                        {webResult.confidence_lift.auto_rescored?.length > 0 ? (
                          <>
                            <p className="text-[9px] font-mono text-[#B366FF]/80 mb-2 uppercase tracking-[0.15em]">
                              Closed-loop: these pending incidents were automatically re-analysed with the new precedents
                            </p>
                            <div className="space-y-1 max-h-[200px] overflow-y-auto octon-scrollbar pr-1">
                              {webResult.confidence_lift.auto_rescored.map((i) => (
                                <div key={i.incident_id} className="flex items-center gap-2 text-[10px] font-mono px-2 py-1.5 bg-[#B366FF]/[0.06] border border-[#B366FF]/25 hover:bg-[#B366FF]/[0.12]">
                                  <span className="text-[#00E5FF] uppercase w-16 truncate flex-none">{i.incident_type?.replace("_", " ")}</span>
                                  <span className="text-gray-300 truncate flex-1" title={i.suggested_decision}>
                                    → {i.suggested_decision}
                                  </span>
                                  <span className="text-gray-500 flex-none">
                                    {i.old_confidence?.toFixed(1)}% →{" "}
                                    <span className="text-white font-bold">{i.new_confidence?.toFixed(1)}%</span>
                                  </span>
                                  <span className={`font-bold w-12 text-right flex-none ${i.delta > 0 ? "text-[#00FF88]" : i.delta < 0 ? "text-[#FF2A2A]" : "text-gray-500"}`}>
                                    {i.delta > 0 ? "+" : ""}{i.delta?.toFixed(1)}%
                                  </span>
                                </div>
                              ))}
                            </div>
                          </>
                        ) : (
                          <>
                            <p className="text-[9px] font-mono text-gray-500 mb-2 uppercase tracking-[0.15em]">
                              These pending incidents will gain confidence on the next re-analysis:
                            </p>
                            <div className="space-y-1 max-h-[200px] overflow-y-auto octon-scrollbar pr-1">
                              {webResult.confidence_lift.impacted_incidents.map((i) => (
                                <div key={i.incident_id} className="flex items-center gap-2 text-[10px] font-mono px-2 py-1.5 bg-[#00FF88]/[0.04] border border-[#00FF88]/15 hover:bg-[#00FF88]/[0.08]">
                                  <span className="text-[#00E5FF] uppercase w-16 truncate flex-none">{i.incident_type?.replace("_", " ")}</span>
                                  <span className="text-gray-400 truncate flex-1" title={i.description_preview}>
                                    {i.team_involved || "Pending"} · {i.timestamp_in_match || "—"}
                                  </span>
                                  <span className="text-gray-500 flex-none">
                                    {i.current_confidence?.toFixed(1)}% →{" "}
                                    <span className="text-[#00FF88] font-bold">{i.projected_confidence?.toFixed(1)}%</span>
                                  </span>
                                  <span className="text-[#00FF88] font-bold w-12 text-right flex-none">
                                    +{i.projected_uplift?.toFixed(1)}%
                                  </span>
                                </div>
                              ))}
                            </div>
                          </>
                        )}
                      </div>
                    )}
                  </div>
                )}

                {/* ── Auto-learn scheduler ─────────────────── */}
                {sched && (
                  <div className="border border-[#00E5FF]/20 bg-[#00E5FF]/[0.03] p-3 space-y-3" data-testid="web-scheduler-panel">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Clock className="w-3.5 h-3.5 text-[#00E5FF]" />
                        <span className="text-[10px] font-heading font-bold uppercase tracking-[0.22em] text-[#00E5FF]">
                          AUTO-LEARN SCHEDULER
                        </span>
                        <span className={`text-[9px] font-mono px-1.5 py-0.5 border ${sched.enabled ? "text-[#00FF88] border-[#00FF88]/40 bg-[#00FF88]/10" : "text-gray-500 border-white/10 bg-white/[0.02]"}`}>
                          {sched.enabled ? "ARMED" : "PAUSED"}
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Button
                          onClick={() => handleScheduleToggle(!sched.enabled)}
                          disabled={schedBusy}
                          variant="ghost"
                          className={`h-7 px-2.5 rounded-none text-[9px] font-mono tracking-[0.15em] border ${sched.enabled ? "text-[#FFB800] border-[#FFB800]/30 hover:bg-[#FFB800]/10" : "text-[#00FF88] border-[#00FF88]/30 hover:bg-[#00FF88]/10"}`}
                          data-testid="schedule-toggle-button"
                        >
                          <Power className="w-3 h-3 mr-1" />
                          {sched.enabled ? "PAUSE" : "ENABLE"}
                        </Button>
                        <Button
                          onClick={handleRunNow}
                          disabled={schedBusy}
                          variant="ghost"
                          className="h-7 px-2.5 rounded-none text-[9px] font-mono tracking-[0.15em] text-[#B366FF] border border-[#B366FF]/30 hover:bg-[#B366FF]/10"
                          data-testid="schedule-run-now-button"
                        >
                          {schedBusy ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : <Zap className="w-3 h-3 mr-1" />}
                          RUN NOW
                        </Button>
                      </div>
                    </div>
                    <div className="flex items-center gap-3 text-[10px] font-mono">
                      <span className="text-gray-400">Daily at</span>
                      <div className="flex items-center gap-1">
                        <Input
                          type="number" min={0} max={23}
                          value={sched.cron_hour}
                          onChange={(e) => setSched({ ...sched, cron_hour: Math.max(0, Math.min(23, Number(e.target.value) || 0)) })}
                          onBlur={() => handleScheduleCron(sched.cron_hour, sched.cron_minute)}
                          className="bg-black/40 border-white/10 rounded-none text-white text-xs h-7 w-12 text-center"
                        />
                        <span className="text-gray-500">:</span>
                        <Input
                          type="number" min={0} max={59}
                          value={sched.cron_minute}
                          onChange={(e) => setSched({ ...sched, cron_minute: Math.max(0, Math.min(59, Number(e.target.value) || 0)) })}
                          onBlur={() => handleScheduleCron(sched.cron_hour, sched.cron_minute)}
                          className="bg-black/40 border-white/10 rounded-none text-white text-xs h-7 w-12 text-center"
                        />
                        <span className="text-[9px] text-gray-500 ml-1 tracking-[0.15em]">UTC</span>
                      </div>
                      {sched.last_run_at && (
                        <span className="text-gray-500 ml-auto">
                          Last run: <span className="text-gray-300">{new Date(sched.last_run_at).toLocaleString()}</span>
                          {sched.last_run_summary?.total_inserted !== undefined && (
                            <span className="text-[#00FF88] ml-2">+{sched.last_run_summary.total_inserted}</span>
                          )}
                        </span>
                      )}
                    </div>

                    {/* Feeds list */}
                    <div className="space-y-1">
                      <div className="text-[9px] font-mono uppercase tracking-[0.25em] text-gray-500 mb-1">
                        FEEDS ({feeds.length})
                      </div>
                      {feeds.map((f) => (
                        <div key={f.id} className="flex items-center gap-2 text-[10px] font-mono px-2 py-1.5 border border-white/[0.06] bg-black/20">
                          <button
                            onClick={() => handleToggleFeed(f)}
                            className={`w-2 h-2 rounded-full flex-none ${f.enabled ? "bg-[#00FF88] shadow-[0_0_6px_#00FF88aa]" : "bg-gray-700"}`}
                            title={f.enabled ? "Enabled — click to disable" : "Disabled — click to enable"}
                            data-testid={`feed-toggle-${f.id}`}
                          />
                          <span className="text-white truncate flex-1">{f.label || f.url}</span>
                          {f.last_inserted_count > 0 && (
                            <span className="text-[#00FF88] flex-none">+{f.last_inserted_count}</span>
                          )}
                          <a href={f.url} target="_blank" rel="noreferrer" className="text-gray-500 hover:text-[#00E5FF] flex-none">
                            <ExternalLink className="w-2.5 h-2.5" />
                          </a>
                          <button
                            onClick={() => handleDeleteFeed(f.id)}
                            className="text-gray-600 hover:text-[#FF2A2A] flex-none"
                            data-testid={`feed-delete-${f.id}`}
                          >
                            <Trash2 className="w-2.5 h-2.5" />
                          </button>
                        </div>
                      ))}
                      {/* Add new feed */}
                      <div className="flex items-center gap-1 pt-1">
                        <Input
                          value={newFeedLabel}
                          onChange={(e) => setNewFeedLabel(e.target.value)}
                          placeholder="Label"
                          className="bg-black/40 border-white/10 rounded-none text-white text-[10px] font-mono h-7 w-28"
                        />
                        <Input
                          value={newFeedUrl}
                          onChange={(e) => setNewFeedUrl(e.target.value)}
                          placeholder="https://..."
                          className="bg-black/40 border-white/10 rounded-none text-white text-[10px] font-mono h-7 flex-1"
                          data-testid="feed-url-input"
                          onKeyDown={(e) => { if (e.key === "Enter") handleAddFeed(); }}
                        />
                        <Button
                          onClick={handleAddFeed}
                          variant="ghost"
                          className="h-7 px-2 rounded-none text-[#00E5FF] border border-[#00E5FF]/30 hover:bg-[#00E5FF]/10"
                          data-testid="feed-add-button"
                        >
                          <Plus className="w-3 h-3" />
                        </Button>
                      </div>
                    </div>
                  </div>
                )}

                {webLog.length > 0 && (
                  <div className="space-y-1 pt-2">
                    <div className="text-[9px] font-mono uppercase tracking-[0.25em] text-gray-500">RECENT INGESTIONS</div>
                    <div className="max-h-[180px] overflow-y-auto border border-white/[0.06]">
                      {webLog.map((l) => (
                        <div key={l.id} className="px-2 py-1.5 border-b border-white/[0.04] text-[10px] font-mono flex items-center justify-between gap-2 hover:bg-white/[0.02]">
                          <span className="text-gray-300 truncate flex-1">{l.title}</span>
                          <span className="text-[#B366FF] flex-none">+{l.inserted_count || 0}</span>
                          <a href={l.url} target="_blank" rel="noreferrer" className="text-gray-500 hover:text-[#00E5FF] flex-none" title={l.url}>
                            <ExternalLink className="w-2.5 h-2.5" />
                          </a>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </DialogContent>
          </Dialog>

          <Button onClick={handleSeed} disabled={seeding} className="bg-transparent text-[#FFB800] border border-[#FFB800]/30 hover:bg-[#FFB800]/10 hover:border-[#FFB800]/60 rounded-none font-heading font-bold text-xs tracking-[0.1em] h-9 px-4 transition-all" data-testid="seed-training-button">
            {seeding ? <Loader2 className="w-3.5 h-3.5 mr-2 animate-spin" /> : <Database className="w-3.5 h-3.5 mr-2" />}
            SEED 20 CANONICAL
          </Button>
          <Dialog open={showAdd} onOpenChange={setShowAdd}>
            <DialogTrigger asChild>
              <Button className="bg-[#00E5FF] text-black hover:bg-[#00E5FF]/90 rounded-none font-heading font-bold text-xs tracking-[0.1em] h-9 px-5 transition-all" data-testid="add-case-button"><Plus className="w-3.5 h-3.5 mr-2" />ADD CASE</Button>
            </DialogTrigger>
            <DialogContent className="bg-[#0B0B0B] border-white/10 text-white max-w-2xl max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle className="font-heading text-lg tracking-wide">NEW GROUND-TRUTH PRECEDENT</DialogTitle>
              </DialogHeader>
              <div className="space-y-3 pt-2">
                <div className="grid grid-cols-2 gap-3">
                  <div className="col-span-2">
                    <Label className="text-[10px] font-mono uppercase tracking-[0.2em] text-gray-400">Title *</Label>
                    <Input value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} placeholder="e.g. Armpit Offside — Sterling 2021" className="bg-black/40 border-white/10 rounded-none mt-1 text-white" data-testid="case-title-input" />
                  </div>
                  <div>
                    <Label className="text-[10px] font-mono uppercase tracking-[0.2em] text-gray-400">Incident Type *</Label>
                    <Select value={form.incident_type} onValueChange={v => setForm({ ...form, incident_type: v })}>
                      <SelectTrigger className="bg-black/40 border-white/10 rounded-none mt-1 text-white"><SelectValue /></SelectTrigger>
                      <SelectContent className="bg-[#0B0B0B] border-white/10 text-white">
                        {INCIDENT_TYPES.map(t => <SelectItem key={t} value={t} className="uppercase">{t.replace("_", " ")}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="text-[10px] font-mono uppercase tracking-[0.2em] text-gray-400">Outcome</Label>
                    <Input value={form.outcome} onChange={e => setForm({ ...form, outcome: e.target.value })} placeholder="goal overturned" className="bg-black/40 border-white/10 rounded-none mt-1 text-white" />
                  </div>
                  <div className="col-span-2">
                    <Label className="text-[10px] font-mono uppercase tracking-[0.2em] text-gray-400">Correct Decision *</Label>
                    <Input value={form.correct_decision} onChange={e => setForm({ ...form, correct_decision: e.target.value })} placeholder="Goal Disallowed - Offside" className="bg-black/40 border-white/10 rounded-none mt-1 text-white" data-testid="case-decision-input" />
                  </div>
                  <div className="col-span-2">
                    <Label className="text-[10px] font-mono uppercase tracking-[0.2em] text-gray-400">Rationale *</Label>
                    <Textarea value={form.rationale} onChange={e => setForm({ ...form, rationale: e.target.value })} rows={3} placeholder="Why this ruling is correct, applied laws, key evidence..." className="bg-black/40 border-white/10 rounded-none mt-1 text-white" data-testid="case-rationale-input" />
                  </div>
                  <div className="col-span-2">
                    <Label className="text-[10px] font-mono uppercase tracking-[0.2em] text-gray-400">Keywords (comma-separated)</Label>
                    <Input value={form.keywords} onChange={e => setForm({ ...form, keywords: e.target.value })} placeholder="armpit, marginal, last defender" className="bg-black/40 border-white/10 rounded-none mt-1 text-white font-mono text-xs" />
                  </div>
                  <div className="col-span-2">
                    <Label className="text-[10px] font-mono uppercase tracking-[0.2em] text-gray-400">Tags (comma-separated)</Label>
                    <Input value={form.tags} onChange={e => setForm({ ...form, tags: e.target.value })} placeholder="marginal-offside, semi-automated" className="bg-black/40 border-white/10 rounded-none mt-1 text-white font-mono text-xs" />
                  </div>
                  <div>
                    <Label className="text-[10px] font-mono uppercase tracking-[0.2em] text-gray-400">Teams</Label>
                    <Input value={form.teams} onChange={e => setForm({ ...form, teams: e.target.value })} placeholder="Man City vs Villarreal" className="bg-black/40 border-white/10 rounded-none mt-1 text-white text-xs" />
                  </div>
                  <div>
                    <Label className="text-[10px] font-mono uppercase tracking-[0.2em] text-gray-400">Competition / Year</Label>
                    <div className="flex gap-2 mt-1">
                      <Input value={form.competition} onChange={e => setForm({ ...form, competition: e.target.value })} placeholder="UCL" className="bg-black/40 border-white/10 rounded-none text-white text-xs" />
                      <Input value={form.year} onChange={e => setForm({ ...form, year: e.target.value })} placeholder="2023" className="bg-black/40 border-white/10 rounded-none text-white text-xs w-24" />
                    </div>
                  </div>
                  <div className="col-span-2">
                    <Label className="text-[10px] font-mono uppercase tracking-[0.2em] text-gray-400">Law References (comma-separated)</Label>
                    <Input value={form.law_references} onChange={e => setForm({ ...form, law_references: e.target.value })} placeholder="IFAB Law 11, IFAB Law 12" className="bg-black/40 border-white/10 rounded-none mt-1 text-white text-xs" />
                  </div>
                </div>
                <div className="flex justify-end gap-2 pt-2">
                  <Button variant="ghost" onClick={() => setShowAdd(false)} className="h-9 rounded-none text-gray-400 hover:text-white">CANCEL</Button>
                  <Button onClick={handleSave} disabled={saving} className="bg-[#00E5FF] text-black hover:bg-[#00E5FF]/90 rounded-none h-9 font-heading font-bold text-xs tracking-[0.1em]" data-testid="save-case-button">
                    {saving ? <Loader2 className="w-3.5 h-3.5 mr-2 animate-spin" /> : <Check className="w-3.5 h-3.5 mr-2" />}SAVE CASE
                  </Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-[1px] bg-white/[0.04]">
        <StatTile label="Total Cases" value={stats.total_cases} icon={BookOpen} color="#00E5FF" hint="// in corpus" />
        <StatTile label="With Media" value={stats.with_media} icon={ImageIcon} color="#00FF88" hint="// image / video" />
        <StatTile label="Incident Types" value={stats.by_type?.length || 0} icon={Sparkles} color="#FFB800" hint="// covered" />
        <StatTile label="Strongest Category" value={stats.by_type?.[0]?.incident_type?.replace("_", " ") || "—"} valueIsText value2={stats.by_type?.[0]?.count} icon={Database} color="#B366FF" hint="// most precedents" />
      </div>

      {/* ── Corpus telemetry: composition by source + 24h growth ── */}
      <CorpusTelemetryPanel stats={stats} onAutoSeeded={load} />

      {/* ── Vision-escalation telemetry ── */}
      <VisionEscalationsPanel data={stats.vision_escalations} />

      {/* Filter bar */}
      <div className="flex items-center gap-2">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-500" />
          <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search title, rationale, decision..." className="bg-[#0A0A0A] border-white/[0.08] rounded-none pl-9 text-white text-xs font-mono" data-testid="training-search" />
        </div>
        <Select value={filterType} onValueChange={setFilterType}>
          <SelectTrigger className="bg-[#0A0A0A] border-white/[0.08] rounded-none text-white text-xs w-48" data-testid="training-type-filter"><SelectValue /></SelectTrigger>
          <SelectContent className="bg-[#0B0B0B] border-white/10 text-white">
            <SelectItem value="all">ALL TYPES</SelectItem>
            {INCIDENT_TYPES.map(t => <SelectItem key={t} value={t} className="uppercase">{t.replace("_", " ")}</SelectItem>)}
          </SelectContent>
        </Select>
        <Button variant="ghost" onClick={load} className="h-9 w-9 p-0 text-gray-500 hover:text-white border border-white/[0.08] rounded-none"><RefreshCw className="w-3.5 h-3.5" /></Button>
      </div>

      {/* IFAB Clause filter row */}
      <div className="flex items-center gap-2 flex-wrap" data-testid="clause-filter-bar">
        <span className="text-[9px] font-mono uppercase tracking-[0.22em] text-gray-500 flex items-center gap-1.5">
          <Scale className="w-3 h-3 text-[#FFB800]" />
          IFAB CLAUSE
        </span>
        <div className="relative flex-1 min-w-[180px] max-w-sm">
          <Input
            value={clauseFilter}
            onChange={e => setClauseFilter(e.target.value)}
            placeholder='e.g. "Law 12", "DOGSO", "encroachment", "APP"'
            className="bg-[#0A0A0A] border-[#FFB800]/[0.18] hover:border-[#FFB800]/40 focus-visible:border-[#FFB800]/60 rounded-none pl-3 text-[#FFD466] text-xs font-mono placeholder:text-gray-600 h-8"
            data-testid="clause-filter-input"
          />
          {clauseFilter && (
            <button
              onClick={() => setClauseFilter("")}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-500 hover:text-[#FFB800] text-[10px] font-mono"
              data-testid="clause-filter-clear"
              title="Clear clause filter"
            >×</button>
          )}
        </div>
        {[
          ["Law 10",  "goal-line"],
          ["Law 11",  "offside"],
          ["Law 12",  "fouls / handball / red"],
          ["Law 14",  "penalty"],
          ["DOGSO",   "denying obvious goal"],
          ["APP",     "attacking possession"],
          ["SFP",     "serious foul play"],
        ].map(([k, hint]) => {
          const active = clauseFilter.toLowerCase() === k.toLowerCase();
          return (
            <button
              key={k}
              onClick={() => setClauseFilter(active ? "" : k)}
              className={`text-[9px] font-mono px-2 py-1 border transition-all ${active ? 'bg-[#FFB800]/15 text-[#FFB800] border-[#FFB800]/50' : 'text-gray-500 border-white/[0.08] hover:text-[#FFD466] hover:border-[#FFB800]/30'}`}
              data-testid={`clause-preset-${k.replace(/\s+/g, '-').toLowerCase()}`}
              title={`${k} — ${hint}`}
            >
              {k}
            </button>
          );
        })}
        <span className="ml-auto flex items-center gap-1.5">
          {[
            ["from-boost", "Self-learned from operator Q&A", "#B366FF"],
            ["promoted", "Promoted confirmed incidents", "#00FF88"],
            ["web-ingested", "Scraped precedents", "#00E5FF"],
          ].map(([k, hint, color]) => {
            const active = tagFilter === k;
            return (
              <button
                key={k}
                onClick={() => setTagFilter(active ? "" : k)}
                className={`text-[9px] font-mono px-2 py-1 border transition-all flex items-center gap-1 ${active ? 'bg-white/10' : 'text-gray-500 border-white/[0.08] hover:text-white'}`}
                style={active ? { color, borderColor: `${color}80`, background: `${color}15` } : undefined}
                data-testid={`tag-preset-${k}`}
                title={hint}
              >
                {k === "from-boost" && <span>🧠</span>}
                {k}
              </button>
            );
          })}
        </span>
      </div>

      {/* Cases table */}
      <div className="border border-white/[0.08] bg-[#0A0A0A]" data-testid="cases-table">
        <div className="px-4 py-2 flex items-center justify-between border-b border-white/[0.06]">
          <span className="text-[10px] font-heading font-bold uppercase tracking-[0.22em] text-gray-400">CASES</span>
          <span className="text-[10px] font-mono text-gray-600">{filteredCases.length} ROW{filteredCases.length === 1 ? "" : "S"}</span>
        </div>
        <ScrollArea className="h-[calc(100vh-400px)]">
          {loading ? (
            <div className="p-8 text-center text-gray-500 text-xs font-mono">LOADING…</div>
          ) : filteredCases.length === 0 ? (
            <div className="p-12 text-center">
              <BookOpen className="w-10 h-10 text-gray-700 mx-auto mb-3" />
              <p className="text-sm text-gray-500 mb-1">No training cases yet</p>
              <p className="text-[10px] font-mono text-gray-600 mb-4">SEED 20 CANONICAL to bootstrap the corpus.</p>
            </div>
          ) : (
            <div className="divide-y divide-white/[0.04]">
              {filteredCases.map(c => (
                <CaseRow
                  key={c.id}
                  c={c}
                  isUploading={uploadingFor === c.id}
                  onUpload={(f) => handleUploadMedia(c.id, f)}
                  onDelete={() => handleDelete(c.id, c.title)}
                />
              ))}
            </div>
          )}
        </ScrollArea>
      </div>

      {/* (removed unused hidden file input) */}

      {/* Cases table */}
      {/* (removed unused hidden file input) */}
    </div>
  );
}

function StatTile({ label, value, icon: Icon, color, hint, valueIsText, value2 }) {
  return (
    <div className="group bg-gradient-to-br from-[#0A0A0A] to-[#070707] p-4 relative overflow-hidden">
      <div className="absolute top-0 left-0 w-12 h-[2px]" style={{ backgroundColor: color, boxShadow: `0 0 8px ${color}` }} />
      <div className="absolute top-1.5 right-1.5 w-1.5 h-1.5 border-r border-t" style={{ borderColor: `${color}66` }} />
      <div className="absolute bottom-1.5 left-1.5 w-1.5 h-1.5 border-l border-b" style={{ borderColor: `${color}66` }} />
      <div className="flex items-start justify-between">
        <div className="min-w-0">
          <p className="text-[9px] font-mono uppercase tracking-[0.25em] text-gray-500">{label}</p>
          {valueIsText ? (
            <div className="flex items-baseline gap-2 mt-1">
              <p className="text-base font-mono font-bold leading-none uppercase tracking-tight" style={{ color }}>{value}</p>
              {value2 !== undefined && <span className="text-[10px] font-mono text-gray-500">({value2})</span>}
            </div>
          ) : (
            <p className="text-[26px] font-mono font-bold mt-1 leading-none tracking-tight" style={{ color, textShadow: `0 0 12px ${color}44` }}>{value}</p>
          )}
          <p className="text-[8px] font-mono uppercase tracking-[0.2em] text-gray-600 mt-2">{hint}</p>
        </div>
        <Icon className="w-5 h-5 opacity-40" style={{ color }} />
      </div>
    </div>
  );
}

function CaseRow({ c, isUploading, onUpload, onDelete }) {
  const ref = useRef(null);
  const tagColor = TYPE_COLORS[c.incident_type] || "#FFFFFF";
  const allTags = [...(c.keywords || []), ...(c.visual_tags || []).map(t => `vis:${t}`)].slice(0, 8);

  return (
    <div className="p-4 hover:bg-white/[0.02] transition-colors" data-testid={`case-row-${c.id}`}>
      <div className="flex items-start gap-4">
        {/* Type pill */}
        <div className="flex-none">
          <span className="text-[9px] font-mono uppercase tracking-[0.2em] px-2 py-1 border" style={{ color: tagColor, borderColor: `${tagColor}40`, backgroundColor: `${tagColor}10` }}>
            {c.incident_type?.replace("_", " ")}
          </span>
        </div>
        {/* Main */}
        <div className="flex-1 min-w-0">
          <div className="flex items-baseline gap-2 flex-wrap">
            <h3 className="text-sm font-heading font-bold text-white truncate">{c.title}</h3>
            {c.match_context?.year && <span className="text-[10px] font-mono text-gray-500">{c.match_context.competition} · {c.match_context.year}</span>}
          </div>
          <p className="text-xs text-[#00FF88] mt-1 font-mono">→ {c.correct_decision}</p>
          <p className="text-xs text-gray-400 mt-1 leading-relaxed line-clamp-2">{c.rationale}</p>
          {Array.isArray(c.law_references) && c.law_references.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-1.5" data-testid={`law-refs-${c.id}`}>
              {c.law_references.map((lr, i) => (
                <span
                  key={i}
                  className="text-[9px] font-mono text-[#FFD466] bg-[#FFB800]/[0.06] px-1.5 py-0.5 border border-[#FFB800]/25"
                  title={`IFAB clause: ${lr}`}
                >
                  <Scale className="inline w-2 h-2 mr-0.5 -mt-0.5" />{lr}
                </span>
              ))}
            </div>
          )}
          {allTags.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-2">
              {allTags.map((t, i) => {
                const isVis = t.startsWith("vis:");
                const label = isVis ? t.replace("vis:", "") : t;
                return (
                  <span key={i} className={`text-[9px] font-mono px-1.5 py-0.5 border ${isVis ? 'text-[#B366FF] border-[#B366FF]/30 bg-[#B366FF]/[0.05]' : 'text-gray-400 border-white/10 bg-white/[0.03]'}`}>
                    {isVis && <Sparkles className="inline w-2 h-2 mr-0.5 -mt-0.5" />}{label}
                  </span>
                );
              })}
            </div>
          )}
        </div>
        {/* Media + actions */}
        <div className="flex-none flex items-center gap-2">
          {c.media_storage_path ? (
            <div className="flex items-center gap-1 text-[9px] font-mono text-[#00FF88] border border-[#00FF88]/30 bg-[#00FF88]/[0.06] px-2 py-1">
              {c.media_content_type?.startsWith("video") ? <Film className="w-3 h-3" /> : <ImageIcon className="w-3 h-3" />}
              MEDIA
            </div>
          ) : null}
          <input
            ref={ref}
            type="file"
            accept="image/*,video/*"
            className="hidden"
            onChange={e => { const f = e.target.files?.[0]; if (f) onUpload(f); e.target.value = ""; }}
          />
          <Button variant="ghost" size="sm" onClick={() => ref.current?.click()} disabled={isUploading} className="h-8 w-8 p-0 text-gray-500 hover:text-[#00E5FF] border border-white/10 hover:border-[#00E5FF]/40 rounded-none" title="Upload image/video (auto-tagged via Vision AI)" data-testid={`upload-media-${c.id}`}>
            {isUploading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
          </Button>
          <Button variant="ghost" size="sm" onClick={onDelete} className="h-8 w-8 p-0 text-gray-500 hover:text-[#FF2A2A] border border-white/10 hover:border-[#FF2A2A]/40 rounded-none" title="Delete" data-testid={`delete-case-${c.id}`}>
            <Trash2 className="w-3.5 h-3.5" />
          </Button>
        </div>
      </div>
    </div>
  );
}


/**
 * CorpusTelemetryPanel — admin-facing breakdown of how the training corpus
 * was assembled. Three signals:
 *   1. Composition by source (seed / web-learning / operator / manual)
 *   2. Growth in last 24h (total + web-only)
 *   3. Per-incident-type bar chart so admin spots gaps (e.g. <5 corners)
 *
 * Mounted inside the Training Library page. Read-only — no admin role gate
 * needed because the data is non-sensitive aggregate counts.
 */
function CorpusTelemetryPanel({ stats, onAutoSeeded }) {
  const total = stats.total_cases || 0;
  const sources = stats.by_source || [];
  const types = stats.by_type || [];
  const last24 = stats.last_24h || 0;
  const last24Web = stats.last_24h_web || 0;
  const sourceQuality = stats.source_quality || [];
  const sourceColors = {
    seed: "#00E5FF",
    "web-learning": "#B366FF",
    operator: "#00FF88",
    manual: "#FFB800",
  };
  const sourceLabels = {
    seed: "SEED · canonical",
    "web-learning": "WEB · scheduler",
    operator: "OPERATOR · feedback",
    manual: "MANUAL · admin",
  };
  // Quality lookup for rendering avg-conf chip alongside each bar.
  const qByBucket = Object.fromEntries(
    sourceQuality.map((q) => [q.source, q])
  );
  // Reference: highest avg_confidence across all sources, used to render
  // the "delta vs best" hint so admins immediately see which source is
  // pulling AI confidence up vs down.
  const bestConf = sourceQuality.reduce(
    (m, q) => (q.avg_confidence > m ? q.avg_confidence : m),
    0
  );

  // ── Auto-seed action — used by GAP rows ──
  const [seeding, setSeeding] = useState(null); // incident_type currently seeding
  const seedGapType = async (incidentType) => {
    setSeeding(incidentType);
    try {
      const { data } = await axios.post(
        `${API}/training/auto-seed-type`,
        { incident_type: incidentType, count: 5 },
        { withCredentials: true }
      );
      const ins = data.inserted || 0;
      if (ins > 0) {
        toast.success(`Auto-seeded ${ins} ${incidentType} cases`, {
          description: `Total ${incidentType} corpus: ${data.total_for_type}`,
        });
        if (onAutoSeeded) onAutoSeeded();
      } else {
        toast.warning(`No new ${incidentType} cases inserted`, {
          description: `${data.skipped} skipped (duplicates / invalid). Try again.`,
        });
      }
    } catch (e) {
      toast.error("Auto-seed failed", {
        description: e?.response?.data?.detail || e.message,
      });
    } finally {
      setSeeding(null);
    }
  };

  return (
    <div
      className="grid grid-cols-1 lg:grid-cols-2 gap-3"
      data-testid="corpus-telemetry-panel"
    >
      {/* Composition by source */}
      <div className="border border-white/[0.08] bg-[#0A0A0A] p-4">
        <div className="flex items-center justify-between mb-3">
          <p className="text-[9px] font-mono tracking-[0.28em] text-gray-500 uppercase">
            Corpus Composition · By Source
          </p>
          <span className="text-[9px] font-mono text-gray-600" data-testid="corpus-total">
            {total} cases
          </span>
        </div>
        {sources.length === 0 ? (
          <p className="text-[11px] text-gray-500 font-mono">No corpus data yet.</p>
        ) : (
          <div className="space-y-2">
            {sources.map((s) => {
              const pct = total > 0 ? (s.count / total) * 100 : 0;
              const color = sourceColors[s.source] || "#fff";
              const label = sourceLabels[s.source] || s.source.toUpperCase();
              const q = qByBucket[s.source];
              const delta = q && bestConf > 0 ? (q.avg_confidence - bestConf) : null;
              return (
                <div
                  key={s.source}
                  data-testid={`corpus-source-${s.source}`}
                  className="space-y-1"
                >
                  <div className="flex items-center justify-between text-[10px] font-mono">
                    <span style={{ color }}>{label}</span>
                    <div className="flex items-center gap-2">
                      {q && (
                        <span
                          className="text-[9px] font-mono px-1.5 py-0.5 border"
                          style={{
                            color,
                            borderColor: `${color}40`,
                            backgroundColor: `${color}10`,
                          }}
                          data-testid={`corpus-quality-${s.source}`}
                          title={`Avg verdict confidence when this source was cited (${q.citation_count} citations)`}
                        >
                          {q.avg_confidence}% AVG
                          {delta !== null && delta < 0 && (
                            <span className="ml-1 text-[#FFB800]">
                              {delta.toFixed(1)}
                            </span>
                          )}
                          {delta !== null && delta === 0 && q.citation_count > 0 && (
                            <span className="ml-1 text-[#00FF88]">★</span>
                          )}
                        </span>
                      )}
                      <span className="text-gray-400">
                        {s.count}{" "}
                        <span className="text-gray-600">· {pct.toFixed(1)}%</span>
                      </span>
                    </div>
                  </div>
                  <div className="h-1.5 bg-white/[0.04]">
                    <div
                      className="h-full transition-all"
                      style={{ width: `${pct}%`, backgroundColor: color }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* 24h growth ribbon */}
        <div className="mt-4 pt-3 border-t border-white/[0.06] flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div>
              <p className="text-[9px] font-mono tracking-[0.2em] text-gray-500 uppercase">
                LAST 24h · ALL
              </p>
              <p className="text-[14px] font-mono text-[#00FF88] mt-0.5" data-testid="corpus-last-24h">
                +{last24}
              </p>
            </div>
            <div>
              <p className="text-[9px] font-mono tracking-[0.2em] text-gray-500 uppercase">
                WEB-LEARNING
              </p>
              <p className="text-[14px] font-mono text-[#B366FF] mt-0.5" data-testid="corpus-last-24h-web">
                +{last24Web}
              </p>
            </div>
          </div>
          <span
            className={`text-[9px] font-mono tracking-[0.2em] px-2 py-1 border ${
              last24Web > 0
                ? "text-[#00FF88] border-[#00FF88]/40 bg-[#00FF88]/[0.05]"
                : "text-[#FFB800] border-[#FFB800]/40 bg-[#FFB800]/[0.05]"
            }`}
            data-testid="corpus-web-health"
          >
            {last24Web > 0 ? "WEB-LEARNING HEALTHY" : "WEB-LEARNING IDLE"}
          </span>
        </div>
      </div>

      {/* By type — gap detector with auto-seed */}
      <div className="border border-white/[0.08] bg-[#0A0A0A] p-4">
        <div className="flex items-center justify-between mb-3">
          <p className="text-[9px] font-mono tracking-[0.28em] text-gray-500 uppercase">
            Composition · By Incident Type
          </p>
          <span className="text-[9px] font-mono text-gray-600">
            gap = &lt; 5 cases · click GAP to auto-seed
          </span>
        </div>
        {types.length === 0 ? (
          <p className="text-[11px] text-gray-500 font-mono">No type data.</p>
        ) : (
          <div className="space-y-1.5 max-h-[260px] overflow-y-auto pr-1">
            {types.map((t) => {
              const pct = total > 0 ? (t.count / total) * 100 : 0;
              const isGap = t.count < 5;
              const color = isGap ? "#FF6B6B" : "#00E5FF";
              const isSeeding = seeding === t.incident_type;
              return (
                <div
                  key={t.incident_type}
                  className="flex items-center gap-2"
                  data-testid={`corpus-type-${t.incident_type}`}
                >
                  <span
                    className="text-[10px] font-mono uppercase tracking-[0.15em] w-24 truncate"
                    style={{ color: isGap ? "#FF8A8A" : "#fff" }}
                    title={isGap ? "Gap — fewer than 5 precedents" : ""}
                  >
                    {t.incident_type?.replace("_", " ") || "—"}
                  </span>
                  <div className="flex-1 h-1.5 bg-white/[0.04]">
                    <div
                      className="h-full transition-all"
                      style={{ width: `${pct}%`, backgroundColor: color }}
                    />
                  </div>
                  <span
                    className="text-[10px] font-mono w-10 text-right"
                    style={{ color: isGap ? "#FF8A8A" : "#94A3B8" }}
                  >
                    {t.count}
                  </span>
                  {isGap ? (
                    <button
                      onClick={() => seedGapType(t.incident_type)}
                      disabled={isSeeding}
                      className={`text-[9px] font-mono tracking-[0.2em] px-2 py-0.5 border transition-all ${
                        isSeeding
                          ? "text-gray-500 border-gray-500/40 bg-gray-500/[0.06] cursor-wait"
                          : "text-[#FF6B6B] border-[#FF6B6B]/40 bg-[#FF6B6B]/[0.06] hover:bg-[#FF6B6B]/15 hover:border-[#FF6B6B]"
                      }`}
                      data-testid={`corpus-gap-seed-${t.incident_type}`}
                      title={`Auto-seed 5 ${t.incident_type} cases via LLM`}
                    >
                      {isSeeding ? "SEEDING…" : "+ AUTO-SEED 5"}
                    </button>
                  ) : (
                    <span className="text-[8px] font-mono tracking-[0.15em] text-gray-600 w-20 text-right">
                      OK
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * VisionEscalationsPanel — surfaces how often OCTON's post-LLM
 * violent-conduct safety-net upgraded a YELLOW/REVIEW verdict to RED.
 *
 * Two big counters (TOTAL / 24h) + a top-triggers list so admins see
 * which phrases (e.g. 'elbow strikes', 'stamp on') keep firing the
 * safety-net. Useful as a heat-map for officiating training (clusters
 * of stamps in a given week → emphasise SFP in the ref briefing).
 */
function VisionEscalationsPanel({ data }) {
  const total = data?.total || 0;
  const last24h = data?.last_24h || 0;
  const triggers = data?.top_triggers || [];
  const has24h = last24h > 0;
  const accent = "#FF6B6B";

  // Drill-down state
  const [drillTrigger, setDrillTrigger] = useState(null);
  const [drillIncidents, setDrillIncidents] = useState([]);
  const [drillLoading, setDrillLoading] = useState(false);

  const openDrill = async (trigger) => {
    setDrillTrigger(trigger);
    setDrillLoading(true);
    setDrillIncidents([]);
    try {
      const { data: rows } = await axios.get(
        `${API}/incidents-by-vision-trigger`,
        { params: { trigger, limit: 30 } }
      );
      setDrillIncidents(rows || []);
    } catch (e) {
      toast.error("Failed to load incidents", {
        description: e?.response?.data?.detail || e.message,
      });
    } finally {
      setDrillLoading(false);
    }
  };

  return (
    <div
      className="border border-white/[0.08] bg-[#0A0A0A] p-4"
      data-testid="vision-escalations-panel"
    >
      <div className="flex items-center justify-between mb-3">
        <p className="text-[9px] font-mono tracking-[0.28em] text-gray-500 uppercase">
          Vision Escalations · YELLOW → RED safety-net
        </p>
        <span
          className={`text-[9px] font-mono tracking-[0.2em] px-2 py-1 border ${
            has24h
              ? "text-[#FF6B6B] border-[#FF6B6B]/40 bg-[#FF6B6B]/[0.06]"
              : "text-gray-500 border-white/[0.06] bg-white/[0.02]"
          }`}
          data-testid="vision-escalation-status"
        >
          {has24h ? "ACTIVE" : "QUIET"}
        </span>
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-[1px] bg-white/[0.04] mb-4">
        <div className="bg-[#0A0A0A] p-3" data-testid="vision-escalation-total">
          <p className="text-[8px] font-mono tracking-[0.28em] text-gray-500 uppercase">
            Total
          </p>
          <p className="text-2xl font-mono mt-1" style={{ color: accent }}>
            {total}
          </p>
          <p className="text-[8px] font-mono text-gray-600 mt-0.5">// all-time RED upgrades</p>
        </div>
        <div className="bg-[#0A0A0A] p-3" data-testid="vision-escalation-24h">
          <p className="text-[8px] font-mono tracking-[0.28em] text-gray-500 uppercase">
            Last 24h
          </p>
          <p className="text-2xl font-mono mt-1" style={{ color: accent }}>
            {last24h}
          </p>
          <p className="text-[8px] font-mono text-gray-600 mt-0.5">// recent activity</p>
        </div>
        <div className="bg-[#0A0A0A] p-3 col-span-2">
          <p className="text-[8px] font-mono tracking-[0.28em] text-gray-500 uppercase mb-2">
            Top triggers · click to drill
          </p>
          {triggers.length === 0 ? (
            <p className="text-[10px] font-mono text-gray-500">
              No vision-escalations yet — the safety-net hasn't fired.
            </p>
          ) : (
            <div className="space-y-1">
              {triggers.map((t, i) => (
                <button
                  key={i}
                  onClick={() => openDrill(t.trigger)}
                  className="w-full flex items-center justify-between gap-2 px-1 py-0.5 hover:bg-[#FF6B6B]/[0.06] border border-transparent hover:border-[#FF6B6B]/30 transition-all"
                  data-testid={`vision-escalation-trigger-${i}`}
                  title={`Drill into incidents that fired '${t.trigger}'`}
                >
                  <span
                    className="text-[10px] font-mono uppercase tracking-[0.1em] truncate text-left"
                    style={{ color: "#FFB8B8" }}
                  >
                    {t.trigger}
                  </span>
                  <span className="text-[10px] font-mono text-gray-400 flex-none">
                    × {t.count}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {drillTrigger && (
        <div
          className="fixed inset-0 z-[100] bg-black/80 flex items-center justify-center p-6"
          onClick={() => setDrillTrigger(null)}
          data-testid="vision-escalation-drill-modal"
        >
          <div
            className="bg-[#0A0A0A] border border-[#FF6B6B]/40 max-w-3xl w-full max-h-[80vh] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between p-4 border-b border-white/[0.06]">
              <div>
                <p className="text-[9px] font-mono tracking-[0.28em] text-gray-500 uppercase">
                  Vision Escalation · Drill-down
                </p>
                <p
                  className="text-[14px] font-mono text-[#FF6B6B] mt-1 truncate"
                  data-testid="vision-escalation-drill-title"
                >
                  {drillTrigger.toUpperCase()}
                </p>
              </div>
              <button
                onClick={() => setDrillTrigger(null)}
                className="text-gray-400 hover:text-white text-[18px] px-2"
                data-testid="vision-escalation-drill-close"
              >
                ×
              </button>
            </div>
            <div className="overflow-y-auto p-3 space-y-2">
              {drillLoading ? (
                <p className="text-[11px] font-mono text-gray-500 p-4">Loading…</p>
              ) : drillIncidents.length === 0 ? (
                <p className="text-[11px] font-mono text-gray-500 p-4">
                  No incidents found for this trigger.
                </p>
              ) : (
                drillIncidents.map((inc) => (
                  <div
                    key={inc.id}
                    className="border border-white/[0.06] hover:border-[#FF6B6B]/40 bg-white/[0.02] p-3 transition-all"
                    data-testid={`vision-drill-row-${inc.id?.slice(0, 8)}`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <p className="text-[11px] font-mono text-white truncate">
                          {inc.ai_analysis?.suggested_decision || "Verdict pending"}
                        </p>
                        <div className="flex items-center gap-2 flex-wrap mt-1">
                          <span className="text-[9px] font-mono px-1.5 py-0.5 border border-[#FF6B6B]/30 text-[#FF6B6B] bg-[#FF6B6B]/10">
                            {(inc.incident_type || "—").toUpperCase()}
                          </span>
                          {inc.team_involved && (
                            <span className="text-[9px] font-mono text-gray-400">
                              {inc.team_involved}
                            </span>
                          )}
                          {inc.timestamp_in_match && (
                            <span className="text-[9px] font-mono text-gray-500">
                              {inc.timestamp_in_match}
                            </span>
                          )}
                          {typeof inc.ai_analysis?.final_confidence === "number" && (
                            <span className="text-[9px] font-mono px-1.5 py-0.5 border border-[#FFB800]/30 text-[#FFB800] bg-[#FFB800]/10">
                              {inc.ai_analysis.final_confidence.toFixed(0)}%
                            </span>
                          )}
                        </div>
                        {inc.ai_analysis?.vision_escalation?.original_decision && (
                          <p className="text-[9px] font-mono text-gray-500 mt-1">
                            UPGRADED FROM: {inc.ai_analysis.vision_escalation.original_decision}
                          </p>
                        )}
                      </div>
                      <a
                        href={`/?incident=${encodeURIComponent(inc.id)}`}
                        className="text-[9px] font-mono tracking-[0.2em] px-2 py-1 border border-[#00E5FF]/40 text-[#00E5FF] hover:bg-[#00E5FF]/10 flex-none"
                        data-testid={`vision-drill-open-${inc.id?.slice(0, 8)}`}
                      >
                        OPEN →
                      </a>
                    </div>
                  </div>
                ))
              )}
            </div>
            <div className="border-t border-white/[0.06] p-2 flex items-center justify-between">
              <p className="text-[9px] font-mono text-gray-500 px-2">
                {drillIncidents.length} incident{drillIncidents.length === 1 ? "" : "s"}
              </p>
              <button
                onClick={() => setDrillTrigger(null)}
                className="text-[9px] font-mono tracking-[0.2em] px-3 py-1.5 border border-white/[0.1] text-gray-400 hover:text-white hover:border-white/30"
              >
                CLOSE
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

