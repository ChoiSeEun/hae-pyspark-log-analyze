export interface TableColumn {
  name: string;
  type: string;
  description?: string;
}

export interface TableSchema {
  id: string;
  name: string;
  columns: TableColumn[];
  description?: string;
}

export interface AnalysisRequest {
  errorLog: string;
  code: string;
  referenceTableId: string;
  customSchema?: TableSchema;
}

export interface AnalysisResponse {
  isInfrastructureError: boolean;
  message?: string; // Standard message for infra errors or general fallback
  errorSummary?: string; // High-level concise explanation of the error
  correctedCode?: string; // Complete corrected code snippet
  explanation?: string; // Detailed breakdown of fixes and precautions
  schemaAnalysis?: string; // Evaluation of columns/types compared to selected table schema
}

export interface HistoryItem {
  id: string;
  timestamp: string;
  errorLog: string;
  code: string;
  referenceTableId: string;
  response: AnalysisResponse;
}
