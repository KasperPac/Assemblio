#!/usr/bin/env node
import { createClient } from "@supabase/supabase-js";

const args = new Set(process.argv.slice(2));

function getArgValue(flag) {
  const index = process.argv.indexOf(flag);
  if (index === -1) return null;
  return process.argv[index + 1] ?? null;
}

function assertNoError(error, context) {
  if (!error) return;
  throw new Error(`${context}: ${error.message ?? "Unknown Supabase error"}`);
}

function line(sku, quantity) {
  return { sku, quantity };
}

function mergeLineSets(...sets) {
  const totals = new Map();
  for (const set of sets.flat()) {
    if (!set) continue;
    const quantity = Number(set.quantity ?? 0);
    if (!Number.isFinite(quantity) || quantity <= 0) continue;
    totals.set(set.sku, (totals.get(set.sku) ?? 0) + quantity);
  }

  return Array.from(totals.entries())
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([sku, quantity]) => ({ sku, quantity }));
}

function mergePlannedRows(existingMap, rows, keyField, prefix) {
  const merged = new Map(existingMap);

  rows.forEach((row, index) => {
    const key = row[keyField];
    if (!key || merged.has(key)) return;
    merged.set(key, {
      id: `${prefix}-${index + 1}`,
      ...row,
    });
  });

  return merged;
}

function parseFirstNumber(text, fallback = 1) {
  const match = text.match(/(\d+)/);
  return match ? Number(match[1]) : fallback;
}

function quantityByLength(length) {
  if (length >= 50) {
    return {
      belts: 50,
      rollers: 24,
      drives: 3,
      sensors: 6,
      guideRails: 10,
      gearboxes: 3,
      extrusion: 24,
      brackets: 48,
      cables: 7,
      switches: 2,
    };
  }

  if (length >= 25) {
    return {
      belts: 25,
      rollers: 12,
      drives: 2,
      sensors: 4,
      guideRails: 5,
      gearboxes: 2,
      extrusion: 12,
      brackets: 24,
      cables: 4,
      switches: 1,
    };
  }

  return {
    belts: 10,
    rollers: 6,
    drives: 1,
    sensors: 2,
    guideRails: 2,
    gearboxes: 1,
    extrusion: 6,
    brackets: 12,
    cables: 2,
    switches: 1,
  };
}

const tenantName = getArgValue("--tenant") ?? "Pac-Technologies";
const execute = args.has("--execute");
const replaceExistingBoms = args.has("--replace-existing-boms");

if (tenantName === "Fabulous") {
  throw new Error("Tenant 'Fabulous' is blocked by project policy.");
}

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";

if (!supabaseUrl || !serviceRoleKey) {
  throw new Error(
    "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in environment."
  );
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
  },
});

const SUPPLIERS = [
  "Pacific Controls",
  "LabelTech Systems",
  "Siemens Australia",
  "FANUC Oceania",
  "Festo Pty Ltd",
  "Cognex Australia",
  "SMC Pneumatics",
  "Bosch Rexroth",
  "SICK Sensor Intelligence",
  "Omron Industrial",
  "Inductive Automation",
  "NiceLabel",
  "3M Graphics",
];

const COMPONENT_GROUPS = [
  "Electrical & Controls",
  "Pneumatics & Actuators",
  "Sensors & Vision",
  "Conveyors & Motion",
  "Labeling & Printing",
  "Safety Equipment",
  "Structural & Framing",
  "Robotics",
  "Networking & Comms",
  "Software & Licensing",
];

