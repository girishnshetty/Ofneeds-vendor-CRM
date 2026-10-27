import { useEffect, useRef, useState } from "react";
import { useCRM } from "./context";
import { Icon } from "./ui";
const steps = [
  [
    "Welcome to a more connected workspace",
    "Your vendor network, brands, products and sourcing activity work together here. Let’s take a look around.",
    "dashboard",
    "metrics",
  ],
  [
    "Your network at a glance",
    "These metrics are calculated from stored records. Explore vendors, brands, pending verifications and follow-ups. Demo numbers are fictional sample data.",
    "dashboard",
    "metrics",
  ],
  [
    "Find the right connection",
    "Search companies, contacts or brands. Combine city, category and relationship filters, then save your favorite view. Add vendor opens the working six-step wizard.",
    "vendors",
    "vendor-directory",
  ],
  [
    "Know who supplies what",
    "Find vendors associated with a brand. Authorized, unverified and expired are recorded relationships; review supporting evidence before relying on them.",
    "brands",
    "brands",
  ],
  [
    "Everything behind the relationship",
    "A vendor profile brings contacts, addresses, brands, product pricing, commercial terms, documents and follow-up history together.",
    "vendors",
    "vendor-profile",
  ],
  [
    "Compare the details that matter",
    "Open a product to compare supplier prices, MOQ, stock and lead times. All demonstration quotations are fictional.",
    "products",
    "products",
  ],
  [
    "Make sourcing decisions with clarity",
    "Create an RFQ with a product, quantity, deadline and selected suppliers. Save a brief and review recorded pricing. No messages are sent automatically.",
    "rfqs",
    "rfqs",
  ],
  [
    "Keep the conversation moving",
    "Schedule a supplier call or follow-up. Complete a task when it’s done and keep your next conversation on track.",
    "follow-ups",
    "tasks",
  ],
  [
    "A clearer view of your network",
    "Explore category and location coverage, brand relationships, RFQ status and activity trends. Export a report for your next sourcing review.",
    "reports",
    "page-content",
  ],
  [
    "You’re ready to organize your vendor network.",
    "Create your own empty workspace, or keep exploring this one. You can replay this walkthrough anytime from the Help or profile menu.",
    "dashboard",
    "metrics",
  ],
];
export function GuidedTour({
  step,
  setStep,
}: {
  step: number;
  setStep: (step: number | null) => void;
}) {
  const c = useCRM(),
    panel = useRef<HTMLDivElement>(null),
    [rect, setRect] = useState<DOMRect | null>(null),
    [paused, setPaused] = useState(false);
  const title = steps[step][0],
    copy = steps[step][1];
  useEffect(() => {
    const previous = document.activeElement as HTMLElement;
    panel.current?.focus();
    return () => previous?.focus();
  }, []);
  useEffect(() => {
    const [, , page] = steps[step];
    if (step === 4 && c.options.vendors.length)
      c.go("vendors", c.options.vendors[0].id);
    else c.go(page);
    setPaused(false);
  }, [step]);
  useEffect(() => {
    let frame = 0,
      attempt = 0,
      found: Element | null = null;
    const find = () => {
      found =
        steps[step][3] === "page-content"
          ? document.getElementById("page-content")
          : document.querySelector(`[data-tour="${steps[step][3]}"]`);
      if (!found) found = document.getElementById("page-content");
      if (found) {
        if (attempt === 0)
          found.scrollIntoView({ block: "center", behavior: "instant" });
        setRect(found.getBoundingClientRect());
      }
      if (attempt++ < 12) frame = requestAnimationFrame(find);
    };
    frame = requestAnimationFrame(find);
    const resize = () => {
      if (found) setRect(found.getBoundingClientRect());
    };
    window.addEventListener("resize", resize);
    window.addEventListener("scroll", resize, true);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("resize", resize);
      window.removeEventListener("scroll", resize, true);
    };
  }, [step, c.page, c.recordId, c.options]);
  const close = () => {
    sessionStorage.setItem("ofneeds-crm.tour.step", String(step));
    setStep(null);
  };
  return (
    <div className="tour-layer">
      <div className="tour-shield" />
      {rect && !paused && (
        <div
          className="tour-highlight"
          style={{
            left: Math.max(4, rect.left - 6),
            top: Math.max(4, rect.top - 6),
            width: Math.min(rect.width + 12, window.innerWidth - 8),
            height: Math.min(rect.height + 12, window.innerHeight - 8),
          }}
        />
      )}
      <div
        ref={panel}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby="tour-title"
        className="tour-panel"
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            e.preventDefault();
            close();
          }
          if (e.key === "Tab") {
            const nodes =
              panel.current?.querySelectorAll<HTMLElement>("button,a");
            if (nodes?.length) {
              const first = nodes[0],
                last = nodes[nodes.length - 1];
              if (e.shiftKey && document.activeElement === first) {
                e.preventDefault();
                last.focus();
              } else if (!e.shiftKey && document.activeElement === last) {
                e.preventDefault();
                first.focus();
              }
            }
          }
        }}
      >
        <div className="tour-top">
          <span>
            <Icon name="Compass" size={17} /> YOUR PRODUCT WALKTHROUGH
          </span>
          <button aria-label="Exit walkthrough" onClick={close}>
            <Icon name="X" size={17} />
          </button>
        </div>
        <div className="tour-progress">
          {steps.map((_, i) => (
            <span key={i} className={i <= step ? "complete" : ""} />
          ))}
        </div>
        <span className="eyebrow">
          STEP {step + 1} OF {steps.length}
        </span>
        <h2 id="tour-title">{paused ? "Tour paused" : title}</h2>
        <p>
          {paused
            ? "Resume when you’re ready, or exit and replay from the Help menu."
            : copy}
        </p>
        {step === 9 ? (
          <div className="tour-actions">
            <a
              data-route
              className="button primary"
              href="/signup"
              onClick={() => setStep(null)}
            >
              Create your workspace
              <Icon name="ArrowRight" size={16} />
            </a>
            <button className="button outline" onClick={() => setStep(null)}>
              Explore further
            </button>
          </div>
        ) : (
          <div className="tour-actions">
            <button className="button ghost small" onClick={close}>
              Skip tour
            </button>
            <span className="spacer" />
            <button
              disabled={step === 0}
              className="button outline small"
              onClick={() => setStep(step - 1)}
            >
              Previous
            </button>
            <button
              className="button primary small"
              onClick={() => (paused ? setPaused(false) : setStep(step + 1))}
            >
              {paused ? "Resume" : "Next"}
              <Icon name="ArrowRight" size={15} />
            </button>
          </div>
        )}
        <div className="tour-bottom">
          <button onClick={() => setStep(0)}>
            <Icon name="RotateCcw" size={13} />
            Restart
          </button>
          <button onClick={() => setPaused(!paused)}>
            <Icon name={paused ? "Play" : "Pause"} size={13} />
            {paused ? "Resume" : "Pause"}
          </button>
          <span>Esc to exit</span>
        </div>
      </div>
    </div>
  );
}
