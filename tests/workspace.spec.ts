import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
const fixture = readFileSync(
  new URL("../src/bulette.md", import.meta.url),
  "utf8",
);
test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await page.locator(".rules-disclosure > summary").click();
  await page.locator(".source-disclosure > summary").click();
});

test("table-ready demo, HP toggling and transparent formula changes", async ({
  page,
}) => {
  await expect(page.getByText("READY FOR THE TABLE")).toBeVisible();
  await expect(page.locator(".statblock")).toContainText("103 (9d10 + 54)");
  await page.getByRole("button", { name: "Maximum", exact: true }).click();
  await expect(page.locator(".statblock")).toContainText(
    "144 (9d10 + 54; maximum HP)",
  );
  await expect(page.locator(".statblock")).toContainText("18 (2d12 + 5)");
  await page.getByRole("button", { name: "Average default" }).click();
  await expect(page.locator(".statblock")).toContainText("103 (9d10 + 54)");
  await page.getByRole("tab", { name: /Changes/ }).click();
  await expect(page.locator(".changes")).toContainText(
    "Uniquely inferred double-proficiency contribution",
  );
  await expect(page.locator(".changes")).toContainText("8 + STR 5 + 1 × PB 4");
});
test("keyboard tabs, clipboard and distinct Markdown download", async ({
  page,
}) => {
  await page.getByRole("tab", { name: "Stat block", exact: true }).focus();
  await page.keyboard.press("ArrowRight");
  await expect(page.getByRole("tab", { name: /Changes/ })).toBeFocused();
  await page.keyboard.press("End");
  await expect(
    page.getByRole("tab", { name: "Markdown", exact: true }),
  ).toBeFocused();
  await expect(
    page.getByLabel("Converted Markdown", { exact: true }),
  ).toContainText("encounter-forge:converted");
  await page
    .getByRole("button", { name: "Copy Markdown", exact: true })
    .click();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toContain(
    "103 (9d10 + 54)",
  );
  const downloading = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download .md", exact: true }).click();
  const downloaded = await downloading;
  expect(downloaded.suggestedFilename()).toBe("Bulette_converted.md");
  const contents = readFileSync((await downloaded.path())!, "utf8");
  expect(contents).toContain("encounter-forge:converted");
  expect(contents).toContain("PB +4");
});
test("JSON retains source, notes, HP mode and Mage Armor slot through reset", async ({
  page,
}) => {
  await page
    .getByRole("combobox", { name: "Defense method", exact: true })
    .selectOption("mage_armor");
  await page.getByLabel("Mage Armor spell-slot level").fill("5");
  await page.getByRole("button", { name: "Maximum", exact: true }).click();
  await page.getByText("DM notes", { exact: true }).click();
  await page
    .getByLabel("Notes saved in project & export metadata")
    .fill("Slot 5 before the encounter.");
  const downloading = page.waitForEvent("download");
  await page.getByRole("button", { name: "Save project JSON" }).click();
  const downloaded = await downloading;
  const project = readFileSync((await downloaded.path())!, "utf8");
  expect(JSON.parse(project).source).toBe(fixture);
  await page.getByRole("button", { name: "Reset", exact: true }).click();
  await expect(page.getByLabel("Source Markdown", { exact: true })).toHaveValue(
    "",
  );
  await page.getByLabel("Open project JSON file").setInputFiles({
    name: "saved.json",
    mimeType: "application/json",
    buffer: Buffer.from(project),
  });
  await expect(
    page.getByRole("combobox", { name: "Defense method", exact: true }),
  ).toHaveValue("mage_armor");
  await expect(page.getByLabel("Mage Armor spell-slot level")).toHaveValue("5");
  await expect(page.locator(".statblock")).toContainText(
    "144 (9d10 + 54; maximum HP)",
  );
});
test("file validation and safe preview, with converted re-import protection", async ({
  page,
}) => {
  await page.getByLabel("Upload Markdown file").setInputFiles({
    name: "bad.txt",
    mimeType: "text/plain",
    buffer: Buffer.from("x"),
  });
  await expect(page.getByRole("alert")).toContainText("Choose a .md");
  await page.getByLabel("Upload Markdown file").setInputFiles({
    name: "empty.md",
    mimeType: "text/markdown",
    buffer: Buffer.from(""),
  });
  await expect(page.getByRole("alert")).toContainText("empty");
  const remoteRequests: string[] = [];
  page.on("request", (r) => {
    if (r.url().startsWith("https://example.com/"))
      remoteRequests.push(r.url());
  });
  await page
    .getByLabel("Source Markdown", { exact: true })
    .fill(
      fixture +
        '\n<script>window.compromised=true</script>\n\n<img src="x" onerror="window.compromised=true">\n\n[bad](javascript:alert(1))\n\n![Remote image](https://example.com/tracker.png)',
    );
  await expect(page.locator(".statblock")).toContainText(
    "[Image: Remote image]",
  );
  expect(remoteRequests).toEqual([]);
  expect(
    await page.evaluate(
      () => (window as unknown as { compromised?: boolean }).compromised,
    ),
  ).toBeUndefined();
  expect(await page.locator(".statblock script,.statblock img").count()).toBe(
    0,
  );
  await page
    .getByRole("button", { name: "Copy Markdown", exact: true })
    .click();
  const converted = await page.evaluate(() => navigator.clipboard.readText());
  await page.getByLabel("Source Markdown", { exact: true }).fill(converted);
  await expect(page.getByText("READ ONLY", { exact: true })).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Copy Markdown", exact: true }),
  ).toBeDisabled();
});
test("ambiguous formula can be resolved from the review report", async ({
  page,
}) => {
  await page
    .getByLabel("Source Markdown", { exact: true })
    .fill(
      fixture
        .replace("11 (+0)", "19 (+4)")
        .replace("**Initiative** +0 (10)", "**Initiative** +4 (14)"),
    );
  const card = page
    .locator(".review-card")
    .filter({ has: page.getByText("Bite attack", { exact: true }) });
  await expect(card).toContainText("Multiple formulas fit");
  await card.getByLabel("Governing ability").selectOption("STR");
  await card
    .getByLabel("Reason for this decision")
    .fill("Strength drives this bite.");
  await card.getByRole("button", { name: "Confirm decision" }).click();
  await expect(page.locator(".statblock")).toContainText("+9, reach 5 ft.");
  await expect(page.locator(".statblock")).toContainText("18 (2d12 + 5)");
});
test("switching methods and removing shields excludes hidden enhancements", async ({
  page,
}) => {
  await page
    .getByRole("combobox", { name: "Enhancement", exact: true })
    .selectOption("3");
  await expect(page.locator(".metrics").first()).toContainText("23");
  await page
    .getByRole("combobox", { name: "Defense method", exact: true })
    .selectOption("mage_armor");
  await page.getByLabel("Mage Armor spell-slot level").fill("5");
  await expect(page.locator(".metrics")).toContainText("21");
  await page.getByLabel("Equip shield").check();
  await page
    .getByRole("combobox", { name: "Shield enhancement", exact: true })
    .selectOption("3");
  await expect(page.locator(".metrics")).toContainText("25");
  await page.getByLabel("Equip shield").uncheck();
  await expect(page.locator(".metrics")).toContainText("21");
  await page.getByLabel("Mage Armor spell-slot level").fill("");
  await expect(page.locator(".review-report")).toContainText(
    "whole spell-slot level",
  );
});
test("small-screen workspace has no horizontal overflow and accessible controls", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(390);
  await page
    .getByRole("combobox", { name: "Defense method", exact: true })
    .selectOption("ordinary");
  await expect(page.locator(".metrics")).toContainText("15");
  await page
    .getByRole("button", { name: "Download .md", exact: true })
    .scrollIntoViewIfNeeded();
  await expect(
    page.getByRole("button", { name: "Download .md", exact: true }),
  ).toBeVisible();
  await page.screenshot({ path: "test-results/mobile.png", fullPage: true });
});
test("desktop layout, no external requests and no browser errors", async ({
  page,
}) => {
  const errors: string[] = [];
  const requests: string[] = [];
  const origin = new URL(page.url()).origin;
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("request", (r) => {
    if (!r.url().startsWith(origin)) requests.push(r.url());
  });
  await page.reload();
  await expect(page.locator(".statblock")).toContainText("Deadly Leap");
  expect(errors).toEqual([]);
  expect(requests).toEqual([]);
  await page.screenshot({ path: "test-results/desktop.png", fullPage: true });
});

