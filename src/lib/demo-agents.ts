export type AgentStatus = "idle" | "running" | "complete" | "blocked";

export type AgentId =
  | "triage"
  | "vision"
  | "log"
  | "repro"
  | "code"
  | "maintainer";

export type AgentIcon =
  | "bot"
  | "camera"
  | "file-search"
  | "monitor"
  | "code"
  | "git-pull-request";

export type AgentDefinition = {
  id: AgentId;
  name: string;
  role: string;
  icon: AgentIcon;
  latencyMs: number;
  runningOutput: string[];
  finding: string;
  evidence: string[];
};

export type AgentResult = AgentDefinition & {
  status: AgentStatus;
  source?: "cerebras" | "gemini" | "openai" | "venice";
  error?: string;
  confidence?: number;
  liveOutput?: string[];
};

export type HandoffItem = {
  label: string;
  value: string;
};

export const demoAgents: AgentDefinition[] = [
  {
    id: "triage",
    name: "Triage Agent",
    role: "Impact and severity extraction",
    icon: "bot",
    latencyMs: 350,
    runningOutput: [
      "reading customer report",
      "extracting severity and affected device",
      "mapping business impact",
    ],
    finding: "Customer is blocked from checkout after applying SAVE20 on mobile Safari.",
    evidence: ["Severity: checkout blocked", "Device: iPhone 15 / Safari / 390x844"],
  },
  {
    id: "vision",
    name: "Vision Agent",
    role: "Screenshot interpretation",
    icon: "camera",
    latencyMs: 520,
    runningOutput: [
      "scanning mobile viewport",
      "checking expected CTA region",
      "comparing screenshot to checkout affordance",
    ],
    finding: "The payment action area is present, but the primary checkout CTA is missing.",
    evidence: ["Broken mobile screenshot", "Expected button: Continue to payment"],
  },
  {
    id: "log",
    name: "Log Agent",
    role: "Client event correlation",
    icon: "file-search",
    latencyMs: 410,
    runningOutput: [
      "ordering client events",
      "linking coupon update to CTA state",
      "isolating missing action signal",
    ],
    finding: "The coupon and cart total update succeeded immediately before checkout_cta_missing.",
    evidence: ["coupon_applied", "cart_total_updated", "checkout_cta_missing"],
  },
  {
    id: "repro",
    name: "Repro Agent",
    role: "Sandbox reproduction plan",
    icon: "monitor",
    latencyMs: 650,
    runningOutput: [
      "building sandbox script",
      "selecting mobile viewport",
      "binding selectors for replay",
    ],
    finding: "Use /checkout at 390x844, apply SAVE20, then assert checkout-button visibility.",
    evidence: ["Route: /checkout", "Viewport: 390x844", "Selector: checkout-button"],
  },
  {
    id: "code",
    name: "Code Agent",
    role: "Likely source localization",
    icon: "code",
    latencyMs: 700,
    runningOutput: [
      "localizing checkout component",
      "tracing applied coupon state",
      "checking breakpoint-dependent classes",
    ],
    finding: "The defect is isolated to the checkout action rendering in CheckoutDemo.tsx.",
    evidence: ["Component: CheckoutDemo", "State: appliedCoupon", "Breakpoint: max-sm"],
  },
  {
    id: "maintainer",
    name: "Maintainer Agent",
    role: "Engineering handoff synthesis",
    icon: "git-pull-request",
    latencyMs: 900,
    runningOutput: [
      "combining agent findings",
      "drafting maintainer summary",
      "preparing repro handoff",
    ],
    finding: "Create a high-priority issue with deterministic repro steps and patch target.",
    evidence: ["Issue-ready summary", "Owner: checkout UI", "Next: sandbox repro"],
  },
];

export const agentExecutionWaves: AgentId[][] = [
  ["triage", "vision", "log"],
  ["repro", "code"],
  ["maintainer"],
];

export const finalHandoff: HandoffItem[] = [
  {
    label: "Issue title",
    value: "Checkout CTA disappears on mobile after applying SAVE20",
  },
  {
    label: "Severity",
    value: "High - customer cannot complete payment on affected mobile viewport",
  },
  {
    label: "Repro hypothesis",
    value: "Coupon state applies a mobile-only hidden style to the checkout button.",
  },
  {
    label: "Suspected component",
    value: "src/components/CheckoutDemo.tsx",
  },
  {
    label: "Next action",
    value: "Launch Playwright sandbox repro at 390x844 and verify checkout-button visibility.",
  },
];

export function createInitialAgentResults(): AgentResult[] {
  return demoAgents.map((agent) => ({
    ...agent,
    status: "idle",
    source: undefined,
    error: undefined,
    confidence: undefined,
    liveOutput: [],
  }));
}