const COMPONENT_CATALOG = [
  {
    sku: "CMP-PLC-S71500",
    name: "Siemens S7-1500 Safety PLC",
    group: "Electrical & Controls",
    supplier: "Siemens Australia",
    unit: "ea",
    costPerUnit: 4850,
    reorderPoint: 5,
    lowStockLevel: 2,
  },
  {
    sku: "CMP-HMI-KTP700",
    name: "Siemens HMI KTP700 Touch Panel",
    group: "Electrical & Controls",
    supplier: "Siemens Australia",
    unit: "ea",
    costPerUnit: 1620,
    reorderPoint: 8,
    lowStockLevel: 3,
  },
  {
    sku: "CMP-DRV-1500",
    name: "Servo Drive 1.5kW",
    group: "Electrical & Controls",
    supplier: "Bosch Rexroth",
    unit: "ea",
    costPerUnit: 980,
    reorderPoint: 10,
    lowStockLevel: 4,
  },
  {
    sku: "CMP-MOT-1500",
    name: "Servo Motor 1.5kW",
    group: "Electrical & Controls",
    supplier: "Bosch Rexroth",
    unit: "ea",
    costPerUnit: 720,
    reorderPoint: 10,
    lowStockLevel: 4,
  },
  {
    sku: "CMP-VFD-2200",
    name: "VFD 2.2kW",
    group: "Electrical & Controls",
    supplier: "Siemens Australia",
    unit: "ea",
    costPerUnit: 560,
    reorderPoint: 8,
    lowStockLevel: 3,
  },
  {
    sku: "CMP-PSU-24V20",
    name: "24VDC Power Supply 20A",
    group: "Electrical & Controls",
    supplier: "Omron Industrial",
    unit: "ea",
    costPerUnit: 185,
    reorderPoint: 15,
    lowStockLevel: 5,
  },
  {
    sku: "CMP-TERM-50",
    name: "Terminal Blocks Set (50pc)",
    group: "Electrical & Controls",
    supplier: null,
    unit: "set",
    costPerUnit: 42,
    reorderPoint: 30,
    lowStockLevel: 10,
  },
  {
    sku: "CMP-CAB-800",
    name: "Control Cabinet 800x600x300",
    group: "Electrical & Controls",
    supplier: null,
    unit: "ea",
    costPerUnit: 680,
    reorderPoint: 5,
    lowStockLevel: 2,
  },
  {
    sku: "CMP-MCB-16A",
    name: "Circuit Breaker 16A",
    group: "Electrical & Controls",
    supplier: null,
    unit: "ea",
    costPerUnit: 28,
    reorderPoint: 40,
    lowStockLevel: 15,
  },
  {
    sku: "CMP-SOL-24V",
    name: "Solenoid Valve 24VDC",
    group: "Pneumatics & Actuators",
    supplier: "SMC Pneumatics",
    unit: "ea",
    costPerUnit: 95,
    reorderPoint: 20,
    lowStockLevel: 8,
  },
  {
    sku: "CMP-CYL-100",
    name: "Pneumatic Cylinder 100mm Stroke",
    group: "Pneumatics & Actuators",
    supplier: "SMC Pneumatics",
    unit: "ea",
    costPerUnit: 145,
    reorderPoint: 15,
    lowStockLevel: 5,
  },
  {
    sku: "CMP-FRL-01",
    name: "Air Preparation Unit (FRL)",
    group: "Pneumatics & Actuators",
    supplier: "Festo Pty Ltd",
    unit: "ea",
    costPerUnit: 210,
    reorderPoint: 10,
    lowStockLevel: 4,
  },
  {
    sku: "CMP-VAC-GEN",
    name: "Vacuum Generator",
    group: "Pneumatics & Actuators",
    supplier: "Festo Pty Ltd",
    unit: "ea",
    costPerUnit: 320,
    reorderPoint: 8,
    lowStockLevel: 3,
  },
  {
    sku: "CMP-CUP-30",
    name: "Suction Cup 30mm",
    group: "Pneumatics & Actuators",
    supplier: "Festo Pty Ltd",
    unit: "ea",
    costPerUnit: 12,
    reorderPoint: 50,
    lowStockLevel: 20,
  },
  {
    sku: "CMP-GRIP-PN",
    name: "Pneumatic Gripper",
    group: "Pneumatics & Actuators",
    supplier: "Festo Pty Ltd",
    unit: "ea",
    costPerUnit: 480,
    reorderPoint: 6,
    lowStockLevel: 2,
  },
  {
    sku: "CMP-CAM-GIGE",
    name: "Industrial Vision Camera (GigE)",
    group: "Sensors & Vision",
    supplier: "Cognex Australia",
    unit: "ea",
    costPerUnit: 2350,
    reorderPoint: 6,
    lowStockLevel: 2,
  },
  {
    sku: "CMP-LENS-16",
    name: "Machine Vision Lens 16mm",
    group: "Sensors & Vision",
    supplier: "Cognex Australia",
    unit: "ea",
    costPerUnit: 380,
    reorderPoint: 8,
    lowStockLevel: 3,
  },
  {
    sku: "CMP-LASER-SCAN",
    name: "Safety Laser Scanner",
    group: "Sensors & Vision",
    supplier: "SICK Sensor Intelligence",
    unit: "ea",
    costPerUnit: 3200,
    reorderPoint: 4,
    lowStockLevel: 1,
  },
  {
    sku: "CMP-PE-SENS",
    name: "Photoelectric Sensor",
    group: "Sensors & Vision",
    supplier: "SICK Sensor Intelligence",
    unit: "ea",
    costPerUnit: 85,
    reorderPoint: 25,
    lowStockLevel: 10,
  },
  {
    sku: "CMP-PROX-IND",
    name: "Proximity Sensor Inductive",
    group: "Sensors & Vision",
    supplier: "Omron Industrial",
    unit: "ea",
    costPerUnit: 65,
    reorderPoint: 30,
    lowStockLevel: 10,
  },
  {
    sku: "CMP-LOAD-50",
    name: "Load Cell 50kg",
    group: "Sensors & Vision",
    supplier: null,
    unit: "ea",
    costPerUnit: 290,
    reorderPoint: 10,
    lowStockLevel: 4,
  },
  {
    sku: "CMP-BCODE-FX",
    name: "Barcode Scanner Fixed Mount",
    group: "Sensors & Vision",
    supplier: "Cognex Australia",
    unit: "ea",
    costPerUnit: 890,
    reorderPoint: 6,
    lowStockLevel: 2,
  },
  {
    sku: "CMP-LCURT-T4",
    name: "Safety Light Curtain Type 4",
    group: "Sensors & Vision",
    supplier: "SICK Sensor Intelligence",
    unit: "ea",
    costPerUnit: 1450,
    reorderPoint: 4,
    lowStockLevel: 1,
  },
  {
    sku: "CMP-BELT-1M",
    name: "Modular Belt 1m Section",
    group: "Conveyors & Motion",
    supplier: "Bosch Rexroth",
    unit: "m",
    costPerUnit: 180,
    reorderPoint: 20,
    lowStockLevel: 8,
  },
  {
    sku: "CMP-ROLL-500",
    name: "Conveyor Roller 500mm",
    group: "Conveyors & Motion",
    supplier: null,
    unit: "ea",
    costPerUnit: 75,
    reorderPoint: 30,
    lowStockLevel: 12,
  },
  {
    sku: "CMP-TBELT-GT3",
    name: "Timing Belt GT3 5m",
    group: "Conveyors & Motion",
    supplier: "Bosch Rexroth",
    unit: "ea",
    costPerUnit: 48,
    reorderPoint: 15,
    lowStockLevel: 5,
  },
  {
    sku: "CMP-LGR-1M",
    name: "Linear Guide Rail 1m",
    group: "Conveyors & Motion",
    supplier: "Bosch Rexroth",
    unit: "ea",
    costPerUnit: 220,
    reorderPoint: 10,
    lowStockLevel: 4,
  },
  {
    sku: "CMP-BSCR-500",
    name: "Ball Screw Assembly 500mm",
    group: "Conveyors & Motion",
    supplier: "Bosch Rexroth",
    unit: "ea",
    costPerUnit: 340,
    reorderPoint: 6,
    lowStockLevel: 2,
  },
  {
    sku: "CMP-GBOX-10",
    name: "Gearbox 10:1 Ratio",
    group: "Conveyors & Motion",
    supplier: null,
    unit: "ea",
    costPerUnit: 410,
    reorderPoint: 6,
    lowStockLevel: 2,
  },
  {
    sku: "CMP-PRINT-TT",
    name: "Thermal Transfer Print Engine",
    group: "Labeling & Printing",
    supplier: "LabelTech Systems",
    unit: "ea",
    costPerUnit: 2800,
    reorderPoint: 4,
    lowStockLevel: 1,
  },
  {
    sku: "CMP-RBN-110",
    name: "Ribbon 110mm x 300m",
    group: "Labeling & Printing",
    supplier: "LabelTech Systems",
    unit: "roll",
    costPerUnit: 38,
    reorderPoint: 50,
    lowStockLevel: 20,
  },
  {
    sku: "CMP-LBL-100X50",
    name: "Label Roll 100x50mm (2000pc)",
    group: "Labeling & Printing",
    supplier: "LabelTech Systems",
    unit: "roll",
    costPerUnit: 22,
    reorderPoint: 80,
    lowStockLevel: 30,
  },
  {
    sku: "CMP-PHEAD-01",
    name: "Print Head Assembly",
    group: "Labeling & Printing",
    supplier: "LabelTech Systems",
    unit: "ea",
    costPerUnit: 520,
    reorderPoint: 4,
    lowStockLevel: 1,
  },
  {
    sku: "CMP-TAMP-01",
    name: "Label Applicator Tamp Pad",
    group: "Labeling & Printing",
    supplier: "LabelTech Systems",
    unit: "ea",
    costPerUnit: 165,
    reorderPoint: 8,
    lowStockLevel: 3,
  },
  {
    sku: "CMP-VINYL-BLK",
    name: "Printable Vinyl Roll - Black",
    group: "Labeling & Printing",
    supplier: "3M Graphics",
    unit: "roll",
    costPerUnit: 85,
    reorderPoint: 10,
    lowStockLevel: 3,
  },
  {
    sku: "CMP-VINYL-BLU",
    name: "Printable Vinyl Roll - Blue",
    group: "Labeling & Printing",
    supplier: "3M Graphics",
    unit: "roll",
    costPerUnit: 85,
    reorderPoint: 10,
    lowStockLevel: 3,
  },
  {
    sku: "CMP-VINYL-GLD",
    name: "Printable Vinyl Roll - Gold",
    group: "Labeling & Printing",
    supplier: "3M Graphics",
    unit: "roll",
    costPerUnit: 95,
    reorderPoint: 8,
    lowStockLevel: 2,
  },
  {
    sku: "CMP-VINYL-GRN",
    name: "Printable Vinyl Roll - Green",
    group: "Labeling & Printing",
    supplier: "3M Graphics",
    unit: "roll",
    costPerUnit: 85,
    reorderPoint: 10,
    lowStockLevel: 3,
  },
  {
    sku: "CMP-VINYL-YLW",
    name: "Printable Vinyl Roll - Yellow",
    group: "Labeling & Printing",
    supplier: "3M Graphics",
    unit: "roll",
    costPerUnit: 85,
    reorderPoint: 10,
    lowStockLevel: 3,
  },
  {
    sku: "CMP-LAM-CLR",
    name: "Clear Overlaminate Roll",
    group: "Labeling & Printing",
    supplier: "3M Graphics",
    unit: "roll",
    costPerUnit: 120,
    reorderPoint: 8,
    lowStockLevel: 2,
  },
  {
    sku: "CMP-XFER-TAPE",
    name: "Application Transfer Tape Roll",
    group: "Labeling & Printing",
    supplier: "3M Graphics",
    unit: "roll",
    costPerUnit: 45,
    reorderPoint: 10,
    lowStockLevel: 3,
  },
  {
    sku: "CMP-ESTOP-01",
    name: "E-Stop Mushroom Button",
    group: "Safety Equipment",
    supplier: "SICK Sensor Intelligence",
    unit: "ea",
    costPerUnit: 45,
    reorderPoint: 20,
    lowStockLevel: 8,
  },
  {
    sku: "CMP-SDOOR-01",
    name: "Safety Door Switch",
    group: "Safety Equipment",
    supplier: "SICK Sensor Intelligence",
    unit: "ea",
    costPerUnit: 120,
    reorderPoint: 12,
    lowStockLevel: 4,
  },
  {
    sku: "CMP-GUARD-1200",
    name: "Machine Guarding Panel 1200x800",
    group: "Safety Equipment",
    supplier: null,
    unit: "ea",
    costPerUnit: 280,
    reorderPoint: 10,
    lowStockLevel: 4,
  },
  {
    sku: "CMP-SREL-01",
    name: "Safety Relay Module",
    group: "Safety Equipment",
    supplier: "Siemens Australia",
    unit: "ea",
    costPerUnit: 260,
    reorderPoint: 8,
    lowStockLevel: 3,
  },
  {
    sku: "CMP-ALU-4040",
    name: "Aluminium Extrusion 40x40 2m",
    group: "Structural & Framing",
    supplier: null,
    unit: "ea",
    costPerUnit: 32,
    reorderPoint: 60,
    lowStockLevel: 20,
  },
  {
    sku: "CMP-BRKT-40",
    name: "Angle Bracket 40x40",
    group: "Structural & Framing",
    supplier: null,
    unit: "ea",
    costPerUnit: 4,
    reorderPoint: 100,
    lowStockLevel: 30,
  },
  {
    sku: "CMP-CTRAY-200",
    name: "Cable Tray 200mm 2m Section",
    group: "Structural & Framing",
    supplier: null,
    unit: "ea",
    costPerUnit: 55,
    reorderPoint: 15,
    lowStockLevel: 5,
  },
  {
    sku: "CMP-COBOT-CRX10",
    name: "FANUC CRX-10iA Cobot",
    group: "Robotics",
    supplier: "FANUC Oceania",
    unit: "ea",
    costPerUnit: 42000,
    reorderPoint: 1,
    lowStockLevel: 0,
  },
  {
    sku: "CMP-GRIP-PLT",
    name: "Robot Gripper Plate",
    group: "Robotics",
    supplier: "FANUC Oceania",
    unit: "ea",
    costPerUnit: 850,
    reorderPoint: 4,
    lowStockLevel: 1,
  },
  {
    sku: "CMP-TC-QC10",
    name: "Tool Changer QC-10",
    group: "Robotics",
    supplier: "FANUC Oceania",
    unit: "ea",
    costPerUnit: 1950,
    reorderPoint: 2,
    lowStockLevel: 1,
  },
  {
    sku: "CMP-ETH-SW8",
    name: "Industrial Ethernet Switch 8-Port",
    group: "Networking & Comms",
    supplier: "Siemens Australia",
    unit: "ea",
    costPerUnit: 520,
    reorderPoint: 6,
    lowStockLevel: 2,
  },
  {
    sku: "CMP-CAT6-10M",
    name: "CAT6 Industrial Ethernet Cable 10m",
    group: "Networking & Comms",
    supplier: null,
    unit: "ea",
    costPerUnit: 28,
    reorderPoint: 40,
    lowStockLevel: 15,
  },
  {
    sku: "CMP-PNET-5M",
    name: "PROFINET Cable 5m",
    group: "Networking & Comms",
    supplier: null,
    unit: "ea",
    costPerUnit: 35,
    reorderPoint: 30,
    lowStockLevel: 10,
  },
  {
    sku: "CMP-WAP-IND",
    name: "Wireless Access Point Industrial",
    group: "Networking & Comms",
    supplier: null,
    unit: "ea",
    costPerUnit: 680,
    reorderPoint: 3,
    lowStockLevel: 1,
  },
  {
    sku: "CMP-SCADA-RUNTIME",
    name: "SCADA Runtime License",
    group: "Software & Licensing",
    supplier: "Inductive Automation",
    unit: "license",
    costPerUnit: 6500,
    reorderPoint: 1,
    lowStockLevel: 0,
  },
  {
    sku: "CMP-SCADA-OEE",
    name: "OEE & Reporting Module License",
    group: "Software & Licensing",
    supplier: "Inductive Automation",
    unit: "license",
    costPerUnit: 2200,
    reorderPoint: 1,
    lowStockLevel: 0,
  },
  {
    sku: "CMP-SCADA-HIST",
    name: "Historian Gateway License",
    group: "Software & Licensing",
    supplier: "Inductive Automation",
    unit: "license",
    costPerUnit: 1800,
    reorderPoint: 1,
    lowStockLevel: 0,
  },
  {
    sku: "CMP-IPC-PANELPC",
    name: "Industrial Panel PC",
    group: "Software & Licensing",
    supplier: "Inductive Automation",
    unit: "ea",
    costPerUnit: 2800,
    reorderPoint: 2,
    lowStockLevel: 1,
  },
  {
    sku: "CMP-LABEL-SW",
    name: "Label Design Software License",
    group: "Software & Licensing",
    supplier: "NiceLabel",
    unit: "license",
    costPerUnit: 950,
    reorderPoint: 3,
    lowStockLevel: 1,
  },
];

