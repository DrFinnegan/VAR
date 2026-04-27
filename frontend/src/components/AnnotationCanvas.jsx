/**
 * Annotation primitives — tool/colour palettes + tactical formation presets.
 * AnnotationCanvas itself is a pure SVG draw surface used by both the live
 * VideoStage and the side-by-side ComparisonPanel.
 */
import { useRef, useState } from "react";

export const ANNOTATION_TOOLS = { LINE: "line", CIRCLE: "circle", MARKER: "marker", NONE: "none" };
export const ANNOTATION_COLORS = ["#00E5FF", "#00FF88", "#FF2A2A", "#FFB800", "#FFFFFF"];

export const FORMATIONS = {
  "4-4-2": { label: "4-4-2", positions: [
    { x: 50, y: 92 },
    { x: 15, y: 72 }, { x: 37, y: 75 }, { x: 63, y: 75 }, { x: 85, y: 72 },
    { x: 15, y: 50 }, { x: 37, y: 52 }, { x: 63, y: 52 }, { x: 85, y: 50 },
    { x: 35, y: 28 }, { x: 65, y: 28 },
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

export const AnnotationCanvas = ({ width, height, annotations, setAnnotations, activeTool, activeColor, isDrawing, setIsDrawing, formations }) => {
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
      {isDrawing && startPos && currentPos && activeTool === ANNOTATION_TOOLS.LINE && (
        <line x1={startPos.x} y1={startPos.y} x2={currentPos.x} y2={currentPos.y} stroke={activeColor} strokeWidth="0.4" strokeDasharray="1" opacity="0.7" />
      )}
      {isDrawing && startPos && currentPos && activeTool === ANNOTATION_TOOLS.CIRCLE && (
        <circle cx={startPos.x} cy={startPos.y} r={Math.sqrt(Math.pow(currentPos.x - startPos.x, 2) + Math.pow(currentPos.y - startPos.y, 2))} stroke={activeColor} strokeWidth="0.4" fill="none" strokeDasharray="1" opacity="0.7" />
      )}
    </svg>
  );
};
