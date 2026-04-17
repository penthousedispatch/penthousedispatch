import React, { Suspense, useState } from 'react';
import { RefreshCw } from 'lucide-react';

class ModuleErrorBoundaryInner extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidUpdate(prevProps) {
    if (prevProps.resetKey !== this.props.resetKey && this.state.error) {
      this.setState({ error: null });
    }
  }

  render() {
    const { error } = this.state;
    const { moduleName, onRetry, children } = this.props;

    if (error) {
      return (
        <div className="h-full flex items-center justify-center p-6" style={{ background: '#07090d', color: '#e5e7eb' }}>
          <div className="max-w-md w-full rounded-2xl p-6 text-center" style={{ background: '#0d1117', border: '1px solid rgba(255,255,255,0.08)' }}>
            <p className="text-lg font-700 mb-2" style={{ color: '#ff4757', fontWeight: 700 }}>{moduleName} Is Unavailable</p>
            <p className="text-sm mb-4" style={{ color: 'rgba(255,255,255,0.55)', lineHeight: 1.6 }}>
              This module failed to load, but the rest of the dashboard can keep running. You can retry this module without reloading the whole app.
            </p>
            <p className="text-xs mb-5" style={{ color: 'rgba(255,255,255,0.35)', wordBreak: 'break-word' }}>
              {error?.message || 'Unknown module error'}
            </p>
            <button
              onClick={onRetry}
              className="btn-gold w-full py-3 flex items-center justify-center gap-2"
            >
              <RefreshCw className="w-4 h-4" />
              Retry {moduleName}
            </button>
          </div>
        </div>
      );
    }

    return children;
  }
}

function ModuleFallback({ moduleName }) {
  return (
    <div className="h-full flex items-center justify-center p-6" style={{ background: '#07090d', color: '#e5e7eb' }}>
      <div className="flex items-center gap-3 text-sm" style={{ color: 'rgba(255,255,255,0.5)' }}>
        <RefreshCw className="w-4 h-4 animate-spin" />
        Loading {moduleName}...
      </div>
    </div>
  );
}

export default function ModuleBoundary({ moduleName, children }) {
  const [resetKey, setResetKey] = useState(0);

  return (
    <ModuleErrorBoundaryInner
      moduleName={moduleName}
      resetKey={resetKey}
      onRetry={() => setResetKey(prev => prev + 1)}
    >
      <Suspense fallback={<ModuleFallback moduleName={moduleName} />}>
        <div key={resetKey} className="h-full">
          {children}
        </div>
      </Suspense>
    </ModuleErrorBoundaryInner>
  );
}
