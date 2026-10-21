/**
 * Graph Topology Layout Engine for ComfyUI API Workflows.
 * Converts execution graphs (workflow_api.json) into visual nodes, ports, and bezier link wires.
 */

import { ToolControl } from "@/lib/api";

export interface CanvasNodeInput {
  name: string;
  isLinked: boolean;
  sourceNodeId?: string;
  sourceOutputIndex?: number;
  value?: unknown;
  color: string;
}

export interface CanvasNodeOutput {
  index: number;
  name: string;
  targets: Array<{ nodeId: string; portName: string }>;
  color: string;
}

export interface VisualCanvasNode {
  id: string;
  classType: string;
  metaTitle: string;
  x: number;
  y: number;
  width: number;
  height: number;
  inputs: CanvasNodeInput[];
  outputs: CanvasNodeOutput[];
  category: "loader" | "sampler" | "conditioning" | "latent" | "image" | "output" | "generic";
}

export interface VisualCanvasEdge {
  id: string;
  source: string;
  sourceIndex: number;
  target: string;
  targetPort: string;
  color: string;
}

export interface CanvasGraphTopology {
  nodes: VisualCanvasNode[];
  edges: VisualCanvasEdge[];
  bounds: { minX: number; minY: number; maxX: number; maxY: number };
}

export function getSocketColor(portName: string): string {
  const norm = portName.toLowerCase();
  if (norm.includes("model") || norm.includes("unet")) return "#b388ff"; // Purple
  if (norm.includes("clip") || norm.includes("text")) return "#ffd54f"; // Gold
  if (norm.includes("vae")) return "#ff5252"; // Red
  if (norm.includes("latent") || norm.includes("sample")) return "#ff4081"; // Pink
  if (norm.includes("image") || norm.includes("frame") || norm.includes("pixel")) return "#00e5ff"; // Cyan
  if (norm.includes("mask")) return "#e040fb"; // Violet
  if (norm.includes("cond") || norm.includes("positive") || norm.includes("negative")) return "#ff9100"; // Orange
  return "#d5f06f"; // SoloTensor Accent Lime
}

export function getNodeCategory(classType: string): VisualCanvasNode["category"] {
  const norm = classType.toLowerCase();
  if (norm.includes("loader") || norm.includes("checkpoint") || norm.includes("lora")) return "loader";
  if (norm.includes("sampler") || norm.includes("scheduler")) return "sampler";
  if (norm.includes("clip") || norm.includes("prompt") || norm.includes("condition")) return "conditioning";
  if (norm.includes("latent")) return "latent";
  if (norm.includes("image") || norm.includes("scale") || norm.includes("resize")) return "image";
  if (norm.includes("save") || norm.includes("preview") || norm.includes("video") || norm.includes("vhs")) return "output";
  return "generic";
}

