import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const sharp = require("sharp");

const here = path.dirname(fileURLToPath(import.meta.url));
const assets = path.resolve(
  here,
  "../../docs/reference-stacks/p5-two-node-efa/assets",
);
fs.mkdirSync(assets, { recursive: true });

const C = {
  ink: "#14213d",
  muted: "#506079",
  white: "#ffffff",
  faint: "#f7f9fc",
  gray: "#7a8baa",
  blue: "#3767e8",
  blueBg: "#edf2ff",
  cyan: "#13a9c6",
  cyanBg: "#eafafd",
  green: "#149447",
  greenBg: "#edf9f1",
  amber: "#f1a208",
  amberBg: "#fff8df",
  purple: "#6748d6",
  purpleBg: "#f4f0ff",
  red: "#d83742",
  redBg: "#fff1f1",
};

const font = "Chalkboard SE, Comic Sans MS, ui-rounded, sans-serif";

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
    family = font,
  } = options;
  return `<text x="${x}" y="${y}" text-anchor="${anchor}" font-family="${family}" font-size="${size}" font-weight="${weight}" fill="${fill}">${esc(value)}</text>`;
}

function multiline(x, y, lines, options = {}) {
  const {
    size = 16,
    weight = 500,
    fill = C.ink,
    anchor = "start",
    lineHeight = size * 1.32,
  } = options;
  const spans = lines
    .map(
      (line, index) =>
        `<tspan x="${x}" dy="${index === 0 ? 0 : lineHeight}">${esc(line)}</tspan>`,
    )
    .join("");
  return `<text x="${x}" y="${y}" text-anchor="${anchor}" font-family="${font}" font-size="${size}" font-weight="${weight}" fill="${fill}">${spans}</text>`;
}

function box(x, y, width, height, options = {}) {
  const {
    fill = C.white,
    stroke = C.ink,
    strokeWidth = 2,
    radius = 12,
    dash = "",
    shadow = true,
  } = options;
  return `<rect x="${x}" y="${y}" width="${width}" height="${height}" rx="${radius}" fill="${fill}" stroke="${stroke}" stroke-width="${strokeWidth}"${dash ? ` stroke-dasharray="${dash}"` : ""}${shadow ? ' filter="url(#softShadow)"' : ""}/>`;
}

