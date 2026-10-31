import React, { useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import demo from "./bulette.md?raw";
import { convert, reviewReport, type Field, type Issue } from "./converter";
import { downloadStatBlock, type StatBlockFormat } from "./statblock-export";
import {
  abilities,
  armor,
  defaults,
  exportProject,
  importProject,
  signed,
  type Ability,
  type Decision,
  type Settings,
} from "./rules";
import "./style.css";

const demoSettings = (): Settings => ({
  ...defaults(),
  method: "natural",
  armorId: "plate",
  rationale: "Demo selection: a steel-like carapace, compared with Plate.",
});
const methods = {
  review: "Special defense / DM review",
  natural: "Natural armor",
  worn: "Worn armor",
  ordinary: "Ordinary unarmored",
  monk: "Monk defense",
  barbarian: "Barbarian defense",
  mage_armor: "Mage Armor",
};
const maxFileSize = 250000;

function Icon({ name, size = 18 }: { name: string; size?: number }) {
  const paths: Record<string, React.ReactNode> = {
    upload: (
      <>
        <path d="M12 16V3m-5 5 5-5 5 5" />
        <path d="M4 15v5h16v-5" />
      </>
    ),
    download: (
      <>
        <path d="M12 3v13m-5-5 5 5 5-5" />
        <path d="M4 17v4h16v-4" />
      </>
    ),
    copy: (
      <>
        <rect x="8" y="8" width="12" height="13" rx="2" />
        <path d="M16 8V3H3v13h5" />
      </>
    ),
    spark: (
      <>
        <path d="m12 2 3 7 7 3-7 3-3 7-3-7-7-3 7-3Z" />
      </>
    ),
    shield: (
      <>
        <path d="m12 2 8 3v6c0 5-8 11-8 11S4 16 4 11V5Z" />
        <path d="m8 11 3 3 5-6" />
      </>
    ),
    arrow: <path d="M4 12h16m-6-6 6 6-6 6" />,
    chevron: <path d="m6 9 6 6 6-6" />,
    book: (
      <>
        <path d="M12 5C9 2 4 3 2 4v15c4-1 8-1 10 2 2-3 6-3 10-2V4c-2-1-7-2-10 1Z" />
        <path d="M12 5v16" />
      </>
    ),
  };
  return (
    <svg
      aria-hidden="true"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.65"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {paths[name] || paths.spark}
    </svg>
  );
}

function CreatureMarkdown({
  markdown,
  className,
}: {
  markdown: string;
  className: string;
}) {
  return (
    <div className={className}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        skipHtml
        components={{
          img: ({ alt }) => (
            <span className="omitted-image">
              {alt ? `[Image: ${alt}]` : "[Image omitted]"}
            </span>
          ),
        }}
      >
        {markdown}
      </ReactMarkdown>
    </div>
  );
}
function NumberInput({
  label,
  value,
  onChange,
  min,
  max,
  hint,
}: {
  label: string;
  value: number | null;
  onChange: (n: number | null) => void;
  min?: number;
  max?: number;
  hint?: string;
}) {
  return (
    <label className="field">
      {label}
      <input
        type="number"
        step="1"
        min={min}
        max={max}
        value={value ?? ""}
        onChange={(e) => {
          const n = e.target.value === "" ? null : Number(e.target.value);
          onChange(n);
        }}
      />
      {hint && <small>{hint}</small>}
    </label>
  );
}
function Check({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="check">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span>{label}</span>
    </label>
  );
}
function FormulaEditor({
  field,
  settings,
  onSave,
}: {
  field: Field;
  settings: Settings;
  onSave: (d: Decision) => void;
}) {
  const prior = settings.decisions[field.id];
  const [mode, setMode] = useState<"formula" | "fixed">(
    prior?.mode ?? "formula",
  );
  const [ability, setAbility] = useState<Ability | "">(
    prior?.ability ?? field.ability ?? "",
  );
  const [multiplier, setMultiplier] = useState<0 | 1 | 2>(
    prior?.multiplier ??
      (field.kind === "dc" || field.kind === "attack" ? 1 : 0),
  );
  const [fixed, setFixed] = useState<number | null>(prior?.fixed ?? 0);
  const [reason, setReason] = useState(prior?.reason ?? "");
  return (
    <div className="formula-editor">
      <label className="field">
        Treatment
        <select
          value={mode}
          onChange={(e) => setMode(e.target.value as typeof mode)}
        >
          <option value="formula">Confirm formula</option>
          <option value="fixed">Preserve as fixed</option>
        </select>
      </label>
      {mode === "formula" && (
        <>
          <div className="two-col">
            <label className="field">
              Governing ability
              <select
                value={ability}
                onChange={(e) => setAbility(e.target.value as Ability)}
              >
                <option value="">Choose ability…</option>
                {abilities.map((a) => (
                  <option key={a}>{a}</option>
                ))}
              </select>
            </label>
            <label className="field">
              PB contribution
              <select
                value={multiplier}
                onChange={(e) =>
                  setMultiplier(Number(e.target.value) as 0 | 1 | 2)
                }
              >
                {[0, 1, 2].map((n) => (
                  <option key={n} value={n}>
                    {n} × PB
                  </option>
                ))}
              </select>
            </label>
          </div>
          <NumberInput
            label={
              field.kind === "passive"
                ? "Fixed situational adjustment"
                : "Confirmed fixed bonus"
            }
            value={fixed}
            onChange={setFixed}
          />
          <p className="help">
            {field.kind === "dc"
              ? "8 + "
              : field.kind === "passive"
                ? "10 + "
                : ""}
            {ability || "ability"} modifier + {multiplier} × PB + {fixed ?? "?"}
            .{" "}
            {field.kind === "damage" &&
              "This replaces only the flat damage term; all dice stay the same."}
          </p>
        </>
      )}
      <label className="field">
        Reason for this decision
        <input
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="Explain the confirmed contribution"
          maxLength={1000}
        />
      </label>
      <button
        className="small primary"
        disabled={
          !reason.trim() ||
          (mode === "formula" &&
            (!ability || fixed === null || !Number.isSafeInteger(fixed)))
        }
        onClick={() =>
          onSave({
            mode,
            ability: ability || undefined,
            multiplier,
            fixed: fixed ?? 0,
            reason: reason.trim(),
          })
        }
      >
        Confirm decision
      </button>
    </div>
  );
}

function App() {
  const [source, setSource] = useState(demo);
  const [settings, setSettings] = useState<Settings>(demoSettings);
  const [isDemo, setIsDemo] = useState(true);
  const [tab, setTab] = useState<"preview" | "changes" | "markdown">("preview");
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [effectName, setEffectName] = useState("");
  const [effectValue, setEffectValue] = useState<number | null>(null);
  const [expandedField, setExpandedField] = useState<string | null>(null);
  const [sourceFileName, setSourceFileName] = useState("Bulette_demo.md");
  const [isDragging, setIsDragging] = useState(false);
  const [exporting, setExporting] = useState<StatBlockFormat | null>(null);
  const dragDepth = useRef(0);
  const exportSheet = useRef<HTMLDivElement>(null);
  const markdownUpload = useRef<HTMLInputElement>(null),
    projectUpload = useRef<HTMLInputElement>(null);
  const conversion = useMemo(() => {
    if (!source.trim()) return null;
    try {
      return { result: convert(source, settings), error: "" };
    } catch (e) {
      return {
        result: null,
        error: `Conversion stopped: ${(e as Error).message}`,
      };
    }
  }, [source, settings]);
  const result = conversion?.result;
  const changeSettings = (patch: Partial<Settings>) => {
    setSettings((s) => ({ ...s, ...patch }));
    setStatus("");
  };
  const changeSource = (text: string) => {
    setSource(text);
    setSourceFileName(text.trim() ? "Pasted Markdown" : "");
    setIsDemo(false);
    setSettings((s) => ({
      ...s,
      decisions: {},
      acknowledgements: [],
      originalPB: null,
      confirmCRFallback: false,
      acceptScoreModifiers: false,
      confirmHPExtra: false,
    }));
    setStatus("");
    setError("");
    setExpandedField(null);
  };
  const changeMethod = (method: Settings["method"]) =>
    changeSettings({
      method,
      enhancement: 0,
      ...(method === "monk" ? { shield: false, shieldEnhancement: 0 } : {}),
    });
  const download = (text: string, name: string, type = "text/markdown") => {
    const url = URL.createObjectURL(new Blob([text], { type }));
    const a = document.createElement("a");
    a.href = url;
    a.download = name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    setStatus(`Downloaded ${name}`);
  };
  const baseName =
    (result?.parsed.name || "Creature")
      .replace(/[^a-zA-Z0-9_-]+/g, "_")
      .slice(0, 80) || "Creature";
  const copy = async () => {
    if (!result) return;
    try {
      await navigator.clipboard.writeText(result.markdown);
      setStatus("Converted Markdown copied.");
    } catch {
      setError(
        "Clipboard access is unavailable. Use Download Markdown or select the text in the Markdown tab.",
      );
      setTab("markdown");
    }
  };
  const exportVisual = async (format: StatBlockFormat) => {
    if (!result || result.marked || !exportSheet.current || exporting) return;
    setExporting(format);
    setError("");
    try {
      const name = await downloadStatBlock(
        exportSheet.current,
        format,
        `${baseName}${result.issues.length ? "_partial" : ""}`,
      );
      setStatus(`Downloaded ${name}`);
    } catch (e) {
      setError(`Could not export the stat block: ${(e as Error).message}`);
    } finally {
      setExporting(null);
    }
  };
  const upload = async (file: File | undefined, project: boolean) => {
    if (!file) return;
    setError("");
    setStatus("");
    if (file.size > maxFileSize) {
      setError("Choose a file smaller than 250 KB.");
      return;
    }
    if (!file.name.toLowerCase().endsWith(project ? ".json" : ".md")) {
      setError(`Choose a ${project ? ".json project" : ".md Markdown"} file.`);
      return;
    }
    try {
      const text = await file.text();
      if (project) {
        const imported = importProject(text);
        setSource(imported.source);
        setSettings(imported.settings);
        setIsDemo(false);
        setSourceFileName("Source from project");
        setExpandedField(null);
      } else {
        if (!text.trim()) throw new Error("The Markdown file is empty.");
        changeSource(text);
        setSourceFileName(file.name);
      }
      setStatus(`Opened ${file.name}`);
    } catch (e) {
      setError(
        project
          ? `Invalid project: ${(e as Error).message}`
          : (e as Error).message,
      );
    }
  };
  const renderIssue = (issue: Issue) => (
    <article className="review-card" key={issue.id}>
      <div>
        <span className="issue-dot" />
        <strong>{issue.label}</strong>
      </div>
      <p>{issue.message}</p>
      {issue.acknowledge && (
        <button
          className="small"
          onClick={() =>
            changeSettings({
              acknowledgements: [...settings.acknowledgements, issue.id],
            })
          }
        >
          {issue.id.startsWith("average:")
            ? "Confirm corrected average"
            : "Confirm independent; preserve text"}
        </button>
      )}
      {issue.field && (
        <FormulaEditor
          key={issue.id}
          field={issue.field}
          settings={settings}
          onSave={(d) =>
            changeSettings({
              decisions: { ...settings.decisions, [issue.id]: d },
            })
          }
        />
      )}
    </article>
  );
  const exportReady = !!result && !result.marked;
  return (
    <>
      <header className="topbar">
        <a href="#main" className="brand">
          <span className="brand-icon">
            <Icon name="shield" size={24} />
          </span>
          <span>
            Encounter<span className="brand-light"> Forge</span>
            <small>THE DM’S WORKBENCH</small>
          </span>
        </a>
        <div className="top-actions">
          <span className="local-badge">
            <i />
            All work stays in your browser
          </span>
          <button
            className="quiet"
            onClick={() => {
              setSource(demo);
              setSettings(demoSettings());
              setIsDemo(true);
              setSourceFileName("Bulette_demo.md");
              setStatus("User-supplied Bulette demo loaded.");
              setError("");
              setExpandedField(null);
            }}
          >
            Load demo
          </button>
          <button
            className="quiet"
            onClick={() => {
              setSource("");
              setSettings(defaults());
              setIsDemo(false);
              setSourceFileName("");
              setStatus("Session cleared.");
              setError("");
              setExpandedField(null);
            }}
          >
            Reset
          </button>
        </div>
      </header>
      <main id="main">
        <section className="intro">
          <div>
            <p className="eyebrow">D&D 2024 · ARMOR HOUSE RULES</p>
            <h1>
              A familiar creature.
              <br className="mobile-break" /> A new challenge.
            </h1>
            <p className="intro-copy">
              Convert a complete stat block. Keep every ruling in sight.
            </p>
          </div>
          <div className="workflow">
            <span className="active">
              01 <b>Import</b>
            </span>
            <Icon name="arrow" size={16} />
            <span>
              02 <b>Refine</b>
            </span>
            <Icon name="arrow" size={16} />
            <span>
              03 <b>Bring to the table</b>
            </span>
          </div>
        </section>
        <div className="notice-area" aria-live="polite">
          {status && <p className="status">{status}</p>}
          {(error || conversion?.error) && (
            <p role="alert" className="error">
              {error || conversion?.error}
            </p>
          )}
        </div>
        <div className="workspace">
          <section
            className="panel source-panel"
            aria-labelledby="source-title"
          >
            <div className="panel-heading">
              <div>
                <span className="step">01</span>
                <h2 id="source-title">Original stat block</h2>
              </div>
              <span className="tag">MARKDOWN</span>
            </div>
            <div
              className={`file-drop ${isDragging ? "dragging" : ""}`}
              role="group"
              aria-label="Markdown file drop zone"
              onDragEnter={(e) => {
                e.preventDefault();
                dragDepth.current++;
                setIsDragging(true);
              }}
              onDragOver={(e) => {
                e.preventDefault();
                e.dataTransfer.dropEffect = "copy";
              }}
              onDragLeave={(e) => {
                e.preventDefault();
                dragDepth.current = Math.max(0, dragDepth.current - 1);
                if (!dragDepth.current) setIsDragging(false);
              }}
              onDrop={(e) => {
                e.preventDefault();
                dragDepth.current = 0;
                setIsDragging(false);
                if (e.dataTransfer.files.length !== 1) {
                  setError("Drop one .md file at a time.");
                  return;
                }
                void upload(e.dataTransfer.files[0], false);
              }}
            >
              <span className="drop-icon">
                <Icon name="upload" size={24} />
              </span>
              <div className="drop-copy">
                <strong>
                  {isDragging
                    ? "Release to open your creature"
                    : "Drop your .md file here"}
                </strong>
                <span>Markdown · up to 250 KB · or choose a file</span>
              </div>
              <button onClick={() => markdownUpload.current?.click()}>
                Upload .md
              </button>
            </div>
            <input
              ref={markdownUpload}
              className="hidden"
              type="file"
              accept=".md,text/markdown"
              aria-label="Upload Markdown file"
              onChange={(e) => {
                void upload(e.target.files?.[0], false);
                e.target.value = "";
              }}
            />
            {source.trim() && (
              <div className="source-file">
                <Icon name="book" size={15} />
                <strong>{sourceFileName}</strong>
                <span>{source.length.toLocaleString()} characters</span>
                {isDemo && (
                  <small>
                    User-supplied demo · not verified official content
                  </small>
                )}
              </div>
            )}
            <details className="source-disclosure">
              <summary>
                Edit or paste Markdown <Icon name="chevron" size={16} />
              </summary>
              <label className="sr-only" htmlFor="source">
                Source Markdown
              </label>
              <textarea
                id="source"
                className="source-editor"
                value={source}
                maxLength={maxFileSize}
                onChange={(e) => changeSource(e.target.value)}
                spellCheck={false}
                placeholder={
                  "Paste the original Markdown stat block here…\n\nInclude all six ability scores, HP dice, and original PB."
                }
              />
              <div className="source-footer">
                <span>{source.length.toLocaleString()} characters</span>
                <span>Original → fresh calculation</span>
              </div>
            </details>
            <div className="project-actions">
              <button
                className="quiet small"
                onClick={() => projectUpload.current?.click()}
              >
                Open project JSON
              </button>
              <button
                className="quiet small"
                disabled={!source.trim()}
                onClick={() => {
                  try {
                    download(
                      exportProject(source, settings),
                      `${baseName}_project.json`,
                      "application/json",
                    );
                  } catch {
                    setError(
                      "A project setting is invalid. Check whole-number inputs and required fields.",
                    );
                  }
                }}
              >
                Save project JSON
              </button>
            </div>
            <input
              ref={projectUpload}
              className="hidden"
              type="file"
              accept=".json,application/json"
              aria-label="Open project JSON file"
              onChange={(e) => {
                void upload(e.target.files?.[0], true);
                e.target.value = "";
              }}
            />
          </section>
          <section
            className="panel controls-panel"
            aria-labelledby="controls-title"
          >
            <details className="rules-disclosure">
              <summary className="panel-heading">
                <div>
                  <span className="step">02</span>
                  <h2 id="controls-title">Conversion rules</h2>
                </div>
                <span className="rules-summary">
                  <span>
                    {methods[settings.method]}
                    {["natural", "worn"].includes(settings.method)
                      ? ` · ${armor.find((a) => a.id === settings.armorId)?.name}`
                      : settings.method === "mage_armor"
                        ? ` · slot ${settings.slot ?? "?"}`
                        : ""}
                    <small>
                      {settings.hpMode === "average" ? "Average" : "Maximum"} HP
                      · click to adjust
                    </small>
                  </span>
                  <Icon name="chevron" />
                </span>
              </summary>
              <div className="controls-body">
                <fieldset disabled={!!result?.marked}>
                  <legend className="eyebrow">PHYSICAL DEFENSE</legend>
                  <label className="field">
                    Defense method
                    <select
                      value={settings.method}
                      onChange={(e) =>
                        changeMethod(e.target.value as Settings["method"])
                      }
                    >
                      {Object.entries(methods).map(([id, name]) => (
                        <option key={id} value={id}>
                          {name}
                        </option>
                      ))}
                    </select>
                  </label>
                  {["natural", "worn"].includes(settings.method) && (
                    <>
                      <div className="two-col">
                        <label className="field">
                          {settings.method === "natural"
                            ? "Physical equivalent"
                            : "Armor"}
                          <select
                            value={settings.armorId}
                            onChange={(e) =>
                              changeSettings({
                                armorId: e.target.value as Settings["armorId"],
                              })
                            }
                          >
                            {armor.map((a) => (
                              <option key={a.id} value={a.id}>
                                {a.name}
                              </option>
                            ))}
                          </select>
                        </label>
                        <label className="field">
                          Enhancement
                          <select
                            value={settings.enhancement}
                            onChange={(e) =>
                              changeSettings({
                                enhancement: Number(e.target.value),
                              })
                            }
                          >
                            {[0, 1, 2, 3].map((n) => (
                              <option key={n} value={n}>
                                {n === 0 ? "None" : `+${n}`}
                              </option>
                            ))}
                          </select>
                        </label>
                      </div>
                      {settings.method === "worn" && (
                        <Check
                          label="Proficient in this worn armor"
                          checked={settings.proficient}
                          onChange={(proficient) =>
                            changeSettings({ proficient })
                          }
                        />
                      )}
                      {settings.method === "natural" && (
                        <div className="guidance">
                          <strong>Choose by physical protection</strong>
                          <p>
                            Skin, fur, flexible hide → light.
                            <br />
                            Chitin, layered plates, rigid scales → medium.
                            <br />
                            Steel-like shells and carapaces → heavy.
                          </p>
                          <small>
                            Suggestions for a DM ruling. No automatic magical
                            enhancement or equipment properties.
                          </small>
                        </div>
                      )}
                      <label className="field">
                        Reason for the equivalent
                        <input
                          value={settings.rationale}
                          onChange={(e) =>
                            changeSettings({ rationale: e.target.value })
                          }
                          placeholder="e.g. Thick, overlapping shell plates"
                          maxLength={2000}
                        />
                      </label>
                    </>
                  )}
                  {settings.method === "mage_armor" && (
                    <>
                      <NumberInput
                        label="Mage Armor spell-slot level"
                        min={1}
                        max={9}
                        value={settings.slot}
                        onChange={(slot) => changeSettings({ slot })}
                      />
                      <p className="help">
                        Slots 1–2: 13 + DEX (cap 3) + PB.
                        <br />
                        Slots 3–4: 15 + DEX (cap 1) + PB.
                        <br />
                        Slots 5–9: 17 + PB, DEX ignored.
                        <br />
                        Uses the target’s PB. Normal spell eligibility still
                        applies.
                      </p>
                    </>
                  )}
                  {settings.method === "review" && (
                    <>
                      <p className="help">
                        No automatic formula is defined for special
                        base-replacing effects. Enter an override and explain
                        the ruling, or leave AC unresolved.
                      </p>
                      <NumberInput
                        label="Manual AC override"
                        min={1}
                        value={settings.manualAC}
                        onChange={(manualAC) => changeSettings({ manualAC })}
                      />
                      <label className="field">
                        Override reason
                        <input
                          value={settings.manualACReason}
                          onChange={(e) =>
                            changeSettings({ manualACReason: e.target.value })
                          }
                        />
                      </label>
                    </>
                  )}
                  {["ordinary", "monk", "barbarian"].includes(
                    settings.method,
                  ) && (
                    <p className="help">
                      {settings.method === "ordinary"
                        ? "10 + min(DEX modifier, 5) + PB."
                        : `min(10 + DEX modifier + ${settings.method === "monk" ? "WIS" : "CON"} modifier, 15) + PB.`}
                      {settings.method === "monk"
                        ? " Armor and shields are unavailable."
                        : settings.method === "barbarian"
                          ? " Armor is unavailable; a shield is allowed."
                          : " Negative DEX still applies."}
                    </p>
                  )}
                  <div className="shield-row">
                    <Check
                      label="Equip shield"
                      checked={settings.shield}
                      onChange={(shield) =>
                        changeSettings({ shield, shieldEnhancement: 0 })
                      }
                    />
                    {settings.shield && (
                      <label className="field compact">
                        Shield enhancement
                        <select
                          value={settings.shieldEnhancement}
                          onChange={(e) =>
                            changeSettings({
                              shieldEnhancement: Number(e.target.value),
                            })
                          }
                        >
                          {[0, 1, 2, 3].map((n) => (
                            <option key={n} value={n}>
                              {n
                                ? `+${n} (${n + 1} AC total)`
                                : "Normal (+1 AC)"}
                            </option>
                          ))}
                        </select>
                      </label>
                    )}
                  </div>
                  <details>
                    <summary>
                      Other confirmed AC effects
                      {settings.effects.length
                        ? ` (${settings.effects.length})`
                        : ""}
                    </summary>
                    <p className="help">
                      Additive effects only; each needs a name. These do not
                      replace the base defense.
                    </p>
                    {settings.effects.map((effect, i) => (
                      <div className="effect" key={i}>
                        <span>
                          {effect.name} <b>{signed(effect.value)}</b>
                        </span>
                        <button
                          className="quiet small"
                          aria-label={`Remove ${effect.name}`}
                          onClick={() =>
                            changeSettings({
                              effects: settings.effects.filter(
                                (_, j) => j !== i,
                              ),
                            })
                          }
                        >
                          Remove
                        </button>
                      </div>
                    ))}
                    <label className="field">
                      Effect name
                      <input
                        value={effectName}
                        onChange={(e) => setEffectName(e.target.value)}
                        maxLength={100}
                      />
                    </label>
                    <NumberInput
                      label="Signed AC bonus"
                      value={effectValue}
                      onChange={setEffectValue}
                    />
                    <button
                      className="small"
                      disabled={
                        !effectName.trim() ||
                        effectValue === null ||
                        !Number.isSafeInteger(effectValue)
                      }
                      onClick={() => {
                        changeSettings({
                          effects: [
                            ...settings.effects,
                            { name: effectName.trim(), value: effectValue! },
                          ],
                        });
                        setEffectName("");
                        setEffectValue(null);
                      }}
                    >
                      Add effect
                    </button>
                  </details>
                </fieldset>
                <fieldset disabled={!!result?.marked}>
                  <legend className="eyebrow">HIT POINTS</legend>
                  <div
                    className="segmented"
                    role="group"
                    aria-label="Hit Points mode"
                  >
                    <button
                      aria-pressed={settings.hpMode === "average"}
                      className={
                        settings.hpMode === "average" ? "selected" : ""
                      }
                      onClick={() => changeSettings({ hpMode: "average" })}
                    >
                      Average <span>default</span>
                    </button>
                    <button
                      aria-pressed={settings.hpMode === "maximum"}
                      className={
                        settings.hpMode === "maximum" ? "selected" : ""
                      }
                      onClick={() => changeSettings({ hpMode: "maximum" })}
                    >
                      Maximum
                    </button>
                  </div>
                  <p className="help">
                    Same Hit Dice. New CON contribution.{" "}
                    {settings.hpMode === "average"
                      ? "Exact dice averages, rounded down once."
                      : "Maximum HP changes HP only; damage stays averaged."}
                  </p>
                  {result?.hpExtra !== undefined && result.hpExtra !== 0 && (
                    <Check
                      label={`Confirm fixed extra HP ${signed(result.hpExtra)}`}
                      checked={settings.confirmHPExtra}
                      onChange={(confirmHPExtra) =>
                        changeSettings({ confirmHPExtra })
                      }
                    />
                  )}
                </fieldset>
                <details
                  open={
                    !!result?.issues.some(
                      (i) =>
                        i.id === "pb:original" || i.id.startsWith("modifier:"),
                    )
                  }
                >
                  <summary>Original formulas & proficiency</summary>
                  <NumberInput
                    label="Resolve original PB"
                    value={settings.originalPB}
                    min={1}
                    onChange={(originalPB) => changeSettings({ originalPB })}
                    hint="Leave blank to use consistent source PB entries."
                  />
                  {result?.parsed.cr !== undefined && (
                    <Check
                      label={`Confirm original CR ${result.parsed.cr} fallback for missing PB`}
                      checked={settings.confirmCRFallback}
                      onChange={(confirmCRFallback) =>
                        changeSettings({ confirmCRFallback })
                      }
                    />
                  )}
                  <Check
                    label="Use score-derived modifiers to resolve listed modifier conflicts"
                    checked={settings.acceptScoreModifiers}
                    onChange={(acceptScoreModifiers) =>
                      changeSettings({ acceptScoreModifiers })
                    }
                  />
                  <Check
                    label="Continue the proficiency pattern beyond 30 HD"
                    checked={settings.extendPB}
                    onChange={(extendPB) => changeSettings({ extendPB })}
                  />
                  <p className="help">
                    Enemy effective level is the unchanged number of Hit Dice.
                    CR and XP stay unchanged and are not a new difficulty
                    assessment.
                  </p>
                </details>
                <details>
                  <summary>DM notes</summary>
                  <label className="field">
                    Notes saved in project & export metadata
                    <textarea
                      rows={3}
                      value={settings.notes}
                      onChange={(e) =>
                        changeSettings({ notes: e.target.value })
                      }
                      maxLength={10000}
                    />
                  </label>
                </details>
                <details className="references">
                  <summary>Armor & proficiency reference</summary>
                  <table>
                    <caption>Custom armor values</caption>
                    <thead>
                      <tr>
                        <th>Equivalent</th>
                        <th>Base</th>
                        <th>DEX</th>
                      </tr>
                    </thead>
                    <tbody>
                      {armor.map((a) => (
                        <tr key={a.id}>
                          <td>{a.name}</td>
                          <td>{a.base}</td>
                          <td>
                            {a.dexCap === null ? "Ignored" : `Cap +${a.dexCap}`}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <p className="help">
                    Applicable PB is added to the base. Heavy armor ignores all
                    DEX, including negative values. Hide and Ring Mail have no
                    defined values.
                  </p>
                  <p className="help">
                    1–4 HD +2 · 5–8 +3 · 9–12 +4 · 13–16 +5 · 17–20 +6 · 21–24
                    +7 · 25–28 +8 · 29–30 +9.
                  </p>
                </details>
              </div>
            </details>
          </section>
          <section
            className="panel result-panel"
            aria-labelledby="result-title"
          >
            <div className="panel-heading">
              <div>
                <span className="step">03</span>
                <h2 id="result-title">The converted creature</h2>
              </div>
              {result && (
                <span
                  className={`tag ${result.issues.length ? "amber" : "green"}`}
                >
                  {result.marked
                    ? "READ ONLY"
                    : result.issues.length
                      ? `${result.issues.length} TO REVIEW`
                      : "READY FOR THE TABLE"}
                </span>
              )}
            </div>
            {!result ? (
              <div className="empty-state">
                <Icon name="book" size={42} />
                <h3>Your next encounter starts here.</h3>
                <p>
                  Paste or upload an original Markdown creature to see its full
                  conversion.
                </p>
              </div>
            ) : (
              <>
                <div className="result-summary">
                  <div>
                    <p className="eyebrow">
                      {isDemo ? "DEMO CREATURE" : "CONVERSION PREVIEW"}
                    </p>
                    <h2>{result.parsed.name}</h2>
                  </div>
                  <span className="hd-badge">
                    {result.parsed.hp
                      ? `${result.parsed.hp.count} HD`
                      : "HD needed"}
                  </span>
                </div>
                <div className="metrics">
                  <div>
                    <small>ARMOR CLASS</small>
                    <strong>{result.ac ?? "—"}</strong>
                    <span>
                      {result.parsed.ac
                        ? `was ${result.parsed.ac.value}`
                        : "choose defense"}
                    </span>
                  </div>
                  <div>
                    <small>{settings.hpMode.toUpperCase()} HP</small>
                    <strong>{result.hp ?? "—"}</strong>
                    <span>
                      {result.parsed.hp
                        ? `was ${result.parsed.hp.total}`
                        : "needs formula"}
                    </span>
                  </div>
                  <div>
                    <small>PROFICIENCY</small>
                    <strong>
                      {result.pb === undefined ? "—" : signed(result.pb)}
                    </strong>
                    <span>
                      {result.oldPB === undefined
                        ? "original PB needed"
                        : `was ${signed(result.oldPB)}`}
                    </span>
                  </div>
                </div>
                <div
                  className="score-strip"
                  aria-label="Rounded ability scores"
                >
                  {result.scores.map((a) => (
                    <div key={a.ability}>
                      <span>{a.ability}</span>
                      <strong>
                        {a.before !== a.after && <del>{a.before}</del>}
                        {a.after}
                      </strong>
                      <small>{signed(a.mod)}</small>
                    </div>
                  ))}
                </div>
                {settings.method === "mage_armor" && (
                  <p className="result-note">
                    Mage Armor · spell slot {settings.slot ?? "required"} ·
                    target PB
                  </p>
                )}
                {settings.rationale &&
                  ["natural", "worn"].includes(settings.method) && (
                    <p className="result-note">{settings.rationale}</p>
                  )}
                {settings.extendPB && (
                  <p className="result-note">
                    DM ruling: proficiency pattern continues beyond 30 HD.
                  </p>
                )}
                <div className="tabs" role="tablist" aria-label="Result views">
                  {(["preview", "changes", "markdown"] as const).map((t) => (
                    <button
                      role="tab"
                      id={`tab-${t}`}
                      aria-controls={`view-${t}`}
                      aria-selected={tab === t}
                      tabIndex={tab === t ? 0 : -1}
                      key={t}
                      className={tab === t ? "active" : ""}
                      onClick={() => setTab(t)}
                      onKeyDown={(e) => {
                        const options = [
                          "preview",
                          "changes",
                          "markdown",
                        ] as const;
                        let next = -1;
                        if (e.key === "ArrowRight")
                          next = (options.indexOf(t) + 1) % 3;
                        if (e.key === "ArrowLeft")
                          next = (options.indexOf(t) + 2) % 3;
                        if (e.key === "Home") next = 0;
                        if (e.key === "End") next = 2;
                        if (next >= 0) {
                          e.preventDefault();
                          setTab(options[next]);
                          document
                            .getElementById(`tab-${options[next]}`)
                            ?.focus();
                        }
                      }}
                    >
                      {t === "preview"
                        ? "Stat block"
                        : t === "changes"
                          ? `Changes (${result.changes.filter((c) => c.before !== c.after).length})`
                          : "Markdown"}
                    </button>
                  ))}
                </div>
                <div
                  className="result-content"
                  role="tabpanel"
                  id={`view-${tab}`}
                  aria-labelledby={`tab-${tab}`}
                  tabIndex={0}
                >
                  {tab === "preview" && (
                    <CreatureMarkdown
                      markdown={result.markdown}
                      className="statblock"
                    />
                  )}
                  {tab === "markdown" && (
                    <>
                      <label className="sr-only" htmlFor="output">
                        Converted Markdown
                      </label>
                      <textarea
                        id="output"
                        readOnly
                        value={result.markdown}
                        className="markdown-output"
                        spellCheck={false}
                      />
                    </>
                  )}
                  {tab === "changes" && (
                    <div className="changes">
                      {result.changes.map((c) => (
                        <article key={c.id} className="change">
                          <div>
                            <strong>{c.label}</strong>
                            <span
                              className={
                                c.before !== c.after ? "value changed" : "value"
                              }
                            >
                              {c.before} <span>→</span> {c.after}
                            </span>
                          </div>
                          <p>{c.formula}</p>
                          <small>{c.confidence}</small>
                          {result.parsed.fields.some((f) => f.id === c.id) && (
                            <>
                              <button
                                className="quiet small"
                                onClick={() =>
                                  setExpandedField(
                                    expandedField === c.id ? null : c.id,
                                  )
                                }
                              >
                                {expandedField === c.id
                                  ? "Close decision"
                                  : "Review / override formula"}
                              </button>
                              {expandedField === c.id && (
                                <FormulaEditor
                                  field={
                                    result.parsed.fields.find(
                                      (f) => f.id === c.id,
                                    )!
                                  }
                                  settings={settings}
                                  onSave={(d) => {
                                    changeSettings({
                                      decisions: {
                                        ...settings.decisions,
                                        [c.id]: d,
                                      },
                                    });
                                    setExpandedField(null);
                                  }}
                                />
                              )}
                            </>
                          )}
                        </article>
                      ))}
                    </div>
                  )}
                </div>
                {result.issues.length > 0 && (
                  <div className="review-report">
                    <div className="review-title">
                      <strong>
                        {result.marked
                          ? "Already converted"
                          : "A few rulings need you"}
                      </strong>
                      <span>{result.issues.length}</span>
                    </div>
                    <p className="help">
                      Unresolved fields stay as written. Exports are labeled as
                      partial. This report is kept outside the creature
                      mechanics.
                    </p>
                    {result.issues.map(renderIssue)}
                  </div>
                )}
                <div className="export-actions">
                  <div
                    className="visual-downloads"
                    role="group"
                    aria-label="Download visual stat block"
                  >
                    <div className="export-caption">
                      <strong>Take it to the table</strong>
                      <span>Download the complete, styled stat block.</span>
                    </div>
                    <button
                      className="primary"
                      disabled={!exportReady || !!exporting}
                      onClick={() => void exportVisual("png")}
                    >
                      <Icon name="download" />
                      {exporting === "png" ? "Preparing PNG…" : "Download PNG"}
                    </button>
                    <button
                      disabled={!exportReady || !!exporting}
                      onClick={() => void exportVisual("pdf")}
                    >
                      <Icon name="download" />
                      {exporting === "pdf" ? "Preparing PDF…" : "Download PDF"}
                    </button>
                  </div>
                  <div className="markdown-downloads">
                    <button disabled={!exportReady} onClick={() => void copy()}>
                      <Icon name="copy" />
                      Copy Markdown
                    </button>
                    <button
                      disabled={!exportReady}
                      onClick={() =>
                        result &&
                        download(result.markdown, `${baseName}_converted.md`)
                      }
                    >
                      <Icon name="download" />
                      Download .md
                    </button>
                    <button
                      className="quiet small"
                      disabled={!exportReady}
                      onClick={() =>
                        result &&
                        download(reviewReport(result), `${baseName}_review.md`)
                      }
                    >
                      Review report
                    </button>
                  </div>
                </div>
              </>
            )}
          </section>
        </div>
        {result && !result.marked && (
          <div className="export-stage" aria-hidden="true" inert>
            <div className="export-sheet" ref={exportSheet}>
              <div className="export-masthead">
                <span>ENCOUNTER FORGE</span>
                <span>D&D 2024 · HOUSE RULES</span>
              </div>
              {!!result.issues.length && (
                <div className="export-partial">
                  Partial conversion · {result.issues.length} unresolved fields.
                  See the separate review report.
                </div>
              )}
              <CreatureMarkdown
                markdown={result.markdown}
                className="export-statblock"
              />
              <div className="export-footnote">
                Converted stat block ·{" "}
                {settings.hpMode === "maximum" ? "Maximum" : "Average"} HP
                {settings.method === "mage_armor"
                  ? ` · Mage Armor slot ${settings.slot}`
                  : ""}
                {settings.extendPB ? " · Extended proficiency pattern" : ""}
              </div>
            </div>
          </div>
        )}
        <footer>
          <span>
            <Icon name="shield" size={14} /> Built for rulings, with the math
            attached.
          </span>
          <span>Local conversion. Your files stay in your browser.</span>
        </footer>
      </main>
    </>
  );
}
createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
