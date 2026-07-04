/**
 * enterprise-evidence.ts
 *
 * Enterprise scenario evidence - Conduct Track "Make Legacy Move"
 *
 * This scenario represents a realistic enterprise problem: a pricing
 * configuration change in an ERP/SAP-style system that breaks downstream
 * order processing logic. The kind of change that typically takes weeks
 * of consultant time to diagnose and patch.
 *
 * Trace compresses this from weeks → minutes.
 */

import type { TraceEvidence } from "@/lib/trace-evidence";

export const enterpriseEvidence: TraceEvidence = {
  customerReport:
    "Order management system rejects purchase orders after the new tiered pricing config was deployed. " +
    "All POs with quantity > 100 units fail validation with ERR_PRICE_MATRIX_MISMATCH on the mobile approval workflow.",
  environment:    "SAP ERP - Production / Mobile Approver App / iOS Safari",
  coupon:         "TIER_BULK_100",
  severity:       "Critical - procurement blocked across 3 business units",
  screenshotSummary:
    "Mobile approval screenshot shows the PO summary and line items, but the Approve button is hidden after " +
    "the pricing matrix validation triggers. The desktop workflow shows the button correctly.",
  logs: [
    "pricing_matrix_loaded",
    "tier_validation_triggered",
    "approval_cta_suppressed",
  ],
  checkoutRoute:   "/checkout",
  viewport:        "390x844",
  selectors: {
    couponInput:    "coupon-input",
    applyCoupon:    "apply-coupon",
    checkoutButton: "checkout-button",
    cartTotal:      "cart-total",
  },
  suspectedFile: "src/components/CheckoutDemo.tsx",
};

export const enterpriseHandoffItems = [
  {
    label: "Issue title",
    value: "Mobile approval CTA suppressed after tiered pricing config deployment",
  },
  {
    label: "Severity",
    value: "Critical - procurement blocked across 3 business units",
  },
  {
    label: "Institutional context",
    value:
      "The TIER_BULK_100 pricing rule was added in the March config migration. " +
      "The mobile approval UI inherits a max-sm:hidden class originally introduced for a 2019 layout refresh " +
      "and was never cleaned up when the pricing validation layer was added.",
  },
  {
    label: "Dependency mapping",
    value:
      "pricing_matrix_config → tier_validation_service → order_approval_ui → approval_cta_visibility",
  },
  {
    label: "Patch target",
    value: "src/components/CheckoutDemo.tsx - remove conditional max-sm:hidden from approval CTA",
  },
  {
    label: "Estimated consultant time (before Trace)",
    value: "3–6 weeks: requirements gathering, impact analysis, dev, UAT, deployment",
  },
  {
    label: "Trace resolution time",
    value: "< 5 minutes: automated triage, visual analysis, Playwright repro, verified patch, PR",
  },
];

export const enterpriseScenarioMeta = {
  title:       "Enterprise Legacy Modernization",
  subtitle:    "SAP-style pricing config change → approval workflow regression",
  sponsor:     "Conduct AI",
  bounty:      "£8,000",
  description:
    "Large enterprises run on custom software built up over decades. " +
    "When business rules change - a new pricing tier, a new regulation, a new market - " +
    "the software must change too. But that software is millions of lines deep with little documentation. " +
    "Trace reads the code, maps dependencies, captures institutional knowledge, and delivers a verified patch.",
};
