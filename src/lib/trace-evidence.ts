export type TraceEvidence = {
  customerReport: string;
  environment: string;
  coupon: string;
  severity: string;
  screenshotSummary: string;
  logs: string[];
  checkoutRoute: string;
  viewport: string;
  selectors: {
    couponInput: string;
    applyCoupon: string;
    checkoutButton: string;
    cartTotal: string;
  };
  suspectedFile: string;
};

export const traceEvidence: TraceEvidence = {
  customerReport: "Checkout button disappears on mobile after I apply my coupon.",
  environment: "iPhone 15 / Safari / 390x844",
  coupon: "SAVE20",
  severity: "Checkout blocked",
  screenshotSummary:
    "Mobile checkout screenshot shows the order summary and payment action area, but the primary Continue to payment button is missing after the discount is applied.",
  logs: ["coupon_applied", "cart_total_updated", "checkout_cta_missing"],
  checkoutRoute: "/checkout",
  viewport: "390x844",
  selectors: {
    couponInput: "coupon-input",
    applyCoupon: "apply-coupon",
    checkoutButton: "checkout-button",
    cartTotal: "cart-total",
  },
  suspectedFile: "src/components/CheckoutDemo.tsx",
};

export function formatEvidenceForPrompt(evidence: TraceEvidence) {
  return [
    `Customer report: ${evidence.customerReport}`,
    `Environment: ${evidence.environment}`,
    `Coupon: ${evidence.coupon}`,
    `Severity: ${evidence.severity}`,
    `Screenshot summary: ${evidence.screenshotSummary}`,
    `Logs: ${evidence.logs.join(", ")}`,
    `Checkout route: ${evidence.checkoutRoute}`,
    `Viewport: ${evidence.viewport}`,
    `Selectors: ${JSON.stringify(evidence.selectors)}`,
    `Suspected file: ${evidence.suspectedFile}`,
  ].join("\n");
}
