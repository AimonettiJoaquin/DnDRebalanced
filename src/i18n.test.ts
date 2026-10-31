import { describe, expect, it } from "vitest";
import { translate, formulaText, armorName } from "./i18n";
import { armor } from "./rules";
import { armorOptionLabel } from "./ArmorChoices";

describe("Interface localization", () => {
  it("retains English exactly, including whitespace and formula numbers", () => {
    const text = "  Armor Class: 16 + PB 4  ";
    expect(translate(text, "en")).toBe(text);
    expect(formulaText(text, "en")).toBe(text);
  });
  it("translates static text, dynamic messages and nested conversion errors", () => {
    expect(translate("Conversion rules", "es")).toBe("Reglas de conversión");
    expect(translate("3 TO REVIEW", "es")).toBe("3 POR REVISAR");
    expect(
      translate("Conversion stopped: Unsupported dice expression.", "es"),
    ).toBe("Conversión detenida: Expresión de dados no compatible.");
    expect(
      translate(
        "Original flat 48 − 9 × CON 5 = +3. Confirm preserving this difference as a fixed extra bonus.",
        "es",
      ),
    ).toContain("48 − 9 × CON 5 = +3");
  });
  it("preserves arbitrary user values, dollar signs and template-like characters", () => {
    expect(translate("Opened $&{0}_Bulette.md", "es")).toBe(
      "Se abrió $&{0}_Bulette.md",
    );
    expect(
      translate("Manually confirmed: Keep {0}, $& and average exactly", "es"),
    ).toBe("Confirmado manualmente: Keep {0}, $& and average exactly");
    expect(translate("My creature's own text", "es")).toBe(
      "My creature's own text",
    );
  });
  it("localizes formula explanations without changing arithmetic", () => {
    expect(
      formulaText(
        "Plate: 16 (DEX ignored) + PB 4 + enhancement 1 + shield 3 = 24",
        "es",
      ),
    ).toBe("Placas: 16 (se ignora DEX) + PB 4 + mejora 1 + escudo 3 = 24");
  });
});
describe("Armor choices explain the custom values before selection", () => {
  it("keeps each armor's base and DEX cap visible in both languages", () => {
    for (const item of armor) {
      for (const locale of ["en", "es"] as const) {
        const label = armorOptionLabel(item, locale, true);
        expect(label).toContain(String(item.base));
        expect(label).toContain("+ PB");
        if (item.dexCap === null) {
          expect(label).not.toContain("+ DEX");
        } else expect(label).toContain(`≤ +${item.dexCap}`);
      }
    }
  });
  it("shows no proficiency contribution for nonproficient worn armor", () => {
    const plate = armor.find((a) => a.id === "plate")!;
    expect(armorOptionLabel(plate, "en", false)).toBe(
      "Plate · AC 16 · DEX ignored",
    );
    expect(armorOptionLabel(plate, "es", false)).toBe(
      "Placas · CA 16 · Se ignora DEX",
    );
    expect(armorName(plate, "es")).toBe("Placas");
  });
});