const controlCore = [
  line("CMP-PLC-S71500", 1),
  line("CMP-HMI-KTP700", 1),
  line("CMP-PSU-24V20", 1),
  line("CMP-TERM-50", 1),
  line("CMP-CAB-800", 1),
  line("CMP-MCB-16A", 4),
  line("CMP-ETH-SW8", 1),
  line("CMP-CAT6-10M", 3),
  line("CMP-PNET-5M", 2),
  line("CMP-ESTOP-01", 2),
  line("CMP-SREL-01", 1),
];

const frameSafety = [
  line("CMP-GUARD-1200", 2),
  line("CMP-ALU-4040", 8),
  line("CMP-BRKT-40", 16),
  line("CMP-CTRAY-200", 2),
];

const conveyorBase = [
  line("CMP-BELT-1M", 2),
  line("CMP-ROLL-500", 6),
  line("CMP-VFD-2200", 1),
  line("CMP-GBOX-10", 1),
  line("CMP-PE-SENS", 2),
  line("CMP-PROX-IND", 2),
];

const labelingBase = [
  line("CMP-PRINT-TT", 1),
  line("CMP-RBN-110", 2),
  line("CMP-LBL-100X50", 2),
  line("CMP-PHEAD-01", 1),
  line("CMP-TAMP-01", 1),
];

