import { useEffect, useRef, useState } from 'react';

interface ProcessTimerState {
  elapsed: number;
  showCancel: boolean;
  isProcessing: boolean;
}

export const useProcessTimer = (isProcessing: boolean, onTimeout?: () => void) => {
  const [state, setState] = useState<ProcessTimerState>({
    elapsed: 0,
    showCancel: false,
    isProcessing: isProcessing,
  });

  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (!isProcessing) {
      // Clean up when processing stops
      if (intervalRef.current) clearInterval(intervalRef.current);
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      setState({ elapsed: 0, showCancel: false, isProcessing: false });
      return;
    }

    // Reset state when processing starts
    setState({ elapsed: 0, showCancel: false, isProcessing: true });

    // Timer to track elapsed time
    intervalRef.current = setInterval(() => {
      setState((prev) => ({
        ...prev,
        elapsed: prev.elapsed + 1,
        showCancel: prev.elapsed + 1 >= 10, // Show cancel button at 10 seconds
      }));
    }, 1000);

    // Timeout to call callback after 10 seconds
    timeoutRef.current = setTimeout(() => {
      setState((prev) => ({
        ...prev,
        showCancel: true,
      }));
      onTimeout?.();
    }, 10000);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, [isProcessing, onTimeout]);

  return {
    elapsed: state.elapsed,
    showCancel: state.showCancel,
    formattedTime: formatTime(state.elapsed),
  };
};

const formatTime = (seconds: number): string => {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
};
