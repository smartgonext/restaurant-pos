import React, { useEffect, useRef } from 'react';
import { AlertCircle, CheckCircle, Info, AlertTriangle, X } from 'lucide-react';

export type ErrorLevel = 'error' | 'warning' | 'info' | 'success';

export interface ErrorFeedback {
  id: string;
  message: string;
  level: ErrorLevel;
  duration?: number;
  action?: {
    label: string;
    handler: () => void;
  };
}

interface ErrorFeedbackProps {
  errors: ErrorFeedback[];
  onDismiss: (id: string) => void;
}

/**
 * Error Feedback Component
 * Provides immediate visual feedback for staff on POS failures
 * Touch-friendly with large, visible alerts
 * Auto-dismisses or requires manual action
 */
export const ErrorFeedbackDisplay: React.FC<ErrorFeedbackProps> = ({ errors, onDismiss }) => {
  const errorSoundRef = useRef<HTMLAudioElement>(null);

  useEffect(() => {
    // Play sound for error/warning
    if (errors.some(e => e.level === 'error' || e.level === 'warning')) {
      const beep = new AudioContext();
      const osc = beep.createOscillator();
      const gain = beep.createGain();
      osc.connect(gain);
      gain.connect(beep.destination);
      osc.frequency.value = 800;
      gain.gain.setValueAtTime(0.1, beep.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, beep.currentTime + 0.2);
      osc.start(beep.currentTime);
      osc.stop(beep.currentTime + 0.2);
    }
  }, [errors]);

  if (errors.length === 0) return null;

  const getIcon = (level: ErrorLevel) => {
    switch (level) {
      case 'error':
        return <AlertCircle className="w-6 h-6" />;
      case 'warning':
        return <AlertTriangle className="w-6 h-6" />;
      case 'success':
        return <CheckCircle className="w-6 h-6" />;
      case 'info':
      default:
        return <Info className="w-6 h-6" />;
    }
  };

  const getBackgroundColor = (level: ErrorLevel) => {
    switch (level) {
      case 'error':
        return 'bg-red-900/95 border-red-700';
      case 'warning':
        return 'bg-amber-900/95 border-amber-700';
      case 'success':
        return 'bg-green-900/95 border-green-700';
      case 'info':
      default:
        return 'bg-blue-900/95 border-blue-700';
    }
  };

  const getTextColor = (level: ErrorLevel) => {
    switch (level) {
      case 'error':
        return 'text-red-100';
      case 'warning':
        return 'text-amber-100';
      case 'success':
        return 'text-green-100';
      case 'info':
      default:
        return 'text-blue-100';
    }
  };

  return (
    <div className="fixed top-4 right-4 z-[1000] space-y-2 max-w-md pointer-events-auto">
      {errors.map((error, idx) => (
        <ErrorAlert
          key={error.id}
          error={error}
          onDismiss={onDismiss}
          getIcon={getIcon}
          getBackgroundColor={getBackgroundColor}
          getTextColor={getTextColor}
          index={idx}
        />
      ))}
    </div>
  );
};

interface ErrorAlertProps {
  error: ErrorFeedback;
  onDismiss: (id: string) => void;
  getIcon: (level: ErrorLevel) => React.ReactNode;
  getBackgroundColor: (level: ErrorLevel) => string;
  getTextColor: (level: ErrorLevel) => string;
  index: number;
}

const ErrorAlert: React.FC<ErrorAlertProps> = ({
  error,
  onDismiss,
  getIcon,
  getBackgroundColor,
  getTextColor,
  index
}) => {
  useEffect(() => {
    if (error.duration && error.duration > 0) {
      const timer = setTimeout(() => onDismiss(error.id), error.duration);
      return () => clearTimeout(timer);
    }
  }, [error.id, error.duration, onDismiss]);

  return (
    <div
      className={`
        rounded-lg border p-4 shadow-2xl flex items-start gap-3
        animate-in slide-in-from-right-4 duration-300
        ${getBackgroundColor(error.level)}
      `}
      style={{
        animation: `slideIn 0.3s ease-out ${index * 0.1}s`,
      }}
    >
      <div className={`flex-shrink-0 ${getTextColor(error.level)}`}>
        {getIcon(error.level)}
      </div>

      <div className="flex-1">
        <p className={`font-semibold text-sm ${getTextColor(error.level)}`}>
          {error.message}
        </p>

        {error.action && (
          <button
            onClick={error.action.handler}
            className={`
              mt-2 px-3 py-1 rounded text-xs font-medium
              bg-white/20 hover:bg-white/30 transition-colors
              ${getTextColor(error.level)}
            `}
          >
            {error.action.label}
          </button>
        )}
      </div>

      <button
        onClick={() => onDismiss(error.id)}
        className={`flex-shrink-0 ${getTextColor(error.level)} hover:opacity-70 transition-opacity`}
      >
        <X className="w-5 h-5" />
      </button>

      <style>{`
        @keyframes slideIn {
          from {
            opacity: 0;
            transform: translateX(100%);
          }
          to {
            opacity: 1;
            transform: translateX(0);
          }
        }
      `}</style>
    </div>
  );
};

/**
 * Error feedback manager hook
 * Centralized error state management for the POS terminal
 */
export function useErrorFeedback() {
  const [errors, setErrors] = React.useState<ErrorFeedback[]>([]);

  const addError = React.useCallback((
    message: string,
    level: ErrorLevel = 'error',
    duration: number = 5000,
    action?: ErrorFeedback['action']
  ) => {
    const id = `error-${Date.now()}-${Math.random()}`;
    console.log(`[ErrorFeedback] ${level.toUpperCase()}: ${message}`);
    
    setErrors(prev => [...prev, { id, message, level, duration, action }]);
    return id;
  }, []);

  const removeError = React.useCallback((id: string) => {
    setErrors(prev => prev.filter(e => e.id !== id));
  }, []);

  const clearErrors = React.useCallback(() => {
    setErrors([]);
  }, []);

  return {
    errors,
    addError,
    removeError,
    clearErrors,
    errorCount: errors.length,
  };
}
