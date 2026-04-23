import { useState, useEffect, useCallback, createContext, useContext, useRef } from "react";
import "@/App.css";
import { BrowserRouter, Routes, Route, NavLink, useNavigate, useLocation, Navigate } from "react-router-dom";
import axios from "axios";
import { Toaster, toast } from "sonner";
import {
  Video, History, BarChart3, Settings, AlertTriangle, CheckCircle2,
  XCircle, Clock, RefreshCw, Upload, Play, Brain, Users, Shield,
  Target, Eye, LogOut, LogIn, UserPlus, Zap, Activity, Image,
  ArrowRight, Radio, Wifi, WifiOff, Trophy, Calendar, ThumbsUp, ThumbsDown, Lock,
  Pause, SkipBack, SkipForward, ChevronLeft, ChevronRight, Maximize2, Volume2,
  Pen, Circle, Minus, Undo2, Trash2, Save, Crosshair, Download, Users2, Layers, Columns,
  FileText, Sparkles, BookOpen, GitBranch
} from "lucide-react";
import { Button } from "./components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "./components/ui/card";
import { Input } from "./components/ui/input";
import { Textarea } from "./components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "./components/ui/tabs";
import { Progress } from "./components/ui/progress";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogDescription } from "./components/ui/dialog";
import { Label } from "./components/ui/label";
import { ScrollArea } from "./components/ui/scroll-area";
import { Separator } from "./components/ui/separator";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar, PieChart, Pie, Cell } from "recharts";
import TrainingLibraryPage from "./TrainingLibraryPage";
import { exportAnalysisPDF } from "./utils/pdfExport";
import { OctonBrainLogo } from "./components/OctonBrainLogo";
import { ConfidenceScore, CopyButton, CurtainSection } from "./components/OctonAnalysisParts";
import OctonVoiceWidget from "./components/OctonVoiceWidget";

// Global lightweight state: currently selected incident ID (picked in LiveVAR)
// so the voice widget can reference it anywhere.
const SelectedIncidentContext = createContext({ id: null, setId: () => {} });
const useSelectedIncidentId = () => useContext(SelectedIncidentContext);

function SelectedIncidentProvider({ children }) {
  const [id, setId] = useState(null);
  return (
    <SelectedIncidentContext.Provider value={{ id, setId }}>
      {children}
    </SelectedIncidentContext.Provider>
  );
}

function MountedVoiceWidget() {
  const { id } = useSelectedIncidentId();
  return <OctonVoiceWidget selectedIncidentId={id} />;
}

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

// Configure axios for cookies
axios.defaults.withCredentials = true;

// ── Auth Context ──────────────────────────────────────────
const AuthContext = createContext(null);

function formatApiError(detail) {
  if (detail == null) return "Something went wrong.";
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail)) return detail.map(e => e?.msg || JSON.stringify(e)).join(" ");
  if (detail?.msg) return detail.msg;
  return String(detail);
}

const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  const checkAuth = useCallback(async () => {
    try {
      const res = await axios.get(`${API}/auth/me`);
      setUser(res.data);
    } catch {
      setUser(false);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { checkAuth(); }, [checkAuth]);

  const login = async (email, password) => {
    const res = await axios.post(`${API}/auth/login`, { email, password });
    setUser(res.data);
    return res.data;
  };

  const register = async (name, email, password, role) => {
    const res = await axios.post(`${API}/auth/register`, { name, email, password, role });
    setUser(res.data);
    return res.data;
  };

  const logout = async () => {
    try { await axios.post(`${API}/auth/logout`); } catch {}
    setUser(false);
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, register, logout, checkAuth }}>
      {children}
    </AuthContext.Provider>
  );
};

const useAuth = () => useContext(AuthContext);

// OctonBrainLogo extracted to /components/OctonBrainLogo.jsx

// ── Config Maps ───────────────────────────────────────────
const incidentTypeConfig = {
  offside: { label: "OFFSIDE", color: "bg-[#FFB800]/20 text-[#FFB800] border-[#FFB800]/30" },
  handball: { label: "HANDBALL", color: "bg-[#FF3333]/20 text-[#FF3333] border-[#FF3333]/30" },
  foul: { label: "FOUL", color: "bg-[#00E5FF]/20 text-[#00E5FF] border-[#00E5FF]/30" },
  penalty: { label: "PENALTY", color: "bg-[#FF3333]/20 text-[#FF3333] border-[#FF3333]/30" },
  goal_line: { label: "GOAL LINE", color: "bg-[#00FF66]/20 text-[#00FF66] border-[#00FF66]/30" },
  red_card: { label: "RED CARD", color: "bg-[#FF3333]/20 text-[#FF3333] border-[#FF3333]/30" },
  other: { label: "OTHER", color: "bg-white/20 text-white border-white/30" },
};

const decisionStatusConfig = {
  pending: { label: "PENDING", color: "bg-[#FFB800]/20 text-[#FFB800] border-[#FFB800]/30", icon: Clock },
  confirmed: { label: "CONFIRMED", color: "bg-[#00FF66]/20 text-[#00FF66] border-[#00FF66]/30", icon: CheckCircle2 },
  overturned: { label: "OVERTURNED", color: "bg-[#FF3333]/20 text-[#FF3333] border-[#FF3333]/30", icon: XCircle },
  no_decision: { label: "NO DECISION", color: "bg-white/20 text-white border-white/30", icon: AlertTriangle },
};

const riskColors = { low: "#00FF66", medium: "#FFB800", high: "#FF3333", critical: "#FF3333" };

