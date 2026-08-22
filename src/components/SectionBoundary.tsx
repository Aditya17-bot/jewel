// Keeps one broken section from taking the whole page with it.
//
// Without a boundary, any error thrown while React renders unmounts the entire tree and
// leaves a white page - which is both the worst possible failure for a shop and the least
// informative one to debug, because the message goes to a console nobody has open.
//
// The camera section is the riskiest thing here: it depends on hardware, permissions, two
// WASM models and whatever a real face happens to make the landmark maths do. If it fails
// it should fail alone, and it should say what happened.

import { Component, type ErrorInfo, type ReactNode } from "react";

interface Props {
  children: ReactNode;
  /** Named in the fallback so a report says which part gave way. */
  label: string;
}

interface State {
  error: Error | null;
  stack: string | null;
}

export class SectionBoundary extends Component<Props, State> {
  state: State = { error: null, stack: null };

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // Kept on screen rather than only in the console: the person who hits this is usually
    // not the person with devtools open.
    this.setState({ stack: info.componentStack ?? null });
    console.error(`[${this.props.label}]`, error, info.componentStack);
  }

  render() {
    const { error, stack } = this.state;
    if (!error) return this.props.children;

    return (
      <section className="section-failed" role="alert">
        <h2>{this.props.label} could not run</h2>
        <p>
          The rest of the page is unaffected. If you can, send this line — it names the
          fault exactly.
        </p>
        <pre>{error.message || String(error)}</pre>
        {stack ? <pre className="section-failed-stack">{stack.trim().split("\n").slice(0, 4).join("\n")}</pre> : null}
        <button type="button" onClick={() => this.setState({ error: null, stack: null })}>
          Try again
        </button>
      </section>
    );
  }
}