const softwareBase = [
  line("CMP-IPC-PANELPC", 1),
  line("CMP-SCADA-RUNTIME", 1),
  line("CMP-SCADA-HIST", 1),
];

const colorSkuByName = {
  blue: "CMP-VINYL-BLU",
  black: "CMP-VINYL-BLK",
  gold: "CMP-VINYL-GLD",
  green: "CMP-VINYL-GRN",
  yellow: "CMP-VINYL-YLW",
};

function getColorSku(title) {
  const key = title.trim().toLowerCase();
  return colorSkuByName[key] ?? "CMP-VINYL-BLK";
}

function buildAutomatedCasePackingBom(variantTitle) {
  const isFull = /fully/i.test(variantTitle);

  return mergeLineSets(
    controlCore,
    frameSafety,
    [
      line("CMP-DRV-1500", isFull ? 4 : 2),
      line("CMP-MOT-1500", isFull ? 4 : 2),
      line("CMP-LGR-1M", isFull ? 4 : 2),
      line("CMP-BSCR-500", isFull ? 4 : 2),
      line("CMP-VAC-GEN", isFull ? 2 : 1),
      line("CMP-CUP-30", isFull ? 8 : 4),
      line("CMP-GRIP-PN", 1),
      line("CMP-FRL-01", 1),
      line("CMP-PE-SENS", isFull ? 6 : 4),
      line("CMP-PROX-IND", isFull ? 6 : 4),
      line("CMP-SDOOR-01", isFull ? 4 : 2),
      line("CMP-GUARD-1200", isFull ? 6 : 4),
    ],
    isFull
      ? [
          line("CMP-COBOT-CRX10", 1),
          line("CMP-GRIP-PLT", 1),
          line("CMP-TC-QC10", 1),
          line("CMP-LCURT-T4", 1),
        ]
      : []
  );
}

