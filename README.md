# Encounter Forge

A client-side Markdown enemy converter for the supplied D&D 2024 armor house rules. Built with React, TypeScript and Vite. No application backend, API key, model or monster database.

## Hosting

Sites is configured to serve the production build from `dist/`, with the project identity retained in `.openai/hosting.json`. The configured URL is https://encounter-forge.sleekapple4097.chatgpt.site. The initial publication is private to the owner and uses the hosting provider's sign-in gate; the converter itself has no user accounts or server-side data storage.

## Run locally

Use Node.js 22.12 or newer (verified here with Node 26).

```bash
npm ci
npm run dev
```

Open the Local URL printed by Vite, normally **http://127.0.0.1:5173**. The application makes no external requests. Installation requires package registry access; normal use does not. Fonts and icons are local/system assets.

```bash
npm test             # pure rule, parser, conversion and project regressions
npm run build        # TypeScript validation and production build to dist/
npm run preview      # serve the production build locally
npm run test:browser # Chromium workflow, accessibility and responsive checks
```

Browser tests use `/usr/bin/chromium`. Set `CHROMIUM_PATH` to another Chromium executable if needed. Playwright starts its own local Vite server when one is not already running. In a restricted execution environment, browser tests need permission to reach loopback and launch Chromium.

## Use

1. Paste an original stat block or upload `.md`. The initial Bulette is the **user-supplied regression fixture**, not verified official content.
2. Choose a defense method and, for natural or worn armor, a physical equivalent. Old AC is an optional comparison, never an input to the defense formula. If missing, a calculated AC line is inserted beside HP.
3. Review the six rounded scores, unchanged HD count, new PB, AC and HP. Average HP is the default. Maximum HP changes HP only.
4. Inspect **Changes** for original/new values, arithmetic, and whether the formula was explicit, uniquely inferred or manually confirmed. Every supported dependent field offers a formula override.
5. Resolve review cards by choosing an ability, PB multiplier and fixed bonus, or explicitly preserving a fixed field. Record a reason. Resolve invalid scores and unsupported source formats in the source editor. Unknown numeric traits may be acknowledged as independent; otherwise keep them unresolved for manual editing.
6. Copy or download the full converted Markdown. Partial exports are marked. Download the separate review report for unresolved fields and formula decisions.

**Save project JSON** preserves the original Markdown, HP mode, defense settings, Mage Armor slot, rationale, notes, formula decisions and acknowledgements. Open that project to continue later. State is held in memory until saved; Reset clears it. Editing the source starts a new inference pass and clears source-specific decisions, original-PB overrides and HP-extra confirmations.

Converted Markdown has an inert conversion marker and encoded metadata. Reopening it shows it as already converted and disables conversion exports. Use its original project JSON or the original `.md` to make further conversions. The app never overwrites the imported file; Markdown downloads use a `_converted.md` suffix.

## Supported structure and deliberate limits

- One creature per document, with a six-column `STR | DEX | CON | INT | WIS | CHA` table (columns may be reordered), numeric scores and parenthesized signed modifiers. Blockquotes, bold labels, headings, whitespace, Unicode minus signs and CRLF are supported.
- HP needs a displayed total and one positive Hit Dice pool, e.g. `94 (9d10 + 45)`. Mixed HP pools require manual source review. The die size is required. A non-CON flat contribution needs explicit fixed-extra confirmation. Nonpositive results remain unresolved.
- PB declarations are read from **Proficiency Bonus**, **PB**, and **Challenge** labels. Conflicting declarations require a manual original PB. Missing PB can use the original CR only after explicit confirmation. Symbolic expressions such as `STR + PB + 1` are never mistaken for PB declarations.
- Supported numeric fields include AC, HP, ability scores/modifiers, listed saves, standard skills, initiative (including its score), passive Perception, common Melee/Ranged/Spell Attack labels, DCs, and displayed damage averages/expressions. Spell attacks can use an explicitly named spellcasting ability. Multiple plausible governing abilities require a choice.
- A primary attack's flat damage can be uniquely inferred from its associated ability and original numbers. Additional flat riders require their own decisions; matching numbers alone do not make riders ability-dependent. Dice-only riders stay fixed. Multiple additive damage dice pools are supported. Damage remains averaged in Maximum HP mode.
- Explicit parenthesized formulas support one ability, PB multiplied by 0/1/2, and signed constants, e.g. `DC 15 (8 + PB + STR)` or `bonus +8 (Strength modifier + proficiency bonus + 1)`. Their arithmetic must agree with the original displayed value. Other custom formulas remain for DM review; the app does not evaluate arbitrary expressions or code.
- Unsupported numeric traits are preserved and flagged conservatively. Arbitrary prose and every third-party stat-block layout cannot be inferred deterministically. Inspect the full source and preview; unusual layout changes may require editing the source. Magic weapon dice progression is deliberately not applied.
- Natural equivalents change the AC calculation only. They do not grant equipment properties or invent enhancements. Special defenses require an explicitly labeled manual AC override and reason.
- Preview rendering skips raw HTML, rejects unsafe link protocols and does not execute embedded scripts. Source and exported Markdown retain original text; previews load no remote images.
- Rule calculations are separate pure modules. Source spans change only recognized fields; unrelated numbers and unknown sections are preserved. Each edit always recalculates from the original source, never a previous result. JSON is schema-validated and versioned; files are limited to 250 KB in the interface.

## Main files

- `src/rules.ts`: custom armor, defense formulas, PB, rounding and versioned project schema.
- `src/converter.ts`: immutable source parser, explicit/inferred formulas, source-span edits and review exports.
- `src/main.tsx` and `src/style.css`: responsive workspace, safe preview and local file/clipboard actions.
- `src/bulette.md`: exact supplied fixture.
- `src/*.test.ts` and `tests/workspace.spec.ts`: rule/conversion regressions and real Chromium workflows.