// ── WebSocket Hook ────────────────────────────────────────
function useWebSocket(onMessage) {
  const [connected, setConnected] = useState(false);
  const wsRef = useRef(null);

  useEffect(() => {
    const wsUrl = BACKEND_URL.replace("https://", "wss://").replace("http://", "ws://") + "/api/ws";
    let ws;
    const connect = () => {
      ws = new WebSocket(wsUrl);
      ws.onopen = () => setConnected(true);
      ws.onclose = () => { setConnected(false); setTimeout(connect, 3000); };
      ws.onmessage = (e) => {
        try { const data = JSON.parse(e.data); if (onMessage) onMessage(data); } catch {}
      };
      wsRef.current = ws;
    };
    connect();
    return () => { if (ws) ws.close(); };
  }, [onMessage]);

  return connected;
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
          <div className="flex items-center justify-center">
            <OctonBrainLogo size={48} />
          </div>
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
          <div className="flex items-center justify-center">
            <OctonBrainLogo size={48} />
          </div>
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
    { path: "/history", icon: History, label: "Incident History", roles: null, section: "var" },
    { path: "/matches", icon: Trophy, label: "Matches", roles: ["admin"], section: "var" },
    { path: "/training", icon: BookOpen, label: "Training Library", roles: ["admin"], section: "var" },
    { path: "/analytics", icon: BarChart3, label: "VAR Analytics", roles: null, section: "system" },
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
        {/* Ambient neural glow */}
        <div className="absolute -top-8 -left-6 w-24 h-24 bg-[#00E5FF]/10 blur-2xl pointer-events-none" />
        {/* Top cyan accent line */}
        <div className="absolute top-0 left-0 w-full h-[1px] bg-gradient-to-r from-[#00E5FF]/60 via-[#00E5FF]/20 to-transparent" />
        <div className="flex items-center gap-3 relative">
          <div className="relative">
            <div className="absolute inset-0 bg-[#00E5FF]/15 rounded-full blur-md" />
            <OctonBrainLogo size={42} />
          </div>
          <div>
            <h1 className="font-heading font-black text-white text-base tracking-tighter leading-none" style={{ textShadow: "0 0 10px #00E5FF33" }}>OCTON VAR</h1>
            <p className="text-[8px] font-mono text-[#00E5FF]/70 tracking-[0.2em] mt-1">NEOCORTEX · v2.1</p>
          </div>
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

// ── Brain Pathway Visualization ───────────────────────────
const BrainPathway = ({ analysis }) => {
  if (!analysis) return null;
  const hippo = analysis.hippocampus;
  const neo = analysis.neo_cortex;
  if (!hippo || !neo) return null;

  return (
    <div className="relative border border-white/[0.08] bg-black/60 backdrop-blur-xl overflow-hidden corner-brackets" data-testid="brain-pathway-viz"
      style={{ backgroundImage: 'url(https://images.unsplash.com/photo-1737505599159-5ffc1dcbc08f?crop=entropy&cs=srgb&fm=jpg&ixid=M3w4NjA2MjJ8MHwxfHNlYXJjaHwxfHxuZXVyYWwlMjBuZXR3b3JrJTIwYWJzdHJhY3QlMjBkYXRhfGVufDB8fHx8MTc3Njg2Nzk2NHww&ixlib=rb-4.1.0&q=85)', backgroundSize: 'cover', backgroundPosition: 'center' }}>
      {/* Dark overlay */}
      <div className="absolute inset-0 bg-black/85" />
      
      <div className="relative z-10 p-5">
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Brain className="w-4 h-4 text-[#00E5FF] glow-cyan" />
            <span className="text-xs font-heading font-bold uppercase tracking-[0.2em] text-[#00E5FF]">OCTON NEURAL PATHWAY</span>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-[10px] font-mono text-gray-500">{analysis.engine_version}</span>
            {analysis.divergence_flag && (
              <span className="text-[10px] font-mono text-[#FF2A2A] animate-pulse glow-text-red flex items-center gap-1">
                <AlertTriangle className="w-3 h-3" />DIVERGENCE {analysis.pathway_divergence}pt
              </span>
            )}
          </div>
        </div>

        {/* Neural Pathway Grid */}
        <div className="grid grid-cols-[1fr_80px_1fr] gap-0 items-stretch">
          {/* Hippocampus */}
          <div className="border border-[#00FF88]/20 bg-[#00FF88]/[0.03] p-4 relative border-glow-green">
            <div className="absolute top-0 left-0 w-full h-[1px] bg-gradient-to-r from-[#00FF88]/60 via-[#00FF88]/20 to-transparent" />
            <div className="flex items-center gap-2 mb-3">
              <Zap className="w-4 h-4 text-[#00FF88] glow-green" />
              <span className="text-[11px] font-heading font-bold uppercase tracking-[0.15em] text-[#00FF88]">HIPPOCAMPUS</span>
            </div>
            <p className="text-[10px] font-mono text-gray-500 mb-2 tracking-wide">RAPID PATTERN SCAN</p>
            <div className="flex items-baseline gap-1">
              <span className="text-3xl font-mono font-bold text-[#00FF88] glow-text-green">{hippo.initial_confidence}</span>
              <span className="text-sm font-mono text-[#00FF88]/60">%</span>
            </div>
            <p className="text-[10px] font-mono text-gray-500 mt-2">{hippo.processing_time_ms}ms</p>
            <p className="text-[10px] text-gray-400 mt-1 leading-relaxed">{hippo.initial_decision}</p>
            <div className="mt-2 flex flex-wrap gap-1">
              {hippo.matched_keywords?.slice(0, 3).map((kw, i) => (
                <span key={i} className="text-[9px] font-mono px-1.5 py-0.5 bg-[#00FF88]/10 text-[#00FF88]/70 border border-[#00FF88]/10">{kw}</span>
              ))}
            </div>
            <div className="text-[9px] font-mono text-gray-600 mt-2">WEIGHT: 20%</div>
          </div>

          {/* Signal Bridge */}
          <div className="flex flex-col items-center justify-center relative">
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="w-full h-[2px] bg-gradient-to-r from-[#00FF88]/40 via-[#00E5FF] to-[#00E5FF]/40 animate-neural-pulse" />
            </div>
            <div className="relative z-10 flex flex-col items-center gap-1 bg-[#050505] px-2 py-3 border border-white/[0.08]">
              <ArrowRight className="w-4 h-4 text-[#00E5FF] glow-cyan" />
              <span className="text-[7px] font-mono text-[#00E5FF]/60 tracking-[0.15em]">SIGNAL</span>
              <div className="w-1 h-6 bg-gradient-to-b from-[#00FF88] to-[#00E5FF] opacity-50 animate-data-flow" />
              <ArrowRight className="w-4 h-4 text-[#00E5FF] glow-cyan" />
            </div>
          </div>

          {/* Neo Cortex */}
          <div className="border border-[#00E5FF]/20 bg-[#00E5FF]/[0.03] p-4 relative border-glow-cyan">
            <div className="absolute top-0 left-0 w-full h-[1px] bg-gradient-to-r from-[#00E5FF]/60 via-[#00E5FF]/20 to-transparent" />
            <div className="flex items-center gap-2 mb-3">
              <Brain className="w-4 h-4 text-[#00E5FF] glow-cyan" />
              <span className="text-[11px] font-heading font-bold uppercase tracking-[0.15em] text-[#00E5FF]">NEO CORTEX</span>
            </div>
            <p className="text-[10px] font-mono text-gray-500 mb-2 tracking-wide">DEEP COGNITIVE ANALYSIS</p>
            <div className="flex items-baseline gap-1">
              <span className="text-3xl font-mono font-bold text-[#00E5FF] glow-text-cyan">{neo.confidence_score}</span>
              <span className="text-sm font-mono text-[#00E5FF]/60">%</span>
            </div>
            <p className="text-[10px] font-mono text-gray-500 mt-2">{neo.processing_time_ms}ms</p>
            <p className="text-[10px] text-gray-400 mt-1 leading-relaxed">{neo.suggested_decision}</p>
            <div className="mt-2">
              <span className="text-[9px] font-mono px-1.5 py-0.5 border" style={{ color: riskColors[neo.risk_level] || "#FFB800", borderColor: (riskColors[neo.risk_level] || "#FFB800") + "30" }}>
                RISK: {(neo.risk_level || "medium").toUpperCase()}
              </span>
            </div>
            <div className="text-[9px] font-mono text-gray-600 mt-2">WEIGHT: 80%</div>
          </div>
        </div>

        {/* Footer Stats */}
        <div className="flex items-center justify-between mt-3 pt-3 border-t border-white/[0.06]">
          <div className="flex items-center gap-4 text-[10px] font-mono text-gray-500">
            <span>TOTAL: <span className="text-white">{analysis.total_processing_time_ms}ms</span></span>
            <span>PRECEDENTS: <span className="text-white">{analysis.similar_historical_cases}</span></span>
            <span>ACCURACY: <span className="text-[#00FF88]">{analysis.historical_accuracy?.toFixed(0)}%</span></span>
          </div>
          <div className="text-[10px] font-mono">
            <span className="text-gray-500">FINAL: </span>
            <span className="text-white font-bold glow-text-cyan">{analysis.final_confidence}%</span>
          </div>
        </div>
      </div>
    </div>
  );
};

// ── Reusable Components ───────────────────────────────────
// ── Decision Ticker (marquee of latest AI verdicts) ────────
const DecisionTicker = ({ incidents, onSelect }) => {
  // Keep up to 18 most recent incidents for the ticker track
  const items = (incidents || []).slice(0, 18);
  if (items.length === 0) return null;

  const tierColor = (s) => s >= 90 ? "#00FF88" : s >= 70 ? "#00E5FF" : s >= 50 ? "#FFB800" : "#FF2A2A";
  const statusColor = (status) =>
    status === "confirmed" ? "#00FF88" :
    status === "overturned" ? "#FF2A2A" :
    status === "no_decision" ? "#FFFFFF" : "#FFB800";

  const buildItem = (inc, idx, keyPrefix) => {
    const conf = Math.round(inc.ai_analysis?.final_confidence ?? inc.ai_analysis?.confidence_score ?? 0);
    const decision = inc.final_decision || inc.ai_analysis?.suggested_decision || "Awaiting neocortex analysis";
    const typeCfg = incidentTypeConfig[inc.incident_type] || incidentTypeConfig.other;
    const stColor = statusColor(inc.decision_status);
    return (
      <button
        key={`${keyPrefix}-${inc.id}-${idx}`}
        onClick={() => onSelect?.(inc)}
        className="flex items-center gap-3 px-4 h-full text-left focus:outline-none group"
        data-testid={keyPrefix === "a" ? `ticker-item-${idx}` : undefined}
      >
        {/* Status dot */}
        <span className="w-2 h-2 flex-none rounded-full" style={{ backgroundColor: stColor, boxShadow: `0 0 6px ${stColor}` }} />
        {/* Type */}
        <span className={`text-[9px] font-mono uppercase tracking-[0.2em] px-1.5 py-0.5 border ${typeCfg.color} flex-none`}>
          {typeCfg.label}
        </span>
        {/* Time */}
        {inc.timestamp_in_match && (
          <span className="text-[9px] font-mono text-gray-500 flex-none">
            <Clock className="inline w-2.5 h-2.5 mr-0.5 -mt-0.5" />{inc.timestamp_in_match}
          </span>
        )}
        {/* Team */}
        {inc.team_involved && (
          <span className="text-[9px] font-mono text-gray-500 uppercase tracking-wider flex-none">
            {inc.team_involved.substring(0, 18)}
          </span>
        )}
        {/* Arrow */}
        <ArrowRight className="w-3 h-3 text-[#00E5FF]/50 flex-none" />
        {/* Verdict */}
        <span className="text-[11px] font-body text-gray-200 group-hover:text-white transition-colors truncate max-w-[360px]">
          {decision}
        </span>
        {/* Confidence */}
        <span
          className="text-[10px] font-mono font-bold tracking-tight flex-none px-1.5 py-0.5 border"
          style={{ color: tierColor(conf), borderColor: `${tierColor(conf)}55`, backgroundColor: `${tierColor(conf)}12` }}
        >
          {conf.toFixed(0)}%
        </span>
        {/* Separator */}
        <span className="text-gray-700 flex-none mx-1">•</span>
      </button>
    );
  };

  return (
    <div
      className="relative flex items-stretch h-9 border border-white/[0.08] bg-gradient-to-r from-[#050505] via-[#080808] to-[#050505] overflow-hidden"
      data-testid="decision-ticker"
    >
      {/* Left label */}
      <div className="flex items-center gap-2 px-3 bg-[#00E5FF]/10 border-r border-[#00E5FF]/20 flex-none z-10">
        <div className="relative flex items-center justify-center">
          <Radio className="w-3 h-3 text-[#00E5FF]" />
          <span className="absolute w-3 h-3 rounded-full bg-[#00E5FF]/40 animate-ping" />
        </div>
        <span className="text-[9px] font-heading font-bold tracking-[0.25em] text-[#00E5FF] uppercase">LIVE VERDICTS</span>
      </div>

      {/* Scrolling track (duplicated for seamless loop) */}
      <div className="flex-1 relative overflow-hidden">
        {/* Edge fade masks */}
        <div className="absolute top-0 left-0 h-full w-8 bg-gradient-to-r from-[#050505] to-transparent z-10 pointer-events-none" />
        <div className="absolute top-0 right-0 h-full w-8 bg-gradient-to-l from-[#050505] to-transparent z-10 pointer-events-none" />
        <div className="ticker-track flex items-stretch whitespace-nowrap h-full w-max">
          <div className="flex items-stretch">
            {items.map((inc, i) => buildItem(inc, i, "a"))}
          </div>
          {/* Duplicate for seamless loop */}
          <div className="flex items-stretch" aria-hidden="true">
            {items.map((inc, i) => buildItem(inc, i, "b"))}
          </div>
        </div>
      </div>

      {/* Right counter */}
      <div className="flex items-center gap-1.5 px-3 bg-white/[0.03] border-l border-white/[0.08] flex-none z-10">
        <span className="text-[9px] font-mono tracking-wider text-gray-500">TRACKING</span>
        <span className="text-[11px] font-mono font-bold text-[#00E5FF]" data-testid="ticker-count">{items.length}</span>
      </div>
    </div>
  );
};

// ConfidenceScore, CopyButton, CurtainSection extracted to /components/OctonAnalysisParts.jsx

const IncidentBadge = ({ type }) => {
  const c = incidentTypeConfig[type] || incidentTypeConfig.other;
  return <span className={`${c.color} border rounded-full px-2 py-0.5 text-xs font-mono uppercase`} data-testid="incident-classification-badge">{c.label}</span>;
};

const DecisionBadge = ({ status }) => {
  const c = decisionStatusConfig[status] || decisionStatusConfig.pending;
  const Icon = c.icon;
  return <span className={`${c.color} border rounded-none px-2 py-1 text-xs font-mono uppercase flex items-center gap-1`}><Icon className="w-3 h-3" />{c.label}</span>;
};

// ── Frame Annotation Tool ─────────────────────────────────
const ANNOTATION_TOOLS = { LINE: "line", CIRCLE: "circle", MARKER: "marker", NONE: "none" };
const ANNOTATION_COLORS = ["#00E5FF", "#00FF88", "#FF2A2A", "#FFB800", "#FFFFFF"];

// ── Tactical Formation Presets ────────────────────────────
const FORMATIONS = {
  "4-4-2": { label: "4-4-2", positions: [
    { x: 50, y: 92 }, // GK
    { x: 15, y: 72 }, { x: 37, y: 75 }, { x: 63, y: 75 }, { x: 85, y: 72 }, // DEF
    { x: 15, y: 50 }, { x: 37, y: 52 }, { x: 63, y: 52 }, { x: 85, y: 50 }, // MID
    { x: 35, y: 28 }, { x: 65, y: 28 }, // FWD
  ]},
  "4-3-3": { label: "4-3-3", positions: [
    { x: 50, y: 92 },
    { x: 15, y: 72 }, { x: 37, y: 75 }, { x: 63, y: 75 }, { x: 85, y: 72 },
    { x: 30, y: 50 }, { x: 50, y: 48 }, { x: 70, y: 50 },
    { x: 20, y: 25 }, { x: 50, y: 22 }, { x: 80, y: 25 },
  ]},
  "3-5-2": { label: "3-5-2", positions: [
    { x: 50, y: 92 },
    { x: 25, y: 75 }, { x: 50, y: 77 }, { x: 75, y: 75 },
    { x: 10, y: 50 }, { x: 30, y: 48 }, { x: 50, y: 45 }, { x: 70, y: 48 }, { x: 90, y: 50 },
    { x: 35, y: 25 }, { x: 65, y: 25 },
  ]},
  "4-2-3-1": { label: "4-2-3-1", positions: [
    { x: 50, y: 92 },
    { x: 15, y: 72 }, { x: 37, y: 75 }, { x: 63, y: 75 }, { x: 85, y: 72 },
    { x: 35, y: 55 }, { x: 65, y: 55 },
    { x: 20, y: 38 }, { x: 50, y: 35 }, { x: 80, y: 38 },
    { x: 50, y: 20 },
  ]},
  "5-3-2": { label: "5-3-2", positions: [
    { x: 50, y: 92 },
    { x: 10, y: 70 }, { x: 28, y: 75 }, { x: 50, y: 77 }, { x: 72, y: 75 }, { x: 90, y: 70 },
    { x: 30, y: 50 }, { x: 50, y: 48 }, { x: 70, y: 50 },
    { x: 35, y: 25 }, { x: 65, y: 25 },
  ]},
};

const AnnotationCanvas = ({ width, height, annotations, setAnnotations, activeTool, activeColor, isDrawing, setIsDrawing, formations }) => {
  const canvasRef = useRef(null);
  const [startPos, setStartPos] = useState(null);
  const [currentPos, setCurrentPos] = useState(null);
  const [draggingPlayer, setDraggingPlayer] = useState(null);

  const getPos = (e) => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    return { x: ((e.clientX - rect.left) / rect.width) * 100, y: ((e.clientY - rect.top) / rect.height) * 100 };
  };

  const handleMouseDown = (e) => {
    if (activeTool === ANNOTATION_TOOLS.NONE && !draggingPlayer) return;
    const pos = getPos(e);
    if (!pos) return;
    if (activeTool === ANNOTATION_TOOLS.NONE) return;
    setIsDrawing(true);
    setStartPos(pos);
    setCurrentPos(pos);
    if (activeTool === ANNOTATION_TOOLS.MARKER) {
      setAnnotations(prev => [...prev, { type: "marker", x: pos.x, y: pos.y, color: activeColor, id: Date.now() }]);
      setIsDrawing(false);
    }
  };

  const handleMouseMove = (e) => {
    const pos = getPos(e);
    if (!pos) return;
    if (draggingPlayer !== null) {
      // Drag formation player
      setAnnotations(prev => prev.map(a => a.id === draggingPlayer ? { ...a, x: pos.x, y: pos.y } : a));
      return;
    }
    if (!isDrawing || !startPos) return;
    setCurrentPos(pos);
  };

  const handleMouseUp = () => {
    if (draggingPlayer !== null) { setDraggingPlayer(null); return; }
    if (!isDrawing || !startPos || !currentPos) { setIsDrawing(false); return; }
    if (activeTool === ANNOTATION_TOOLS.LINE) {
      setAnnotations(prev => [...prev, { type: "line", x1: startPos.x, y1: startPos.y, x2: currentPos.x, y2: currentPos.y, color: activeColor, id: Date.now() }]);
    } else if (activeTool === ANNOTATION_TOOLS.CIRCLE) {
      const dx = currentPos.x - startPos.x, dy = currentPos.y - startPos.y;
      const r = Math.sqrt(dx * dx + dy * dy);
      setAnnotations(prev => [...prev, { type: "circle", cx: startPos.x, cy: startPos.y, r, color: activeColor, id: Date.now() }]);
    }
    setIsDrawing(false);
    setStartPos(null);
    setCurrentPos(null);
  };

  const handlePlayerDragStart = (e, playerId) => {
    e.stopPropagation();
    setDraggingPlayer(playerId);
  };

  const isInteractive = activeTool !== ANNOTATION_TOOLS.NONE || draggingPlayer !== null || formations.length > 0;

  return (
    <svg
      ref={canvasRef}
      className="absolute inset-0 w-full h-full"
      viewBox="0 0 100 100"
      preserveAspectRatio="none"
      style={{ cursor: activeTool !== ANNOTATION_TOOLS.NONE ? 'crosshair' : draggingPlayer ? 'grabbing' : 'default', pointerEvents: isInteractive ? 'auto' : 'none', zIndex: 20 }}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={() => { if (isDrawing) handleMouseUp(); if (draggingPlayer) setDraggingPlayer(null); }}
      data-testid="annotation-canvas"
    >
      {/* Saved annotations */}
      {annotations.map(a => {
        if (a.type === "line") return <line key={a.id} x1={a.x1} y1={a.y1} x2={a.x2} y2={a.y2} stroke={a.color} strokeWidth="0.4" strokeLinecap="round" />;
        if (a.type === "circle") return <circle key={a.id} cx={a.cx} cy={a.cy} r={a.r} stroke={a.color} strokeWidth="0.4" fill="none" />;
        if (a.type === "marker") return (
          <g key={a.id}>
            <circle cx={a.x} cy={a.y} r="1.2" fill={a.color} opacity="0.8" />
            <circle cx={a.x} cy={a.y} r="2.5" stroke={a.color} strokeWidth="0.3" fill="none" opacity="0.5" />
          </g>
        );
        if (a.type === "formation_player") return (
          <g key={a.id} style={{ cursor: 'grab' }} onMouseDown={(e) => handlePlayerDragStart(e, a.id)}>
            <circle cx={a.x} cy={a.y} r="2" fill={a.color} opacity="0.9" stroke={a.color === "#00E5FF" ? "#00E5FF" : "#FF2A2A"} strokeWidth="0.3" />
            <circle cx={a.x} cy={a.y} r="3" stroke={a.color} strokeWidth="0.2" fill="none" opacity="0.3" />
            {a.label && <text x={a.x} y={a.y + 4.5} textAnchor="middle" fill={a.color} fontSize="2.2" fontFamily="monospace" opacity="0.7">{a.label}</text>}
          </g>
        );
        if (a.type === "offside_line") return (
          <g key={a.id}>
            <line x1={0} y1={a.y} x2={100} y2={a.y} stroke={a.color} strokeWidth="0.3" strokeDasharray="1.5 0.8" opacity="0.8" />
            <text x={2} y={a.y - 1} fill={a.color} fontSize="2" fontFamily="monospace" opacity="0.7">OFFSIDE LINE</text>
          </g>
        );
        return null;
      })}
      {/* Live preview while drawing */}
      {isDrawing && startPos && currentPos && activeTool === ANNOTATION_TOOLS.LINE && (
        <line x1={startPos.x} y1={startPos.y} x2={currentPos.x} y2={currentPos.y} stroke={activeColor} strokeWidth="0.4" strokeDasharray="1" opacity="0.7" />
      )}
      {isDrawing && startPos && currentPos && activeTool === ANNOTATION_TOOLS.CIRCLE && (
        <circle cx={startPos.x} cy={startPos.y} r={Math.sqrt(Math.pow(currentPos.x - startPos.x, 2) + Math.pow(currentPos.y - startPos.y, 2))} stroke={activeColor} strokeWidth="0.4" fill="none" strokeDasharray="1" opacity="0.7" />
      )}
    </svg>
  );
};