function buildBarcodeVerificationBom() {
  return mergeLineSets(controlCore, frameSafety, [
    line("CMP-BCODE-FX", 1),
    line("CMP-CAM-GIGE", 1),
    line("CMP-LENS-16", 1),
    line("CMP-LASER-SCAN", 1),
    line("CMP-LCURT-T4", 1),
    line("CMP-PE-SENS", 2),
    line("CMP-PROX-IND", 2),
    line("CMP-SOL-24V", 1),
    line("CMP-CYL-100", 1),
    line("CMP-SDOOR-01", 2),
  ]);
}

function buildBottleLabelingBom(variantTitle) {
  const bpm = parseFirstNumber(variantTitle, 30);
  const speedTier = bpm >= 120 ? 3 : bpm >= 60 ? 2 : 1;

  return mergeLineSets(controlCore, conveyorBase, labelingBase, [
    line("CMP-ALU-4040", 6 + speedTier * 2),
    line("CMP-BRKT-40", 12 + speedTier * 4),
    line("CMP-GUARD-1200", 2 + speedTier - 1),
    line("CMP-BCODE-FX", 1),
    line("CMP-PE-SENS", 2 + speedTier),
    line("CMP-PROX-IND", 2 + speedTier - 1),
    line("CMP-BELT-1M", 2 + speedTier),
    line("CMP-ROLL-500", 6 + speedTier * 2),
    line("CMP-VFD-2200", speedTier),
    line("CMP-LBL-100X50", 2 + speedTier),
    line("CMP-RBN-110", 2 + speedTier),
    line("CMP-TAMP-01", speedTier),
  ],
  speedTier >= 3
    ? [line("CMP-CAM-GIGE", 1), line("CMP-LENS-16", 1), line("CMP-LCURT-T4", 1)]
    : []);
}

function buildConveyorIntegrationBom(variantTitle) {
  const length = parseFirstNumber(variantTitle, 10);
  const quantities = quantityByLength(length);

  return mergeLineSets(controlCore, [
    line("CMP-BELT-1M", quantities.belts),
    line("CMP-ROLL-500", quantities.rollers),
    line("CMP-VFD-2200", quantities.drives),
    line("CMP-PROX-IND", quantities.sensors),
    line("CMP-PE-SENS", quantities.sensors),
    line("CMP-LGR-1M", quantities.guideRails),
    line("CMP-GBOX-10", quantities.gearboxes),
    line("CMP-ALU-4040", quantities.extrusion),
    line("CMP-BRKT-40", quantities.brackets),
    line("CMP-CAT6-10M", quantities.cables),
    line("CMP-ETH-SW8", quantities.switches),
    line("CMP-GUARD-1200", Math.max(2, quantities.drives)),
    line("CMP-SDOOR-01", Math.max(2, quantities.drives)),
  ]);
}

function buildCheckweigherBom(variantTitle) {
  const width = parseFirstNumber(variantTitle, 150);
  const scale = width >= 300 ? 2 : 1;

  return mergeLineSets(controlCore, [
    line("CMP-BELT-1M", scale + 1),
    line("CMP-ROLL-500", 4 * scale),
    line("CMP-VFD-2200", scale),
    line("CMP-DRV-1500", scale),
    line("CMP-MOT-1500", scale),
    line("CMP-LOAD-50", scale),
    line("CMP-PE-SENS", 3),
    line("CMP-PROX-IND", 2),
    line("CMP-SOL-24V", 2),
    line("CMP-CYL-100", 1),
    line("CMP-FRL-01", 1),
    line("CMP-LCURT-T4", 1),
    line("CMP-GUARD-1200", 2),
  ]);
}

