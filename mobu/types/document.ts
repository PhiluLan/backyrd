export type DocumentKind = 'invoice' | 'receipt' | 'contract' | 'warranty';
export type DocumentStatus = 'open' | 'paid' | 'active' | 'archived';
export type DocumentCategory =
  | 'Wohnen'
  | 'Kommunikation'
  | 'Lebensmittel'
  | 'Mobilität'
  | 'Versicherung'
  | 'Einkäufe'
  | 'Sonstiges';

export type MobuDocument = {
  id: string;
  title: string;
  sender: string;
  kind: DocumentKind;
  status: DocumentStatus;
  category: DocumentCategory;
  amount?: number;
  currency: 'CHF' | 'EUR';
  documentDate: string;
  dueDate?: string;
  fileName: string;
  sourceUri?: string;
  confidence: number;
  createdAt: string;
};

export type DocumentDraft = Omit<MobuDocument, 'id' | 'createdAt'>;
