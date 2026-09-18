import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import { INPUT_MAX_LENGTH } from "./draft.js";
import type { RuleDraftIssueCode } from "./issues.js";

// Proposed limits, not yet confirmed with B (docs/contracts/RULE_DRAFT_API_PROPOSAL.md §5).
export const PDF_MAX_BYTES = 5 * 1024 * 1024;
export const PDF_MAX_PAGES = 20;

export class RuleDraftPdfError extends Error {
  readonly code: RuleDraftIssueCode;

  constructor(code: RuleDraftIssueCode, message: string) {
    super(message);
    this.name = "RuleDraftPdfError";
    this.code = code;
  }
}

// Text PDFs only (D-10 scope, docs/LLM_EXECUTION.md): no OCR, so a scanned/
// image-only PDF yields PDF_NO_TEXT rather than a best-effort guess.
export async function extractPdfText(pdfBytes: Uint8Array): Promise<string> {
  if (pdfBytes.byteLength > PDF_MAX_BYTES) {
    throw new RuleDraftPdfError("PDF_TOO_LARGE", `PDF exceeds ${PDF_MAX_BYTES} bytes`);
  }

  // No `disableWorker` option exists in this pdfjs-dist version; in Node it
  // falls back to an in-process "fake worker" automatically when no
  // `GlobalWorkerOptions.workerSrc` is configured, which is what we want here.
  const loadingTask = getDocument({ data: pdfBytes });
  try {
    const document = await loadingTask.promise;

    if (document.numPages > PDF_MAX_PAGES) {
      throw new RuleDraftPdfError("PDF_TOO_LARGE", `PDF exceeds ${PDF_MAX_PAGES} pages`);
    }

    let text = "";
    for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
      const page = await document.getPage(pageNumber);
      const content = await page.getTextContent();
      const pageText = content.items.map((item) => ("str" in item ? item.str : "")).join(" ");
      text += (text ? "\n" : "") + pageText;
    }

    const trimmed = text.trim();
    if (!trimmed) {
      throw new RuleDraftPdfError("PDF_NO_TEXT", "PDF has no extractable text");
    }
    if (trimmed.length > INPUT_MAX_LENGTH) {
      throw new RuleDraftPdfError("INPUT_TOO_LONG", `Extracted text exceeds ${INPUT_MAX_LENGTH} characters`);
    }

    return trimmed;
  } finally {
    await loadingTask.destroy();
  }
}
