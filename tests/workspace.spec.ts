import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
const fixture = readFileSync(
  new URL("../src/bulette.md", import.meta.url),
  "utf8",
);
test.beforeEach(async ({ page }) => {
  await page.goto("/");
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
  await page
    .getByLabel("Open project JSON file")
    .setInputFiles({
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
  await page
    .getByLabel("Upload Markdown file")
    .setInputFiles({
      name: "bad.txt",
      mimeType: "text/plain",
      buffer: Buffer.from("x"),
    });
  await expect(page.getByRole("alert")).toContainText("Choose a .md");
  await page
    .getByLabel("Upload Markdown file")
    .setInputFiles({
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
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("request", (r) => {
    if (!r.url().startsWith("http://127.0.0.1:5173")) requests.push(r.url());
  });
  await page.reload();
  await expect(page.locator(".statblock")).toContainText("Deadly Leap");
  expect(errors).toEqual([]);
  expect(requests).toEqual([]);
  await page.screenshot({ path: "test-results/desktop.png", fullPage: true });
});
