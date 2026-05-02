/**
 * OCTON VAR — application shell.
 *
 * Heavy lifting (LiveVAR, Matches, Analytics dashboards + their helper
 * components) lives under /pages and /components. This file owns the
 * router + auth wiring and the small auxiliary pages (Login/Register/
 * History/Settings/Feedback/Sidebar) that are too small to need their own
 * file.
 */
import { useCallback, useEffect, useState } from "react";
import "@/App.css";
import { BrowserRouter, Routes, Route, NavLink, useNavigate, useLocation, Navigate } from "react-router-dom";
import axios from "axios";
import { Toaster, toast } from "sonner";
import {
  Video, History, BarChart3, Settings, BookOpen, Brain, Trophy, Users,
  LogOut, LogIn, UserPlus, ThumbsUp, ThumbsDown, Lock, ArrowRight, Zap,
  Radio, Award, AlertTriangle,
} from "lucide-react";
import { Button } from "./components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "./components/ui/card";
import { Input } from "./components/ui/input";
import { Label } from "./components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "./components/ui/tabs";
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
} from "recharts";

import { API, formatApiError } from "./lib/api";
import { incidentTypeConfig, decisionStatusConfig } from "./lib/config";
import { AuthProvider, useAuth } from "./contexts/AuthContext";
import { SelectedIncidentProvider, useSelectedIncidentId } from "./contexts/SelectedIncidentContext";

import { OctonBrainLogo } from "./components/OctonBrainLogo";
import { SystemHealthPip } from "./components/SystemHealthPip";
import { ConfidenceScore } from "./components/OctonAnalysisParts";
import { IncidentBadge, DecisionBadge } from "./components/Badges";
import OctonVoiceWidget from "./components/OctonVoiceWidget";

import TrainingLibraryPage from "./TrainingLibraryPage";
import { LiveVARPage } from "./pages/LiveVARPage";
import { MatchesPage } from "./pages/MatchesPage";
import { AnalyticsPage } from "./pages/AnalyticsPage";
import LiveMatchWallPage from "./pages/LiveMatchWallPage";
import MobileOFRPage from "./pages/MobileOFRPage";
import { RefereesIndexPage, RefereeScorecardPage } from "./pages/RefereeScorecardPage";
import AuditChainPill from "./components/AuditChainPill";
import LiveIngestPanel from "./components/LiveIngestPanel";
import BoothActivityPage from "./pages/BoothActivityPage";

// ── Voice widget mounting helper ──────────────────────────
function MountedVoiceWidget() {
  const { id, voiceActionHandler } = useSelectedIncidentId();
  const onVoiceAction = useCallback(async (action, args) => {
    const handler = voiceActionHandler.current;
    if (handler) await handler(action, args);
    else toast.info(`Action "${action.replace(/_/g, " ")}" — navigate to the match dashboard to execute`);
  }, [voiceActionHandler]);
  return <OctonVoiceWidget selectedIncidentId={id} onVoiceAction={onVoiceAction} />;
}

