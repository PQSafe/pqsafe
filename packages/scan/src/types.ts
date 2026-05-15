export type Severity = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' | 'INFO';
export type Status = 'FAIL' | 'WARN' | 'PASS';
export type Grade = 'A+' | 'A' | 'B' | 'C' | 'D' | 'F';

export interface Finding {
  id: string;
  name: string;
  severity: Severity;
  status: Status;
  message: string;
  line?: number;
  snippet?: string;
  fix: string;
  docs?: string;
}

export interface ScanInput {
  code: string;
  filename?: string;
  framework?: 'langchain' | 'autogen' | 'crewai' | 'llamaindex' | 'generic';
}

export interface ScanReport {
  grade: Grade;
  score: number;
  passed: number;
  failed: number;
  findings: Finding[];
  summary: string;
  scannedAt: string;
  filename?: string;
  framework?: string;
}

export interface Check {
  id: string;
  name: string;
  run(input: ScanInput): Finding[];
}