test("compact file import and rules start closed in a single column", async ({
  page,
}) => {
  await page.reload();
  await expect(page.locator(".source-editor")).toBeHidden();
  await expect(
    page.getByRole("combobox", { name: "Defense method", exact: true }),
  ).toBeHidden();
  const boxes = await page.locator(".workspace > .panel").evaluateAll((nodes) =>
    nodes.map((node) => {
      const box = node.getBoundingClientRect();
      return { x: box.x, y: box.y, width: box.width, height: box.height };
    }),
  );
  expect(boxes).toHaveLength(3);
  expect(boxes[0].height).toBeLessThan(350);
  expect(boxes[1].height).toBeLessThan(110);
  expect(boxes[0].x).toBe(boxes[1].x);
  expect(boxes[1].x).toBe(boxes[2].x);
  expect(boxes[1].y).toBeGreaterThan(boxes[0].y + boxes[0].height);
  expect(boxes[2].y).toBeGreaterThan(boxes[1].y + boxes[1].height);
  await page.locator(".rules-disclosure > summary").focus();
  await page.keyboard.press("Enter");
  await page
    .getByRole("combobox", { name: "Defense method", exact: true })
    .selectOption("mage_armor");
  await page.getByLabel("Mage Armor spell-slot level").fill("5");
  await page.locator(".rules-disclosure > summary").click();
  await expect(page.locator(".rules-summary")).toContainText(
    "Mage Armor · slot 5",
  );
  await expect(page.locator(".metrics")).toContainText("21");
});

