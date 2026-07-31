import { DocumentDraft } from '@/types/document';

type AnalyzeInput = {
  fileName: string;
  sourceUri?: string;
};

export async function analyzeDocument(input: AnalyzeInput): Promise<DocumentDraft> {
  await new Promise((resolve) => setTimeout(resolve, 1400));

  return {
    title: 'Swisscom Rechnung',
    sender: 'Swisscom AG',
    kind: 'invoice',
    status: 'open',
    category: 'Kommunikation',
    amount: 129.9,
    currency: 'CHF',
    documentDate: '2026-07-29',
    dueDate: '2026-08-18',
    fileName: input.fileName,
    sourceUri: input.sourceUri,
    confidence: 0.96,
  };
}
