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
  Pause, SkipBack, SkipForward, ChevronLeft, ChevronRight, Maximize2, Volume2
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
          <div className="flex items-center justify-center gap-3">
            <div className="w-12 h-12 rounded-none bg-[#00E5FF] flex items-center justify-center">
              <Shield className="w-7 h-7 text-black" />
            </div>
          </div>
          <div>
            <CardTitle className="text-2xl font-heading font-black text-white tracking-tight">OCTON VAR</CardTitle>
            <p className="text-xs font-mono text-[#00E5FF] tracking-[0.15em] mt-1">DR FINNEGAN'S FORENSIC AI</p>
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
          <div className="flex items-center justify-center gap-3">
            <div className="w-12 h-12 rounded-none bg-[#00E5FF] flex items-center justify-center">
              <Shield className="w-7 h-7 text-black" />
            </div>
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
      <div className="p-5 border-b border-white/[0.06]">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 bg-[#00E5FF] flex items-center justify-center">
            <Shield className="w-5 h-5 text-black" />
          </div>
          <div>
            <h1 className="font-heading font-black text-white text-base tracking-tighter">OCTON VAR</h1>
            <p className="text-[8px] font-mono text-[#00E5FF]/60 tracking-[0.15em]">DR FINNEGAN'S FORENSIC AI</p>
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
const ConfidenceScore = ({ score, size = "default" }) => {
  const getColor = (s) => s >= 90 ? "#00FF88" : s >= 70 ? "#00E5FF" : s >= 50 ? "#FFB800" : "#FF2A2A";
  const getGlow = (s) => s >= 90 ? "glow-text-green" : s >= 70 ? "glow-text-cyan" : "";
  const sizes = { small: "text-2xl", default: "text-5xl", large: "text-6xl" };
  return (
    <div className="flex flex-col items-center" data-testid="ai-confidence-score">
      <span className="text-[10px] font-mono uppercase tracking-[0.25em] text-gray-500 mb-2">FINAL CONFIDENCE</span>
      <div className="flex items-baseline gap-0.5">
        <span className={`font-mono font-bold tracking-tighter ${sizes[size]} ${getGlow(score)}`} style={{ color: getColor(score) }}>{score?.toFixed(1)}</span>
        <span className="text-lg font-mono" style={{ color: getColor(score), opacity: 0.5 }}>%</span>
      </div>
    </div>
  );
};

const IncidentBadge = ({ type }) => {
  const c = incidentTypeConfig[type] || incidentTypeConfig.other;
  return <span className={`${c.color} border rounded-full px-2 py-0.5 text-xs font-mono uppercase`} data-testid="incident-classification-badge">{c.label}</span>;
};

const DecisionBadge = ({ status }) => {
  const c = decisionStatusConfig[status] || decisionStatusConfig.pending;
  const Icon = c.icon;
  return <span className={`${c.color} border rounded-none px-2 py-1 text-xs font-mono uppercase flex items-center gap-1`}><Icon className="w-3 h-3" />{c.label}</span>;
};

// ── Video Stage with Match Replay Scrubber ────────────────
const VideoStage = ({ incident, onAnalyze, previewImage }) => {
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentFrame, setCurrentFrame] = useState(1847);
  const [totalFrames] = useState(3200);
  const [playbackSpeed, setPlaybackSpeed] = useState(1);
  const [matchTime, setMatchTime] = useState({ min: 67, sec: 12, ms: 450 });
  const [scrubberHover, setScrubberHover] = useState(null);
  const scrubberRef = useRef(null);
  const imgSrc = previewImage || (incident?.has_image && incident?.storage_path ? `${API}/files/${incident.storage_path}` : null);

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
    <div className="relative border border-white/[0.08] bg-black overflow-hidden" data-testid="video-player-container">
      <div className="aspect-video relative">
        {imgSrc ? <img src={imgSrc} alt="Incident" className="w-full h-full object-cover" /> : <img src="https://images.pexels.com/photos/12201296/pexels-photo-12201296.jpeg" alt="Stadium" className="w-full h-full object-cover opacity-40" />}
        <div className="absolute inset-0 grid-overlay opacity-50" />
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

      {/* MATCH REPLAY SCRUBBER */}
      <div className="bg-[#050505] border-t border-white/[0.06]">
        <div className="px-3 pt-2 pb-1">
          <div ref={scrubberRef} className="relative h-3 bg-white/[0.04] cursor-pointer group" onClick={handleScrub}
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
            <Button variant="ghost" size="sm" className="text-gray-500 hover:text-white h-7 w-7 p-0" onClick={() => stepFrame(-10)} data-testid="step-back-10" title="-10 frames"><SkipBack className="w-3.5 h-3.5" /></Button>
            <Button variant="ghost" size="sm" className="text-gray-500 hover:text-white h-7 w-7 p-0" onClick={() => stepFrame(-1)} data-testid="step-back-1" title="-1 frame"><ChevronLeft className="w-3.5 h-3.5" /></Button>
            <Button variant="ghost" size="sm" className="text-white hover:text-[#00E5FF] h-8 w-8 p-0 border border-white/10 hover:border-[#00E5FF]/40 mx-0.5 transition-all" onClick={() => setIsPlaying(!isPlaying)} data-testid="play-pause-button">
              {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4 ml-0.5" />}
            </Button>
            <Button variant="ghost" size="sm" className="text-gray-500 hover:text-white h-7 w-7 p-0" onClick={() => stepFrame(1)} data-testid="step-forward-1" title="+1 frame"><ChevronRight className="w-3.5 h-3.5" /></Button>
            <Button variant="ghost" size="sm" className="text-gray-500 hover:text-white h-7 w-7 p-0" onClick={() => stepFrame(10)} data-testid="step-forward-10" title="+10 frames"><SkipForward className="w-3.5 h-3.5" /></Button>
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
  const [analytics, setAnalytics] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showNewIncident, setShowNewIncident] = useState(false);
  const [newIncident, setNewIncident] = useState({ incident_type: "foul", description: "", timestamp_in_match: "", team_involved: "", player_involved: "", image_base64: null });
  const [previewImage, setPreviewImage] = useState(null);
  const [submitting, setSubmitting] = useState(false);

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

  const handleCreateIncident = async () => {
    if (!newIncident.description) { toast.error("Provide a description"); return; }
    setSubmitting(true);
    try {
      const res = await axios.post(`${API}/incidents`, newIncident);
      toast.success("OCTON analysis complete!");
      setSelectedIncident(res.data);
      setShowNewIncident(false);
      setNewIncident({ incident_type: "foul", description: "", timestamp_in_match: "", team_involved: "", player_involved: "", image_base64: null });
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
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <h1 className="text-4xl font-heading font-black text-white tracking-tighter uppercase">LIVE VAR</h1>
            <div className="h-5 w-[1px] bg-white/10" />
            <span className="text-xs font-mono text-[#00E5FF]/60 tracking-[0.2em]">DR FINNEGAN</span>
          </div>
          <p className="text-[11px] font-mono text-gray-500 tracking-wide">OCTON Neocortex forensic incident analysis</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 px-3 py-1.5 border border-white/[0.08] bg-[#0A0A0A]">
            {wsConnected ? <Wifi className="w-3 h-3 text-[#00FF88] glow-green" /> : <WifiOff className="w-3 h-3 text-[#FF2A2A]" />}
            <span className="text-[10px] font-mono tracking-wider" style={{ color: wsConnected ? '#00FF88' : '#FF2A2A' }}>{wsConnected ? "LIVE SYNC" : "OFFLINE"}</span>
          </div>
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
              </div>
              <DialogFooter>
                <Button variant="ghost" onClick={() => { setShowNewIncident(false); setPreviewImage(null); }} className="text-gray-400 hover:text-white">Cancel</Button>
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
          { label: "TOTAL INCIDENTS", value: analytics?.total_incidents || 0, icon: AlertTriangle, color: "#FFB800" },
          { label: "AVG CONFIDENCE", value: `${analytics?.average_confidence_score?.toFixed(1) || 0}%`, icon: Brain, color: "#00E5FF" },
          { label: "AVG DECISION TIME", value: `${analytics?.average_decision_time_seconds?.toFixed(1) || 0}s`, icon: Clock, color: "#00FF88" },
          { label: "ACCURACY RATE", value: `${analytics?.decision_accuracy_rate?.toFixed(1) || 0}%`, icon: Target, color: "#00FF88" },
        ].map(({ label, value, icon: Icon, color }) => (
          <div key={label} className="bg-[#0A0A0A] p-4 relative">
            <div className="absolute top-0 left-0 w-8 h-[1px]" style={{ backgroundColor: color, opacity: 0.5 }} />
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[10px] font-mono uppercase tracking-[0.2em] text-gray-500">{label}</p>
                <p className="text-2xl font-mono font-bold mt-1" style={{ color }}>{value}</p>
              </div>
              <Icon className="w-6 h-6 opacity-30" style={{ color }} />
            </div>
          </div>
        ))}
      </div>

      {/* Main Grid */}
      <div className="grid grid-cols-1 md:grid-cols-12 gap-6">
        <div className="col-span-1 md:col-span-8 lg:col-span-9 space-y-4">
          <VideoStage incident={selectedIncident} onAnalyze={handleReanalyze} />
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
            <div className="border border-white/[0.08] bg-[#0A0A0A] relative">
              <div className="absolute top-0 left-0 w-full h-[1px] bg-gradient-to-r from-[#00E5FF]/40 via-[#00E5FF]/10 to-transparent" />
              <div className="p-4">
                <div className="flex items-center justify-between mb-4">
                  <span className="text-[10px] font-heading font-bold uppercase tracking-[0.2em] text-[#00E5FF]">OCTON ANALYSIS</span>
                  <Button variant="ghost" size="sm" onClick={handleReanalyze} className="text-[#00E5FF] hover:text-[#00E5FF]/80 h-7 w-7 p-0" data-testid="reanalyze-button"><RefreshCw className="w-3.5 h-3.5" /></Button>
                </div>
                <div className="space-y-4">
                  <ConfidenceScore score={analysis.final_confidence || analysis.confidence_score || 0} />
                  <div className="h-[1px] bg-white/[0.06]" />
                  <div><p className="text-[10px] font-mono uppercase tracking-[0.2em] text-gray-500 mb-1.5">DECISION</p><p className="text-sm font-body text-white leading-relaxed">{analysis.suggested_decision}</p></div>
                  <div><p className="text-[10px] font-mono uppercase tracking-[0.2em] text-gray-500 mb-1.5">REASONING</p><p className="text-xs font-body text-gray-400 leading-relaxed">{analysis.reasoning}</p></div>
                  {analysis.neo_cortex_notes && <div><p className="text-[10px] font-mono uppercase tracking-[0.2em] text-gray-500 mb-1.5">NEO CORTEX</p><p className="text-[11px] font-body text-[#00E5FF]/60 italic">{analysis.neo_cortex_notes}</p></div>}
                  <div><p className="text-[10px] font-mono uppercase tracking-[0.2em] text-gray-500 mb-2">KEY FACTORS</p>
                    <div className="flex flex-wrap gap-1">{analysis.key_factors?.map((f, i) => <span key={i} className="text-[10px] bg-white/[0.04] text-gray-400 px-2 py-1 border border-white/[0.06] font-mono">{f}</span>)}</div>
                  </div>
                  <div className="flex items-center justify-between text-[10px] font-mono text-gray-600 pt-2 border-t border-white/[0.06]">
                    <span>HISTORY: {analysis.similar_historical_cases}</span>
                    <span>{analysis.total_processing_time_ms}ms</span>
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
                    <Route path="/analytics" element={<AnalyticsPage />} />
                    <Route path="/feedback" element={<ProtectedRoute roles={["admin", "var_operator"]}><FeedbackPage /></ProtectedRoute>} />
                    <Route path="/settings" element={<SettingsPage />} />
                  </Routes>
                </div>
              </ProtectedRoute>
            } />
          </Routes>
        </AuthProvider>
      </BrowserRouter>
      <Toaster position="top-right" toastOptions={{ style: { background: '#121212', color: '#fff', border: '1px solid rgba(255,255,255,0.1)' } }} />
    </div>
  );
}

export default App;
