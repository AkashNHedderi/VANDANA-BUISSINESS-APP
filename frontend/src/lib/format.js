export const fmtMoney = (n) => {
  const v = Number(n || 0);
  return "₹" + v.toLocaleString("en-IN", { maximumFractionDigits: 2 });
};

export const fmtNum = (n) =>
  Number(n || 0).toLocaleString("en-IN", { maximumFractionDigits: 3 });

export const fmtDate = (d) => (d ? String(d).slice(0, 10) : "");

export const UNITS = ["KG", "MT", "PCS", "FEET", "SQ FT", "COIL"];

export const PRODUCTS = [
  "PPGI Coil",
  "PPGL Coil",
  "PPGL Roofing Sheet",
  "GI Roofing Sheet",
  "GI Sheet",
  "MS Pipe",
  "GI Pipe",
  "Steel Tube",
  "Roofing Accessory",
];
