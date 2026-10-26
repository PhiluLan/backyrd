import "server-only";
import { extractText, getDocumentProxy } from "unpdf";
/** Text-only PDF processing: no external resources, scripts, or attachments. */
export async function readResearchPdf(body: Uint8Array): Promise<string> {
  if (body.byteLength > 10_000_000) throw new Error("research_pdf_too_large");
  const options = {
    isEvalSupported: false,
    useSystemFonts: false,
    maxImageSize: 1,
  };
  const pdf = await getDocumentProxy(body, options);
  const timer = setTimeout(() => {
    void pdf.loadingTask.destroy();
  }, 12000);
  try {
    if (pdf.numPages > 40) throw new Error("research_pdf_too_many_pages");
    const result = await extractText(pdf, { mergePages: true });
    if (!result.text.trim() || result.text.length > 300000)
      throw new Error("research_pdf_unreadable");
    return result.text;
  } finally {
    clearTimeout(timer);
    await pdf.loadingTask.destroy();
  }
}
