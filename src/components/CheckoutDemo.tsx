"use client";

import { Check, CreditCard, ShieldCheck, Tag, Truck } from "lucide-react";
import { FormEvent, useMemo, useState } from "react";

type CheckoutDemoProps = {
  compact?: boolean;
  initialAppliedCoupon?: string | null;
  initialCoupon?: string;
};

const cartItems = [
  { name: "Carbon running shell", meta: "Graphite / M", price: 148 },
  { name: "Trail flask set", meta: "2 pack", price: 34 },
  { name: "Priority shipping", meta: "Arrives tomorrow", price: 12 },
];

export function CheckoutDemo({
  compact = false,
  initialAppliedCoupon = null,
  initialCoupon = "",
}: CheckoutDemoProps) {
  const [coupon, setCoupon] = useState(initialCoupon);
  const [appliedCoupon, setAppliedCoupon] = useState<string | null>(initialAppliedCoupon);
  const [message, setMessage] = useState(
    initialAppliedCoupon === "SAVE20"
      ? "SAVE20 applied. Your total was updated."
      : "Enter SAVE20 to apply the customer coupon.",
  );

  const subtotal = cartItems.reduce((sum, item) => sum + item.price, 0);
  const discount = appliedCoupon === "SAVE20" ? Math.round(subtotal * 0.2) : 0;
  const total = subtotal - discount;

  const bugTriggered = appliedCoupon === "SAVE20";

  const activityLog = useMemo(() => {
    const base = ["cart_loaded", "payment_options_ready"];
    if (!appliedCoupon) return base;
    return [...base, "coupon_applied", "cart_total_updated", "checkout_cta_missing"];
  }, [appliedCoupon]);

  function applyCoupon(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const normalized = coupon.trim().toUpperCase();

    if (normalized === "SAVE20") {
      setAppliedCoupon(normalized);
      setMessage("SAVE20 applied. Your total was updated.");
      return;
    }

    setAppliedCoupon(null);
    setMessage("Coupon not recognized. Try SAVE20.");
  }

  return (
    <main
      className={`min-h-screen bg-[#f7f7f2] text-stone-950 ${compact ? "min-h-0 rounded-[28px]" : ""}`}
      data-testid="checkout-demo"
    >
      <div
        className={`mx-auto grid w-full max-w-6xl gap-6 px-4 py-5 sm:px-6 lg:grid-cols-[1fr_390px] ${
          compact ? "max-w-none p-4" : "min-h-screen lg:py-8"
        }`}
      >
        <section className="flex flex-col justify-between rounded-[26px] border border-stone-200 bg-white p-5 shadow-sm">
          <div>
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-700">
                  Trace sample merchant
                </p>
                <h1 className="mt-2 text-2xl font-semibold tracking-tight sm:text-4xl">
                  Checkout
                </h1>
              </div>
              <div className="flex h-11 w-11 items-center justify-center rounded-full bg-stone-950 text-white">
                <CreditCard size={20} aria-hidden="true" />
              </div>
            </div>

            <div className="mt-6 grid gap-3">
              {cartItems.map((item) => (
                <div
                  className="grid grid-cols-[1fr_auto] gap-3 rounded-2xl border border-stone-200 bg-stone-50 p-4"
                  key={item.name}
                >
                  <div>
                    <p className="font-medium">{item.name}</p>
                    <p className="mt-1 text-sm text-stone-500">{item.meta}</p>
                  </div>
                  <p className="font-semibold">${item.price}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="mt-6 grid gap-3 sm:grid-cols-3">
            {[
              { icon: ShieldCheck, label: "Secure payment" },
              { icon: Truck, label: "Fast shipping" },
              { icon: Check, label: "Easy returns" },
            ].map(({ icon: Icon, label }) => (
              <div
                className="flex items-center gap-2 rounded-2xl border border-stone-200 px-3 py-3 text-sm text-stone-600"
                key={label}
              >
                <Icon className="text-emerald-700" size={16} aria-hidden="true" />
                <span>{label}</span>
              </div>
            ))}
          </div>
        </section>

        <aside className="rounded-[26px] border border-stone-200 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">Order summary</h2>
            <span className="rounded-full bg-stone-100 px-3 py-1 text-xs font-medium text-stone-600">
              Mobile repro
            </span>
          </div>

          <form className="mt-5 grid gap-3" onSubmit={applyCoupon}>
            <label className="text-sm font-medium" htmlFor="coupon">
              Coupon
            </label>
            <div className="grid grid-cols-[1fr_auto] gap-2">
              <input
                className="h-11 min-w-0 rounded-xl border border-stone-300 bg-white px-3 text-sm outline-none transition focus:border-emerald-700 focus:ring-4 focus:ring-emerald-100"
                data-testid="coupon-input"
                id="coupon"
                onChange={(event) => setCoupon(event.target.value)}
                placeholder="SAVE20"
                value={coupon}
              />
              <button
                className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-stone-950 px-4 text-sm font-semibold text-white transition hover:bg-stone-800"
                data-testid="apply-coupon"
                type="submit"
              >
                <Tag size={16} aria-hidden="true" />
                Apply
              </button>
            </div>
            <p className="text-sm text-stone-500" data-testid="coupon-message">
              {message}
            </p>
          </form>

          <div className="mt-6 space-y-3 border-t border-stone-200 pt-5 text-sm">
            <div className="flex justify-between">
              <span className="text-stone-500">Subtotal</span>
              <span>${subtotal}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-stone-500">Discount</span>
              <span className={discount > 0 ? "text-emerald-700" : ""}>
                {discount > 0 ? `-$${discount}` : "$0"}
              </span>
            </div>
            <div className="flex justify-between text-base font-semibold">
              <span>Total</span>
              <span data-testid="cart-total">${total}</span>
            </div>
          </div>

          <div
            className="mt-6 rounded-2xl border border-dashed border-stone-300 bg-stone-50 p-3"
            data-testid="checkout-action-zone"
          >
            <p className="mb-3 text-xs font-medium uppercase tracking-[0.16em] text-stone-500">
              Payment action
            </p>
            <button
              className={`inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-emerald-700 px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-800 ${
                bugTriggered ? "max-sm:hidden" : ""
              }`}
              data-testid="checkout-button"
              type="button"
            >
              <CreditCard size={17} aria-hidden="true" />
              Continue to payment
            </button>
            {bugTriggered ? (
              <p
                className="mt-3 hidden text-sm font-medium text-stone-500 max-sm:block"
                data-testid="mobile-checkout-help"
              >
                Review your order details before continuing.
              </p>
            ) : null}
          </div>

          <div className="mt-5 rounded-2xl bg-stone-950 p-4 font-mono text-xs leading-6 text-stone-100">
            {activityLog.map((entry) => (
              <div key={entry}>
                <span className="text-emerald-300">event</span> {entry}
              </div>
            ))}
          </div>
        </aside>
      </div>
    </main>
  );
}
