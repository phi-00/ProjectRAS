"use client";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Download } from "lucide-react";
import { useState } from "react";
import { useToast } from "@/hooks/use-toast";

interface DownloadFormatDialogProps {
  projectName: string;
  imageCount: number;
  onDownload: (format: string) => Promise<void>;
  isLoading?: boolean;
}

export function DownloadFormatDialog({
  projectName,
  imageCount,
  onDownload,
  isLoading = false,
}: DownloadFormatDialogProps) {
  const [open, setOpen] = useState(false);
  const [selectedFormat, setSelectedFormat] = useState<string>("png");
  const { toast } = useToast();

  // Single image: PNG, JPEG, TIFF options
  // Multiple images: same formats (images in ZIP)
  const formats = imageCount === 1 
    ? [
        {
          id: "png",
          name: "PNG Image",
          description: "Lossless compression, best for quality",
          icon: "🖼️",
        },
        {
          id: "jpeg",
          name: "JPEG Image",
          description: "Compressed format, smaller files",
          icon: "📷",
        },
        {
          id: "bmp",
          name: "BMP Image",
          description: "Uncompressed, maximum quality",
          icon: "🎨",
        },
        {
          id: "tiff",
          name: "TIFF Image",
          description: "High quality, ideal for printing",
          icon: "🖨️",
        },
      ]
    : [
        {
          id: "png",
          name: "PNG Images in ZIP",
          description: "Lossless compression, best for quality",
          icon: "🖼️",
        },
        {
          id: "jpeg",
          name: "JPEG Images in ZIP",
          description: "Compressed format, smaller files",
          icon: "📷",
        },
        {
          id: "bmp",
          name: "BMP Images in ZIP",
          description: "Uncompressed, maximum quality",
          icon: "🎨",
        },
        {
          id: "tiff",
          name: "TIFF Images in ZIP",
          description: "High quality, ideal for printing",
          icon: "🖨️",
        },
      ];

  const handleDownload = async () => {
    try {
      await onDownload(selectedFormat);
      setOpen(false);
      toast({
        title: "Download started",
        description: `Downloading project as ${selectedFormat.toUpperCase()}...`,
      });
    } catch (error) {
      toast({
        title: "Download failed",
        description: error instanceof Error ? error.message : "Unknown error occurred",
        variant: "destructive",
      });
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" className="px-3" title="Download project">
          <Download className="size-4" />
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Download "{projectName}"</DialogTitle>
          <DialogDescription>
            {imageCount === 1
              ? "Choose the image format for download"
              : "Choose the format for images in the ZIP archive"}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 py-4">
          {formats.map((format) => (
            <button
              key={format.id}
              onClick={() => setSelectedFormat(format.id)}
              className={`w-full text-left p-4 rounded-lg border-2 transition-all ${
                selectedFormat === format.id
                  ? "border-blue-500 bg-blue-50 dark:bg-blue-950"
                  : "border-gray-200 dark:border-gray-700 hover:border-gray-300"
              }`}
            >
              <div className="flex items-start gap-3">
                <span className="text-xl">{format.icon}</span>
                <div className="flex-1">
                  <p className="font-semibold text-sm">{format.name}</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                    {format.description}
                  </p>
                </div>
                <div
                  className={`w-4 h-4 rounded-full border-2 mt-1 ${
                    selectedFormat === format.id
                      ? "bg-blue-500 border-blue-500"
                      : "border-gray-300"
                  }`}
                />
              </div>
            </button>
          ))}
        </div>

        <div className="flex gap-2 justify-end">
          <Button
            variant="outline"
            onClick={() => setOpen(false)}
            disabled={isLoading}
          >
            Cancel
          </Button>
          <Button onClick={handleDownload} disabled={isLoading}>
            {isLoading ? (
              <>
                <span className="animate-spin mr-2">⏳</span>
                Downloading...
              </>
            ) : (
              <>
                <Download className="size-4 mr-2" />
                Download
              </>
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
