import { describe, expect, it } from "vitest";
import {
  analysisReportBodySchema,
  analysisReportDisclaimer,
  analysisReportDisclaimerFor,
  validateReportSafety
} from "./analysisReportPolicy.js";
import type { AnalysisReportBody } from "../types/domain.js";

const baseReport: AnalysisReportBody = {
  summary: "財務データに基づく調査メモです。",
  growth: "売上高の推移を確認します。",
  profitability: "営業利益率を確認します。",
  stability: "自己資本比率を確認します。",
  risks: ["外部APIの取得範囲に制約があります。"],
  checkpoints: ["次回決算を確認します。"],
  evidence: [{ label: "営業利益", period: "2026-03-31", value: 100, source: "mock / financial_statements" }],
  dataLimitations: ["Mock Providerのサンプルデータを使用しています。"],
  disclaimer: analysisReportDisclaimer
};

describe("analysis report policy", () => {
  it("accepts the required structured output shape", () => {
    expect(analysisReportBodySchema.parse(baseReport)).toEqual(baseReport);
  });

  it("rejects reports missing the disclaimer", () => {
    const { disclaimer: _disclaimer, ...missingDisclaimer } = baseReport;
    expect(() => analysisReportBodySchema.parse(missingDisclaimer)).toThrow();
  });

  it("detects prohibited investment advice wording", () => {
    const unsafe = {
      ...baseReport,
      summary: "この銘柄は買い推奨です。"
    };

    expect(validateReportSafety(unsafe)).toEqual({ ok: false, flags: ["買い推奨"] });
    expect(validateReportSafety(baseReport)).toEqual({ ok: true, flags: [] });
  });

  it("supports English disclaimer and prohibited wording checks", () => {
    const unsafe = {
      ...baseReport,
      summary: "This includes a target price.",
      disclaimer: analysisReportDisclaimerFor("en")
    };

    expect(unsafe.disclaimer).toBe("This report is not investment advice.");
    expect(validateReportSafety(unsafe)).toEqual({ ok: false, flags: ["target price"] });
  });
});
