import { useState, useEffect, useCallback } from "react";
import "@/App.css";
import { BrowserRouter, Routes, Route, NavLink, useNavigate, useLocation } from "react-router-dom";
import axios from "axios";
import { Toaster, toast } from "sonner";
import { 
  Video, 
  History, 
  BarChart3, 
  Settings, 
  AlertTriangle, 
  CheckCircle2,
  XCircle,
  Clock,
  RefreshCw,
  Upload,
  Play,
  ChevronRight,
  Eye,
  Brain,
  Users,
  Trophy,
  Calendar,
  Shield,
  Target,
  TrendingUp,
  FileText,
  Zap,
  CircleDot,
  Layers
} from "lucide-react";
import { Button } from "./components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "./components/ui/card";
import { Badge } from "./components/ui/badge";
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

// Incident type styling
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

// Sidebar Navigation
const Sidebar = () => {
  const location = useLocation();
  
  const navItems = [
    { path: "/", icon: Video, label: "Live VAR" },
    { path: "/history", icon: History, label: "Incident History" },
    { path: "/analytics", icon: BarChart3, label: "Referee Analytics" },
    { path: "/settings", icon: Settings, label: "Settings" },
  ];

  return (
    <div className="w-64 flex-shrink-0 border-r border-white/10 h-screen sticky top-0 bg-[#050505] flex flex-col">
      {/* Logo */}
      <div className="p-6 border-b border-white/10">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-sm bg-[#00E5FF] flex items-center justify-center">
            <Shield className="w-6 h-6 text-black" />
          </div>
          <div>
            <h1 className="font-heading font-black text-white text-lg tracking-tight">VAR AUDIT</h1>
            <p className="text-xs font-mono text-gray-400 tracking-[0.1em]">FORENSIC AI</p>
          </div>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 p-4 space-y-1" data-testid="sidebar-navigation">
        {navItems.map(({ path, icon: Icon, label }) => {
          const isActive = location.pathname === path;
          return (
            <NavLink
              key={path}
              to={path}
              data-testid={`nav-${label.toLowerCase().replace(/\s/g, '-')}`}
              className={`flex items-center gap-3 px-4 py-3 rounded-sm transition-all duration-200 ${
                isActive
                  ? "bg-white/10 text-white border-l-2 border-[#00E5FF]"
                  : "text-gray-400 hover:text-white hover:bg-white/5"
              }`}
            >
              <Icon className="w-5 h-5" />
              <span className="font-body text-sm">{label}</span>
            </NavLink>
          );
        })}
      </nav>

      {/* Status Indicator */}
      <div className="p-4 border-t border-white/10">
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-[#00FF66] animate-pulse" />
          <span className="text-xs font-mono text-gray-400">SYSTEM ONLINE</span>
        </div>
      </div>
    </div>
  );
};

// Confidence Score Display
const ConfidenceScore = ({ score, size = "default" }) => {
  const getColor = (s) => {
    if (s >= 90) return "#00FF66";
    if (s >= 70) return "#00E5FF";
    if (s >= 50) return "#FFB800";
    return "#FF3333";
  };

  const sizeClasses = {
    small: "text-2xl",
    default: "text-4xl",
    large: "text-6xl"
  };

  return (
    <div className="flex flex-col items-center" data-testid="ai-confidence-score">
      <span className="text-xs font-mono uppercase tracking-[0.2em] text-gray-400 mb-1">AI CONFIDENCE</span>
      <span 
        className={`font-mono font-medium tracking-tighter ${sizeClasses[size]}`}
        style={{ color: getColor(score) }}
      >
        {score.toFixed(1)}%
      </span>
    </div>
  );
};

// Video Stage Component
const VideoStage = ({ incident, onAnalyze }) => {
  const [isPlaying, setIsPlaying] = useState(false);
  
  return (
    <div className="relative border border-white/10 bg-[#0A0A0A] rounded-sm overflow-hidden" data-testid="video-player-container">
      {/* Video/Image Display */}
      <div className="aspect-video relative">
        {incident?.image_base64 ? (
          <img 
            src={`data:image/jpeg;base64,${incident.image_base64}`}
            alt="Incident frame"
            className="w-full h-full object-cover"
          />
        ) : (
          <img 
            src="https://images.pexels.com/photos/33911793/pexels-photo-33911793.jpeg?auto=compress&cs=tinysrgb&dpr=2&h=650&w=940"
            alt="Stadium view"
            className="w-full h-full object-cover opacity-50"
          />
        )}
        
        {/* AI Tracking Overlay */}
        {incident?.ai_analysis && (
          <div className="absolute inset-0 pointer-events-none">
            {/* Scanning animation */}
            <div className="absolute top-0 left-0 right-0 h-0.5 bg-gradient-to-r from-transparent via-[#00E5FF] to-transparent animate-pulse" />
            
            {/* AI Detection Box */}
            <div className="absolute top-1/3 left-1/3 w-1/3 h-1/3 border-2 border-[#00E5FF] bg-[#00E5FF]/10 rounded-sm">
              <div className="absolute -top-6 left-0 px-2 py-1 bg-[#00E5FF] text-black text-xs font-mono">
                ANALYSIS ZONE
              </div>
            </div>
          </div>
        )}
        
        {/* Playback indicator */}
        <div className="absolute top-4 left-4 flex items-center gap-2">
          <div className={`w-2 h-2 rounded-full ${isPlaying ? 'bg-[#FF3333]' : 'bg-[#00FF66]'}`} />
          <span className="text-xs font-mono text-white uppercase">
            {isPlaying ? 'LIVE' : 'PLAYBACK'}
          </span>
        </div>
        
        {/* Timecode */}
        {incident?.timestamp_in_match && (
          <div className="absolute top-4 right-4 px-2 py-1 bg-black/80 text-white text-sm font-mono">
            {incident.timestamp_in_match}
          </div>
        )}
      </div>
      
      {/* Video Controls */}
      <div className="p-4 border-t border-white/10 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Button 
            variant="ghost" 
            size="sm" 
            className="text-gray-400 hover:text-white"
            onClick={() => setIsPlaying(!isPlaying)}
            data-testid="play-pause-button"
          >
            <Play className="w-4 h-4" />
          </Button>
          <span className="text-xs font-mono text-gray-400">FRAME: 1847/3200</span>
        </div>
        {onAnalyze && (
          <Button 
            size="sm" 
            className="bg-[#00E5FF] text-black hover:bg-[#00E5FF]/80 rounded-sm font-semibold"
            onClick={onAnalyze}
            data-testid="analyze-frame-button"
          >
            <Brain className="w-4 h-4 mr-2" />
            ANALYZE FRAME
          </Button>
        )}
      </div>
    </div>
  );
};

// Incident Badge Component
const IncidentBadge = ({ type }) => {
  const config = incidentTypeConfig[type] || incidentTypeConfig.other;
  return (
    <span 
      className={`${config.color} border rounded-full px-2 py-0.5 text-xs font-mono uppercase`}
      data-testid="incident-classification-badge"
    >
      {config.label}
    </span>
  );
};

// Decision Status Badge
const DecisionBadge = ({ status }) => {
  const config = decisionStatusConfig[status] || decisionStatusConfig.pending;
  const Icon = config.icon;
  return (
    <span className={`${config.color} border rounded-sm px-2 py-1 text-xs font-mono uppercase flex items-center gap-1`}>
      <Icon className="w-3 h-3" />
      {config.label}
    </span>
  );
};

// Live VAR Dashboard
const LiveVARPage = () => {
  const [incidents, setIncidents] = useState([]);
  const [selectedIncident, setSelectedIncident] = useState(null);
  const [analytics, setAnalytics] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showNewIncident, setShowNewIncident] = useState(false);
  const [newIncident, setNewIncident] = useState({
    incident_type: "foul",
    description: "",
    timestamp_in_match: "",
    team_involved: "",
    player_involved: "",
  });
  const [submitting, setSubmitting] = useState(false);

  const fetchData = useCallback(async () => {
    try {
      const [incidentsRes, analyticsRes] = await Promise.all([
        axios.get(`${API}/incidents?limit=20`),
        axios.get(`${API}/analytics/overview`)
      ]);
      setIncidents(incidentsRes.data);
      setAnalytics(analyticsRes.data);
      if (incidentsRes.data.length > 0 && !selectedIncident) {
        setSelectedIncident(incidentsRes.data[0]);
      }
    } catch (error) {
      console.error("Error fetching data:", error);
      toast.error("Failed to load data");
    } finally {
      setLoading(false);
    }
  }, [selectedIncident]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleReanalyze = async () => {
    if (!selectedIncident) return;
    try {
      toast.loading("Re-analyzing incident...");
      const res = await axios.post(`${API}/incidents/${selectedIncident.id}/reanalyze`);
      setSelectedIncident(res.data);
      toast.dismiss();
      toast.success("Analysis complete!");
      fetchData();
    } catch (error) {
      toast.dismiss();
      toast.error("Analysis failed");
    }
  };

  const handleCreateIncident = async () => {
    if (!newIncident.description) {
      toast.error("Please provide a description");
      return;
    }
    setSubmitting(true);
    try {
      const res = await axios.post(`${API}/incidents`, newIncident);
      toast.success("Incident created and analyzed!");
      setSelectedIncident(res.data);
      setShowNewIncident(false);
      setNewIncident({
        incident_type: "foul",
        description: "",
        timestamp_in_match: "",
        team_involved: "",
        player_involved: "",
      });
      fetchData();
    } catch (error) {
      toast.error("Failed to create incident");
    } finally {
      setSubmitting(false);
    }
  };

  const handleDecision = async (status, decision) => {
    if (!selectedIncident) return;
    try {
      const res = await axios.put(`${API}/incidents/${selectedIncident.id}/decision`, {
        decision_status: status,
        final_decision: decision,
        decided_by: "VAR_Operator_1"
      });
      setSelectedIncident(res.data);
      toast.success("Decision recorded!");
      fetchData();
    } catch (error) {
      toast.error("Failed to record decision");
    }
  };

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center bg-[#050505]">
        <div className="text-center">
          <div className="text-sm font-mono text-[#00E5FF] animate-pulse">INITIALIZING VAR SYSTEM...</div>
          <Progress value={65} className="w-64 mt-4" />
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 min-w-0 p-6 space-y-6 bg-[#050505]" data-testid="live-var-dashboard">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-heading font-black text-white tracking-tight">LIVE VAR ANALYSIS</h1>
          <p className="text-sm font-body text-gray-400 mt-1">Real-time incident analysis and decision support</p>
        </div>
        <Dialog open={showNewIncident} onOpenChange={setShowNewIncident}>
          <DialogTrigger asChild>
            <Button className="bg-white text-black hover:bg-gray-200 rounded-sm font-semibold" data-testid="new-incident-button">
              <Upload className="w-4 h-4 mr-2" />
              NEW INCIDENT
            </Button>
          </DialogTrigger>
          <DialogContent className="bg-[#121212] border-white/10 text-white max-w-lg">
            <DialogHeader>
              <DialogTitle className="font-heading text-xl">Report New Incident</DialogTitle>
              <DialogDescription className="text-gray-400">Submit an incident for AI analysis</DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label className="text-gray-300">Incident Type</Label>
                <Select value={newIncident.incident_type} onValueChange={(v) => setNewIncident({...newIncident, incident_type: v})}>
                  <SelectTrigger className="bg-[#050505] border-white/10 text-white rounded-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-[#121212] border-white/10">
                    {Object.entries(incidentTypeConfig).map(([key, val]) => (
                      <SelectItem key={key} value={key} className="text-white hover:bg-white/10">{val.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label className="text-gray-300">Description</Label>
                <Textarea 
                  placeholder="Describe the incident in detail..."
                  value={newIncident.description}
                  onChange={(e) => setNewIncident({...newIncident, description: e.target.value})}
                  className="bg-[#050505] border-white/10 text-white rounded-sm min-h-[100px]"
                  data-testid="incident-description-input"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label className="text-gray-300">Match Time</Label>
                  <Input 
                    placeholder="e.g., 45:30"
                    value={newIncident.timestamp_in_match}
                    onChange={(e) => setNewIncident({...newIncident, timestamp_in_match: e.target.value})}
                    className="bg-[#050505] border-white/10 text-white rounded-sm"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-gray-300">Team</Label>
                  <Input 
                    placeholder="Team name"
                    value={newIncident.team_involved}
                    onChange={(e) => setNewIncident({...newIncident, team_involved: e.target.value})}
                    className="bg-[#050505] border-white/10 text-white rounded-sm"
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label className="text-gray-300">Player Involved</Label>
                <Input 
                  placeholder="Player name"
                  value={newIncident.player_involved}
                  onChange={(e) => setNewIncident({...newIncident, player_involved: e.target.value})}
                  className="bg-[#050505] border-white/10 text-white rounded-sm"
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="ghost" onClick={() => setShowNewIncident(false)} className="text-gray-400 hover:text-white">Cancel</Button>
              <Button 
                onClick={handleCreateIncident} 
                disabled={submitting}
                className="bg-[#00E5FF] text-black hover:bg-[#00E5FF]/80 rounded-sm"
                data-testid="submit-incident-button"
              >
                {submitting ? "ANALYZING..." : "SUBMIT & ANALYZE"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {/* Stats Row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="bg-[#121212] border-white/10 rounded-sm">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-mono uppercase tracking-[0.2em] text-gray-400">TOTAL INCIDENTS</p>
                <p className="text-3xl font-mono font-medium text-white mt-1">{analytics?.total_incidents || 0}</p>
              </div>
              <AlertTriangle className="w-8 h-8 text-[#FFB800]" />
            </div>
          </CardContent>
        </Card>
        <Card className="bg-[#121212] border-white/10 rounded-sm">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-mono uppercase tracking-[0.2em] text-gray-400">AVG CONFIDENCE</p>
                <p className="text-3xl font-mono font-medium text-[#00E5FF] mt-1">{analytics?.average_confidence_score?.toFixed(1) || 0}%</p>
              </div>
              <Brain className="w-8 h-8 text-[#00E5FF]" />
            </div>
          </CardContent>
        </Card>
        <Card className="bg-[#121212] border-white/10 rounded-sm">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-mono uppercase tracking-[0.2em] text-gray-400">AVG DECISION TIME</p>
                <p className="text-3xl font-mono font-medium text-[#00FF66] mt-1">{analytics?.average_decision_time_seconds?.toFixed(1) || 0}s</p>
              </div>
              <Clock className="w-8 h-8 text-[#00FF66]" />
            </div>
          </CardContent>
        </Card>
        <Card className="bg-[#121212] border-white/10 rounded-sm">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-mono uppercase tracking-[0.2em] text-gray-400">ACCURACY RATE</p>
                <p className="text-3xl font-mono font-medium text-[#00FF66] mt-1">{analytics?.decision_accuracy_rate?.toFixed(1) || 0}%</p>
              </div>
              <Target className="w-8 h-8 text-[#00FF66]" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Main Content Grid */}
      <div className="grid grid-cols-1 md:grid-cols-12 gap-6">
        {/* Video Stage - Main Area */}
        <div className="col-span-1 md:col-span-8 lg:col-span-9 space-y-4">
          <VideoStage incident={selectedIncident} onAnalyze={handleReanalyze} />
          
          {/* Timeline */}
          <div className="border border-white/10 bg-[#0A0A0A] rounded-sm p-4" data-testid="timeline-scrubber">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-mono text-gray-400 uppercase">INCIDENT TIMELINE</span>
              <span className="text-xs font-mono text-gray-400">{incidents.length} EVENTS</span>
            </div>
            <div className="h-2 bg-white/10 rounded-full relative">
              {incidents.slice(0, 10).map((inc, i) => {
                const statusColor = inc.decision_status === 'confirmed' ? '#00FF66' : 
                                   inc.decision_status === 'overturned' ? '#FF3333' : '#FFB800';
                return (
                  <div
                    key={inc.id}
                    className="absolute w-3 h-3 rounded-full -top-0.5 cursor-pointer hover:scale-125 transition-transform"
                    style={{ 
                      left: `${(i + 1) * 9}%`,
                      backgroundColor: statusColor
                    }}
                    onClick={() => setSelectedIncident(inc)}
                    title={inc.incident_type}
                  />
                );
              })}
              <div className="absolute w-full h-full bg-[#00E5FF]/30 rounded-full" style={{ width: '45%' }} />
            </div>
          </div>
        </div>

        {/* Analysis Sidebar */}
        <div className="col-span-1 md:col-span-4 lg:col-span-3 space-y-4">
          {/* AI Analysis Card */}
          {selectedIncident && (
            <Card className="bg-[#121212] border-white/10 rounded-sm">
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm font-mono uppercase text-gray-400">AI ANALYSIS</CardTitle>
                  <Button 
                    variant="ghost" 
                    size="sm" 
                    onClick={handleReanalyze}
                    className="text-[#00E5FF] hover:text-[#00E5FF]/80"
                    data-testid="reanalyze-button"
                  >
                    <RefreshCw className="w-4 h-4" />
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                {selectedIncident.ai_analysis ? (
                  <>
                    <ConfidenceScore score={selectedIncident.ai_analysis.confidence_score} />
                    
                    <Separator className="bg-white/10" />
                    
                    <div>
                      <p className="text-xs font-mono uppercase tracking-[0.2em] text-gray-400 mb-2">SUGGESTED DECISION</p>
                      <p className="text-sm font-body text-white">{selectedIncident.ai_analysis.suggested_decision}</p>
                    </div>
                    
                    <div>
                      <p className="text-xs font-mono uppercase tracking-[0.2em] text-gray-400 mb-2">REASONING</p>
                      <p className="text-sm font-body text-gray-300">{selectedIncident.ai_analysis.reasoning}</p>
                    </div>
                    
                    <div>
                      <p className="text-xs font-mono uppercase tracking-[0.2em] text-gray-400 mb-2">KEY FACTORS</p>
                      <div className="flex flex-wrap gap-2">
                        {selectedIncident.ai_analysis.key_factors?.map((factor, i) => (
                          <span key={i} className="text-xs bg-white/10 text-gray-300 px-2 py-1 rounded-sm">{factor}</span>
                        ))}
                      </div>
                    </div>
                    
                    <div className="flex items-center justify-between text-xs font-mono text-gray-400">
                      <span>SIMILAR CASES: {selectedIncident.ai_analysis.similar_historical_cases}</span>
                      <span>{selectedIncident.ai_analysis.processing_time_ms}ms</span>
                    </div>
                  </>
                ) : (
                  <div className="text-center py-8">
                    <Brain className="w-12 h-12 text-gray-600 mx-auto mb-2" />
                    <p className="text-sm text-gray-400">No analysis available</p>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* Decision Actions */}
          {selectedIncident && selectedIncident.decision_status === 'pending' && (
            <Card className="bg-[#121212] border-white/10 rounded-sm">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-mono uppercase text-gray-400">DECISION</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <Button 
                  className="w-full bg-[#00FF66]/10 text-[#00FF66] border border-[#00FF66]/20 hover:bg-[#00FF66]/20 rounded-sm"
                  onClick={() => handleDecision('confirmed', selectedIncident.ai_analysis?.suggested_decision || 'Decision Confirmed')}
                  data-testid="confirm-decision-button"
                >
                  <CheckCircle2 className="w-4 h-4 mr-2" />
                  CONFIRM
                </Button>
                <Button 
                  className="w-full bg-[#FF3333]/10 text-[#FF3333] border border-[#FF3333]/20 hover:bg-[#FF3333]/20 rounded-sm"
                  onClick={() => handleDecision('overturned', 'Decision Overturned')}
                  data-testid="override-decision-button"
                >
                  <XCircle className="w-4 h-4 mr-2" />
                  OVERTURN
                </Button>
              </CardContent>
            </Card>
          )}

          {/* Current Incident Info */}
          {selectedIncident && (
            <Card className="bg-[#121212] border-white/10 rounded-sm">
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <IncidentBadge type={selectedIncident.incident_type} />
                  <DecisionBadge status={selectedIncident.decision_status} />
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                <p className="text-sm font-body text-gray-300">{selectedIncident.description}</p>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  {selectedIncident.timestamp_in_match && (
                    <div>
                      <span className="font-mono text-gray-400">TIME:</span>
                      <span className="text-white ml-1">{selectedIncident.timestamp_in_match}</span>
                    </div>
                  )}
                  {selectedIncident.team_involved && (
                    <div>
                      <span className="font-mono text-gray-400">TEAM:</span>
                      <span className="text-white ml-1">{selectedIncident.team_involved}</span>
                    </div>
                  )}
                  {selectedIncident.player_involved && (
                    <div className="col-span-2">
                      <span className="font-mono text-gray-400">PLAYER:</span>
                      <span className="text-white ml-1">{selectedIncident.player_involved}</span>
                    </div>
                  )}
                </div>
                {selectedIncident.final_decision && (
                  <div className="pt-2 border-t border-white/10">
                    <span className="text-xs font-mono text-gray-400">FINAL:</span>
                    <p className="text-sm text-white mt-1">{selectedIncident.final_decision}</p>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* Recent Incidents List */}
          <Card className="bg-[#121212] border-white/10 rounded-sm">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-mono uppercase text-gray-400">RECENT INCIDENTS</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <ScrollArea className="h-[200px]">
                {incidents.slice(0, 10).map((inc) => (
                  <div
                    key={inc.id}
                    onClick={() => setSelectedIncident(inc)}
                    className={`px-4 py-3 cursor-pointer border-b border-white/5 hover:bg-white/5 transition-colors ${
                      selectedIncident?.id === inc.id ? 'bg-white/10' : ''
                    }`}
                    data-testid={`incident-item-${inc.id}`}
                  >
                    <div className="flex items-center justify-between">
                      <IncidentBadge type={inc.incident_type} />
                      <span className="text-xs font-mono text-gray-400">{inc.timestamp_in_match || '--:--'}</span>
                    </div>
                    <p className="text-xs text-gray-400 mt-1 truncate">{inc.description}</p>
                  </div>
                ))}
              </ScrollArea>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
};

// Incident History Page
const HistoryPage = () => {
  const [incidents, setIncidents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState({ status: null, type: null });

  useEffect(() => {
    const fetchIncidents = async () => {
      try {
        let url = `${API}/incidents?limit=100`;
        if (filter.status) url += `&status=${filter.status}`;
        if (filter.type) url += `&incident_type=${filter.type}`;
        const res = await axios.get(url);
        setIncidents(res.data);
      } catch (error) {
        toast.error("Failed to load incidents");
      } finally {
        setLoading(false);
      }
    };
    fetchIncidents();
  }, [filter]);

  return (
    <div className="flex-1 min-w-0 p-6 space-y-6 bg-[#050505]" data-testid="incident-history-page">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-heading font-black text-white tracking-tight">INCIDENT HISTORY</h1>
          <p className="text-sm font-body text-gray-400 mt-1">Review past incidents and decisions</p>
        </div>
        <div className="flex gap-2">
          <Select value={filter.status || "all"} onValueChange={(v) => setFilter({...filter, status: v === "all" ? null : v})}>
            <SelectTrigger className="w-40 bg-[#121212] border-white/10 text-white rounded-sm">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent className="bg-[#121212] border-white/10">
              <SelectItem value="all" className="text-white">All Status</SelectItem>
              {Object.keys(decisionStatusConfig).map((key) => (
                <SelectItem key={key} value={key} className="text-white">{decisionStatusConfig[key].label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={filter.type || "all"} onValueChange={(v) => setFilter({...filter, type: v === "all" ? null : v})}>
            <SelectTrigger className="w-40 bg-[#121212] border-white/10 text-white rounded-sm">
              <SelectValue placeholder="Type" />
            </SelectTrigger>
            <SelectContent className="bg-[#121212] border-white/10">
              <SelectItem value="all" className="text-white">All Types</SelectItem>
              {Object.keys(incidentTypeConfig).map((key) => (
                <SelectItem key={key} value={key} className="text-white">{incidentTypeConfig[key].label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-64">
          <div className="text-sm font-mono text-[#00E5FF] animate-pulse">LOADING HISTORY...</div>
        </div>
      ) : (
        <div className="grid gap-4">
          {incidents.map((inc) => (
            <Card key={inc.id} className="bg-[#121212] border-white/10 rounded-sm hover:border-white/30 transition-colors">
              <CardContent className="p-4">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      <IncidentBadge type={inc.incident_type} />
                      <DecisionBadge status={inc.decision_status} />
                      {inc.timestamp_in_match && (
                        <span className="text-xs font-mono text-gray-400">@ {inc.timestamp_in_match}</span>
                      )}
                    </div>
                    <p className="text-sm font-body text-white mb-2">{inc.description}</p>
                    <div className="flex items-center gap-4 text-xs text-gray-400">
                      {inc.team_involved && <span>Team: {inc.team_involved}</span>}
                      {inc.player_involved && <span>Player: {inc.player_involved}</span>}
                    </div>
                    {inc.final_decision && (
                      <div className="mt-2 p-2 bg-white/5 rounded-sm">
                        <span className="text-xs font-mono text-gray-400">FINAL DECISION: </span>
                        <span className="text-sm text-white">{inc.final_decision}</span>
                      </div>
                    )}
                  </div>
                  {inc.ai_analysis && (
                    <div className="ml-4 text-right">
                      <ConfidenceScore score={inc.ai_analysis.confidence_score} size="small" />
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
          {incidents.length === 0 && (
            <div className="text-center py-12">
              <History className="w-12 h-12 text-gray-600 mx-auto mb-2" />
              <p className="text-gray-400">No incidents found</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

// Analytics Page
const AnalyticsPage = () => {
  const [referees, setReferees] = useState([]);
  const [analytics, setAnalytics] = useState(null);
  const [patterns, setPatterns] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [refRes, analyticsRes, patternsRes] = await Promise.all([
          axios.get(`${API}/referees`),
          axios.get(`${API}/analytics/overview`),
          axios.get(`${API}/analytics/patterns`)
        ]);
        setReferees(refRes.data);
        setAnalytics(analyticsRes.data);
        setPatterns(patternsRes.data);
      } catch (error) {
        toast.error("Failed to load analytics");
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, []);

  const CHART_COLORS = ['#00E5FF', '#00FF66', '#FFB800', '#FF3333', '#A855F7', '#F97316'];

  const incidentTypeData = analytics?.incidents_by_type ? 
    Object.entries(analytics.incidents_by_type).map(([name, value]) => ({ name, value })) : [];

  const refereePerformanceData = referees.map(ref => ({
    name: ref.name.split(' ')[1] || ref.name,
    accuracy: ref.total_decisions > 0 ? ((ref.correct_decisions / ref.total_decisions) * 100).toFixed(1) : 0,
    avgTime: ref.average_decision_time_seconds.toFixed(1),
    decisions: ref.total_decisions
  }));

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center bg-[#050505]">
        <div className="text-sm font-mono text-[#00E5FF] animate-pulse">LOADING ANALYTICS...</div>
      </div>
    );
  }

  return (
    <div className="flex-1 min-w-0 p-6 space-y-6 bg-[#050505]" data-testid="analytics-page">
      <div>
        <h1 className="text-3xl font-heading font-black text-white tracking-tight">REFEREE ANALYTICS</h1>
        <p className="text-sm font-body text-gray-400 mt-1">Performance metrics and historical patterns</p>
      </div>

      {/* Overview Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="bg-[#121212] border-white/10 rounded-sm">
          <CardContent className="p-4">
            <p className="text-xs font-mono uppercase tracking-[0.2em] text-gray-400">TOTAL REFEREES</p>
            <p className="text-3xl font-mono font-medium text-white mt-1">{analytics?.total_referees || 0}</p>
          </CardContent>
        </Card>
        <Card className="bg-[#121212] border-white/10 rounded-sm">
          <CardContent className="p-4">
            <p className="text-xs font-mono uppercase tracking-[0.2em] text-gray-400">TOTAL MATCHES</p>
            <p className="text-3xl font-mono font-medium text-white mt-1">{analytics?.total_matches || 0}</p>
          </CardContent>
        </Card>
        <Card className="bg-[#121212] border-white/10 rounded-sm">
          <CardContent className="p-4">
            <p className="text-xs font-mono uppercase tracking-[0.2em] text-gray-400">ACCURACY RATE</p>
            <p className="text-3xl font-mono font-medium text-[#00FF66] mt-1">{analytics?.decision_accuracy_rate?.toFixed(1) || 0}%</p>
          </CardContent>
        </Card>
        <Card className="bg-[#121212] border-white/10 rounded-sm">
          <CardContent className="p-4">
            <p className="text-xs font-mono uppercase tracking-[0.2em] text-gray-400">AVG DECISION TIME</p>
            <p className="text-3xl font-mono font-medium text-[#00E5FF] mt-1">{analytics?.average_decision_time_seconds?.toFixed(1) || 0}s</p>
          </CardContent>
        </Card>
      </div>

      {/* Charts Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Incident Distribution */}
        <Card className="bg-[#121212] border-white/10 rounded-sm">
          <CardHeader>
            <CardTitle className="text-sm font-mono uppercase text-gray-400">INCIDENT DISTRIBUTION</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={incidentTypeData}
                    cx="50%"
                    cy="50%"
                    outerRadius={100}
                    dataKey="value"
                    label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                  >
                    {incidentTypeData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={CHART_COLORS[index % CHART_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip 
                    contentStyle={{ backgroundColor: '#121212', border: '1px solid rgba(255,255,255,0.1)' }}
                    labelStyle={{ color: '#fff' }}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        {/* Referee Performance */}
        <Card className="bg-[#121212] border-white/10 rounded-sm">
          <CardHeader>
            <CardTitle className="text-sm font-mono uppercase text-gray-400">REFEREE ACCURACY</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={refereePerformanceData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" />
                  <XAxis dataKey="name" stroke="#666" fontSize={12} />
                  <YAxis stroke="#666" fontSize={12} />
                  <Tooltip 
                    contentStyle={{ backgroundColor: '#121212', border: '1px solid rgba(255,255,255,0.1)' }}
                    labelStyle={{ color: '#fff' }}
                  />
                  <Bar dataKey="accuracy" fill="#00E5FF" radius={[2, 2, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Referee Table */}
      <Card className="bg-[#121212] border-white/10 rounded-sm">
        <CardHeader>
          <CardTitle className="text-sm font-mono uppercase text-gray-400">REFEREE PERFORMANCE</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-white/10">
                  <th className="text-left py-3 px-4 text-xs font-mono uppercase text-gray-400">Name</th>
                  <th className="text-left py-3 px-4 text-xs font-mono uppercase text-gray-400">Role</th>
                  <th className="text-center py-3 px-4 text-xs font-mono uppercase text-gray-400">Decisions</th>
                  <th className="text-center py-3 px-4 text-xs font-mono uppercase text-gray-400">Correct</th>
                  <th className="text-center py-3 px-4 text-xs font-mono uppercase text-gray-400">Accuracy</th>
                  <th className="text-center py-3 px-4 text-xs font-mono uppercase text-gray-400">Avg Time</th>
                </tr>
              </thead>
              <tbody>
                {referees.map((ref) => {
                  const accuracy = ref.total_decisions > 0 ? ((ref.correct_decisions / ref.total_decisions) * 100).toFixed(1) : 0;
                  return (
                    <tr key={ref.id} className="border-b border-white/5 hover:bg-white/5">
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-full bg-[#00E5FF]/20 flex items-center justify-center">
                            <Users className="w-4 h-4 text-[#00E5FF]" />
                          </div>
                          <span className="text-sm text-white">{ref.name}</span>
                        </div>
                      </td>
                      <td className="py-3 px-4">
                        <span className="text-xs font-mono uppercase text-gray-400">{ref.role.replace('_', ' ')}</span>
                      </td>
                      <td className="py-3 px-4 text-center">
                        <span className="text-sm font-mono text-white">{ref.total_decisions}</span>
                      </td>
                      <td className="py-3 px-4 text-center">
                        <span className="text-sm font-mono text-[#00FF66]">{ref.correct_decisions}</span>
                      </td>
                      <td className="py-3 px-4 text-center">
                        <span className={`text-sm font-mono ${parseFloat(accuracy) >= 90 ? 'text-[#00FF66]' : parseFloat(accuracy) >= 70 ? 'text-[#FFB800]' : 'text-[#FF3333]'}`}>
                          {accuracy}%
                        </span>
                      </td>
                      <td className="py-3 px-4 text-center">
                        <span className="text-sm font-mono text-[#00E5FF]">{ref.average_decision_time_seconds.toFixed(1)}s</span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

// Settings Page
const SettingsPage = () => {
  const [seeding, setSeeding] = useState(false);
  
  const seedDemoData = async () => {
    setSeeding(true);
    try {
      await axios.post(`${API}/seed-demo`);
      toast.success("Demo data seeded successfully!");
    } catch (error) {
      toast.error("Failed to seed data");
    } finally {
      setSeeding(false);
    }
  };

  return (
    <div className="flex-1 min-w-0 p-6 space-y-6 bg-[#050505]" data-testid="settings-page">
      <div>
        <h1 className="text-3xl font-heading font-black text-white tracking-tight">SETTINGS</h1>
        <p className="text-sm font-body text-gray-400 mt-1">System configuration and admin tools</p>
      </div>

      <Tabs defaultValue="general" className="w-full">
        <TabsList className="bg-[#121212] border border-white/10 rounded-sm p-1">
          <TabsTrigger value="general" className="data-[state=active]:bg-white data-[state=active]:text-black rounded-sm">General</TabsTrigger>
          <TabsTrigger value="ai" className="data-[state=active]:bg-white data-[state=active]:text-black rounded-sm">AI Settings</TabsTrigger>
          <TabsTrigger value="admin" className="data-[state=active]:bg-white data-[state=active]:text-black rounded-sm">Admin Tools</TabsTrigger>
        </TabsList>

        <TabsContent value="general" className="mt-6 space-y-6">
          <Card className="bg-[#121212] border-white/10 rounded-sm">
            <CardHeader>
              <CardTitle className="text-white">System Information</CardTitle>
              <CardDescription className="text-gray-400">Current system status and version</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between py-2 border-b border-white/10">
                <span className="text-sm text-gray-400">Version</span>
                <span className="text-sm font-mono text-white">1.0.0</span>
              </div>
              <div className="flex items-center justify-between py-2 border-b border-white/10">
                <span className="text-sm text-gray-400">AI Model</span>
                <span className="text-sm font-mono text-[#00E5FF]">GPT-5.2</span>
              </div>
              <div className="flex items-center justify-between py-2 border-b border-white/10">
                <span className="text-sm text-gray-400">Status</span>
                <span className="flex items-center gap-2 text-sm font-mono text-[#00FF66]">
                  <div className="w-2 h-2 rounded-full bg-[#00FF66]" />
                  ONLINE
                </span>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="ai" className="mt-6 space-y-6">
          <Card className="bg-[#121212] border-white/10 rounded-sm">
            <CardHeader>
              <CardTitle className="text-white">AI Configuration</CardTitle>
              <CardDescription className="text-gray-400">Configure AI analysis parameters</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label className="text-gray-300">Confidence Threshold</Label>
                <Input 
                  type="number" 
                  defaultValue={70}
                  className="bg-[#050505] border-white/10 text-white rounded-sm"
                />
                <p className="text-xs text-gray-400">Minimum confidence score for automated suggestions</p>
              </div>
              <div className="space-y-2">
                <Label className="text-gray-300">Analysis Model</Label>
                <Select defaultValue="gpt-5.2">
                  <SelectTrigger className="bg-[#050505] border-white/10 text-white rounded-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-[#121212] border-white/10">
                    <SelectItem value="gpt-5.2" className="text-white">GPT-5.2 (Recommended)</SelectItem>
                    <SelectItem value="gpt-4o" className="text-white">GPT-4o</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="admin" className="mt-6 space-y-6">
          <Card className="bg-[#121212] border-white/10 rounded-sm">
            <CardHeader>
              <CardTitle className="text-white">Admin Tools</CardTitle>
              <CardDescription className="text-gray-400">Administrative functions and data management</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="p-4 bg-[#050505] rounded-sm border border-white/10">
                <h3 className="text-sm font-medium text-white mb-2">Seed Demo Data</h3>
                <p className="text-xs text-gray-400 mb-4">Populate the system with sample incidents, referees, and matches for testing.</p>
                <Button 
                  onClick={seedDemoData}
                  disabled={seeding}
                  className="bg-[#00E5FF] text-black hover:bg-[#00E5FF]/80 rounded-sm"
                  data-testid="seed-demo-button"
                >
                  {seeding ? "SEEDING..." : "SEED DATA"}
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
};

// Main App
function App() {
  return (
    <div className="App min-h-screen bg-[#050505]">
      <BrowserRouter>
        <div className="flex">
          <Sidebar />
          <Routes>
            <Route path="/" element={<LiveVARPage />} />
            <Route path="/history" element={<HistoryPage />} />
            <Route path="/analytics" element={<AnalyticsPage />} />
            <Route path="/settings" element={<SettingsPage />} />
          </Routes>
        </div>
      </BrowserRouter>
      <Toaster 
        position="top-right" 
        toastOptions={{
          style: {
            background: '#121212',
            color: '#fff',
            border: '1px solid rgba(255,255,255,0.1)',
          },
        }}
      />
    </div>
  );
}

export default App;