// ── Login Page ────────────────────────────────────────────
const LoginPage = () => {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const { login } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      await login(email, password);
      navigate("/");
    } catch (err) {
      setError(formatApiError(err.response?.data?.detail) || err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#050505] flex items-center justify-center p-4" data-testid="login-page">
      <Card className="w-full max-w-md bg-[#121212] border-white/10 rounded-none">
        <CardHeader className="text-center space-y-4 pb-2">
          <div className="flex items-center justify-center"><OctonBrainLogo size={48} /></div>
          <div>
            <CardTitle className="text-2xl font-heading font-black text-white tracking-tight">OCTON VAR</CardTitle>
            <p className="text-xs font-mono text-[#00E5FF] tracking-[0.15em] mt-1">NEOCORTEX FORENSIC AI</p>
          </div>
          <CardDescription className="text-gray-400 text-sm">Lightning speed analyses for match decisions</CardDescription>
        </CardHeader>
        <CardContent className="pt-4">
          <form onSubmit={handleSubmit} className="space-y-4">
            {error && <div className="p-3 bg-[#FF3333]/10 border border-[#FF3333]/30 rounded-none text-sm text-[#FF3333]" data-testid="login-error">{error}</div>}
            <div className="space-y-2">
              <Label className="text-gray-300">Email</Label>
              <Input value={email} onChange={e => setEmail(e.target.value)} type="email" placeholder="operator@octonvar.com" className="bg-[#050505] border-white/10 text-white rounded-none" data-testid="login-email-input" required />
            </div>
            <div className="space-y-2">
              <Label className="text-gray-300">Password</Label>
              <Input value={password} onChange={e => setPassword(e.target.value)} type="password" placeholder="Enter password" className="bg-[#050505] border-white/10 text-white rounded-none" data-testid="login-password-input" required />
            </div>
            <Button type="submit" disabled={loading} className="w-full bg-white text-black hover:bg-gray-200 rounded-none font-semibold" data-testid="login-form-submit-button">
              {loading ? "AUTHENTICATING..." : <><LogIn className="w-4 h-4 mr-2" />SIGN IN</>}
            </Button>
          </form>
          <div className="mt-6 text-center">
            <span className="text-sm text-gray-400">No account? </span>
            <button onClick={() => navigate("/register")} className="text-sm text-[#00E5FF] hover:underline" data-testid="go-to-register">Create one</button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

// ── Register Page ─────────────────────────────────────────
const RegisterPage = () => {
  const [form, setForm] = useState({ name: "", email: "", password: "", role: "referee" });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const { register } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      await register(form.name, form.email, form.password, form.role);
      navigate("/");
    } catch (err) {
      setError(formatApiError(err.response?.data?.detail) || err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#050505] flex items-center justify-center p-4" data-testid="register-page">
      <Card className="w-full max-w-md bg-[#121212] border-white/10 rounded-none">
        <CardHeader className="text-center space-y-4 pb-2">
          <div className="flex items-center justify-center"><OctonBrainLogo size={48} /></div>
          <CardTitle className="text-2xl font-heading font-black text-white">JOIN OCTON VAR</CardTitle>
          <CardDescription className="text-gray-400 text-sm">Register for Dr Finnegan's Forensic AI system</CardDescription>
        </CardHeader>
        <CardContent className="pt-4">
          <form onSubmit={handleSubmit} className="space-y-4">
            {error && <div className="p-3 bg-[#FF3333]/10 border border-[#FF3333]/30 rounded-none text-sm text-[#FF3333]" data-testid="register-error">{error}</div>}
            <div className="space-y-2">
              <Label className="text-gray-300">Full Name</Label>
              <Input value={form.name} onChange={e => setForm({...form, name: e.target.value})} placeholder="Your name" className="bg-[#050505] border-white/10 text-white rounded-none" data-testid="register-name-input" required />
            </div>
            <div className="space-y-2">
              <Label className="text-gray-300">Email</Label>
              <Input value={form.email} onChange={e => setForm({...form, email: e.target.value})} type="email" placeholder="you@octonvar.com" className="bg-[#050505] border-white/10 text-white rounded-none" data-testid="register-email-input" required />
            </div>
            <div className="space-y-2">
              <Label className="text-gray-300">Password</Label>
              <Input value={form.password} onChange={e => setForm({...form, password: e.target.value})} type="password" placeholder="Min 6 characters" className="bg-[#050505] border-white/10 text-white rounded-none" data-testid="register-password-input" required />
            </div>
            <div className="space-y-2">
              <Label className="text-gray-300">Role</Label>
              <Select value={form.role} onValueChange={v => setForm({...form, role: v})}>
                <SelectTrigger className="bg-[#050505] border-white/10 text-white rounded-none" data-testid="register-role-select">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-[#121212] border-white/10">
                  <SelectItem value="referee" className="text-white">Referee</SelectItem>
                  <SelectItem value="var_operator" className="text-white">VAR Operator</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button type="submit" disabled={loading} className="w-full bg-white text-black hover:bg-gray-200 rounded-none font-semibold" data-testid="register-form-submit-button">
              {loading ? "CREATING ACCOUNT..." : <><UserPlus className="w-4 h-4 mr-2" />REGISTER</>}
            </Button>
          </form>
          <div className="mt-6 text-center">
            <span className="text-sm text-gray-400">Already have an account? </span>
            <button onClick={() => navigate("/login")} className="text-sm text-[#00E5FF] hover:underline" data-testid="go-to-login">Sign in</button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

// ── Sidebar ───────────────────────────────────────────────
const Sidebar = () => {
  const location = useLocation();
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const navItems = [
    { path: "/", icon: Video, label: "Live VAR", roles: null, section: "var" },
    { path: "/match-wall", icon: Radio, label: "Match Wall", roles: null, section: "var" },
    { path: "/history", icon: History, label: "Incident History", roles: null, section: "var" },
    { path: "/matches", icon: Trophy, label: "Matches", roles: ["admin"], section: "var" },
    { path: "/training", icon: BookOpen, label: "Training Library", roles: ["admin"], section: "var" },
    { path: "/analytics", icon: BarChart3, label: "VAR Analytics", roles: null, section: "system" },
    { path: "/referees", icon: Award, label: "Referee Scorecards", roles: null, section: "system" },
    { path: "/booths", icon: Users, label: "Booth Activity", roles: ["admin"], section: "system" },
    { path: "/feedback", icon: Brain, label: "AI Feedback", roles: ["admin", "var_operator"], section: "system" },
    { path: "/settings", icon: Settings, label: "Settings", roles: null, section: "system" },
  ].filter(item => !item.roles || (user && item.roles.includes(user.role)));

  const handleLogout = async () => {
    await logout();
    navigate("/login");
  };

  return (
    <div className="w-60 flex-shrink-0 border-r border-white/[0.06] h-screen sticky top-0 bg-[#050505] flex flex-col">
      <div className="p-5 border-b border-white/[0.06] relative overflow-hidden">
        <div className="absolute -top-8 -left-6 w-24 h-24 bg-[#00E5FF]/10 blur-2xl pointer-events-none" />
        <div className="absolute top-0 left-0 w-full h-[1px] bg-gradient-to-r from-[#00E5FF]/60 via-[#00E5FF]/20 to-transparent" />
        <div className="flex items-center gap-3 relative">
          <div className="relative">
            <div className="absolute inset-0 bg-[#00E5FF]/15 rounded-full blur-md" />
            <OctonBrainLogo size={42} />
          </div>
          <div className="flex-1 min-w-0">
            <h1 className="font-heading font-black text-white text-base tracking-tighter leading-none" style={{ textShadow: "0 0 10px #00E5FF33" }}>OCTON VAR</h1>
            <p className="text-[8px] font-mono text-[#00E5FF]/70 tracking-[0.2em] mt-1">NEOCORTEX · v2.1</p>
          </div>
          <SystemHealthPip />
        </div>
      </div>

      <nav className="flex-1 p-4 space-y-1 overflow-y-auto" data-testid="sidebar-navigation">
        {navItems.map(({ path, icon: Icon, label, section }, idx) => {
          const isActive = location.pathname === path;
          const prevSection = idx > 0 ? navItems[idx - 1].section : null;
          const showSeparator = prevSection && prevSection !== section;
          return (
            <div key={path}>
              {showSeparator && (
                <div className="my-2 px-4">
                  <div className="border-t border-white/5" />
                  <p className="text-[9px] font-mono uppercase tracking-[0.2em] text-gray-500 mt-2">
                    {section === "system" ? "SYSTEM" : ""}
                  </p>
                </div>
              )}
              <NavLink to={path} data-testid={`nav-${label.toLowerCase().replace(/\s/g, '-')}`}
                className={`flex items-center gap-3 px-4 py-2.5 rounded-none transition-all duration-200 ${isActive ? "bg-white/10 text-white border-l-2 border-[#00E5FF]" : "text-gray-400 hover:text-white hover:bg-white/5"}`}>
                <Icon className="w-4 h-4" /><span className="font-body text-sm">{label}</span>
              </NavLink>
            </div>
          );
        })}
      </nav>

      {user && (
        <div className="p-4 border-t border-white/[0.06] space-y-3">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 bg-[#00E5FF]/10 flex items-center justify-center border border-[#00E5FF]/20">
              <Users className="w-3.5 h-3.5 text-[#00E5FF]" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[11px] text-white truncate">{user.name}</p>
              <p className="text-[9px] font-mono text-gray-600 uppercase tracking-wider">{user.role?.replace("_", " ")}</p>
            </div>
          </div>
          <Button variant="ghost" size="sm" onClick={handleLogout} className="w-full text-gray-500 hover:text-white justify-start h-7 text-[10px] font-mono tracking-wider" data-testid="logout-button">
            <LogOut className="w-3 h-3 mr-2" />SIGN OUT
          </Button>
        </div>
      )}

      <div className="p-4 border-t border-white/[0.06]">
        <div className="flex items-center gap-2">
          <div className="w-1.5 h-1.5 bg-[#00FF88] animate-pulse" />
          <span className="text-[9px] font-mono text-gray-600 tracking-wider">SYSTEM ONLINE</span>
        </div>
      </div>
    </div>
  );
};

// ── History Page ──────────────────────────────────────────
const HistoryPage = () => {
  const [incidents, setIncidents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState({ status: null, type: null });

  useEffect(() => {
    const fetch_ = async () => {
      try {
        let url = `${API}/incidents?limit=100`;
        if (filter.status) url += `&status=${filter.status}`;
        if (filter.type) url += `&incident_type=${filter.type}`;
        setIncidents((await axios.get(url)).data);
      } catch { toast.error("Failed to load"); }
      finally { setLoading(false); }
    };
    fetch_();
  }, [filter]);

  return (
    <div className="flex-1 min-w-0 p-6 space-y-6 bg-[#050505]" data-testid="incident-history-page">
      <div className="flex items-center justify-between">
        <div><h1 className="text-3xl font-heading font-black text-white tracking-tight">INCIDENT HISTORY</h1><p className="text-sm font-body text-gray-400 mt-1">Historical audit trail - OCTON learning database</p></div>
        <div className="flex gap-2">
          <Select value={filter.status || "all"} onValueChange={v => setFilter({...filter, status: v==="all"?null:v})}>
            <SelectTrigger className="w-40 bg-[#121212] border-white/10 text-white rounded-none"><SelectValue placeholder="Status" /></SelectTrigger>
            <SelectContent className="bg-[#121212] border-white/10">
              <SelectItem value="all" className="text-white">All Status</SelectItem>
              {Object.keys(decisionStatusConfig).map(k => <SelectItem key={k} value={k} className="text-white">{decisionStatusConfig[k].label}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={filter.type || "all"} onValueChange={v => setFilter({...filter, type: v==="all"?null:v})}>
            <SelectTrigger className="w-40 bg-[#121212] border-white/10 text-white rounded-none"><SelectValue placeholder="Type" /></SelectTrigger>
            <SelectContent className="bg-[#121212] border-white/10">
              <SelectItem value="all" className="text-white">All Types</SelectItem>
              {Object.keys(incidentTypeConfig).map(k => <SelectItem key={k} value={k} className="text-white">{incidentTypeConfig[k].label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>
      {loading ? <div className="flex items-center justify-center h-64"><div className="text-sm font-mono text-[#00E5FF] animate-pulse">LOADING HISTORY...</div></div> : (
        <div className="grid gap-4">
          {incidents.map(inc => {
            const a = inc.ai_analysis;
            return (
              <Card key={inc.id} className="bg-[#121212] border-white/10 rounded-none hover:border-white/30 transition-colors">
                <CardContent className="p-4">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-2"><IncidentBadge type={inc.incident_type} /><DecisionBadge status={inc.decision_status} />{inc.timestamp_in_match && <span className="text-xs font-mono text-gray-400">@ {inc.timestamp_in_match}</span>}</div>
                      <p className="text-sm font-body text-white mb-2">{inc.description}</p>
                      <div className="flex items-center gap-4 text-xs text-gray-400">{inc.team_involved && <span>Team: {inc.team_involved}</span>}{inc.player_involved && <span>Player: {inc.player_involved}</span>}</div>
                      {inc.final_decision && <div className="mt-2 p-2 bg-white/5 rounded-none"><span className="text-xs font-mono text-gray-400">FINAL: </span><span className="text-sm text-white">{inc.final_decision}</span></div>}
                    </div>
                    {a && <div className="ml-4 text-right"><ConfidenceScore score={a.final_confidence || a.confidence_score || 0} size="small" /></div>}
                  </div>
                </CardContent>
              </Card>
            );
          })}
          {incidents.length === 0 && <div className="text-center py-12"><History className="w-12 h-12 text-gray-600 mx-auto mb-2" /><p className="text-gray-400">No incidents found</p></div>}
        </div>
      )}
    </div>
  );
};

// ── Settings Page ─────────────────────────────────────────
const SettingsPage = () => {
  const { user } = useAuth();
  const [seeding, setSeeding] = useState(false);
  const [config, setConfig] = useState(null);
  const [thresholdInput, setThresholdInput] = useState("15");
  const [savingThreshold, setSavingThreshold] = useState(false);
  const [savingProfile, setSavingProfile] = useState(false);

  const seedDemo = async () => {
    setSeeding(true);
    try { await axios.post(`${API}/seed-demo`); toast.success("OCTON demo data seeded!"); } catch { toast.error("Failed to seed"); }
    finally { setSeeding(false); }
  };

  const loadConfig = useCallback(async () => {
    try {
      const { data } = await axios.get(`${API}/system/config`);
      setConfig(data);
      setThresholdInput(String(data.ofr_threshold_pct ?? 15));
    } catch { /* */ }
  }, []);

  useEffect(() => {
    if (user?.role !== "admin") return;
    loadConfig();
  }, [user?.role, loadConfig]);

  const saveThreshold = async () => {
    const v = parseFloat(thresholdInput);
    if (isNaN(v) || v < 5 || v > 40) {
      toast.error("Threshold must be between 5 and 40");
      return;
    }
    setSavingThreshold(true);
    try {
      const { data } = await axios.put(`${API}/system/config`, { ofr_threshold_pct: v });
      setConfig(data);
      toast.success(`OFR threshold set to ${v}%`);
    } catch (e) {
      toast.error("Failed to update threshold");
    } finally { setSavingThreshold(false); }
  };

  const pickProfile = async (pid) => {
    setSavingProfile(true);
    try {
      const { data } = await axios.put(`${API}/system/config`, { competition_profile: pid });
      setConfig(data);
      setThresholdInput(String(data.ofr_threshold_pct ?? 15));
      toast.success(`Competition profile: ${data.competition_profile_details?.label}`);
    } catch { toast.error("Failed to update profile"); }
    finally { setSavingProfile(false); }
  };

  return (
    <div className="flex-1 min-w-0 p-6 space-y-6 bg-[#050505]" data-testid="settings-page">
      <div><h1 className="text-3xl font-heading font-black text-white tracking-tight">SETTINGS</h1><p className="text-sm font-body text-gray-400 mt-1">OCTON VAR system configuration</p></div>

      <Tabs defaultValue="general" className="w-full">
        <TabsList className="bg-[#121212] border border-white/10 rounded-none p-1">
          <TabsTrigger value="general" data-testid="settings-tab-general" className="data-[state=active]:bg-white data-[state=active]:text-black rounded-none">General</TabsTrigger>
          <TabsTrigger value="architecture" data-testid="settings-tab-architecture" className="data-[state=active]:bg-white data-[state=active]:text-black rounded-none">Architecture</TabsTrigger>
          {user?.role === "admin" && <TabsTrigger value="admin" data-testid="settings-tab-admin" className="data-[state=active]:bg-white data-[state=active]:text-black rounded-none">Admin Tools</TabsTrigger>}
        </TabsList>

        <TabsContent value="general" className="mt-6 space-y-6">
          <Card className="bg-[#121212] border-white/10 rounded-none">
            <CardHeader><CardTitle className="text-white">System Information</CardTitle><CardDescription className="text-gray-400">OCTON VAR - Dr Finnegan's Forensic AI</CardDescription></CardHeader>
            <CardContent className="space-y-4">
              {[
                ["System", "OCTON VAR v1.0"],
                ["Architect", "Dr Finnegan"],
                ["AI Model", "GPT-5.2 (Neo Cortex)", "#00E5FF"],
                ["Pattern Engine", "Hippocampus v1.0", "#00FF66"],
                ["Architecture", "Hippocampus -> Neo Cortex Pathway"],
                ["Status", "ONLINE", "#00FF66"],
              ].map(([k, v, c]) => (
                <div key={k} className="flex items-center justify-between py-2 border-b border-white/10">
                  <span className="text-sm text-gray-400">{k}</span>
                  <span className="text-sm font-mono" style={{ color: c || '#fff' }}>{v}</span>
                </div>
              ))}
              {user && <div className="flex items-center justify-between py-2"><span className="text-sm text-gray-400">Logged In As</span><span className="text-sm font-mono text-white">{user.name} ({user.role})</span></div>}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="architecture" className="mt-6 space-y-6">
          <Card className="bg-[#121212] border-white/10 rounded-none">
            <CardHeader><CardTitle className="text-white">Neural Pathway Architecture</CardTitle><CardDescription className="text-gray-400">Dr Finnegan's dual-brain decision system</CardDescription></CardHeader>
            <CardContent className="space-y-6">
              <div className="p-4 bg-[#050505] rounded-none border border-[#00FF66]/20">
                <div className="flex items-center gap-2 mb-3"><Zap className="w-5 h-5 text-[#00FF66]" /><h3 className="text-lg font-heading font-bold text-[#00FF66]">HIPPOCAMPUS</h3></div>
                <p className="text-sm text-gray-300 mb-2">Lightning speed pattern matching engine. Conducts initial analysis in under 100ms by comparing incident characteristics against a comprehensive pattern database of known football decisions.</p>
                <div className="flex gap-4 text-xs font-mono text-gray-400"><span>Speed: &lt;100ms</span><span>Pattern DB: 7 categories</span><span>Keyword matching + historical boost</span></div>
              </div>
              <div className="flex items-center justify-center"><ArrowRight className="w-6 h-6 text-[#00E5FF]" /><span className="text-xs font-mono text-gray-500 mx-2">NEURAL SIGNAL PATHWAY</span><ArrowRight className="w-6 h-6 text-[#00E5FF]" /></div>
              <div className="p-4 bg-[#050505] rounded-none border border-[#00E5FF]/20">
                <div className="flex items-center gap-2 mb-3"><Brain className="w-5 h-5 text-[#00E5FF]" /><h3 className="text-lg font-heading font-bold text-[#00E5FF]">NEO CORTEX</h3></div>
                <p className="text-sm text-gray-300 mb-2">Deep cognitive analysis powered by GPT-5.2. Receives Hippocampus findings and performs the heavy lifting - nuanced reasoning, historical context integration, image analysis, and comprehensive decision recommendation.</p>
                <div className="flex gap-4 text-xs font-mono text-gray-400"><span>Model: GPT-5.2</span><span>Image analysis capable</span><span>Historical learning</span></div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="admin" className="mt-6 space-y-6">
          <Card className="bg-[#121212] border-[#B366FF]/30 rounded-none" data-testid="competition-profile-card">
            <CardHeader>
              <CardTitle className="text-white flex items-center gap-2">
                <Trophy className="w-4 h-4 text-[#B366FF]" />
                Competition Profile
              </CardTitle>
              <CardDescription className="text-gray-400">
                Pre-tuned settings per competition tier. Picking a profile applies
                its OFR threshold and sets the engine's strictness bias.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-4 gap-2">
                {(config?.available_profiles || []).map((p) => {
                  const active = config?.competition_profile === p.id;
                  return (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => pickProfile(p.id)}
                      disabled={savingProfile}
                      className={`text-left border p-3 transition-all ${active ? "border-[#B366FF] bg-[#B366FF]/10" : "border-white/10 hover:border-[#B366FF]/50 hover:bg-white/[0.03]"}`}
                      data-testid={`competition-profile-${p.id}`}
                    >
                      <div className="flex items-center gap-2 mb-1">
                        <span className={`w-1.5 h-1.5 rounded-full ${active ? "bg-[#B366FF] animate-pulse" : "bg-gray-600"}`} />
                        <span className={`font-heading font-bold text-sm ${active ? "text-[#B366FF]" : "text-white"}`}>{p.label}</span>
                      </div>
                      <p className="text-[10px] font-mono text-gray-500 mb-2">
                        OFR {p.ofr_threshold_pct}% · {p.strictness}
                      </p>
                      <p className="text-[10px] text-gray-400 leading-snug">{p.description}</p>
                    </button>
                  );
                })}
              </div>
              {config?.competition_profile_details && (
                <p className="text-[10px] font-mono text-gray-500 mt-3">
                  Active: <span className="text-[#B366FF]">{config.competition_profile_details.label}</span>
                  {" · "}OFR {config.competition_profile_details.ofr_threshold_pct}% ·
                  strictness {config.competition_profile_details.strictness}
                </p>
              )}
            </CardContent>
          </Card>

          <Card className="bg-[#121212] border-[#FFB800]/20 rounded-none" data-testid="ofr-threshold-card">
            <CardHeader>
              <CardTitle className="text-white flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-[#FFB800]" />
                OFR Disagreement Threshold
              </CardTitle>
              <CardDescription className="text-gray-400">
                When the inter-angle confidence delta crosses this percentage, OCTON
                flags <span className="text-[#FFB800]">angle_disagreement</span> and the
                dashboard fires an On-Field Review escalation toast. Lower it for
                tournaments / international finals (stricter), raise it for league play.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex items-end gap-4">
                <div className="flex-1">
                  <Label className="text-xs font-mono text-gray-400 uppercase tracking-[0.2em]">Current threshold</Label>
                  <div className="flex items-center gap-2 mt-1">
                    <Input
                      type="number" min="5" max="40" step="0.5"
                      value={thresholdInput}
                      onChange={(e) => setThresholdInput(e.target.value)}
                      className="bg-[#050505] border-white/10 text-white rounded-none w-32 font-mono"
                      data-testid="ofr-threshold-input"
                    />
                    <span className="text-2xl font-mono text-[#FFB800]">%</span>
                  </div>
                  <p className="text-[10px] font-mono text-gray-500 mt-2">
                    Range 5–40%. {config?.updated_at && (
                      <>Last updated by <span className="text-[#FFB800]">{config.updated_by || "—"}</span> at {new Date(config.updated_at).toLocaleString()}</>
                    )}
                  </p>
                </div>
                <Button
                  onClick={saveThreshold} disabled={savingThreshold}
                  className="bg-[#FFB800] text-black hover:bg-[#FFB800]/80 rounded-none"
                  data-testid="ofr-threshold-save"
                >
                  {savingThreshold ? "SAVING..." : "SAVE"}
                </Button>
              </div>
            </CardContent>
          </Card>

          <AuditChainPill />
          <LiveIngestPanel />

          <Card className="bg-[#121212] border-white/10 rounded-none">
            <CardHeader><CardTitle className="text-white">Admin Tools</CardTitle><CardDescription className="text-gray-400">Administrative functions for league officials</CardDescription></CardHeader>
            <CardContent className="space-y-4">
              <div className="p-4 bg-[#050505] rounded-none border border-white/10">
                <h3 className="text-sm font-medium text-white mb-2">Seed Demo Data</h3>
                <p className="text-xs text-gray-400 mb-4">Populate OCTON with sample incidents, referees, and matches.</p>
                <Button onClick={seedDemo} disabled={seeding} className="bg-[#00E5FF] text-black hover:bg-[#00E5FF]/80 rounded-none" data-testid="seed-demo-button">{seeding ? "SEEDING..." : "SEED DATA"}</Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
};

// ── AI Feedback Page ──────────────────────────────────────
const FeedbackPage = () => {
  const [stats, setStats] = useState(null);
  const [feedbackList, setFeedbackList] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetch_ = async () => {
      try {
        const [s, f] = await Promise.all([axios.get(`${API}/feedback/stats`), axios.get(`${API}/feedback?limit=50`)]);
        setStats(s.data); setFeedbackList(f.data);
      } catch { toast.error("Failed to load feedback"); }
      finally { setLoading(false); }
    };
    fetch_();
  }, []);

  if (loading) return <div className="flex-1 flex items-center justify-center bg-[#050505]"><div className="text-sm font-mono text-[#00E5FF] animate-pulse">LOADING FEEDBACK...</div></div>;

  const typeData = stats?.by_incident_type ? Object.entries(stats.by_incident_type).map(([name, data]) => ({ name, accuracy: data.accuracy, total: data.total, correct: data.correct })) : [];

  return (
    <div className="flex-1 min-w-0 p-6 space-y-6 bg-[#050505]" data-testid="feedback-page">
      <div><h1 className="text-3xl font-heading font-black text-white tracking-tight">AI FEEDBACK LOOP</h1><p className="text-sm font-body text-gray-400 mt-1">OCTON learning from operator corrections - Dr Finnegan's self-improving AI</p></div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="bg-[#121212] border-white/10 rounded-none"><CardContent className="p-4"><p className="text-xs font-mono uppercase tracking-[0.2em] text-gray-400">TOTAL FEEDBACK</p><p className="text-3xl font-mono font-medium text-white mt-1">{stats?.total_feedback || 0}</p></CardContent></Card>
        <Card className="bg-[#121212] border-white/10 rounded-none"><CardContent className="p-4"><p className="text-xs font-mono uppercase tracking-[0.2em] text-gray-400">AI ACCURACY</p><p className="text-3xl font-mono font-medium text-[#00FF66] mt-1">{stats?.overall_accuracy || 0}%</p></CardContent></Card>
        <Card className="bg-[#121212] border-white/10 rounded-none"><CardContent className="p-4"><p className="text-xs font-mono uppercase tracking-[0.2em] text-gray-400">CORRECT</p><p className="text-3xl font-mono font-medium text-[#00E5FF] mt-1">{stats?.correct || 0}</p></CardContent></Card>
        <Card className="bg-[#121212] border-white/10 rounded-none"><CardContent className="p-4"><p className="text-xs font-mono uppercase tracking-[0.2em] text-gray-400">CORRECTIONS</p><p className="text-3xl font-mono font-medium text-[#FF3333] mt-1">{stats?.incorrect || 0}</p></CardContent></Card>
      </div>

      {stats?.confidence_calibration && (
        <Card className="bg-[#121212] border-white/10 rounded-none">
          <CardHeader><CardTitle className="text-sm font-mono uppercase text-gray-400">CONFIDENCE CALIBRATION</CardTitle></CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-6">
              {stats.confidence_calibration.correct && (
                <div className="p-4 bg-[#050505] rounded-none border border-[#00FF66]/20">
                  <p className="text-xs font-mono text-[#00FF66] mb-1">WHEN AI WAS CORRECT</p>
                  <p className="text-2xl font-mono text-white">{stats.confidence_calibration.correct.avg_confidence}%</p>
                  <p className="text-xs text-gray-400">avg confidence ({stats.confidence_calibration.correct.count} cases)</p>
                </div>
              )}
              {stats.confidence_calibration.incorrect && (
                <div className="p-4 bg-[#050505] rounded-none border border-[#FF3333]/20">
                  <p className="text-xs font-mono text-[#FF3333] mb-1">WHEN AI WAS WRONG</p>
                  <p className="text-2xl font-mono text-white">{stats.confidence_calibration.incorrect.avg_confidence}%</p>
                  <p className="text-xs text-gray-400">avg confidence ({stats.confidence_calibration.incorrect.count} cases)</p>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {typeData.length > 0 && (
        <Card className="bg-[#121212] border-white/10 rounded-none">
          <CardHeader><CardTitle className="text-sm font-mono uppercase text-gray-400">ACCURACY BY INCIDENT TYPE</CardTitle></CardHeader>
          <CardContent><div className="h-[300px] min-h-[300px]">
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={typeData}><CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" /><XAxis dataKey="name" stroke="#666" fontSize={12} /><YAxis stroke="#666" fontSize={12} domain={[0, 100]} /><Tooltip contentStyle={{ backgroundColor: '#121212', border: '1px solid rgba(255,255,255,0.1)' }} labelStyle={{ color: '#fff' }} /><Bar dataKey="accuracy" fill="#00E5FF" radius={[2,2,0,0]} /></BarChart>
            </ResponsiveContainer>
          </div></CardContent>
        </Card>
      )}

      <Card className="bg-[#121212] border-white/10 rounded-none">
        <CardHeader><CardTitle className="text-sm font-mono uppercase text-gray-400">RECENT OPERATOR FEEDBACK</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          {feedbackList.map(fb => (
            <div key={fb.id} className="flex items-center justify-between p-3 bg-[#050505] rounded-none border border-white/5">
              <div className="flex items-center gap-3">
                {fb.was_ai_correct ? <ThumbsUp className="w-4 h-4 text-[#00FF66]" /> : <ThumbsDown className="w-4 h-4 text-[#FF3333]" />}
                <div>
                  <span className={`text-xs font-mono uppercase px-2 py-0.5 rounded-full border ${incidentTypeConfig[fb.incident_type]?.color || 'text-white border-white/30'}`}>{fb.incident_type}</span>
                  <p className="text-xs text-gray-400 mt-1">AI: {fb.ai_suggestion?.substring(0, 50)}</p>
                  {!fb.was_ai_correct && fb.operator_decision && <p className="text-xs text-[#FFB800] mt-0.5">Operator: {fb.operator_decision?.substring(0, 50)}</p>}
                </div>
              </div>
              <div className="text-right">
                <p className="text-sm font-mono" style={{ color: fb.was_ai_correct ? '#00FF66' : '#FF3333' }}>{fb.ai_confidence?.toFixed(1)}%</p>
                <p className="text-[10px] text-gray-500">{fb.submitted_by_name}</p>
              </div>
            </div>
          ))}
          {feedbackList.length === 0 && <p className="text-sm text-gray-400 text-center py-4">No feedback yet. Decisions will generate feedback automatically.</p>}
        </CardContent>
      </Card>
    </div>
  );
};

// ── Protected Route ───────────────────────────────────────
const ProtectedRoute = ({ children, roles }) => {
  const { user, loading } = useAuth();
  if (loading) return <div className="min-h-screen bg-[#050505] flex items-center justify-center"><div className="text-sm font-mono text-[#00E5FF] animate-pulse">AUTHENTICATING...</div></div>;
  if (user === false) return <Navigate to="/login" replace />;
  if (roles && !roles.includes(user?.role)) {
    return (
      <div className="flex-1 flex items-center justify-center bg-[#050505]" data-testid="access-denied">
        <div className="text-center space-y-3">
          <Lock className="w-12 h-12 text-[#FF3333] mx-auto" />
          <h2 className="text-xl font-heading font-bold text-white">ACCESS DENIED</h2>
          <p className="text-sm text-gray-400">Your role ({user?.role?.replace("_"," ")}) does not have permission.</p>
          <Button onClick={() => window.history.back()} className="bg-white text-black hover:bg-gray-200 rounded-none">Go Back</Button>
        </div>
      </div>
    );
  }
  return children;
};

// ── Main App ──────────────────────────────────────────────
function App() {
  return (
    <div className="App min-h-screen bg-[#050505]">
      <BrowserRouter>
        <AuthProvider>
          <SelectedIncidentProvider>
            <Routes>
              <Route path="/login" element={<LoginPage />} />
              <Route path="/register" element={<RegisterPage />} />
              <Route path="/ofr/:incidentId" element={<ProtectedRoute><MobileOFRPage /></ProtectedRoute>} />
              <Route path="/*" element={
                <ProtectedRoute>
                  <div className="flex">
                    <Sidebar />
                    <Routes>
                      <Route path="/" element={<LiveVARPage />} />
                      <Route path="/match-wall" element={<LiveMatchWallPage />} />
                      <Route path="/history" element={<HistoryPage />} />
                      <Route path="/matches" element={<ProtectedRoute roles={["admin"]}><MatchesPage /></ProtectedRoute>} />
                      <Route path="/training" element={<ProtectedRoute roles={["admin"]}><TrainingLibraryPage /></ProtectedRoute>} />
                      <Route path="/analytics" element={<AnalyticsPage />} />
                      <Route path="/referees" element={<RefereesIndexPage />} />
                      <Route path="/referees/:refereeId" element={<RefereeScorecardPage />} />
                      <Route path="/feedback" element={<ProtectedRoute roles={["admin", "var_operator"]}><FeedbackPage /></ProtectedRoute>} />
                      <Route path="/booths" element={<ProtectedRoute roles={["admin"]}><BoothActivityPage /></ProtectedRoute>} />
                      <Route path="/settings" element={<SettingsPage />} />
                    </Routes>
                    <MountedVoiceWidget />
                  </div>
                </ProtectedRoute>
              } />
            </Routes>
          </SelectedIncidentProvider>
        </AuthProvider>
      </BrowserRouter>
      <Toaster position="top-right" toastOptions={{ style: { background: '#121212', color: '#fff', border: '1px solid rgba(255,255,255,0.1)' } }} />
    </div>
  );
}

export default App;
