import { describe, expect, it } from "vitest";
import {
  calculateAC,
  defaults,
  exportProject,
  importProject,
  modifier,
  proficiency,
  roundScore,
  type Settings,
} from "./rules";

const ac = (
  hd: number,
  dex: number | undefined,
  patch: Partial<Settings>,
  extra: { wis?: number; con?: number } = {},
) =>
  calculateAC({
    hd,
    dex,
    ...extra,
    settings: { ...defaults(), method: "natural", ...patch },
  });
describe("Ability rounding and proficiency", () => {
  it.each([
    [19, 20],
    [11, 12],
    [21, 22],
    [2, 2],
    [10, 10],
    [5, 6],
    [31, 32],
    [1001, 1002],
  ])("rounds %s upward to %s without a score cap", (before, after) => {
    expect(roundScore(before)).toBe(after);
    expect(roundScore(roundScore(before))).toBe(after);
  });
  it("improves negative modifiers correctly", () =>
    expect(modifier(roundScore(5))).toBe(-2));
  it.each([0, -1, 1.5, NaN, Infinity])("rejects invalid score %s", (value) =>
    expect(() => roundScore(value)).toThrow(),
  );
  it.each([
    [1, 2],
    [4, 2],
    [5, 3],
    [8, 3],
    [9, 4],
    [12, 4],
    [13, 5],
    [16, 5],
    [17, 6],
    [20, 6],
    [21, 7],
    [24, 7],
    [25, 8],
    [28, 8],
    [29, 9],
    [30, 9],
  ])("HD %s gives PB %s", (hd, pb) => expect(proficiency(hd)).toBe(pb));
  it.each([0, -1, 1.5, NaN])("rejects invalid HD %s", (hd) =>
    expect(() => proficiency(hd)).toThrow(),
  );
  it("requires a ruling past 30, and permits explicit extrapolation", () => {
    expect(() => proficiency(31)).toThrow("DM ruling");
    expect(proficiency(32, true)).toBe(9);
    expect(proficiency(33, true)).toBe(10);
  });
});
describe("Custom AC regression presets", () => {
  it.each([
    [4, 2, "leather", 0, 15],
    [9, 4, "studded_leather", 1, 20],
    [8, 3, "scale_mail", 0, 17],
    [12, -1, "plate", 0, 20],
    [8, 0, "breastplate", 0, 16],
  ] as const)(
    "natural: HD %s, DEX %s, %s +%s gives %s",
    (hd, dex, armorId, enhancement, expected) =>
      expect(ac(hd, dex, { armorId, enhancement }).value).toBe(expected),
  );
  it("proficient Chain Mail and normal shield", () =>
    expect(
      ac(6, 3, { method: "worn", armorId: "chain_mail", shield: true }).value,
    ).toBe(18));
  it("ordinary DEX cap", () =>
    expect(ac(5, 7, { method: "ordinary" }).value).toBe(18));
  it("Monk subtotal cap", () =>
    expect(ac(5, 3, { method: "monk" }, { wis: 3 }).value).toBe(18));
  it("Barbarian subtotal cap", () =>
    expect(ac(9, 2, { method: "barbarian" }, { con: 4 }).value).toBe(19));
  it("class formula does not apply ordinary DEX cap", () =>
    expect(ac(1, 8, { method: "monk" }, { wis: -4 }).value).toBe(16));
  it("negative unarmored DEX", () =>
    expect(ac(1, -2, { method: "ordinary" }).value).toBe(10));
  it("negative light DEX", () =>
    expect(ac(1, -2, { method: "worn", armorId: "leather" }).value).toBe(11));
  it("negative medium DEX", () =>
    expect(ac(5, -2, { armorId: "scale_mail" }).value).toBe(14));
  it("Plate +1 and Shield +2", () =>
    expect(
      ac(9, 4, {
        method: "worn",
        armorId: "plate",
        enhancement: 1,
        shield: true,
        shieldEnhancement: 2,
      }).value,
    ).toBe(24));
  it("nonproficient worn armor keeps PB separate", () => {
    const r = ac(9, 4, { method: "worn", armorId: "plate", proficient: false });
    expect(r.value).toBe(16);
    expect(r.pb).toBe(4);
  });
  it("old AC has no influence on math; identical old AC can produce distinct values", () => {
    expect(ac(8, 5, { method: "ordinary" }).value - 15).toBe(3);
    expect(ac(8, 0, { armorId: "breastplate" }).value - 15).toBe(1);
  });
  it("score 18 and modifier +4 agree", () =>
    expect(ac(9, modifier(18), { armorId: "leather" })).toEqual(
      ac(9, 4, { armorId: "leather" }),
    ));
  it("Monk cannot use shield", () =>
    expect(() =>
      ac(5, 3, { method: "monk", shield: true }, { wis: 3 }),
    ).toThrow("shield"));
  it("Barbarian may use shield", () =>
    expect(
      ac(9, 2, { method: "barbarian", shield: true }, { con: 4 }).value,
    ).toBe(20));
  it.each(["ordinary", "monk", "barbarian", "mage_armor"] as const)(
    "hidden armor enhancement excluded for %s",
    (method) =>
      expect(
        ac(5, 3, { method, enhancement: 3 }, { wis: 1, con: 1 }).value,
      ).toBe(ac(5, 3, { method, enhancement: 0 }, { wis: 1, con: 1 }).value),
  );
  it("hidden shield enhancement excluded when removed", () =>
    expect(ac(5, 3, { shield: false, shieldEnhancement: 3 }).value).toBe(
      ac(5, 3, { shield: false, shieldEnhancement: 0 }).value,
    ));
  it("missing DEX differs from zero for light armor", () => {
    expect(() => ac(5, undefined, { armorId: "leather" })).toThrow("DEX");
    expect(ac(5, 0, { armorId: "leather" }).value).toBe(14);
  });
  it("heavy armor needs no DEX", () =>
    expect(ac(5, undefined, { armorId: "plate" }).value).toBe(19));
  it("named signed effects remain separate", () =>
    expect(
      ac(5, 0, {
        armorId: "plate",
        effects: [
          { name: "Cover", value: 2 },
          { name: "Penalty", value: -1 },
        ],
      }).value,
    ).toBe(20));
  it("special defense requires a reason and is a labeled override", () => {
    expect(() => ac(5, 0, { method: "review", manualAC: 22 })).toThrow();
    expect(
      ac(5, 0, { method: "review", manualAC: 22, manualACReason: "DM ruling" })
        .explanation,
    ).toContain("Manual override");
  });
});
describe("Mage Armor", () => {
  it.each([
    [1, 4, 19],
    [2, 4, 19],
    [3, 4, 19],
    [4, 4, 19],
    [5, 4, 20],
    [9, 4, 20],
    [1, -2, 14],
    [3, -2, 16],
    [5, -2, 20],
  ])("slot %s DEX %s gives %s at HD5", (slot, dex, expected) =>
    expect(ac(5, dex, { method: "mage_armor", slot }).value).toBe(expected),
  );
  it("high tier needs no DEX", () =>
    expect(ac(5, undefined, { method: "mage_armor", slot: 5 }).value).toBe(20));
  it("low tier needs DEX", () =>
    expect(() => ac(5, undefined, { method: "mage_armor", slot: 1 })).toThrow(
      "DEX",
    ));
  it.each([0, 10, 1.5, null])("rejects slot %s", (slot) =>
    expect(() => ac(5, 0, { method: "mage_armor", slot })).toThrow(
      "spell-slot",
    ),
  );
  it("shield and target PB; no extra armor enhancement", () => {
    const r = ac(5, 4, {
      method: "mage_armor",
      slot: 1,
      shield: true,
      enhancement: 3,
    });
    expect(r.value).toBe(20);
    expect(r.explanation).toContain("target PB 3");
  });
  it("HD31 blocks AC by default", () =>
    expect(() => ac(31, 0, { method: "mage_armor", slot: 5 })).toThrow(
      "DM ruling",
    ));
});
describe("Versioned project validation", () => {
  it("round trips source, settings, decisions, mode and notes exactly", () => {
    const settings = {
      ...defaults(),
      hpMode: "maximum" as const,
      method: "mage_armor" as const,
      slot: 3,
      notes: "Why <this> -- matters",
      decisions: {
        "attack:12": {
          mode: "formula" as const,
          ability: "STR" as const,
          multiplier: 1 as const,
          fixed: 2,
          reason: "Weapon enhancement",
        },
      },
    };
    const source = "# Original\nUnknown text";
    expect(importProject(exportProject(source, settings))).toEqual({
      version: 1,
      source,
      settings,
    });
  });
  it.each([
    "{}",
    "not json",
    JSON.stringify({ version: 2, source: "x", settings: defaults() }),
    JSON.stringify({
      version: 1,
      source: "x",
      settings: { ...defaults(), slot: 10 },
    }),
    JSON.stringify({
      version: 1,
      source: "x",
      settings: { ...defaults(), shield: "yes" },
    }),
  ])("rejects malformed or incompatible project", (text) =>
    expect(() => importProject(text)).toThrow(),
  );
  it("rejects formula decisions without an ability or reason", () =>
    expect(() =>
      exportProject("x", {
        ...defaults(),
        decisions: {
          x: { mode: "formula", multiplier: 1, fixed: 0, reason: "" },
        },
      }),
    ).toThrow());
});
