import uiSpanish from "./messages.es.json";
import engineSpanish from "./messages-engine.es.json";
import type { Result } from "./converter";

export type Locale = "en" | "es";
const normalize = (text: string) => text.replace(/\s+/g, " ").trim();
const messages = new Map(
  Object.entries({ ...uiSpanish, ...engineSpanish }).map(([key, value]) => [
    normalize(key),
    value,
  ]),
);
const escape = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const templates = [...messages]
  .filter(([key]) => /\{\d+\}/.test(key))
  .sort((a, b) => b[0].length - a[0].length)
  .map(([key, translation]) => {
    const indices: string[] = [];
    const pattern = key
      .split(/(\{\d+\})/)
      .map((part) => {
        if (/^\{\d+\}$/.test(part)) {
          indices.push(part);
          return "(.*?)";
        }
        return escape(part);
      })
      .join("");
    return {
      key,
      translation,
      indices,
      pattern: new RegExp(`^${pattern}$`, "u"),
    };
  });

/** Translate presentation strings only. Imported Markdown and stored formulas remain immutable. */
export function translate(text: string, locale: Locale): string {
  if (locale === "en" || !text.trim()) return text;
  const key = normalize(text),
    leading = text.match(/^\s*/)?.[0] ?? "",
    trailing = text.match(/\s*$/)?.[0] ?? "";
  const exact = messages.get(key);
  if (exact !== undefined) return leading + exact + trailing;
  for (const template of templates) {
    const match = key.match(template.pattern);
    if (!match) continue;
    const values = new Map<string, string>();
    template.indices.forEach((slot, i) => {
      const value = [
        "Conversion stopped: {0}",
        "Could not export the stat block: {0}",
      ].includes(template.key)
        ? translate(match[i + 1], locale)
        : match[i + 1];
      values.set(slot, value);
    });
    return (
      leading +
      template.translation.replace(
        /\{\d+\}/g,
        (slot) => values.get(slot) ?? slot,
      ) +
      trailing
    );
  }
  return text;
}

const armorSpanish: Record<string, string> = {
  padded: "Acolchada",
  leather: "Cuero",
  studded_leather: "Cuero tachonado",
  chain_shirt: "Camisa de malla",
  scale_mail: "Cota de escamas",
  breastplate: "Coraza",
  half_plate: "Semiplacas",
  chain_mail: "Cota de malla",
  splint: "Bandas",
  plate: "Placas",
};
export function armorName(armor: { id: string; name: string }, locale: Locale) {
  return locale === "es" ? (armorSpanish[armor.id] ?? armor.name) : armor.name;
}

export function formulaText(text: string, locale: Locale): string {
  if (locale === "en") return text;
  const translated = translate(text, locale);
  if (translated !== text) return translated;
  const replacements: Record<string, string> = {
    "exact dice average": "promedio exacto de dados",
    "initiative score": "puntuación de iniciativa",
    "target PB": "PB del objetivo",
    "DEX ignored": "se ignora DEX",
    "Mage Armor slot": "Armadura de mago de nivel",
    "Studded Leather": "Cuero tachonado",
    "Chain Shirt": "Camisa de malla",
    "Scale Mail": "Cota de escamas",
    "Half Plate": "Semiplacas",
    "Chain Mail": "Cota de malla",
    Breastplate: "Coraza",
    Leather: "Cuero",
    Padded: "Acolchada",
    Splint: "Bandas",
    Plate: "Placas",
    Perception: "Percepción",
    modifier: "modificador",
    enhancement: "mejora",
    adjustment: "ajuste",
    shield: "escudo",
    fixed: "fijo",
    extra: "adicional",
    flat: "bono fijo",
    tier: "tramo",
    cap: "máx.",
  };
  const pattern = new RegExp(
    `\\b(${Object.keys(replacements).map(escape).join("|")})\\b`,
    "g",
  );
  return text.replace(pattern, (value) => replacements[value]);
}

export function spanishReviewReport(result: Result): string {
  const t = (text: string) => translate(text, "es");
  return `# ${t("Conversion review")}: ${result.parsed.name}\n\n${result.issues.length ? result.issues.map((issue) => `- ${t(issue.label)}: ${t(issue.message)}`).join("\n") : t("No unresolved supported fields.")}\n\n## ${t("Formula decisions")}\n\n${result.changes.map((change) => `- ${t(change.label)}: ${change.before} → ${change.after}. ${formulaText(change.formula, "es")} (${t(change.confidence)})`).join("\n")}\n`;
}
