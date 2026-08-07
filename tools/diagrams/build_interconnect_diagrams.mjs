import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const sharp = require("sharp");

const here = path.dirname(fileURLToPath(import.meta.url));
const assets = path.resolve(here, "../../docs/concepts/assets");
fs.mkdirSync(assets, { recursive: true });

const C = {
  ink: "#14213d",
  muted: "#506079",
  faint: "#f7f9fc",
  line: "#263d78",
  blue: "#3767e8",
  blueBg: "#edf2ff",
  cyan: "#13a9c6",
  cyanBg: "#eafafd",
  green: "#149447",
  greenBg: "#edf9f1",
  red: "#d83742",
  redBg: "#fff1f1",
  amber: "#f1a208",
  amberBg: "#fff8df",
  purple: "#6748d6",
  purpleBg: "#f4f0ff",
  gray: "#7a8baa",
  white: "#ffffff",
};

const esc = (value) =>
  String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");

function text(x, y, value, options = {}) {
  const {
    size = 18,
    weight = 500,
    fill = C.ink,
    anchor = "start",
    family = "Chalkboard SE, Comic Sans MS, ui-rounded, sans-serif",
    opacity = 1,
  } = options;
  return `<text x="${x}" y="${y}" text-anchor="${anchor}" font-family="${family}" font-size="${size}" font-weight="${weight}" fill="${fill}" opacity="${opacity}">${esc(value)}</text>`;
}

function multiline(x, y, lines, options = {}) {
  const {
    size = 16,
    weight = 500,
    fill = C.ink,
    anchor = "start",
    lineHeight = size * 1.3,
  } = options;
  const spans = lines
    .map(
      (line, index) =>
        `<tspan x="${x}" dy="${index === 0 ? 0 : lineHeight}">${esc(line)}</tspan>`,
    )
    .join("");
  return `<text x="${x}" y="${y}" text-anchor="${anchor}" font-family="Chalkboard SE, Comic Sans MS, ui-rounded, sans-serif" font-size="${size}" font-weight="${weight}" fill="${fill}">${spans}</text>`;
}

function box(x, y, width, height, options = {}) {
  const {
    fill = C.white,
    stroke = C.line,
    strokeWidth = 2,
    radius = 12,
    dash = "",
    shadow = true,
  } = options;
  return `<rect x="${x}" y="${y}" width="${width}" height="${height}" rx="${radius}" fill="${fill}" stroke="${stroke}" stroke-width="${strokeWidth}"${dash ? ` stroke-dasharray="${dash}"` : ""}${shadow ? ' filter="url(#softShadow)"' : ""}/>`;
}

function arrow(x1, y1, x2, y2, options = {}) {
  const {
    stroke = C.blue,
    width = 3,
    dash = "",
    both = false,
    head = true,
  } = options;
  const arrowHead = (fromX, fromY, tipX, tipY) => {
    const dx = tipX - fromX;
    const dy = tipY - fromY;
    const length = Math.hypot(dx, dy) || 1;
    const unitX = dx / length;
    const unitY = dy / length;
    const size = 11;
    const halfWidth = 6;
    const baseX = tipX - unitX * size;
    const baseY = tipY - unitY * size;
    const perpX = -unitY * halfWidth;
    const perpY = unitX * halfWidth;
    return `<polygon points="${tipX},${tipY} ${baseX + perpX},${baseY + perpY} ${baseX - perpX},${baseY - perpY}" fill="${stroke}"/>`;
  };
  return [
    `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${stroke}" stroke-width="${width}"${dash ? ` stroke-dasharray="${dash}"` : ""}/>` ,
    both ? arrowHead(x2, y2, x1, y1) : "",
    head ? arrowHead(x1, y1, x2, y2) : "",
  ].join("");
}

function defs() {
  return `<defs>
    <filter id="softShadow" x="-20%" y="-20%" width="140%" height="140%">
      <feDropShadow dx="0" dy="3" stdDeviation="3" flood-color="#14213d" flood-opacity="0.12"/>
    </filter>
    <style>text { letter-spacing: 0; }</style>
  </defs>`;
}

