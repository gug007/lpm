import { Component, type ReactNode } from "react";

interface ErrorBoundaryProps {
  children: ReactNode;
  // Re-mounts children when this value changes (e.g. switch keys) so a recovered
  // surface isn't stuck on the fallback.
  resetKey?: unknown;
  fallback?: (reset: () => void) => ReactNode;
}

interface ErrorBoundaryState {
  error: Error | null;
}

// Contains render/lifecycle/effect errors from a subtree so one crashing widget
// (e.g. Monaco tearing down its diff observables) can't take down the whole app.
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  componentDidUpdate(prev: ErrorBoundaryProps) {
    if (this.state.error && prev.resetKey !== this.props.resetKey) {
      this.setState({ error: null });
    }
  }

  componentDidCatch(error: Error) {
    console.error("[ErrorBoundary]", error);
  }

  private reset = () => this.setState({ error: null });

  render() {
    if (this.state.error) {
      if (this.props.fallback) return this.props.fallback(this.reset);
      return (
        <div className="flex h-full w-full flex-col items-center justify-center gap-3 text-center">
          <p className="text-xs font-medium text-[var(--text-secondary)]">
            Something went wrong
          </p>
          <button
            onClick={this.reset}
            className="rounded-md bg-[var(--text-primary)] px-3 py-1 text-[11px] font-medium text-[var(--bg-primary)] transition-opacity hover:opacity-90"
          >
            Reload
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
