/**
 * Toolbar that sits beneath the VideoStage. Drawing tools, formation
 * selectors, offside line, undo/clear, plus quick PNG/save actions.
 */
import { useState } from "react";
import { Minus, Circle, Crosshair, Users2, Layers, Undo2, Trash2, Save, Download } from "lucide-react";
import { ANNOTATION_TOOLS, ANNOTATION_COLORS, FORMATIONS } from "./AnnotationCanvas";

export const AnnotationToolbar = ({ activeTool, setActiveTool, activeColor, setActiveColor, annotations, setAnnotations, onSave, onExport, activeFormations, setActiveFormations, activeAngle = "primary" }) => {
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

        <button onClick={() => setShowFormations(!showFormations)} title="Team Formation Overlay"
          className={`h-7 px-2 flex items-center gap-1 text-[9px] font-mono transition-all ${showFormations ? 'bg-[#00E5FF]/20 text-[#00E5FF] border border-[#00E5FF]/40' : 'text-gray-500 hover:text-white border border-transparent'}`}
          data-testid="tool-formation"><Users2 className="w-3.5 h-3.5" /><span className="hidden sm:inline">FORMATION</span></button>
        <button onClick={addOffsideLine} title="Add Offside Line" className="h-7 px-2 flex items-center gap-1 text-[9px] font-mono text-gray-500 hover:text-[#FFB800] border border-transparent transition-all" data-testid="tool-offside-line"><Layers className="w-3.5 h-3.5" /><span className="hidden sm:inline">OFFSIDE</span></button>

        <div className="h-4 w-[1px] bg-white/[0.06] mx-0.5" />

        <div className="flex items-center gap-0.5" data-testid="color-picker">
          {ANNOTATION_COLORS.map(c => (
            <button key={c} onClick={() => setActiveColor(c)} className={`w-4 h-4 transition-all ${activeColor === c ? 'ring-1 ring-white ring-offset-1 ring-offset-[#050505] scale-125' : 'opacity-60 hover:opacity-100'}`} style={{ backgroundColor: c }} data-testid={`color-${c.replace('#','')}`} />
          ))}
        </div>

        <div className="h-4 w-[1px] bg-white/[0.06] mx-0.5" />

        <button onClick={() => setAnnotations(prev => prev.slice(0, -1))} className="h-7 w-7 flex items-center justify-center text-gray-500 hover:text-[#FFB800] transition-all" title="Undo" data-testid="annotation-undo"><Undo2 className="w-3.5 h-3.5" /></button>
        <button onClick={() => { setAnnotations([]); setActiveFormations({}); }} className="h-7 w-7 flex items-center justify-center text-gray-500 hover:text-[#FF2A2A] transition-all" title="Clear all" data-testid="annotation-clear"><Trash2 className="w-3.5 h-3.5" /></button>
        {onSave && annotations.length > 0 && (
          <button onClick={onSave} className="h-7 px-2 flex items-center gap-1 text-[#00FF88] text-[9px] font-mono border border-[#00FF88]/30 bg-[#00FF88]/10 hover:bg-[#00FF88]/20 transition-all" data-testid="annotation-save"><Save className="w-3 h-3" />SAVE</button>
        )}
        {onExport && (
          <button onClick={onExport} className="h-7 px-2 flex items-center gap-1 text-[#FFB800] text-[9px] font-mono border border-[#FFB800]/30 bg-[#FFB800]/10 hover:bg-[#FFB800]/20 transition-all" title="Export to PNG" data-testid="annotation-export"><Download className="w-3 h-3" />PNG</button>
        )}
        {annotations.length > 0 && <span className="text-[9px] font-mono text-gray-600 ml-1" title={`${annotations.filter(a => !a.angle || a.angle === activeAngle).length} visible on ${activeAngle.replace("_"," ").toUpperCase()} · ${annotations.length} total across all angles`}>{annotations.filter(a => !a.angle || a.angle === activeAngle).length}/{annotations.length}</span>}
        <span
          className="ml-auto flex items-center gap-1 text-[8px] font-mono uppercase tracking-[0.18em] px-1.5 py-0.5 border border-[#00E5FF]/30 bg-[#00E5FF]/[0.05] text-[#00E5FF]"
          data-testid="annotation-angle-lock"
          title={`New annotations will be tagged to the ${activeAngle.replace("_"," ").toUpperCase()} view and only render there.`}
        >
          <span className="w-1 h-1 bg-[#00E5FF]" />
          ANGLE · {activeAngle.replace("_", " ")}
        </span>
      </div>

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