function chipIcon(x, y, accent = C.blue, scale = 1) {
  const w = 42 * scale;
  const h = 42 * scale;
  return [
    `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${7 * scale}" fill="${accent}" opacity="0.12" stroke="${accent}" stroke-width="${2 * scale}"/>`,
    `<rect x="${x + 11 * scale}" y="${y + 11 * scale}" width="${20 * scale}" height="${20 * scale}" fill="none" stroke="${accent}" stroke-width="${2 * scale}"/>`,
    ...[8, 17, 26, 35].flatMap((offset) => [
      `<line x1="${x + offset * scale}" y1="${y - 4 * scale}" x2="${x + offset * scale}" y2="${y + 5 * scale}" stroke="${accent}" stroke-width="${2 * scale}"/>`,
      `<line x1="${x + offset * scale}" y1="${y + h - 5 * scale}" x2="${x + offset * scale}" y2="${y + h + 4 * scale}" stroke="${accent}" stroke-width="${2 * scale}"/>`,
      `<line x1="${x - 4 * scale}" y1="${y + offset * scale}" x2="${x + 5 * scale}" y2="${y + offset * scale}" stroke="${accent}" stroke-width="${2 * scale}"/>`,
      `<line x1="${x + w - 5 * scale}" y1="${y + offset * scale}" x2="${x + w + 4 * scale}" y2="${y + offset * scale}" stroke="${accent}" stroke-width="${2 * scale}"/>`,
    ]),
  ].join("");
}

function gpuBox(x, y, label, detail, accent = C.blue, width = 174, height = 72) {
  return [
    box(x, y, width, height, { fill: C.white, stroke: accent, radius: 10 }),
    chipIcon(x + 14, y + 16, accent, 0.85),
    text(x + 60, y + 31, label, { size: 15, weight: 800 }),
    text(x + 60, y + 54, detail, { size: 12, fill: C.muted }),
  ].join("");
}

function miniBox(x, y, width, label, detail, accent, fill = C.white) {
  return [
    box(x, y, width, 58, { fill, stroke: accent, radius: 9, shadow: false }),
    text(x + width / 2, y + 25, label, { size: 15, weight: 800, anchor: "middle" }),
    detail
      ? text(x + width / 2, y + 46, detail, { size: 11, fill: C.muted, anchor: "middle" })
      : "",
  ].join("");
}

function legendLine(x, y, label, options = {}) {
  const { stroke = C.blue, dash = "", both = false } = options;
  return [
    arrow(x, y, x + 56, y, { stroke, width: 3, dash, both }),
    text(x + 70, y + 5, label, { size: 13, weight: 650, fill: C.muted }),
  ].join("");
}

function writeDiagram(name, svg) {
  const svgPath = path.join(assets, `${name}.svg`);
  const pngPath = path.join(assets, `${name}.png`);
  fs.writeFileSync(svgPath, svg);
  return sharp(Buffer.from(svg))
    .png({ compressionLevel: 9 })
    .toFile(pngPath)
    .then(() => ({ svgPath, pngPath }));
}

