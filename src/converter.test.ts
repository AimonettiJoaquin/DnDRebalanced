import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  convert,
  parseDice,
  parseFormula,
  parseMarkdown,
  reviewReport,
} from "./converter";
import { defaults, exportProject, importProject, type Settings } from "./rules";
const fixture = readFileSync(new URL("./bulette.md", import.meta.url), "utf8");
const settings = (patch: Partial<Settings> = {}): Settings => ({
  ...defaults(),
  method: "natural",
  armorId: "plate",
  ...patch,
});
const run = (source = fixture, patch: Partial<Settings> = {}) =>
  convert(source, settings(patch));
describe("Bulette complete Markdown conversion", () => {
  it("parses immutable source, ability table, HP, PB and dependent fields", () => {
    const p = parseMarkdown(fixture);
    expect(p.source).toBe(fixture);
    expect(p.scores).toHaveLength(6);
    expect(p.hp).toMatchObject({ count: 9, size: 10, flat: 45, total: 94 });
    expect(p.pbEntries.map((e) => e.value)).toEqual([3, 3]);
    expect(p.issues).toEqual([]);
  });
  it("converts the entire fixture with visible formulas and no unresolved fields", () => {
    const r = run();
    expect(r.issues).toEqual([]);
    expect(r.pb).toBe(4);
    expect(r.oldPB).toBe(3);
    expect(r.ac).toBe(20);
    expect(r.hp).toBe(103);
    expect(r.scores.map((s) => s.after)).toEqual([20, 12, 22, 2, 10, 6]);
    const md = r.markdown;
    expect(md).toContain("|20 (+5)|12 (+1)|22 (+6)|2 (-4)|10 (+0)|6 (-2)|");
    expect(md).toContain("**Hit Points** 103 (9d10 + 54)");
    expect(md).toContain("**Armor Class** 20");
    expect(md).toContain("**Initiative** +1 (11)");
    expect(md).toContain("Perception +8");
    expect(md).toContain("Passive Perception 18");
    expect(md).toContain("PB +4)");
    expect(md).toContain("**Proficiency Bonus** +4");
    expect(md).toContain("Attack Roll:*  +9");
    expect(md).toContain("18 (2d12 + 5) Piercing");
    expect(md).toContain("DC 17");
    expect(md).toContain("19 (3d12) Bludgeoning");
    expect(
      r.changes.find((c) => c.label === "Perception")?.confidence,
    ).toContain("double-proficiency");
    expect(
      r.changes.find((c) => c.label === "Deadly Leap DC")?.formula,
    ).toContain("STR 5");
  });
  it("keeps distances, CR, XP, counts, sections, formatting and unknown content", () => {
    const r = run(
      fixture + "\n>### Mystery\n>Keep this: 5, 10, 15, 30 ft. `<custom>`\n",
    );
    for (const text of [
      "40 ft., Burrow 40 ft.",
      "Darkvision 60 ft., Tremorsense 120 ft.",
      "5 (XP 1.800;",
      "makes two Bite attacks",
      "reach 5 ft.",
      "spends 5 feet",
      "within 15 feet",
      "Prone condition",
      "pushed 5 feet",
      "jumps up to 30 feet by spending 10 feet",
      ">### Bonus Actions",
      ">### Mystery",
      "Keep this: 5, 10, 15, 30 ft. `<custom>`",
    ])
      expect(r.markdown).toContain(text);
    expect(r.parsed.source).toBe(
      fixture + "\n>### Mystery\n>Keep this: 5, 10, 15, 30 ft. `<custom>`\n",
    );
  });
  it("average → maximum → average is idempotent; damage stays averaged", () => {
    const avg = run();
    const max = run(fixture, { hpMode: "maximum" });
    const again = run();
    expect(max.hp).toBe(144);
    expect(max.markdown).toContain("144 (9d10 + 54; maximum HP)");
    expect(again.markdown).toBe(avg.markdown);
    expect(max.pb).toBe(avg.pb);
    expect(max.ac).toBe(avg.ac);
    expect(max.markdown).toContain("18 (2d12 + 5)");
    expect(max.markdown).toContain("19 (3d12)");
  });
  it("refuses to reconvert marked Markdown", () => {
    const first = run();
    const second = run(first.markdown);
    expect(second.marked).toBe(true);
    expect(second.markdown).toBe(first.markdown);
    expect(second.changes).toEqual([]);
  });
  it("JSON round trip preserves result and immutable source", () => {
    const s = settings({
      hpMode: "maximum",
      notes: "DM note",
      rationale: "Carapace",
    });
    const round = importProject(exportProject(fixture, s));
    expect(round.source).toBe(fixture);
    expect(convert(round.source, round.settings)).toEqual(convert(fixture, s));
  });
  it("Mage Armor receives the rounded target DEX and exports its slot", () => {
    const r = run(fixture, { method: "mage_armor", slot: 3, enhancement: 3 });
    expect(r.ac).toBe(20);
    expect(decodeURIComponent(r.markdown)).toContain('"mageArmorSlot":3');
  });
  it("metadata cannot be escaped by malicious notes", () => {
    const r = run(fixture, { notes: "--><script>alert(1)</script><!--" });
    expect(r.markdown.split("\n")[0]).not.toContain("<script>");
  });
});
describe("Validation and explicit decisions", () => {
  it("old AC is optional; chosen defense inserts AC without using a comparison", () => {
    const r = run(fixture.replace(">- **Armor Class** 17\n", ""));
    expect(r.ac).toBe(20);
    expect(r.issues).toEqual([]);
    expect(r.markdown).toContain(
      ">- **Armor Class** 20 (natural armor)\n>- **Hit Points** 103",
    );
  });
  it("rejects fractional original PB, including a manual entry", () => {
    expect(run(fixture, { originalPB: 3.5 }).oldPB).toBeUndefined();
    expect(
      run(
        fixture
          .replace(/PB \+3/g, "PB +3.5")
          .replace("Bonus** +3", "Bonus** +3.5"),
      ).oldPB,
    ).toBeUndefined();
  });
  it("recalculates explicit trait formulas with confirmed source arithmetic", () => {
    const src = fixture.replace(
      ">### Actions",
      ">***Might.*** The creature has a bonus +8 (STR + PB + 1).\n>### Actions",
    );
    const r = run(src);
    expect(r.markdown).toContain("bonus +10 (STR + PB + 1)");
    expect(r.changes.find((c) => c.label === "Might bonus")?.confidence).toBe(
      "Explicit source formula",
    );
  });
  it("explicit attack formulas resolve ambiguities while preserving fixed attack enhancements", () => {
    const src = fixture
      .replace("11 (+0)", "19 (+4)")
      .replace("+7, reach", "+8 (STR + PB + 1), reach");
    const r = run(src);
    expect(r.markdown).toContain("+10 (STR + PB + 1), reach");
  });
  it("conflicting explicit formulas require review", () => {
    const src = fixture.replace("DC 15", "DC 15 (8 + PB + WIS)");
    const r = run(src);
    expect(r.markdown).toContain("DC 15 (8 + PB + WIS)");
    expect(
      r.issues.some((i) =>
        i.message.includes("explicit source formula gives 11"),
      ),
    ).toBe(true);
  });
  it("supports a bounded explicit formula grammar", () => {
    expect(parseFormula("8 + proficiency bonus + Strength modifier")).toEqual({
      ability: "STR",
      multiplier: 1,
      constant: 8,
    });
    expect(parseFormula("WIS + 2 × PB - 1")).toEqual({
      ability: "WIS",
      multiplier: 2,
      constant: -1,
    });
    expect(parseFormula("STR + DEX + PB")).toBeUndefined();
    expect(parseFormula("eval(STR)")).toBeUndefined();
  });
  it("flags and resolves inconsistent source modifiers before inference", () => {
    const src = fixture.replace("19 (+4)", "19 (+3)");
    const r = run(src);
    expect(r.issues.some((i) => i.id === "modifier:STR")).toBe(true);
    expect(r.markdown).toContain("Attack Roll:*  +7");
    expect(run(src, { acceptScoreModifiers: true }).markdown).toContain(
      "Attack Roll:*  +9",
    );
  });
  it("resolves conflicting original PB explicitly without new-PB back-solving", () => {
    const src = fixture.replace(
      "**Proficiency Bonus** +3",
      "**Proficiency Bonus** +2",
    );
    expect(run(src).oldPB).toBeUndefined();
    expect(run(src).issues.some((i) => i.id === "pb:original")).toBe(true);
    expect(run(src, { originalPB: 3 }).issues).toEqual([]);
  });
  it("requires original PB, permits only an explicitly confirmed CR fallback", () => {
    const src = fixture
      .replace("; PB +3", "")
      .replace(">- **Proficiency Bonus** +3\n", "");
    expect(run(src).oldPB).toBeUndefined();
    expect(run(src, { confirmCRFallback: true }).oldPB).toBe(3);
    expect(run(src, { originalPB: 3 }).markdown).toContain("Attack Roll:*  +9");
  });
  it("preserves a confirmed non-CON HP extra", () => {
    const src = fixture.replace("9d10 + 45", "9d10 + 48");
    const r = run(src);
    expect(r.hp).toBeUndefined();
    expect(r.hpExtra).toBe(3);
    expect(r.markdown).toContain("94 (9d10 + 48)");
    const fixed = run(src, { confirmHPExtra: true });
    expect(fixed.hp).toBe(106);
    expect(fixed.markdown).toContain("106 (9d10 + 57)");
  });
  it("flags impossible nonpositive HP rather than clamping", () => {
    const src = fixture.replace("9d10 + 45", "9d10 - 200");
    expect(
      run(src, { confirmHPExtra: true }).issues.some(
        (i) => i.id === "hp:nonpositive",
      ),
    ).toBe(true);
  });
  it.each([
    "85 (10)",
    "94 (4d8 + 5d10 + 45)",
    "94 (0d10 + 45)",
    "94 (9d0 + 45)",
    "94 (9.5d10 + 45)",
    "94 (blah)",
  ])("rejects HP %s without inventing HD", (hp) => {
    const r = run(fixture.replace("94 (9d10 + 45)", hp));
    expect(r.pb).toBeUndefined();
    expect(r.hp).toBeUndefined();
    expect(r.issues.length).toBeGreaterThan(0);
  });
  it.each(["0", "-2", "1.5"])("rejects score %s", (n) =>
    expect(
      run(fixture.replace("19 (+4)", `${n} (+4)`)).issues.some(
        (i) => i.id === "score:STR",
      ),
    ).toBe(true),
  );
  it("requires all six ability scores", () => {
    const r = run(
      fixture.replace(
        "|19 (+4)|11 (+0)|21 (+5)|2 (-4)|10 (+0)|5 (-3)|",
        "|+4|+0|+5|-4|+0|-3|",
      ),
    );
    expect(r.ac).toBeUndefined();
    expect(r.hp).toBeUndefined();
    expect(r.issues.some((i) => i.id === "scores:missing")).toBe(true);
  });
  it("accepts Unicode minus and extra whitespace", () => {
    const src = fixture
      .replace("2 (-4)", " 2 (−4) ")
      .replace("5 (-3)", "5 (−3)")
      .replace("9d10 + 45", "9d10   +   45");
    const r = run(src);
    expect(r.hp).toBe(103);
    expect(r.scores.find((s) => s.ability === "CHA")?.mod).toBe(-2);
  });
  it("supports CRLF source and reordered ability columns", () => {
    const src = fixture
      .replace("|STR|DEX|CON|INT|WIS|CHA|", "|DEX|STR|CON|INT|WIS|CHA|")
      .replace("|19 (+4)|11 (+0)|", "|11 (+0)|19 (+4)|")
      .replace(/\n/g, "\r\n");
    const r = run(src);
    expect(r.hp).toBe(103);
    expect(r.markdown).toContain("|12 (+1)|20 (+5)|");
    expect(r.markdown).toContain("\r\n");
  });
  it("HP31 needs a ruling; ability rounding and damage-independent text survive", () => {
    const src = fixture.replace("9d10 + 45", "31d10 + 155");
    const r = run(src);
    expect(r.pb).toBeUndefined();
    expect(r.ac).toBeUndefined();
    expect(r.issues.some((i) => i.id === "pb:new")).toBe(true);
    expect(run(src, { extendPB: true }).pb).toBe(9);
  });
  it("ambiguous attack remains unchanged until ability confirmed", () => {
    const src = fixture
      .replace("11 (+0)", "19 (+4)")
      .replace("**Initiative** +0 (10)", "**Initiative** +4 (14)");
    const r = run(src);
    const f = r.parsed.fields.find((f) => f.kind === "attack")!;
    expect(r.issues.some((i) => i.id === f.id)).toBe(true);
    expect(r.markdown).toContain("Attack Roll:*  +7");
    const resolved = run(src, {
      decisions: {
        [f.id]: {
          mode: "formula",
          ability: "DEX",
          multiplier: 1,
          fixed: 0,
          reason: "Finesse attack",
        },
      },
    });
    expect(resolved.markdown).toContain("Attack Roll:*  +9");
    expect(resolved.markdown).toContain("18 (2d12 + 5)");
  });
  it("ambiguous DC never selects the defender DEX just from its label", () => {
    const src = fixture.replace("DC 15", "DC 11");
    const r = run(src);
    const f = r.parsed.fields.find((f) => f.kind === "dc")!;
    expect(r.issues.some((i) => i.id === f.id)).toBe(true);
    expect(r.markdown).toContain("DC 11");
    const fixed = run(src, {
      decisions: {
        [f.id]: {
          mode: "fixed",
          multiplier: 0,
          fixed: 0,
          reason: "Environmental fixed DC",
        },
      },
    });
    expect(fixed.issues.some((i) => i.id === f.id)).toBe(false);
    expect(fixed.markdown).toContain("DC 11");
  });
  it("unknown numeric traits require review and preserve their text", () => {
    const src = fixture.replace(
      ">### Actions",
      ">***Regeneration.*** The creature regains 10 hit points.\n>### Actions",
    );
    const r = run(src);
    const issue = r.issues.find((i) => i.id.startsWith("trait:"))!;
    expect(issue).toBeDefined();
    expect(r.markdown).toContain("regains 10 hit points");
    expect(
      run(src, { acknowledgements: [issue.id] }).issues.some(
        (i) => i.id === issue.id,
      ),
    ).toBe(false);
  });
  it("partial exports are labeled and report stays separate", () => {
    const r = run(fixture, { method: "review" });
    expect(r.markdown).toContain("PARTIAL CONVERSION");
    expect(r.markdown).not.toContain("Choose a physical defense equivalent");
    expect(reviewReport(r)).toContain("Defense selection");
    expect(r.hp).toBe(103);
  });
  it("unusual skill bonus can preserve a confirmed fixed contribution", () => {
    const src = fixture
      .replace("Perception +6", "Perception +7")
      .replace("Passive Perception 16", "Passive Perception 17");
    const first = run(src);
    const skill = first.parsed.fields.find((f) => f.kind === "skill")!;
    expect(first.issues.some((i) => i.id === skill.id)).toBe(true);
    const r = run(src, {
      decisions: {
        [skill.id]: {
          mode: "formula",
          ability: "WIS",
          multiplier: 2,
          fixed: 1,
          reason: "Keen senses +1",
        },
      },
    });
    expect(r.markdown).toContain("Perception +9");
    expect(r.markdown).toContain("Passive Perception 19");
  });
  it.each([
    [0, 0],
    [3, 4],
    [6, 8],
  ])(
    "skill original %s converts to %s using a unique multiplier",
    (before, after) => {
      const r = run(
        fixture
          .replace("Perception +6", `Perception +${before}`)
          .replace(
            "Passive Perception 16",
            `Passive Perception ${10 + before}`,
          ),
      );
      expect(r.markdown).toContain(`Perception +${after}`);
    },
  );
  it("saving throws retain only listed saves and initiative can include PB", () => {
    const src = fixture
      .replace(
        ">- **Skills**",
        ">- **Saving Throws** Str +7, Dex +0\n>- **Skills**",
      )
      .replace("**Initiative** +0 (10)", "**Initiative** +3 (13)");
    const r = run(src);
    expect(r.markdown).toContain("**Saving Throws** Str +9, Dex +1");
    expect(r.markdown).toContain("**Initiative** +5 (15)");
    expect(r.markdown).not.toContain("Con +");
  });
  it("damage flat riders need a decision and pure dice inconsistent averages need confirmation", () => {
    const src = fixture
      .replace("19 (3d12)", "20 (3d12)")
      .replace(
        ">### Bonus Actions",
        ">***Flame.*** 8 (2d6 + 1) Fire damage.\n>### Bonus Actions",
      );
    const r = run(src);
    expect(r.issues.some((i) => i.id.startsWith("average:"))).toBe(true);
    expect(r.issues.some((i) => i.field?.expression === "2d6 + 1")).toBe(true);
    const rider = r.parsed.fields.find((f) => f.expression === "2d6 + 1")!;
    const ack = r.issues.filter((i) => i.acknowledge).map((i) => i.id);
    const fixed = run(src, {
      acknowledgements: ack,
      decisions: {
        [rider.id]: {
          mode: "fixed",
          multiplier: 0,
          fixed: 0,
          reason: "Fixed fire rider",
        },
      },
    });
    expect(fixed.markdown).toContain("19 (3d12)");
    expect(fixed.markdown).toContain("8 (2d6 + 1)");
  });
  it("damage multiple dice pools retain exact averages and types", () => {
    expect(parseDice("2d6 + 1d4 + 3")).toMatchObject({ average: 9.5, flat: 3 });
  });
  it("does not treat a matching flat rider as another ability contribution", () => {
    const src = fixture.replace(
      "17 (2d12 + 4) Piercing damage.",
      "17 (2d12 + 4) Piercing damage plus 7 (1d6 + 4) Fire damage.",
    );
    const r = run(src);
    expect(r.markdown).toContain(
      "18 (2d12 + 5) Piercing damage plus 7 (1d6 + 4) Fire damage.",
    );
    const rider = r.parsed.fields.find((f) => f.expression === "1d6 + 4")!;
    expect(r.issues.some((i) => i.id === rider.id)).toBe(true);
    const fixed = run(src, {
      decisions: {
        [rider.id]: {
          mode: "fixed",
          multiplier: 0,
          fixed: 0,
          reason: "Fixed fire rider",
        },
      },
    });
    expect(fixed.issues).toEqual([]);
    expect(fixed.markdown).toContain("7 (1d6 + 4) Fire damage.");
  });
  it("passive Perception without a skill does not invent proficiency", () => {
    const src = fixture.replace(">- **Skills** Perception +6\n", "");
    const r = run(src);
    const f = r.parsed.fields.find((f) => f.kind === "passive")!;
    expect(r.markdown).toContain("Passive Perception 16");
    expect(r.issues.some((i) => i.id === f.id)).toBe(true);
    expect(
      run(src, {
        decisions: {
          [f.id]: {
            mode: "formula",
            ability: "WIS",
            multiplier: 2,
            fixed: 0,
            reason: "Confirmed double Perception contribution",
          },
        },
      }).markdown,
    ).toContain("Passive Perception 18");
    expect(
      run(src.replace("Passive Perception 16", "Passive Perception 10")).issues,
    ).toEqual([]);
  });
  it("unknown skill mappings and plain-text numeric dependencies require review", () => {
    const src = fixture
      .replace("Perception +6", "Cooking +7")
      .replace(
        ">### Actions",
        ">Regeneration: regains 10 hit points.\n>### Actions",
      );
    const r = run(src);
    expect(r.issues.some((i) => i.field?.label === "Cooking")).toBe(true);
    expect(r.issues.some((i) => i.label === "Unsupported trait")).toBe(true);
  });
});
describe("AC provenance follows the selected defense", () => {
  it.each([
    [{ method: "natural" }, "natural armor"],
    [{ method: "worn", shield: true }, "Plate + shield"],
    [
      { method: "worn", armorId: "half_plate", enhancement: 1 },
      "Half Plate +1",
    ],
    [
      { method: "worn", enhancement: 2, shield: true, shieldEnhancement: 3 },
      "Plate +2 + shield +3",
    ],
    [{ method: "ordinary", enhancement: 3, shieldEnhancement: 3 }, "unarmored"],
    [{ method: "monk" }, "monk unarmored defense"],
    [
      { method: "barbarian", shield: true },
      "barbarian unarmored defense + shield",
    ],
    [{ method: "mage_armor", slot: 3, enhancement: 3 }, "Mage Armor, level 3"],
    [
      {
        method: "review",
        manualAC: 19,
        manualACReason: "Custom force field",
        shield: true,
      },
      "special defense — DM override",
    ],
  ] as [Partial<Settings>, string][])(
    "exports the selected source %j",
    (selection, label) => {
      const result = run(fixture, selection);
      expect(result.markdown).toContain(
        `**Armor Class** ${result.ac} (${label})`,
      );
      expect(result.parsed.source).toBe(fixture);
    },
  );
  it("replaces a previous AC description while preserving inline fields and CRLF", () => {
    const source = fixture
      .replace(
        "**Armor Class** 17",
        "**AC** 17 (natural armor (stone carapace)) | **Initiative** +0 (10)",
      )
      .replace(/\n/g, "\r\n");
    const result = run(source, { method: "worn", shield: true });
    expect(result.markdown).toContain(
      `**AC** ${result.ac} (Plate + shield) | **Initiative** +1 (11)\r\n`,
    );
    expect(result.markdown).not.toContain("stone carapace");
    expect(result.parsed.source).toBe(source);
  });
  it("escapes user effect names as plain Markdown text without creating markup or lines", () => {
    const result = run(fixture, {
      effects: [
        { name: "[Blessing](https://example.com)\n**Ward**", value: 2 },
      ],
    });
    expect(result.markdown).toContain(
      "natural armor + \\[Blessing\\]\\(https://example.com\\) \\*\\*Ward\\*\\* +2",
    );
    expect(result.markdown).toContain("**Armor Class** 22");
  });
  it("leaves unresolved AC sources intact and regenerates from the immutable source", () => {
    const source = fixture.replace(
      "**Armor Class** 17",
      "**Armor Class** 17 (original armor)",
    );
    expect(run(source, { method: "review" }).markdown).toContain(
      "**Armor Class** 17 (original armor)",
    );
    const first = run(source, { method: "worn", enhancement: 1 });
    expect(run(source, { method: "worn", enhancement: 1 }).markdown).toBe(
      first.markdown,
    );
    expect(first.markdown).not.toContain("original armor");
  });
});
