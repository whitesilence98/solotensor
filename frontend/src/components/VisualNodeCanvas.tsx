"use client";

import React, { useState, useRef, useEffect, useMemo, useCallback } from "react";
import {
  Activity,
  Check,
  ChevronRight,
  Cpu,
  Dices,
  Eye,
  EyeOff,
  Layers,
  Maximize2,
  Minimize2,
  Minus,
  Move,
  Plus,
  RotateCcw,
  SlidersHorizontal,
  Sparkles,
  Type,
  X,
  Zap,
} from "lucide-react";
import { ToolControl } from "@/lib/api";
import {
  computeGraphTopology,
  CanvasGraphTopology,
  VisualCanvasNode,
  VisualCanvasEdge,
  getSocketColor,
} from "@/lib/graph-topology";

export interface VisualNodeCanvasProps {
  workflow: Record<string, unknown>;
  controls: ToolControl[];
  onControlsChange: (controls: ToolControl[]) => void;
  className?: string;
}

export default function VisualNodeCanvas({
  workflow,
  controls,
  onControlsChange,
  className = "",
}: VisualNodeCanvasProps) {
  // Graph topology memoized from workflow
  const initialTopology = useMemo(() => {
    return computeGraphTopology(workflow, controls);
  }, [workflow, controls]);

  // Node position overrides state (allows dragging nodes)
  const [nodePositions, setNodePositions] = useState<Record<string, { x: number; y: number }>>({});

  // Viewport pan & zoom transform
  const [transform, setTransform] = useState<{ x: number; y: number; scale: number }>({
    x: 60,
    y: 60,
    scale: 0.85,
  });

  // Dragging states
  const [isPanning, setIsPanning] = useState(false);
  const [panStart, setPanStart] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [draggingNodeId, setDraggingNodeId] = useState<string | null>(null);
  const [nodeDragOffset, setNodeDragOffset] = useState<{ x: number; y: number }>({ x: 0, y: 0 });

  // Selected node for side inspector
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);

  const containerRef = useRef<HTMLDivElement>(null);

  // Auto-fit to view on initial load
  const fitToView = useCallback(() => {
    if (!containerRef.current) return;
    const { clientWidth, clientHeight } = containerRef.current;
    const { bounds } = initialTopology;

    const graphWidth = Math.max(bounds.maxX - bounds.minX, 400);
    const graphHeight = Math.max(bounds.maxY - bounds.minY, 400);

    const scaleX = (clientWidth - 120) / graphWidth;
    const scaleY = (clientHeight - 120) / graphHeight;
    const scale = Math.min(Math.max(Math.min(scaleX, scaleY), 0.35), 1.2);

    const x = (clientWidth - graphWidth * scale) / 2 - bounds.minX * scale;
    const y = (clientHeight - graphHeight * scale) / 2 - bounds.minY * scale;

    setTransform({ x, y, scale });
  }, [initialTopology]);

  // Fit to view once mounted
  useEffect(() => {
    fitToView();
  }, [fitToView]);

  // Reset node positions to auto-layout
  const handleResetLayout = () => {
    setNodePositions({});
    fitToView();
  };

  // Wheel zoom handler
  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    if (!containerRef.current) return;

    const zoomFactor = 1.1;
    const newScale = e.deltaY < 0 ? transform.scale * zoomFactor : transform.scale / zoomFactor;
    const clampedScale = Math.min(Math.max(newScale, 0.25), 2.5);

    const rect = containerRef.current.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    const newX = mouseX - (mouseX - transform.x) * (clampedScale / transform.scale);
    const newY = mouseY - (mouseY - transform.y) * (clampedScale / transform.scale);

    setTransform({ x: newX, y: newY, scale: clampedScale });
  };

  // Mouse down on canvas (pan start)
  const handleCanvasMouseDown = (e: React.MouseEvent) => {
    // Only pan if clicking canvas background
    if ((e.target as HTMLElement).closest(".canvas-node")) return;
    setIsPanning(true);
    setPanStart({ x: e.clientX - transform.x, y: e.clientY - transform.y });
  };

  // Mouse down on node header (node drag start)
  const handleNodeMouseDown = (e: React.MouseEvent, nodeId: string) => {
    e.stopPropagation();
    setSelectedNodeId(nodeId);

    const currentPos = nodePositions[nodeId] || {
      x: initialTopology.nodes.find((n) => n.id === nodeId)?.x || 0,
      y: initialTopology.nodes.find((n) => n.id === nodeId)?.y || 0,
    };

    setDraggingNodeId(nodeId);
    setNodeDragOffset({
      x: e.clientX / transform.scale - currentPos.x,
      y: e.clientY / transform.scale - currentPos.y,
    });
  };

  // Mouse move handler (pan or node drag)
  const handleMouseMove = (e: React.MouseEvent) => {
    if (isPanning) {
      setTransform((prev) => ({
        ...prev,
        x: e.clientX - panStart.x,
        y: e.clientY - panStart.y,
      }));
    } else if (draggingNodeId) {
      const newX = e.clientX / transform.scale - nodeDragOffset.x;
      const newY = e.clientY / transform.scale - nodeDragOffset.y;
      setNodePositions((prev) => ({
        ...prev,
        [draggingNodeId]: { x: Math.round(newX), y: Math.round(newY) },
      }));
    }
  };

  // Mouse up handler
  const handleMouseUp = () => {
    setIsPanning(false);
    setDraggingNodeId(null);
  };

  // Get effective position for a node
  const getNodePos = useCallback(
    (node: VisualCanvasNode) => {
      return nodePositions[node.id] || { x: node.x, y: node.y };
    },
    [nodePositions]
  );

  // Controller helpers
  const isControlExposed = (nodeId: string, inputName: string) => {
    return controls.some(
      (c) =>
        (c.node_id === nodeId || c.path.includes(`.${nodeId}.`)) &&
        c.input_name === inputName &&
        c.exposed !== false
    );
  };

  const getExistingControl = (nodeId: string, inputName: string): ToolControl | undefined => {
    return controls.find(
      (c) =>
        (c.node_id === nodeId || c.path.includes(`.${nodeId}.`)) &&
        c.input_name === inputName
    );
  };

  const toggleControlExposure = (node: VisualCanvasNode, inputName: string, value: unknown) => {
    const existing = getExistingControl(node.id, inputName);
    const path = `nodes.${node.id}.inputs.${inputName}`;

    if (existing) {
      // Toggle exposed
      onControlsChange(
        controls.map((c) =>
          c.id === existing.id ? { ...c, exposed: !c.exposed } : c
        )
      );
    } else {
      // Create new control
      const isNum = typeof value === "number";
      const isSeed = inputName.toLowerCase().includes("seed");
      const isPrompt =
        typeof value === "string" &&
        (inputName.toLowerCase().includes("text") ||
          inputName.toLowerCase().includes("prompt"));

      const newControl: ToolControl = {
        id: path,
        path,
        node_id: node.id,
        input_name: inputName,
        label: `${node.metaTitle} ${inputName.replace(/_/g, " ")}`,
        meta_title: node.metaTitle,
        kind: isPrompt ? "prompt" : isSeed ? "seed" : isNum ? "number" : "text",
        value: (value as string | number | boolean) ?? "",
        default: (value as string | number | boolean) ?? "",
        numeric: isNum,
        seed: isSeed,
        options: [],
        minimum: isNum ? 0 : null,
        maximum: isNum ? (inputName === "steps" ? 100 : 30) : null,
        step: isNum ? (inputName === "cfg" ? 0.5 : 1) : null,
        exposed: true,
      };

      onControlsChange([...controls, newControl]);
    }
  };

  const updateControlLabel = (controlId: string, label: string) => {
    onControlsChange(
      controls.map((c) => (c.id === controlId ? { ...c, label } : c))
    );
  };

  const isEssentialInput = (inputName: string) => {
    const norm = inputName.toLowerCase();
    return (
      norm.includes("seed") ||
      norm === "cfg" ||
      norm === "guidance" ||
      norm === "steps" ||
      norm === "width" ||
      norm === "height"
    );
  };

  const handleExposeEssentials = () => {
    const updated = controls.map((c) => {
      const isEss =
        c.is_essential ||
        c.kind === "seed" ||
        c.seed ||
        ["seed", "width", "height", "cfg", "steps"].includes(c.role || "") ||
        isEssentialInput(c.input_name);
      return isEss ? { ...c, exposed: true } : c;
    });
    onControlsChange(updated);
  };

  const selectedNode = useMemo(() => {
    if (!selectedNodeId) return null;
    return initialTopology.nodes.find((n) => n.id === selectedNodeId) || null;
  }, [selectedNodeId, initialTopology.nodes]);

  // Category badge colors
  const getCategoryTheme = (cat: VisualCanvasNode["category"]) => {
    switch (cat) {
      case "loader":
        return "border-purple-500/40 bg-purple-500/10 text-purple-300";
      case "sampler":
        return "border-amber-500/40 bg-amber-500/10 text-amber-300";
      case "conditioning":
        return "border-yellow-500/40 bg-yellow-500/10 text-yellow-300";
      case "latent":
        return "border-pink-500/40 bg-pink-500/10 text-pink-300";
      case "image":
        return "border-cyan-500/40 bg-cyan-500/10 text-cyan-300";
      case "output":
        return "border-emerald-500/40 bg-emerald-500/10 text-emerald-300";
      default:
        return "border-[var(--line)] bg-[var(--surface-sunken)] text-[var(--ink-soft)]";
    }
  };

  return (
    <div
      ref={containerRef}
      onWheel={handleWheel}
      onMouseDown={handleCanvasMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      className={`relative w-full h-full overflow-hidden select-none bg-[var(--ground)] cursor-grab active:cursor-grabbing ${className}`}
      style={{
        backgroundImage: `radial-gradient(circle, rgba(255, 255, 255, 0.08) 1px, transparent 1px)`,
        backgroundSize: `${30 * transform.scale}px ${30 * transform.scale}px`,
        backgroundPosition: `${transform.x}px ${transform.y}px`,
      }}
    >
      {/* Top Floating Viewport Command Bar */}
      <div className="absolute top-4 left-4 z-20 flex items-center gap-2 rounded-[8px] border border-[var(--line-strong)] bg-[var(--surface-raised)]/90 backdrop-blur-md px-3 py-1.5 shadow-xl font-mono text-[11px]">
        <div className="flex items-center gap-2 pr-3 border-r border-[var(--line)]">
          <Activity className="h-4 w-4 text-[var(--accent)] animate-pulse" />
          <span className="font-bold uppercase tracking-wider text-[var(--ink)]">
            Node Graph Canvas
          </span>
          <span className="rounded bg-[var(--surface-sunken)] px-1.5 py-0.2 text-[9px] text-[var(--ink-faint)]">
            {initialTopology.nodes.length} Nodes · {initialTopology.edges.length} Links
          </span>
        </div>

        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setTransform((t) => ({ ...t, scale: Math.min(t.scale * 1.2, 2.5) }))}
            className="p-1 rounded hover:bg-[var(--surface-soft)] text-[var(--ink-soft)] hover:text-[var(--ink)]"
            title="Zoom In"
          >
            <Plus className="h-3.5 w-3.5" />
          </button>
          <span className="text-[10px] text-[var(--ink-faint)] px-1">
            {Math.round(transform.scale * 100)}%
          </span>
          <button
            type="button"
            onClick={() => setTransform((t) => ({ ...t, scale: Math.max(t.scale / 1.2, 0.25) }))}
            className="p-1 rounded hover:bg-[var(--surface-soft)] text-[var(--ink-soft)] hover:text-[var(--ink)]"
            title="Zoom Out"
          >
            <Minus className="h-3.5 w-3.5" />
          </button>
          <div className="h-3 w-px bg-[var(--line)] mx-1" />
          <button
            type="button"
            onClick={fitToView}
            className="flex items-center gap-1 px-2 py-1 rounded hover:bg-[var(--surface-soft)] text-[var(--ink-soft)] hover:text-[var(--ink)]"
            title="Fit to Screen"
          >
            <Maximize2 className="h-3.5 w-3.5" />
            <span className="text-[10px]">Fit</span>
          </button>
          <button
            type="button"
            onClick={handleResetLayout}
            className="flex items-center gap-1 px-2 py-1 rounded hover:bg-[var(--surface-soft)] text-[var(--ink-soft)] hover:text-[var(--ink)]"
            title="Reset Auto-Layout"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            <span className="text-[10px]">Layout</span>
          </button>
          <div className="h-3 w-px bg-[var(--line)] mx-1" />
          <button
            type="button"
            onClick={handleExposeEssentials}
            className="flex items-center gap-1 px-2.5 py-1 rounded bg-[var(--accent)]/15 border border-[var(--accent)]/40 text-[var(--accent)] hover:bg-[var(--accent)]/25 font-bold transition shadow-[0_0_8px_rgba(213,240,111,0.2)]"
            title="Expose Essential Parameters (Seed, Dimensions, CFG, Steps)"
          >
            <Zap className="h-3.5 w-3.5 fill-current" />
            <span className="text-[10px]">Expose Essentials</span>
          </button>
        </div>
      </div>

      {/* World Canvas Layer (Scaled & Translated) */}
      <div
        className="absolute inset-0 origin-top-left pointer-events-none"
        style={{
          transform: `translate(${transform.x}px, ${transform.y}px) scale(${transform.scale})`,
        }}
      >
        {/* SVG Connection Noodles Layer */}
        <svg
          className="absolute inset-0 overflow-visible w-full h-full pointer-events-none z-0"
        >
          {initialTopology.edges.map((edge) => {
            const srcNode = initialTopology.nodes.find((n) => n.id === edge.source);
            const tgtNode = initialTopology.nodes.find((n) => n.id === edge.target);
            if (!srcNode || !tgtNode) return null;

            const srcPos = getNodePos(srcNode);
            const tgtPos = getNodePos(tgtNode);

            // Compute port Y positions based on socket index
            const srcY = srcPos.y + 50 + edge.sourceIndex * 24;
            const tgtInputIndex = tgtNode.inputs.findIndex((inp) => inp.name === edge.targetPort);
            const tgtY = tgtPos.y + 50 + Math.max(tgtInputIndex, 0) * 24;

            const x1 = srcPos.x + srcNode.width;
            const y1 = srcY;
            const x2 = tgtPos.x;
            const y2 = tgtY;

            const dx = Math.max(Math.abs(x2 - x1) * 0.45, 60);

            return (
              <g key={edge.id}>
                {/* Background Shadow Spline */}
                <path
                  d={`M ${x1} ${y1} C ${x1 + dx} ${y1}, ${x2 - dx} ${y2}, ${x2} ${y2}`}
                  fill="none"
                  stroke="#000000"
                  strokeWidth="4"
                  strokeOpacity="0.6"
                />
                {/* Foreground Colored Spline */}
                <path
                  d={`M ${x1} ${y1} C ${x1 + dx} ${y1}, ${x2 - dx} ${y2}, ${x2} ${y2}`}
                  fill="none"
                  stroke={edge.color}
                  strokeWidth="2.5"
                  strokeOpacity="0.85"
                  className="hover:stroke-white transition-all cursor-pointer"
                />
              </g>
            );
          })}
        </svg>

        {/* Nodes Layer */}
        <div className="absolute inset-0 pointer-events-auto">
          {initialTopology.nodes.map((node) => {
            const pos = getNodePos(node);
            const isSelected = selectedNodeId === node.id;
            const theme = getCategoryTheme(node.category);

            // Count exposed controls on this node
            const nodeExposedCount = controls.filter(
              (c) => (c.node_id === node.id || c.path.includes(`.${node.id}.`)) && c.exposed !== false
            ).length;

            return (
              <div
                key={node.id}
                id={`canvas_node_${node.id}`}
                className={`canvas-node absolute rounded-[8px] border transition-shadow shadow-2xl backdrop-blur-md select-none ${
                  isSelected
                    ? "border-[var(--accent)] ring-2 ring-[var(--accent)]/40 shadow-[0_0_24px_rgba(213,240,111,0.25)] z-20"
                    : "border-[var(--line-strong)] hover:border-[var(--accent)]/60 z-10"
                } bg-[var(--surface-raised)]/95`}
                style={{
                  transform: `translate(${pos.x}px, ${pos.y}px)`,
                  width: `${node.width}px`,
                }}
                onClick={(e) => {
                  e.stopPropagation();
                  setSelectedNodeId(node.id);
                }}
              >
                {/* Node Header (Draggable Handle) */}
                <div
                  onMouseDown={(e) => handleNodeMouseDown(e, node.id)}
                  className="flex items-center justify-between border-b border-[var(--line)] bg-[var(--surface-sunken)] px-3 py-2 cursor-grab active:cursor-grabbing rounded-t-[7px]"
                >
                  <div className="flex items-center gap-1.5 truncate">
                    <span
                      className={`rounded px-1.5 py-0.2 font-mono text-[8px] font-bold uppercase border ${theme}`}
                    >
                      {node.category}
                    </span>
                    <span className="font-mono text-xs font-bold text-[var(--ink)] truncate">
                      {node.metaTitle}
                    </span>
                  </div>
                  <div className="flex items-center gap-1">
                    {nodeExposedCount > 0 && (
                      <span className="flex items-center gap-0.5 rounded bg-[var(--accent)]/15 border border-[var(--accent)]/30 px-1 py-0.2 font-mono text-[8px] font-bold text-[var(--accent)]">
                        <Zap className="h-2 w-2" />
                        <span>{nodeExposedCount}</span>
                      </span>
                    )}
                    <span className="font-mono text-[9px] text-[var(--ink-faint)]">
                      #{node.id}
                    </span>
                  </div>
                </div>

                {/* Node Body: Ports & Parameters */}
                <div className="p-2.5 space-y-2 text-[10px] font-mono">
                  {/* Inputs List */}
                  <div className="space-y-1.5">
                    {node.inputs.map((inp) => {
                      const isExposed = isControlExposed(node.id, inp.name);
                      const ctrl = getExistingControl(node.id, inp.name);

                      return (
                        <div
                          key={inp.name}
                          className="flex items-center justify-between gap-1.5 group/inp"
                        >
                          {/* Socket Port Dot */}
                          <div className="flex items-center gap-1.5 truncate">
                            <span
                              className="h-2 w-2 rounded-full shrink-0 border border-black/40"
                              style={{ backgroundColor: inp.color }}
                              title={`${inp.name} (${inp.isLinked ? "Connected" : "Parameter"})`}
                            />
                            <span
                              className={`truncate text-[9px] ${
                                inp.isLinked
                                  ? "text-[var(--ink-soft)] font-medium"
                                  : "text-[var(--ink)] font-bold"
                              }`}
                            >
                              {inp.name}
                            </span>
                            {!inp.isLinked && isEssentialInput(inp.name) && (
                              <span
                                className="rounded px-1 py-0.2 font-mono text-[7px] font-bold uppercase tracking-wider bg-[var(--accent)]/15 border border-[var(--accent)]/30 text-[var(--accent)] shrink-0"
                                title="Essential Generation Parameter"
                              >
                                {inp.name.toLowerCase().includes("seed")
                                  ? "🎲 Seed"
                                  : inp.name === "cfg" || inp.name === "guidance"
                                  ? "🎚️ CFG"
                                  : inp.name === "steps"
                                  ? "⏱️ Steps"
                                  : "📐 Dim"}
                              </span>
                            )}
                          </div>

                          {/* Unlinked Parameter Action: Toggle Expose Controller */}
                          {!inp.isLinked ? (
                            <div className="flex items-center gap-1 shrink-0">
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  toggleControlExposure(node, inp.name, inp.value);
                                }}
                                className={`flex items-center gap-1 rounded px-1.5 py-0.5 text-[8px] font-bold transition-all ${
                                  isExposed
                                    ? "bg-[var(--accent)] text-[var(--accent-ink)] shadow-sm"
                                    : "bg-[var(--surface-sunken)] border border-[var(--line)] text-[var(--ink-faint)] hover:border-[var(--accent)] hover:text-[var(--ink)]"
                                }`}
                                title={isExposed ? "Exposed to users (Click to lock)" : "Expose as UI controller"}
                              >
                                <Zap className="h-2.5 w-2.5" />
                                <span>{isExposed ? "Exposed" : "Expose"}</span>
                              </button>
                            </div>
                          ) : (
                            <span className="text-[8px] text-[var(--ink-faint)] truncate max-w-[60px]">
                              wire
                            </span>
                          )}
                        </div>
                      );
                    })}
                  </div>

                  {/* Outputs List */}
                  {node.outputs.length > 0 && (
                    <div className="pt-1.5 border-t border-[var(--line)]/50 space-y-1">
                      {node.outputs.map((out) => (
                        <div
                          key={out.index}
                          className="flex items-center justify-end gap-1.5 text-right"
                        >
                          <span className="text-[8px] text-[var(--ink-faint)] uppercase">
                            {out.name}
                          </span>
                          <span
                            className="h-2 w-2 rounded-full shrink-0 border border-black/40"
                            style={{ backgroundColor: out.color }}
                            title={`${out.name} (Slot ${out.index})`}
                          />
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Floating Side Inspector Panel (When a Node is Selected) */}
      {selectedNode && (
        <div className="absolute right-4 top-4 bottom-4 w-[340px] z-30 rounded-[10px] border border-[var(--line-strong)] bg-[var(--surface-raised)]/95 backdrop-blur-xl shadow-2xl flex flex-col justify-between font-mono animate-in slide-in-from-right duration-200">
          <div className="p-4 space-y-4 overflow-y-auto">
            {/* Inspector Header */}
            <div className="flex items-center justify-between border-b border-[var(--line)] pb-3">
              <div className="space-y-0.5">
                <span className="text-[9px] uppercase tracking-wider text-[var(--accent)] font-bold">
                  Node Inspector
                </span>
                <h3 className="text-xs font-bold text-[var(--ink)] truncate max-w-[240px]">
                  {selectedNode.metaTitle}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setSelectedNodeId(null)}
                className="p-1 rounded hover:bg-[var(--surface-soft)] text-[var(--ink-faint)] hover:text-[var(--ink)]"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Node Metadata Specs */}
            <div className="rounded-[6px] border border-[var(--line)] bg-[var(--surface-sunken)] p-3 text-[10px] space-y-1.5">
              <div className="flex justify-between">
                <span className="text-[var(--ink-faint)]">Node ID:</span>
                <span className="font-bold text-[var(--ink)]">#{selectedNode.id}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-[var(--ink-faint)]">Class Type:</span>
                <span className="font-bold text-[var(--accent)] truncate max-w-[170px]">
                  {selectedNode.classType}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-[var(--ink-faint)]">Category:</span>
                <span className="capitalize text-[var(--ink-soft)]">{selectedNode.category}</span>
              </div>
            </div>

            {/* Parameters & Custom Controllers */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--ink-soft)]">
                  Controller Knobs:
                </span>
                <span className="text-[9px] text-[var(--ink-faint)]">
                  {selectedNode.inputs.filter((i) => !i.isLinked).length} Configurable
                </span>
              </div>

              {selectedNode.inputs.filter((i) => !i.isLinked).length === 0 ? (
                <p className="text-[10px] text-[var(--ink-faint)] text-center py-2">
                  All inputs are linked to upstream nodes.
                </p>
              ) : (
                <div className="space-y-3">
                  {selectedNode.inputs
                    .filter((i) => !i.isLinked)
                    .map((inp) => {
                      const isExposed = isControlExposed(selectedNode.id, inp.name);
                      const ctrl = getExistingControl(selectedNode.id, inp.name);

                      return (
                        <div
                          key={inp.name}
                          className={`rounded-[6px] border p-3 space-y-2 transition-all ${
                            isExposed
                              ? "border-[var(--accent)]/50 bg-[var(--surface-sunken)]"
                              : "border-[var(--line)] bg-[var(--surface-sunken)]/30 opacity-70"
                          }`}
                        >
                          <div className="flex items-center justify-between">
                            <label className="text-[10px] font-bold text-[var(--ink)] truncate max-w-[180px]">
                              {inp.name}
                            </label>
                            <button
                              type="button"
                              onClick={() => toggleControlExposure(selectedNode, inp.name, inp.value)}
                              className={`flex items-center gap-1 rounded px-2 py-0.5 text-[9px] font-bold transition-all ${
                                isExposed
                                  ? "bg-[var(--accent)] text-[var(--accent-ink)]"
                                  : "border border-[var(--line)] bg-[var(--surface)] text-[var(--ink-soft)] hover:text-[var(--ink)]"
                              }`}
                            >
                              <Zap className="h-3 w-3" />
                              <span>{isExposed ? "Exposed" : "Expose"}</span>
                            </button>
                          </div>

                          {isExposed && ctrl && (
                            <div className="space-y-1.5 pt-1 border-t border-[var(--line)]">
                              <div>
                                <span className="text-[8px] text-[var(--ink-faint)] uppercase block">
                                  Display Label:
                                </span>
                                <input
                                  value={ctrl.label}
                                  onChange={(e) => updateControlLabel(ctrl.id, e.target.value)}
                                  className="w-full h-6 rounded border border-[var(--line)] bg-[var(--surface)] px-2 text-[10px] text-[var(--ink)] outline-none focus:border-[var(--accent)]"
                                />
                              </div>

                              <div className="flex justify-between text-[9px] text-[var(--ink-faint)]">
                                <span>Default: {String(ctrl.default ?? ctrl.value ?? "—")}</span>
                                <span className="capitalize">{ctrl.kind}</span>
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                </div>
              )}
            </div>
          </div>

          {/* Inspector Footer */}
          <div className="p-3 border-t border-[var(--line)] bg-[var(--surface-sunken)] text-center text-[9px] text-[var(--ink-faint)]">
            Changes sync dynamically with the Tool Studio catalog.
          </div>
        </div>
      )}
    </div>
  );
}
