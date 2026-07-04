"use client";

import { Building2, FileText, Timer } from "lucide-react";
import { useState } from "react";
import { enterpriseEvidence, enterpriseScenarioMeta } from "@/lib/enterprise-evidence";

type Scenario = "ecommerce" | "enterprise";

const ecommerceSignal = {
  quote:
    "Checkout button disappears on mobile after I apply my coupon code. Happens every time on my phone but works fine on desktop.",
  device:   "iPhone 15 Safari",
  viewport: "390×844 mobile",
  trigger:  "Coupon SAVE20",
  impact:   "Checkout blocked",
  logs:     ["coupon_applied", "cart_total_updated", "checkout_cta_missing"],
};

export function ScenarioSwitcher() {
  const [scenario, setScenario] = useState<Scenario>("ecommerce");

  const isEnterprise = scenario === "enterprise";

  return (
    <div className="grid gap-3">
      {/* Scenario toggle */}
      <div className="rounded-[22px] border border-stone-200 bg-white p-4 shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-stone-500">
          Demo scenario
        </p>
        <div className="mt-3 grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => setScenario("ecommerce")}
            className={`rounded-xl px-3 py-2 text-xs font-semibold transition ${
              !isEnterprise
                ? "bg-stone-950 text-white"
                : "border border-stone-200 text-stone-600 hover:bg-stone-50"
            }`}
          >
            <div className="flex items-center justify-center gap-1.5">
              <FileText size={12} aria-hidden="true" />
              E-commerce
            </div>
          </button>
          <button
            type="button"
            onClick={() => setScenario("enterprise")}
            className={`rounded-xl px-3 py-2 text-xs font-semibold transition ${
              isEnterprise
                ? "bg-stone-950 text-white"
                : "border border-stone-200 text-stone-600 hover:bg-stone-50"
            }`}
          >
            <div className="flex items-center justify-center gap-1.5">
              <Building2 size={12} aria-hidden="true" />
              Enterprise
            </div>
          </button>
        </div>

        {isEnterprise && (
          <div className="mt-3 rounded-2xl bg-amber-50 p-3 text-xs leading-5 text-amber-800">
            <span className="font-semibold">{enterpriseScenarioMeta.title}</span>
            {" - "}
            {enterpriseScenarioMeta.subtitle}
            <span className="ml-2 rounded-full bg-amber-200 px-2 py-0.5 text-[10px] font-semibold text-amber-900">
              Conduct AI {enterpriseScenarioMeta.bounty}
            </span>
          </div>
        )}
      </div>

      {/* Signal card */}
      <section className="rounded-[22px] border border-stone-200 bg-white p-5 shadow-sm">
        <div className="flex items-center gap-2">
          {isEnterprise ? (
            <Building2 className="text-emerald-700" size={18} aria-hidden="true" />
          ) : (
            <FileText className="text-emerald-700" size={18} aria-hidden="true" />
          )}
          <h2 className="font-semibold">
            {isEnterprise ? "Enterprise incident" : "Customer signal"}
          </h2>
        </div>
        <blockquote className="mt-4 rounded-2xl bg-stone-50 p-4 text-sm leading-6 text-stone-700">
          &quot;
          {isEnterprise
            ? enterpriseEvidence.customerReport
            : ecommerceSignal.quote}
          &quot;
        </blockquote>
        <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
          <div className="rounded-2xl bg-stone-50 p-3">
            <dt className="text-stone-500">System</dt>
            <dd className="mt-1 font-medium">
              {isEnterprise ? "SAP ERP / iOS Approver" : ecommerceSignal.device}
            </dd>
          </div>
          <div className="rounded-2xl bg-stone-50 p-3">
            <dt className="text-stone-500">Viewport</dt>
            <dd className="mt-1 font-medium">
              {isEnterprise ? enterpriseEvidence.viewport : ecommerceSignal.viewport}
            </dd>
          </div>
          <div className="rounded-2xl bg-stone-50 p-3">
            <dt className="text-stone-500">Trigger</dt>
            <dd className="mt-1 font-medium">
              {isEnterprise ? enterpriseEvidence.coupon : ecommerceSignal.trigger}
            </dd>
          </div>
          <div className="rounded-2xl bg-red-50 p-3">
            <dt className="text-red-700">Impact</dt>
            <dd className="mt-1 font-medium text-red-800">
              {isEnterprise
                ? "Procurement blocked"
                : ecommerceSignal.impact}
            </dd>
          </div>
        </dl>

        {isEnterprise && (
          <div className="mt-3 grid gap-1.5">
            <p className="text-xs font-semibold text-stone-500 uppercase tracking-[0.14em]">Dependency chain</p>
            <div className="rounded-2xl bg-stone-50 p-3 text-xs font-mono text-stone-700 leading-6">
              pricing_matrix_config<br />
              → tier_validation_service<br />
              → order_approval_ui<br />
              → approval_cta_visibility
            </div>
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div className="rounded-xl bg-stone-100 px-3 py-2">
                <span className="text-stone-500">Without Trace: </span>
                <span className="font-semibold text-red-700">3–6 weeks</span>
              </div>
              <div className="rounded-xl bg-emerald-50 px-3 py-2">
                <span className="text-stone-500">With Trace: </span>
                <span className="font-semibold text-emerald-700">&lt; 5 min</span>
              </div>
            </div>
          </div>
        )}
      </section>

      {/* Evidence feed */}
      <section className="rounded-[22px] border border-stone-200 bg-white p-5 shadow-sm">
        <div className="flex items-center gap-2">
          <Timer className="text-emerald-700" size={18} aria-hidden="true" />
          <h2 className="font-semibold">Evidence feed</h2>
        </div>
        <div className="mt-4 rounded-2xl bg-stone-950 p-4 font-mono text-xs leading-6 text-stone-100">
          {(isEnterprise ? enterpriseEvidence.logs : ecommerceSignal.logs).map((event) => (
            <div key={event}>
              <span className="text-emerald-300">event</span> {event}
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
