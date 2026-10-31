export type StatBlockFormat = "png" | "pdf";
const paper = "#f3e5c9";

function saveBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}
function canvasBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) =>
    canvas.toBlob(
      (blob) =>
        blob
          ? resolve(blob)
          : reject(new Error("The browser could not create the image.")),
      "image/png",
    ),
  );
}

/** Prefer a gap between blocks, then a blank line, so pagination does not cut through text. */
function pageEnd(
  canvas: HTMLCanvasElement,
  start: number,
  capacity: number,
  breaks: number[],
) {
  const limit = Math.min(canvas.height, start + capacity);
  if (limit === canvas.height) return limit;
  const minimum = Math.max(start + 1, limit - Math.round(canvas.width * 0.16));
  const blockEnd = breaks
    .filter((end) => end >= minimum && end <= limit)
    .at(-1);
  if (blockEnd) return blockEnd;
  const context = canvas.getContext("2d");
  if (!context) return limit;
  const inset = Math.ceil(canvas.width * 0.06),
    width = canvas.width - inset * 2;
  const pixels = context.getImageData(
    inset,
    minimum,
    width,
    limit - minimum,
  ).data;
  for (let row = limit - minimum - 3; row >= 2; row--) {
    let clear = true;
    for (let y = row - 1; y <= row + 1 && clear; y++) {
      for (let x = 0; x < width; x++) {
        const i = (y * width + x) * 4;
        if (
          pixels[i] < 175 &&
          pixels[i + 1] < 155 &&
          pixels[i + 2] < 120 &&
          pixels[i + 3] > 50
        ) {
          clear = false;
          break;
        }
      }
    }
    if (clear) return minimum + row;
  }
  return limit;
}

export async function downloadStatBlock(
  node: HTMLElement,
  format: StatBlockFormat,
  basename: string,
): Promise<string> {
  // Snapshot this creature, independent of subsequent edits or the selected tab.
  const stage = document.createElement("div");
  stage.className = "export-stage";
  stage.inert = true;
  stage.setAttribute("aria-hidden", "true");
  const snapshot = node.cloneNode(true) as HTMLElement;
  stage.append(snapshot);
  document.body.append(stage);
  try {
    await document.fonts.ready;
    const { toCanvas } = await import("html-to-image");
    const width = Math.ceil(snapshot.getBoundingClientRect().width),
      height = Math.ceil(snapshot.scrollHeight);
    if (!width || !height)
      throw new Error("No stat block is available to export.");
    const pixelRatio = Math.min(
      2,
      16000 / Math.max(width, height),
      Math.sqrt(24_000_000 / (width * height)),
    );
    if (pixelRatio < 1)
      throw new Error(
        "This stat block is too large for a visual export. Download the Markdown instead.",
      );
    const canvas = await toCanvas(snapshot, {
      width,
      height,
      pixelRatio,
      backgroundColor: paper,
      skipFonts: true,
    });
    const filename = `${basename}_statblock.${format}`;
    if (format === "png") {
      saveBlob(await canvasBlob(canvas), filename);
      return filename;
    }

    const { jsPDF } = await import("jspdf");
    const pdf = new jsPDF({
      orientation: "portrait",
      unit: "mm",
      format: "a4",
      compress: true,
    });
    pdf.setProperties({
      title: `${basename} — converted stat block`,
      creator: "DnD Rebalanced",
    });
    const margin = 12,
      contentWidth = 186,
      contentHeight = 268;
    const capacity = Math.floor((contentHeight * canvas.width) / contentWidth);
    const rect = snapshot.getBoundingClientRect(),
      scale = canvas.width / rect.width;
    const breaks = [
      ...new Set(
        Array.from(snapshot.querySelectorAll("p, li, table, pre, hr")).map(
          (element) =>
            Math.ceil(
              (element.getBoundingClientRect().bottom - rect.top) * scale,
            ),
        ),
      ),
    ].sort((a, b) => a - b);
    const pages: { start: number; end: number }[] = [];
    for (let start = 0; start < canvas.height; ) {
      const end = pageEnd(canvas, start, capacity, breaks);
      pages.push({ start, end });
      start = end;
    }
    for (let i = 0; i < pages.length; i++) {
      if (i) pdf.addPage();
      const { start, end } = pages[i];
      const slice = document.createElement("canvas");
      slice.width = canvas.width;
      slice.height = end - start;
      const context = slice.getContext("2d");
      if (!context)
        throw new Error("This browser does not support image export.");
      context.drawImage(
        canvas,
        0,
        start,
        canvas.width,
        slice.height,
        0,
        0,
        canvas.width,
        slice.height,
      );
      pdf.addImage(
        slice,
        "PNG",
        margin,
        margin,
        contentWidth,
        (slice.height * contentWidth) / canvas.width,
        undefined,
        "FAST",
      );
      pdf.setFont("times", "normal");
      pdf.setFontSize(8);
      pdf.setTextColor(104, 74, 48);
      pdf.text(`DnD Rebalanced  |  ${i + 1} / ${pages.length}`, 105, 289, {
        align: "center",
      });
      slice.width = slice.height = 0;
    }
    saveBlob(
      new Blob([pdf.output("arraybuffer")], { type: "application/pdf" }),
      filename,
    );
    return filename;
  } finally {
    stage.remove();
  }
}
