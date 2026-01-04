import { cn } from "@/lib/utils";
import { Card } from "@/components/ui/card";
import { Download, Trash } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import Image from "next/image";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { Skeleton } from "@/components/ui/skeleton";
import {
  useDeleteProjectImages,
  useDownloadProjectImage,
} from "@/lib/mutations/projects";
import { useProjectInfo } from "@/providers/project-provider";
import { useSession } from "@/providers/session-provider";
import { useToast } from "@/hooks/use-toast";
import type { ProjectImage } from "@/lib/projects";
import { useSearchParams } from "next/navigation";
interface ImageItemProps {
  image: ProjectImage;
  animation?: boolean;
}

export function ProjectImage({ image, animation = true }: ImageItemProps) {
  const searchParams = useSearchParams();
  const mode = searchParams.get("mode") ?? "edit";

  const [loaded, setLoaded] = useState<boolean>(false);
  const [deleteOpen, setDeleteOpen] = useState<boolean>(false);
  const [downloadOpen, setDownloadOpen] = useState<boolean>(false);
  const [selectedDownloadFormat, setSelectedDownloadFormat] = useState<string>("png");

  const { _id: pid } = useProjectInfo();
  const session = useSession();
  const deleteImage = useDeleteProjectImages(
    session.user._id,
    pid as string,
    session.token,
  );
  const downloadImage = useDownloadProjectImage(mode === "results");
  const { toast } = useToast();

  const handleDownload = () => {
    downloadImage.mutate(
      {
        imageUrl: image.url,
        imageName: image.name,
        format: selectedDownloadFormat as "png" | "jpeg",
      },
      {
        onSuccess: () => {
          toast({
            title: `Image ${image.name} downloaded.`,
          });
          setDownloadOpen(false);
        },
        onError: (error) => {
          toast({
            title: "Ups! An error occurred.",
            description: error.message,
            variant: "destructive",
          });
        },
      },
    );
  };

  return (
    <>
      <ContextMenu>
        <ContextMenuTrigger>
          <Card className="group relative overflow-hidden size-full">
            {/* Image */}
            <div className="size-full relative grid z-0 grid-cols-1 grid-rows-1">
              <Image
                src={image.url}
                unoptimized
                height={500}
                width={500}
                alt={image.name}
                className={cn(
                  "size-full object-contain row-start-1 col-start-1 z-30",
                  animation && "transition-all group-hover:scale-105",
                )}
                priority
                onLoad={() => setLoaded(true)}
              />
              <Image
                src={image.url}
                unoptimized
                width={500}
                height={500}
                className="object-cover row-start-1 col-start-1 size-full z-10"
                alt={image.name + " blurred"}
              />
              <div className="row-start-1 col-start-1 backdrop-blur-sm size-full bg-black/30 z-20" />
              {!loaded && (
                <>
                  <div className="row-start-1 col-start-1 z-40 bg-white size-full" />
                  <Skeleton className="size-full row-start-1 col-start-1 z-50" />
                </>
              )}
            </div>
          </Card>
        </ContextMenuTrigger>
        <ContextMenuContent>
          <DialogTrigger asChild onClick={(e) => e.stopPropagation()}>
            {mode !== "results" && (
              <ContextMenuItem
                className="flex justify-between"
                onClick={(e) => {
                  e.stopPropagation();
                  setDeleteOpen(true);
                }}
              >
                <span>Delete</span>
                <Trash className="size-4" />
              </ContextMenuItem>
            )}
          </DialogTrigger>
          <ContextMenuItem
            className="flex justify-between"
            onClick={(e) => {
              e.stopPropagation();
              setDownloadOpen(true);
            }}
          >
            <span>Download</span>
            <Download className="size-4" />
          </ContextMenuItem>
        </ContextMenuContent>
      </ContextMenu>
      
      {/* Download Format Dialog */}
      <Dialog open={downloadOpen} onOpenChange={setDownloadOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Download "{image.name}"</DialogTitle>
            <DialogDescription>
              Choose the format for downloading this image
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-4">
            <button
              onClick={() => setSelectedDownloadFormat("png")}
              className={`w-full text-left p-4 rounded-lg border-2 transition-all ${
                selectedDownloadFormat === "png"
                  ? "border-blue-500 bg-blue-50 dark:bg-blue-950"
                  : "border-gray-200 dark:border-gray-700 hover:border-gray-300"
              }`}
            >
              <div className="flex items-start gap-3">
                <span className="text-xl">🖼️</span>
                <div className="flex-1">
                  <p className="font-semibold text-sm">PNG</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                    Lossless compression, best quality
                  </p>
                </div>
                <div
                  className={`w-4 h-4 rounded-full border-2 mt-1 ${
                    selectedDownloadFormat === "png"
                      ? "bg-blue-500 border-blue-500"
                      : "border-gray-300"
                  }`}
                />
              </div>
            </button>
            <button
              onClick={() => setSelectedDownloadFormat("jpeg")}
              className={`w-full text-left p-4 rounded-lg border-2 transition-all ${
                selectedDownloadFormat === "jpeg"
                  ? "border-blue-500 bg-blue-50 dark:bg-blue-950"
                  : "border-gray-200 dark:border-gray-700 hover:border-gray-300"
              }`}
            >
              <div className="flex items-start gap-3">
                <span className="text-xl">📷</span>
                <div className="flex-1">
                  <p className="font-semibold text-sm">JPEG</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                    Compressed format, smaller file size
                  </p>
                </div>
                <div
                  className={`w-4 h-4 rounded-full border-2 mt-1 ${
                    selectedDownloadFormat === "jpeg"
                      ? "bg-blue-500 border-blue-500"
                      : "border-gray-300"
                  }`}
                />
              </div>
            </button>
          </div>
          <div className="flex gap-2 justify-end">
            <Button
              variant="outline"
              onClick={() => setDownloadOpen(false)}
              disabled={downloadImage.isPending}
            >
              Cancel
            </Button>
            <Button onClick={handleDownload} disabled={downloadImage.isPending}>
              {downloadImage.isPending ? (
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

      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Are you sure?</DialogTitle>
            <DialogDescription>This action cannot be undone.</DialogDescription>
          </DialogHeader>
          <div className="flex justify-end">
            <Button
              variant="destructive"
              onClick={(e) => {
                deleteImage.mutate(
                  {
                    uid: session.user._id,
                    pid: pid as string,
                    token: session.token,
                    imageIds: [image._id],
                  },
                  {
                    onSuccess: () => {
                      toast({
                        title: `Image ${image.name} deleted successfully.`,
                      });
                      setDeleteOpen(false);
                    },
                    onError: (error) => {
                      toast({
                        title: "Ups! An error occurred.",
                        description: error.message,
                        variant: "destructive",
                      });
                    },
                  },
                );
                e.stopPropagation();
              }}
            >
              Permanently Delete
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
