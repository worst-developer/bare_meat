import React from 'react';
import { createRoot } from 'react-dom/client';
import SidePanelApp from './SidePanelApp';
import './styles.css';

interface ErrorBoundaryState {
  error: Error | null;
}

class ErrorBoundary extends React.Component<React.PropsWithChildren, ErrorBoundaryState> {
  override state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  override componentDidCatch(error: Error): void {
    console.error('[bare meat] Side panel render failed:', error);
  }

  override render(): React.ReactNode {
    if (this.state.error) {
      return (
        <div className="app-root">
          <section className="config-section">
            <h1 className="section-heading__title">Side panel failed</h1>
            <p className="empty-state empty-state--compact">{this.state.error.message}</p>
          </section>
        </div>
      );
    }

    return this.props.children;
  }
}

const container = document.getElementById('root');
if (!container) {
  throw new Error('Root element not found');
}

const root = createRoot(container);
root.render(
  <React.StrictMode>
    <ErrorBoundary>
      <SidePanelApp />
    </ErrorBoundary>
  </React.StrictMode>
);
