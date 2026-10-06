// Paper-agnostic persona attribute sampling.
//
// A study supplies the attribute *names* and whatever distribution it reports.
// This module decides the plausible range for each attribute from its name, so
// a randomly drawn respondent is never impossible (a 7-year-old retiree, a
// negative income, a 140% probability) no matter which paper was uploaded.

export type FieldBounds = { min: number; max: number; integer: boolean; kind: AttributeKind };
export type AttributeKind = "current_age" | "later_age" | "earlier_age" | "money" | "probability" | "percentage" | "count" | "year" | "score" | "unknown";

// Ordered: the first match wins, so the specific patterns precede the general ones.
const ATTRIBUTE_RULES: { test: RegExp; bounds: FieldBounds }[] = [
  // Ages tied to a later life event. Insurance and annuity studies ask about
  // claiming, retiring, or starting benefits, which cannot precede adulthood.
  { test: /(claim|retire|retirement|collect|start|draw|annuit|pension|payout)\w*[_ ]?age|age[_ ]?(at|of)[_ ]?(claim|retire|retirement|collection|payout)/i, bounds: { min: 50, max: 80, integer: true, kind: "later_age" } },
  { test: /(expected|planned|target|projected)\w*[_ ]?age/i, bounds: { min: 50, max: 90, integer: true, kind: "later_age" } },
  { test: /(onset|diagnos|entry|enroll|hire|marriage|first)\w*[_ ]?age/i, bounds: { min: 21, max: 80, integer: true, kind: "earlier_age" } },
  { test: /(^|[_ ])(age|current_age|respondent_age|participant_age)([_ ]|$)/i, bounds: { min: 21, max: 90, integer: true, kind: "current_age" } },
  { test: /age/i, bounds: { min: 21, max: 90, integer: true, kind: "current_age" } },
  // Probabilities are reported either as a share of one or as a percentage.
  { test: /probabilit|likelihood|chance|risk[_ ]?(of|that)/i, bounds: { min: 0, max: 1, integer: false, kind: "probability" } },
  { test: /percent|share|rate$|_rate|proportion|coinsurance|co[_ -]?insurance|copay/i, bounds: { min: 0, max: 100, integer: false, kind: "percentage" } },
  // Monetary attributes. The ceiling is generous; a paper's own reported mean
  // and SD narrow it further when they are available.
  { test: /benefit|income|wealth|salary|wage|earning|saving|asset|balance|premium|payment|cost|price|amount|dollar|lump|annuity_value|net_worth|debt|expense/i, bounds: { min: 0, max: 5_000_000, integer: false, kind: "money" } },
  { test: /year|birth_year|cohort/i, bounds: { min: 1900, max: 2100, integer: true, kind: "year" } },
  { test: /(^|[_ ])(num|number|count|size|children|dependents|household|members|years)([_ ]|$)/i, bounds: { min: 0, max: 20, integer: true, kind: "count" } },
  { test: /score|literacy|numeracy|index|scale|rating/i, bounds: { min: 0, max: 100, integer: false, kind: "score" } },
];

export function logicalBounds(key: string): FieldBounds {
  for (const rule of ATTRIBUTE_RULES) if (rule.test.test(key)) return { ...rule.bounds };
  return { min: Number.NEGATIVE_INFINITY, max: Number.POSITIVE_INFINITY, integer: false, kind: "unknown" };
}

/** A paper's reported range still has to sit inside what is physically possible. */
export function constrainToLogic(key: string, reported: { min: number; max: number; integer?: boolean }): { min: number; max: number; integer: boolean } {
  const logical = logicalBounds(key);
  const min = Math.max(reported.min, logical.min);
  const max = Math.min(reported.max, logical.max);
  // A reported range that lies wholly outside the logical one is kept as
  // reported: the attribute name was read wrongly, not the paper.
  if (min > max) return { min: reported.min, max: reported.max, integer: reported.integer ?? logical.integer };
  return { min, max, integer: reported.integer ?? logical.integer };
}

export function truncatedNormal(random: () => number, mean: number, sd: number, min: number, max: number): number {
  if (!(sd > 0)) return Math.min(max, Math.max(min, mean));
  for (let attempt = 0; attempt < 24; attempt++) {
    const z = Math.sqrt(-2 * Math.log(Math.max(random(), Number.EPSILON))) * Math.cos(2 * Math.PI * random());
    const value = mean + sd * z;
    if (value >= min && value <= max) return value;
  }
  return Math.min(max, Math.max(min, mean));
}

export function uniform(random: () => number, min: number, max: number): number {
  if (!Number.isFinite(min) || !Number.isFinite(max)) return min;
  return min + random() * (max - min);
}

/**
 * Keeps a drawn respondent internally consistent: an age tied to a later event
 * must not precede the respondent's current age, and an earlier-event age must
 * not follow it. Papers rarely state these relations, but every respondent has
 * them.
 */
export function harmonizeAges(fields: Record<string, string>): Record<string, string> {
  const current = Object.keys(fields).find((key) => logicalBounds(key).kind === "current_age");
  if (!current) return fields;
  const age = Number(fields[current]);
  if (!Number.isFinite(age)) return fields;
  for (const key of Object.keys(fields)) {
    const value = Number(fields[key]);
    if (key === current || !Number.isFinite(value)) continue;
    const { kind, max, min } = logicalBounds(key);
    if (kind === "later_age" && value < age) fields[key] = String(Math.round(Math.min(max, age)));
    if (kind === "earlier_age" && value > age) fields[key] = String(Math.round(Math.max(min, age)));
  }
  return fields;
}
