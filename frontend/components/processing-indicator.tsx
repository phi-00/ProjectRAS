"use client";

import { X, LoaderCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Transition } from "@headlessui/react";
import { useProcessTimer } from "@/hooks/use-process-timer";
import { useState } from "react";

interface ProcessingIndicatorProps {
  processing: boolean;
  progress: number;
  onCancel: () => Promise<void>;
  processingText?: string;
}

export function ProcessingIndicator({
  processing,
  progress,
  onCancel,
  processingText = "Processing",
}: ProcessingIndicatorProps) {
  const [isCancelling, setIsCancelling] = useState(false);
  const { showCancel, formattedTime } = useProcessTimer(processing);

  const handleCancel = async () => {
    setIsCancelling(true);
    try {
      await onCancel();
    } catch (error) {
      console.error("Error cancelling processing:", error);
    } finally {
      setIsCancelling(false);
    }
  };

  return (
    <Transition
      show={processing}
      enter="transition-opacity ease-in duration-300"
      enterFrom="opacity-0"
      enterTo="opacity-100"
      leave="transition-opacity ease-out duration-300"
      leaveFrom="opacity-100"
      leaveTo="opacity-0"
    >
      <div className="absolute top-0 left-0 h-screen w-screen bg-black/70 z-50 flex justify-center items-center">
        <Card className="p-8 flex flex-col justify-center items-center gap-6 shadow-lg">
          <div className="flex gap-3 items-center text-lg font-semibold">
            <h1>{processingText}</h1>
            <LoaderCircle className="size-[1em] animate-spin" />
          </div>
          
          {/* Timer and elapsed time */}
          <div className="text-center">
            <p className="text-sm text-muted-foreground">
              Elapsed time: {formattedTime}
            </p>
          </div>

          <Progress value={progress} className="w-96" />

          {/* Cancel button - shows after 10 seconds */}
          <Transition
            show={showCancel}
            enter="transition-opacity ease-in duration-300"
            enterFrom="opacity-0"
            enterTo="opacity-100"
            leave="transition-opacity ease-out duration-300"
            leaveFrom="opacity-100"
            leaveTo="opacity-0"
          >
            <div>
              <Button
                variant="destructive"
                size="sm"
                onClick={handleCancel}
                disabled={isCancelling}
                className="w-full"
              >
                {isCancelling ? (
                  <>
                    <LoaderCircle className="size-4 animate-spin mr-2" />
                    Cancelling...
                  </>
                ) : (
                  <>
                    <X className="size-4 mr-2" />
                    Cancel Processing
                  </>
                )}
              </Button>
            </div>
          </Transition>
        </Card>
      </div>
    </Transition>
  );
}
