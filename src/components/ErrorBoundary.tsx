import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AlertCircle, RotateCcw } from 'lucide-react';

interface Props {
  children: ReactNode;
  fallbackTitle?: string;
  onReset?: () => void;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('ErrorBoundary caught error:', error, errorInfo);
  }

  private handleReset = () => {
    this.setState({ hasError: false, error: null });
    this.props.onReset?.();
  };

  public render() {
    if (this.state.hasError) {
      return (
        <div className="p-6 my-6 rounded-2xl bg-red-50 border border-red-200 text-red-900 max-w-xl mx-auto shadow-sm">
          <div className="flex items-center gap-3 mb-3">
            <AlertCircle className="w-6 h-6 text-red-600 shrink-0" />
            <h3 className="text-base font-bold">
              {this.props.fallbackTitle || 'Something went wrong in this workspace.'}
            </h3>
          </div>
          <p className="text-xs text-red-700 mb-4 leading-relaxed">
            {this.state.error?.message || 'An unexpected rendering error occurred. You can restore normal studio operation by reloading or resetting this view.'}
          </p>
          <div className="flex gap-3">
            <button
              onClick={this.handleReset}
              className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-xl text-xs font-semibold flex items-center gap-2 transition-colors"
            >
              <RotateCcw className="w-4 h-4" />
              <span>Retry Workspace</span>
            </button>
            <button
              onClick={() => window.location.reload()}
              className="px-4 py-2 bg-white hover:bg-red-100 text-red-800 border border-red-300 rounded-xl text-xs font-semibold transition-colors"
            >
              Reload Page
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
