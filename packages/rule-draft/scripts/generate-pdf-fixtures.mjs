// Regenerates the PDF test fixtures used by test/pdf.test.ts. Run with:
//   node packages/rule-draft/scripts/generate-pdf-fixtures.mjs
//
// No Korean font on this machine can be embedded by pdfkit (the only system
// Korean font, AppleSDGothicNeo.ttc, is a TrueType Collection that pdfkit's
// subsetter rejects: "this.font.createSubset is not a function"). The text
// PDF below is therefore an English synthetic rider, unlike the Korean
// fixtures/synthetic-rider.txt used by draft.test.ts. This only exercises PDF
// text extraction plumbing (src/pdf.ts), not language-specific behavior.
import PDFDocument from "pdfkit";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const fixturesDir = path.join(here, "..", "test", "fixtures");
fs.mkdirSync(fixturesDir, { recursive: true });

async function writePdf(fileName, render) {
  const doc = new PDFDocument();
  const outPath = path.join(fixturesDir, fileName);
  const stream = fs.createWriteStream(outPath);
  doc.pipe(stream);
  render(doc);
  doc.end();
  await new Promise((resolve, reject) => {
    stream.on("finish", resolve);
    stream.on("error", reject);
  });
  return outPath;
}

await writePdf("synthetic-rider.pdf", (doc) => {
  doc
    .fontSize(14)
    .text(
      "Safe driving rider (synthetic, English placeholder): cumulative distance at least " +
        "100km, final score at least 80 points, 10% premium discount. Speeding: 2 points per " +
        "event. Hard braking: 3 points per event.",
    );
});

await writePdf("no-text.pdf", () => {
  // Intentionally empty page: no doc.text(...) call, so pdfjs extracts "".
});
