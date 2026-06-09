// src/types/Verdict.ts
// Mirrors VerifAI's existing verdict shape exactly
// Do not change field names — Quill calls VerifAI over HTTP
// and deserializes directly into this type

export type VerdictResult = "EXECUTE" | "WARNING" | "BLOCKED";

export type RiskLevel = "NONE" | "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";

export type Finding = {
  check: string;
  severity: RiskLevel;
  message: string;
};

export type Verdict = {
  verdict: VerdictResult;
  riskLevel: RiskLevel;
  summary: string;
  recommendation: string;
  details: string[];
  layers: {
    intentComparison: {
      passed: boolean;
      issues: string[];
    };
    securityLinter: {
      riskLevel: RiskLevel;
      findings: Finding[];
    };
  };
};