function arrow(x1, y1, x2, y2, options = {}) {
  const { stroke = C.blue, width = 3, dash = "", both = false } = options;
  const head = (fromX, fromY, tipX, tipY) => {
    const dx = tipX - fromX;
    const dy = tipY - fromY;
    const length = Math.hypot(dx, dy) || 1;
    const ux = dx / length;
    const uy = dy / length;
    const size = 12;
    const half = 7;
    const bx = tipX - ux * size;
    const by = tipY - uy * size;
    const px = -uy * half;
    const py = ux * half;
    return `<polygon points="${tipX},${tipY} ${bx + px},${by + py} ${bx - px},${by - py}" fill="${stroke}"/>`;
  };
  return [
    `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${stroke}" stroke-width="${width}"${dash ? ` stroke-dasharray="${dash}"` : ""}/>` ,
    both ? head(x2, y2, x1, y1) : "",
    head(x1, y1, x2, y2),
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

function chip(x, y, accent = C.blue, scale = 1) {
  const w = 44 * scale;
  const h = 44 * scale;
  const pins = [8, 17, 26, 35];
  return [
    `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${7 * scale}" fill="${accent}" opacity="0.12" stroke="${accent}" stroke-width="${2 * scale}"/>`,
    `<rect x="${x + 11 * scale}" y="${y + 11 * scale}" width="${22 * scale}" height="${22 * scale}" fill="none" stroke="${accent}" stroke-width="${2 * scale}"/>`,
    ...pins.flatMap((offset) => [
      `<line x1="${x + offset * scale}" y1="${y - 4 * scale}" x2="${x + offset * scale}" y2="${y + 5 * scale}" stroke="${accent}" stroke-width="${2 * scale}"/>`,
      `<line x1="${x + offset * scale}" y1="${y + h - 5 * scale}" x2="${x + offset * scale}" y2="${y + h + 4 * scale}" stroke="${accent}" stroke-width="${2 * scale}"/>`,
      `<line x1="${x - 4 * scale}" y1="${y + offset * scale}" x2="${x + 5 * scale}" y2="${y + offset * scale}" stroke="${accent}" stroke-width="${2 * scale}"/>`,
      `<line x1="${x + w - 5 * scale}" y1="${y + offset * scale}" x2="${x + w + 4 * scale}" y2="${y + offset * scale}" stroke="${accent}" stroke-width="${2 * scale}"/>`,
    ]),
  ].join("");
}

function stat(x, y, width, label, value, accent = C.blue) {
  return [
    box(x, y, width, 67, { fill: C.white, stroke: accent, radius: 9, shadow: false }),
    text(x + 13, y + 25, label, { size: 13, weight: 700, fill: C.muted }),
    text(x + 13, y + 51, value, { size: 17, weight: 800, fill: C.ink }),
  ].join("");
}

function tableRow(x, y, label, value, width, options = {}) {
  const { fill = C.white, valueFill = C.ink, size = 14 } = options;
  return [
    `<rect x="${x}" y="${y}" width="${width}" height="29" fill="${fill}"/>`,
    text(x + 12, y + 20, label, { size, weight: 700, fill: C.muted }),
    text(x + width - 12, y + 20, value, { size, weight: 800, fill: valueFill, anchor: "end" }),
    `<line x1="${x}" y1="${y + 29}" x2="${x + width}" y2="${y + 29}" stroke="#dce3ef" stroke-width="1"/>`,
  ].join("");
}

function layerCard(x, y, width, title, subtitle, rows, accent, bg) {
  const rowStart = y + 85;
  return [
    box(x, y, width, 85 + rows.length * 29 + 17, { fill: C.white, stroke: accent, strokeWidth: 3, radius: 14 }),
    `<rect x="${x}" y="${y}" width="${width}" height="69" rx="14" fill="${bg}"/>`,
    `<rect x="${x}" y="${y + 55}" width="${width}" height="14" fill="${bg}"/>`,
    text(x + 22, y + 30, title, { size: 23, weight: 800, fill: accent }),
    text(x + 22, y + 55, subtitle, { size: 13, weight: 700, fill: C.muted }),
    ...rows.map(([label, value], index) =>
      tableRow(x + 10, rowStart + index * 29, label, value, width - 20, {
        fill: index % 2 === 0 ? C.faint : C.white,
        valueFill: C.ink,
        size: 13,
      }),
    ),
  ].join("");
}

function nodeCard(x, y, label) {
  return [
    box(x, y, 790, 246, { fill: C.white, stroke: C.blue, strokeWidth: 3, radius: 15 }),
    text(x + 24, y + 34, label, { size: 24, weight: 800, fill: C.blue }),
    text(x + 766, y + 34, "p5.48xlarge Spot", { size: 17, weight: 800, anchor: "end" }),
    chip(x + 30, y + 69, C.green, 1.18),
    text(x + 103, y + 92, "8 x NVIDIA H100", { size: 20, weight: 800 }),
    text(x + 103, y + 118, "80 GB HBM3 | 81,559 MiB usable each", { size: 14, weight: 700, fill: C.muted }),
    box(x + 27, y + 141, 344, 70, { fill: C.greenBg, stroke: C.green, radius: 9, shadow: false }),
    text(x + 199, y + 168, "NVSwitch domain", { size: 18, weight: 800, fill: C.green, anchor: "middle" }),
    text(x + 199, y + 194, "every GPU pair = NV18", { size: 14, weight: 700, anchor: "middle" }),
    stat(x + 395, y + 64, 174, "Compute", "192 vCPU", C.purple),
    stat(x + 584, y + 64, 174, "Host RAM", "2 TiB", C.purple),
    stat(x + 395, y + 141, 174, "Local NVMe", "30.4 TB", C.amber),
    stat(x + 584, y + 141, 174, "EFA", "32 x 100 Gbps", C.cyan),
    text(x + 27, y + 234, "Model/data: FSx for Lustre | root EBS: OS and containerd state", { size: 13, weight: 700, fill: C.muted }),
  ].join("");
}

async function writeDiagram(name, svg) {
  const svgPath = path.join(assets, `${name}.svg`);
  const pngPath = path.join(assets, `${name}.png`);
  fs.writeFileSync(svgPath, svg);
  await sharp(Buffer.from(svg)).png({ compressionLevel: 9 }).toFile(pngPath);
  return { svgPath, pngPath };
}

const hostRows = [
  ["AMI", "EKS AL2023 NVIDIA 1.34 v20260801"],
  ["AMI ID", "ami-0a7670dc126be4255"],
  ["OS / kernel", "AL2023.12 | 6.12.94-123.192"],
  ["Kubelet / containerd", "1.34.9 | 2.2.5"],
  ["NVIDIA driver", "580.159.03"],
  ["Fabric Manager", "580.159.03 | active"],
  ["Container toolkit", "1.19.1"],
  ["EFA package / module", "3.1.0 | 3.1.0g"],
  ["efa-nv-peermem", "1.2.3"],
  ["RDMA core", "63.0"],
  ["K8s resources", "8 GPU | 32 EFA per node"],
];

const dlcRows = [
  ["Base image", "AWS PyTorch training 2.9.0"],
  ["Container OS / Python", "Ubuntu 22.04.5 | 3.12.10"],
  ["PyTorch / CUDA", "2.9.0+cu130 | 13.0"],
  ["nvcc / cuDNN", "13.0.48 | 9.13.0"],
  ["NCCL", "2.27.7+cuda13.0"],
  ["Open MPI", "4.1.7"],
  ["libfabric", "2.3.1amzn1.0"],
  ["libfabric home", "/opt/amazon/efa"],
  ["aws-ofi-nccl", "1.17.1-1"],
  ["OFI plugin", "/opt/amazon/ofi-nccl/lib"],
  ["Training libs", "TRL 1.7 | PEFT 0.19.1 | BNB 0.49.2"],
];

const servingHostRows = [
  ["AMI", "EKS AL2023 NVIDIA 1.34 v20260801"],
  ["AMI ID", "ami-0a7670dc126be4255"],
  ["OS / kernel", "AL2023.12 | 6.12.94-123.192"],
  ["Kubelet / containerd", "1.34.9 | 2.2.5"],
  ["NVIDIA driver / FM", "580.159.03 / 580.159.03"],
  ["EFA package / module", "3.1.0 / 3.1.0g"],
  ["K8s allocatable", "8 GPU | 32 EFA per node"],
];

const servingImageRows = [
  ["Image", "llm-d-aws:v0.8.0"],
  ["Digest", "sha256:1bfaabe...510388"],
  ["Base / architecture", "UBI 9.6 / amd64"],
  ["CUDA / NCCL", "13.0.2 / 2.28.3"],
  ["vLLM", "0.23.0 release alignment"],
  ["NIXL", "1.2.0 runtime"],
  ["Transport", "LIBFABRIC / provider=efa"],
];

const stackDiagram = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="1800" height="1510" viewBox="0 0 1800 1510">
  ${defs()}
  <rect width="1800" height="1510" fill="#fbfcfe"/>

  ${text(900, 53, "Two-node P5 training stack on Amazon EKS", { size: 42, weight: 800, anchor: "middle" })}
  ${text(900, 88, "Exact hardware, accelerated AMI, and AWS Deep Learning Container observed on 2026-08-06", { size: 20, weight: 700, fill: C.muted, anchor: "middle" })}

  ${box(34, 112, 1732, 43, { fill: C.amberBg, stroke: C.amber, radius: 9, shadow: false })}
  ${text(900, 140, "Same Availability Zone | one placement group | 16 H100 GPUs | 64 EFA devices | 2 x 3.2 Tbps advertised capacity (not measured bandwidth)", { size: 16, weight: 800, anchor: "middle" })}

  ${nodeCard(45, 179, "P5 node A")}
  ${nodeCard(965, 179, "P5 node B")}
  ${arrow(838, 299, 958, 299, { stroke: C.purple, width: 7, both: true })}
  ${text(898, 273, "EFA / SRD", { size: 16, weight: 800, fill: C.purple, anchor: "middle" })}
  ${text(898, 329, "GPUDirect RDMA", { size: 14, weight: 800, fill: C.purple, anchor: "middle" })}

  ${text(45, 461, "Ownership boundary", { size: 25, weight: 800 })}
  ${box(39, 478, 1722, 56, { fill: C.white, stroke: C.gray, dash: "8 6", radius: 10, shadow: false })}
  ${text(70, 511, "HOST / AMI owns kernel, NVIDIA driver, Fabric Manager, EFA driver, RDMA devices", { size: 16, weight: 800, fill: C.blue })}
  ${text(1730, 511, "DLC owns PyTorch, NCCL, libfabric, and aws-ofi-nccl", { size: 16, weight: 800, fill: C.purple, anchor: "end" })}

  ${layerCard(45, 558, 825, "Accelerated AMI and host", "Device and kernel layer, identical on both nodes", hostRows, C.blue, C.blueBg)}
  ${layerCard(930, 558, 825, "AWS DLC and custom training image", "User-space communication and framework layer", dlcRows, C.purple, C.purpleBg)}

  ${text(45, 1028, "AMI and DLC compatibility contract", { size: 25, weight: 800 })}
  ${box(39, 1045, 1722, 195, { fill: C.white, stroke: C.amber, strokeWidth: 2, radius: 13, shadow: false })}

  ${box(58, 1063, 318, 91, { fill: C.greenBg, stroke: C.green, radius: 9, shadow: false })}
  ${text(76, 1088, "EXACT LOCKSTEP", { size: 14, weight: 800, fill: C.green })}
  ${text(76, 1115, "Driver = Fabric Manager", { size: 16, weight: 800 })}
  ${text(76, 1139, "580.159.03 = 580.159.03", { size: 13, weight: 700, fill: C.muted })}

  ${box(397, 1063, 318, 91, { fill: C.cyanBg, stroke: C.cyan, radius: 9, shadow: false })}
  ${text(415, 1088, "COMPATIBLE", { size: 14, weight: 800, fill: C.cyan })}
  ${text(415, 1115, "Host driver >= CUDA minimum", { size: 16, weight: 800 })}
  ${text(415, 1139, "R580 supports DLC CUDA 13.0", { size: 13, weight: 700, fill: C.muted })}

  ${box(736, 1063, 318, 91, { fill: C.cyanBg, stroke: C.cyan, radius: 9, shadow: false })}
  ${text(754, 1088, "COMPATIBLE", { size: 14, weight: 800, fill: C.cyan })}
  ${text(754, 1115, "EFA kernel + libfabric ABI", { size: 16, weight: 800 })}
  ${text(754, 1139, "EFA 3.1 + libfabric 2.3.1", { size: 13, weight: 700, fill: C.muted })}

  ${box(1075, 1063, 318, 91, { fill: C.cyanBg, stroke: C.cyan, radius: 9, shadow: false })}
  ${text(1093, 1088, "COMPATIBLE", { size: 14, weight: 800, fill: C.cyan })}
  ${text(1093, 1115, "NCCL + OFI plugin ABI", { size: 16, weight: 800 })}
  ${text(1093, 1139, "2.27.7 + aws-ofi-nccl 1.17.1", { size: 13, weight: 700, fill: C.muted })}

  ${box(1414, 1063, 328, 91, { fill: C.greenBg, stroke: C.green, radius: 9, shadow: false })}
  ${text(1432, 1088, "EXACT DEPLOYMENT", { size: 14, weight: 800, fill: C.green })}
  ${text(1432, 1115, "Same DLC digest on all ranks", { size: 16, weight: 800 })}
  ${text(1432, 1139, "prevents rank-to-rank drift", { size: 13, weight: 700, fill: C.muted })}

  ${box(58, 1170, 520, 51, { fill: C.blueBg, stroke: C.blue, radius: 9, shadow: false })}
  ${text(318, 1202, "1. EC2 type + EKS version -> accelerated AMI", { size: 15, weight: 800, anchor: "middle" })}
  ${arrow(588, 1195, 628, 1195, { stroke: C.amber, width: 4 })}
  ${box(638, 1170, 520, 51, { fill: C.purpleBg, stroke: C.purple, radius: 9, shadow: false })}
  ${text(898, 1202, "2. Framework + CUDA + EFA -> AWS DLC (-ec2)", { size: 15, weight: 800, anchor: "middle" })}
  ${arrow(1168, 1195, 1208, 1195, { stroke: C.amber, width: 4 })}
  ${box(1218, 1170, 524, 51, { fill: C.greenBg, stroke: C.green, radius: 9, shadow: false })}
  ${text(1480, 1202, "3. Run preflight -> pin AMI release + DLC digest", { size: 15, weight: 800, anchor: "middle" })}

  ${text(45, 1281, "Inter-node collective data path", { size: 25, weight: 800 })}
  ${box(39, 1298, 1722, 119, { fill: C.white, stroke: C.cyan, strokeWidth: 2, radius: 13, shadow: false })}
  ${stat(64, 1324, 218, "Framework", "PyTorch DDP", C.green)}
  ${arrow(291, 1357, 342, 1357, { stroke: C.cyan, width: 4 })}
  ${stat(351, 1324, 218, "Collectives", "NCCL 2.27.7", C.green)}
  ${arrow(578, 1357, 629, 1357, { stroke: C.cyan, width: 4 })}
  ${stat(638, 1324, 246, "NCCL network plugin", "aws-ofi-nccl 1.17.1", C.purple)}
  ${arrow(893, 1357, 944, 1357, { stroke: C.cyan, width: 4 })}
  ${stat(953, 1324, 218, "Transport API", "libfabric 2.3.1", C.purple)}
  ${arrow(1180, 1357, 1231, 1357, { stroke: C.cyan, width: 4 })}
  ${stat(1240, 1324, 218, "Provider", "efa-direct / RDMA", C.cyan)}
  ${arrow(1467, 1357, 1518, 1357, { stroke: C.cyan, width: 4 })}
  ${stat(1527, 1324, 208, "Wire path", "EFA / SRD", C.cyan)}

  ${text(45, 1462, "Host provides devices; the DLC provides compatible communication libraries. Validate the pair, then pin both artifacts.", { size: 16, weight: 800, fill: C.muted })}
  ${text(1755, 1462, "Reference: docs/reference-stacks/p5-two-node-efa/README.md", { size: 13, weight: 700, fill: C.muted, anchor: "end" })}
</svg>`;

const proofDiagram = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="1800" height="1200" viewBox="0 0 1800 1200">
  ${defs()}
  <rect width="1800" height="1200" fill="#fbfcfe"/>

  ${text(900, 53, "How we proved NVSwitch and EFA end to end", { size: 42, weight: 800, anchor: "middle" })}
  ${text(900, 88, "Two strict NCCL validation tests: local 8-GPU NVSwitch, then 16 ranks across two EFA-enabled P5 nodes", { size: 20, weight: 700, fill: C.muted, anchor: "middle" })}

  ${box(34, 117, 830, 563, { fill: C.faint, stroke: C.green, strokeWidth: 3, radius: 16 })}
  ${text(59, 158, "A. Intra-node: NVSwitch / NVLink", { size: 28, weight: 800 })}
  ${text(59, 187, "One pod requests all 8 H100 GPUs on one P5 node", { size: 16, weight: 700, fill: C.muted })}

  ${box(62, 218, 774, 239, { fill: C.white, stroke: C.green, radius: 12, shadow: false })}
  ${text(449, 248, "torchrun --standalone --nproc_per_node=8", { size: 19, weight: 800, anchor: "middle" })}
  ${[0, 1, 2, 3, 4, 5, 6, 7].map((rank) => {
    const x = 83 + rank * 93;
    return [
      chip(x, 298, C.green, 0.78),
      text(x + 17, 365, `R${rank}`, { size: 13, weight: 800, anchor: "middle" }),
    ].join("");
  }).join("")}
  ${arrow(118, 393, 776, 393, { stroke: C.green, width: 6, both: true })}
  ${text(447, 424, "NVSwitch domain | nvidia-smi topo -m = NV18 for every GPU pair", { size: 15, weight: 800, fill: C.green, anchor: "middle" })}

  ${box(62, 479, 774, 166, { fill: C.greenBg, stroke: C.green, radius: 11, shadow: false })}
  ${text(87, 511, "PASS gates", { size: 20, weight: 800, fill: C.green })}
  ${multiline(87, 543, [
    "8/8 mathematically correct all-reduce markers",
    "NCCL NVLS operations present",
    "Connected all rings ... GDR 1",
    "Hardware topology and collective path agree",
  ], { size: 16, weight: 700, lineHeight: 25 })}

  ${box(936, 117, 830, 563, { fill: C.faint, stroke: C.purple, strokeWidth: 3, radius: 16 })}
  ${text(961, 158, "B. Inter-node: NCCL over EFA", { size: 28, weight: 800 })}
  ${text(961, 187, "Two pods: 8 H100 + all 32 EFA devices on each P5 node", { size: 16, weight: 700, fill: C.muted })}

  ${box(965, 218, 318, 250, { fill: C.white, stroke: C.blue, radius: 12, shadow: false })}
  ${box(1419, 218, 318, 250, { fill: C.white, stroke: C.blue, radius: 12, shadow: false })}
  ${text(1124, 249, "P5 node A", { size: 20, weight: 800, anchor: "middle" })}
  ${text(1578, 249, "P5 node B", { size: 20, weight: 800, anchor: "middle" })}
  ${multiline(1124, 286, ["8 ranks / 8 H100", "32 EFA devices", "32 x 100 Gbps rails", "FI_EP_RDM provider check"], { size: 15, weight: 700, anchor: "middle", lineHeight: 31 })}
  ${multiline(1578, 286, ["8 ranks / 8 H100", "32 EFA devices", "32 x 100 Gbps rails", "FI_EP_RDM provider check"], { size: 15, weight: 700, anchor: "middle", lineHeight: 31 })}
  ${arrow(1288, 344, 1414, 344, { stroke: C.purple, width: 9, both: true })}
  ${text(1351, 314, "EFA / SRD", { size: 17, weight: 800, fill: C.purple, anchor: "middle" })}
  ${text(1351, 379, "GPUDirect RDMA", { size: 15, weight: 800, fill: C.purple, anchor: "middle" })}
  ${arrow(1124, 474, 1124, 512, { stroke: C.gray, width: 2, dash: "7 6", both: true })}
  ${arrow(1578, 474, 1578, 512, { stroke: C.gray, width: 2, dash: "7 6", both: true })}
  ${text(1351, 503, "eth0: rendezvous, DNS, bootstrap only", { size: 14, weight: 700, fill: C.gray, anchor: "middle" })}

  ${box(965, 526, 772, 119, { fill: C.purpleBg, stroke: C.purple, radius: 11, shadow: false })}
  ${text(990, 557, "PASS gates", { size: 20, weight: 800, fill: C.purple })}
  ${multiline(990, 588, [
    "16/16 correct all-reduce markers | provider = efa-direct | transport = RDMA",
    "NCCL network = Libfabric | channels = NET/Libfabric/<rail>/GDRDMA",
    "No TCP fallback: neither NET/Socket nor Using network Socket appeared",
  ], { size: 15, weight: 700, lineHeight: 24 })}

  ${text(45, 728, "The exact inter-node software path", { size: 27, weight: 800 })}
  ${box(39, 747, 1722, 132, { fill: C.white, stroke: C.cyan, strokeWidth: 2, radius: 13, shadow: false })}
  ${stat(64, 779, 218, "1. Framework", "PyTorch DDP", C.green)}
  ${arrow(291, 812, 342, 812, { stroke: C.cyan, width: 4 })}
  ${stat(351, 779, 218, "2. Collectives", "NCCL 2.27.7", C.green)}
  ${arrow(578, 812, 629, 812, { stroke: C.cyan, width: 4 })}
  ${stat(638, 779, 246, "3. Network plugin", "aws-ofi-nccl 1.17.1", C.purple)}
  ${arrow(893, 812, 944, 812, { stroke: C.cyan, width: 4 })}
  ${stat(953, 779, 218, "4. Transport API", "libfabric 2.3.1", C.purple)}
  ${arrow(1180, 812, 1231, 812, { stroke: C.cyan, width: 4 })}
  ${stat(1240, 779, 218, "5. Provider", "efa-direct / RDMA", C.cyan)}
  ${arrow(1467, 812, 1518, 812, { stroke: C.cyan, width: 4 })}
  ${stat(1527, 779, 208, "6. Fabric", "EFA / SRD", C.cyan)}

  ${text(45, 927, "Commands that prove the path", { size: 27, weight: 800 })}
  ${box(39, 947, 1722, 172, { fill: C.ink, stroke: C.ink, radius: 13, shadow: false })}
  ${multiline(69, 984, [
    "LOCAL TOPOLOGY   nvidia-smi topo -m",
    "EFA PROVIDER     /opt/amazon/efa/bin/fi_info -p efa -t FI_EP_RDM",
    "NCCL PLUGIN      grep 'Initializing aws-ofi-nccl' <pod.log>",
    "DATA PATH        grep -E 'efa-direct|transport protocol RDMA|Using network Libfabric|GDRDMA' <pod.log>",
    "NO FALLBACK      ! grep -Eq 'NET/Socket|Using network Socket' <pod.log>",
  ], { size: 16, weight: 700, fill: C.white, lineHeight: 25 })}
  ${multiline(1005, 984, [
    "CORRECTNESS      8/8 intra-node markers; 16/16 inter-node markers",
    "EFA ALLOCATION   kubectl get node ... allocatable.vpc.amazonaws.com/efa",
    "DEVICE COUNT     ls -1 /dev/infiniband/uverbs* | wc -l  # expect 32/pod",
    "PLUGIN LOCATION  /opt/amazon/ofi-nccl/lib/libnccl-net-ofi.so",
    "DEPENDENCY       ldd .../libnccl-net-ofi.so | grep libfabric",
  ], { size: 16, weight: 700, fill: C.white, lineHeight: 25 })}

  ${box(39, 1140, 1722, 41, { fill: C.amberBg, stroke: C.amber, radius: 9, shadow: false })}
  ${text(900, 1167, "This proves transport selection and collective correctness. Use nccl-tests separately for algbw and busbw.", { size: 16, weight: 800, anchor: "middle" })}
</svg>`;

const servingDiagram = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="1800" height="1540" viewBox="0 0 1800 1540">
  ${defs()}
  <rect width="1800" height="1540" fill="#fbfcfe"/>

  ${text(900, 53, "P5 disaggregated inference: exact NIXL over EFA stack", { size: 41, weight: 800, anchor: "middle" })}
  ${text(900, 88, "Observed on Amazon EKS | 2 x p5.48xlarge Spot | 16 H100 GPUs | 64 EFA devices", { size: 20, weight: 700, fill: C.muted, anchor: "middle" })}

  ${box(34, 111, 1732, 48, { fill: C.amberBg, stroke: C.amber, radius: 9, shadow: false })}
  ${text(900, 142, "One AZ + placement group | 8 prefill pods x (1 GPU + 4 EFA) | 8 decode pods x (1 GPU + 4 EFA)", { size: 17, weight: 800, anchor: "middle" })}

  ${text(45, 205, "Request and routing control path", { size: 25, weight: 800 })}
  ${box(40, 224, 1720, 125, { fill: C.white, stroke: C.gray, dash: "8 6", radius: 12, shadow: false })}
  ${stat(68, 251, 218, "1. Load", "AIPerf 0.11", C.amber)}
  ${arrow(296, 284, 347, 284, { stroke: C.red, width: 4 })}
  ${stat(357, 251, 250, "2. Front door", "Envoy + EPP v0.9", C.blue)}
  ${arrow(617, 284, 668, 284, { stroke: C.red, width: 4 })}
  ${stat(678, 251, 274, "3. P/D control", "decode routing sidecar", C.purple)}
  ${arrow(962, 284, 1013, 284, { stroke: C.red, width: 4 })}
  ${stat(1023, 251, 270, "4. Endpoint", "prefill + decode pods", C.cyan)}
  ${arrow(1303, 284, 1354, 284, { stroke: C.red, width: 4 })}
  ${stat(1364, 251, 365, "5. Result", "streamed decode tokens", C.green)}

  ${box(39, 385, 824, 385, { fill: C.faint, stroke: C.blue, strokeWidth: 3, radius: 16 })}
  ${text(64, 425, "P5 node A: prefill", { size: 28, weight: 800, fill: C.blue })}
  ${text(837, 425, "8 x H100 | 32 x EFA", { size: 18, weight: 800, anchor: "end" })}
  ${box(64, 452, 774, 87, { fill: C.blueBg, stroke: C.blue, radius: 11, shadow: false })}
  ${text(84, 481, "HOST / AMI", { size: 15, weight: 800, fill: C.blue })}
  ${text(84, 508, "AL2023 NVIDIA AMI: kernel, driver, Fabric Manager, EFA driver, RDMA devices", { size: 16, weight: 800 })}
  ${text(84, 530, "Kubernetes advertises 8 nvidia.com/gpu and 32 vpc.amazonaws.com/efa", { size: 13, weight: 700, fill: C.muted })}

  ${box(64, 558, 774, 161, { fill: C.purpleBg, stroke: C.purple, radius: 11, shadow: false })}
  ${text(84, 588, "8 PREFILL PODS - EACH POD HAS:", { size: 15, weight: 800, fill: C.purple })}
  ${chip(88, 613, C.green, 0.94)}
  ${text(147, 633, "1 H100 per pod x 8", { size: 17, weight: 800 })}
  ${text(147, 656, "prefill + KV in VRAM", { size: 13, weight: 700, fill: C.muted })}
  ${box(311, 611, 213, 73, { fill: C.white, stroke: C.purple, radius: 9, shadow: false })}
  ${text(417, 638, "vLLM + NIXL", { size: 17, weight: 800, anchor: "middle" })}
  ${text(417, 663, "LIBFABRIC backend", { size: 13, weight: 700, fill: C.muted, anchor: "middle" })}
  ${box(547, 611, 268, 73, { fill: C.white, stroke: C.cyan, radius: 9, shadow: false })}
  ${text(681, 638, "4 EFA devices per pod", { size: 17, weight: 800, anchor: "middle" })}
  ${text(681, 663, "32 total | topology-aware multi-rail", { size: 13, weight: 700, fill: C.muted, anchor: "middle" })}
  ${text(451, 746, "FSx for Lustre model mount is read-only in every pod", { size: 14, weight: 800, fill: C.muted, anchor: "middle" })}

  ${box(937, 385, 824, 385, { fill: C.faint, stroke: C.cyan, strokeWidth: 3, radius: 16 })}
  ${text(962, 425, "P5 node B: decode", { size: 28, weight: 800, fill: C.cyan })}
  ${text(1735, 425, "8 x H100 | 32 x EFA", { size: 18, weight: 800, anchor: "end" })}
  ${box(962, 452, 774, 87, { fill: C.cyanBg, stroke: C.cyan, radius: 11, shadow: false })}
  ${text(982, 481, "HOST / AMI", { size: 15, weight: 800, fill: C.cyan })}
  ${text(982, 508, "Same AMI release and device layer as the prefill node", { size: 16, weight: 800 })}
  ${text(982, 530, "The bulk transfer bypasses host DRAM; CPU still handles control and metadata", { size: 13, weight: 700, fill: C.muted })}

  ${box(962, 558, 774, 161, { fill: C.greenBg, stroke: C.green, radius: 11, shadow: false })}
  ${text(982, 588, "8 DECODE PODS + SIDECARS - EACH POD HAS:", { size: 15, weight: 800, fill: C.green })}
  ${box(983, 611, 189, 73, { fill: C.white, stroke: C.purple, radius: 9, shadow: false })}
  ${text(1078, 638, "routing sidecar", { size: 16, weight: 800, anchor: "middle" })}
  ${text(1078, 663, "transfer metadata", { size: 13, weight: 700, fill: C.muted, anchor: "middle" })}
  ${chip(1204, 613, C.green, 0.94)}
  ${text(1263, 633, "1 H100 per pod x 8", { size: 17, weight: 800 })}
  ${text(1263, 656, "restored KV + token decode", { size: 13, weight: 700, fill: C.muted })}
  ${box(1456, 611, 257, 73, { fill: C.white, stroke: C.cyan, radius: 9, shadow: false })}
  ${text(1585, 638, "4 EFA devices per pod", { size: 17, weight: 800, anchor: "middle" })}
  ${text(1585, 663, "32 total | KV receive path", { size: 13, weight: 700, fill: C.muted, anchor: "middle" })}
  ${text(1349, 746, "One logical API endpoint per ready decode pod", { size: 14, weight: 800, fill: C.muted, anchor: "middle" })}

  ${arrow(849, 637, 949, 637, { stroke: C.purple, width: 9 })}
  ${text(899, 602, "one selected", { size: 11, weight: 800, fill: C.purple, anchor: "middle" })}
  ${text(899, 619, "P -> D", { size: 14, weight: 800, fill: C.purple, anchor: "middle" })}
  ${text(899, 672, "KV over EFA", { size: 12, weight: 800, fill: C.purple, anchor: "middle" })}
  ${text(900, 797, "One selected prefill-to-decode transfer is shown; requests use different workers across the 8 + 8 pod fleet", { size: 14, weight: 800, fill: C.muted, anchor: "middle" })}

  ${text(45, 817, "Bulk KV data path", { size: 25, weight: 800 })}
  ${box(39, 836, 1722, 127, { fill: C.white, stroke: C.purple, strokeWidth: 2, radius: 13, shadow: false })}
  ${stat(63, 866, 208, "1. Source", "prefill H100 VRAM", C.green)}
  ${arrow(280, 899, 321, 899, { stroke: C.purple, width: 4 })}
  ${stat(330, 866, 208, "2. Connector", "vLLM NIXL", C.purple)}
  ${arrow(547, 899, 588, 899, { stroke: C.purple, width: 4 })}
  ${stat(597, 866, 208, "3. Backend", "LIBFABRIC", C.purple)}
  ${arrow(814, 899, 855, 899, { stroke: C.purple, width: 4 })}
  ${stat(864, 866, 208, "4. Provider", "libfabric efa", C.cyan)}
  ${arrow(1081, 899, 1122, 899, { stroke: C.purple, width: 4 })}
  ${stat(1131, 866, 208, "5. Fabric", "EFA / SRD", C.cyan)}
  ${arrow(1348, 899, 1389, 899, { stroke: C.purple, width: 4 })}
  ${stat(1398, 866, 335, "6. Destination", "decode H100 VRAM", C.green)}

  ${text(45, 1011, "Exact ownership and versions", { size: 25, weight: 800 })}
  ${layerCard(45, 1031, 825, "Host AMI and device layer", "Verified EKS host contract", servingHostRows, C.blue, C.blueBg)}
  ${layerCard(930, 1031, 825, "llm-d AWS inference image", "DLC-equivalent role; not an AWS DLC product", servingImageRows, C.purple, C.purpleBg)}

  ${text(45, 1372, "End-to-end proof collected from the running application", { size: 25, weight: 800 })}
  ${box(39, 1390, 1722, 104, { fill: C.greenBg, stroke: C.green, strokeWidth: 2, radius: 12, shadow: false })}
  ${text(65, 1421, "HARDWARE", { size: 13, weight: 800, fill: C.green })}
  ${text(65, 1446, "8 GPU + 32 EFA per node", { size: 15, weight: 800 })}
  ${text(349, 1421, "POD AND FLEET", { size: 13, weight: 800, fill: C.green })}
  ${text(349, 1446, "1 GPU + 4 EFA/pod | 8P + 8D", { size: 15, weight: 800 })}
  ${text(641, 1421, "TRANSPORT", { size: 13, weight: 800, fill: C.green })}
  ${text(641, 1446, "NIXL + LIBFABRIC + provider=efa", { size: 15, weight: 800 })}
  ${text(1038, 1421, "PEER", { size: 13, weight: 800, fill: C.green })}
  ${text(1038, 1446, "EFA handshakes + compatibility pass", { size: 15, weight: 800 })}
  ${text(1440, 1421, "APPLICATION", { size: 13, weight: 800, fill: C.green })}
  ${text(1440, 1446, "decode external-prefix hit", { size: 15, weight: 800 })}
  ${text(65, 1477, "Observed GPU registration used CUDA DMA-BUF. GDRCopy was not used; this did not prevent successful device-RDMA KV transfer.", { size: 14, weight: 800, fill: C.muted })}

  ${text(45, 1520, "Inventory: docs/reference-stacks/p5-two-node-efa/nixl-efa-serving-inventory.md", { size: 13, weight: 700, fill: C.muted })}
  ${text(1755, 1520, "Pin both AMI release and container digest after validation", { size: 13, weight: 700, fill: C.muted, anchor: "end" })}
</svg>`;

const outputs = await Promise.all([
  writeDiagram("p5-two-node-hardware-ami-dlc-stack", stackDiagram),
  writeDiagram("p5-nccl-efa-verification-path", proofDiagram),
  writeDiagram("p5-nixl-efa-serving-stack", servingDiagram),
]);

for (const output of outputs) {
  console.log(`SVG: ${output.svgPath}`);
  console.log(`PNG: ${output.pngPath}`);
}