test("drag-and-drop imports a Markdown file without opening the source editor", async ({
  page,
}) => {
  await page.reload();
  const data = await page.evaluateHandle((text) => {
    const transfer = new DataTransfer();
    transfer.items.add(
      new File([text], "Underground_Bulette.md", { type: "text/markdown" }),
    );
    return transfer;
  }, fixture);
  const zone = page.getByRole("group", { name: "Markdown file drop zone" });
  await zone.dispatchEvent("dragenter", { dataTransfer: data });
  await expect(zone).toHaveClass(/dragging/);
  await zone.dispatchEvent("drop", { dataTransfer: data });
  await expect(page.locator(".source-file")).toContainText(
    "Underground_Bulette.md",
  );
  await expect(page.locator(".source-editor")).toBeHidden();
  await expect(page.locator(".statblock")).toContainText("103 (9d10 + 54)");
  await expect(zone).not.toHaveClass(/dragging/);
  const invalid = await page.evaluateHandle(() => {
    const transfer = new DataTransfer();
    transfer.items.add(new File(["x"], "wrong.txt"));
    return transfer;
  });
  await zone.dispatchEvent("drop", { dataTransfer: invalid });
  await expect(page.getByRole("alert")).toContainText("Choose a .md");
});

test("visual PNG and PDF download the full creature from any result tab", async ({
  page,
}) => {
  await page.getByRole("button", { name: "Maximum", exact: true }).click();
  await page.getByRole("tab", { name: "Markdown", exact: true }).click();
  const pngEvent = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download PNG", exact: true }).click();
  const png = await pngEvent;
  expect(png.suggestedFilename()).toBe("Bulette_statblock.png");
  const contents = readFileSync((await png.path())!);
  expect(contents.subarray(0, 8).toString("hex")).toBe("89504e470d0a1a0a");
  expect(contents.readUInt32BE(16)).toBe(1680);
  expect(contents.readUInt32BE(20)).toBeGreaterThan(1800);
  await png.saveAs("test-results/exported-bulette.png");
  await expect(page.locator(".export-footnote").first()).toHaveText(
    "Converted stat block · Maximum HP",
  );
  const pdfEvent = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download PDF", exact: true }).click();
  const pdf = await pdfEvent;
  expect(pdf.suggestedFilename()).toBe("Bulette_statblock.pdf");
  const pdfContents = readFileSync((await pdf.path())!);
  expect(pdfContents.subarray(0, 5).toString()).toBe("%PDF-");
  expect(pdfContents.length).toBeGreaterThan(20000);
  await pdf.saveAs("test-results/exported-bulette.pdf");
  await expect(
    page.getByLabel("Converted Markdown", { exact: true }),
  ).toContainText("144 (9d10 + 54; maximum HP)");
});

