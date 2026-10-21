"use client";

import { useState, useMemo } from "react";
import {
  Check,
  ChevronRight,
  Cpu,
  Dices,
  Layers,
  Link as LucideLink,
  Plus,
  Search,
  SlidersHorizontal,
  Sparkles,
  Type,
  X,
  Zap,
} from "lucide-react";
import {
  type ToolControl,
  type ToolNodeInfo,
  type ToolNodeInput,
} from "@/lib/api";

export interface NodeParameterExplorerProps {
  open: boolean;
  onClose: () => void;
  availableNodes: ToolNodeInfo[];
  existingControlIds: string[];
  onAddControl: (control: ToolControl) => void;
}

export default function NodeParameterExplorer({
  open,
  onClose,
  availableNodes,
  existingControlIds,
  onAddControl,
}: NodeParameterExplorerProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [selectedInputName, setSelectedInputName] = useState<string | null>(null);

  // Controller configuration form state
  const [customLabel, setCustomLabel] = useState("");
  const [customKind, setCustomKind] = useState<ToolControl["kind"]>("number");
  const [minVal, setMinVal] = useState<number>(0);
  const [maxVal, setMaxVal] = useState<number>(100);
  const [stepVal, setStepVal] = useState<number>(1);
  const [defaultValue, setDefaultValue] = useState<string | number | boolean>("");
  const [successToast, setSuccessToast] = useState<string | null>(null);

  // Filtered nodes based on search query
  const filteredNodes = useMemo(() => {
    if (!searchQuery.trim()) return availableNodes;
    const q = searchQuery.toLowerCase();
    return availableNodes.filter(
      (n) =>
        n.id.toLowerCase().includes(q) ||
        n.class_type.toLowerCase().includes(q) ||
        (n.title && n.title.toLowerCase().includes(q))
    );
  }, [availableNodes, searchQuery]);

  // Active selected node
  const activeNode = useMemo(() => {
    if (!selectedNodeId) return filteredNodes[0] || null;
    return availableNodes.find((n) => n.id === selectedNodeId) || null;
  }, [availableNodes, filteredNodes, selectedNodeId]);

  // Active selected input
  const activeInput = useMemo(() => {
    if (!activeNode || !selectedInputName) return null;
    return activeNode.inputs.find((i: ToolNodeInput) => i.name === selectedInputName) || null;
  }, [activeNode, selectedInputName]);

  const handleSelectInputToConfigure = (node: ToolNodeInfo, input: ToolNodeInput) => {
    setSelectedNodeId(node.id);
    setSelectedInputName(input.name);

    // Smart defaults based on input characteristics
    const cleanLabel = (node.title ? `${node.title} ` : "") + input.name
      .replace(/_/g, " ")
      .replace(/\b\w/g, (c: string) => c.toUpperCase());
    setCustomLabel(cleanLabel);

    if (input.type_hint === "number") {
      const val = typeof input.value === "number" ? input.value : 0;
      setDefaultValue(val);
      if (input.name.toLowerCase().includes("seed")) {
        setCustomKind("seed");
        setMinVal(-1);
        setMaxVal(4294967295);
        setStepVal(1);
      } else if (input.name.toLowerCase().includes("denoise") || input.name.toLowerCase().includes("strength")) {
        setCustomKind("number");
        setMinVal(0);
        setMaxVal(1);
        setStepVal(0.05);
      } else if (input.name.toLowerCase().includes("cfg") || input.name.toLowerCase().includes("guidance")) {
        setCustomKind("number");
        setMinVal(0);
        setMaxVal(30);
        setStepVal(0.5);
      } else if (input.name.toLowerCase().includes("step")) {
        setCustomKind("number");
        setMinVal(1);
        setMaxVal(100);
        setStepVal(1);
      } else {
        setCustomKind("number");
        setMinVal(0);
        setMaxVal(Math.max(100, val * 2 || 100));
        setStepVal(val < 1 ? 0.05 : 1);
      }
    } else if (input.type_hint === "boolean") {
      setCustomKind("boolean");
      setDefaultValue(Boolean(input.value));
    } else {
      if (input.name.toLowerCase().includes("prompt") || input.name.toLowerCase().includes("text")) {
        setCustomKind("prompt");
      } else {
        setCustomKind("text");
      }
      setDefaultValue(typeof input.value === "string" ? input.value : "");
    }
  };

  const handleCommitController = () => {
    if (!activeNode || !activeInput) return;

    const controlId = `nodes.${activeNode.id}.inputs.${activeInput.name}`;
    const isNum = customKind === "number" || customKind === "seed";

    const newControl: ToolControl = {
      id: controlId,
      path: controlId,
      node_id: activeNode.id,
      input_name: activeInput.name,
      label: customLabel.trim() || activeInput.name,
      meta_title: activeNode.title || activeNode.class_type,
      kind: customKind,
      value: defaultValue,
      default: defaultValue,
      numeric: isNum,
      seed: customKind === "seed",
      options: [],
      min: isNum ? minVal : null,
      max: isNum ? maxVal : null,
      minimum: isNum ? minVal : null,
      maximum: isNum ? maxVal : null,
      step: isNum ? stepVal : null,
      exposed: true,
    };

    onAddControl(newControl);
    setSuccessToast(`Added "${newControl.label}" to parameters!`);
    setSelectedInputName(null);
    setTimeout(() => setSuccessToast(null), 2500);
  };

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="explorer-title"
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/80 backdrop-blur-md p-4 animate-in fade-in duration-150"
    >
      <div className="relative flex h-[85vh] w-full max-w-5xl flex-col rounded-[12px] border border-[var(--line-strong)] bg-[var(--surface)] text-[var(--ink)] shadow-2xl overflow-hidden font-sans">
        {/* Header Bar */}
        <header className="flex h-14 shrink-0 items-center justify-between border-b border-[var(--line)] bg-[var(--surface-raised)] px-6">
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-[5px] border border-[var(--line-strong)] bg-[var(--surface-sunken)] text-[var(--accent)] shadow-sm">
              <Cpu className="h-4 w-4" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-mono text-[9px] font-bold tracking-widest text-[var(--accent)] uppercase">
                  GRAPH INSPECTOR
                </span>
                <span className="font-mono text-[9px] text-[var(--line-strong)]">/</span>
                <span className="font-mono text-[9px] text-[var(--ink-faint)] uppercase">
                  NODE FUNCTION CONTROLLER EXPLORER
                </span>
              </div>
              <h2
                id="explorer-title"
                className="font-mono text-xs font-bold uppercase tracking-wider text-[var(--ink)]"
              >
                Inspect Graph Nodes &amp; Expose Custom Controls
              </h2>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {successToast && (
              <span className="inline-flex items-center gap-1.5 rounded-[5px] border border-emerald-500/40 bg-emerald-500/10 px-2.5 py-1 font-mono text-[10px] font-bold text-emerald-400 animate-in fade-in">
                <Check className="h-3 w-3" />
                <span>{successToast}</span>
              </span>
            )}
            <button
              type="button"
              onClick={onClose}
              aria-label="Close Explorer"
              className="flex h-7 w-7 items-center justify-center rounded-[5px] border border-[var(--line)] bg-[var(--surface)] text-[var(--ink-faint)] hover:border-[var(--line-strong)] hover:text-[var(--ink)] transition-colors"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        </header>

        {/* Dual-Pane Workspace */}
        <div className="flex flex-1 min-h-0 overflow-hidden">
          {/* Left Pane: All Graph Nodes */}
          <div className="w-[320px] lg:w-[360px] shrink-0 border-r border-[var(--line)] bg-[var(--surface-raised)]/50 flex flex-col">
            {/* Search Input */}
            <div className="p-3 border-b border-[var(--line)]">
              <div className="relative">
                <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[var(--ink-faint)]" />
                <input
                  type="search"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Filter nodes by ID or class name…"
                  className="h-8 w-full rounded border border-[var(--line)] bg-[var(--surface-sunken)] pl-8 pr-3 font-mono text-[11px] text-[var(--ink)] placeholder:text-[var(--ink-faint)] outline-none focus:border-[var(--accent)]"
                />
              </div>
              <div className="mt-2 flex items-center justify-between font-mono text-[9px] text-[var(--ink-faint)] px-1">
                <span>Total Nodes: {availableNodes.length}</span>
                <span>Matches: {filteredNodes.length}</span>
              </div>
            </div>

            {/* Nodes List */}
            <div className="flex-1 overflow-y-auto p-2 space-y-1">
              {filteredNodes.length === 0 ? (
                <div className="p-6 text-center font-mono text-[11px] text-[var(--ink-faint)]">
                  No nodes found matching &quot;{searchQuery}&quot;
                </div>
              ) : (
                filteredNodes.map((node) => {
                  const isSelected = activeNode?.id === node.id;
                  const unlinkedCount = node.inputs.filter((i: ToolNodeInput) => !i.is_linked).length;

                  return (
                    <button
                      key={node.id}
                      type="button"
                      onClick={() => {
                        setSelectedNodeId(node.id);
                        setSelectedInputName(null);
                      }}
                      className={`flex w-full items-center justify-between rounded-[6px] border p-2.5 text-left transition-all ${
                        isSelected
                          ? "border-[var(--accent)] bg-[var(--accent)]/15 text-[var(--accent)] shadow-sm"
                          : "border-transparent bg-[var(--surface)] text-[var(--ink)] hover:border-[var(--line)] hover:bg-[var(--surface-soft)]"
                      }`}
                    >
                      <div className="min-w-0 pr-2">
                        <div className="flex items-center gap-1.5">
                          <span className="font-mono text-[9px] font-bold px-1 rounded bg-[var(--surface-sunken)] border border-[var(--line)] text-[var(--ink-soft)]">
                            #{node.id}
                          </span>
                          <span className="font-mono text-xs font-bold truncate">
                            {node.title || node.class_type}
                          </span>
                        </div>
                        <p className="font-mono text-[9px] text-[var(--ink-faint)] truncate mt-0.5">
                          {node.class_type}
                        </p>
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0">
                        <span className="font-mono text-[9px] text-[var(--ink-faint)]">
                          {unlinkedCount} {unlinkedCount === 1 ? "input" : "inputs"}
                        </span>
                        <ChevronRight className="h-3 w-3 opacity-60" />
                      </div>
                    </button>
                  );
                })
              )}
            </div>
          </div>

          {/* Right Pane: Selected Node Inputs & Controller Customizer */}
          <div className="flex-1 overflow-y-auto p-6 bg-[var(--surface-sunken)] flex flex-col justify-between">
            {activeNode ? (
              <div className="space-y-5 max-w-3xl">
                {/* Node Identity Card */}
                <div className="rounded-[8px] border border-[var(--line)] bg-[var(--surface-raised)] p-4 shadow-sm">
                  <div className="flex items-center justify-between pb-2 border-b border-[var(--line)]">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs font-bold text-[var(--accent)]">
                        Node #{activeNode.id}
                      </span>
                      <span className="text-[var(--line)]">/</span>
                      <span className="font-mono text-xs font-bold text-[var(--ink)]">
                        {activeNode.title || activeNode.class_type}
                      </span>
                    </div>
                    <span className="rounded border border-[var(--line)] bg-[var(--surface-sunken)] px-2 py-0.5 font-mono text-[9px] text-[var(--ink-faint)]">
                      {activeNode.class_type}
                    </span>
                  </div>
                  <p className="mt-2 font-mono text-[10px] text-[var(--ink-faint)]">
                    Select any literal input from this node to expose it as an interactive controller on your tool form.
                  </p>
                </div>

                {/* Node Inputs List */}
                <div className="space-y-3">
                  <span className="font-mono text-[10px] font-bold uppercase tracking-wider text-[var(--ink-soft)] block">
                    Available Node Inputs ({activeNode.inputs.length}):
                  </span>

                  <div className="grid grid-cols-1 gap-2">
                    {activeNode.inputs.map((inp: ToolNodeInput) => {
                      const controlId = `nodes.${activeNode.id}.inputs.${inp.name}`;
                      const isAlreadyExposed = existingControlIds.includes(controlId);
                      const isConfiguring = activeInput?.name === inp.name;

                      return (
                        <div
                          key={inp.name}
                          className={`rounded-[6px] border p-3 transition-all ${
                            isConfiguring
                              ? "border-[var(--accent)] bg-[var(--surface-raised)] shadow-md"
                              : "border-[var(--line)] bg-[var(--surface)] hover:border-[var(--line-strong)]"
                          }`}
                        >
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <div className="space-y-0.5 min-w-0">
                              <div className="flex items-center gap-2">
                                <span className="font-mono text-xs font-bold text-[var(--ink)]">
                                  {inp.name}
                                </span>
                                <span className="rounded bg-[var(--surface-sunken)] border border-[var(--line)] px-1.5 py-0.2 font-mono text-[8px] font-bold text-[var(--ink-faint)] uppercase">
                                  {inp.type_hint}
                                </span>
                              </div>

                              <p className="font-mono text-[10px] text-[var(--ink-faint)] truncate max-w-md">
                                {inp.is_linked ? (
                                  <span className="text-zinc-500 flex items-center gap-1">
                                    <LucideLink className="h-3 w-3" />
                                    <span>Wired to upstream link port (dynamic input)</span>
                                  </span>
                                ) : (
                                  <span>
                                    Default value:{" "}
                                    <strong className="text-[var(--ink-soft)] font-mono">
                                      {inp.value !== null && inp.value !== undefined
                                        ? String(inp.value)
                                        : "—"}
                                    </strong>
                                  </span>
                                )}
                              </p>
                            </div>

                            <div>
                              {inp.is_linked ? (
                                <span className="font-mono text-[9px] text-[var(--ink-faint)]">
                                  Linked Port
                                </span>
                              ) : isAlreadyExposed ? (
                                <span className="inline-flex items-center gap-1 rounded bg-[var(--accent)]/10 border border-[var(--accent)]/30 px-2 py-1 font-mono text-[9px] font-bold text-[var(--accent)]">
                                  <Check className="h-3 w-3" />
                                  <span>Already Exposed</span>
                                </span>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => handleSelectInputToConfigure(activeNode, inp)}
                                  className="inline-flex items-center gap-1 rounded-[5px] bg-[var(--accent)] px-2.5 py-1 font-mono text-[10px] font-bold uppercase tracking-wider text-[var(--accent-ink)] hover:bg-[var(--accent-hover)] transition-all"
                                >
                                  <Plus className="h-3 w-3" />
                                  <span>Configure ⚡</span>
                                </button>
                              )}
                            </div>
                          </div>

                          {/* Inline Controller Builder Sub-panel */}
                          {isConfiguring && (
                            <div className="mt-4 pt-3 border-t border-[var(--line)] space-y-3 animate-in fade-in duration-150">
                              <span className="font-mono text-[10px] font-bold uppercase tracking-wider text-[var(--accent)] flex items-center gap-1">
                                <Sparkles className="h-3.5 w-3.5" />
                                <span>Create Controller for &quot;{inp.name}&quot;</span>
                              </span>

                              {/* Label */}
                              <div>
                                <label className="mb-1 block font-mono text-[9px] font-bold uppercase text-[var(--ink-soft)]">
                                  Display Label on Form <span className="text-[var(--accent)]">*</span>
                                </label>
                                <input
                                  value={customLabel}
                                  onChange={(e) => setCustomLabel(e.target.value)}
                                  placeholder="e.g. Guidance Strength, Step Count, Quality"
                                  className="workspace-field h-8 w-full rounded border border-[var(--line)] bg-[var(--surface-sunken)] px-3 font-mono text-xs text-[var(--ink)] focus:border-[var(--accent)] outline-none"
                                />
                              </div>

                              {/* Kind */}
                              <div>
                                <label className="mb-1 block font-mono text-[9px] font-bold uppercase text-[var(--ink-soft)]">
                                  Controller Widget Kind
                                </label>
                                <div className="flex flex-wrap gap-1.5 font-mono text-[10px]">
                                  {[
                                    { kind: "number", label: "Slider / Number" },
                                    { kind: "seed", label: "Seed Randomizer" },
                                    { kind: "prompt", label: "Prompt Textarea" },
                                    { kind: "text", label: "Single Text" },
                                    { kind: "boolean", label: "Toggle Switch" },
                                  ].map((k) => (
                                    <button
                                      key={k.kind}
                                      type="button"
                                      onClick={() => setCustomKind(k.kind as ToolControl["kind"])}
                                      className={`rounded px-2.5 py-1 border transition ${
                                        customKind === k.kind
                                          ? "border-[var(--accent)] bg-[var(--accent)] text-[var(--accent-ink)] font-bold shadow-sm"
                                          : "border-[var(--line)] bg-[var(--surface-sunken)] text-[var(--ink-soft)] hover:text-[var(--ink)]"
                                      }`}
                                    >
                                      {k.label}
                                    </button>
                                  ))}
                                </div>
                              </div>

                              {/* Numeric Bounds if number */}
                              {(customKind === "number" || customKind === "seed") && (
                                <div className="grid grid-cols-3 gap-2 font-mono text-[10px]">
                                  <div>
                                    <label className="mb-0.5 block text-[9px] font-bold text-[var(--ink-soft)]">
                                      Minimum
                                    </label>
                                    <input
                                      type="number"
                                      value={minVal}
                                      onChange={(e) => setMinVal(parseFloat(e.target.value) || 0)}
                                      className="workspace-field h-7 w-full rounded border border-[var(--line)] bg-[var(--surface-sunken)] px-2"
                                    />
                                  </div>
                                  <div>
                                    <label className="mb-0.5 block text-[9px] font-bold text-[var(--ink-soft)]">
                                      Maximum
                                    </label>
                                    <input
                                      type="number"
                                      value={maxVal}
                                      onChange={(e) => setMaxVal(parseFloat(e.target.value) || 100)}
                                      className="workspace-field h-7 w-full rounded border border-[var(--line)] bg-[var(--surface-sunken)] px-2"
                                    />
                                  </div>
                                  <div>
                                    <label className="mb-0.5 block text-[9px] font-bold text-[var(--ink-soft)]">
                                      Step
                                    </label>
                                    <input
                                      type="number"
                                      value={stepVal}
                                      onChange={(e) => setStepVal(parseFloat(e.target.value) || 1)}
                                      className="workspace-field h-7 w-full rounded border border-[var(--line)] bg-[var(--surface-sunken)] px-2"
                                    />
                                  </div>
                                </div>
                              )}

                              {/* Action Buttons */}
                              <div className="flex items-center justify-end gap-2 pt-2 border-t border-[var(--line)]">
                                <button
                                  type="button"
                                  onClick={() => setSelectedInputName(null)}
                                  className="rounded border border-[var(--line)] bg-[var(--surface)] px-3 py-1 font-mono text-[10px] text-[var(--ink-soft)] hover:text-[var(--ink)]"
                                >
                                  Cancel
                                </button>
                                <button
                                  type="button"
                                  onClick={handleCommitController}
                                  className="inline-flex items-center gap-1.5 rounded-[5px] bg-[var(--accent)] px-3.5 py-1 font-mono text-[10px] font-bold uppercase tracking-wider text-[var(--accent-ink)] hover:bg-[var(--accent-hover)] transition-all shadow-sm"
                                >
                                  <Zap className="h-3 w-3" />
                                  <span>Add Controller to Tool ⚡</span>
                                </button>
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            ) : (
              <div className="m-auto text-center font-mono text-xs text-[var(--ink-faint)]">
                Select a node from the left pane to explore its configurable inputs.
              </div>
            )}

            {/* Footer summary */}
            <div className="pt-4 border-t border-[var(--line)] flex items-center justify-between font-mono text-[10px] text-[var(--ink-faint)]">
              <span>Any configured controller is automatically injected into ComfyUI at execution time.</span>
              <button
                type="button"
                onClick={onClose}
                className="rounded border border-[var(--line)] bg-[var(--surface)] px-3 py-1 font-bold text-[var(--ink)] hover:border-[var(--line-strong)]"
              >
                Done Exploring
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