const dataPaths = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="1536" height="1024" viewBox="0 0 1536 1024">
  ${defs()}
  <rect width="1536" height="1024" fill="#fbfcfe"/>

  ${text(768, 50, "How GPU data moves: local fabric, EFA, and RDMA", { size: 39, weight: 800, anchor: "middle" })}
  ${text(768, 84, "The data path changes with topology; the CPU remains the control plane", { size: 20, weight: 650, fill: C.muted, anchor: "middle" })}

  <!-- A: intra-node -->
  ${box(24, 118, 480, 621, { fill: C.faint, stroke: C.green, strokeWidth: 3, radius: 16 })}
  ${text(48, 154, "A. Inside one GPU node", { size: 27, weight: 800 })}
  ${text(48, 181, "CUDA peer access chooses the usable local path", { size: 15, weight: 650, fill: C.muted })}

  ${miniBox(152, 208, 220, "CPU + host DRAM", "setup, scheduling, fallback staging", C.gray, C.white)}
  ${arrow(262, 268, 262, 325, { stroke: C.gray, width: 2, dash: "7 6" })}
  ${text(278, 299, "control", { size: 12, weight: 700, fill: C.gray })}
  ${gpuBox(50, 344, "GPU 0 VRAM", "tensor / KV bytes", C.green, 182, 78)}
  ${gpuBox(296, 344, "GPU 1 VRAM", "tensor / KV bytes", C.green, 182, 78)}
  ${arrow(236, 375, 290, 375, { stroke: C.green, width: 5, both: true })}
  ${text(263, 342, "NVLink / NVSwitch", { size: 13, weight: 800, fill: C.green, anchor: "middle" })}

  ${miniBox(157, 471, 210, "PCIe switch / root complex", "peer-to-peer fallback", C.purple, C.purpleBg)}
  ${arrow(141, 423, 205, 468, { stroke: C.purple, width: 3, both: true })}
  ${arrow(387, 423, 319, 468, { stroke: C.purple, width: 3, both: true })}
  ${box(50, 563, 428, 89, { fill: C.greenBg, stroke: C.green, radius: 10, shadow: false })}
  ${multiline(264, 589, ["Fast path: GPU memory to GPU memory.", "NVLink/NVSwitch first; PCIe P2P when peer access permits."], { size: 14, weight: 700, anchor: "middle", lineHeight: 25 })}
  ${box(50, 669, 428, 48, { fill: C.white, stroke: C.gray, radius: 9, shadow: false })}
  ${text(264, 699, "Host DRAM is not in the bulk path on a working P2P route.", { size: 13, weight: 650, fill: C.muted, anchor: "middle" })}

  <!-- B: inter-node staged -->
  ${box(528, 118, 480, 621, { fill: C.faint, stroke: C.amber, strokeWidth: 3, radius: 16 })}
  ${text(552, 154, "B. Across nodes: staged path", { size: 27, weight: 800 })}
  ${text(552, 181, "Without GPU-direct access, host memory carries the payload", { size: 15, weight: 650, fill: C.muted })}

  ${box(552, 210, 200, 395, { fill: C.white, stroke: C.gray, radius: 12, shadow: false })}
  ${box(784, 210, 200, 395, { fill: C.white, stroke: C.gray, radius: 12, shadow: false })}
  ${text(652, 237, "Node A", { size: 18, weight: 800, anchor: "middle" })}
  ${text(884, 237, "Node B", { size: 18, weight: 800, anchor: "middle" })}
  ${gpuBox(569, 260, "GPU VRAM", "source bytes", C.blue, 166, 68)}
  ${gpuBox(801, 260, "GPU VRAM", "destination", C.blue, 166, 68)}
  ${miniBox(577, 383, 150, "Host DRAM", "staging copy", C.amber, C.amberBg)}
  ${miniBox(809, 383, 150, "Host DRAM", "staging copy", C.amber, C.amberBg)}
  ${miniBox(594, 504, 116, "NIC", "TCP / sockets", C.gray, C.white)}
  ${miniBox(826, 504, 116, "NIC", "TCP / sockets", C.gray, C.white)}
  ${arrow(652, 331, 652, 378, { stroke: C.amber, width: 4 })}
  ${arrow(652, 444, 652, 499, { stroke: C.amber, width: 4 })}
  ${arrow(710, 533, 820, 533, { stroke: C.amber, width: 4 })}
  ${arrow(884, 499, 884, 444, { stroke: C.amber, width: 4 })}
  ${arrow(884, 378, 884, 331, { stroke: C.amber, width: 4 })}
  ${text(768, 519, "network", { size: 13, weight: 800, fill: C.amber, anchor: "middle" })}
  ${box(552, 626, 432, 72, { fill: C.amberBg, stroke: C.amber, radius: 10, shadow: false })}
  ${multiline(768, 652, ["GPU -> host DRAM -> NIC -> network", "-> host DRAM -> GPU"], { size: 15, weight: 750, anchor: "middle", lineHeight: 23 })}
  ${text(768, 721, "Extra copies and CPU-memory pressure add latency.", { size: 13, weight: 650, fill: C.muted, anchor: "middle" })}

  <!-- C: EFA + GPUDirect RDMA -->
  ${box(1032, 118, 480, 621, { fill: C.faint, stroke: C.cyan, strokeWidth: 3, radius: 16 })}
  ${text(1056, 154, "C. Across nodes: EFA + GPUDirect", { size: 27, weight: 800 })}
  ${text(1056, 181, "RDMA moves bulk bytes without host-memory staging", { size: 15, weight: 650, fill: C.muted })}

  ${box(1056, 210, 194, 392, { fill: C.white, stroke: C.cyan, radius: 12, shadow: false })}
  ${box(1294, 210, 194, 392, { fill: C.white, stroke: C.cyan, radius: 12, shadow: false })}
  ${text(1153, 237, "Node A", { size: 18, weight: 800, anchor: "middle" })}
  ${text(1391, 237, "Node B", { size: 18, weight: 800, anchor: "middle" })}
  ${gpuBox(1070, 260, "GPU VRAM", "registered memory", C.cyan, 166, 68)}
  ${gpuBox(1308, 260, "GPU VRAM", "registered memory", C.cyan, 166, 68)}
  ${miniBox(1078, 475, 150, "EFA NIC", "libfabric provider", C.purple, C.purpleBg)}
  ${miniBox(1316, 475, 150, "EFA NIC", "libfabric provider", C.purple, C.purpleBg)}
  ${arrow(1088, 331, 1088, 470, { stroke: C.purple, width: 5, both: true })}
  ${arrow(1228, 504, 1310, 504, { stroke: C.purple, width: 5, both: true })}
  ${arrow(1456, 470, 1456, 331, { stroke: C.purple, width: 5, both: true })}
  ${text(1269, 488, "EFA fabric", { size: 13, weight: 800, fill: C.purple, anchor: "middle" })}

  ${miniBox(1103, 375, 134, "CPU + DRAM", "control only", C.gray, C.white)}
  ${miniBox(1324, 375, 134, "CPU + DRAM", "control only", C.gray, C.white)}
  ${arrow(1170, 371, 1170, 334, { stroke: C.gray, width: 2, dash: "7 6", both: true })}
  ${arrow(1170, 437, 1170, 470, { stroke: C.gray, width: 2, dash: "7 6", both: true })}
  ${arrow(1391, 371, 1391, 334, { stroke: C.gray, width: 2, dash: "7 6", both: true })}
  ${arrow(1391, 437, 1391, 470, { stroke: C.gray, width: 2, dash: "7 6", both: true })}
  ${text(1272, 353, "host DRAM bypassed by bulk payload", { size: 12, weight: 800, fill: C.cyan, anchor: "middle" })}

  ${box(1056, 626, 432, 72, { fill: C.cyanBg, stroke: C.cyan, radius: 10, shadow: false })}
  ${multiline(1272, 652, ["GPU memory -> PCIe -> EFA -> AWS fabric", "-> EFA -> PCIe -> GPU memory"], { size: 15, weight: 750, anchor: "middle", lineHeight: 23 })}
  ${text(1272, 721, "CPU still registers memory and orchestrates the transfer.", { size: 13, weight: 650, fill: C.muted, anchor: "middle" })}

  <!-- Shared explanation -->
  ${text(35, 779, "What 'GPU bypasses the CPU' really means", { size: 23, weight: 800 })}
  ${box(29, 795, 1478, 112, { fill: C.white, stroke: C.gray, radius: 12, dash: "8 6", shadow: false })}
  ${box(49, 816, 420, 70, { fill: C.greenBg, stroke: C.green, radius: 9, shadow: false })}
  ${text(259, 842, "Control plane stays on CPU", { size: 17, weight: 800, anchor: "middle" })}
  ${text(259, 868, "setup, registration, routing, kernel launches", { size: 13, fill: C.muted, anchor: "middle" })}
  ${box(494, 816, 512, 70, { fill: C.purpleBg, stroke: C.purple, radius: 9, shadow: false })}
  ${text(750, 842, "Bulk data plane can bypass host DRAM", { size: 17, weight: 800, anchor: "middle" })}
  ${text(750, 868, "registered GPU memory is read/written by the RDMA path", { size: 13, fill: C.muted, anchor: "middle" })}
  ${box(1031, 816, 456, 70, { fill: C.amberBg, stroke: C.amber, radius: 9, shadow: false })}
  ${text(1259, 842, "Capability must be proven", { size: 17, weight: 800, anchor: "middle" })}
  ${text(1259, 868, "instance + EFA + driver + topology + software", { size: 13, fill: C.muted, anchor: "middle" })}

  ${legendLine(52, 936, "bulk data path", { stroke: C.purple, both: true })}
  ${legendLine(276, 936, "control / setup", { stroke: C.gray, dash: "7 6", both: true })}
  ${box(524, 919, 982, 50, { fill: C.amberBg, stroke: C.amber, radius: 10, shadow: false })}
  ${text(1015, 951, "Easy rule: inside a node use NVLink or PCIe P2P; across nodes use EFA + GPUDirect RDMA when the platform supports it.", { size: 15, weight: 700, anchor: "middle" })}
  ${text(1502, 1001, "Concept diagram - validate the actual path on the chosen instance", { size: 12, fill: C.muted, anchor: "end" })}
