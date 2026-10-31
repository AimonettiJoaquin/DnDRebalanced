import {
  abilities,
  type Ability,
  type Settings,
  calculateAC,
  modifier,
  proficiency,
  roundScore,
  signed,
} from "./rules";

export interface Span {
  start: number;
  end: number;
}
export interface Score {
  ability: Ability;
  score: number;
  listedModifier: number;
  scoreSpan: Span;
  modifierSpan: Span;
}
export type Kind =
  | "save"
  | "skill"
  | "attack"
  | "dc"
  | "initiative"
  | "passive"
  | "damage"
  | "bonus";
export interface Field {
  id: string;
  label: string;
  kind: Kind;
  original: number;
  span: Span;
  ability?: Ability;
  context: string;
  expression?: string;
  expressionSpan?: Span;
  diceAverage?: number;
  flat?: number;
  attackId?: string;
  scoreSpan?: Span;
  damageRole?: "primary" | "rider";
}
export interface Issue {
  id: string;
  label: string;
  message: string;
  field?: Field;
  acknowledge?: boolean;
}
export interface Parsed {
  source: string;
  name: string;
  scores: Score[];
  fields: Field[];
  issues: Issue[];
  pbEntries: { value: number; span: Span }[];
  cr?: number;
  ac?: { value: number; span: Span };
  hp?: { total: number; count: number; size: number; flat: number; span: Span };
  marked: boolean;
}
export interface Change {
  id: string;
  label: string;
  before: string;
  after: string;
  formula: string;
  confidence: string;
}
export interface Result {
  parsed: Parsed;
  markdown: string;
  changes: Change[];
  issues: Issue[];
  scores: { ability: Ability; before: number; after: number; mod: number }[];
  pb?: number;
  oldPB?: number;
  ac?: number;
  hp?: number;
  hpExtra?: number;
  marked: boolean;
}
const skillAbilities: Record<string, Ability> = {
  acrobatics: "DEX",
  "animal handling": "WIS",
  arcana: "INT",
  athletics: "STR",
  deception: "CHA",
  history: "INT",
  insight: "WIS",
  intimidation: "CHA",
  investigation: "INT",
  medicine: "WIS",
  nature: "INT",
  perception: "WIS",
  performance: "CHA",
  persuasion: "CHA",
  religion: "INT",
  "sleight of hand": "DEX",
  stealth: "DEX",
  survival: "WIS",
};
const numeric = (text: string) =>
  Number(text.replace(/\u2212/g, "-").replace(/\s/g, ""));
const spanOf = (start: number, value: string): Span => ({
  start,
  end: start + value.length,
});
const numPattern = "[+\\-−]?\\s*\\d+(?:\\.\\d+)?";

export function parseDice(expression: string) {
  const normal = expression.replace(/−/g, "-").replace(/\s/g, "");
  if (!/^[1-9]\d*d[1-9]\d*(?:[+][1-9]\d*d[1-9]\d*)*(?:[+-]\d+)?$/i.test(normal))
    throw new Error("Unsupported dice expression.");
  const pools = [...normal.matchAll(/(\d+)d(\d+)/gi)].map((m) => ({
    count: Number(m[1]),
    size: Number(m[2]),
  }));
  if (
    pools.some(
      (p) => !Number.isSafeInteger(p.count) || !Number.isSafeInteger(p.size),
    )
  )
    throw new Error("Dice exceed the supported exact integer range.");
  // A leading sign on the final constant is preserved separately from pool separators.
  const flatMatch = normal.match(/([+-]\d+)$/);
  const flat = flatMatch ? Number(flatMatch[1]) : 0;
  const average = pools.reduce(
    (sum, p) => sum + (p.count * (p.size + 1)) / 2,
    0,
  );
  if (
    !Number.isFinite(average + flat) ||
    Math.abs(average + flat) > Number.MAX_SAFE_INTEGER
  )
    throw new Error("Dice total is too large.");
  return { pools, flat, average };
}

