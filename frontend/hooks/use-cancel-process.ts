import { useRef, useState, useCallback } from "react";

interface CancelProcessState {
  processId: string;
  originalData?: any;
  timestamp: number;
}

export const useCancelProcess = () => {
  const abortControllerRef = useRef<AbortController | null>(null);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const [showCancelButton, setShowCancelButton] = useState(false);
  const [isCancelling, setIsCancelling] = useState(false);
  const stateRef = useRef<CancelProcessState | null>(null);

  const startProcess = useCallback(
    (processId: string, originalData?: any) => {
      // Create new AbortController for this process
      abortControllerRef.current = new AbortController();
      setShowCancelButton(false);
      setIsCancelling(false);

      // Store state for restoration
      stateRef.current = {
        processId,
        originalData,
        timestamp: Date.now(),
      };

      // Set timeout to show cancel button after 10 seconds
      timeoutRef.current = setTimeout(() => {
        setShowCancelButton(true);
      }, 10000);
    },
    []
  );

  const cancelProcess = useCallback(
    async (
      onCancel?: (state: CancelProcessState) => Promise<void>
    ): Promise<boolean> => {
      try {
        setIsCancelling(true);

        // Abort the fetch request
        if (abortControllerRef.current) {
          abortControllerRef.current.abort();
        }

        // Clear timeout
        if (timeoutRef.current) {
          clearTimeout(timeoutRef.current);
        }

        // Execute custom cancel handler if provided
        if (onCancel && stateRef.current) {
          await onCancel(stateRef.current);
        }

        // Reset states
        setShowCancelButton(false);
        stateRef.current = null;

        return true;
      } catch (error) {
        console.error("Error cancelling process:", error);
        return false;
      } finally {
        setIsCancelling(false);
      }
    },
    []
  );

  const endProcess = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }
    setShowCancelButton(false);
    setIsCancelling(false);
    stateRef.current = null;
  }, []);

  const getAbortSignal = useCallback(() => {
    return abortControllerRef.current?.signal;
  }, []);

  return {
    startProcess,
    cancelProcess,
    endProcess,
    getAbortSignal,
    showCancelButton,
    isCancelling,
    processState: stateRef.current,
  };
};
