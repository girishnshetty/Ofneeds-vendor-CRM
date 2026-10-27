import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./styles.css";
import "./operations.css";
class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? (
      <main className="fatal">
        <h1>Let’s get you back to your workspace.</h1>
        <p>
          The interface could not load. Your saved records have not been
          changed.
        </p>
        <button onClick={() => location.reload()}>Reload application</button>
      </main>
    ) : (
      this.props.children
    );
  }
}
const root =
  import.meta.hot?.data.root || createRoot(document.getElementById("root")!);
if (import.meta.hot) import.meta.hot.data.root = root;
root.render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>,
);