function buildVisionInspectionBom(variantTitle) {
  const cameraCount = parseFirstNumber(variantTitle, 1);
  const lowerTitle = variantTitle.toLowerCase();

  return mergeLineSets(controlCore, frameSafety, [
    line("CMP-CAM-GIGE", cameraCount),
    line("CMP-LENS-16", cameraCount),
    line("CMP-BCODE-FX", 1),
    line("CMP-PE-SENS", 2 + cameraCount),
    line("CMP-PROX-IND", 2),
    line("CMP-LCURT-T4", 1),
  ],
  lowerTitle.includes("air")
    ? [line("CMP-SOL-24V", 2), line("CMP-CYL-100", 1), line("CMP-FRL-01", 1)]
    : [],
  lowerTitle.includes("pusher")
    ? [line("CMP-SOL-24V", 1), line("CMP-CYL-100", 1), line("CMP-LGR-1M", 1)]
    : []);
}

function buildStickerBom(variantTitle) {
  return mergeLineSets([
    line(getColorSku(variantTitle), 1),
    line("CMP-LAM-CLR", 1),
    line("CMP-XFER-TAPE", 1),
  ]);
}

function buildPrintApplyBom(variantTitle) {
  const lowerTitle = variantTitle.toLowerCase();
  const isPallet = lowerTitle.includes("pallet");
  const isTop = lowerTitle.includes("top");

  return mergeLineSets(controlCore, conveyorBase, labelingBase, [
    line("CMP-BCODE-FX", isPallet ? 2 : 1),
    line("CMP-LCURT-T4", 1),
    line("CMP-GUARD-1200", isPallet ? 4 : 2),
    line("CMP-ALU-4040", isPallet ? 10 : 6),
    line("CMP-BRKT-40", isPallet ? 20 : 12),
    line("CMP-TAMP-01", isPallet ? 2 : 1),
    line("CMP-PRINT-TT", isPallet ? 2 : 1),
    line("CMP-LBL-100X50", isPallet ? 4 : 2),
    line("CMP-RBN-110", isPallet ? 4 : 2),
    line("CMP-PE-SENS", isTop ? 4 : 3),
  ]);
}

function buildPalletizingBom(variantTitle) {
  const capacity = parseFirstNumber(variantTitle, 25);
  const heavyDuty = capacity >= 50;

  return mergeLineSets(controlCore, frameSafety, conveyorBase, [
    line("CMP-COBOT-CRX10", 1),
    line("CMP-GRIP-PLT", heavyDuty ? 2 : 1),
    line("CMP-TC-QC10", 1),
    line("CMP-LCURT-T4", 1),
    line("CMP-GUARD-1200", heavyDuty ? 6 : 4),
    line("CMP-ALU-4040", heavyDuty ? 12 : 10),
    line("CMP-BRKT-40", heavyDuty ? 24 : 20),
    line("CMP-PE-SENS", 4),
    line("CMP-PROX-IND", 4),
    line("CMP-DRV-1500", heavyDuty ? 2 : 1),
    line("CMP-MOT-1500", heavyDuty ? 2 : 1),
  ]);
}

function buildScadaBom(variantTitle) {
  const lowerTitle = variantTitle.toLowerCase();
  const lineCount = lowerTitle.includes("enterprise")
    ? 10
    : lowerTitle.includes("multi")
      ? 5
      : 1;

  return mergeLineSets(softwareBase, [
    line("CMP-SCADA-RUNTIME", lineCount),
    line("CMP-SCADA-OEE", lineCount >= 10 ? 2 : 1),
    line("CMP-IPC-PANELPC", Math.max(1, Math.ceil(lineCount / 3))),
    line("CMP-ETH-SW8", Math.max(1, Math.ceil(lineCount / 4))),
    line("CMP-CAT6-10M", lineCount * 2),
    line("CMP-WAP-IND", lineCount >= 5 ? 1 : 0),
  ]);
}

function buildStandaloneLabelingBom(variantTitle) {
  const withScanner = /^yes$/i.test(variantTitle.trim());

  return mergeLineSets(softwareBase, labelingBase, [
    line("CMP-LABEL-SW", 1),
    line("CMP-PRINT-TT", 1),
    line("CMP-LBL-100X50", 2),
    line("CMP-RBN-110", 2),
    line("CMP-IPC-PANELPC", 1),
    line("CMP-BCODE-FX", withScanner ? 1 : 0),
  ]);
}

function buildTestProductBom(variantTitle) {
  return mergeLineSets([
    line(getColorSku(variantTitle), 1),
    line("CMP-LAM-CLR", 1),
    line("CMP-XFER-TAPE", 1),
    line("CMP-LBL-100X50", 1),
  ]);
}

function buildBomBlueprint(productTitle, variantTitle) {
  switch (productTitle) {
    case "Automated Case Packing Cell":
      return buildAutomatedCasePackingBom(variantTitle);
    case "Barcode Verification & Grading Station":
      return buildBarcodeVerificationBom();
    case "Bottle Labeling Line":
      return buildBottleLabelingBom(variantTitle);
    case "Conveyor Line Integration Package":
      return buildConveyorIntegrationBom(variantTitle);
    case "Inline Checkweigher with Reject":
      return buildCheckweigherBom(variantTitle);
    case "Inline Vision Inspection System":
      return buildVisionInspectionBom(variantTitle);
    case "Pac-Technologies Car Sticker":
      return buildStickerBom(variantTitle);
    case "Print & Apply Labeling Cell":
      return buildPrintApplyBom(variantTitle);
    case "Robotic Palletizing Cell":
      return buildPalletizingBom(variantTitle);
    case "SCADA & Production Reporting Deployment":
      return buildScadaBom(variantTitle);
    case "Stand Alone Labeling System":
      return buildStandaloneLabelingBom(variantTitle);
    case "Test Product":
      return buildTestProductBom(variantTitle);
    default:
      return mergeLineSets(controlCore, frameSafety);
  }
}

