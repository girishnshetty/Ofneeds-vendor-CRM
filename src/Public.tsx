import { useState } from "react";
import { api } from "./client";
import type { User } from "./types";
import { Icon, Logo, Field, Avatar, Badge } from "./ui";
export const helpTopics = [
  [
    "Getting started",
    "Create a workspace, complete your company profile, then add a vendor and a brand. The setup checklist tracks your actual records and can be resumed anytime.",
  ],
  [
    "Add a vendor",
    "Open Vendors → Add vendor. The six-step wizard collects company, contact, address, brands and commercial details. Save a draft at any step; review the summary before saving.",
  ],
  [
    "Manage brands",
    "Create a brand, then assign it in the vendor wizard or profile. Authorization is a recorded relationship, not an automatic certification. Add supporting documents and review expiry dates.",
  ],
  [
    "Import Excel",
    "Use Import / export to upload .xlsx or .csv with name, city, email, contact, category and state headers. Preview and validate up to 500 rows before confirming. An import is atomic: errors leave your data unchanged.",
  ],
  [
    "Search suppliers",
    "Use vendor search and combine brand, city, category and relationship filters. Save a named view for repeat sourcing. Ctrl+K or Cmd+K opens global search.",
  ],
  [
    "Create an RFQ",
    "Add a product and suppliers first. In RFQs & quotations, create a sourcing brief with quantity, deadline and selected suppliers. Saving does not send messages. Queue delivery from the RFQ detail, then an owner can dispatch through a configured provider.",
  ],
  [
    "Compare quotations",
    "Open a product to compare recorded prices, MOQ, stock and lead time. Enter supplier prices in the product form. RFQ comparisons include entered landed costs. Use Approvals to award a quotation and create a draft purchase order. Demo comparisons are fictional and marked.",
  ],
  [
    "Privacy and demo isolation",
    "Demo records live in this browser tab’s session storage and never call workspace record APIs. Reset demo restores the original sample set. Real workspace APIs require a session and enforce membership.",
  ],
];
function Header({ signedIn = false }: { signedIn?: boolean }) {
  return (
    <header className="public-header">
      <a data-route href="/" aria-label="OfNeeds home">
        <Logo />
      </a>
      <nav aria-label="Main navigation">
        <a href="/#overview">Product overview</a>
        <a href="/#features">Features</a>
        <a href="/#how-it-works">How it works</a>
        <a data-route href="/demo">
          Product demo
        </a>
      </nav>
      <div>
        <a
          data-route
          href={signedIn ? "/dashboard" : "/login"}
          className="button ghost"
        >
          {signedIn ? "Open workspace" : "Log in"}
        </a>
        <a data-route href="/signup" className="button primary">
          Get started
          <Icon name="ArrowUpRight" size={16} />
        </a>
      </div>
    </header>
  );
}
export function ProductPreview() {
  return (
    <div
      className="product-preview"
      aria-label="Rendered OfNeeds dashboard preview with sample data"
    >
      <div className="preview-top">
        <span className="window-dots">● ● ●</span>
        <span>
          <Icon name="LockKeyhole" size={12} /> OfNeeds workspace
        </span>
        <Badge tone="blue">Sample data</Badge>
      </div>
      <div className="preview-body">
        <aside>
          <Logo compact />
          {[
            "LayoutDashboard",
            "Building2",
            "BadgeCheck",
            "Package",
            "ClipboardList",
            "ChartNoAxesCombined",
          ].map((name, i) => (
            <span key={name} className={i === 0 ? "selected" : ""}>
              <Icon name={name} size={18} />
            </span>
          ))}
        </aside>
        <div className="preview-main">
          <div className="preview-breadcrumb">
            Workspace <span>/</span> Overview{" "}
            <span className="preview-user">
              Your connected sourcing desk <Avatar name="Alex Morgan" />
            </span>
          </div>
          <div className="preview-heading">
            <div>
              <small>YOUR NETWORK, AT A GLANCE</small>
              <h3>
                Good morning, Alex <span className="sun">☀</span>
              </h3>
              <p>Here’s what’s happening across your supplier network.</p>
            </div>
            <span className="button primary small">＋ Add vendor</span>
          </div>
          <div className="preview-metrics">
            {[
              ["Vendors", "25", "Building2"],
              ["Brands managed", "15", "BadgeCheck"],
              ["Open RFQs", "6", "ClipboardList"],
              ["Follow-ups today", "3", "CalendarDays"],
            ].map(([label, value, icon]) => (
              <div key={label}>
                <Icon name={icon} />
                <small>{label}</small>
                <strong>{value}</strong>
                <span>Sample workspace</span>
              </div>
            ))}
          </div>
          <div className="preview-panels">
            <div>
              <h4>
                Vendor network <small>By category</small>
              </h4>
              <div className="preview-chart">
                <div className="donut">
                  <span>
                    25<small>vendors</small>
                  </span>
                </div>
                <ul>
                  {[
                    "Apparel",
                    "Electronics",
                    "Bags & luggage",
                    "Drinkware",
                  ].map((label, i) => (
                    <li key={label}>
                      <i className={`dot color-${i}`} />
                      {label}
                      <b>{[7, 6, 8, 4][i]}</b>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
            <div>
              <h4>
                Follow-ups <small>Today</small>
              </h4>
              {[
                "Confirm sample availability",
                "Review supplier quotation",
                "Request updated catalogue",
              ].map((name, i) => (
                <div className="preview-task" key={name}>
                  <span className="check-circle" />
                  <div>
                    <b>{name}</b>
                    <small>
                      {
                        [
                          "Northstar Gifting Studio",
                          "Atlas Corporate Supply",
                          "Willow & Co.",
                        ][i]
                      }
                    </small>
                  </div>
                  <span className="task-time">{i + 10}:00</span>
                </div>
              ))}
            </div>
          </div>
          <div className="preview-table">
            <h4>
              Your supplier network <span>View all vendors →</span>
            </h4>
            {[
              "Northstar Gifting Studio",
              "Atlas Corporate Supply",
              "Willow & Co. Merchants",
            ].map((name, i) => (
              <div key={name}>
                <Avatar name={name} />
                <b>
                  {name}
                  <small>
                    Sample supplier · {["Bengaluru", "Mumbai", "New Delhi"][i]}
                  </small>
                </b>
                <span>{["Apparel", "Electronics", "Drinkware"][i]}</span>
                <Badge tone="green">Active</Badge>
                <Icon name="ArrowUpRight" size={15} />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
export function Landing({
  navigate,
  signedIn,
}: {
  navigate: (url: string) => void;
  signedIn: boolean;
}) {
  return (
    <div className="public-site">
      <Header signedIn={signedIn} />
      <main>
        <section className="hero" id="overview">
          <div className="hero-copy">
            <span className="eyebrow">
              <span className="dot" /> BUILT FOR THE BUSINESS OF GIFTING
            </span>
            <h1>
              Every vendor.
              <br />
              Every brand.
              <br />
              <span>One connected workspace.</span>
            </h1>
            <p className="hero-requested">
              Manage every vendor. Discover every brand. Simplify every
              purchase.
            </p>
            <p className="hero-description">
              An intelligent vendor and supplier management platform built for
              the corporate gifting industry. Bring your brands, contacts,
              catalogues and procurement workflows together.
            </p>
            <div className="hero-actions">
              <a data-route href="/demo" className="button primary large">
                Explore interactive demo
                <Icon name="ArrowRight" />
              </a>
              <button
                className="button outline large"
                onClick={() => navigate("/demo?tour=1")}
              >
                <Icon name="CirclePlay" />
                Watch guided walkthrough
              </button>
            </div>
            <div className="hero-proof">
              <span>
                <Icon name="Check" size={14} />
                No login needed for demo
              </span>
              <span>
                <Icon name="Check" size={14} />
                Your own private workspace
              </span>
            </div>
          </div>
          <div className="hero-visual">
            <div className="visual-label">
              <span className="dot" /> A CLEARER VIEW OF YOUR SUPPLIER NETWORK
            </div>
            <ProductPreview />
            <div className="floating-note">
              <span>
                <Icon name="ShieldCheck" size={21} />
              </span>
              <div>
                <b>Clarity in every relationship</b>
                <small>Contacts, brands and commercials. Connected.</small>
              </div>
            </div>
          </div>
        </section>
        <section className="industry-strip">
          <span>PURPOSE-BUILT FOR YOUR SOURCING WORLD</span>
          {[
            "Corporate gifting teams",
            "Brand distributors",
            "Procurement teams",
            "Growing businesses",
          ].map((t) => (
            <span key={t}>
              <Icon name="CheckCheck" />
              {t}
            </span>
          ))}
        </section>
        <section className="marketing-section" id="features">
          <div className="section-heading">
            <span className="eyebrow">LESS SEARCHING. BETTER SOURCING.</span>
            <h2>
              Your supplier network.
              <br />
              Finally working together.
            </h2>
            <p>
              From the first supplier conversation to the final quotation, keep
              the details that matter within reach.
            </p>
          </div>
          <div className="feature-grid">
            {[
              [
                "Building2",
                "Vendor management",
                "A home for every supplier.",
                "Keep company details, contacts, commercial terms and relationship history in one clear profile.",
              ],
              [
                "BadgeCheck",
                "Brand & dealer directory",
                "Know who supplies what.",
                "Connect vendors to brands. Track recorded authorization status, supporting documents and expiry dates.",
              ],
              [
                "Package",
                "Product catalogue & pricing",
                "Find the right product, faster.",
                "Organize products by category and brand, with supplier prices, stock, MOQ and lead times.",
              ],
              [
                "GitCompareArrows",
                "RFQs & price comparisons",
                "Make informed sourcing decisions.",
                "Create briefs, compare recorded quotations and see your options side by side.",
              ],
              [
                "CalendarClock",
                "Follow-up management",
                "Keep the conversation moving.",
                "Schedule calls, prioritize tasks and follow up with suppliers when it matters.",
              ],
              [
                "ChartNoAxesCombined",
                "Dashboard & reporting",
                "Turn activity into a clear picture.",
                "Explore supplier coverage, sourcing activity and follow-ups using your own records.",
              ],
            ].map(([icon, kicker, title, copy]) => (
              <article className="feature-card" key={title}>
                <span className="feature-icon">
                  <Icon name={icon} size={24} />
                </span>
                <small>{kicker}</small>
                <h3>{title}</h3>
                <p>{copy}</p>
                <a data-route href="/demo">
                  Explore in the demo
                  <Icon name="ArrowUpRight" size={15} />
                </a>
              </article>
            ))}
          </div>
        </section>
        <section className="why-section marketing-section">
          <div>
            <span className="eyebrow">WHY OFNEEDS CRM</span>
            <h2>
              Built around relationships.
              <br />
              Designed for momentum.
            </h2>
            <p>
              Replace scattered supplier sheets and disconnected conversations
              with a workspace your team can make its own.
            </p>
            <a data-route href="/signup" className="button primary">
              Create your workspace
              <Icon name="ArrowRight" />
            </a>
          </div>
          <div className="why-list">
            {[
              [
                "Network, not spreadsheets",
                "Connect vendors, brands, products and the people behind them.",
              ],
              [
                "A calmer working day",
                "A clear dashboard, focused tasks and search that brings records to you.",
              ],
              [
                "Confidence in the details",
                "Review recorded verification status, commercial terms and quotation history.",
              ],
            ].map(([title, copy], i) => (
              <article key={title}>
                <span>0{i + 1}</span>
                <div>
                  <h3>{title}</h3>
                  <p>{copy}</p>
                </div>
                <Icon name="ArrowUpRight" />
              </article>
            ))}
          </div>
        </section>
        <section className="marketing-section" id="how-it-works">
          <div className="section-heading center">
            <span className="eyebrow">A SIMPLE WAY TO WORK</span>
            <h2>From scattered contacts to a connected network.</h2>
          </div>
          <div className="steps-grid">
            {[
              [
                "Build your network",
                "Add suppliers and brands, or bring your vendor sheet with you.",
              ],
              [
                "Connect the details",
                "Link contacts, products, commercial terms and documents.",
              ],
              [
                "Move sourcing forward",
                "Compare prices, create RFQs and keep follow-ups on track.",
              ],
            ].map(([t, d], i) => (
              <div key={t}>
                <span>0{i + 1}</span>
                <h3>{t}</h3>
                <p>{d}</p>
              </div>
            ))}
          </div>
        </section>
        <section className="demo-cta">
          <div>
            <span className="eyebrow">TAKE A LOOK AROUND</span>
            <h2>
              Your next sourcing workflow
              <br />
              starts with a little clarity.
            </h2>
            <p>
              Try a working workspace with fictional vendors, products and
              quotations. No account required.
            </p>
            <div>
              <a data-route href="/demo" className="button primary large">
                Open interactive demo
                <Icon name="ArrowRight" />
              </a>
              <a data-route href="/signup" className="button outline large">
                Get started
              </a>
            </div>
          </div>
          <div className="cta-mark">
            <Icon name="Boxes" size={120} />
            <span>Connected by OfNeeds.</span>
          </div>
        </section>
        <section className="marketing-section faq">
          <div>
            <span className="eyebrow">A FEW GOOD QUESTIONS</span>
            <h2>Before you get started.</h2>
            <a data-route href="/help">
              Visit the help center <Icon name="ArrowUpRight" size={16} />
            </a>
          </div>
          <div>
            {[
              [
                "Can I try it without signing up?",
                "Yes. The interactive demo works without an account. Its fictional records are stored separately in your browser tab, and you can reset them anytime.",
              ],
              [
                "Is the demo connected to real suppliers?",
                "No. All demo suppliers, brands, contacts, prices and metrics are fictional sample data. No authorization or commercial relationship is implied.",
              ],
              [
                "Can I import my existing vendor sheet?",
                "Yes. Import an Excel workbook or CSV file, review its rows and confirm the import into your own workspace.",
              ],
              [
                "Does creating an RFQ send it to suppliers?",
                "RFQs are saved in your workspace. Email and WhatsApp delivery require a future provider integration; no messages are sent automatically.",
              ],
            ].map(([q, a]) => (
              <details key={q}>
                <summary>
                  {q}
                  <Icon name="Plus" size={16} />
                </summary>
                <p>{a}</p>
              </details>
            ))}
          </div>
        </section>
      </main>
      <footer className="public-footer">
        <Logo />
        <p>A more connected way to source.</p>
        <a data-route href="/help">
          Help center
        </a>
        <a data-route href="/login">
          Sign in
        </a>
        <span>© {new Date().getFullYear()} OfNeeds Vendor CRM</span>
      </footer>
    </div>
  );
}
export function AuthPage({
  mode,
  navigate,
  onUser,
}: {
  mode: string;
  navigate: (url: string) => void;
  onUser: (user: User) => void;
}) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [challenge, setChallenge] = useState(""),
    [message, setMessage] = useState("");
  const signup = mode === "signup",
    forgot = mode === "forgot-password";
  return (
    <div className="auth-page">
      <aside>
        <a data-route href="/">
          <Logo />
        </a>
        <div>
          <span className="eyebrow">YOUR NEXT CHAPTER IN SOURCING</span>
          <h1>
            Great relationships.
            <br />
            Better organized.
          </h1>
          <p>
            Bring your entire supplier network into one thoughtful workspace.
          </p>
          <div className="auth-quote">
            <Icon name="Network" size={42} />
            <h3>Every connection counts.</h3>
            <p>
              Vendors. Brands. Products. People.
              <br />
              Everything you need, working together.
            </p>
          </div>
        </div>
        <span>OfNeeds Vendor CRM · Built for procurement teams</span>
      </aside>
      <main>
        <a className="back-link" data-route href="/">
          <Icon name="ArrowLeft" size={16} />
          Back to product
        </a>
        <div className="auth-form">
          <span className="eyebrow">
            {forgot
              ? "ACCOUNT ASSISTANCE"
              : signup
                ? "START SOMETHING CONNECTED"
                : "WELCOME BACK"}
          </span>
          <h1>
            {forgot
              ? "Recover your account"
              : signup
                ? "Create your workspace"
                : "Your network is waiting."}
          </h1>
          <p>
            {forgot
              ? "Enter your account email. Recovery delivery requires a configured provider; MFA remains required when enabled."
              : signup
                ? "A clear space for your next supplier relationship."
                : "Sign in to OfNeeds Vendor CRM."}
          </p>
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              if (busy) return;
              setBusy(true);
              setError("");
              try {
                const data = Object.fromEntries(new FormData(e.currentTarget));
                const r = await api(
                  `/api/auth/${challenge ? "mfa" : signup ? "signup" : forgot ? "forgot-password" : "login"}`,
                  "POST",
                  { ...data, ...(challenge ? { challenge } : {}) },
                );
                if (r.mfaRequired) {
                  setChallenge(r.challenge);
                  return;
                }
                if (forgot) {
                  setMessage(r.message);
                  return;
                }
                onUser(r.user);
              } catch (e) {
                setError((e as Error).message);
              } finally {
                setBusy(false);
              }
            }}
          >
            {signup && (
              <>
                <Field label="Your name">
                  <input
                    required
                    autoComplete="name"
                    name="name"
                    placeholder="Alex Morgan"
                    maxLength={100}
                  />
                </Field>
                <Field label="Company name">
                  <input
                    required
                    autoComplete="organization"
                    name="company"
                    placeholder="Your business"
                    maxLength={160}
                  />
                </Field>
              </>
            )}
            {!challenge && (
              <Field label="Business email">
                <input
                  required
                  type="email"
                  autoComplete="email"
                  name="email"
                  placeholder="you@company.com"
                />
              </Field>
            )}
            {!forgot && !challenge && (
              <Field
                label="Password"
                hint={signup ? "Use at least 12 characters." : ""}
              >
                <input
                  required
                  type="password"
                  minLength={signup ? 12 : 1}
                  maxLength={200}
                  autoComplete={signup ? "new-password" : "current-password"}
                  name="password"
                />
              </Field>
            )}
            {challenge && (
              <Field label="Authenticator or recovery code">
                <input required name="code" autoComplete="one-time-code" />
              </Field>
            )}
            {message && (
              <p role="status" className="success">
                {message}
              </p>
            )}
            {error && (
              <p className="error" role="alert">
                {error}
              </p>
            )}
            {
              <button disabled={busy} className="button primary large full">
                {busy
                  ? "Please wait…"
                  : forgot
                    ? "Request recovery"
                    : challenge
                      ? "Verify sign-in"
                      : signup
                        ? "Create workspace"
                        : "Sign in"}
                <Icon name="ArrowRight" />
              </button>
            }
          </form>
          {!signup && !forgot && (
            <a data-route href="/forgot-password" className="auth-forgot">
              Forgot password?
            </a>
          )}
          <p className="auth-switch">
            {signup ? "Already have an account?" : "New to OfNeeds?"}{" "}
            <a data-route href={signup ? "/login" : "/signup"}>
              {signup ? "Sign in" : "Create a workspace"}
            </a>
          </p>
          <div className="auth-divider">
            <span>OR EXPLORE FIRST</span>
          </div>
          <button
            className="button outline full"
            onClick={() => navigate("/demo")}
          >
            <Icon name="CirclePlay" />
            Try the interactive demo
          </button>
          <p className="auth-note">
            <Icon name="LockKeyhole" size={13} />
            Your workspace starts empty. Demo records stay separate.
          </p>
        </div>
      </main>
    </div>
  );
}
export function HelpPage({ navigate }: { navigate: (url: string) => void }) {
  return (
    <div className="public-site">
      <Header />
      <main className="help-page">
        <span className="eyebrow">OFNEEDS HELP CENTER</span>
        <h1>
          A little guidance.
          <br />A lot more confidence.
        </h1>
        <p>Short guides for your everyday sourcing workflows.</p>
        <button
          className="button primary"
          onClick={() => navigate("/demo?tour=1")}
        >
          <Icon name="CirclePlay" />
          Take the product tour
        </button>
        <div className="help-articles">
          {helpTopics.map(([title, copy], i) => (
            <article key={title}>
              <span>0{i + 1}</span>
              <h2>{title}</h2>
              <p>{copy}</p>
            </article>
          ))}
        </div>
      </main>
    </div>
  );
}