export function computeGraphTopology(
  workflow: Record<string, unknown>,
  existingControls: ToolControl[] = []
): CanvasGraphTopology {
  const nodesMap = new Map<string, VisualCanvasNode>();
  const edges: VisualCanvasEdge[] = [];
  const inDegree: Record<string, number> = {};

  const entries = Object.entries(workflow).filter(
    ([, val]) => val && typeof val === "object" && typeof (val as Record<string, unknown>).class_type === "string"
  ) as [string, { class_type: string; inputs?: Record<string, unknown>; _meta?: { title?: string } }][];

  // Initialize in-degree
  entries.forEach(([nid]) => {
    inDegree[nid] = 0;
  });

  // Extract edges
  entries.forEach(([consumerId, nodeObj]) => {
    const inputs = nodeObj.inputs || {};
    Object.entries(inputs).forEach(([inputName, val]) => {
      if (Array.isArray(val) && val.length > 0 && typeof val[0] === "string") {
        const srcId = val[0];
        const outIdx = typeof val[1] === "number" ? val[1] : 0;
        const color = getSocketColor(inputName);
        edges.push({
          id: `edge_${srcId}_${outIdx}_${consumerId}_${inputName}`,
          source: srcId,
          sourceIndex: outIdx,
          target: consumerId,
          targetPort: inputName,
          color,
        });
        inDegree[consumerId] = (inDegree[consumerId] || 0) + 1;
      }
    });
  });

  // Topological rank calculation
  const levels: Record<string, number> = {};
  const queue: string[] = entries
    .filter(([nid]) => inDegree[nid] === 0)
    .map(([nid]) => nid);

  queue.forEach((nid) => {
    levels[nid] = 0;
  });

  const visited = new Set<string>(queue);
  while (queue.length > 0) {
    const curr = queue.shift()!;
    const currLevel = levels[curr] || 0;

    edges.forEach((edge) => {
      if (edge.source === curr) {
        const target = edge.target;
        levels[target] = Math.max(levels[target] || 0, currLevel + 1);
        if (!visited.has(target)) {
          visited.add(target);
          queue.push(target);
        }
      }
    });
  }

  // Any unreached disconnected nodes get level 0
  entries.forEach(([nid]) => {
    if (levels[nid] === undefined) levels[nid] = 0;
  });

  // Group nodes by level to assign Y coordinates
  const levelBuckets: Record<number, string[]> = {};
  Object.entries(levels).forEach(([nid, lvl]) => {
    if (!levelBuckets[lvl]) levelBuckets[lvl] = [];
    levelBuckets[lvl].push(nid);
  });

  // Layout constants
  const COLUMN_GAP = 380;
  const ROW_GAP = 280;
  const NODE_WIDTH = 260;

  // Build Visual Nodes
  entries.forEach(([nid, nodeObj]) => {
    const lvl = levels[nid] || 0;
    const bucket = levelBuckets[lvl] || [nid];
    const indexInBucket = bucket.indexOf(nid);

    const x = lvl * COLUMN_GAP + 100;
    const y = indexInBucket * ROW_GAP + 100;

    const rawInputs = nodeObj.inputs || {};
    const inputsList: CanvasNodeInput[] = [];

    Object.entries(rawInputs).forEach(([inputName, val]) => {
      const isLinked = Array.isArray(val) && val.length > 0 && typeof val[0] === "string";
      inputsList.push({
        name: inputName,
        isLinked,
        sourceNodeId: isLinked ? (val as [string, number])[0] : undefined,
        sourceOutputIndex: isLinked ? (val as [string, number])[1] : undefined,
        value: !isLinked ? val : undefined,
        color: getSocketColor(inputName),
      });
    });

    // Find outgoing edges from this node
    const outgoing = edges.filter((e) => e.source === nid);
    const outputsMap = new Map<number, CanvasNodeOutput>();

    outgoing.forEach((e) => {
      if (!outputsMap.has(e.sourceIndex)) {
        outputsMap.set(e.sourceIndex, {
          index: e.sourceIndex,
          name: `Output ${e.sourceIndex}`,
          targets: [],
          color: e.color,
        });
      }
      outputsMap.get(e.sourceIndex)!.targets.push({
        nodeId: e.target,
        portName: e.targetPort,
      });
    });

    // Fallback output for terminal nodes if known
    if (outputsMap.size === 0 && !nodeObj.class_type.toLowerCase().includes("save")) {
      outputsMap.set(0, {
        index: 0,
        name: "OUT",
        targets: [],
        color: getSocketColor(nodeObj.class_type),
      });
    }

    const category = getNodeCategory(nodeObj.class_type);
    const metaTitle =
      nodeObj._meta?.title ||
      nodeObj.class_type.replace(/([A-Z])/g, " $1").trim();

    const nodeHeight = Math.max(120, 60 + inputsList.length * 24);

    nodesMap.set(nid, {
      id: nid,
      classType: nodeObj.class_type,
      metaTitle,
      x,
      y,
      width: NODE_WIDTH,
      height: nodeHeight,
      inputs: inputsList,
      outputs: Array.from(outputsMap.values()).sort((a, b) => a.index - b.index),
      category,
    });
  });

  const nodes = Array.from(nodesMap.values());

  // Compute bounding box
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  nodes.forEach((n) => {
    if (n.x < minX) minX = n.x;
    if (n.y < minY) minY = n.y;
    if (n.x + n.width > maxX) maxX = n.x + n.width;
    if (n.y + n.height > maxY) maxY = n.y + n.height;
  });

  if (nodes.length === 0) {
    minX = minY = 0;
    maxX = maxY = 800;
  }

  return {
    nodes,
    edges,
    bounds: {
      minX: minX - 100,
      minY: minY - 100,
      maxX: maxX + 100,
      maxY: maxY + 100,
    },
  };
}