</svg>`;

const softwareStack = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="1536" height="1024" viewBox="0 0 1536 1024">
  ${defs()}
  <rect width="1536" height="1024" fill="#fbfcfe"/>

  ${text(768, 50, "NCCL and NIXL: different jobs, shared high-speed fabrics", { size: 39, weight: 800, anchor: "middle" })}
  ${text(768, 84, "NCCL coordinates GPU groups; NIXL moves inference state between memory locations", { size: 20, weight: 650, fill: C.muted, anchor: "middle" })}

  ${box(24, 116, 731, 716, { fill: C.faint, stroke: C.green, strokeWidth: 3, radius: 16 })}
  ${box(781, 116, 731, 716, { fill: C.faint, stroke: C.purple, strokeWidth: 3, radius: 16 })}

  <!-- NCCL column -->
  ${text(50, 154, "A. NCCL: coordinated GPU communication", { size: 28, weight: 800 })}
  ${text(50, 182, "Used when ranks must participate in one distributed operation", { size: 15, weight: 650, fill: C.muted })}

  ${miniBox(51, 210, 202, "PyTorch DDP / FSDP", "gradients and parameters", C.green, C.greenBg)}
  ${miniBox(277, 210, 202, "vLLM tensor parallel", "tensor shards per layer", C.green, C.greenBg)}
  ${miniBox(503, 210, 202, "Pipeline parallel", "activations at stage seams", C.green, C.greenBg)}
  ${arrow(378, 274, 378, 308, { stroke: C.green, width: 4 })}

  ${box(93, 315, 574, 90, { fill: C.white, stroke: C.green, radius: 12 })}
  ${text(380, 346, "NVIDIA NCCL", { size: 24, weight: 800, fill: C.green, anchor: "middle" })}
  ${text(380, 374, "all-reduce | all-gather | reduce-scatter | send / recv", { size: 15, weight: 700, anchor: "middle" })}
  ${text(380, 395, "group semantics: participating ranks coordinate", { size: 12, fill: C.muted, anchor: "middle" })}

  ${arrow(380, 410, 380, 453, { stroke: C.green, width: 4 })}
  ${box(93, 460, 574, 76, { fill: C.greenBg, stroke: C.green, radius: 11, shadow: false })}
  ${text(380, 489, "Topology-aware transport choice", { size: 19, weight: 800, anchor: "middle" })}
  ${text(380, 516, "peer access locally; network plugin remotely", { size: 13, fill: C.muted, anchor: "middle" })}

  ${arrow(263, 541, 263, 580, { stroke: C.blue, width: 3 })}
  ${arrow(497, 541, 497, 580, { stroke: C.purple, width: 3 })}
  ${box(55, 587, 330, 109, { fill: C.blueBg, stroke: C.blue, radius: 11, shadow: false })}
  ${text(220, 615, "Inside one node", { size: 18, weight: 800, fill: C.blue, anchor: "middle" })}
  ${text(220, 645, "NVLink / NVSwitch", { size: 16, weight: 800, anchor: "middle" })}
  ${text(220, 674, "or PCIe peer-to-peer", { size: 15, weight: 700, fill: C.muted, anchor: "middle" })}

  ${box(405, 587, 322, 109, { fill: C.purpleBg, stroke: C.purple, radius: 11, shadow: false })}
  ${text(566, 615, "Across EFA-enabled nodes", { size: 18, weight: 800, fill: C.purple, anchor: "middle" })}
  ${text(566, 645, "aws-ofi-nccl -> libfabric", { size: 16, weight: 800, anchor: "middle" })}
  ${text(566, 674, "-> EFA / GPUDirect RDMA", { size: 15, weight: 700, fill: C.muted, anchor: "middle" })}

  ${box(55, 718, 672, 87, { fill: C.white, stroke: C.gray, radius: 10, shadow: false })}
  ${text(391, 746, "Mental model", { size: 17, weight: 800, anchor: "middle" })}
  ${multiline(391, 772, ["NCCL defines the coordinated operation.", "The topology and plugins determine how its bytes travel."], { size: 14, weight: 650, fill: C.muted, anchor: "middle", lineHeight: 22 })}

  <!-- NIXL column -->
  ${text(807, 154, "B. NIXL: inference state transfer", { size: 28, weight: 800 })}
  ${text(807, 182, "Used when a producer and consumer exchange registered memory", { size: 15, weight: 650, fill: C.muted })}

  ${miniBox(811, 210, 208, "Prefill vLLM", "creates KV / model state", C.cyan, C.cyanBg)}
  ${miniBox(1042, 210, 208, "Router / sidecar", "endpoint + transfer metadata", C.amber, C.amberBg)}
  ${miniBox(1273, 210, 208, "Decode vLLM", "consumes transferred state", C.cyan, C.cyanBg)}
  ${arrow(1019, 239, 1036, 239, { stroke: C.amber, width: 3, dash: "6 5", both: true })}
  ${arrow(1250, 239, 1267, 239, { stroke: C.amber, width: 3, dash: "6 5", both: true })}
  ${text(1146, 295, "control metadata", { size: 12, weight: 800, fill: C.amber, anchor: "middle" })}

  ${box(850, 315, 594, 90, { fill: C.white, stroke: C.purple, radius: 12 })}
  ${text(1147, 346, "NVIDIA Inference Xfer Library (NIXL)", { size: 22, weight: 800, fill: C.purple, anchor: "middle" })}
  ${text(1147, 374, "register memory | exchange descriptors | initiate transfer", { size: 15, weight: 700, anchor: "middle" })}
  ${text(1147, 395, "point-to-point data movement, not a collective", { size: 12, fill: C.muted, anchor: "middle" })}
  ${arrow(912, 275, 912, 310, { stroke: C.purple, width: 4 })}
  ${arrow(1380, 275, 1380, 310, { stroke: C.purple, width: 4 })}
  ${arrow(1380, 410, 1380, 445, { stroke: C.purple, width: 4 })}

  ${box(850, 452, 594, 76, { fill: C.purpleBg, stroke: C.purple, radius: 11, shadow: false })}
  ${text(1147, 481, "Backend selection follows memory location and fabric", { size: 19, weight: 800, anchor: "middle" })}
  ${text(1147, 508, "local GPU memory, remote GPU memory, host memory, or storage", { size: 13, fill: C.muted, anchor: "middle" })}

  ${arrow(1024, 533, 1024, 574, { stroke: C.blue, width: 3 })}
  ${arrow(1268, 533, 1268, 574, { stroke: C.purple, width: 3 })}
  ${box(811, 581, 340, 115, { fill: C.blueBg, stroke: C.blue, radius: 11, shadow: false })}
  ${text(981, 610, "Local or same-system path", { size: 18, weight: 800, fill: C.blue, anchor: "middle" })}
  ${text(981, 641, "CUDA IPC / NVLink / PCIe", { size: 16, weight: 800, anchor: "middle" })}
  ${text(981, 672, "backend depends on deployment", { size: 14, weight: 650, fill: C.muted, anchor: "middle" })}

  ${box(1171, 581, 310, 115, { fill: C.purpleBg, stroke: C.purple, radius: 11, shadow: false })}
  ${text(1326, 610, "AWS inter-node path", { size: 18, weight: 800, fill: C.purple, anchor: "middle" })}
  ${text(1326, 641, "LIBFABRIC -> EFA", { size: 16, weight: 800, anchor: "middle" })}
  ${text(1326, 672, "GPU VRAM with GPUDirect", { size: 14, weight: 650, fill: C.muted, anchor: "middle" })}

  ${arrow(912, 701, 912, 724, { stroke: C.cyan, width: 4 })}
  ${arrow(1380, 701, 1380, 724, { stroke: C.cyan, width: 4 })}
  ${box(850, 731, 594, 74, { fill: C.cyanBg, stroke: C.cyan, radius: 10, shadow: false })}
  ${text(1147, 759, "Bulk payload", { size: 17, weight: 800, fill: C.cyan, anchor: "middle" })}
  ${text(1147, 786, "prefill GPU state -> decode GPU's preallocated blocks", { size: 14, weight: 700, anchor: "middle" })}

  <!-- Shared comparison -->
  ${text(35, 870, "Keep the layers separate", { size: 23, weight: 800 })}
  ${box(29, 886, 1478, 92, { fill: C.white, stroke: C.gray, radius: 12, dash: "8 6", shadow: false })}
  ${box(49, 902, 430, 59, { fill: C.greenBg, stroke: C.green, radius: 9, shadow: false })}
  ${text(264, 926, "NCCL = communication semantics", { size: 17, weight: 800, anchor: "middle" })}
  ${text(264, 949, "collectives and rank-to-rank operations", { size: 13, fill: C.muted, anchor: "middle" })}
  ${box(503, 902, 430, 59, { fill: C.purpleBg, stroke: C.purple, radius: 9, shadow: false })}
  ${text(718, 926, "NIXL = inference data movement", { size: 17, weight: 800, anchor: "middle" })}
  ${text(718, 949, "registered memory and storage locations", { size: 13, fill: C.muted, anchor: "middle" })}
  ${box(957, 902, 530, 59, { fill: C.amberBg, stroke: C.amber, radius: 9, shadow: false })}
  ${text(1222, 926, "EFA / NVLink / PCIe = physical transport options", { size: 17, weight: 800, anchor: "middle" })}
  ${text(1222, 949, "the same fabric can serve different software semantics", { size: 13, fill: C.muted, anchor: "middle" })}
  ${text(1502, 1005, "NIXL, not NXIL", { size: 12, weight: 800, fill: C.purple, anchor: "end" })}
</svg>`;

const outputs = await Promise.all([
  writeDiagram("gpu-data-paths-nvlink-pcie-efa-rdma", dataPaths),
  writeDiagram("nccl-vs-nixl-communication-stack", softwareStack),
]);

for (const output of outputs) {
  console.log(`SVG: ${output.svgPath}`);
  console.log(`PNG: ${output.pngPath}`);
}
