import { Component, type ErrorInfo, type ReactNode } from "react";
import { reportError } from "../../diagnostics";

export interface ErrorFallbackProps {
  error: Error;
  componentStack?: string;
  reset: () => void;
}

interface ErrorBoundaryProps {
  children: ReactNode;
  // Re-mounts children when this value changes (e.g. switch keys) so a recovered
  // surface isn't stuck on the fallback.
  resetKey?: unknown;
  scope?: string;
  fallback?: (props: ErrorFallbackProps) => ReactNode;
}

interface ErrorBoundaryState {
  error: Error | null;
  componentStack?: string;
}

// Contains render/lifecycle/effect errors from a subtree so one crashing widget
// (e.g. Monaco tearing down its diff observables) can't take down the whole app.
export class ErrorBoundary extends Component<
  ErrorBoundaryProps,
  ErrorBoundaryState
> {
  state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  componentDidUpdate(prev: ErrorBoundaryProps) {
    if (this.state.error && prev.resetKey !== this.props.resetKey) {
      this.setState({ error: null, componentStack: undefined });
    }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    const componentStack = info.componentStack || undefined;
    reportError("react.error_boundary", error, {
      scope: this.props.scope ?? "component",
      componentStack,
    });
    if (componentStack !== this.state.componentStack) {
      this.setState({ componentStack });
    }
  }

  private reset = () =>
    this.setState({ error: null, componentStack: undefined });

  render() {
    if (this.state.error) {
      if (this.props.fallback) {
        return this.props.fallback({
          error: this.state.error,
          componentStack: this.state.componentStack,
          reset: this.reset,
        });
      }
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
