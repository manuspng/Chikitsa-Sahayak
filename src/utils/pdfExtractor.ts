/**
 * Client-Side PDF Document Processing Utility using Mozilla's pdfjs-dist.
 * Enables 100% offline, zero-API-key text extraction and canvas rendering for digital and scanned PDF lab reports.
 */
import * as pdfjsLib from "pdfjs-dist";
import pdfjsWorker from "pdfjs-dist/build/pdf.worker.min.mjs?url";

// Configure worker source for Vite bundler with robust CDN fallback
try {
  if (typeof window !== "undefined") {
    pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorker || `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.mjs`;
  }
} catch (e) {
  console.warn("Failed to set local PDF.js worker, falling back to CDN:", e);
}

/**
 * Checks if a file is a PDF document
 */
export function isPdfFile(file: File): boolean {
  return (
    file.type === "application/pdf" ||
    file.name.toLowerCase().endsWith(".pdf")
  );
}

/**
 * Extracts raw digital text directly from a PDF file in browser memory.
 * Preserves horizontal and vertical tabular line alignment.
 */
export async function extractTextFromPdf(file: File): Promise<string> {
  const arrayBuffer = await file.arrayBuffer();
  const loadingTask = pdfjsLib.getDocument({ data: new Uint8Array(arrayBuffer) });
  const pdfDoc = await loadingTask.promise;
  const numPages = Math.min(pdfDoc.numPages, 5); // Read up to 5 pages
  const pageTexts: string[] = [];

  for (let pageNum = 1; pageNum <= numPages; pageNum++) {
    const page = await pdfDoc.getPage(pageNum);
    const textContent = await page.getTextContent();
    
    // Group text items by their vertical Y position (lines)
    const items = textContent.items as Array<{ str: string; transform: number[]; hasEOL?: boolean }>;
    if (!items || items.length === 0) continue;

    // Group items into lines based on Y coordinate (transform[5])
    const lineMap = new Map<number, Array<{ x: number; str: string }>>();
    const tolerance = 4; // Tolerance in points for considering items on the same line

    for (const item of items) {
      if (!item.str || item.str.trim() === "") continue;
      const x = item.transform[4];
      const y = item.transform[5];

      // Find an existing line within tolerance
      let foundLineKey: number | null = null;
      for (const existingY of lineMap.keys()) {
        if (Math.abs(existingY - y) <= tolerance) {
          foundLineKey = existingY;
          break;
        }
      }

      if (foundLineKey !== null) {
        lineMap.get(foundLineKey)!.push({ x, str: item.str });
      } else {
        lineMap.set(y, [{ x, str: item.str }]);
      }
    }

    // Sort lines from top of page to bottom (descending Y)
    const sortedY = Array.from(lineMap.keys()).sort((a, b) => b - a);
    const pageLines: string[] = [];

    for (const y of sortedY) {
      const lineItems = lineMap.get(y)!;
      // Sort items within line from left to right (ascending X)
      lineItems.sort((a, b) => a.x - b.x);
      const lineString = lineItems.map(i => i.str.trim()).join(" ");
      if (lineString.trim().length > 0) {
        pageLines.push(lineString);
      }
    }

    pageTexts.push(pageLines.join("\n"));
  }

  return pageTexts.join("\n\n");
}

/**
 * Renders PDF pages into crisp high-resolution JPEG Data URLs on HTML5 Canvas.
 * Used for OCR fallback on scanned PDF image reports and multi-agent image analysis.
 */
export async function renderPdfPagesToImages(file: File, maxPages = 3): Promise<string[]> {
  const arrayBuffer = await file.arrayBuffer();
  const loadingTask = pdfjsLib.getDocument({ data: new Uint8Array(arrayBuffer) });
  const pdfDoc = await loadingTask.promise;
  const numPages = Math.min(pdfDoc.numPages, maxPages);
  const images: string[] = [];

  for (let pageNum = 1; pageNum <= numPages; pageNum++) {
    const page = await pdfDoc.getPage(pageNum);
    // Render at 2.0x scale for crisp 300 DPI text recognition
    const viewport = page.getViewport({ scale: 2.0 });

    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    if (!ctx) continue;

    canvas.width = viewport.width;
    canvas.height = viewport.height;

    // Fill white background for transparency
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const renderContext = {
      canvasContext: ctx,
      viewport: viewport,
      canvas: canvas as any,
    };

    await page.render(renderContext).promise;
    images.push(canvas.toDataURL("image/jpeg", 0.92));
  }

  return images;
}
