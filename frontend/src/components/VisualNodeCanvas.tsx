"use client";

import React, { memo, useState, useRef, useEffect, useLayoutEffect, useMemo, useCallback } from "react";
import {
  Activity,
  Check,
  ChevronDown,
  ChevronRight,
  Compass,
  Cpu,
  Crosshair,
  Dices,
  Eye,
  EyeOff,
  Focus,
  FolderOpen,
  Grid,
  Keyboard,
  Link2,
  Magnet,
  Maximize2,
  Minimize2,
  Minus,
  Move,
  PanelRightClose,
  PanelRightOpen,
  Play,
  Plus,
  RotateCcw,
  Search,
  SlidersHorizontal,
  Sparkles,
  Timer,
  Type,
  X,
  Zap,
} from "lucide-react";
import { ToolControl } from "@/lib/api";
import {
  DynamicControl,
  resolveControlMeta,
  type Scalar,
} from "@/components/ToolControlWidget";
import ModelFilePicker from "@/components/ModelFilePicker";
import { modelCategoryForInput, type ModelFileCategory } from "@/lib/comfy-model-inputs";
import {
  computeGraphTopology,
  CanvasGraphTopology,
  VisualCanvasNode,
  VisualCanvasEdge,
  getSocketColor,
} from "@/lib/graph-topology";

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

const EMPTY_CONTROLS: ToolControl[] = [];

/**
 * Numeric row field. Keeps a local text draft so partial input ("0.", "-", "1e")
 * stays visible while typing; commits only values that parse as numbers.
 * Draft resets on blur, so external updates (seed roll) show immediately.
 */