/** A deliberately small, explicit grammar: one ability, PB (0/1/2), signed constants. */
export function parseFormula(
  text: string,
): { ability: Ability; multiplier: number; constant: number } | undefined {
  let expression = text
    .trim()
    .toUpperCase()
    .replace(/−/g, "-")
    .replace(/×/g, "*");
  const names = [
    "STRENGTH",
    "DEXTERITY",
    "CONSTITUTION",
    "INTELLIGENCE",
    "WISDOM",
    "CHARISMA",
  ];
  names.forEach((name, i) => {
    expression = expression.replace(
      new RegExp(`\\b${name}(?:\\s+MODIFIER)?\\b`, "g"),
      abilities[i],
    );
  });
  expression = expression
    .replace(/PROFICIENCY BONUS/g, "PB")
    .replace(/\b(?:ITS|THE CREATURE'S)\s+/g, "")
    .replace(/\s/g, "")
    .replace(/-/g, "+-");
  const terms = expression.split("+").filter(Boolean);
  let ability: Ability | undefined,
    multiplier = 0,
    constant = 0;
  for (const term of terms) {
    if (abilities.includes(term as Ability)) {
      if (ability) return;
      ability = term as Ability;
    } else if (/^(?:[012]\*?)?PB$/.test(term)) {
      multiplier += term === "PB" ? 1 : Number(term[0]);
    } else if (/^-?\d+$/.test(term)) constant += Number(term);
    else return;
  }
  if (
    !ability ||
    ![0, 1, 2].includes(multiplier) ||
    !Number.isSafeInteger(constant)
  )
    return;
  return { ability, multiplier, constant };
}

export function parseMarkdown(source: string): Parsed {
  const p: Parsed = {
    source,
    name: "Creature",
    scores: [],
    fields: [],
    pbEntries: [],
    issues: [],
    marked: /<!--\s*encounter-forge:converted\b/i.test(source),
  };
  const lines = [...source.matchAll(/[^\r\n]+/g)];
  const problem = (
    id: string,
    label: string,
    message: string,
    acknowledge = false,
  ) => p.issues.push({ id, label, message, acknowledge });
  const add = (
    kind: Kind,
    label: string,
    match: RegExpMatchArray,
    group: number,
    offset: number,
    extra: Partial<Field> = {},
  ) => {
    const value = match[group];
    const start = offset + match.index! + match[0].indexOf(value);
    const field: Field = {
      id: `${kind}:${start}`,
      kind,
      label,
      original: numeric(value),
      span: spanOf(start, value),
      context: "",
      ...extra,
    };
    p.fields.push(field);
    return field;
  };
  let abilityHeader: string[] | undefined;
  let actionContext = "";
  let actionName = "";
  let lastAttackId: string | undefined;
  const attacksWithDamage = new Set<string>();
  let inActions = false;
  for (const lineMatch of lines) {
    const line = lineMatch[0],
      offset = lineMatch.index!;
    const heading = line.match(/^\s*>?\s*##\s+([^#].*?)\s*$/);
    if (heading && p.name === "Creature") p.name = heading[1].trim();
    if (
      /###\s+(?:Actions|Bonus Actions|Reactions|Legendary Actions)/i.test(line)
    )
      inActions = true;
    if (/\*\*\*[^*]+\*\*\*/.test(line)) {
      actionName = line.match(/\*\*\*([^*]+)\*\*\*/)![1].replace(/\.$/, "");
      actionContext = line;
      lastAttackId = undefined;
    } else if (actionName) actionContext += "\n" + line;
    if (line.includes("|")) {
      const cells = [...line.matchAll(/\|([^|]*)/g)].filter(
        (c) => c[1].trim() !== "",
      );
      const headers = cells.map((c) =>
        c[1].replace(/\*/g, "").trim().toUpperCase(),
      );
      if (headers.length === 6 && abilities.every((a) => headers.includes(a)))
        abilityHeader = headers;
      else if (
        abilityHeader &&
        cells.length === 6 &&
        !cells.every((c) => /^[\s:\-]+$/.test(c[1]))
      ) {
        cells.forEach((cell, i) => {
          const m = cell[1].match(
            new RegExp(
              `^\\s*(${numPattern})\\s*\\(\\s*(${numPattern})\\s*\\)\\s*$`,
            ),
          );
          const ability = abilityHeader![i] as Ability;
          if (!m) {
            problem(
              `score:${ability}`,
              ability,
              `Provide ${ability} as a positive integer score and signed modifier.`,
            );
            return;
          }
          const start = offset + cell.index! + 1;
          const score = numeric(m[1]),
            listedModifier = numeric(m[2]);
          try {
            roundScore(score);
          } catch (e) {
            problem(`score:${ability}`, ability, (e as Error).message);
            return;
          }
          if (!Number.isInteger(listedModifier)) {
            problem(
              `score:${ability}`,
              ability,
              "The listed modifier must be a whole number.",
            );
            return;
          }
          p.scores.push({
            ability,
            score,
            listedModifier,
            scoreSpan: spanOf(start + m.index! + m[0].indexOf(m[1]), m[1]),
            modifierSpan: spanOf(start + m[0].lastIndexOf(m[2]), m[2]),
          });
        });
        abilityHeader = undefined;
      }
    }
    const ac = line.match(/\*\*(?:Armor Class|AC)\*\*\s*(\d+)/i);
    if (/\*\*(?:Armor Class|AC)\*\*/i.test(line) && !ac)
      problem(
        "ac:parse",
        "Armor Class",
        "The original AC entry could not be read; correct its value in the source.",
      );
    if (ac) {
      if (p.ac)
        problem(
          "duplicate:ac",
          "Armor Class",
          "Multiple AC entries require a single source entry.",
        );
      else
        p.ac = {
          value: Number(ac[1]),
          span: spanOf(offset + ac.index! + ac[0].lastIndexOf(ac[1]), ac[1]),
        };
    }
    if (/\*\*(?:Hit Points|HP)\*\*/i.test(line)) {
      const hp = line.match(/\*\*(?:Hit Points|HP)\*\*\s*(\d+)\s*\(([^)]+)\)/i);
      if (!hp)
        problem(
          "hp:parse",
          "Hit Points",
          "Provide a total and one Hit Dice pool, for example 94 (9d10 + 45).",
        );
      else
        try {
          const d = parseDice(hp[2]);
          if (d.pools.length !== 1)
            throw new Error(
              "Mixed HP dice pools require manual review; use a single confirmed pool in the source.",
            );
          if (p.hp)
            throw new Error(
              "Multiple HP entries require a single source entry.",
            );
          const start =
            offset +
            hp.index! +
            hp[0].indexOf(hp[1], hp[0].indexOf("**", 2) + 2);
          p.hp = {
            total: Number(hp[1]),
            count: d.pools[0].count,
            size: d.pools[0].size,
            flat: d.flat,
            span: { start, end: offset + hp.index! + hp[0].length },
          };
        } catch (e) {
          problem("hp:parse", "Hit Points", (e as Error).message);
        }
    }
    // A symbolic expression such as STR + PB + 1 is not a declaration of PB +1.
    if (/\*\*(?:Challenge|Proficiency Bonus|PB)\*\*/i.test(line)) {
      for (const m of line.matchAll(
        /(?:\bPB\s*|\*\*(?:Proficiency Bonus|PB)\*\*\s*)([+\-−]?\s*\d+(?:\.\d+)?)/gi,
      )) {
        p.pbEntries.push({
          value: numeric(m[1]),
          span: spanOf(offset + m.index! + m[0].lastIndexOf(m[1]), m[1]),
        });
      }
    }
    const cr = line.match(/\*\*Challenge\*\*\s*(\d+(?:\/\d+)?)/i);
    if (cr)
      p.cr = cr[1].includes("/")
        ? Number(cr[1].split("/")[0]) / Number(cr[1].split("/")[1])
        : Number(cr[1]);
    const init = line.match(
      new RegExp(
        `\\*\\*Initiative\\*\\*\\s*(${numPattern})(?:\\s*\\(\\s*(\\d+)\\s*\\))?`,
        "i",
      ),
    );
    if (init) {
      const start =
        offset +
        init.index! +
        init[0].indexOf(init[1], init[0].lastIndexOf("**") + 2);
      p.fields.push({
        id: `initiative:${start}`,
        kind: "initiative",
        label: "Initiative",
        original: numeric(init[1]),
        span: spanOf(start, init[1]),
        ability: "DEX",
        context: line,
        scoreSpan: init[2]
          ? spanOf(offset + init.index! + init[0].lastIndexOf(init[2]), init[2])
          : undefined,
      });
    }
    if (/\*\*Saving Throws\*\*/i.test(line)) {
      for (const m of line.matchAll(
        new RegExp(`\\b(STR|DEX|CON|INT|WIS|CHA)\\s*(${numPattern})`, "gi"),
      ))
        add("save", `${m[1].toUpperCase()} save`, m, 2, offset, {
          ability: m[1].toUpperCase() as Ability,
          context: line,
        });
    }
    if (/\*\*Skills\*\*/i.test(line)) {
      for (const m of line.matchAll(
        new RegExp(
          `([A-Za-z][A-Za-z \\t]*?)\\s+(${numPattern})(?=\\s*(?:,|$))`,
          "g",
        ),
      )) {
        const name = m[1].trim().replace(/\s+/g, " ");
        add("skill", name, m, 2, offset, {
          ability: skillAbilities[name.toLowerCase()],
          context: line,
        });
      }
    }
    for (const m of line.matchAll(
      new RegExp(`Passive Perception\\s+(${numPattern})`, "gi"),
    ))
      add("passive", "Passive Perception", m, 1, offset, {
        ability: "WIS",
        context: line,
      });
    for (const m of line.matchAll(
      new RegExp(
        `(?:(?:Melee|Ranged|Spell)(?: or (?:Melee|Ranged))? (?:Weapon |Spell )?Attack(?: Roll)?[:* ]*|\\bto hit[:* ]*)(${numPattern})`,
        "gi",
      ),
    )) {
      const f = add(
        "attack",
        `${actionName || "Action"} attack`,
        m,
        1,
        offset,
        { context: actionContext || line },
      );
      lastAttackId = f.id;
    }
    for (const m of line.matchAll(/\bDC\s*(\d+)(?![\d.]|\s*\+)/g))
      add("dc", `${actionName || "Effect"} DC`, m, 1, offset, {
        context: actionContext || line,
      });
    for (const m of line.matchAll(
      new RegExp(
        `\\b(?:bonus|modifier)[:* ]*(${numPattern})\\s*\\(([^)]+)\\)`,
        "gi",
      ),
    )) {
      if (
        !p.fields.some(
          (f) =>
            f.span.start >= offset + m.index! &&
            f.span.start < offset + m.index! + m[0].length,
        )
      )
        add("bonus", `${actionName || "Trait"} bonus`, m, 1, offset, {
          context: line,
          expression: m[2],
        });
    }
    // Dice with their independently displayed averages, never a document-wide number replacement.
    if (!/\*\*(?:Hit Points|HP)\*\*/i.test(line)) {
      for (const m of line.matchAll(/(\d+)\s*\(([^)\n]*\d+d\d+[^)\n]*)\)/gi)) {
        try {
          const d = parseDice(m[2]);
          const start = offset + m.index!;
          const primary =
            !!lastAttackId && !attacksWithDamage.has(lastAttackId);
          p.fields.push({
            id: `damage:${start}`,
            kind: "damage",
            label: `${actionName || "Effect"} ${lastAttackId && !primary ? "rider " : ""}damage`,
            original: Number(m[1]),
            span: spanOf(start, m[1]),
            expression: m[2],
            expressionSpan: spanOf(start + m[0].indexOf(m[2]), m[2]),
            diceAverage: d.average,
            flat: d.flat,
            context: actionContext || line,
            attackId: lastAttackId,
            damageRole: primary ? "primary" : "rider",
          });
          if (lastAttackId) attacksWithDamage.add(lastAttackId);
        } catch (e) {
          problem(
            `dice:${offset + m.index!}`,
            `${actionName || "Effect"} damage`,
            (e as Error).message,
          );
        }
      }
    }
    if (
      /\*\*\*[^*]+\*\*\*/.test(line) &&
      /\d/.test(line) &&
      !/\bDC\s*\d|\d+d\d+|Attack(?: Roll)?[:* ]*[+−-]/i.test(line) &&
      !p.fields.some(
        (f) =>
          f.kind === "bonus" &&
          f.span.start >= offset &&
          f.span.start < offset + line.length,
      ) &&
      (!inActions ||
        /(?:bonus|proficien|modifier|regenerat|armor|hit points)/i.test(line))
    ) {
      problem(
        `trait:${offset}`,
        actionName || "Numeric trait",
        "This numeric trait is preserved. Confirm its formula is independent, or edit the source with the intended explicit values.",
        true,
      );
    }
    const explicit = [
      ...line.matchAll(
        /(?:8\s*\+\s*)?(?:its |the creature.s )?proficiency bonus\s*\+\s*(?:its |the creature.s )?(Strength|Dexterity|Constitution|Intelligence|Wisdom|Charisma) modifier/gi,
      ),
    ];
    // Explicit formulas remain live textual formulas; their numeric dependencies are converted above.
    if (
      /\b(?:bonus|modifier|proficiency)\b/i.test(line) &&
      /[+−-]\s*\d/.test(line) &&
      /\*\*\*/.test(line) &&
      !p.fields.some(
        (f) => f.span.start >= offset && f.span.start < offset + line.length,
      ) &&
      !explicit.length &&
      !p.issues.some((i) => i.id === `trait:${offset}`)
    ) {
      problem(
        `trait:${offset}`,
        actionName || "Trait",
        "An unsupported numeric dependency is preserved for DM review.",
        true,
      );
    }
    if (
      /\d/.test(line) &&
      /(?:regenerat|\bbonus\b|\bmodifier\b|hit points|armor class|\bdamage\b)/i.test(
        line,
      ) &&
      !/^\s*>?\s*(?:[-*]\s*)?\*\*(?:Armor Class|AC|Hit Points|HP|Skills|Saving Throws|Initiative|Senses|Challenge|Proficiency Bonus|PB)\*\*/i.test(
        line,
      ) &&
      !p.fields.some(
        (f) => f.span.start >= offset && f.span.start < offset + line.length,
      ) &&
      !p.issues.some((i) => i.id === `trait:${offset}`)
    ) {
      problem(
        `trait:${offset}`,
        actionName || "Unsupported trait",
        "An unsupported numeric trait is preserved. Confirm that it is independent, or revise its source formula for manual review.",
        true,
      );
    }
  }
  if (
    p.scores.length !== 6 ||
    new Set(p.scores.map((s) => s.ability)).size !== 6
  )
    problem(
      "scores:missing",
      "Ability scores",
      "Full conversion needs one six-column STR / DEX / CON / INT / WIS / CHA table with original scores and modifiers.",
    );
  if (!p.hp && !p.issues.some((i) => i.id === "hp:parse"))
    problem(
      "hp:missing",
      "Hit Dice",
      "Provide original HP with its Hit Dice count and die size. HD is never inferred from HP.",
    );
  return p;
}

