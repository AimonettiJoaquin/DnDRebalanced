import { z } from "zod";

export const abilities = ["STR", "DEX", "CON", "INT", "WIS", "CHA"] as const;
export type Ability = (typeof abilities)[number];
export const armor = [
  { id: "padded", name: "Padded", category: "light", base: 11, dexCap: 3 },
  { id: "leather", name: "Leather", category: "light", base: 11, dexCap: 4 },
  {
    id: "studded_leather",
    name: "Studded Leather",
    category: "light",
    base: 12,
    dexCap: 3,
  },
  {
    id: "chain_shirt",
    name: "Chain Shirt",
    category: "medium",
    base: 12,
    dexCap: 2,
  },
  {
    id: "scale_mail",
    name: "Scale Mail",
    category: "medium",
    base: 13,
    dexCap: 1,
  },
  {
    id: "breastplate",
    name: "Breastplate",
    category: "medium",
    base: 13,
    dexCap: 2,
  },
  {
    id: "half_plate",
    name: "Half Plate",
    category: "medium",
    base: 14,
    dexCap: 1,
  },
  {
    id: "chain_mail",
    name: "Chain Mail",
    category: "heavy",
    base: 14,
    dexCap: null,
  },
  { id: "splint", name: "Splint", category: "heavy", base: 15, dexCap: null },
  { id: "plate", name: "Plate", category: "heavy", base: 16, dexCap: null },
] as const;
export const signed = (n: number) => (n >= 0 ? `+${n}` : String(n));
export const modifier = (score: number) => Math.floor((score - 10) / 2);
export function roundScore(score: number) {
  if (!Number.isSafeInteger(score) || score <= 0)
    throw new Error("Ability scores must be positive whole numbers.");
  const result = 2 * Math.ceil(score / 2);
  if (!Number.isSafeInteger(result))
    throw new Error("Score exceeds the supported exact integer range.");
  return result;
}
export function proficiency(hd: number, extend = false): number {
  if (!Number.isSafeInteger(hd) || hd <= 0)
    throw new Error("Hit Dice count must be a positive whole number.");
  if (hd > 30 && !extend) throw new Error("DM ruling required above 30 HD.");
  return 2 + Math.floor((hd - 1) / 4);
}
const int = z.number().int().safe();
export const decisionSchema = z
  .object({
    mode: z.enum(["formula", "fixed"]),
    ability: z.enum(abilities).optional(),
    multiplier: z.union([z.literal(0), z.literal(1), z.literal(2)]),
    fixed: int,
    reason: z.string().trim().min(1).max(1000),
  })
  .strict()
  .refine(
    (d) => d.mode === "fixed" || !!d.ability,
    "Choose a governing ability.",
  );
export type Decision = z.infer<typeof decisionSchema>;
export const settingsSchema = z
  .object({
    method: z.enum([
      "review",
      "natural",
      "worn",
      "ordinary",
      "monk",
      "barbarian",
      "mage_armor",
    ]),
    armorId: z.enum(
      armor.map((a) => a.id) as [
        (typeof armor)[number]["id"],
        ...(typeof armor)[number]["id"][],
      ],
    ),
    proficient: z.boolean(),
    enhancement: int.min(0).max(3),
    shield: z.boolean(),
    shieldEnhancement: int.min(0).max(3),
    slot: int.min(1).max(9).nullable(),
    effects: z
      .array(
        z
          .object({ name: z.string().trim().min(1).max(100), value: int })
          .strict(),
      )
      .max(30),
    extendPB: z.boolean(),
    hpMode: z.enum(["average", "maximum"]),
    confirmHPExtra: z.boolean(),
    originalPB: int.min(1).max(1000).nullable(),
    confirmCRFallback: z.boolean(),
    acceptScoreModifiers: z.boolean(),
    rationale: z.string().max(2000),
    notes: z.string().max(10000),
    manualAC: int.min(1).nullable(),
    manualACReason: z.string().max(1000),
    decisions: z.record(decisionSchema),
    acknowledgements: z.array(z.string()).max(500),
  })
  .strict();
