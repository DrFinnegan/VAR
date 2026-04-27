/**
 * Matches Page (Admin)
 * Lets admins create matches, change status (scheduled/live/completed),
 * and assign a referee + VAR operator to each match.
 */
import { useCallback, useEffect, useState } from "react";
import axios from "axios";
import { toast } from "sonner";
import { Trophy, Users, Calendar } from "lucide-react";
import { Button } from "../components/ui/button";
import { Card, CardContent } from "../components/ui/card";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogDescription } from "../components/ui/dialog";
import { API } from "../lib/api";

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

export const MatchesPage = () => {
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

export default MatchesPage;
