import type { ExperimentProtocol, Persona } from "./experiment";

export type PersonaColumn = { key: string; label: string };

const assignmentField = /^(condition|arm|wave|assignment|order)(_|$)/i;

export function personaColumns(protocol: ExperimentProtocol, personas: Persona[]): PersonaColumn[] {
  const keys = new Set<string>();
  for (const field of protocol.personaFields) if (!assignmentField.test(field.key)) keys.add(field.key);
  for (const persona of personas) for (const key of Object.keys(persona.fields)) keys.add(key);
  return [
    { key: "persona_id", label: "Persona ID" },
    { key: "assigned_arm", label: "Assigned arm" },
    { key: "condition_sequence", label: "Condition sequence" },
    ...Array.from(keys, (key) => ({ key: `field:${key}`, label: key })),
  ];
}

export function personaCell(protocol: ExperimentProtocol, persona: Persona, column: PersonaColumn): string {
  if (column.key === "persona_id") return persona.id;
  const arm = protocol.arms.find((item) => item.id === persona.armId);
  if (column.key === "assigned_arm") return arm?.label || persona.armId;
  if (column.key === "condition_sequence") return arm?.conditionOrder.map((id) => {
    const condition = protocol.conditions.find((item) => item.id === id);
    return condition ? `${condition.label} (wave ${condition.wave})` : id;
  }).join(" → ") || "";
  return persona.fields[column.key.slice(6)] ?? "";
}

function csvCell(value: string): string {
  // Model-extracted labels and values are untrusted spreadsheet input.
  const safe = /^[\s]*[=+@\-]/.test(value) || /^[\t\r]/.test(value) ? `'${value}` : value;
  return `"${safe.replaceAll('"', '""')}"`;
}

export function personasToCsv(protocol: ExperimentProtocol, personas: Persona[]): string {
  const columns = personaColumns(protocol, personas);
  const rows = [columns.map((column) => csvCell(column.label)).join(",")];
  for (const persona of personas) rows.push(columns.map((column) => csvCell(personaCell(protocol, persona, column))).join(","));
  return `\uFEFF${rows.join("\r\n")}\r\n`;
}
