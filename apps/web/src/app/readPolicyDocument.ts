import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";

const supportedExtensions = [".pdf", ".docx", ".txt", ".md"];

export async function readPolicyDocument(file: File): Promise<string> {
  const extension = file.name.slice(file.name.lastIndexOf(".")).toLowerCase();
  if (!supportedExtensions.includes(extension)) {
    throw new Error("PDF, DOCX, TXT, MD 문서만 올릴 수 있습니다.");
  }
  if (file.size > 10 * 1024 * 1024) {
    throw new Error("10MB 이하 문서를 올려 주세요.");
  }

  if (extension === ".txt" || extension === ".md") return file.text();
  if (extension === ".docx") {
    const mammoth = await import("mammoth");
    const result = await mammoth.extractRawText({ arrayBuffer: await file.arrayBuffer() });
    return result.value.trim();
  }

  const pdfjs = await import("pdfjs-dist");
  pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;
  const task = pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) });
  const pdf = await task.promise;
  try {
    const pages: string[] = [];
    for (let number = 1; number <= pdf.numPages; number += 1) {
      const page = await pdf.getPage(number);
      const content = await page.getTextContent();
      pages.push(content.items.map((item) => "str" in item ? item.str : "").join(" ").trim());
    }
    return pages.filter(Boolean).join("\n\n");
  } finally {
    await task.destroy();
  }
}