test("partial visual exports are labeled, and long stat blocks create multiple PDF pages", async ({
  page,
}) => {
  const extra = Array.from(
    { length: 20 },
    (_, i) =>
      `>***Field Note ${i + 1}.*** This creature moves through deep stone passages and guards its territory until the final intruder leaves.\n>\n`,
  ).join("");
  await page
    .getByLabel("Source Markdown", { exact: true })
    .fill(fixture + "\n>### Field Notes\n" + extra);
  await page
    .getByRole("combobox", { name: "Defense method", exact: true })
    .selectOption("review");
  await expect(page.locator(".export-partial")).toContainText(
    "Partial conversion",
  );
  const downloading = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download PDF", exact: true }).click();
  const pdf = await downloading;
  expect(pdf.suggestedFilename()).toBe("Bulette_partial_statblock.pdf");
  const contents = readFileSync((await pdf.path())!, "latin1");
  const count = contents.match(/\/Type \/Page\b/g)?.length ?? 0;
  expect(count).toBeGreaterThanOrEqual(3);
  await pdf.saveAs("test-results/exported-long-creature.pdf");
});

test("language toggle preserves source, settings and results, and remembers the chosen language", async ({
  page,
}) => {
  await page
    .getByRole("combobox", { name: "Defense method", exact: true })
    .selectOption("mage_armor");
  await page.getByLabel("Mage Armor spell-slot level").fill("5");
  await page.getByRole("button", { name: "Maximum", exact: true }).click();
  await page.getByRole("tab", { name: "Markdown", exact: true }).click();
  const converted = await page
    .getByLabel("Converted Markdown", { exact: true })
    .inputValue();
  const original = await page
    .getByLabel("Source Markdown", { exact: true })
    .inputValue();
  await page.getByRole("button", { name: "Switch to Spanish" }).click();
  await expect(page.locator("html")).toHaveAttribute("lang", "es");
  await expect(
    page.getByRole("heading", { name: "Reglas de conversión", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByLabel("Markdown original", { exact: true }),
  ).toHaveValue(original);
  await expect(
    page.getByLabel("Markdown convertido", { exact: true }),
  ).toHaveValue(converted);
  await expect(
    page.getByRole("combobox", { name: "Método de defensa", exact: true }),
  ).toHaveValue("mage_armor");
  await expect(
    page.getByLabel("Nivel del espacio de conjuro de Armadura de mago"),
  ).toHaveValue("5");
  await expect(page.locator(".metrics")).toContainText("PV MÁXIMOS");
  await expect(page.locator(".metrics")).toContainText("144");
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("lang", "es");
  await expect(
    page.getByRole("heading", { name: "Reglas de conversión", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Cambiar a inglés" }).click();
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
  await expect(
    page.getByRole("heading", { name: "Conversion rules", exact: true }),
  ).toBeVisible();
});

test("armor categories and formulas are visible before selection and respect proficiency", async ({
  page,
}) => {
  const select = page.getByRole("combobox", {
    name: "Physical equivalent",
    exact: true,
  });
  expect(
    await select
      .locator("optgroup")
      .evaluateAll((groups) =>
        groups.map((group) => group.getAttribute("label")),
      ),
  ).toEqual(["Light armor", "Medium armor", "Heavy armor"]);
  await expect(select.locator('option[value="leather"]')).toHaveText(
    "Leather · AC 11 + DEX (≤ +4) + PB",
  );
  await expect(select.locator('option[value="scale_mail"]')).toHaveText(
    "Scale Mail · AC 13 + DEX (≤ +1) + PB",
  );
  await expect(select.locator('option[value="plate"]')).toHaveText(
    "Plate · AC 16 + PB · DEX ignored",
  );
  await expect(page.locator(".armor-guide")).toContainText("even negative DEX");
  await page
    .getByRole("combobox", { name: "Defense method", exact: true })
    .selectOption("worn");
  await page.getByLabel("Proficient in this worn armor").uncheck();
  await expect(
    page.locator('.controls-body option[value="plate"]'),
  ).not.toContainText("+ PB");
  await expect(page.locator(".no-armor-pb")).toBeVisible();
  await expect(page.locator(".metrics")).toContainText("16");
  await page.getByRole("button", { name: "Switch to Spanish" }).click();
  const spanish = page.getByRole("combobox", { name: "Armadura", exact: true });
  expect(
    await spanish
      .locator("optgroup")
      .evaluateAll((groups) =>
        groups.map((group) => group.getAttribute("label")),
      ),
  ).toEqual(["Armadura ligera", "Armadura media", "Armadura pesada"]);
  await expect(spanish.locator('option[value="plate"]')).toHaveText(
    "Placas · CA 16 · Se ignora DEX",
  );
  await expect(page.locator(".armor-guide")).toContainText(
    "La DEX negativa reduce la CA",
  );
});

test("Spanish review decisions, validation and visual export stay local and usable on mobile", async ({
  page,
}) => {
  await page.getByRole("button", { name: "Switch to Spanish" }).click();
  await page.getByLabel("Cargar archivo Markdown").setInputFiles({
    name: "wrong.txt",
    mimeType: "text/plain",
    buffer: Buffer.from("x"),
  });
  await expect(page.getByRole("alert")).toContainText(
    "Elegí un archivo Markdown .md.",
  );
  await page
    .getByLabel("Markdown original", { exact: true })
    .fill(
      fixture
        .replace("Perception +6", "Perception +7")
        .replace("Passive Perception 16", "Passive Perception 17"),
    );
  const card = page
    .locator(".review-card")
    .filter({ has: page.getByText("Percepción", { exact: true }) });
  await expect(card).toContainText(
    "El valor original no tiene una fórmula estándar única",
  );
  await card.getByLabel("Característica utilizada").selectOption("WIS");
  await card.getByLabel("Aporte de PB").selectOption("2");
  await card.getByLabel("Bono fijo confirmado").fill("1");
  await card.getByLabel("Motivo de esta decisión").fill("Sentidos agudos");
  await card.getByRole("button", { name: "Confirmar decisión" }).click();
  await expect(page.locator(".statblock")).toContainText("Perception +9");
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(390);
  const downloading = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Descargar PNG", exact: true })
    .click();
  const png = await downloading;
  expect(png.suggestedFilename()).toBe("Bulette_statblock.png");
  expect(
    readFileSync((await png.path())!)
      .subarray(0, 8)
      .toString("hex"),
  ).toBe("89504e470d0a1a0a");
  await png.saveAs("test-results/exported-spanish-bulette.png");
  await page.screenshot({
    path: "test-results/spanish-mobile.png",
    fullPage: true,
  });
});

test("AC provenance updates preview, Markdown and visual exports without retaining old armor", async ({
  page,
}) => {
  await page
    .getByLabel("Source Markdown", { exact: true })
    .fill(
      fixture.replace(
        "**Armor Class** 17",
        "**Armor Class** 17 (natural armor)",
      ),
    );
  await page
    .getByRole("combobox", { name: "Defense method", exact: true })
    .selectOption("worn");
  await page
    .getByRole("combobox", { name: "Armor", exact: true })
    .selectOption("half_plate");
  await page
    .getByRole("combobox", { name: "Enhancement", exact: true })
    .selectOption("1");
  await page.getByLabel("Equip shield", { exact: true }).check();
  await page
    .getByRole("combobox", { name: "Shield enhancement", exact: true })
    .selectOption("2");
  const acLine = "Armor Class 23 (Half Plate +1 + shield +2)";
  await expect(page.locator(".statblock")).toContainText(acLine);
  await expect(page.locator(".statblock")).not.toContainText("natural armor");
  await expect(page.locator(".export-statblock")).toContainText(acLine);
  await page.getByRole("tab", { name: "Markdown", exact: true }).click();
  await expect(
    page.getByLabel("Converted Markdown", { exact: true }),
  ).toHaveValue(/\*\*Armor Class\*\* 23 \(Half Plate \+1 \+ shield \+2\)/);
  await page
    .getByRole("button", { name: "Copy Markdown", exact: true })
    .click();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toContain(
    "**Armor Class** 23 (Half Plate +1 + shield +2)",
  );
});

test("theme toggle preserves the conversion, is localized and remembers the chosen appearance", async ({
  page,
}) => {
  await page.getByRole("tab", { name: "Markdown", exact: true }).click();
  const original = await page
    .getByLabel("Source Markdown", { exact: true })
    .inputValue();
  const converted = await page
    .getByLabel("Converted Markdown", { exact: true })
    .inputValue();
  await page
    .getByRole("button", { name: "Switch to dark mode", exact: true })
    .click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await expect(page.locator(".export-sheet").first()).toHaveAttribute(
    "data-theme",
    "dark",
  );
  expect(
    await page
      .locator(".panel")
      .first()
      .evaluate((node) => getComputedStyle(node).backgroundColor),
  ).toBe("rgb(44, 37, 31)");
  await expect(page.getByLabel("Source Markdown", { exact: true })).toHaveValue(
    original,
  );
  await expect(
    page.getByLabel("Converted Markdown", { exact: true }),
  ).toHaveValue(converted);
  await page.getByRole("button", { name: "Switch to Spanish" }).click();
  await expect(
    page.getByRole("button", { name: "Cambiar a modo claro" }),
  ).toBeVisible();
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await expect(page.locator("html")).toHaveAttribute("lang", "es");
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(390);
  await page.screenshot({
    path: "test-results/dark-mobile.png",
    fullPage: true,
  });
  const downloading = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Descargar PNG", exact: true })
    .click();
  const png = await downloading;
  await png.saveAs("test-results/exported-dark-bulette.png");
  // Decode the actual downloaded file to verify that the exported theme matches.
  const imageData = readFileSync((await png.path())!).toString("base64");
  const pixel = await page.evaluate(async (data) => {
    const image = new Image();
    image.src = `data:image/png;base64,${data}`;
    await image.decode();
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = 1;
    const context = canvas.getContext("2d")!;
    context.drawImage(image, 20, 20, 1, 1, 0, 0, 1, 1);
    return Array.from(context.getImageData(0, 0, 1, 1).data);
  }, imageData);
  expect(pixel).toEqual([39, 33, 28, 255]);
  await page.getByRole("button", { name: "Cambiar a modo claro" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await page.reload();
  await expect(
    page.getByRole("button", { name: "Cambiar a modo oscuro" }),
  ).toBeVisible();
});

test("system dark preference and blocked storage still allow switching and paginated dark PDFs", async ({
  page,
}) => {
  await page.emulateMedia({ colorScheme: "dark" });
  await page.addInitScript(() => {
    Object.defineProperty(window, "localStorage", {
      get() {
        throw new DOMException("Storage unavailable", "SecurityError");
      },
    });
  });
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page.getByRole("button", { name: "Switch to light mode" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await page.getByRole("button", { name: "Switch to dark mode" }).click();
  await page.locator(".source-disclosure > summary").click();
  const extra = Array.from(
    { length: 20 },
    (_, i) =>
      `>***Field Note ${i + 1}.*** This creature moves through deep stone passages and guards its territory until the final intruder leaves.\n>\n`,
  ).join("");
  await page
    .getByLabel("Source Markdown", { exact: true })
    .fill(fixture + "\n>### Field Notes\n" + extra);
  const downloading = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download PDF", exact: true }).click();
  const pdf = await downloading;
  const contents = readFileSync((await pdf.path())!, "latin1");
  expect(
    contents.match(/\/Type \/Page\b/g)?.length ?? 0,
  ).toBeGreaterThanOrEqual(3);
  await pdf.saveAs("test-results/exported-dark-long-creature.pdf");
  await page.screenshot({
    path: "test-results/dark-desktop.png",
    fullPage: true,
  });
});