async function fetchTenant() {
  const { data, error } = await supabase
    .from("tenant")
    .select("id,name")
    .eq("name", tenantName)
    .limit(2);

  assertNoError(error, "Failed to fetch tenant");

  if (!data?.length) {
    throw new Error(`Tenant not found: ${tenantName}`);
  }

  if (data.length > 1) {
    throw new Error(`Multiple tenants found for name: ${tenantName}`);
  }

  return data[0];
}

async function fetchDefaultLocation(tenantId) {
  const { data, error } = await supabase
    .from("location")
    .select("id,name,is_default")
    .eq("tenant_id", tenantId)
    .order("is_default", { ascending: false })
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  assertNoError(error, "Failed to fetch default location");

  if (!data?.id) {
    throw new Error(`No location found for tenant ${tenantName}`);
  }

  return data;
}

async function fetchSuppliersByName(tenantId) {
  const { data, error } = await supabase
    .from("suppliers")
    .select("id,name")
    .eq("tenant_id", tenantId);

  assertNoError(error, "Failed to fetch suppliers");
  return new Map((data ?? []).map((row) => [row.name, row]));
}

async function fetchGroupsByName(tenantId) {
  const { data, error } = await supabase
    .from("component_group")
    .select("id,name")
    .eq("tenant_id", tenantId);

  assertNoError(error, "Failed to fetch component groups");
  return new Map((data ?? []).map((row) => [row.name, row]));
}

async function fetchComponentsBySku(tenantId) {
  const { data, error } = await supabase
    .from("component")
    .select("id,sku,name")
    .eq("tenant_id", tenantId)
    .not("sku", "is", null);

  assertNoError(error, "Failed to fetch components");
  return new Map((data ?? []).map((row) => [row.sku, row]));
}

async function fetchProducts(tenantId) {
  const { data, error } = await supabase
    .from("product")
    .select("id,title,description")
    .eq("tenant_id", tenantId);

  assertNoError(error, "Failed to fetch products");
  return data ?? [];
}

async function fetchVariants(tenantId) {
  const { data, error } = await supabase
    .from("product_variant")
    .select("id,product_id,title,sku")
    .eq("tenant_id", tenantId)
    .order("created_at", { ascending: true });

  assertNoError(error, "Failed to fetch variants");
  return data ?? [];
}

async function fetchExistingBoms(tenantId) {
  const { data, error } = await supabase
    .from("product_bom")
    .select("id,variant_id,version,is_active,status")
    .eq("tenant_id", tenantId)
    .order("version", { ascending: false });

  assertNoError(error, "Failed to fetch existing BOMs");
  return data ?? [];
}

async function insertRows(table, rows, context) {
  if (rows.length === 0) return;
  const { error } = await supabase.from(table).insert(rows);
  assertNoError(error, context);
}