type Formula = {
  ability: Ability;
  multiplier: number;
  fixed: number;
  confidence: string;
};
export function convert(source: string, s: Settings): Result {
  const p = parseMarkdown(source);
  const r: Result = {
    parsed: p,
    markdown: source,
    changes: [],
    issues: [],
    scores: [],
    marked: p.marked,
  };
  if (p.marked) {
    r.issues.push({
      id: "converted",
      label: "Already converted",
      message:
        "This Markdown is marked as converted. Open its original project JSON or supply the original Markdown. It is shown read-only to prevent compounding.",
    });
    return r;
  }
  r.issues = p.issues.filter(
    (i) => !i.acknowledge || !s.acknowledgements.includes(i.id),
  );
  const patches: { span: Span; value: string }[] = [];
  const patch = (span: Span, value: string) => patches.push({ span, value });
  const issue = (id: string, label: string, message: string, field?: Field) =>
    r.issues.push({ id, label, message, field });
  const change = (
    id: string,
    label: string,
    before: string | number,
    after: string | number,
    formula: string,
    confidence: string,
  ) =>
    r.changes.push({
      id,
      label,
      before: String(before),
      after: String(after),
      formula,
      confidence,
    });
  const oldMods: Partial<Record<Ability, number>> = {},
    newMods: Partial<Record<Ability, number>> = {};
  let consistent = true;
  for (const score of p.scores) {
    const rounded = roundScore(score.score),
      mod = modifier(rounded);
    oldMods[score.ability] = modifier(score.score);
    newMods[score.ability] = mod;
    if (
      score.listedModifier !== modifier(score.score) &&
      !s.acceptScoreModifiers
    ) {
      consistent = false;
      issue(
        `modifier:${score.ability}`,
        `${score.ability} modifier conflict`,
        `Score ${score.score} implies ${signed(modifier(score.score))}, but the source lists ${signed(score.listedModifier)}. Confirm using score-derived modifiers before formula inference.`,
      );
    }
    r.scores.push({
      ability: score.ability,
      before: score.score,
      after: rounded,
      mod,
    });
    patch(score.scoreSpan, String(rounded));
    patch(score.modifierSpan, signed(mod));
    change(
      `score:${score.ability}`,
      score.ability,
      `${score.score} (${signed(score.listedModifier)})`,
      `${rounded} (${signed(mod)})`,
      `2 × ceil(${score.score} / 2); modifier = floor((${rounded} − 10) / 2)`,
      "Explicit house rule",
    );
  }
  const complete =
    p.scores.length === 6 && new Set(p.scores.map((s) => s.ability)).size === 6;
  if (!complete) consistent = false;
  const originalPBs = [...new Set(p.pbEntries.map((e) => e.value))];
  if (
    s.originalPB !== null &&
    Number.isSafeInteger(s.originalPB) &&
    s.originalPB > 0 &&
    s.originalPB <= 1000
  )
    r.oldPB = s.originalPB;
  else if (s.originalPB !== null)
    issue(
      "pb:original",
      "Original proficiency",
      "Original PB must be a positive whole number, at most 1000.",
    );
  else if (
    originalPBs.length === 1 &&
    Number.isSafeInteger(originalPBs[0]) &&
    originalPBs[0] > 0
  )
    r.oldPB = originalPBs[0];
  else if (!originalPBs.length && s.confirmCRFallback && p.cr !== undefined)
    r.oldPB = 2 + Math.floor((Math.max(1, p.cr) - 1) / 4);
  else
    issue(
      "pb:original",
      "Original proficiency",
      originalPBs.length > 1
        ? `Conflicting original PB entries (${originalPBs.map(signed).join(", ")}). Resolve the original PB explicitly.`
        : "Enter the original PB, or explicitly confirm the original CR fallback. New HD-based PB cannot infer original formulas.",
    );
  if (p.hp) {
    try {
      r.pb = proficiency(p.hp.count, s.extendPB);
    } catch (e) {
      issue("pb:new", "New proficiency", (e as Error).message);
    }
    if (r.pb !== undefined) {
      p.pbEntries.forEach((e, i) => {
        patch(e.span, signed(r.pb!));
        change(
          `pb:${i}`,
          "Proficiency Bonus",
          signed(e.value),
          signed(r.pb!),
          `2 + floor((${p.hp!.count} − 1) / 4) = ${r.pb}`,
          "Explicit house rule",
        );
      });
      if (!p.pbEntries.length)
        issue(
          "pb:representation",
          "PB in exported creature",
          "No original PB label exists. The new PB is recorded in conversion metadata; add a Proficiency Bonus line to the original if you want it in the stat block.",
          undefined,
        );
    }
    if (complete) {
      try {
        const ac = calculateAC({
          hd: p.hp.count,
          dex: newMods.DEX,
          wis: newMods.WIS,
          con: newMods.CON,
          settings: s,
        });
        r.ac = ac.value;
        if (
          !p.issues.some((i) => i.id === "duplicate:ac" || i.id === "ac:parse")
        ) {
          if (p.ac) patch(p.ac.span, String(ac.value));
          else {
            const lineStart = source.lastIndexOf("\n", p.hp.span.start) + 1;
            const prefix = source
              .slice(lineStart, p.hp.span.start)
              .replace(/\*\*(?:Hit Points|HP)\*\*\s*$/i, "");
            patch(
              { start: lineStart, end: lineStart },
              `${prefix}**Armor Class** ${ac.value}${source.includes("\r\n") ? "\r\n" : "\n"}`,
            );
          }
          change(
            "ac",
            "Armor Class",
            p.ac?.value ?? "Not supplied",
            ac.value,
            ac.explanation,
            s.method === "review"
              ? "Manual override"
              : "Explicit house rule / DM selection",
          );
        }
      } catch (e) {
        issue("ac:choice", "Defense selection", (e as Error).message);
      }
    }
    if (consistent && oldMods.CON !== undefined && newMods.CON !== undefined) {
      const hp = p.hp,
        extra = hp.flat - hp.count * oldMods.CON;
      r.hpExtra = extra;
      if (extra !== 0 && !s.confirmHPExtra)
        issue(
          "hp:extra",
          "HP fixed extra",
          `Original flat ${hp.flat} − ${hp.count} × CON ${oldMods.CON} = ${signed(extra)}. Confirm preserving this difference as a fixed extra bonus.`,
        );
      else {
        const flat = hp.count * newMods.CON + extra;
        const total =
          s.hpMode === "maximum"
            ? hp.count * hp.size + flat
            : Math.floor((hp.count * (hp.size + 1)) / 2 + flat);
        if (!Number.isSafeInteger(total))
          issue(
            "hp:range",
            "Hit Points",
            "Calculated HP exceeds the supported exact integer range and needs manual review.",
          );
        else if (total <= 0)
          issue(
            "hp:nonpositive",
            "Hit Points",
            `Calculated HP ${total} is nonpositive and requires a manual source/formula review.`,
          );
        else {
          const expr = `${hp.count}d${hp.size}${flat ? ` ${flat >= 0 ? "+" : "-"} ${Math.abs(flat)}` : ""}`;
          const value = `${total} (${expr}${s.hpMode === "maximum" ? "; maximum HP" : ""})`;
          r.hp = total;
          patch(hp.span, value);
          change(
            "hp",
            `Hit Points · ${s.hpMode}`,
            source.slice(hp.span.start, hp.span.end),
            value,
            `${s.hpMode === "maximum" ? `${hp.count} × ${hp.size}` : `floor(${hp.count} × (${hp.size} + 1) / 2`} + ${hp.count} × CON ${newMods.CON} + extra ${extra}${s.hpMode === "average" ? ")" : ""} = ${total}`,
            extra ? "Manually confirmed fixed extra" : "Explicit CON formula",
          );
        }
      }
    }
  }
  const formulas = new Map<string, Formula>();
  const infer = (
    f: Field,
    choices: Ability[],
    multipliers: number[],
  ): Formula | undefined => {
    if (!consistent || r.oldPB === undefined || r.pb === undefined) {
      issue(
        f.id,
        f.label,
        "Formula inference requires consistent original scores, original PB, and a supported new PB.",
        f,
      );
      return;
    }
    const d = s.decisions[f.id];
    if (d?.mode === "formula" && d.ability)
      return {
        ability: d.ability,
        multiplier: d.multiplier,
        fixed: d.fixed,
        confidence: `Manually confirmed: ${d.reason}`,
      };
    const base = f.kind === "dc" ? 8 : 0;
    const following = source.slice(f.span.end).match(/^\s*\(([^)\n]+)\)/)?.[1];
    const explicit = parseFormula(
      f.kind === "bonus" ? (f.expression ?? "") : (following ?? ""),
    );
    if (explicit) {
      const value =
        oldMods[explicit.ability]! +
        explicit.multiplier * r.oldPB +
        explicit.constant;
      if (value === f.original)
        return {
          ability: explicit.ability,
          multiplier: explicit.multiplier,
          fixed: explicit.constant - base,
          confidence: "Explicit source formula",
        };
      issue(
        f.id,
        f.label,
        `The explicit source formula gives ${value}, but the listed value is ${f.original}. Confirm the intended formula.`,
        f,
      );
      return;
    }
    if (f.kind === "bonus") {
      issue(
        f.id,
        f.label,
        "This explicit bonus formula is unsupported. Confirm its ability and PB contributions or preserve it as fixed.",
        f,
      );
      return;
    }
    const matches = choices.flatMap((a) =>
      multipliers
        .filter((m) => base + oldMods[a]! + m * r.oldPB! === f.original)
        .map((m) => ({
          ability: a,
          multiplier: m,
          fixed: 0,
          confidence: `Uniquely inferred${m === 2 ? " double-proficiency contribution" : ""}`,
        })),
    );
    if (matches.length === 1) return matches[0];
    issue(
      f.id,
      f.label,
      matches.length
        ? `Multiple formulas fit: ${matches.map((m) => `${m.ability} + ${m.multiplier} × PB`).join("; ")}. Choose a governing ability and contributions.`
        : "The original value has no unique standard formula. Confirm a governing ability, PB contribution and any fixed bonus, or preserve it as fixed.",
      f,
    );
  };
  const numericResults = new Map<string, number>();
  const formulaValue = (f: Field, formula: Formula) =>
    (f.kind === "dc" ? 8 : 0) +
    newMods[formula.ability]! +
    formula.multiplier * r.pb! +
    formula.fixed;
  const manualFixed = (f: Field): boolean => {
    const d = s.decisions[f.id];
    if (d?.mode !== "fixed") return false;
    // Fixed means preserve the original number. The reason records why it is independent.
    numericResults.set(f.id, f.original);
    change(
      f.id,
      f.label,
      f.original,
      f.original,
      `Fixed value preserved: ${d.reason}`,
      "Manually confirmed",
    );
    return true;
  };
  for (const f of p.fields.filter(
    (f) => !["damage", "passive"].includes(f.kind),
  )) {
    if (manualFixed(f)) continue;
    let choices: Ability[];
    if (f.ability) choices = [f.ability];
    else if (f.kind === "skill") choices = [];
    else if (f.kind === "attack") {
      const casting = source.match(
        /spellcasting ability (?:is|:)\s*\*{0,2}(Strength|Dexterity|Constitution|Intelligence|Wisdom|Charisma)/i,
      );
      const cast = casting
        ? abilities[
            [
              "strength",
              "dexterity",
              "constitution",
              "intelligence",
              "wisdom",
              "charisma",
            ].indexOf(casting[1].toLowerCase())
          ]
        : undefined;
      choices =
        /spell/i.test(f.context) && cast
          ? [cast]
          : /spell/i.test(f.context)
            ? ["INT", "WIS", "CHA"]
            : ["STR", "DEX"];
    } else choices = [...abilities];
    const formula = infer(
      f,
      choices,
      f.kind === "dc" || f.kind === "attack" ? [1] : [0, 1, 2],
    );
    if (!formula) continue;
    formulas.set(f.id, formula);
    const value = formulaValue(f, formula);
    numericResults.set(f.id, value);
    patch(f.span, f.kind === "dc" ? String(value) : signed(value));
    if (f.scoreSpan) patch(f.scoreSpan, String(10 + value));
    change(
      f.id,
      f.label,
      f.original,
      value,
      `${f.kind === "dc" ? "8 + " : ""}${formula.ability} ${newMods[formula.ability]} + ${formula.multiplier} × PB ${r.pb} + fixed ${formula.fixed} = ${value}${f.scoreSpan ? `; initiative score ${10 + value}` : ""}`,
      formula.confidence,
    );
  }
  for (const f of p.fields.filter((f) => f.kind === "passive")) {
    if (manualFixed(f)) continue;
    const perception = p.fields.find(
      (x) => x.kind === "skill" && x.label.toLowerCase() === "perception",
    );
    let value: number | undefined,
      explanation = "",
      confidence = "";
    const decision = s.decisions[f.id];
    if (decision?.mode === "formula") {
      const formula = infer(
        { ...f, original: f.original - 10 },
        ["WIS"],
        [0, 1, 2],
      );
      if (formula) {
        value =
          10 +
          newMods[formula.ability]! +
          formula.multiplier * r.pb! +
          formula.fixed;
        explanation = `10 + ${formula.ability} ${newMods[formula.ability]} + ${formula.multiplier} × PB ${r.pb} + adjustment ${formula.fixed}`;
        confidence = formula.confidence;
      }
    } else if (perception) {
      const bonus = numericResults.get(perception.id);
      if (bonus !== undefined && f.original === 10 + perception.original) {
        value = 10 + bonus;
        explanation = `10 + Perception ${bonus}`;
        confidence = "Explicit passive formula";
      } else
        issue(
          f.id,
          f.label,
          "Resolve Perception first, and confirm any separate passive situational adjustment.",
          f,
        );
    } else {
      // Without a listed skill, do not silently invent a proficiency contribution.
      const formula = infer({ ...f, original: f.original - 10 }, ["WIS"], [0]);
      if (formula) {
        value = 10 + newMods.WIS! + formula.multiplier * r.pb!;
        explanation = `10 + WIS ${newMods.WIS} + ${formula.multiplier} × PB ${r.pb}`;
        confidence = formula.confidence;
      }
    }
    if (value !== undefined) {
      patch(f.span, String(value));
      change(
        f.id,
        f.label,
        f.original,
        value,
        `${explanation} = ${value}`,
        confidence,
      );
    }
  }
  for (const f of p.fields.filter((f) => f.kind === "damage")) {
    if (manualFixed(f)) continue;
    const d = s.decisions[f.id];
    let newFlat = f.flat!,
      confidence = "Explicit dice expression";
    const sourceAverage = Math.floor(f.diceAverage! + f.flat!);
    if (
      sourceAverage !== f.original &&
      !s.acknowledgements.includes(`average:${f.id}`)
    ) {
      r.issues.push({
        id: `average:${f.id}`,
        label: f.label,
        message: `Displayed average ${f.original} disagrees with ${f.expression} (average ${sourceAverage}). Confirm correcting the displayed average.`,
        acknowledge: true,
      });
      continue;
    }
    if (d?.mode === "formula" && d.ability) {
      if (!consistent || r.pb === undefined) {
        issue(
          f.id,
          f.label,
          "Consistent scores and new PB are required for this damage formula.",
          f,
        );
        continue;
      }
      newFlat = newMods[d.ability]! + d.multiplier * r.pb + d.fixed;
      confidence = `Manually confirmed: ${d.reason}`;
    } else if (f.flat !== 0) {
      const attack = f.attackId ? formulas.get(f.attackId) : undefined;
      if (
        attack &&
        f.damageRole === "primary" &&
        f.flat === oldMods[attack.ability]
      ) {
        newFlat = newMods[attack.ability]!;
        confidence = `Uniquely inferred ${attack.ability} contribution from associated attack and original damage`;
      } else {
        issue(
          f.id,
          f.label,
          "Confirm whether this flat damage term is ability-dependent or fixed. PB is never automatically added to damage.",
          f,
        );
        continue;
      }
    }
    const average = Math.floor(f.diceAverage! + newFlat);
    let expr = f.expression!;
    if (newFlat !== f.flat) {
      expr = expr.replace(/\s*[+\-−]\s*\d+\s*$/, "");
      if (newFlat) expr += ` ${newFlat > 0 ? "+" : "-"} ${Math.abs(newFlat)}`;
      patch(f.expressionSpan!, expr);
    }
    patch(f.span, String(average));
    change(
      f.id,
      f.label,
      `${f.original} (${f.expression})`,
      `${average} (${expr})`,
      `floor(exact dice average ${f.diceAverage} + flat ${newFlat}) = ${average}`,
      confidence,
    );
  }
  // Apply only captured source spans, from the end of the immutable original.
  patches.sort((a, b) => b.span.start - a.span.start);
  let boundary = source.length;
  let output = source;
  for (const edit of patches) {
    if (edit.span.end > boundary)
      throw new Error(
        "Overlapping source fields; conversion stopped to protect source text.",
      );
    output =
      output.slice(0, edit.span.start) +
      edit.value +
      output.slice(edit.span.end);
    boundary = edit.span.start;
  }
  const metadata = {
    version: 1,
    hpMode: s.hpMode,
    pb: r.pb ?? null,
    defense: s.method,
    equivalent: ["natural", "worn"].includes(s.method) ? s.armorId : null,
    mageArmorSlot: s.method === "mage_armor" ? s.slot : null,
    continueProficiencyBeyond30: s.extendPB,
    unresolved: r.issues.length,
    rationale: s.rationale,
    notes: s.notes,
  };
  // Encode user text so notes cannot escape the inert HTML comment.
  r.markdown = `<!-- encounter-forge:converted ${encodeURIComponent(JSON.stringify(metadata))} -->\n${r.issues.length ? `<!-- PARTIAL CONVERSION: ${r.issues.length} unresolved fields. Review report is separate from creature mechanics. -->\n` : ""}${output}`;
  return r;
}

export function reviewReport(result: Result) {
  return `# Conversion review: ${result.parsed.name}\n\n${result.issues.length ? result.issues.map((i) => `- ${i.label}: ${i.message}`).join("\n") : "No unresolved supported fields."}\n\n## Formula decisions\n\n${result.changes.map((c) => `- ${c.label}: ${c.before} → ${c.after}. ${c.formula} (${c.confidence})`).join("\n")}\n`;
}
