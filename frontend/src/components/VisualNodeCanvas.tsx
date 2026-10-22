"use client";

import React, { useState, useRef, useEffect, useMemo, useCallback } from "react";
import {
  Activity,
  Check,
  ChevronRight,
  Compass,
  Cpu,
  Crosshair,
  Dices,
  Eye,
  EyeOff,
  Focus,
  Grid,
  Keyboard,
  Layers,
  Magnet,
  Map as MapIcon,
  Maximize2,
  Minimize2,
  Minus,
  Move,
  Plus,
  RotateCcw,
  Search,
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

  // Grid snap state (default 20px)
  const [snapToGrid, setSnapToGrid] = useState(true);
  const GRID_SIZE = 20;

  // Selected & Hovered nodes for pipeline trace & side inspector
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null);
  const [flashNodeId, setFlashNodeId] = useState<string | null>(null);

  // Quick Search & Spotlight state
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchSelectedIndex, setSearchSelectedIndex] = useState(0);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Minimap HUD state
  const [isMinimapVisible, setIsMinimapVisible] = useState(true);
  const [isMinimapDragging, setIsMinimapDragging] = useState(false);
  const minimapSvgRef = useRef<SVGSVGElement>(null);

  // Space key down tracking for pan anywhere
  const [isSpaceDown, setIsSpaceDown] = useState(false);
  const [showHotkeysHelp, setShowHotkeysHelp] = useState(false);

  const containerRef = useRef<HTMLDivElement>(null);

  // Get effective position for a node
  const getNodePos = useCallback(
    (node: VisualCanvasNode) => {
      return nodePositions[node.id] || { x: node.x, y: node.y };
    },
    [nodePositions]
  );

  // Auto-fit to view
  const fitToView = useCallback(() => {
    if (!containerRef.current) return;
    const { clientWidth, clientHeight } = containerRef.current;
    const { bounds } = initialTopology;

    const graphWidth = Math.max(bounds.maxX - bounds.minX, 400);
    const graphHeight = Math.max(bounds.maxY - bounds.minY, 400);

    const scaleX = (clientWidth - 160) / graphWidth;
    const scaleY = (clientHeight - 160) / graphHeight;
    const scale = Math.min(Math.max(Math.min(scaleX, scaleY), 0.3), 1.2);

    const x = (clientWidth - graphWidth * scale) / 2 - bounds.minX * scale;
    const y = (clientHeight - graphHeight * scale) / 2 - bounds.minY * scale;

    setTransform({ x, y, scale });
  }, [initialTopology]);

  // Center camera on a specific node with a flash indicator
  const centerOnNode = useCallback(
    (nodeId: string) => {
      if (!containerRef.current) return;
      const targetNode = initialTopology.nodes.find((n) => n.id === nodeId);
      if (!targetNode) return;
      const pos = getNodePos(targetNode);
      const { clientWidth, clientHeight } = containerRef.current;

      const scale = transform.scale;
      const x = clientWidth / 2 - (pos.x + targetNode.width / 2) * scale;
      const y = clientHeight / 2 - (pos.y + targetNode.height / 2) * scale;

      setTransform({ x, y, scale });
      setSelectedNodeId(nodeId);
      setFlashNodeId(nodeId);
      setTimeout(() => setFlashNodeId((curr) => (curr === nodeId ? null : curr)), 1400);
    },
    [initialTopology.nodes, getNodePos, transform.scale]
  );

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
    const clampedScale = Math.min(Math.max(newScale, 0.2), 2.5);

    const rect = containerRef.current.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    const newX = mouseX - (mouseX - transform.x) * (clampedScale / transform.scale);
    const newY = mouseY - (mouseY - transform.y) * (clampedScale / transform.scale);

    setTransform({ x: newX, y: newY, scale: clampedScale });
  };

  // Mouse down on canvas (pan start)
  const handleCanvasMouseDown = (e: React.MouseEvent) => {
    // If middle click or space key is held down, pan canvas immediately
    if (e.button === 1 || isSpaceDown) {
      e.preventDefault();
      setIsPanning(true);
      setPanStart({ x: e.clientX - transform.x, y: e.clientY - transform.y });
      return;
    }

    // Only pan if clicking canvas background (not inside node card or minimap)
    if (
      (e.target as HTMLElement).closest(".canvas-node") ||
      (e.target as HTMLElement).closest(".canvas-hud")
    ) {
      return;
    }

    setIsPanning(true);
    setPanStart({ x: e.clientX - transform.x, y: e.clientY - transform.y });
  };

  // Mouse down on node header (node drag start)
  const handleNodeMouseDown = (e: React.MouseEvent, nodeId: string) => {
    // If Space is held down or middle click, allow panning instead of node dragging
    if (isSpaceDown || e.button === 1) {
      handleCanvasMouseDown(e);
      return;
    }

    e.stopPropagation();
    setSelectedNodeId(nodeId);

    const targetNode = initialTopology.nodes.find((n) => n.id === nodeId);
    const currentPos = targetNode ? getNodePos(targetNode) : { x: 0, y: 0 };

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
      let newX = e.clientX / transform.scale - nodeDragOffset.x;
      let newY = e.clientY / transform.scale - nodeDragOffset.y;

      if (snapToGrid) {
        newX = Math.round(newX / GRID_SIZE) * GRID_SIZE;
        newY = Math.round(newY / GRID_SIZE) * GRID_SIZE;
      }

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

  // Global Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const activeEl = document.activeElement;
      const isInput =
        activeEl instanceof HTMLInputElement ||
        activeEl instanceof HTMLTextAreaElement ||
        (activeEl as HTMLElement)?.isContentEditable;

      // Escape always closes search, inspector, or hotkeys modal
      if (e.key === "Escape") {
        if (isSearchOpen) {
          setIsSearchOpen(false);
          return;
        }
        if (showHotkeysHelp) {
          setShowHotkeysHelp(false);
          return;
        }
        if (selectedNodeId) {
          setSelectedNodeId(null);
          return;
        }
      }

      // If user is actively typing in an input, don't trigger canvas shortcuts
      if (isInput) return;

      // Ctrl+K / Cmd+K or "/" to open spotlight search
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setIsSearchOpen(true);
        return;
      }
      if (e.key === "/" && !e.ctrlKey && !e.metaKey) {
        e.preventDefault();
        setIsSearchOpen(true);
        return;
      }

      // Space key for panning
      if (e.code === "Space" && !e.repeat) {
        setIsSpaceDown(true);
      }

      // "F" to focus selected node or fit entire graph
      if (e.key === "f" || e.key === "F") {
        e.preventDefault();
        if (selectedNodeId) {
          centerOnNode(selectedNodeId);
        } else {
          fitToView();
        }
      }

      // "1" to reset zoom to 100%
      if (e.key === "1") {
        e.preventDefault();
        setTransform((prev) => ({ ...prev, scale: 1.0 }));
      }

      // "M" to toggle minimap
      if (e.key === "m" || e.key === "M") {
        setIsMinimapVisible((v) => !v);
      }

      // "G" to toggle grid snap
      if (e.key === "g" || e.key === "G") {
        setSnapToGrid((v) => !v);
      }

      // "?" to toggle hotkeys cheat sheet
      if (e.key === "?") {
        e.preventDefault();
        setShowHotkeysHelp((v) => !v);
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.code === "Space") {
        setIsSpaceDown(false);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
    };
  }, [isSearchOpen, selectedNodeId, showHotkeysHelp, centerOnNode, fitToView]);

  // Focus search input when modal opens
  useEffect(() => {
    if (isSearchOpen) {
      setSearchQuery("");
      setSearchSelectedIndex(0);
      setTimeout(() => searchInputRef.current?.focus(), 50);
    }
  }, [isSearchOpen]);

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
      onControlsChange(
        controls.map((c) =>
          c.id === existing.id ? { ...c, exposed: !c.exposed } : c
        )
      );
    } else {
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

  // Dynamic Upstream & Downstream Pipeline Highlighting
  const { activePipelineNodes, activePipelineEdges } = useMemo(() => {
    const activeId = hoveredNodeId || selectedNodeId;
    if (!activeId) {
      return { activePipelineNodes: null, activePipelineEdges: null };
    }

    const nodesSet = new Set<string>([activeId]);
    const edgesSet = new Set<string>();

    // Upstream traversal (nodes/edges feeding INTO activeId)
    const upstreamQueue: string[] = [activeId];
    const visitedUpstream = new Set<string>([activeId]);
    while (upstreamQueue.length > 0) {
      const curr = upstreamQueue.shift()!;
      initialTopology.edges.forEach((edge) => {
        if (edge.target === curr) {
          edgesSet.add(edge.id);
          if (!visitedUpstream.has(edge.source)) {
            visitedUpstream.add(edge.source);
            nodesSet.add(edge.source);
            upstreamQueue.push(edge.source);
          }
        }
      });
    }

    // Downstream traversal (nodes/edges activeId feeds INTO)
    const downstreamQueue: string[] = [activeId];
    const visitedDownstream = new Set<string>([activeId]);
    while (downstreamQueue.length > 0) {
      const curr = downstreamQueue.shift()!;
      initialTopology.edges.forEach((edge) => {
        if (edge.source === curr) {
          edgesSet.add(edge.id);
          if (!visitedDownstream.has(edge.target)) {
            visitedDownstream.add(edge.target);
            nodesSet.add(edge.target);
            downstreamQueue.push(edge.target);
          }
        }
      });
    }

    return { activePipelineNodes: nodesSet, activePipelineEdges: edgesSet };
  }, [hoveredNodeId, selectedNodeId, initialTopology.edges]);

  // Minimap dynamic bounds calculation including custom positions
  const minimapBounds = useMemo(() => {
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;

    initialTopology.nodes.forEach((n) => {
      const pos = getNodePos(n);
      if (pos.x < minX) minX = pos.x;
      if (pos.y < minY) minY = pos.y;
      if (pos.x + n.width > maxX) maxX = pos.x + n.width;
      if (pos.y + n.height > maxY) maxY = pos.y + n.height;
    });

    if (!isFinite(minX)) {
      minX = 0;
      minY = 0;
      maxX = 1200;
      maxY = 800;
    }

    const pad = 140;
    return {
      minX: minX - pad,
      minY: minY - pad,
      maxX: maxX + pad,
      maxY: maxY + pad,
      width: Math.max(maxX - minX + pad * 2, 600),
      height: Math.max(maxY - minY + pad * 2, 400),
    };
  }, [initialTopology.nodes, getNodePos]);

  // Interactive Minimap Pan by Click or Drag
  const handleMinimapPointerEvent = (e: React.PointerEvent<SVGSVGElement>) => {
    if (!minimapSvgRef.current || !containerRef.current) return;
    const rect = minimapSvgRef.current.getBoundingClientRect();
    const relX = Math.min(Math.max((e.clientX - rect.left) / rect.width, 0), 1);
    const relY = Math.min(Math.max((e.clientY - rect.top) / rect.height, 0), 1);

    const worldX = minimapBounds.minX + relX * minimapBounds.width;
    const worldY = minimapBounds.minY + relY * minimapBounds.height;

    const { clientWidth, clientHeight } = containerRef.current;
    setTransform((prev) => ({
      ...prev,
      x: clientWidth / 2 - worldX * prev.scale,
      y: clientHeight / 2 - worldY * prev.scale,
    }));
  };

  // Search filter matches
  const filteredSearchNodes = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return initialTopology.nodes.slice(0, 10);

    return initialTopology.nodes
      .filter((n) => {
        return (
          n.id === q ||
          `#${n.id}` === q ||
          n.metaTitle.toLowerCase().includes(q) ||
          n.classType.toLowerCase().includes(q) ||
          n.category.toLowerCase().includes(q) ||
          n.inputs.some((inp) => inp.name.toLowerCase().includes(q))
        );
      })
      .slice(0, 10);
  }, [initialTopology.nodes, searchQuery]);

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

  const getCategoryMinimapColor = (cat: VisualCanvasNode["category"]) => {
    switch (cat) {
      case "loader":
        return "#a855f7";
      case "sampler":
        return "#f59e0b";
      case "conditioning":
        return "#eab308";
      case "latent":
        return "#ec4899";
      case "image":
        return "#06b6d4";
      case "output":
        return "#10b981";
      default:
        return "#71717a";
    }
  };

  return (
    <div
      ref={containerRef}
      onWheel={handleWheel}
      onMouseDown={handleCanvasMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      className={`relative w-full h-full overflow-hidden select-none bg-[var(--ground)] ${
        isSpaceDown ? "cursor-grab active:cursor-grabbing" : "cursor-default"
      } ${className}`}
      style={{
        backgroundImage: `radial-gradient(circle, rgba(255, 255, 255, 0.08) 1px, transparent 1px)`,
        backgroundSize: `${30 * transform.scale}px ${30 * transform.scale}px`,
        backgroundPosition: `${transform.x}px ${transform.y}px`,
      }}
    >
      {/* Top Floating Viewport Command Bar */}
      <div className="canvas-hud absolute top-4 left-4 z-20 flex flex-wrap items-center gap-2 rounded-[8px] border border-[var(--line-strong)] bg-[var(--surface-raised)]/95 backdrop-blur-md px-3 py-1.5 shadow-xl font-mono text-[11px]">
        {/* Status & Stats */}
        <div className="flex items-center gap-2 pr-3 border-r border-[var(--line)]">
          <Activity className="h-4 w-4 text-[var(--accent)] animate-pulse" />
          <span className="font-bold uppercase tracking-wider text-[var(--ink)]">
            Node Graph
          </span>
          <span className="rounded bg-[var(--surface-sunken)] px-1.5 py-0.2 text-[9px] text-[var(--ink-faint)]">
            {initialTopology.nodes.length} Nodes · {initialTopology.edges.length} Links
          </span>
        </div>

        {/* Quick Search Spotlight Button */}
        <button
          type="button"
          onClick={() => setIsSearchOpen(true)}
          className="flex items-center gap-1.5 rounded-[5px] border border-[var(--line)] bg-[var(--surface-sunken)] px-2.5 py-1 text-[10px] text-[var(--ink-soft)] hover:border-[var(--accent)] hover:text-[var(--accent)] transition-all"
          title="Quick Search & Jump to Node (Ctrl+K or /)"
        >
          <Search className="h-3 w-3" />
          <span className="hidden sm:inline">Find Node</span>
          <kbd className="rounded border border-[var(--line-strong)] bg-[var(--surface)] px-1 py-0.2 font-mono text-[8px] text-[var(--ink-faint)]">
            Ctrl+K
          </kbd>
        </button>

        <div className="h-3 w-px bg-[var(--line)] mx-0.5" />

        {/* Zoom Controls */}
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setTransform((t) => ({ ...t, scale: Math.min(t.scale * 1.2, 2.5) }))}
            className="p-1 rounded hover:bg-[var(--surface-soft)] text-[var(--ink-soft)] hover:text-[var(--ink)]"
            title="Zoom In"
          >
            <Plus className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={() => setTransform((t) => ({ ...t, scale: 1.0 }))}
            className="text-[10px] text-[var(--ink-faint)] hover:text-[var(--ink)] px-1 font-bold"
            title="Reset Zoom to 100% (Hot key: 1)"
          >
            {Math.round(transform.scale * 100)}%
          </button>
          <button
            type="button"
            onClick={() => setTransform((t) => ({ ...t, scale: Math.max(t.scale / 1.2, 0.2) }))}
            className="p-1 rounded hover:bg-[var(--surface-soft)] text-[var(--ink-soft)] hover:text-[var(--ink)]"
            title="Zoom Out"
          >
            <Minus className="h-3.5 w-3.5" />
          </button>
        </div>

        <div className="h-3 w-px bg-[var(--line)] mx-0.5" />

        {/* Framing & Layout Actions */}
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={fitToView}
            className="flex items-center gap-1 px-2 py-1 rounded hover:bg-[var(--surface-soft)] text-[var(--ink-soft)] hover:text-[var(--ink)]"
            title="Fit Entire Graph to Screen (Hotkey: F)"
          >
            <Maximize2 className="h-3.5 w-3.5" />
            <span className="text-[10px]">Fit</span>
          </button>
          <button
            type="button"
            onClick={handleResetLayout}
            className="flex items-center gap-1 px-2 py-1 rounded hover:bg-[var(--surface-soft)] text-[var(--ink-soft)] hover:text-[var(--ink)]"
            title="Reset to Auto Topological Layout"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            <span className="text-[10px]">Layout</span>
          </button>
          <button
            type="button"
            onClick={() => setSnapToGrid(!snapToGrid)}
            className={`flex items-center gap-1 px-2 py-1 rounded transition-colors ${
              snapToGrid
                ? "bg-[var(--surface-sunken)] border border-[var(--accent)]/40 text-[var(--accent)]"
                : "hover:bg-[var(--surface-soft)] text-[var(--ink-faint)]"
            }`}
            title="Toggle Snap to Grid (20px) — Hotkey: G"
          >
            <Magnet className="h-3 w-3" />
            <span className="text-[10px]">Snap</span>
          </button>
        </div>

        <div className="h-3 w-px bg-[var(--line)] mx-0.5" />

        {/* Quick Batch Controller Actions */}
        <button
          type="button"
          onClick={handleExposeEssentials}
          className="flex items-center gap-1 px-2.5 py-1 rounded bg-[var(--accent)]/15 border border-[var(--accent)]/40 text-[var(--accent)] hover:bg-[var(--accent)]/25 font-bold transition shadow-[0_0_8px_rgba(213,240,111,0.2)]"
          title="Expose Essential Parameters (Seed, Dimensions, CFG, Steps)"
        >
          <Zap className="h-3.5 w-3.5 fill-current" />
          <span className="text-[10px]">Expose Essentials</span>
        </button>

        {/* Hotkeys Cheat Sheet Trigger */}
        <button
          type="button"
          onClick={() => setShowHotkeysHelp(!showHotkeysHelp)}
          className="p-1 rounded hover:bg-[var(--surface-soft)] text-[var(--ink-faint)] hover:text-[var(--ink)] ml-0.5"
          title="Canvas Keyboard Shortcuts (?)"
        >
          <Keyboard className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* World Canvas Layer (Scaled & Translated) */}
      <div
        className="absolute inset-0 origin-top-left pointer-events-none"
        style={{
          transform: `translate(${transform.x}px, ${transform.y}px) scale(${transform.scale})`,
        }}
      >
        {/* SVG Connection Noodles Layer */}
        <svg className="absolute inset-0 overflow-visible w-full h-full pointer-events-none z-0">
          <defs>
            <filter id="noodle-glow" x="-20%" y="-20%" width="140%" height="140%">
              <feGaussianBlur stdDeviation="3" result="blur" />
              <feComposite in="SourceGraphic" in2="blur" operator="over" />
            </filter>
          </defs>
          {initialTopology.edges.map((edge) => {
            const srcNode = initialTopology.nodes.find((n) => n.id === edge.source);
            const tgtNode = initialTopology.nodes.find((n) => n.id === edge.target);
            if (!srcNode || !tgtNode) return null;

            const srcPos = getNodePos(srcNode);
            const tgtPos = getNodePos(tgtNode);

            // Compute port Y positions
            const srcY = srcPos.y + 50 + edge.sourceIndex * 24;
            const tgtInputIndex = tgtNode.inputs.findIndex((inp) => inp.name === edge.targetPort);
            const tgtY = tgtPos.y + 50 + Math.max(tgtInputIndex, 0) * 24;

            const x1 = srcPos.x + srcNode.width;
            const y1 = srcY;
            const x2 = tgtPos.x;
            const y2 = tgtY;

            const dx = Math.max(Math.abs(x2 - x1) * 0.45, 60);

            // Pipeline trace highlight check
            const isHighlighted = activePipelineEdges ? activePipelineEdges.has(edge.id) : false;
            const isDimmed = activePipelineEdges !== null && !isHighlighted;

            return (
              <g
                key={edge.id}
                className="pointer-events-auto cursor-pointer group"
                onMouseEnter={() => setHoveredNodeId(edge.source)}
                onMouseLeave={() => setHoveredNodeId(null)}
              >
                {/* Background Shadow Spline */}
                <path
                  d={`M ${x1} ${y1} C ${x1 + dx} ${y1}, ${x2 - dx} ${y2}, ${x2} ${y2}`}
                  fill="none"
                  stroke="#000000"
                  strokeWidth={isHighlighted ? "7" : "4"}
                  strokeOpacity={isDimmed ? "0.15" : "0.6"}
                  className="transition-all duration-150"
                />
                {/* Foreground Colored Spline */}
                <path
                  d={`M ${x1} ${y1} C ${x1 + dx} ${y1}, ${x2 - dx} ${y2}, ${x2} ${y2}`}
                  fill="none"
                  stroke={edge.color}
                  strokeWidth={isHighlighted ? "4.5" : "2.5"}
                  strokeOpacity={isDimmed ? 0.15 : isHighlighted ? 1 : 0.85}
                  filter={isHighlighted ? "url(#noodle-glow)" : undefined}
                  className="transition-all duration-150 group-hover:stroke-white group-hover:stroke-[4px]"
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
            const isFlashed = flashNodeId === node.id;
            const theme = getCategoryTheme(node.category);

            // Upstream/Downstream trace calculation
            const isPipelineActive = activePipelineNodes !== null;
            const isPartOfPipeline = activePipelineNodes ? activePipelineNodes.has(node.id) : false;
            const isDimmed = isPipelineActive && !isPartOfPipeline;

            // Count exposed controls on this node
            const nodeExposedCount = controls.filter(
              (c) => (c.node_id === node.id || c.path.includes(`.${node.id}.`)) && c.exposed !== false
            ).length;

            return (
              <div
                key={node.id}
                id={`canvas_node_${node.id}`}
                className={`canvas-node absolute rounded-[8px] border transition-all duration-150 shadow-2xl backdrop-blur-md select-none ${
                  isSelected
                    ? "border-[var(--accent)] ring-2 ring-[var(--accent)]/50 shadow-[0_0_32px_rgba(213,240,111,0.35)] z-20"
                    : isPartOfPipeline
                    ? "border-[var(--accent)]/80 ring-1 ring-[var(--accent)]/30 shadow-[0_0_18px_rgba(213,240,111,0.2)] z-15"
                    : "border-[var(--line-strong)] hover:border-[var(--accent)]/60 z-10"
                } ${isDimmed ? "opacity-35 hover:opacity-100" : "opacity-100"} ${
                  isFlashed ? "animate-bounce ring-4 ring-[var(--accent)]" : ""
                } bg-[var(--surface-raised)]/95`}
                style={{
                  transform: `translate(${pos.x}px, ${pos.y}px)`,
                  width: `${node.width}px`,
                }}
                onMouseEnter={() => setHoveredNodeId(node.id)}
                onMouseLeave={() => setHoveredNodeId((curr) => (curr === node.id ? null : curr))}
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

      {/* BOTTOM-LEFT FLOATING DOCK: Interactive Minimap Radar + Hotkeys Hint */}
      <div className="canvas-hud absolute bottom-4 left-4 z-20 flex flex-col gap-2 font-mono">
        {/* Radar Minimap */}
        {isMinimapVisible ? (
          <div className="w-[230px] rounded-[10px] border border-[var(--line-strong)] bg-[var(--surface-raised)]/95 backdrop-blur-xl shadow-2xl p-2.5 space-y-2 animate-in fade-in duration-200">
            <div className="flex items-center justify-between border-b border-[var(--line)] pb-1.5 text-[10px]">
              <div className="flex items-center gap-1.5 text-[var(--ink)] font-bold">
                <Compass className="h-3.5 w-3.5 text-[var(--accent)]" />
                <span>Radar Minimap</span>
              </div>
              <button
                type="button"
                onClick={() => setIsMinimapVisible(false)}
                className="p-0.5 rounded hover:bg-[var(--surface-soft)] text-[var(--ink-faint)] hover:text-[var(--ink)]"
                title="Collapse Minimap (M)"
              >
                <Minimize2 className="h-3 w-3" />
              </button>
            </div>

            {/* SVG Interactive Radar Canvas */}
            <div className="relative h-[130px] w-full rounded-[6px] border border-[var(--line)] bg-[var(--surface-sunken)] overflow-hidden cursor-crosshair">
              <svg
                ref={minimapSvgRef}
                viewBox={`${minimapBounds.minX} ${minimapBounds.minY} ${minimapBounds.width} ${minimapBounds.height}`}
                className="w-full h-full"
                onPointerDown={(e) => {
                  e.currentTarget.setPointerCapture(e.pointerId);
                  setIsMinimapDragging(true);
                  handleMinimapPointerEvent(e);
                }}
                onPointerMove={(e) => {
                  if (isMinimapDragging) handleMinimapPointerEvent(e);
                }}
                onPointerUp={(e) => {
                  setIsMinimapDragging(false);
                }}
              >
                {/* Mini Nodes */}
                {initialTopology.nodes.map((n) => {
                  const pos = getNodePos(n);
                  const isSelected = selectedNodeId === n.id;
                  const catColor = getCategoryMinimapColor(n.category);

                  return (
                    <rect
                      key={n.id}
                      x={pos.x}
                      y={pos.y}
                      width={n.width}
                      height={n.height}
                      rx="14"
                      fill={catColor}
                      fillOpacity={isSelected ? 1 : 0.75}
                      stroke={isSelected ? "#d5f06f" : "none"}
                      strokeWidth={isSelected ? 12 : 0}
                    />
                  );
                })}

                {/* Viewport Boundary Frame */}
                {containerRef.current && (
                  <rect
                    x={-transform.x / transform.scale}
                    y={-transform.y / transform.scale}
                    width={containerRef.current.clientWidth / transform.scale}
                    height={containerRef.current.clientHeight / transform.scale}
                    fill="rgba(213, 240, 111, 0.12)"
                    stroke="#d5f06f"
                    strokeWidth={Math.max(6 / transform.scale, 8)}
                    strokeDasharray="16 8"
                    rx="8"
                  />
                )}
              </svg>
            </div>

            <div className="flex items-center justify-between text-[8px] text-[var(--ink-faint)] px-0.5">
              <span>Click / Drag to Pan</span>
              <span>[M] Toggle</span>
            </div>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setIsMinimapVisible(true)}
            className="flex items-center gap-1.5 rounded-[6px] border border-[var(--line)] bg-[var(--surface-raised)] px-2.5 py-1.5 text-[10px] font-bold text-[var(--ink-soft)] hover:border-[var(--accent)] hover:text-[var(--accent)] shadow-lg transition-all"
            title="Expand Minimap (Hotkey: M)"
          >
            <Compass className="h-3.5 w-3.5" />
            <span>Minimap</span>
          </button>
        )}
      </div>

      {/* Floating Side Inspector Panel (When a Node is Selected) */}
      {selectedNode && (
        <div className="canvas-hud absolute right-4 top-4 bottom-4 w-[340px] z-30 rounded-[10px] border border-[var(--line-strong)] bg-[var(--surface-raised)]/95 backdrop-blur-xl shadow-2xl flex flex-col justify-between font-mono animate-in slide-in-from-right duration-200">
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
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => centerOnNode(selectedNode.id)}
                  className="p-1 rounded hover:bg-[var(--surface-soft)] text-[var(--ink-soft)] hover:text-[var(--accent)]"
                  title="Center Camera on Node (F)"
                >
                  <Focus className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedNodeId(null)}
                  className="p-1 rounded hover:bg-[var(--surface-soft)] text-[var(--ink-faint)] hover:text-[var(--ink)]"
                  title="Close Inspector (Esc)"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
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
              <div className="flex justify-between">
                <span className="text-[var(--ink-faint)]">Pipeline Status:</span>
                <span className="text-[var(--accent)] font-bold">
                  {selectedNode.inputs.length} In · {selectedNode.outputs.length} Out
                </span>
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

      {/* QUICK SEARCH SPOTLIGHT MODAL (Ctrl+K or /) */}
      {isSearchOpen && (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center pt-24 bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-150"
          onClick={() => setIsSearchOpen(false)}
        >
          <div
            className="w-full max-w-xl rounded-[12px] border border-[var(--line-strong)] bg-[var(--surface-raised)] shadow-2xl font-mono overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Search Input Bar */}
            <div className="flex items-center gap-3 border-b border-[var(--line)] px-4 py-3 bg-[var(--surface-sunken)]">
              <Search className="h-4 w-4 text-[var(--accent)] shrink-0" />
              <input
                ref={searchInputRef}
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  setSearchSelectedIndex(0);
                }}
                onKeyDown={(e) => {
                  if (e.key === "ArrowDown") {
                    e.preventDefault();
                    setSearchSelectedIndex((i) =>
                      Math.min(i + 1, filteredSearchNodes.length - 1)
                    );
                  } else if (e.key === "ArrowUp") {
                    e.preventDefault();
                    setSearchSelectedIndex((i) => Math.max(i - 1, 0));
                  } else if (e.key === "Enter") {
                    e.preventDefault();
                    const target = filteredSearchNodes[searchSelectedIndex];
                    if (target) {
                      centerOnNode(target.id);
                      setIsSearchOpen(false);
                    }
                  }
                }}
                placeholder="Search nodes by title, class, #ID, or category... (e.g. KSampler, LoRA, Seed)"
                className="w-full bg-transparent text-xs font-bold text-[var(--ink)] placeholder:text-[var(--ink-faint)] outline-none"
              />
              <kbd className="rounded border border-[var(--line-strong)] bg-[var(--surface)] px-1.5 py-0.5 text-[9px] text-[var(--ink-faint)]">
                ESC
              </kbd>
            </div>

            {/* Search Results List */}
            <div className="max-h-[340px] overflow-y-auto p-2 divide-y divide-[var(--line)]/30">
              {filteredSearchNodes.length === 0 ? (
                <div className="p-6 text-center text-xs text-[var(--ink-faint)]">
                  No matching nodes found for &ldquo;{searchQuery}&rdquo;.
                </div>
              ) : (
                filteredSearchNodes.map((n, idx) => {
                  const isHighlighted = idx === searchSelectedIndex;
                  const theme = getCategoryTheme(n.category);
                  const exposedCount = controls.filter(
                    (c) => (c.node_id === n.id || c.path.includes(`.${n.id}.`)) && c.exposed !== false
                  ).length;

                  return (
                    <div
                      key={n.id}
                      onClick={() => {
                        centerOnNode(n.id);
                        setIsSearchOpen(false);
                      }}
                      onMouseEnter={() => setSearchSelectedIndex(idx)}
                      className={`flex items-center justify-between p-2.5 rounded-[6px] cursor-pointer transition-colors ${
                        isHighlighted
                          ? "bg-[var(--accent)]/15 border border-[var(--accent)]/40 text-[var(--ink)]"
                          : "hover:bg-[var(--surface-soft)] text-[var(--ink-soft)]"
                      }`}
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <span
                          className={`rounded px-1.5 py-0.2 text-[8px] font-bold uppercase border ${theme}`}
                        >
                          {n.category}
                        </span>
                        <div className="truncate">
                          <span className="text-xs font-bold text-[var(--ink)] mr-2">
                            {n.metaTitle}
                          </span>
                          <span className="text-[10px] text-[var(--ink-faint)] truncate">
                            {n.classType}
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        {exposedCount > 0 && (
                          <span className="rounded bg-[var(--accent)]/20 px-1.5 py-0.2 text-[9px] font-bold text-[var(--accent)]">
                            {exposedCount} exposed
                          </span>
                        )}
                        <span className="font-mono text-[10px] text-[var(--ink-faint)]">
                          #{n.id}
                        </span>
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            {/* Search Footer Hints */}
            <div className="flex items-center justify-between border-t border-[var(--line)] bg-[var(--surface-sunken)] px-4 py-2 text-[9px] text-[var(--ink-faint)]">
              <span>Use ↑ ↓ arrows to select, ↵ Enter to jump</span>
              <span>{filteredSearchNodes.length} nodes indexed</span>
            </div>
          </div>
        </div>
      )}

      {/* KEYBOARD SHORTCUTS HELP MODAL (?) */}
      {showHotkeysHelp && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-150"
          onClick={() => setShowHotkeysHelp(false)}
        >
          <div
            className="w-full max-w-md rounded-[12px] border border-[var(--line-strong)] bg-[var(--surface-raised)] p-5 shadow-2xl font-mono space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-[var(--line)] pb-3">
              <div className="flex items-center gap-2">
                <Keyboard className="h-4 w-4 text-[var(--accent)]" />
                <h3 className="text-xs font-bold uppercase tracking-wider text-[var(--ink)]">
                  Canvas Keyboard Shortcuts
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setShowHotkeysHelp(false)}
                className="p-1 rounded hover:bg-[var(--surface-soft)] text-[var(--ink-faint)] hover:text-[var(--ink)]"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="grid grid-cols-2 gap-2 text-[10px]">
              <div className="flex items-center justify-between rounded border border-[var(--line)] bg-[var(--surface-sunken)] p-2">
                <span className="text-[var(--ink-soft)]">Pan Canvas</span>
                <kbd className="rounded bg-[var(--surface)] border border-[var(--line)] px-1.5 py-0.5 font-bold text-[var(--accent)]">
                  Space + Drag
                </kbd>
              </div>
              <div className="flex items-center justify-between rounded border border-[var(--line)] bg-[var(--surface-sunken)] p-2">
                <span className="text-[var(--ink-soft)]">Spotlight Search</span>
                <kbd className="rounded bg-[var(--surface)] border border-[var(--line)] px-1.5 py-0.5 font-bold text-[var(--accent)]">
                  Ctrl + K
                </kbd>
              </div>
              <div className="flex items-center justify-between rounded border border-[var(--line)] bg-[var(--surface-sunken)] p-2">
                <span className="text-[var(--ink-soft)]">Focus / Fit Graph</span>
                <kbd className="rounded bg-[var(--surface)] border border-[var(--line)] px-1.5 py-0.5 font-bold text-[var(--accent)]">
                  F
                </kbd>
              </div>
              <div className="flex items-center justify-between rounded border border-[var(--line)] bg-[var(--surface-sunken)] p-2">
                <span className="text-[var(--ink-soft)]">Reset Zoom (100%)</span>
                <kbd className="rounded bg-[var(--surface)] border border-[var(--line)] px-1.5 py-0.5 font-bold text-[var(--accent)]">
                  1
                </kbd>
              </div>
              <div className="flex items-center justify-between rounded border border-[var(--line)] bg-[var(--surface-sunken)] p-2">
                <span className="text-[var(--ink-soft)]">Toggle Minimap</span>
                <kbd className="rounded bg-[var(--surface)] border border-[var(--line)] px-1.5 py-0.5 font-bold text-[var(--accent)]">
                  M
                </kbd>
              </div>
              <div className="flex items-center justify-between rounded border border-[var(--line)] bg-[var(--surface-sunken)] p-2">
                <span className="text-[var(--ink-soft)]">Toggle Grid Snap</span>
                <kbd className="rounded bg-[var(--surface)] border border-[var(--line)] px-1.5 py-0.5 font-bold text-[var(--accent)]">
                  G
                </kbd>
              </div>
              <div className="flex items-center justify-between rounded border border-[var(--line)] bg-[var(--surface-sunken)] p-2 col-span-2">
                <span className="text-[var(--ink-soft)]">Deselect / Dismiss</span>
                <kbd className="rounded bg-[var(--surface)] border border-[var(--line)] px-1.5 py-0.5 font-bold text-[var(--accent)]">
                  Escape
                </kbd>
              </div>
            </div>

            <p className="text-[9px] text-[var(--ink-faint)] text-center pt-1">
              Press any shortcut at any time while the canvas is focused.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