// ── Annotation Toolbar ────────────────────────────────────
const AnnotationToolbar = ({ activeTool, setActiveTool, activeColor, setActiveColor, annotations, setAnnotations, onSave, onExport, activeFormations, setActiveFormations }) => {
  const [showFormations, setShowFormations] = useState(false);

  const placeFormation = (formationKey, team) => {
    const f = FORMATIONS[formationKey];
    if (!f) return;
    const teamColor = team === "home" ? "#00E5FF" : "#FF2A2A";
    const offset = team === "away" ? { x: 0, y: -2 } : { x: 0, y: 2 };
    const positions = ["GK", "DEF", "DEF", "DEF", "DEF", "DEF", "MID", "MID", "MID", "MID", "FWD", "FWD", "FWD"];
    const newPlayers = f.positions.map((p, i) => ({
      type: "formation_player", x: p.x + offset.x, y: p.y + offset.y,
      color: teamColor, team, formation: formationKey,
      label: (positions[i] || "").substring(0, 3), id: Date.now() + i,
    }));
    setAnnotations(prev => [...prev.filter(a => !(a.type === "formation_player" && a.team === team)), ...newPlayers]);
    setActiveFormations(prev => ({ ...prev, [team]: formationKey }));
  };

  const addOffsideLine = () => {
    setAnnotations(prev => [...prev, { type: "offside_line", y: 65, color: "#FFB800", id: Date.now() }]);
  };

  return (
    <div className="bg-[#0A0A0A] border border-white/[0.08]" data-testid="annotation-toolbar">
      <div className="flex items-center gap-1 p-1 flex-wrap">
        {/* Drawing tools */}
        {[
          { tool: ANNOTATION_TOOLS.LINE, icon: Minus, label: "Draw Line", testid: "tool-line" },
          { tool: ANNOTATION_TOOLS.CIRCLE, icon: Circle, label: "Circle", testid: "tool-circle" },
          { tool: ANNOTATION_TOOLS.MARKER, icon: Crosshair, label: "Point Marker", testid: "tool-marker" },
        ].map(({ tool, icon: Icon, label, testid }) => (
          <button key={tool} onClick={() => setActiveTool(activeTool === tool ? ANNOTATION_TOOLS.NONE : tool)} title={label}
            className={`h-7 w-7 flex items-center justify-center transition-all ${activeTool === tool ? 'bg-[#00E5FF]/20 text-[#00E5FF] border border-[#00E5FF]/40' : 'text-gray-500 hover:text-white border border-transparent'}`}
            data-testid={testid}><Icon className="w-3.5 h-3.5" /></button>
        ))}

        <div className="h-4 w-[1px] bg-white/[0.06] mx-0.5" />

        {/* Formation + Offside */}
        <button onClick={() => setShowFormations(!showFormations)} title="Team Formation Overlay"
          className={`h-7 px-2 flex items-center gap-1 text-[9px] font-mono transition-all ${showFormations ? 'bg-[#00E5FF]/20 text-[#00E5FF] border border-[#00E5FF]/40' : 'text-gray-500 hover:text-white border border-transparent'}`}
          data-testid="tool-formation"><Users2 className="w-3.5 h-3.5" /><span className="hidden sm:inline">FORMATION</span></button>
        <button onClick={addOffsideLine} title="Add Offside Line" className="h-7 px-2 flex items-center gap-1 text-[9px] font-mono text-gray-500 hover:text-[#FFB800] border border-transparent transition-all" data-testid="tool-offside-line"><Layers className="w-3.5 h-3.5" /><span className="hidden sm:inline">OFFSIDE</span></button>

        <div className="h-4 w-[1px] bg-white/[0.06] mx-0.5" />

        {/* Colors */}
        <div className="flex items-center gap-0.5" data-testid="color-picker">
          {ANNOTATION_COLORS.map(c => (
            <button key={c} onClick={() => setActiveColor(c)} className={`w-4 h-4 transition-all ${activeColor === c ? 'ring-1 ring-white ring-offset-1 ring-offset-[#050505] scale-125' : 'opacity-60 hover:opacity-100'}`} style={{ backgroundColor: c }} data-testid={`color-${c.replace('#','')}`} />
          ))}
        </div>

        <div className="h-4 w-[1px] bg-white/[0.06] mx-0.5" />

        {/* Actions */}
        <button onClick={() => setAnnotations(prev => prev.slice(0, -1))} className="h-7 w-7 flex items-center justify-center text-gray-500 hover:text-[#FFB800] transition-all" title="Undo" data-testid="annotation-undo"><Undo2 className="w-3.5 h-3.5" /></button>
        <button onClick={() => { setAnnotations([]); setActiveFormations({}); }} className="h-7 w-7 flex items-center justify-center text-gray-500 hover:text-[#FF2A2A] transition-all" title="Clear all" data-testid="annotation-clear"><Trash2 className="w-3.5 h-3.5" /></button>
        {onSave && annotations.length > 0 && (
          <button onClick={onSave} className="h-7 px-2 flex items-center gap-1 text-[#00FF88] text-[9px] font-mono border border-[#00FF88]/30 bg-[#00FF88]/10 hover:bg-[#00FF88]/20 transition-all" data-testid="annotation-save"><Save className="w-3 h-3" />SAVE</button>
        )}
        {onExport && (
          <button onClick={onExport} className="h-7 px-2 flex items-center gap-1 text-[#FFB800] text-[9px] font-mono border border-[#FFB800]/30 bg-[#FFB800]/10 hover:bg-[#FFB800]/20 transition-all" title="Export to PNG" data-testid="annotation-export"><Download className="w-3 h-3" />PNG</button>
        )}
        {annotations.length > 0 && <span className="text-[9px] font-mono text-gray-600 ml-1">{annotations.length}</span>}
      </div>

      {/* Formation Selector Panel */}
      {showFormations && (
        <div className="border-t border-white/[0.06] p-2 flex flex-wrap gap-2" data-testid="formation-panel">
          <div className="flex items-center gap-1.5">
            <span className="text-[9px] font-mono text-[#00E5FF]">HOME</span>
            {Object.keys(FORMATIONS).map(k => (
              <button key={`h-${k}`} onClick={() => placeFormation(k, "home")}
                className={`text-[9px] font-mono px-2 py-1 transition-all ${activeFormations.home === k ? 'bg-[#00E5FF]/20 text-[#00E5FF] border border-[#00E5FF]/40' : 'text-gray-500 hover:text-white border border-white/[0.06]'}`}
                data-testid={`formation-home-${k}`}>{k}</button>
            ))}
          </div>
          <div className="h-4 w-[1px] bg-white/[0.06]" />
          <div className="flex items-center gap-1.5">
            <span className="text-[9px] font-mono text-[#FF2A2A]">AWAY</span>
            {Object.keys(FORMATIONS).map(k => (
              <button key={`a-${k}`} onClick={() => placeFormation(k, "away")}
                className={`text-[9px] font-mono px-2 py-1 transition-all ${activeFormations.away === k ? 'bg-[#FF2A2A]/20 text-[#FF2A2A] border border-[#FF2A2A]/40' : 'text-gray-500 hover:text-white border border-white/[0.06]'}`}
                data-testid={`formation-away-${k}`}>{k}</button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

// ── Decision Comparison Mode ──────────────────────────────
const ComparisonPanel = ({ label, color, time, annotations, setAnnotations, activeColor, activeFormations, setActiveFormations, panelId }) => {
  const [activeTool, setActiveTool] = useState(ANNOTATION_TOOLS.NONE);
  const [isDrawing, setIsDrawing] = useState(false);

  const placeFormation = (formationKey, team) => {
    const f = FORMATIONS[formationKey];
    if (!f) return;
    const teamColor = team === "home" ? "#00E5FF" : "#FF2A2A";
    const newPlayers = f.positions.map((p, i) => ({
      type: "formation_player", x: p.x + (team === "away" ? 0 : 0), y: p.y + (team === "away" ? -2 : 2),
      color: teamColor, team, formation: formationKey,
      label: (["GK","DEF","DEF","DEF","DEF","DEF","MID","MID","MID","MID","FWD","FWD","FWD"][i] || "").substring(0, 3),
      id: Date.now() + i + (team === "away" ? 1000 : 0),
    }));
    setAnnotations(prev => [...prev.filter(a => !(a.type === "formation_player" && a.team === team)), ...newPlayers]);
    setActiveFormations(prev => ({ ...prev, [team]: formationKey }));
  };

  return (
    <div className="flex-1 min-w-0">
      {/* Frame Label */}
      <div className="flex items-center justify-between px-3 py-1.5 border-b border-white/[0.06] bg-[#0A0A0A]">
        <div className="flex items-center gap-2">
          <div className="w-2 h-2" style={{ backgroundColor: color }} />
          <span className="text-[10px] font-heading font-bold uppercase tracking-[0.2em]" style={{ color }}>{label}</span>
        </div>
        <span className="text-[10px] font-mono text-gray-500">{time}</span>
      </div>

      {/* Frame */}
      <div className="aspect-video relative bg-black" data-panel={panelId}>
        <img src="https://images.pexels.com/photos/12201296/pexels-photo-12201296.jpeg" alt="Match frame" className="w-full h-full object-cover opacity-40" />
        <div className="absolute inset-0 grid-overlay opacity-30" />
        <AnnotationCanvas width={100} height={100} annotations={annotations} setAnnotations={setAnnotations} activeTool={activeTool} activeColor={activeColor} isDrawing={isDrawing} setIsDrawing={setIsDrawing} formations={Object.values(activeFormations)} />
      </div>

      {/* Mini tools */}
      <div className="flex items-center gap-0.5 p-1 bg-[#050505] border-t border-white/[0.06]">
        {[
          { tool: ANNOTATION_TOOLS.LINE, icon: Minus },
          { tool: ANNOTATION_TOOLS.CIRCLE, icon: Circle },
          { tool: ANNOTATION_TOOLS.MARKER, icon: Crosshair },
        ].map(({ tool, icon: Icon }) => (
          <button key={tool} onClick={() => setActiveTool(activeTool === tool ? ANNOTATION_TOOLS.NONE : tool)}
            className={`h-6 w-6 flex items-center justify-center text-[10px] ${activeTool === tool ? 'bg-[#00E5FF]/20 text-[#00E5FF]' : 'text-gray-600 hover:text-white'}`}>
            <Icon className="w-3 h-3" />
          </button>
        ))}
        <div className="h-3 w-[1px] bg-white/[0.06] mx-0.5" />
        <button onClick={() => { const f = Object.keys(FORMATIONS)[0]; placeFormation(f, "home"); }} className="text-[8px] font-mono text-[#00E5FF] hover:bg-[#00E5FF]/10 px-1.5 py-0.5">HOME</button>
        <button onClick={() => { const f = Object.keys(FORMATIONS)[0]; placeFormation(f, "away"); }} className="text-[8px] font-mono text-[#FF2A2A] hover:bg-[#FF2A2A]/10 px-1.5 py-0.5">AWAY</button>
        <button onClick={() => setAnnotations(prev => [...prev, { type: "offside_line", y: 65, color: "#FFB800", id: Date.now() }])} className="text-[8px] font-mono text-[#FFB800] hover:bg-[#FFB800]/10 px-1.5 py-0.5">OFFSIDE</button>
        <div className="h-3 w-[1px] bg-white/[0.06] mx-0.5" />
        <button onClick={() => setAnnotations(prev => prev.slice(0, -1))} className="h-6 w-6 flex items-center justify-center text-gray-600 hover:text-[#FFB800]"><Undo2 className="w-3 h-3" /></button>
        <button onClick={() => setAnnotations([])} className="h-6 w-6 flex items-center justify-center text-gray-600 hover:text-[#FF2A2A]"><Trash2 className="w-3 h-3" /></button>
        <span className="text-[8px] font-mono text-gray-600 ml-auto">{annotations.length}</span>
      </div>
    </div>
  );
};

const DecisionComparisonMode = ({ incident, onClose }) => {
  const [beforeAnnotations, setBeforeAnnotations] = useState([]);
  const [afterAnnotations, setAfterAnnotations] = useState([]);
  const [activeColor] = useState("#00E5FF");
  const [beforeFormations, setBeforeFormations] = useState({});
  const [afterFormations, setAfterFormations] = useState({});
  const [notes, setNotes] = useState("");
  const [trailEnabled, setTrailEnabled] = useState(true);
  const [trailPairs, setTrailPairs] = useState([]);
  const framesWrapRef = useRef(null);

  // ── Player Tracking Trail: match players between BEFORE and AFTER ──
  const computePairs = useCallback(() => {
    const wrap = framesWrapRef.current;
    if (!wrap) return [];
    const beforeFrame = wrap.querySelector('[data-panel="before"]');
    const afterFrame = wrap.querySelector('[data-panel="after"]');
    if (!beforeFrame || !afterFrame) return [];
    const wrapRect = wrap.getBoundingClientRect();
    const bRect = beforeFrame.getBoundingClientRect();
    const aRect = afterFrame.getBoundingClientRect();

    const toAbs = (rect, xPct, yPct) => ({
      x: rect.left - wrapRect.left + (xPct / 100) * rect.width,
      y: rect.top - wrapRect.top + (yPct / 100) * rect.height,
    });

    const pairs = [];

    // Formation players — match by team + stable index within team (by id order)
    const beforePlayersByTeam = {};
    const afterPlayersByTeam = {};
    beforeAnnotations.filter(a => a.type === "formation_player").forEach(p => {
      (beforePlayersByTeam[p.team] = beforePlayersByTeam[p.team] || []).push(p);
    });
    afterAnnotations.filter(a => a.type === "formation_player").forEach(p => {
      (afterPlayersByTeam[p.team] = afterPlayersByTeam[p.team] || []).push(p);
    });
    ["home", "away"].forEach(team => {
      const bList = (beforePlayersByTeam[team] || []).slice().sort((x, y) => x.id - y.id);
      const aList = (afterPlayersByTeam[team] || []).slice().sort((x, y) => x.id - y.id);
      const n = Math.min(bList.length, aList.length);
      for (let i = 0; i < n; i++) {
        const bp = bList[i], ap = aList[i];
        const from = toAbs(bRect, bp.x, bp.y);
        const to = toAbs(aRect, ap.x, ap.y);
        // Pseudo-movement magnitude in % of frame width (consistent frame size)
        const deltaPct = Math.hypot(ap.x - bp.x, ap.y - bp.y);
        pairs.push({
          key: `fp-${team}-${i}`,
          from, to, color: bp.color, label: bp.label || "P",
          deltaPct: Math.round(deltaPct * 10) / 10,
        });
      }
    });

    // Markers — match by color + index order
    const groupByColor = (list) => {
      const m = {};
      list.filter(a => a.type === "marker").forEach(mk => { (m[mk.color] = m[mk.color] || []).push(mk); });
      return m;
    };
    const bMarkers = groupByColor(beforeAnnotations);
    const aMarkers = groupByColor(afterAnnotations);
    Object.keys(bMarkers).forEach(col => {
      const bList = bMarkers[col] || [];
      const aList = aMarkers[col] || [];
      const n = Math.min(bList.length, aList.length);
      for (let i = 0; i < n; i++) {
        const bp = bList[i], ap = aList[i];
        const from = toAbs(bRect, bp.x, bp.y);
        const to = toAbs(aRect, ap.x, ap.y);
        const deltaPct = Math.hypot(ap.x - bp.x, ap.y - bp.y);
        pairs.push({
          key: `mk-${col}-${i}`,
          from, to, color: col, label: "",
          deltaPct: Math.round(deltaPct * 10) / 10,
        });
      }
    });

    return pairs;
  }, [beforeAnnotations, afterAnnotations]);

  useEffect(() => {
    let rafId;
    const recalc = () => {
      rafId = requestAnimationFrame(() => setTrailPairs(computePairs()));
    };
    recalc();
    window.addEventListener("resize", recalc);
    return () => {
      window.removeEventListener("resize", recalc);
      if (rafId) cancelAnimationFrame(rafId);
    };
  }, [computePairs]);

  const beforeTime = incident?.timestamp_in_match ? (() => {
    const p = incident.timestamp_in_match.split(":");
    const m = parseInt(p[0]) || 0, s = parseInt(p[1]) || 0;
    const prev = Math.max(0, s - 2);
    return `${String(m).padStart(2,'0')}:${String(prev).padStart(2,'0')}.000`;
  })() : "00:00.000";

  const afterTime = incident?.timestamp_in_match || "00:00.000";

  const handleExportComparison = () => {
    const canvas = document.createElement("canvas");
    const w = 1920, h = 640;
    canvas.width = w; canvas.height = h;
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#050505"; ctx.fillRect(0, 0, w, h);

    // Header
    ctx.fillStyle = "#00E5FF"; ctx.font = "bold 16px monospace";
    ctx.fillText("OCTON VAR - DECISION COMPARISON REPORT", 20, 25);
    ctx.fillStyle = "#666"; ctx.font = "11px monospace";
    ctx.fillText(`Dr Finnegan's Forensic AI | ${incident?.incident_type?.toUpperCase() || ""} | ${incident?.team_involved || ""} | ${new Date().toISOString().split("T")[0]}`, 20, 42);

    // Divider
    ctx.strokeStyle = "#00E5FF33"; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(0, 50); ctx.lineTo(w, 50); ctx.stroke();

    // Labels
    const pH = 500, pY = 55;
    ctx.fillStyle = "#FFB800"; ctx.font = "bold 12px monospace"; ctx.fillText(`BEFORE (${beforeTime})`, 20, pY + 18);
    ctx.fillStyle = "#00FF88"; ctx.fillText(`AFTER (${afterTime})`, w/2 + 20, pY + 18);

    // Draw annotations on both halves
    const drawAnnotations = (annots, offsetX, areaW) => {
      annots.forEach(a => {
        ctx.strokeStyle = a.color || "#00E5FF"; ctx.fillStyle = a.color || "#00E5FF"; ctx.lineWidth = 2;
        if (a.type === "line") { ctx.beginPath(); ctx.moveTo(offsetX + a.x1/100*areaW, pY + 25 + a.y1/100*pH); ctx.lineTo(offsetX + a.x2/100*areaW, pY + 25 + a.y2/100*pH); ctx.stroke(); }
        else if (a.type === "circle") { ctx.beginPath(); ctx.arc(offsetX + a.cx/100*areaW, pY + 25 + a.cy/100*pH, a.r/100*Math.min(areaW, pH), 0, Math.PI*2); ctx.stroke(); }
        else if (a.type === "marker") { ctx.beginPath(); ctx.arc(offsetX + a.x/100*areaW, pY + 25 + a.y/100*pH, 6, 0, Math.PI*2); ctx.fill(); }
        else if (a.type === "formation_player") { ctx.beginPath(); ctx.arc(offsetX + a.x/100*areaW, pY + 25 + a.y/100*pH, 8, 0, Math.PI*2); ctx.fill(); }
        else if (a.type === "offside_line") { ctx.setLineDash([8, 4]); ctx.beginPath(); ctx.moveTo(offsetX, pY + 25 + a.y/100*pH); ctx.lineTo(offsetX + areaW, pY + 25 + a.y/100*pH); ctx.stroke(); ctx.setLineDash([]); }
      });
    };
    drawAnnotations(beforeAnnotations, 0, w/2 - 5);
    drawAnnotations(afterAnnotations, w/2 + 5, w/2 - 5);

    // Draw Player Tracking Trail across both halves (if enabled)
    if (trailEnabled) {
      const leftOx = 0, rightOx = w/2 + 5;
      const areaW = w/2 - 5;
      const frameTop = pY + 25;

      const groupByTeam = (list) => {
        const m = { home: [], away: [] };
        list.filter(a => a.type === "formation_player").forEach(p => { if (m[p.team]) m[p.team].push(p); });
        return m;
      };
      const groupByColor = (list) => {
        const m = {};
        list.filter(a => a.type === "marker").forEach(mk => { (m[mk.color] = m[mk.color] || []).push(mk); });
        return m;
      };
      const bTeam = groupByTeam(beforeAnnotations), aTeam = groupByTeam(afterAnnotations);
      const bMk = groupByColor(beforeAnnotations), aMk = groupByColor(afterAnnotations);

      const drawArrow = (fx, fy, tx, ty, color, deltaPct) => {
        const moved = deltaPct >= 0.8;
        // start/end dots
        ctx.fillStyle = color; ctx.globalAlpha = 0.55; ctx.beginPath(); ctx.arc(fx, fy, 5, 0, Math.PI*2); ctx.fill();
        ctx.globalAlpha = 0.9; ctx.beginPath(); ctx.arc(tx, ty, 5, 0, Math.PI*2); ctx.fill();
        ctx.globalAlpha = 1;
        if (moved) {
          ctx.strokeStyle = "#00E5FF"; ctx.lineWidth = 1.5; ctx.setLineDash([5, 4]);
          ctx.beginPath(); ctx.moveTo(fx, fy); ctx.lineTo(tx, ty); ctx.stroke();
          ctx.setLineDash([]);
          // arrow head
          const ang = Math.atan2(ty - fy, tx - fx);
          ctx.fillStyle = "#00E5FF"; ctx.beginPath();
          ctx.moveTo(tx, ty);
          ctx.lineTo(tx - 9 * Math.cos(ang - Math.PI/7), ty - 9 * Math.sin(ang - Math.PI/7));
          ctx.lineTo(tx - 9 * Math.cos(ang + Math.PI/7), ty - 9 * Math.sin(ang + Math.PI/7));
          ctx.closePath(); ctx.fill();
          // distance label
          const mx = (fx + tx) / 2, my = (fy + ty) / 2 - 8;
          ctx.fillStyle = "rgba(0,0,0,0.75)"; ctx.fillRect(mx - 22, my - 8, 44, 14);
          ctx.fillStyle = "#00E5FF"; ctx.font = "10px monospace"; ctx.textAlign = "center";
          ctx.fillText(`Δ ${deltaPct.toFixed(1)}%`, mx, my + 2);
          ctx.textAlign = "left";
        } else {
          ctx.strokeStyle = "rgba(255,255,255,0.25)"; ctx.lineWidth = 0.75;
          ctx.beginPath(); ctx.moveTo(fx, fy); ctx.lineTo(tx, ty); ctx.stroke();
        }
      };

      ["home", "away"].forEach(team => {
        const bList = (bTeam[team] || []).slice().sort((x, y) => x.id - y.id);
        const aList = (aTeam[team] || []).slice().sort((x, y) => x.id - y.id);
        const n = Math.min(bList.length, aList.length);
        for (let i = 0; i < n; i++) {
          const bp = bList[i], ap = aList[i];
          const fx = leftOx + bp.x/100 * areaW, fy = frameTop + bp.y/100 * pH;
          const tx = rightOx + ap.x/100 * areaW, ty = frameTop + ap.y/100 * pH;
          const deltaPct = Math.hypot(ap.x - bp.x, ap.y - bp.y);
          drawArrow(fx, fy, tx, ty, bp.color, deltaPct);
        }
      });
      Object.keys(bMk).forEach(col => {
        const bList = bMk[col] || [], aList = aMk[col] || [];
        const n = Math.min(bList.length, aList.length);
        for (let i = 0; i < n; i++) {
          const bp = bList[i], ap = aList[i];
          const fx = leftOx + bp.x/100 * areaW, fy = frameTop + bp.y/100 * pH;
          const tx = rightOx + ap.x/100 * areaW, ty = frameTop + ap.y/100 * pH;
          const deltaPct = Math.hypot(ap.x - bp.x, ap.y - bp.y);
          drawArrow(fx, fy, tx, ty, col, deltaPct);
        }
      });
    }

    // Center divider
    ctx.strokeStyle = "#ffffff22"; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(w/2, pY); ctx.lineTo(w/2, h - 40); ctx.stroke();

    // Footer
    ctx.fillStyle = "#333"; ctx.font = "10px monospace";
    ctx.fillText(`Before: ${beforeAnnotations.length} annotations | After: ${afterAnnotations.length} annotations`, 20, h - 15);
    if (notes) { ctx.fillStyle = "#888"; ctx.fillText(`Notes: ${notes.substring(0, 100)}`, w/2, h - 15); }

    const link = document.createElement("a");
    link.download = `OCTON_Comparison_${incident?.id?.substring(0,8) || "report"}.png`;
    link.href = canvas.toDataURL("image/png");
    link.click();
    toast.success("Comparison report exported!");
  };

  return (
    <div className="border border-white/[0.08] bg-[#050505]" data-testid="comparison-mode">
      {/* Comparison Header */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-white/[0.06] bg-[#0A0A0A]">
        <div className="flex items-center gap-3">
          <Columns className="w-4 h-4 text-[#00E5FF]" />
          <span className="text-xs font-heading font-bold uppercase tracking-[0.15em] text-[#00E5FF]">DECISION COMPARISON</span>
          {incident?.incident_type && <span className="text-[10px] font-mono text-gray-500 uppercase">{incident.incident_type} ANALYSIS</span>}
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setTrailEnabled(v => !v)} className={`h-7 px-2 flex items-center gap-1 text-[9px] font-mono border transition-all ${trailEnabled ? 'text-[#00E5FF] border-[#00E5FF]/40 bg-[#00E5FF]/10 hover:bg-[#00E5FF]/20' : 'text-gray-500 border-white/10 hover:text-white hover:border-white/30'}`} data-testid="trail-toggle" title="Toggle player tracking trail">
            <ArrowRight className="w-3 h-3" />TRAIL {trailEnabled ? "ON" : "OFF"}
            {trailEnabled && trailPairs.length > 0 && <span className="ml-1 px-1 bg-[#00E5FF]/20">{trailPairs.filter(p => p.deltaPct >= 0.8).length}</span>}
          </button>
          <button onClick={handleExportComparison} className="h-7 px-2 flex items-center gap-1 text-[#FFB800] text-[9px] font-mono border border-[#FFB800]/30 bg-[#FFB800]/10 hover:bg-[#FFB800]/20 transition-all" data-testid="export-comparison"><Download className="w-3 h-3" />EXPORT</button>
          <button onClick={onClose} className="h-7 w-7 flex items-center justify-center text-gray-500 hover:text-white border border-white/10 hover:border-white/30 transition-all" data-testid="close-comparison"><XCircle className="w-4 h-4" /></button>
        </div>
      </div>

      {/* Side-by-Side Frames */}
      <div ref={framesWrapRef} className="relative flex gap-[1px] bg-white/[0.04]">
        <ComparisonPanel panelId="before" label="BEFORE" color="#FFB800" time={beforeTime} annotations={beforeAnnotations} setAnnotations={setBeforeAnnotations} activeColor={activeColor} activeFormations={beforeFormations} setActiveFormations={setBeforeFormations} />
        <ComparisonPanel panelId="after" label="AFTER" color="#00FF88" time={afterTime} annotations={afterAnnotations} setAnnotations={setAfterAnnotations} activeColor={activeColor} activeFormations={afterFormations} setActiveFormations={setAfterFormations} />

        {/* Player Tracking Trail Overlay */}
        {trailEnabled && trailPairs.length > 0 && (
          <svg className="pointer-events-none absolute inset-0 w-full h-full z-20" data-testid="player-tracking-overlay">
            <defs>
              <marker id="trail-arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
                <path d="M 0 0 L 10 5 L 0 10 z" fill="#00E5FF" />
              </marker>
              <marker id="trail-arrow-static" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="4" markerHeight="4" orient="auto">
                <circle cx="5" cy="5" r="3" fill="#FFFFFF" opacity="0.5" />
              </marker>
            </defs>
            {trailPairs.map(p => {
              const dx = p.to.x - p.from.x;
              const dy = p.to.y - p.from.y;
              const dist = Math.hypot(dx, dy);
              const moved = p.deltaPct >= 0.8; // hide trivial movement (<0.8% of frame)
              const midX = (p.from.x + p.to.x) / 2;
              const midY = (p.from.y + p.to.y) / 2;
              return (
                <g key={p.key} data-testid={`trail-${p.key}`}>
                  {/* Start dot */}
                  <circle cx={p.from.x} cy={p.from.y} r="4" fill={p.color} opacity="0.55" stroke="#000" strokeWidth="1" />
                  {/* End dot */}
                  <circle cx={p.to.x} cy={p.to.y} r="4" fill={p.color} opacity="0.9" stroke="#000" strokeWidth="1" />
                  {moved ? (
                    <>
                      <line x1={p.from.x} y1={p.from.y} x2={p.to.x} y2={p.to.y}
                        stroke="#00E5FF" strokeWidth="1.5" strokeDasharray="4 3" opacity="0.85"
                        markerEnd="url(#trail-arrow)" />
                      <g transform={`translate(${midX}, ${midY - 6})`}>
                        <rect x="-16" y="-8" width="32" height="12" fill="#000000" opacity="0.75" />
                        <text x="0" y="1" textAnchor="middle" fontSize="9" fontFamily="monospace" fill="#00E5FF" dominantBaseline="middle">
                          Δ {p.deltaPct.toFixed(1)}%
                        </text>
                      </g>
                    </>
                  ) : (
                    <line x1={p.from.x} y1={p.from.y} x2={p.to.x} y2={p.to.y}
                      stroke="#FFFFFF" strokeWidth="0.75" opacity="0.25" />
                  )}
                  {p.label && (
                    <text x={p.from.x + 6} y={p.from.y - 6} fontSize="8" fontFamily="monospace" fill={p.color} opacity="0.9">
                      {p.label}
                    </text>
                  )}
                </g>
              );
            })}
          </svg>
        )}
      </div>

      {/* Comparison Notes */}
      <div className="p-3 border-t border-white/[0.06] bg-[#0A0A0A]">
        <div className="flex items-start gap-3">
          <div className="flex-1">
            <input value={notes} onChange={e => setNotes(e.target.value)} placeholder="Add comparison notes for the referee report..." className="w-full bg-transparent border border-white/[0.08] px-3 py-1.5 text-xs text-white placeholder:text-gray-600 font-mono focus:border-[#00E5FF]/40 outline-none" data-testid="comparison-notes" />
          </div>
          <div className="text-[9px] font-mono text-gray-600 whitespace-nowrap pt-1.5">
            {beforeAnnotations.length + afterAnnotations.length} total marks
          </div>
        </div>
      </div>
    </div>
  );
};

// ── Video Stage with Match Replay Scrubber ────────────────
const VideoStage = ({ incident, onAnalyze, previewImage, previewVideo, onSaveAnnotations }) => {
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentFrame, setCurrentFrame] = useState(1847);
  const [totalFrames] = useState(3200);
  const [playbackSpeed, setPlaybackSpeed] = useState(1);
  const [matchTime, setMatchTime] = useState({ min: 67, sec: 12, ms: 450 });
  const [scrubberHover, setScrubberHover] = useState(null);
  const scrubberRef = useRef(null);
  const videoRef = useRef(null);
  const [annotations, setAnnotations] = useState([]);
  const [activeTool, setActiveTool] = useState(ANNOTATION_TOOLS.NONE);
  const [activeColor, setActiveColor] = useState("#00E5FF");
  const [isAnnotating, setIsAnnotating] = useState(false);
  const [activeFormations, setActiveFormations] = useState({});
  const stageRef = useRef(null);
  const imgSrc = previewImage || (incident?.has_image && incident?.storage_path ? `${API}/files/${incident.storage_path}` : null);
  const videoSrc = previewVideo || (incident?.has_video && incident?.video_storage_path ? `${API}/files/${incident.video_storage_path}` : null);

  // Load saved annotations from incident
  useEffect(() => {
    if (incident?.annotations) setAnnotations(incident.annotations);
    else setAnnotations([]);
  }, [incident?.id, incident?.annotations]);

  const handleSaveAnnotations = async () => {
    if (!incident?.id || annotations.length === 0) return;
    try {
      await axios.put(`${API}/incidents/${incident.id}/annotations`, { annotations, frame: currentFrame, match_time: `${String(matchTime.min).padStart(2,'0')}:${String(matchTime.sec).padStart(2,'0')}.${String(matchTime.ms).padStart(3,'0')}` });
      toast.success(`${annotations.length} annotations saved!`);
      if (onSaveAnnotations) onSaveAnnotations(annotations);
    } catch { toast.error("Failed to save annotations"); }
  };

  // PNG Export for referee reports
  const handleExport = async () => {
    const stage = stageRef.current;
    if (!stage) return;
    try {
      const canvas = document.createElement("canvas");
      const w = 1920, h = 1080;
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d");

      // Draw background
      ctx.fillStyle = "#050505";
      ctx.fillRect(0, 0, w, h);

      // Draw the video frame / image
      const mediaEl = stage.querySelector("video") || stage.querySelector("img");
      if (mediaEl) {
        try { ctx.drawImage(mediaEl, 0, 0, w, h - 120); } catch { /* cross-origin */ }
      }

      // Draw annotations
      const mainH = h - 120;
      annotations.forEach(a => {
        ctx.lineWidth = 3;
        ctx.strokeStyle = a.color || "#00E5FF";
        ctx.fillStyle = a.color || "#00E5FF";
        if (a.type === "line") {
          ctx.beginPath(); ctx.moveTo(a.x1/100*w, a.y1/100*mainH); ctx.lineTo(a.x2/100*w, a.y2/100*mainH); ctx.stroke();
        } else if (a.type === "circle") {
          ctx.beginPath(); ctx.arc(a.cx/100*w, a.cy/100*mainH, a.r/100*Math.min(w,mainH), 0, Math.PI*2); ctx.stroke();
        } else if (a.type === "marker") {
          ctx.beginPath(); ctx.arc(a.x/100*w, a.y/100*mainH, 8, 0, Math.PI*2); ctx.fill();
          ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(a.x/100*w, a.y/100*mainH, 16, 0, Math.PI*2); ctx.stroke();
        } else if (a.type === "formation_player") {
          ctx.beginPath(); ctx.arc(a.x/100*w, a.y/100*mainH, 12, 0, Math.PI*2); ctx.fill();
          ctx.fillStyle = "#000"; ctx.font = "bold 10px monospace"; ctx.textAlign = "center";
          ctx.fillText(a.label || "", a.x/100*w, a.y/100*mainH + 3.5);
          ctx.fillStyle = a.color;
        } else if (a.type === "offside_line") {
          ctx.setLineDash([12, 6]); ctx.beginPath(); ctx.moveTo(0, a.y/100*mainH); ctx.lineTo(w, a.y/100*mainH); ctx.stroke(); ctx.setLineDash([]);
          ctx.font = "bold 14px monospace"; ctx.fillText("OFFSIDE LINE", 20, a.y/100*mainH - 8);
        }
      });

      // Draw report footer
      const fy = h - 110;
      ctx.fillStyle = "#0A0A0A"; ctx.fillRect(0, fy, w, 110);
      ctx.strokeStyle = "#00E5FF33"; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(0, fy); ctx.lineTo(w, fy); ctx.stroke();

      ctx.fillStyle = "#00E5FF"; ctx.font = "bold 18px monospace";
      ctx.fillText("OCTON VAR - REFEREE REPORT", 20, fy + 28);
      ctx.fillStyle = "#888"; ctx.font = "12px monospace";
      ctx.fillText(`Dr Finnegan's Forensic AI | ${new Date().toISOString().split("T")[0]}`, 20, fy + 48);
      if (incident) {
        ctx.fillText(`Incident: ${incident.incident_type?.toUpperCase()} | Match Time: ${incident.timestamp_in_match || "N/A"} | ${incident.team_involved || ""} ${incident.player_involved || ""}`, 20, fy + 68);
        const ai = incident.ai_analysis;
        if (ai) {
          ctx.fillStyle = "#00E5FF"; ctx.font = "bold 14px monospace";
          ctx.fillText(`AI Confidence: ${ai.final_confidence?.toFixed(1) || 0}% | Decision: ${ai.suggested_decision || "N/A"}`, 20, fy + 92);
        }
      }
      ctx.fillStyle = "#333"; ctx.font = "10px monospace";
      ctx.fillText(`Frame: ${currentFrame}/${totalFrames} | ${timeStr} | Annotations: ${annotations.length}`, w - 400, fy + 92);

      // Download
      const link = document.createElement("a");
      link.download = `OCTON_VAR_Report_${incident?.id?.substring(0,8) || "frame"}_${Date.now()}.png`;
      link.href = canvas.toDataURL("image/png");
      link.click();
      toast.success("Referee report exported as PNG!");
    } catch (err) {
      toast.error("Export failed: " + err.message);
    }
  };

  // Sync video element with scrubber
  useEffect(() => {
    if (videoRef.current && videoSrc) {
      videoRef.current.playbackRate = playbackSpeed;
    }
  }, [playbackSpeed, videoSrc]);

  const handleVideoPlay = () => {
    if (videoRef.current) {
      if (isPlaying) { videoRef.current.pause(); } else { videoRef.current.play(); }
    }
    setIsPlaying(!isPlaying);
  };

  const handleVideoTimeUpdate = () => {
    if (!videoRef.current) return;
    const v = videoRef.current;
    const pct = v.currentTime / (v.duration || 1);
    setCurrentFrame(Math.floor(pct * totalFrames));
    const totalSec = v.currentTime;
    setMatchTime({ min: Math.floor(totalSec / 60), sec: Math.floor(totalSec % 60), ms: Math.floor((totalSec % 1) * 1000) });
  };

  const handleVideoScrub = (pct) => {
    if (videoRef.current && videoRef.current.duration) {
      videoRef.current.currentTime = pct * videoRef.current.duration;
    }
  };

  const stepVideoFrame = (delta) => {
    if (videoRef.current) {
      videoRef.current.currentTime = Math.max(0, videoRef.current.currentTime + (delta * 0.033));
    }
  };

  useEffect(() => {
    if (incident?.timestamp_in_match) {
      const parts = incident.timestamp_in_match.split(":");
      if (parts.length >= 2) setMatchTime({ min: parseInt(parts[0]) || 0, sec: parseInt(parts[1]) || 0, ms: 0 });
    }
  }, [incident]);

  useEffect(() => {
    if (!isPlaying) return;
    const interval = setInterval(() => {
      setCurrentFrame(f => { const next = f + playbackSpeed; if (next >= totalFrames) { setIsPlaying(false); return totalFrames; } return next; });
      setMatchTime(t => {
        let ms = t.ms + (33 * playbackSpeed), sec = t.sec, min = t.min;
        if (ms >= 1000) { sec += Math.floor(ms / 1000); ms = ms % 1000; }
        if (sec >= 60) { min += Math.floor(sec / 60); sec = sec % 60; }
        return { min, sec, ms: Math.floor(ms) };
      });
    }, 33);
    return () => clearInterval(interval);
  }, [isPlaying, playbackSpeed, totalFrames]);

  const stepFrame = (delta) => {
    setCurrentFrame(f => Math.max(0, Math.min(totalFrames, f + delta)));
    setMatchTime(t => {
      const total = Math.max(0, (t.min * 60000) + (t.sec * 1000) + t.ms + (delta * 33));
      return { min: Math.floor(total / 60000), sec: Math.floor((total % 60000) / 1000), ms: Math.floor(total % 1000) };
    });
  };

  const handleScrub = (e) => {
    if (!scrubberRef.current) return;
    const rect = scrubberRef.current.getBoundingClientRect();
    const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    setCurrentFrame(Math.floor(pct * totalFrames));
  };

  const progressPct = (currentFrame / totalFrames) * 100;
  const timeStr = `${String(matchTime.min).padStart(2,'0')}:${String(matchTime.sec).padStart(2,'0')}.${String(matchTime.ms).padStart(3,'0')}`;
  const speeds = [0.25, 0.5, 1, 2, 4];

  return (
    <div ref={stageRef} className="relative border border-white/[0.08] bg-black overflow-hidden" data-testid="video-player-container">
      <div className="aspect-video relative">
        {videoSrc ? (
          <video ref={videoRef} src={videoSrc} className="w-full h-full object-cover" onTimeUpdate={handleVideoTimeUpdate} onEnded={() => setIsPlaying(false)} onLoadedMetadata={() => { if (videoRef.current) videoRef.current.playbackRate = playbackSpeed; }} playsInline muted />
        ) : imgSrc ? (
          <img src={imgSrc} alt="Incident" className="w-full h-full object-cover" />
        ) : (
          <img src="https://images.pexels.com/photos/12201296/pexels-photo-12201296.jpeg" alt="Stadium" className="w-full h-full object-cover opacity-40" />
        )}
        <div className="absolute inset-0 grid-overlay opacity-50" />
        {/* Annotation Canvas Overlay */}
        <AnnotationCanvas width={100} height={100} annotations={annotations} setAnnotations={setAnnotations} activeTool={activeTool} activeColor={activeColor} isDrawing={isAnnotating} setIsDrawing={setIsAnnotating} formations={Object.values(activeFormations)} />
        <div className="absolute inset-0 pointer-events-none overflow-hidden"><div className="w-full h-[2px] bg-gradient-to-r from-transparent via-[#00E5FF]/60 to-transparent animate-scan" /></div>
        {incident?.ai_analysis && (
          <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
            <div className="w-48 h-48 border-2 border-[#00E5FF]/30 relative reticle-spin" style={{ borderRadius: '50%' }}>
              <div className="absolute top-1/2 left-0 w-3 h-[1px] bg-[#00E5FF]/60 -translate-y-1/2" /><div className="absolute top-1/2 right-0 w-3 h-[1px] bg-[#00E5FF]/60 -translate-y-1/2" />
              <div className="absolute left-1/2 top-0 h-3 w-[1px] bg-[#00E5FF]/60 -translate-x-1/2" /><div className="absolute left-1/2 bottom-0 h-3 w-[1px] bg-[#00E5FF]/60 -translate-x-1/2" />
            </div>
            <div className="absolute w-24 h-24 border border-[#00E5FF]/20"><div className="absolute top-1/2 left-0 w-full h-[1px] bg-[#00E5FF]/10" /><div className="absolute left-1/2 top-0 h-full w-[1px] bg-[#00E5FF]/10" /></div>
            <div className="absolute top-[20%] left-1/2 -translate-x-1/2 px-3 py-1 bg-[#00E5FF]/90 text-black text-[10px] font-mono font-bold tracking-wider">OCTON ANALYSIS ZONE</div>
          </div>
        )}
        <div className="absolute top-0 left-0 right-0 flex items-center justify-between p-3">
          <div className="flex items-center gap-2 bg-black/70 backdrop-blur-sm px-2 py-1">
            <div className={`w-2 h-2 ${isPlaying ? 'bg-[#FF2A2A]' : 'bg-[#00FF88]'} animate-pulse`} />
            <span className="text-[10px] font-mono text-white uppercase tracking-wider">{isPlaying ? 'PLAYING' : 'PAUSED'}</span>
            <span className="text-[10px] font-mono text-[#00E5FF]/60 ml-1">{playbackSpeed}x</span>
          </div>
          <div className="bg-black/70 backdrop-blur-sm px-3 py-1">
            <span className="text-lg font-mono text-white font-bold glow-text-cyan tracking-wider">{timeStr}</span>
          </div>
        </div>
        <div className="absolute bottom-0 left-0 right-0 h-[1px] bg-gradient-to-r from-transparent via-[#00E5FF]/40 to-transparent" />
      </div>

      {/* ANNOTATION TOOLBAR */}
      <AnnotationToolbar activeTool={activeTool} setActiveTool={setActiveTool} activeColor={activeColor} setActiveColor={setActiveColor} annotations={annotations} setAnnotations={setAnnotations} onSave={incident?.id ? handleSaveAnnotations : null} onExport={handleExport} activeFormations={activeFormations} setActiveFormations={setActiveFormations} />

      {/* MATCH REPLAY SCRUBBER */}
      <div className="bg-[#050505] border-t border-white/[0.06]">
        <div className="px-3 pt-2 pb-1">
          <div ref={scrubberRef} className="relative h-3 bg-white/[0.04] cursor-pointer group" onClick={(e) => { handleScrub(e); if (videoSrc && scrubberRef.current) { const r=scrubberRef.current.getBoundingClientRect(); handleVideoScrub(Math.max(0,Math.min(1,(e.clientX-r.left)/r.width))); } }}
            onMouseMove={(e) => { if (!scrubberRef.current) return; const r=scrubberRef.current.getBoundingClientRect(); const p=Math.max(0,Math.min(1,(e.clientX-r.left)/r.width)); setScrubberHover({pct:p*100,frame:Math.floor(p*totalFrames)}); }}
            onMouseLeave={() => setScrubberHover(null)} data-testid="replay-scrubber-track">
            <div className="absolute top-0 left-0 h-full bg-gradient-to-r from-[#00E5FF]/60 to-[#00E5FF]/30 transition-all duration-75" style={{ width: `${progressPct}%` }} />
            <div className="absolute top-1/2 -translate-y-1/2 w-[3px] h-5 bg-[#00E5FF] transition-all duration-75 group-hover:h-6 group-hover:shadow-[0_0_8px_rgba(0,229,255,0.6)]" style={{ left: `${progressPct}%` }} />
            {scrubberHover && <div className="absolute -top-7 -translate-x-1/2 px-2 py-0.5 bg-black/90 border border-white/10 text-[9px] font-mono text-[#00E5FF] whitespace-nowrap pointer-events-none" style={{ left: `${scrubberHover.pct}%` }}>FRM {scrubberHover.frame}</div>}
            <div className="absolute top-1/2 -translate-y-1/2 w-1.5 h-4 bg-[#FFB800]" style={{ left: '45%' }} title="Incident marker" />
          </div>
        </div>
        <div className="px-3 pb-2 flex items-center justify-between">
          <div className="flex items-center gap-0.5">
            <Button variant="ghost" size="sm" className="text-gray-500 hover:text-white h-7 w-7 p-0" onClick={() => { if (videoSrc) stepVideoFrame(-10); else stepFrame(-10); }} data-testid="step-back-10" title="-10 frames"><SkipBack className="w-3.5 h-3.5" /></Button>
            <Button variant="ghost" size="sm" className="text-gray-500 hover:text-white h-7 w-7 p-0" onClick={() => { if (videoSrc) stepVideoFrame(-1); else stepFrame(-1); }} data-testid="step-back-1" title="-1 frame"><ChevronLeft className="w-3.5 h-3.5" /></Button>
            <Button variant="ghost" size="sm" className="text-white hover:text-[#00E5FF] h-8 w-8 p-0 border border-white/10 hover:border-[#00E5FF]/40 mx-0.5 transition-all" onClick={() => { if (videoSrc) handleVideoPlay(); else setIsPlaying(!isPlaying); }} data-testid="play-pause-button">
              {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4 ml-0.5" />}
            </Button>
            <Button variant="ghost" size="sm" className="text-gray-500 hover:text-white h-7 w-7 p-0" onClick={() => { if (videoSrc) stepVideoFrame(1); else stepFrame(1); }} data-testid="step-forward-1" title="+1 frame"><ChevronRight className="w-3.5 h-3.5" /></Button>
            <Button variant="ghost" size="sm" className="text-gray-500 hover:text-white h-7 w-7 p-0" onClick={() => { if (videoSrc) stepVideoFrame(10); else stepFrame(10); }} data-testid="step-forward-10" title="+10 frames"><SkipForward className="w-3.5 h-3.5" /></Button>
            <div className="h-4 w-[1px] bg-white/[0.06] mx-1.5" />
            <div className="flex items-center gap-0.5" data-testid="speed-selector">
              {speeds.map(s => (
                <button key={s} onClick={() => setPlaybackSpeed(s)} className={`text-[9px] font-mono px-1.5 py-0.5 transition-all ${playbackSpeed === s ? 'bg-[#00E5FF]/20 text-[#00E5FF] border border-[#00E5FF]/30' : 'text-gray-600 hover:text-gray-400 border border-transparent'}`} data-testid={`speed-${s}x`}>{s}x</button>
              ))}
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="text-right"><span className="text-[10px] font-mono text-gray-600">FRM </span><span className="text-[11px] font-mono text-white font-bold">{currentFrame}</span><span className="text-[10px] font-mono text-gray-600">/{totalFrames}</span></div>
            {onAnalyze && <Button size="sm" className="bg-[#00E5FF] text-black hover:bg-[#00E5FF]/80 h-7 px-3 font-heading font-bold text-[10px] tracking-wider uppercase active:scale-[0.98]" onClick={onAnalyze} data-testid="analyze-frame-button"><Brain className="w-3 h-3 mr-1" />ANALYZE FRAME</Button>}
          </div>
        </div>
      </div>
    </div>
  );
};


// ── Live VAR Page ─────────────────────────────────────────
const LiveVARPage = () => {
  const { user } = useAuth();
  const [incidents, setIncidents] = useState([]);
  const [selectedIncident, setSelectedIncident] = useState(null);
  const { setId: setGlobalSelectedId } = useSelectedIncidentId();
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
    // Hard guard: base64 JSON body can't exceed ~15 MB reliably through the proxy.
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
      toast.success("Decision recorded!");
      fetchData();
    } catch { toast.error("Failed to record decision"); }
  };

  if (loading) return (
    <div className="flex-1 flex items-center justify-center bg-[#050505]">
      <div className="text-center"><div className="text-sm font-mono text-[#00E5FF] animate-pulse">INITIALIZING OCTON VAR...</div><Progress value={65} className="w-64 mt-4" /></div>
    </div>
  );

  const analysis = selectedIncident?.ai_analysis;

  return (
    <div className="flex-1 min-w-0 p-4 space-y-4 bg-[#050505] grid-overlay overflow-y-auto h-screen" data-testid="live-var-dashboard">
      {/* Decision Ticker */}
      <DecisionTicker incidents={incidents} onSelect={(inc) => setSelectedIncident(inc)} />

      {/* Header */}
      <div className="flex items-center justify-between border-b border-white/[0.06] pb-4">
        <div className="flex items-center gap-4">
          {/* Larger brain logo right next to title */}
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
                        <div className="space-y-2"><Image className="w-8 h-8 text-gray-400 mx-auto" /><p className="text-xs text-gray-400">Click to upload JPEG, PNG, or WebP</p></div>
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
          <div key={label} className="group bg-gradient-to-br from-[#0A0A0A] to-[#070707] p-4 relative overflow-hidden hover:from-[#0C0C0C] transition-colors" data-testid={`stat-${label.toLowerCase().replace(/\s+/g, '-')}`}>
            {/* Top accent */}
            <div className="absolute top-0 left-0 w-12 h-[2px]" style={{ backgroundColor: color, boxShadow: `0 0 8px ${color}` }} />
            {/* Corner ticks */}
            <div className="absolute top-1.5 right-1.5 w-1.5 h-1.5 border-r border-t" style={{ borderColor: `${color}66` }} />
            <div className="absolute bottom-1.5 left-1.5 w-1.5 h-1.5 border-l border-b" style={{ borderColor: `${color}66` }} />
            {/* Radial glow on hover */}
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
          {/* Brain Pathway */}
          {analysis && <BrainPathway analysis={analysis} />}
          {/* Timeline */}
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
              {/* Top accent scan line */}
              <div className="absolute top-0 left-0 w-full h-[2px] bg-gradient-to-r from-transparent via-[#00E5FF] to-transparent opacity-60" />
              {/* Corner brackets for professional HUD aesthetic */}
              <div className="absolute top-2 left-2 w-3 h-3 border-l border-t border-[#00E5FF]/40 pointer-events-none" />
              <div className="absolute top-2 right-2 w-3 h-3 border-r border-t border-[#00E5FF]/40 pointer-events-none" />
              <div className="absolute bottom-2 left-2 w-3 h-3 border-l border-b border-[#00E5FF]/40 pointer-events-none" />
              <div className="absolute bottom-2 right-2 w-3 h-3 border-r border-b border-[#00E5FF]/40 pointer-events-none" />

              <div className="p-4">
                {/* Header */}
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
                      try { const fn = exportAnalysisPDF(selectedIncident, analysis, audit); toast.success(audit ? `Signed report exported · ${fn}` : `Report exported · ${fn}`); }
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

                {/* Confidence Ring */}
                <div className="py-3">
                  <ConfidenceScore
                    score={analysis.final_confidence || analysis.confidence_score || 0}
                    uplift={analysis.confidence_uplift || 0}
                    precedentCount={analysis.precedent_strong_matches || 0}
                  />
                </div>

                {/* Always-visible Decision tile */}
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

                {/* Collapsible detail sections */}
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

                {/* Footer telemetry */}
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

// ── Analytics Page ────────────────────────────────────────
const AnalyticsPage = () => {
  const [referees, setReferees] = useState([]);
  const [analytics, setAnalytics] = useState(null);
  const [patterns, setPatterns] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetch_ = async () => {
      try {
        const [r, a, p] = await Promise.all([axios.get(`${API}/referees`), axios.get(`${API}/analytics/overview`), axios.get(`${API}/analytics/patterns`)]);
        setReferees(r.data); setAnalytics(a.data); setPatterns(p.data);
      } catch { toast.error("Failed to load analytics"); }
      finally { setLoading(false); }
    };
    fetch_();
  }, []);

  const COLORS = ['#00E5FF', '#00FF66', '#FFB800', '#FF3333', '#A855F7', '#F97316'];
  const typeData = analytics?.incidents_by_type ? Object.entries(analytics.incidents_by_type).map(([name, value]) => ({ name, value })) : [];
  const refData = referees.map(r => ({ name: r.name.split(' ').pop(), accuracy: r.total_decisions > 0 ? ((r.correct_decisions / r.total_decisions) * 100).toFixed(1) : 0, decisions: r.total_decisions }));

  if (loading) return <div className="flex-1 flex items-center justify-center bg-[#050505]"><div className="text-sm font-mono text-[#00E5FF] animate-pulse">LOADING ANALYTICS...</div></div>;

  return (
    <div className="flex-1 min-w-0 p-6 space-y-6 bg-[#050505]" data-testid="analytics-page">
      <div><h1 className="text-3xl font-heading font-black text-white tracking-tight">REFEREE ANALYTICS</h1><p className="text-sm font-body text-gray-400 mt-1">Performance metrics and OCTON learning patterns</p></div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { l: "TOTAL REFEREES", v: analytics?.total_referees || 0 },
          { l: "TOTAL MATCHES", v: analytics?.total_matches || 0 },
          { l: "ACCURACY RATE", v: `${analytics?.decision_accuracy_rate?.toFixed(1) || 0}%`, c: "#00FF66" },
          { l: "AVG DECISION TIME", v: `${analytics?.average_decision_time_seconds?.toFixed(1) || 0}s`, c: "#00E5FF" },
        ].map(({ l, v, c }) => (
          <Card key={l} className="bg-[#121212] border-white/10 rounded-none"><CardContent className="p-4"><p className="text-xs font-mono uppercase tracking-[0.2em] text-gray-400">{l}</p><p className="text-3xl font-mono font-medium mt-1" style={{ color: c || '#fff' }}>{v}</p></CardContent></Card>
        ))}
      </div>

      {/* Learning Metrics */}
      {patterns?.learning_metrics && (
        <Card className="bg-[#121212] border-white/10 rounded-none">
          <CardHeader><CardTitle className="text-sm font-mono uppercase text-gray-400">OCTON LEARNING METRICS</CardTitle></CardHeader>
          <CardContent>
            <div className="grid grid-cols-4 gap-4">
              <div className="text-center"><p className="text-2xl font-mono text-white">{patterns.learning_metrics.total_decided}</p><p className="text-xs font-mono text-gray-400">TOTAL DECIDED</p></div>
              <div className="text-center"><p className="text-2xl font-mono text-[#00FF66]">{patterns.learning_metrics.confirmed}</p><p className="text-xs font-mono text-gray-400">CONFIRMED</p></div>
              <div className="text-center"><p className="text-2xl font-mono text-[#FF3333]">{patterns.learning_metrics.overturned}</p><p className="text-xs font-mono text-gray-400">OVERTURNED</p></div>
              <div className="text-center"><p className="text-2xl font-mono text-[#00E5FF]">{patterns.learning_metrics.learning_accuracy}%</p><p className="text-xs font-mono text-gray-400">LEARNING ACC</p></div>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card className="bg-[#121212] border-white/10 rounded-none">
          <CardHeader><CardTitle className="text-sm font-mono uppercase text-gray-400">INCIDENT DISTRIBUTION</CardTitle></CardHeader>
          <CardContent><div className="h-[300px] min-h-[300px]">
            <ResponsiveContainer width="100%" height={300}>
              <PieChart><Pie data={typeData} cx="50%" cy="50%" outerRadius={100} dataKey="value" label={({ name, percent }) => `${name} ${(percent*100).toFixed(0)}%`}>
                {typeData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
              </Pie><Tooltip contentStyle={{ backgroundColor: '#121212', border: '1px solid rgba(255,255,255,0.1)' }} labelStyle={{ color: '#fff' }} /></PieChart>
            </ResponsiveContainer>
          </div></CardContent>
        </Card>
        <Card className="bg-[#121212] border-white/10 rounded-none">
          <CardHeader><CardTitle className="text-sm font-mono uppercase text-gray-400">REFEREE ACCURACY</CardTitle></CardHeader>
          <CardContent><div className="h-[300px] min-h-[300px]">
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={refData}><CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" /><XAxis dataKey="name" stroke="#666" fontSize={12} /><YAxis stroke="#666" fontSize={12} /><Tooltip contentStyle={{ backgroundColor: '#121212', border: '1px solid rgba(255,255,255,0.1)' }} labelStyle={{ color: '#fff' }} /><Bar dataKey="accuracy" fill="#00E5FF" radius={[2,2,0,0]} /></BarChart>
            </ResponsiveContainer>
          </div></CardContent>
        </Card>
      </div>

      <Card className="bg-[#121212] border-white/10 rounded-none">
        <CardHeader><CardTitle className="text-sm font-mono uppercase text-gray-400">REFEREE PERFORMANCE</CardTitle></CardHeader>
        <CardContent><div className="overflow-x-auto"><table className="w-full"><thead><tr className="border-b border-white/10">
          {["Name", "Role", "Decisions", "Correct", "Accuracy", "Avg Time"].map(h => <th key={h} className="text-left py-3 px-4 text-xs font-mono uppercase text-gray-400">{h}</th>)}
        </tr></thead><tbody>
          {referees.map(r => { const acc = r.total_decisions > 0 ? ((r.correct_decisions / r.total_decisions) * 100).toFixed(1) : 0; return (
            <tr key={r.id} className="border-b border-white/5 hover:bg-white/5">
              <td className="py-3 px-4"><div className="flex items-center gap-3"><div className="w-8 h-8 rounded-full bg-[#00E5FF]/20 flex items-center justify-center"><Users className="w-4 h-4 text-[#00E5FF]" /></div><span className="text-sm text-white">{r.name}</span></div></td>
              <td className="py-3 px-4 text-xs font-mono uppercase text-gray-400">{r.role?.replace('_', ' ')}</td>
              <td className="py-3 px-4 text-center text-sm font-mono text-white">{r.total_decisions}</td>
              <td className="py-3 px-4 text-center text-sm font-mono text-[#00FF66]">{r.correct_decisions}</td>
              <td className="py-3 px-4 text-center text-sm font-mono" style={{ color: parseFloat(acc)>=90 ? '#00FF66' : parseFloat(acc)>=70 ? '#FFB800' : '#FF3333' }}>{acc}%</td>
              <td className="py-3 px-4 text-center text-sm font-mono text-[#00E5FF]">{r.average_decision_time_seconds?.toFixed(1)}s</td>
            </tr>
          ); })}
        </tbody></table></div></CardContent>
      </Card>
    </div>
  );
};

// ── Settings Page ─────────────────────────────────────────
const SettingsPage = () => {
  const { user } = useAuth();
  const [seeding, setSeeding] = useState(false);

  const seedDemo = async () => {
    setSeeding(true);
    try { await axios.post(`${API}/seed-demo`); toast.success("OCTON demo data seeded!"); } catch { toast.error("Failed to seed"); }
    finally { setSeeding(false); }
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

// ── Matches Page (Admin) ──────────────────────────────────
const MatchesPage = () => {
  const { user } = useAuth();
  const [matches, setMatches] = useState([]);
  const [referees, setReferees] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [newMatch, setNewMatch] = useState({ team_home: "", team_away: "", date: "", competition: "", stadium: "" });
  const [assignDialog, setAssignDialog] = useState({ open: false, matchId: null, match: null });

  const fetchData = useCallback(async () => {
    try {
      const [m, r] = await Promise.all([axios.get(`${API}/matches`), axios.get(`${API}/referees`)]);
      setMatches(m.data); setReferees(r.data);
    } catch { toast.error("Failed to load matches"); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleCreate = async () => {
    if (!newMatch.team_home || !newMatch.team_away) { toast.error("Fill in team names"); return; }
    try {
      await axios.post(`${API}/matches`, newMatch);
      toast.success("Match created!"); setShowCreate(false);
      setNewMatch({ team_home: "", team_away: "", date: "", competition: "", stadium: "" });
      fetchData();
    } catch { toast.error("Failed to create match"); }
  };

  const handleAssign = async (matchId, refId, opId) => {
    try {
      await axios.put(`${API}/matches/${matchId}/assign`, { referee_id: refId || null, var_operator_id: opId || null });
      toast.success("Assignment updated!"); setAssignDialog({ open: false, matchId: null, match: null }); fetchData();
    } catch (e) { toast.error(e.response?.data?.detail || "Assignment failed"); }
  };

  const handleStatusChange = async (matchId, status) => {
    try {
      await axios.put(`${API}/matches/${matchId}/status?status=${status}`);
      toast.success("Status updated!"); fetchData();
    } catch { toast.error("Failed to update status"); }
  };

  const statusColors = { scheduled: "#FFB800", live: "#00FF66", completed: "#A0A0A0" };
  const refereeList = referees.filter(r => r.role === "referee");
  const operatorList = referees.filter(r => r.role === "var_operator");

  if (loading) return <div className="flex-1 flex items-center justify-center bg-[#050505]"><div className="text-sm font-mono text-[#00E5FF] animate-pulse">LOADING MATCHES...</div></div>;

  return (
    <div className="flex-1 min-w-0 p-6 space-y-6 bg-[#050505]" data-testid="matches-page">
      <div className="flex items-center justify-between">
        <div><h1 className="text-3xl font-heading font-black text-white tracking-tight">MATCH MANAGEMENT</h1><p className="text-sm font-body text-gray-400 mt-1">Assign referees and VAR operators to matches</p></div>
        <Dialog open={showCreate} onOpenChange={setShowCreate}>
          <DialogTrigger asChild><Button className="bg-white text-black hover:bg-gray-200 rounded-none font-semibold" data-testid="create-match-button"><Trophy className="w-4 h-4 mr-2" />NEW MATCH</Button></DialogTrigger>
          <DialogContent className="bg-[#121212] border-white/10 text-white max-w-lg">
            <DialogHeader><DialogTitle className="font-heading">Create Match</DialogTitle><DialogDescription className="text-gray-400">Add a new match to the system</DialogDescription></DialogHeader>
            <div className="space-y-4 py-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2"><Label className="text-gray-300">Home Team</Label><Input value={newMatch.team_home} onChange={e => setNewMatch({...newMatch, team_home: e.target.value})} className="bg-[#050505] border-white/10 text-white rounded-none" data-testid="match-home-input" /></div>
                <div className="space-y-2"><Label className="text-gray-300">Away Team</Label><Input value={newMatch.team_away} onChange={e => setNewMatch({...newMatch, team_away: e.target.value})} className="bg-[#050505] border-white/10 text-white rounded-none" data-testid="match-away-input" /></div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2"><Label className="text-gray-300">Date</Label><Input type="date" value={newMatch.date} onChange={e => setNewMatch({...newMatch, date: e.target.value})} className="bg-[#050505] border-white/10 text-white rounded-none" /></div>
                <div className="space-y-2"><Label className="text-gray-300">Competition</Label><Input value={newMatch.competition} onChange={e => setNewMatch({...newMatch, competition: e.target.value})} className="bg-[#050505] border-white/10 text-white rounded-none" /></div>
              </div>
              <div className="space-y-2"><Label className="text-gray-300">Stadium</Label><Input value={newMatch.stadium} onChange={e => setNewMatch({...newMatch, stadium: e.target.value})} className="bg-[#050505] border-white/10 text-white rounded-none" /></div>
            </div>
            <DialogFooter>
              <Button variant="ghost" onClick={() => setShowCreate(false)} className="text-gray-400 hover:text-white">Cancel</Button>
              <Button onClick={handleCreate} className="bg-[#00E5FF] text-black hover:bg-[#00E5FF]/80 rounded-none" data-testid="submit-match-button">CREATE</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid gap-4">
        {matches.map(match => (
          <Card key={match.id} className="bg-[#121212] border-white/10 rounded-none hover:border-white/30 transition-colors">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-2">
                    <span className="text-lg font-heading font-bold text-white">{match.team_home}</span>
                    <span className="text-xs font-mono text-gray-400">VS</span>
                    <span className="text-lg font-heading font-bold text-white">{match.team_away}</span>
                    <span className="text-xs font-mono px-2 py-0.5 rounded-full border" style={{ color: statusColors[match.status], borderColor: statusColors[match.status] + '50', backgroundColor: statusColors[match.status] + '15' }}>{match.status?.toUpperCase()}</span>
                  </div>
                  <div className="flex items-center gap-4 text-xs text-gray-400">
                    {match.competition && <span>{match.competition}</span>}
                    {match.date && <span><Calendar className="w-3 h-3 inline mr-1" />{match.date}</span>}
                    {match.stadium && <span>{match.stadium}</span>}
                  </div>
                  <div className="flex items-center gap-4 mt-2 text-xs">
                    <span className="text-gray-400">Referee: <span className="text-white">{match.referee_name || "Unassigned"}</span></span>
                    <span className="text-gray-400">VAR Op: <span className="text-white">{match.var_operator_name || "Unassigned"}</span></span>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Select value={match.status} onValueChange={v => handleStatusChange(match.id, v)}>
                    <SelectTrigger className="w-32 bg-[#050505] border-white/10 text-white rounded-none text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent className="bg-[#121212] border-white/10">
                      <SelectItem value="scheduled" className="text-white">Scheduled</SelectItem>
                      <SelectItem value="live" className="text-white">Live</SelectItem>
                      <SelectItem value="completed" className="text-white">Completed</SelectItem>
                    </SelectContent>
                  </Select>
                  <Dialog open={assignDialog.open && assignDialog.matchId === match.id} onOpenChange={open => setAssignDialog(open ? { open: true, matchId: match.id, match } : { open: false, matchId: null, match: null })}>
                    <DialogTrigger asChild><Button size="sm" className="bg-[#00E5FF]/10 text-[#00E5FF] border border-[#00E5FF]/20 hover:bg-[#00E5FF]/20 rounded-none" data-testid={`assign-match-${match.id}`}><Users className="w-3 h-3 mr-1" />ASSIGN</Button></DialogTrigger>
                    <DialogContent className="bg-[#121212] border-white/10 text-white max-w-md">
                      <DialogHeader><DialogTitle className="font-heading">Assign Officials</DialogTitle><DialogDescription className="text-gray-400">{match.team_home} vs {match.team_away}</DialogDescription></DialogHeader>
                      <AssignForm referees={refereeList} operators={operatorList} match={match} onAssign={handleAssign} />
                    </DialogContent>
                  </Dialog>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
        {matches.length === 0 && <div className="text-center py-12"><Trophy className="w-12 h-12 text-gray-600 mx-auto mb-2" /><p className="text-gray-400">No matches found</p></div>}
      </div>
    </div>
  );
};

const AssignForm = ({ referees, operators, match, onAssign }) => {
  const [refId, setRefId] = useState(match.referee_id || "none");
  const [opId, setOpId] = useState(match.var_operator_id || "none");
  return (
    <div className="space-y-4 py-4">
      <div className="space-y-2">
        <Label className="text-gray-300">Referee</Label>
        <Select value={refId} onValueChange={setRefId}>
          <SelectTrigger className="bg-[#050505] border-white/10 text-white rounded-none" data-testid="assign-referee-select"><SelectValue /></SelectTrigger>
          <SelectContent className="bg-[#121212] border-white/10">
            <SelectItem value="none" className="text-white">Unassigned</SelectItem>
            {referees.map(r => <SelectItem key={r.id} value={r.id} className="text-white">{r.name}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-2">
        <Label className="text-gray-300">VAR Operator</Label>
        <Select value={opId} onValueChange={setOpId}>
          <SelectTrigger className="bg-[#050505] border-white/10 text-white rounded-none" data-testid="assign-operator-select"><SelectValue /></SelectTrigger>
          <SelectContent className="bg-[#121212] border-white/10">
            <SelectItem value="none" className="text-white">Unassigned</SelectItem>
            {operators.map(o => <SelectItem key={o.id} value={o.id} className="text-white">{o.name}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
      <Button onClick={() => onAssign(match.id, refId === "none" ? null : refId, opId === "none" ? null : opId)} className="w-full bg-[#00E5FF] text-black hover:bg-[#00E5FF]/80 rounded-none" data-testid="confirm-assignment-button">CONFIRM ASSIGNMENT</Button>
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

  const COLORS = ['#00E5FF', '#00FF66', '#FFB800', '#FF3333', '#A855F7', '#F97316'];

  if (loading) return <div className="flex-1 flex items-center justify-center bg-[#050505]"><div className="text-sm font-mono text-[#00E5FF] animate-pulse">LOADING FEEDBACK...</div></div>;

  const typeData = stats?.by_incident_type ? Object.entries(stats.by_incident_type).map(([name, data]) => ({ name, accuracy: data.accuracy, total: data.total, correct: data.correct })) : [];

  return (
    <div className="flex-1 min-w-0 p-6 space-y-6 bg-[#050505]" data-testid="feedback-page">
      <div><h1 className="text-3xl font-heading font-black text-white tracking-tight">AI FEEDBACK LOOP</h1><p className="text-sm font-body text-gray-400 mt-1">OCTON learning from operator corrections - Dr Finnegan's self-improving AI</p></div>

      {/* Overview */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="bg-[#121212] border-white/10 rounded-none"><CardContent className="p-4"><p className="text-xs font-mono uppercase tracking-[0.2em] text-gray-400">TOTAL FEEDBACK</p><p className="text-3xl font-mono font-medium text-white mt-1">{stats?.total_feedback || 0}</p></CardContent></Card>
        <Card className="bg-[#121212] border-white/10 rounded-none"><CardContent className="p-4"><p className="text-xs font-mono uppercase tracking-[0.2em] text-gray-400">AI ACCURACY</p><p className="text-3xl font-mono font-medium text-[#00FF66] mt-1">{stats?.overall_accuracy || 0}%</p></CardContent></Card>
        <Card className="bg-[#121212] border-white/10 rounded-none"><CardContent className="p-4"><p className="text-xs font-mono uppercase tracking-[0.2em] text-gray-400">CORRECT</p><p className="text-3xl font-mono font-medium text-[#00E5FF] mt-1">{stats?.correct || 0}</p></CardContent></Card>
        <Card className="bg-[#121212] border-white/10 rounded-none"><CardContent className="p-4"><p className="text-xs font-mono uppercase tracking-[0.2em] text-gray-400">CORRECTIONS</p><p className="text-3xl font-mono font-medium text-[#FF3333] mt-1">{stats?.incorrect || 0}</p></CardContent></Card>
      </div>

      {/* Confidence Calibration */}
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

      {/* Per-Type Accuracy */}
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

      {/* Recent Feedback */}
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
              <Route path="/*" element={
                <ProtectedRoute>
                  <div className="flex">
                    <Sidebar />
                    <Routes>
                      <Route path="/" element={<LiveVARPage />} />
                      <Route path="/history" element={<HistoryPage />} />
                      <Route path="/matches" element={<ProtectedRoute roles={["admin"]}><MatchesPage /></ProtectedRoute>} />
                      <Route path="/training" element={<ProtectedRoute roles={["admin"]}><TrainingLibraryPage /></ProtectedRoute>} />
                      <Route path="/analytics" element={<AnalyticsPage />} />
                      <Route path="/feedback" element={<ProtectedRoute roles={["admin", "var_operator"]}><FeedbackPage /></ProtectedRoute>} />
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