async function main() {
  const tenant = await fetchTenant();
  const location = await fetchDefaultLocation(tenant.id);

  const [initialSuppliers, initialGroups, initialComponents, products, variants, existingBoms] =
    await Promise.all([
      fetchSuppliersByName(tenant.id),
      fetchGroupsByName(tenant.id),
      fetchComponentsBySku(tenant.id),
      fetchProducts(tenant.id),
      fetchVariants(tenant.id),
      fetchExistingBoms(tenant.id),
    ]);

  const missingSuppliers = SUPPLIERS.filter((name) => !initialSuppliers.has(name)).map((name) => ({
    tenant_id: tenant.id,
    name,
  }));

  const missingGroups = COMPONENT_GROUPS.filter((name) => !initialGroups.has(name)).map((name) => ({
    tenant_id: tenant.id,
    name,
  }));

  const variantsByProductId = new Map();
  for (const variant of variants) {
    const current = variantsByProductId.get(variant.product_id) ?? [];
    current.push(variant);
    variantsByProductId.set(variant.product_id, current);
  }

  const bomStateByVariantId = new Map();
  for (const bom of existingBoms) {
    const state = bomStateByVariantId.get(bom.variant_id) ?? {
      hasActive: false,
      highestVersion: 0,
    };
    state.hasActive = state.hasActive || Boolean(bom.is_active);
    state.highestVersion = Math.max(state.highestVersion, Number(bom.version ?? 0));
    bomStateByVariantId.set(bom.variant_id, state);
  }

  const supplierCountBefore = initialSuppliers.size;
  const groupCountBefore = initialGroups.size;
  const componentCountBefore = initialComponents.size;

  if (execute) {
    await insertRows("suppliers", missingSuppliers, "Failed to insert suppliers");
    await insertRows("component_group", missingGroups, "Failed to insert component groups");
  }

  const suppliersByName = execute
    ? await fetchSuppliersByName(tenant.id)
    : mergePlannedRows(initialSuppliers, missingSuppliers, "name", "planned-supplier");
  const groupsByName = execute
    ? await fetchGroupsByName(tenant.id)
    : mergePlannedRows(initialGroups, missingGroups, "name", "planned-group");

  const missingComponents = COMPONENT_CATALOG.filter(
    ({ sku }) => !initialComponents.has(sku)
  ).map((component) => {
    const groupId = groupsByName.get(component.group)?.id;
    if (!groupId) {
      throw new Error(`Missing component group: ${component.group}`);
    }

    const supplierId = component.supplier
      ? suppliersByName.get(component.supplier)?.id ?? null
      : null;

    return {
      tenant_id: tenant.id,
      group_id: groupId,
      supplier_id: supplierId,
      location_id: location.id,
      name: component.name,
      sku: component.sku,
      unit: component.unit,
      cost_per_unit: component.costPerUnit,
      reorder_point: component.reorderPoint,
      low_stock_level: component.lowStockLevel,
    };
  });

  if (execute) {
    await insertRows("component", missingComponents, "Failed to insert components");
  }

  const componentsBySku = execute
    ? await fetchComponentsBySku(tenant.id)
    : mergePlannedRows(
        initialComponents,
        missingComponents.map((component) => ({
          id: component.sku,
          sku: component.sku,
          name: component.name,
        })),
        "sku",
        "planned-component"
      );
  const productTitleById = new Map(products.map((product) => [product.id, product.title]));

  const bomPlans = [];
  for (const variant of variants) {
    const productTitle = productTitleById.get(variant.product_id) ?? "Unknown product";
    const existingState = bomStateByVariantId.get(variant.id);

    if (existingState?.hasActive && !replaceExistingBoms) {
      bomPlans.push({
        variantId: variant.id,
        productTitle,
        variantTitle: variant.title,
        status: "skip_existing_active",
        version: existingState.highestVersion,
        lines: [],
      });
      continue;
    }

    const blueprint = buildBomBlueprint(productTitle, variant.title);
    const lines = blueprint.map((entry) => {
      const component = componentsBySku.get(entry.sku);
      if (!component?.id) {
        throw new Error(`Missing component for SKU ${entry.sku}`);
      }

      return {
        component_id: component.id,
        sku: entry.sku,
        quantity: entry.quantity,
      };
    });

    bomPlans.push({
      variantId: variant.id,
      productTitle,
      variantTitle: variant.title,
      status: "ready",
      version: (existingState?.highestVersion ?? 0) + 1,
      lines,
    });
  }

  const summary = {
    tenant: tenant.name,
    tenantId: tenant.id,
    location: location.name,
    mode: execute ? "execute" : "dry-run",
    existingBefore: {
      suppliers: supplierCountBefore,
      componentGroups: groupCountBefore,
      components: componentCountBefore,
      variants: variants.length,
      boms: existingBoms.length,
    },
    plannedChanges: {
      suppliersToCreate: missingSuppliers.length,
      componentGroupsToCreate: missingGroups.length,
      componentsToCreate: missingComponents.length,
      bomsToCreate: bomPlans.filter((plan) => plan.status === "ready").length,
      variantsSkipped: bomPlans.filter((plan) => plan.status !== "ready").length,
    },
    bomPreview: bomPlans.slice(0, 8).map((plan) => ({
      product: plan.productTitle,
      variant: plan.variantTitle,
      status: plan.status,
      version: plan.version,
      lineCount: plan.lines.length,
      sampleLines: plan.lines.slice(0, 5).map((entry) => ({
        sku: entry.sku,
        quantity: entry.quantity,
      })),
    })),
  };

  console.log(JSON.stringify(summary, null, 2));

  if (!execute) {
    console.log("Dry run only. Re-run with --execute to apply.");
    return;
  }

  if (replaceExistingBoms) {
    const activeVariantIds = bomPlans
      .filter((plan) => plan.status === "ready")
      .map((plan) => plan.variantId);

    if (activeVariantIds.length > 0) {
      const { error } = await supabase
        .from("product_bom")
        .update({ is_active: false })
        .eq("tenant_id", tenant.id)
        .in("variant_id", activeVariantIds)
        .eq("is_active", true);
      assertNoError(error, "Failed to deactivate existing active BOMs");
    }
  }

  let createdBomCount = 0;
  let createdLineCount = 0;

  for (const plan of bomPlans) {
    if (plan.status !== "ready") continue;

    const { data: insertedBom, error: bomError } = await supabase
      .from("product_bom")
      .insert({
        tenant_id: tenant.id,
        variant_id: plan.variantId,
        version: plan.version,
        status: "active",
        is_active: true,
      })
      .select("id")
      .single();

    assertNoError(
      bomError,
      `Failed to create BOM for ${plan.productTitle} / ${plan.variantTitle}`
    );

    const rows = plan.lines.map((entry) => ({
      tenant_id: tenant.id,
      product_bom_id: insertedBom.id,
      component_id: entry.component_id,
      quantity: entry.quantity,
    }));

    const { error: linesError } = await supabase
      .from("product_bom_component")
      .insert(rows);

    if (linesError) {
      await supabase.from("product_bom").delete().eq("id", insertedBom.id);
      assertNoError(
        linesError,
        `Failed to create BOM lines for ${plan.productTitle} / ${plan.variantTitle}`
      );
    }

    createdBomCount += 1;
    createdLineCount += rows.length;
  }

  const [{ count: finalComponentCount, error: componentCountError }, { count: finalBomCount, error: bomCountError }] =
    await Promise.all([
      supabase
        .from("component")
        .select("*", { count: "exact", head: true })
        .eq("tenant_id", tenant.id),
      supabase
        .from("product_bom")
        .select("*", { count: "exact", head: true })
        .eq("tenant_id", tenant.id),
    ]);

  assertNoError(componentCountError, "Failed to count components after seeding");
  assertNoError(bomCountError, "Failed to count BOMs after seeding");

  console.log(
    JSON.stringify(
      {
        status: "ok",
        tenant: tenant.name,
        created: {
          suppliers: missingSuppliers.length,
          componentGroups: missingGroups.length,
          components: missingComponents.length,
          boms: createdBomCount,
          bomLines: createdLineCount,
        },
        totals: {
          components: finalComponentCount ?? 0,
          boms: finalBomCount ?? 0,
        },
      },
      null,
      2
    )
  );
}

await main();
