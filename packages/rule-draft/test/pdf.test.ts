import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { extractPdfText, PDF_MAX_BYTES, PDF_MAX_PAGES, RuleDraftPdfError } from "../src/pdf.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const fixturesDir = path.join(here, "fixtures");

function readFixture(fileName: string): Uint8Array {
  return new Uint8Array(fs.readFileSync(path.join(fixturesDir, fileName)));
}

describe("extractPdfText", () => {
  it("텍스트 PDF에서 본문을 추출한다", async () => {
    const text = await extractPdfText(readFixture("synthetic-rider.pdf"));
    expect(text).toContain("Safe driving rider");
    expect(text).toContain("100km");
    expect(text).toContain("80 points");
  });

  it("텍스트가 없는 PDF는 PDF_NO_TEXT로 실패한다", async () => {
    let error: unknown;
    try {
      await extractPdfText(readFixture("no-text.pdf"));
    } catch (caught) {
      error = caught;
    }
    expect(error).toBeInstanceOf(RuleDraftPdfError);
    expect((error as RuleDraftPdfError).code).toBe("PDF_NO_TEXT");
  });

  it("바이트 한도를 넘으면 PDF_TOO_LARGE로 실패한다", async () => {
    const oversized = new Uint8Array(PDF_MAX_BYTES + 1);
    let error: unknown;
    try {
      await extractPdfText(oversized);
    } catch (caught) {
      error = caught;
    }
    expect(error).toBeInstanceOf(RuleDraftPdfError);
    expect((error as RuleDraftPdfError).code).toBe("PDF_TOO_LARGE");
  });

  it("PDF가 아닌 바이트열은 오류를 던진다(코드 없음, 일반 오류)", async () => {
    const garbage = new TextEncoder().encode("this is not a pdf file");
    await expect(extractPdfText(garbage)).rejects.not.toBeInstanceOf(RuleDraftPdfError);
  });

  it("PDF_MAX_PAGES 상수는 P1-2 제안값(20)과 일치한다", () => {
    expect(PDF_MAX_PAGES).toBe(20);
  });
});