export type Settings = z.infer<typeof settingsSchema>;
export const defaults = (): Settings => ({
  method: "review",
  armorId: "leather",
  proficient: true,
  enhancement: 0,
  shield: false,
  shieldEnhancement: 0,
  slot: 1,
  effects: [],
  extendPB: false,
  hpMode: "average",
  confirmHPExtra: false,
  originalPB: null,
  confirmCRFallback: false,
  acceptScoreModifiers: false,
  rationale: "",
  notes: "",
  manualAC: null,
  manualACReason: "",
  decisions: {},
  acknowledgements: [],
});
export interface ACInput {
  hd: number;
  dex?: number;
  wis?: number;
  con?: number;
  settings: Settings;
}
export function calculateAC({ hd, dex, wis, con, settings: s }: ACInput) {
  const pb = proficiency(hd, s.extendPB);
  const required = (value: number | undefined, name: string) => {
    if (value === undefined || !Number.isInteger(value))
      throw new Error(`${name} modifier is required.`);
    return value;
  };
  let subtotal: number, explanation: string;
  const shield = s.shield ? 1 + s.shieldEnhancement : 0;
  if (s.method === "review") {
    if (
      s.manualAC !== null &&
      Number.isSafeInteger(s.manualAC) &&
      s.manualAC > 0 &&
      s.manualACReason.trim()
    )
      return {
        value: s.manualAC,
        pb,
        explanation: `Manual override: ${s.manualACReason}`,
      };
    throw new Error(
      "Choose a physical defense equivalent or confirm a special defense override.",
    );
  }
  if (s.method === "monk" && s.shield)
    throw new Error("Monk defense cannot be used with a shield.");
  if (s.method === "worn" || s.method === "natural") {
    const a = armor.find((a) => a.id === s.armorId);
    if (!a) throw new Error("Select a defined armor equivalent.");
    const contribution =
      a.dexCap === null ? 0 : Math.min(required(dex, "DEX"), a.dexCap);
    const applicablePB = s.method === "natural" || s.proficient ? pb : 0;
    subtotal = a.base + contribution + applicablePB + s.enhancement;
    explanation = `${a.name}: ${a.base}${a.dexCap === null ? " (DEX ignored)" : ` + DEX ${contribution} (cap ${a.dexCap})`} + PB ${applicablePB} + enhancement ${s.enhancement}`;
  } else if (s.method === "mage_armor") {
    if (
      s.slot === null ||
      !Number.isInteger(s.slot) ||
      s.slot < 1 ||
      s.slot > 9
    )
      throw new Error(
        "Mage Armor requires a whole spell-slot level from 1 to 9.",
      );
    const base = s.slot >= 5 ? 17 : s.slot >= 3 ? 15 : 13;
    const cap = s.slot >= 5 ? null : s.slot >= 3 ? 1 : 3;
    const contribution = cap === null ? 0 : Math.min(required(dex, "DEX"), cap);
    subtotal = base + contribution + pb;
    explanation = `Mage Armor slot ${s.slot}, tier ${base === 17 ? 3 : base === 15 ? 2 : 1}: ${base}${cap === null ? " (DEX ignored)" : ` + DEX ${contribution} (cap ${cap})`} + target PB ${pb}`;
  } else if (s.method === "ordinary") {
    const contribution = Math.min(required(dex, "DEX"), 5);
    subtotal = 10 + contribution + pb;
    explanation = `10 + DEX ${contribution} (cap 5) + PB ${pb}`;
  } else {
    const d = required(dex, "DEX");
    const extra =
      s.method === "monk" ? required(wis, "WIS") : required(con, "CON");
    subtotal = Math.min(10 + d + extra, 15) + pb;
    explanation = `min(10 + DEX ${d} + ${s.method === "monk" ? "WIS" : "CON"} ${extra}, 15) + PB ${pb}`;
  }
  const effects = s.effects.reduce((total, e) => total + e.value, 0);
  return {
    value: subtotal + shield + effects,
    pb,
    explanation: `${explanation} + shield ${shield}${s.effects.map((e) => ` + ${e.name} ${signed(e.value)}`).join("")} = ${subtotal + shield + effects}`,
  };
}
export const projectSchema = z
  .object({
    version: z.literal(1),
    source: z.string().max(250000),
    settings: settingsSchema,
  })
  .strict();
export function importProject(text: string) {
  return projectSchema.parse(JSON.parse(text));
}
export function exportProject(source: string, settings: Settings) {
  return JSON.stringify(
    projectSchema.parse({ version: 1, source, settings }),
    null,
    2,
  );
}
