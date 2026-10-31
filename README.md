# Encounter Forge

A client-side Markdown enemy converter for the supplied D&D 2024 armor house rules. Built with React, TypeScript and Vite. No application backend, API key, model or monster database.

Repository: **https://github.com/AimonettiJoaquin/DnDRebalanced**

## Hosting

### Netlify

Production: **https://encounter-forge.netlify.app**

The current Netlify project has sign-in protection enabled (`sso_login`). Open it with an authorized Netlify session. The production deployment was confirmed as `ready` through the Netlify API; anonymous browser verification is blocked by that sign-in gate.

`netlify.toml` configures `npm run build`, publishes only `dist/`, and selects Node.js 22. It includes the SPA fallback and immutable caching for versioned assets.

Continuous deployment uses `AimonettiJoaquin/DnDRebalanced`, production branch `main`. A push to `main` starts a Netlify build; a successful build replaces the published site at the same URL. Failed builds leave the previous publication in place.

Work in a Git clone of that repository, commit the changes, and push them:

```bash
git add <changed-files>
git commit -m "Describe the change"
git push origin main
```

In this workspace, the Git checkout is `.sites-checkout/`. Open that directory in your editor when making changes you intend to commit. The parent workspace also contains a separate copy of the source files.

For an optional manual deployment using your Netlify account:

```bash
npx netlify-cli login
npm run build
npx netlify-cli deploy --prod --dir=dist --no-build
```

Link this clone to the existing `encounter-forge` project if the CLI asks. The local project link is stored in `.netlify/`, which is ignored by Git. The build settings are versioned in `netlify.toml`. No runtime environment variables are required.

### Existing Sites deployment

The previous Sites publication remains at https://encounter-forge.sleekapple4097.chatgpt.site. Its project identity is retained in `.openai/hosting.json`; it is private to the owner. The converter itself has no user accounts or server-side data storage.

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

Browser tests use `/usr/bin/chromium`. Set `CHROMIUM_PATH` to another Chromium executable if needed. Playwright starts its own local Vite server when one is not already running. Set `PLAYWRIGHT_PORT=5174` when port 5173 is already in use. In a restricted execution environment, browser tests need permission to reach loopback and launch Chromium.

## Use

1. Drag a `.md` file onto the compact drop zone or choose **Upload .md**. To paste or edit the source, expand **Edit or paste Markdown**. The initial Bulette is the **user-supplied regression fixture**, not verified official content.
2. Expand **Conversion rules** to choose a defense method and, for natural or worn armor, a physical equivalent. The closed section summarizes the current defense and HP mode. Old AC is an optional comparison, never an input to the defense formula. If missing, a calculated AC line is inserted beside HP.
3. Review the six rounded scores, unchanged HD count, new PB, AC and HP. Average HP is the default. Maximum HP changes HP only.
4. Inspect **Changes** for original/new values, arithmetic, and whether the formula was explicit, uniquely inferred or manually confirmed. Every supported dependent field offers a formula override.
5. Resolve review cards by choosing an ability, PB multiplier and fixed bonus, or explicitly preserving a fixed field. Record a reason. Resolve invalid scores and unsupported source formats in the source editor. Unknown numeric traits may be acknowledged as independent; otherwise keep them unresolved for manual editing.
6. Download the complete, styled creature using **Download PNG** or **Download PDF**, or keep the original Markdown workflow with **Copy Markdown** and **Download .md**. PNG exports use a consistent, high-resolution parchment layout; PDF exports paginate long creatures in A4 format and prefer breaks between paragraphs. Both work from any result tab. Partial visual exports have an explicit banner and filename; download the separate review report for unresolved fields and formula decisions.

The workspace uses a single vertical column with compact file import and collapsed rules. Its parchment, wood and copper palette is also used in visual exports. All export processing takes place in the browser. The PDF contains images of the formatted stat block; use Markdown for editable text. Extremely large visual exports show an error and retain the Markdown download instead of truncating the creature.

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
- `src/statblock-export.ts`: local PNG rendering and paginated PDF export; its rendering libraries load only when requested.
- `src/bulette.md`: exact supplied fixture.
- `src/*.test.ts` and `tests/workspace.spec.ts`: rule/conversion regressions and real Chromium workflows.
