import { useState, useEffect, useCallback, useRef } from "react";
import axios from "axios";
import { toast } from "sonner";
import {
  BookOpen, Plus, Trash2, Upload, Sparkles, RefreshCw, Database,
  Search, Film, Image as ImageIcon, Check, Loader2, Globe, ExternalLink
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
  const [stats, setStats] = useState({ total_cases: 0, by_type: [], with_media: 0 });
  const [loading, setLoading] = useState(true);
  const [filterType, setFilterType] = useState("all");
  const [search, setSearch] = useState("");
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

  const loadWebLog = useCallback(async () => {
    try {
      const r = await axios.get(`${API}/training/ingest-log`, { params: { limit: 10 }, withCredentials: true });
      setWebLog(r.data || []);
    } catch { /* non-fatal */ }
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = {};
      if (filterType !== "all") params.incident_type = filterType;
      if (search) params.q = search;
      const [listRes, statsRes] = await Promise.all([
        axios.get(`${API}/training/cases`, { params, withCredentials: true }),
        axios.get(`${API}/training/stats`, { withCredentials: true }),
      ]);
      setCases(listRes.data || []);
      setStats(statsRes.data || { total_cases: 0, by_type: [], with_media: 0 });
    } catch (e) {
      toast.error("Failed to load training library");
    } finally {
      setLoading(false);
    }
  }, [filterType, search]);

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
          <Dialog open={showWeb} onOpenChange={(v) => { setShowWeb(v); if (v) loadWebLog(); }}>
            <DialogTrigger asChild>
              <Button className="bg-transparent text-[#B366FF] border border-[#B366FF]/40 hover:bg-[#B366FF]/10 hover:border-[#B366FF]/70 rounded-none font-heading font-bold text-xs tracking-[0.1em] h-9 px-4 transition-all" data-testid="web-ingest-button">
                <Globe className="w-3.5 h-3.5 mr-2" />
                LEARN FROM WEB
              </Button>
            </DialogTrigger>
            <DialogContent className="bg-[#0B0B0B] border-[#B366FF]/30 text-white max-w-2xl max-h-[90vh] overflow-y-auto">
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