function NodeNumberInput({
  value,
  onCommit,
  className,
  label,
  placeholder,
  step = 1,
}: {
  value: unknown;
  onCommit: (n: number) => void;
  className: string;
  label: string;
  placeholder?: string;
  step?: number;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const shown =
    draft ?? (value === null || value === undefined ? "" : String(value));

  return (
    <input
      type="text"
      inputMode="decimal"
      data-node-control
      value={shown}
      onChange={(e) => {
        const raw = e.target.value;
        setDraft(raw);
        if (raw.trim() !== "" && Number.isFinite(Number(raw))) onCommit(Number(raw));
      }}
      onBlur={() => setDraft(null)}
      onKeyDown={(e) => {
        if (e.key === "Enter") e.currentTarget.blur();
        // Arrows commit the same way the +/- buttons do, without leaving the field.
        if (e.key === "ArrowUp" || e.key === "ArrowDown") {
          e.preventDefault();
          const base = Number(shown) || 0;
          const next = base + (e.key === "ArrowUp" ? step : -step) * (e.shiftKey ? 10 : 1);
          setDraft(null);
          onCommit(next);
        }
      }}
      placeholder={placeholder}
      aria-label={label}
      className={className}
    />
  );
}

type PinOffsets = Record<
  string,
  { inputs: Record<string, number>; outputs: Record<string, number>; header: number }
>;

const pinsEqual = (a: PinOffsets, b: PinOffsets) => {
  const ids = Object.keys(a);
  if (ids.length !== Object.keys(b).length) return false;
  for (const id of ids) {
    const prev = a[id];
    const next = b[id];
    if (!next || prev.header !== next.header) return false;
    if (Object.keys(prev.inputs).length !== Object.keys(next.inputs).length) return false;
    if (Object.keys(prev.outputs).length !== Object.keys(next.outputs).length) return false;
    for (const k in prev.inputs) if (prev.inputs[k] !== next.inputs[k]) return false;
    for (const k in prev.outputs) if (prev.outputs[k] !== next.outputs[k]) return false;
  }
  return true;
};

interface CanvasEdgeViewProps {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  color: string;
  highlighted: boolean;
  dimmed: boolean;
  source: string;
  onHoverEnter: (nodeId: string) => void;
  onHoverLeave: () => void;
}

const CanvasEdgeView = memo(function CanvasEdgeView({
  x1,
  y1,
  x2,
  y2,
  color,
  highlighted,
  dimmed,
  source,
  onHoverEnter,
  onHoverLeave,
}: CanvasEdgeViewProps) {
  const dx = Math.max(Math.abs(x2 - x1) * 0.45, 60);
  const d = `M ${x1} ${y1} C ${x1 + dx} ${y1}, ${x2 - dx} ${y2}, ${x2} ${y2}`;

  return (
    <g
      className="pointer-events-auto cursor-pointer group"
      onMouseEnter={() => onHoverEnter(source)}
      onMouseLeave={onHoverLeave}
    >
      {/* Background Shadow Spline */}
      <path
        d={d}
        fill="none"
        stroke="#000000"
        strokeWidth={highlighted ? "7" : "4"}
        strokeOpacity={dimmed ? "0.15" : "0.6"}
        className="transition-[stroke,stroke-width,stroke-opacity] duration-150"
      />
      {/* Foreground Colored Spline */}
      <path
        d={d}
        fill="none"
        stroke={color}
        strokeWidth={highlighted ? "4.5" : "2.5"}
        strokeOpacity={dimmed ? 0.15 : highlighted ? 1 : 0.85}
        filter={highlighted ? "url(#noodle-glow)" : undefined}
        className="transition-[stroke,stroke-width,stroke-opacity] duration-150 group-hover:stroke-white group-hover:stroke-[4px]"
      />
    </g>
  );
});

interface CanvasNodeViewProps {
  node: VisualCanvasNode;
  x: number;
  y: number;
  selected: boolean;
  flashed: boolean;
  collapsed: boolean;
  pipeline: boolean;
  dimmed: boolean;
  exposedCount: number;
  nodeControls: ToolControl[];
  onHoverEnter: (nodeId: string) => void;
  onHoverLeave: (nodeId: string) => void;
  onSelect: (nodeId: string) => void;
  onNodePointerDown: (e: React.PointerEvent, nodeId: string) => void;
  onToggleCollapse: (nodeId: string) => void;
  onToggleExpose: (node: VisualCanvasNode, inputName: string, value: unknown) => void;
  onInputChange: (nodeId: string, inputName: string, value: unknown) => void;
}

const CanvasNodeView = memo(function CanvasNodeView({
  node,
  x,
  y,
  selected,
  flashed,
  collapsed,
  pipeline,
  dimmed,
  exposedCount,
  nodeControls,
  onHoverEnter,
  onHoverLeave,
  onSelect,
  onNodePointerDown,
  onToggleCollapse,
  onToggleExpose,
  onInputChange,
}: CanvasNodeViewProps) {
  const theme = getCategoryTheme(node.category);

  return (
    <div
      id={`canvas_node_${node.id}`}
      className={`canvas-node absolute rounded-[8px] border transition-colors duration-150 shadow-2xl select-none ${
        selected
          ? "border-[var(--accent)] ring-2 ring-[var(--accent)]/50 shadow-[0_0_32px_rgba(199,227,106,0.35)] z-20"
          : pipeline
          ? "border-[var(--accent)]/80 ring-1 ring-[var(--accent)]/30 shadow-[0_0_18px_rgba(199,227,106,0.2)] z-15"
          : "border-[var(--line-strong)] hover:border-[var(--accent)]/60 z-10"
      } ${dimmed ? "opacity-35 hover:opacity-100" : "opacity-100"} ${
        flashed ? "animate-bounce ring-4 ring-[var(--accent)]" : ""
      } bg-[var(--surface-raised)]/95`}
      style={{
        transform: `translate(${x}px, ${y}px)`,
        width: `${node.width}px`,
      }}
      onMouseEnter={() => onHoverEnter(node.id)}
      onMouseLeave={() => onHoverLeave(node.id)}
      onClick={(e) => {
        e.stopPropagation();
        onSelect(node.id);
      }}
    >
      {/* Node Header (Draggable Handle & Collapse Toggle) */}
      <div
        onPointerDown={(e) => onNodePointerDown(e, node.id)}
        onDoubleClick={(e) => {
          e.stopPropagation();
          onToggleCollapse(node.id);
        }}
        className={`flex items-center justify-between border-b border-[var(--line)] bg-[var(--surface-sunken)] px-3 py-2 cursor-grab active:cursor-grabbing rounded-t-[7px] ${
          collapsed ? "rounded-b-[7px] border-b-0" : ""
        }`}
      >
        <div className="flex items-center gap-1.5 truncate">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onToggleCollapse(node.id);
            }}
            className="p-0.5 rounded hover:bg-[var(--surface)] text-[var(--ink-faint)] hover:text-[var(--ink)]"
            title={collapsed ? "Expand Node" : "Collapse Node"}
          >
            {collapsed ? (
              <ChevronRight className="h-3 w-3" />
            ) : (
              <ChevronDown className="h-3 w-3" />
            )}
          </button>
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
          {exposedCount > 0 && (
            <span className="flex items-center gap-0.5 rounded border border-[color-mix(in_srgb,var(--accent)_30%,transparent)] bg-[color-mix(in_srgb,var(--accent)_15%,transparent)] px-1 py-0.2 font-mono text-[8px] font-bold text-[var(--accent)]">
              <Zap className="h-2 w-2" />
              <span>{exposedCount}</span>
            </span>
          )}
          <span className="font-mono text-[9px] text-[var(--ink-faint)]">
            #{node.id}
          </span>
        </div>
      </div>

      {/* Node Body: Ports & Parameters (Hidden when collapsed) */}
      {!collapsed && (
        <div className="p-2 text-[10px] font-mono">
          {/* Inputs List — one row per input, shared name/value/action columns */}
          <div className="space-y-0.5">
            {node.inputs.map((inp) => {
              const ctrl = nodeControls.find((c) => c.input_name === inp.name);
              const isExposed = !!ctrl && ctrl.exposed !== false;
              const effectiveVal = ctrl?.default ?? ctrl?.value ?? inp.value;

              const isNum = typeof inp.value === "number" || typeof effectiveVal === "number";
              const isSeed = inp.name.toLowerCase().includes("seed");
              const isBool =
                typeof inp.value === "boolean" || typeof effectiveVal === "boolean";
              const isPrompt =
                typeof inp.value === "string" &&
                (inp.name.toLowerCase().includes("text") ||
                  inp.name.toLowerCase().includes("prompt"));
              const step =
                inp.name === "cfg" || inp.name === "guidance" ? 0.5 : 1;
              const numVal = Number(effectiveVal) || 0;

              // Shared control skin: sunken field, lime caret, visible focus ring.
              const fieldCls =
                "h-6 w-full min-w-0 rounded-[4px] border border-[var(--line)] bg-[var(--surface-sunken)] px-1.5 text-[10px] text-[var(--ink)] placeholder:text-[var(--ink-faint)] outline-none transition-colors caret-[var(--accent)] hover:border-[var(--line-strong)] focus-visible:border-[var(--accent)] focus-visible:ring-1 focus-visible:ring-[var(--accent)]";
              const stepBtnCls =
                "flex h-6 w-5 shrink-0 items-center justify-center rounded-[4px] border border-[var(--line)] bg-[var(--surface)] text-[var(--ink-soft)] transition-colors hover:border-[var(--accent)] hover:text-[var(--accent)] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--accent)]";

              return (
                <div
                  key={inp.name}
                  className={`group/inp flex flex-wrap gap-1 rounded-[4px] px-1 ${
                    isPrompt ? "items-center py-1" : "min-h-[24px] items-center"
                  } hover:bg-[color-mix(in_srgb,var(--surface)_50%,transparent)]`}
                >
                  {/* Socket Port Dot — wire geometry is measured from this element */}
                  <span
                    data-socket-input={inp.name}
                    className="h-2 w-2 shrink-0 rounded-full border border-black/40 shadow-sm"
                    style={{ backgroundColor: inp.color }}
                    title={`${inp.name} (${inp.isLinked ? "Connected" : "Parameter"})`}
                  />

                  {/* Name column — fixed width keeps every value column aligned.
                      The essential marker lives inside it so the value column never shifts. */}
                  <span className="flex w-[66px] shrink-0 items-center gap-1">
                    <span
                      className={`truncate text-[10px] leading-none ${
                        inp.isLinked
                          ? "font-medium text-[var(--ink-soft)]"
                          : "font-semibold text-[var(--ink)]"
                      }`}
                      title={inp.name}
                    >
                      {inp.name}
                    </span>
                    {!inp.isLinked && isEssentialInput(inp.name) && (
                      <span
                        className="flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-[3px] border border-[color-mix(in_srgb,var(--accent)_30%,transparent)] bg-[color-mix(in_srgb,var(--accent)_15%,transparent)] text-[var(--accent)]"
                        title="Essential Generation Parameter"
                      >
                        {isSeed ? (
                          <Dices className="h-2.5 w-2.5" aria-hidden="true" />
                        ) : inp.name === "cfg" || inp.name === "guidance" ? (
                          <SlidersHorizontal className="h-2.5 w-2.5" aria-hidden="true" />
                        ) : inp.name === "steps" ? (
                          <Timer className="h-2.5 w-2.5" aria-hidden="true" />
                        ) : (
                          <Maximize2 className="h-2.5 w-2.5" aria-hidden="true" />
                        )}
                      </span>
                    )}
                  </span>

                  {inp.isLinked ? (
                    /* Wired input: quiet one-line marker, no editor */
                    <span className="ml-auto flex items-center gap-1 text-[9px] leading-none text-[var(--ink-faint)]">
                      <Link2 className="h-2.5 w-2.5" aria-hidden="true" />
                      linked
                    </span>
                  ) : (
                    <>
                      {/* Value column: identical left/right edges on every row; step and
                          roll affordances live inside it so text fields get full width.
                          Prompts drop to a full-width second line to keep a readable measure. */}
                      <div
                        className={
                          isPrompt
                            ? "order-last w-full basis-full pt-0.5"
                            : "flex min-w-0 flex-1 items-center gap-0.5"
                        }
                        onClick={(e) => e.stopPropagation()}
                      >
                        {isSeed ? (
                          <>
                            <NodeNumberInput
                              value={effectiveVal}
                              onCommit={(n) => onInputChange(node.id, inp.name, n)}
                              placeholder="random"
                              label={inp.name}
                              className={`${fieldCls} tabular-nums`}
                            />
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                onInputChange(
                                  node.id,
                                  inp.name,
                                  Math.floor(Math.random() * 1e14)
                                );
                              }}
                              className={stepBtnCls}
                              title="Roll New Random Seed"
                              aria-label="Roll new random seed"
                            >
                              <Dices className="h-3 w-3" />
                            </button>
                          </>
                        ) : isNum ? (
                          <>
                            <NodeNumberInput
                              value={effectiveVal}
                              onCommit={(n) => onInputChange(node.id, inp.name, n)}
                              placeholder="0"
                              label={inp.name}
                              step={step}
                              className={`${fieldCls} tabular-nums`}
                            />
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                onInputChange(node.id, inp.name, Math.max(0, numVal - step));
                              }}
                              className={stepBtnCls}
                              title={`Decrease ${inp.name} by ${step}`}
                              aria-label={`Decrease ${inp.name}`}
                            >
                              <Minus className="h-3 w-3" />
                            </button>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                onInputChange(node.id, inp.name, numVal + step);
                              }}
                              className={stepBtnCls}
                              title={`Increase ${inp.name} by ${step}`}
                              aria-label={`Increase ${inp.name}`}
                            >
                              <Plus className="h-3 w-3" />
                            </button>
                          </>
                        ) : isBool ? (
                          <button
                            type="button"
                            role="switch"
                            data-node-control
                            aria-checked={Boolean(effectiveVal)}
                            aria-label={inp.name}
                            onClick={(e) => {
                              e.stopPropagation();
                              onInputChange(node.id, inp.name, !Boolean(effectiveVal));
                            }}
                            className={`flex h-6 w-full items-center justify-between rounded-[4px] border px-1.5 text-[10px] font-semibold transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--accent)] ${
                              Boolean(effectiveVal)
                                ? "border-[color-mix(in_srgb,var(--accent)_50%,transparent)] bg-[color-mix(in_srgb,var(--accent)_15%,transparent)] text-[var(--accent)]"
                                : "border-[var(--line)] bg-[var(--surface-sunken)] text-[var(--ink-faint)]"
                            }`}
                          >
                            <span>{Boolean(effectiveVal) ? "true" : "false"}</span>
                            <span
                              className={`h-2 w-2 rounded-full ${
                                Boolean(effectiveVal)
                                  ? "bg-[var(--accent)]"
                                  : "bg-[var(--ink-faint)]"
                              }`}
                            />
                          </button>
                        ) : isPrompt ? (
                          <textarea
                            data-node-control
                            value={String(effectiveVal ?? "")}
                            onChange={(e) => onInputChange(node.id, inp.name, e.target.value)}
                            placeholder="Enter prompt text..."
                            rows={2}
                            aria-label={inp.name}
                            className="w-full resize-none rounded-[4px] border border-[var(--line)] bg-[var(--surface-sunken)] px-1.5 py-1 text-[10px] leading-[1.35] text-[var(--ink)] outline-none transition-colors caret-[var(--accent)] placeholder:text-[var(--ink-faint)] hover:border-[var(--line-strong)] focus-visible:border-[var(--accent)] focus-visible:ring-1 focus-visible:ring-[var(--accent)]"
                          />
                        ) : (
                          <input
                            type="text"
                            data-node-control
                            value={String(effectiveVal ?? "")}
                            onChange={(e) => onInputChange(node.id, inp.name, e.target.value)}
                            placeholder="empty"
                            aria-label={inp.name}
                            title={String(effectiveVal ?? "")}
                            className={fieldCls}
                          />
                        )}
                      </div>

                      {/* Expose affordance: fixed trailing column, so every value field
                          ends on the same edge. Quiet until hover or published. */}
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onToggleExpose(node, inp.name, inp.value);
                        }}
                        className={`flex h-6 w-5 shrink-0 items-center justify-center rounded-[4px] transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--accent)] ${
                          isPrompt ? "ml-auto" : ""
                        } ${
                          isExposed
                            ? "bg-[var(--accent)] text-[var(--accent-ink)]"
                            : "text-[var(--ink-faint)] opacity-40 hover:text-[var(--accent)] group-hover/inp:opacity-100 focus-visible:opacity-100"
                        }`}
                        title={isExposed ? "Exposed to users" : "Expose as UI parameter"}
                        aria-label={
                          isExposed
                            ? `Unexpose ${inp.name} from tool form`
                            : `Expose ${inp.name} as a UI parameter`
                        }
                        aria-pressed={isExposed}
                      >
                        <Zap className={`h-3 w-3 ${isExposed ? "fill-current" : ""}`} />
                      </button>
                    </>
                  )}
                </div>
              );
            })}
          </div>

          {/* Outputs List */}
          {node.outputs.length > 0 && (
            <div className="mt-1.5 pt-1.5 border-t border-[color-mix(in_srgb,var(--line)_60%,transparent)] space-y-0.5">
              {node.outputs.map((out) => (
                <div
                  key={out.index}
                  className="flex min-h-[22px] items-center justify-end gap-1.5 text-right"
                >
                  <span className="text-[9px] text-[var(--ink-faint)] uppercase leading-none">
                    {out.name}
                  </span>
                  <span
                    data-socket-output={out.index}
                    className="h-2 w-2 rounded-full shrink-0 border border-black/40 shadow-sm"
                    style={{ backgroundColor: out.color }}
                    title={`${out.name} (Slot ${out.index})`}
                  />
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
});

export interface VisualNodeCanvasProps {
  workflow: Record<string, unknown>;
  controls: ToolControl[];
  onControlsChange: (controls: ToolControl[]) => void;
  onWorkflowChange?: (workflow: Record<string, unknown>) => void;
  className?: string;
}

export default function VisualNodeCanvas({
  workflow,
  controls,
  onControlsChange,
  onWorkflowChange,
  className = "",
}: VisualNodeCanvasProps) {
  // Graph topology memoized from workflow (controls never affect layout)
  const initialTopology = useMemo(() => {
    return computeGraphTopology(workflow);
  }, [workflow]);

  // Node position overrides state (allows dragging nodes)
  const [nodePositions, setNodePositions] = useState<Record<string, { x: number; y: number }>>({});

  // Collapsed node IDs state (minimize utility nodes)
  const [collapsedNodeIds, setCollapsedNodeIds] = useState<Set<string>>(new Set());

  // Viewport pan & zoom transform
  const [transform, setTransform] = useState<{ x: number; y: number; scale: number }>({
    x: 60,
    y: 60,
    scale: 0.85,
  });

  // Dragging state (refs: never read during render, so no re-render per frame)
  const isPanningRef = useRef(false);
  const panStartRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const draggingNodeIdRef = useRef<string | null>(null);
  const nodeDragOffsetRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  // Pointer capture is taken on the first move, not on down: capturing on down retargets
  // the ensuing click to the container and breaks buttons inside nodes.
  const pointerCapturedRef = useRef(false);
  const capturedPointerIdRef = useRef<number | null>(null);
  const pointerDownPosRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });

  // Grid snap state (default 20px)
  const [snapToGrid, setSnapToGrid] = useState(true);
  const GRID_SIZE = 20;
  const snapToGridRef = useRef(snapToGrid);
  snapToGridRef.current = snapToGrid;

  // Visual toggles
  const [showFormPreview, setShowFormPreview] = useState(false);

  // Measured socket-dot centers (vertical offset from node root, unscaled CSS px)
  const [pinOffsets, setPinOffsets] = useState<PinOffsets>({});

  // Selected & Hovered nodes for pipeline trace & side inspector
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [pickerTarget, setPickerTarget] = useState<
    { nodeId: string; inputName: string; category: ModelFileCategory } | null
  >(null);
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
  const isSpaceDownRef = useRef(isSpaceDown);
  isSpaceDownRef.current = isSpaceDown;
  const [showHotkeysHelp, setShowHotkeysHelp] = useState(false);

  // Form preview drawer visibility

  const containerRef = useRef<HTMLDivElement>(null);

  // Latest-value mirrors so pointer handlers can stay identity-stable
  const transformRef = useRef(transform);
  transformRef.current = transform;
  // Index maps & adjacency lists — rebuilt only when their inputs change
  const nodeById = useMemo(() => {
    const map = new Map<string, VisualCanvasNode>();
    for (const n of initialTopology.nodes) map.set(n.id, n);
    return map;
  }, [initialTopology.nodes]);

  const positions = useMemo(() => {
    const map = new Map<string, { x: number; y: number }>();
    for (const n of initialTopology.nodes) {
      map.set(n.id, nodePositions[n.id] || { x: n.x, y: n.y });
    }
    return map;
  }, [initialTopology.nodes, nodePositions]);

  const controlsByNode = useMemo(() => {
    const map = new Map<string, ToolControl[]>();
    for (const n of initialTopology.nodes) {
      map.set(
        n.id,
        controls.filter((c) => c.node_id === n.id || c.path.includes(`.${n.id}.`))
      );
    }
    return map;
  }, [initialTopology.nodes, controls]);

  const adjacency = useMemo(() => {
    const upstream = new Map<string, VisualCanvasEdge[]>();
    const downstream = new Map<string, VisualCanvasEdge[]>();
    for (const edge of initialTopology.edges) {
      const up = upstream.get(edge.target);
      if (up) up.push(edge);
      else upstream.set(edge.target, [edge]);
      const down = downstream.get(edge.source);
      if (down) down.push(edge);
      else downstream.set(edge.source, [edge]);
    }
    return { upstream, downstream };
  }, [initialTopology.edges]);

  // Latest-value mirrors for the identity-stable pointer handlers
  const nodeByIdRef = useRef(nodeById);
  nodeByIdRef.current = nodeById;
  const positionsRef = useRef(positions);
  positionsRef.current = positions;

  // Viewport size tracked by ResizeObserver (never read during render)
  const [containerSize, setContainerSize] = useState({ width: 0, height: 0 });

  useEffect(() => {
    const el = containerRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver((entries) => {
      const rect = entries[0]?.contentRect;
      if (!rect) return;
      setContainerSize((prev) =>
        prev.width === rect.width && prev.height === rect.height
          ? prev
          : { width: rect.width, height: rect.height }
      );
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // Measure helper: observer value when populated, direct measurement as fallback (mount)
  const measureViewport = useCallback(() => {
    const el = containerRef.current;
    return {
      width: containerSize.width || el?.clientWidth || 0,
      height: containerSize.height || el?.clientHeight || 0,
    };
  }, [containerSize.width, containerSize.height]);

  // Auto-fit to view
  const fitToView = useCallback(() => {
    const { width: clientWidth, height: clientHeight } = measureViewport();
    if (!clientWidth && !clientHeight) return;
    const { bounds } = initialTopology;

    const graphWidth = Math.max(bounds.maxX - bounds.minX, 400);
    const graphHeight = Math.max(bounds.maxY - bounds.minY, 400);

    const scaleX = (clientWidth - (showFormPreview ? 460 : 160)) / graphWidth;
    const scaleY = (clientHeight - 160) / graphHeight;
    const scale = Math.min(Math.max(Math.min(scaleX, scaleY), 0.3), 1.2);

    const x = ((clientWidth - (showFormPreview ? 340 : 0)) - graphWidth * scale) / 2 - bounds.minX * scale;
    const y = (clientHeight - graphHeight * scale) / 2 - bounds.minY * scale;

    setTransform({ x, y, scale });
  }, [initialTopology, showFormPreview, measureViewport]);

  // Center camera on a specific node with a flash indicator
  const centerOnNode = useCallback(
    (nodeId: string) => {
      const targetNode = nodeByIdRef.current.get(nodeId);
      if (!targetNode) return;
      const pos = positionsRef.current.get(nodeId) || { x: targetNode.x, y: targetNode.y };
      const { width: clientWidth, height: clientHeight } = measureViewport();
      if (!clientWidth && !clientHeight) return;

      const scale = transformRef.current.scale;
      const x = ((clientWidth - (showFormPreview ? 340 : 0)) / 2) - (pos.x + targetNode.width / 2) * scale;
      const y = clientHeight / 2 - (pos.y + targetNode.height / 2) * scale;

      setTransform({ x, y, scale });
      setSelectedNodeId(nodeId);
      setFlashNodeId(nodeId);
      setTimeout(() => setFlashNodeId((curr) => (curr === nodeId ? null : curr)), 1400);
    },
    [showFormPreview, measureViewport]
  );

  // Fit to view once mounted (bounds are stable numbers across value edits)
  useEffect(() => {
    fitToView();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    initialTopology.bounds.minX,
    initialTopology.bounds.minY,
    initialTopology.bounds.maxX,
    initialTopology.bounds.maxY,
    showFormPreview,
  ]);

  // Reset node positions to auto-layout
  const handleResetLayout = () => {
    setNodePositions({});
    setCollapsedNodeIds(new Set());
    fitToView();
  };

  // Toggle node collapsed state
  const toggleNodeCollapse = useCallback((nodeId: string) => {
    setCollapsedNodeIds((prev) => {
      const next = new Set(prev);
      if (next.has(nodeId)) next.delete(nodeId);
      else next.add(nodeId);
      return next;
    });
  }, []);

  // Wheel zoom — native listener so preventDefault actually applies (React's root wheel is passive)
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const onWheel = (e: WheelEvent) => {
      if ((e.target as HTMLElement | null)?.closest?.(".canvas-hud")) return;
      // A focused prompt box scrolls its own text instead of zooming the world.
      if (
        e.target instanceof HTMLTextAreaElement &&
        document.activeElement === e.target
      ) {
        return;
      }
      e.preventDefault();

      const zoomFactor = 1.1;
      const rect = el.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;

      setTransform((prev) => {
        const clampedScale = Math.min(
          Math.max(e.deltaY < 0 ? prev.scale * zoomFactor : prev.scale / zoomFactor, 0.2),
          2.5
        );
        const ratio = clampedScale / prev.scale;
        return {
          x: mouseX - (mouseX - prev.x) * ratio,
          y: mouseY - (mouseY - prev.y) * ratio,
          scale: clampedScale,
        };
      });
    };

    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

  // Pointer down on canvas (pan start)
  const handleCanvasMouseDown = useCallback((e: React.PointerEvent) => {
    const { x, y } = transformRef.current;
    pointerDownPosRef.current = { x: e.clientX, y: e.clientY };
    if (e.button === 1 || isSpaceDownRef.current) {
      e.preventDefault();
      isPanningRef.current = true;
      panStartRef.current = { x: e.clientX - x, y: e.clientY - y };
      return;
    }

    if (
      (e.target as HTMLElement).closest(".canvas-node") ||
      (e.target as HTMLElement).closest(".canvas-hud")
    ) {
      return;
    }

    isPanningRef.current = true;
    panStartRef.current = { x: e.clientX - x, y: e.clientY - y };
  }, []);

  // Pointer down on node header (node drag start)
  const handleNodeMouseDown = useCallback(
    (e: React.PointerEvent, nodeId: string) => {
      if (isSpaceDownRef.current || e.button === 1) {
        handleCanvasMouseDown(e);
        return;
      }

      e.stopPropagation();
      setSelectedNodeId(nodeId);
      pointerDownPosRef.current = { x: e.clientX, y: e.clientY };

      const { scale } = transformRef.current;
      const targetNode = nodeByIdRef.current.get(nodeId);
      const currentPos = positionsRef.current.get(nodeId) || {
        x: targetNode?.x ?? 0,
        y: targetNode?.y ?? 0,
      };

      draggingNodeIdRef.current = nodeId;
      nodeDragOffsetRef.current = {
        x: e.clientX / scale - currentPos.x,
        y: e.clientY / scale - currentPos.y,
      };
    },
    [handleCanvasMouseDown]
  );

  // Pointer move handler (pan or node drag)
  const handleMouseMove = useCallback((e: React.PointerEvent) => {
    if (!isPanningRef.current && !draggingNodeIdRef.current) return;

    // Capture only once the pointer has actually travelled, so plain clicks keep their
    // native target (capturing on down retargets the click to the container).
    if (!pointerCapturedRef.current) {
      const start = pointerDownPosRef.current;
      if (Math.hypot(e.clientX - start.x, e.clientY - start.y) < 4) return;
      containerRef.current?.setPointerCapture(e.pointerId);
      capturedPointerIdRef.current = e.pointerId;
      pointerCapturedRef.current = true;
    }

    if (isPanningRef.current) {
      const start = panStartRef.current;
      setTransform((prev) => ({
        ...prev,
        x: e.clientX - start.x,
        y: e.clientY - start.y,
      }));
    } else if (draggingNodeIdRef.current) {
      const nodeId = draggingNodeIdRef.current;
      const offset = nodeDragOffsetRef.current;
      const scale = transformRef.current.scale;

      let newX = e.clientX / scale - offset.x;
      let newY = e.clientY / scale - offset.y;

      if (snapToGridRef.current) {
        newX = Math.round(newX / GRID_SIZE) * GRID_SIZE;
        newY = Math.round(newY / GRID_SIZE) * GRID_SIZE;
      }

      setNodePositions((prev) => ({
        ...prev,
        [nodeId]: { x: Math.round(newX), y: Math.round(newY) },
      }));
    }
  }, []);

  // Pointer up handler (also used for lost pointer capture)
  const releaseCapture = useCallback(() => {
    const el = containerRef.current;
    const pointerId = capturedPointerIdRef.current;
    if (el && pointerCapturedRef.current && pointerId !== null && el.hasPointerCapture(pointerId)) {
      el.releasePointerCapture(pointerId);
    }
    pointerCapturedRef.current = false;
    capturedPointerIdRef.current = null;
    isPanningRef.current = false;
    draggingNodeIdRef.current = null;
  }, []);

  // Release on a pointerup anywhere: the first move may never reach the container,
  // so a drag could otherwise stay armed after the button is already up.
  useEffect(() => {
    window.addEventListener("pointerup", releaseCapture);
    window.addEventListener("pointercancel", releaseCapture);
    return () => {
      window.removeEventListener("pointerup", releaseCapture);
      window.removeEventListener("pointercancel", releaseCapture);
    };
  }, [releaseCapture]);

  // Global Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const activeEl = document.activeElement;
      // Any focus inside a node's row controls is editing, not navigating: typing "f", "g",
      // "m", "p", "1" or Space must never fit/snap/toggle/minimap. Covering inputs,
      // textareas and the boolean switch (a focusable button) alike.
      const isInput =
        activeEl instanceof HTMLInputElement ||
        activeEl instanceof HTMLTextAreaElement ||
        (activeEl as HTMLElement)?.isContentEditable ||
        !!activeEl?.closest?.(".canvas-node [data-node-control]");

      if (e.key === "Escape") {
        releaseCapture();
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

      if (isInput) return;

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

      if (e.code === "Space" && !e.repeat) {
        setIsSpaceDown(true);
      }

      if (e.key === "f" || e.key === "F") {
        e.preventDefault();
        if (selectedNodeId) {
          centerOnNode(selectedNodeId);
        } else {
          fitToView();
        }
      }

      if (e.key === "1") {
        e.preventDefault();
        setTransform((prev) => ({ ...prev, scale: 1.0 }));
      }

      if (e.key === "m" || e.key === "M") {
        setIsMinimapVisible((v) => !v);
      }

      if (e.key === "g" || e.key === "G") {
        setSnapToGrid((v) => !v);
      }

      if (e.key === "p" || e.key === "P") {
        setShowFormPreview((v) => !v);
      }

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
  }, [isSearchOpen, selectedNodeId, showHotkeysHelp, centerOnNode, fitToView, releaseCapture]);

  // Focus search input when modal opens
  useEffect(() => {
    if (isSearchOpen) {
      setSearchQuery("");
      setSearchSelectedIndex(0);
      setTimeout(() => searchInputRef.current?.focus(), 50);
    }
  }, [isSearchOpen]);

  // Controller helpers
  const isControlExposed = useCallback(
    (nodeId: string, inputName: string) => {
      const list = controlsByNode.get(nodeId);
      return !!list?.some((c) => c.input_name === inputName && c.exposed !== false);
    },
    [controlsByNode]
  );

  const getExistingControl = useCallback(
    (nodeId: string, inputName: string): ToolControl | undefined => {
      return controlsByNode.get(nodeId)?.find((c) => c.input_name === inputName);
    },
    [controlsByNode]
  );

  const toggleControlExposure = useCallback(
    (node: VisualCanvasNode, inputName: string, value: unknown) => {
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
    },
    [controls, getExistingControl, onControlsChange]
  );

  // Inline value mutator (updates control default and workflow value if callback provided)
  const handleUpdateInputValue = useCallback(
    (nodeId: string, inputName: string, newValue: unknown) => {
      // 1. Update control if exposed
      const ctrl = getExistingControl(nodeId, inputName);
      if (ctrl) {
        onControlsChange(
          controls.map((c) =>
            c.id === ctrl.id
              ? { ...c, default: newValue as string | number | boolean, value: newValue as string | number | boolean }
              : c
          )
        );
      }

      // 2. Update raw workflow graph if onWorkflowChange is connected
      if (onWorkflowChange) {
        const nodeObj = workflow[nodeId] as Record<string, unknown> | undefined;
        if (nodeObj && typeof nodeObj === "object") {
          onWorkflowChange({
            ...workflow,
            [nodeId]: {
              ...nodeObj,
              inputs: {
                ...((nodeObj.inputs || {}) as Record<string, unknown>),
                [inputName]: newValue,
              },
            },
          });
        }
      }
    },
    [controls, getExistingControl, onControlsChange, onWorkflowChange, workflow]
  );

  const updateControlLabel = (controlId: string, label: string) => {
    onControlsChange(
      controls.map((c) => (c.id === controlId ? { ...c, label } : c))
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
    return nodeById.get(selectedNodeId) || null;
  }, [selectedNodeId, nodeById]);

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
      for (const edge of adjacency.upstream.get(curr) ?? []) {
        edgesSet.add(edge.id);
        if (!visitedUpstream.has(edge.source)) {
          visitedUpstream.add(edge.source);
          nodesSet.add(edge.source);
          upstreamQueue.push(edge.source);
        }
      }
    }

    // Downstream traversal (nodes/edges activeId feeds INTO)
    const downstreamQueue: string[] = [activeId];
    const visitedDownstream = new Set<string>([activeId]);
    while (downstreamQueue.length > 0) {
      const curr = downstreamQueue.shift()!;
      for (const edge of adjacency.downstream.get(curr) ?? []) {
        edgesSet.add(edge.id);
        if (!visitedDownstream.has(edge.target)) {
          visitedDownstream.add(edge.target);
          nodesSet.add(edge.target);
          downstreamQueue.push(edge.target);
        }
      }
    }

    return { activePipelineNodes: nodesSet, activePipelineEdges: edgesSet };
  }, [hoveredNodeId, selectedNodeId, adjacency]);

  // Measure socket-dot and header centers after layout (never during render).
  // Node roots are position:absolute, so offsetTop is already relative to the node
  // and unaffected by the world transform's scale. Drag/pan do not re-run this.
  useLayoutEffect(() => {
    const next: PinOffsets = {};
    for (const node of initialTopology.nodes) {
      const nodeEl = document.getElementById(`canvas_node_${node.id}`);
      if (!nodeEl) continue;
      const headerEl = nodeEl.firstElementChild as HTMLElement | null;
      if (!headerEl) continue;
      const header = headerEl.offsetTop + headerEl.offsetHeight / 2;
      const inputs: Record<string, number> = {};
      const outputs: Record<string, number> = {};
      nodeEl.querySelectorAll<HTMLElement>("[data-socket-input]").forEach((el) => {
        const key = el.getAttribute("data-socket-input");
        if (key !== null) inputs[key] = el.offsetTop + el.offsetHeight / 2;
      });
      nodeEl.querySelectorAll<HTMLElement>("[data-socket-output]").forEach((el) => {
        const key = el.getAttribute("data-socket-output");
        if (key !== null) outputs[key] = el.offsetTop + el.offsetHeight / 2;
      });
      next[node.id] = { inputs, outputs, header };
    }
    setPinOffsets((prev) => (pinsEqual(prev, next) ? prev : next));
  }, [initialTopology.nodes, collapsedNodeIds, workflow]);

  // Minimap dynamic bounds calculation including custom positions
  const minimapBounds = useMemo(() => {
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;

    initialTopology.nodes.forEach((n) => {
      const pos = positions.get(n.id) || { x: n.x, y: n.y };
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
  }, [initialTopology.nodes, positions]);

  // Interactive Minimap Pan by Click or Drag
  const handleMinimapPointerEvent = (e: React.PointerEvent<SVGSVGElement>) => {
    if (!minimapSvgRef.current) return;
    const rect = minimapSvgRef.current.getBoundingClientRect();
    const relX = Math.min(Math.max((e.clientX - rect.left) / rect.width, 0), 1);
    const relY = Math.min(Math.max((e.clientY - rect.top) / rect.height, 0), 1);

    const worldX = minimapBounds.minX + relX * minimapBounds.width;
    const worldY = minimapBounds.minY + relY * minimapBounds.height;

    const { width: clientWidth, height: clientHeight } = measureViewport();
    setTransform((prev) => ({
      ...prev,
      x: ((clientWidth - (showFormPreview ? 340 : 0)) / 2) - worldX * prev.scale,
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

  const exposedControlsList = useMemo(() => {
    return controls.filter((c) => c.exposed !== false);
  }, [controls]);

  // Stable hover callbacks so memoized nodes/edges can bail out
  const handleHoverEnter = useCallback((nodeId: string) => {
    setHoveredNodeId(nodeId);
  }, []);
  const handleHoverLeave = useCallback((nodeId?: string) => {
    setHoveredNodeId((curr) => (nodeId === undefined || curr === nodeId ? null : curr));
  }, []);
  const handleSelectNode = useCallback((nodeId: string) => {
    setSelectedNodeId(nodeId);
  }, []);
  const handleClearHover = useCallback(() => {
    setHoveredNodeId(null);
  }, []);

  return (
    <div
      ref={containerRef}
      onPointerDown={handleCanvasMouseDown}
      onPointerMove={handleMouseMove}
      onPointerUp={releaseCapture}
      onPointerCancel={releaseCapture}
      onLostPointerCapture={releaseCapture}
      className={`relative w-full h-full overflow-hidden select-none bg-[var(--ground)] ${
        isSpaceDown ? "cursor-grab active:cursor-grabbing" : "cursor-default"
      } ${className}`}
      style={{
        touchAction: "none",
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
          className="flex items-center gap-1 px-2.5 py-1 rounded bg-[var(--accent)]/15 border border-[var(--accent)]/40 text-[var(--accent)] hover:bg-[var(--accent)]/25 font-bold transition shadow-[0_0_8px_rgba(199,227,106,0.2)]"
          title="Expose Essential Parameters (Seed, Dimensions, CFG, Steps)"
        >
          <Zap className="h-3.5 w-3.5 fill-current" />
          <span className="text-[10px]">Expose Essentials</span>
        </button>

        {/* Live Form Preview Trigger */}
        <button
          type="button"
          onClick={() => setShowFormPreview(!showFormPreview)}
          className={`flex items-center gap-1.5 px-2.5 py-1 rounded font-bold transition-all ${
            showFormPreview
              ? "bg-[var(--accent)] text-[var(--accent-ink)] shadow-md"
              : "border border-[var(--line)] bg-[var(--surface-sunken)] text-[var(--ink-soft)] hover:border-[var(--accent)] hover:text-[var(--accent)]"
          }`}
          title="Toggle End-User Tool Form Preview (Hotkey: P)"
        >
          <Eye className="h-3.5 w-3.5" />
          <span className="text-[10px]">Form Preview ({exposedControlsList.length})</span>
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
              <feGaussianBlur stdDeviation="3.5" result="blur" />
              <feComposite in="SourceGraphic" in2="blur" operator="over" />
            </filter>
          </defs>

          {/* Bezier Noodles */}
          {initialTopology.edges.map((edge) => {
            const srcNode = nodeById.get(edge.source);
            const tgtNode = nodeById.get(edge.target);
            if (!srcNode || !tgtNode) return null;

            const srcPos = positions.get(edge.source) || { x: srcNode.x, y: srcNode.y };
            const tgtPos = positions.get(edge.target) || { x: tgtNode.x, y: tgtNode.y };

            const isSrcCollapsed = collapsedNodeIds.has(srcNode.id);
            const isTgtCollapsed = collapsedNodeIds.has(tgtNode.id);

            // Endpoint Y from measured pin centers; node center until the first measurement lands
            const srcPins = pinOffsets[edge.source];
            const tgtPins = pinOffsets[edge.target];

            const tgtY = isTgtCollapsed
              ? tgtPos.y + (tgtPins?.header ?? tgtNode.height / 2)
              : tgtPos.y + (tgtPins?.inputs[edge.targetPort] ?? tgtNode.height / 2);

            const srcY = isSrcCollapsed
              ? srcPos.y + (srcPins?.header ?? srcNode.height / 2)
              : srcPos.y + (srcPins?.outputs[edge.sourceIndex] ?? srcNode.height / 2);

            const isHighlighted = activePipelineEdges ? activePipelineEdges.has(edge.id) : false;
            const isDimmed = activePipelineEdges !== null && !isHighlighted;

            return (
              <CanvasEdgeView
                key={edge.id}
                x1={srcPos.x + srcNode.width}
                y1={srcY}
                x2={tgtPos.x}
                y2={tgtY}
                color={edge.color}
                highlighted={isHighlighted}
                dimmed={isDimmed}
                source={edge.source}
                onHoverEnter={handleHoverEnter}
                onHoverLeave={handleClearHover}
              />
            );
          })}
        </svg>

        {/* Nodes Layer */}
        <div className="absolute inset-0 pointer-events-auto">
          {initialTopology.nodes.map((node) => {
            const pos = positions.get(node.id) || { x: node.x, y: node.y };
            const isPartOfPipeline = activePipelineNodes
              ? activePipelineNodes.has(node.id)
              : false;
            const nodeControls = controlsByNode.get(node.id) ?? EMPTY_CONTROLS;
            let exposedCount = 0;
            for (const c of nodeControls) if (c.exposed !== false) exposedCount++;

            return (
              <CanvasNodeView
                key={node.id}
                node={node}
                x={pos.x}
                y={pos.y}
                selected={selectedNodeId === node.id}
                flashed={flashNodeId === node.id}
                collapsed={collapsedNodeIds.has(node.id)}
                pipeline={isPartOfPipeline}
                dimmed={activePipelineNodes !== null && !isPartOfPipeline}
                exposedCount={exposedCount}
                nodeControls={nodeControls}
                onHoverEnter={handleHoverEnter}
                onHoverLeave={handleHoverLeave}
                onSelect={handleSelectNode}
                onNodePointerDown={handleNodeMouseDown}
                onToggleCollapse={toggleNodeCollapse}
                onToggleExpose={toggleControlExposure}
                onInputChange={handleUpdateInputValue}
              />
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
                  const pos = positions.get(n.id) || { x: n.x, y: n.y };
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
                      stroke={isSelected ? "#c7e36a" : "none"}
                      strokeWidth={isSelected ? 12 : 0}
                    />
                  );
                })}

                {/* Viewport Boundary Frame */}
                {containerSize.width > 0 && (
                  <rect
                    x={-transform.x / transform.scale}
                    y={-transform.y / transform.scale}
                    width={(containerSize.width - (showFormPreview ? 340 : 0)) / transform.scale}
                    height={containerSize.height / transform.scale}
                    fill="rgba(199, 227, 106, 0.12)"
                    stroke="#c7e36a"
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

      {/* Floating Side Inspector Panel (When a Node is Selected & Form Preview is NOT open) */}
      {selectedNode && !showFormPreview && (
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
                      const modelCategory = modelCategoryForInput(inp.name, selectedNode.classType);

                      return (
                        <div
                          key={inp.name}
                          className={`rounded-[6px] border p-3 space-y-2 transition-all ${
                            isExposed
                              ? "border-[var(--accent)]/50 bg-[var(--surface-sunken)]"
                              : "border-[var(--line)] bg-[var(--surface-sunken)]/30 opacity-70"
                          }`}
                        >
                          <div className="flex items-center justify-between gap-1">
                            <label className="text-[10px] font-bold text-[var(--ink)] truncate max-w-[180px]">
                              {inp.name}
                            </label>
                            <div className="flex items-center gap-1 shrink-0">
                              {modelCategory && (
                                <button
                                  type="button"
                                  onClick={() =>
                                    setPickerTarget({ nodeId: selectedNode.id, inputName: inp.name, category: modelCategory })
                                  }
                                  className="rounded border border-[var(--line)] bg-[var(--surface)] px-2 py-0.5 text-[9px] font-bold text-[var(--ink-soft)] hover:text-[var(--ink)]"
                                  aria-label={`Browse model files for ${inp.name}`}
                                >
                                  Browse
                                </button>
                              )}
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

      {/* LIVE END-USER TOOL FORM PREVIEW DRAWER (When showFormPreview is true) */}
      {showFormPreview && (
        <div className="canvas-hud absolute right-4 top-4 bottom-4 w-[360px] z-30 rounded-[12px] border border-[var(--line-strong)] bg-[var(--surface-raised)]/95 backdrop-blur-xl shadow-2xl flex flex-col justify-between font-mono animate-in slide-in-from-right duration-200">
          <div className="p-4 space-y-4 overflow-y-auto">
            {/* Header */}
            <div className="flex items-center justify-between border-b border-[var(--line)] pb-3">
              <div className="space-y-0.5">
                <div className="flex items-center gap-1.5 text-[9px] uppercase tracking-wider text-[var(--accent)] font-bold">
                  <Eye className="h-3.5 w-3.5" />
                  <span>Live Tool Preview</span>
                </div>
                <h3 className="text-xs font-bold text-[var(--ink)]">
                  End-User Form Mockup
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setShowFormPreview(false)}
                className="p-1 rounded hover:bg-[var(--surface-soft)] text-[var(--ink-faint)] hover:text-[var(--ink)]"
                title="Close Form Preview"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Form Controls List */}
            {exposedControlsList.length === 0 ? (
              <div className="rounded-[8px] border border-dashed border-[var(--line-strong)] bg-[var(--surface-sunken)] p-6 text-center space-y-2">
                <SlidersHorizontal className="h-6 w-6 text-[var(--ink-faint)] mx-auto" />
                <p className="text-xs font-bold text-[var(--ink)]">No Parameters Exposed</p>
                <p className="text-[10px] text-[var(--ink-faint)]">
                  Click &ldquo;Expose&rdquo; on any node input or use &ldquo;Expose Essentials&rdquo; to build your tool form.
                </p>
              </div>
            ) : (
              <div className="space-y-3.5">
                {exposedControlsList.map((ctrl, idx) => {
                  const node = workflow[ctrl.node_id] as
                    | { inputs?: Record<string, unknown> }
                    | undefined;
                  const value = (ctrl.default ??
                    node?.inputs?.[ctrl.input_name] ??
                    ctrl.value) as Scalar;
                  return (
                    <DynamicControl
                      key={ctrl.id}
                      control={ctrl}
                      value={value}
                      busy={false}
                      meta={resolveControlMeta(ctrl, idx, exposedControlsList)}
                      onChange={(v) =>
                        handleUpdateInputValue(ctrl.node_id, ctrl.input_name, v)
                      }
                    />
                  );
                })}
              </div>
            )}
          </div>

          {/* Form Mockup Footer Action */}
          <div className="p-3 border-t border-[var(--line)] bg-[var(--surface-sunken)] space-y-2">
            <button
              type="button"
              className="w-full flex items-center justify-center gap-2 rounded-[6px] bg-[var(--accent)] py-2 text-[11px] font-bold uppercase tracking-wider text-[var(--accent-ink)] shadow-[0_0_14px_rgba(199,227,106,0.25)] hover:bg-[var(--accent-hover)] transition-all"
            >
              <Zap className="h-3.5 w-3.5" />
              <span>Generate Output ⚡</span>
            </button>
            <p className="text-[8px] text-[var(--ink-faint)] text-center">
              Preview updates live as nodes and parameters are configured.
            </p>
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
              <div className="flex items-center justify-between rounded border border-[var(--line)] bg-[var(--surface-sunken)] p-2">
                <span className="text-[var(--ink-soft)]">Live Form Preview</span>
                <kbd className="rounded bg-[var(--surface)] border border-[var(--line)] px-1.5 py-0.5 font-bold text-[var(--accent)]">
                  P
                </kbd>
              </div>
              <div className="flex items-center justify-between rounded border border-[var(--line)] bg-[var(--surface-sunken)] p-2">
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

      <ModelFilePicker
        open={pickerTarget !== null}
        category={pickerTarget?.category ?? "checkpoints"}
        title={pickerTarget ? `Select ${pickerTarget.inputName}` : undefined}
        onSelect={(filename) => {
          if (!pickerTarget) return;
          handleUpdateInputValue(pickerTarget.nodeId, pickerTarget.inputName, filename);
        }}
        onClose={() => setPickerTarget(null)}
      />
    </div>
  );
}
