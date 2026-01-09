"use client";

import Image from "next/image";
import { useState, useEffect } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import axios from "axios";

interface ProxiedImageProps {
  src: string;
  alt: string;
  className?: string;
  width?: number;
  height?: number;
  priority?: boolean;
  onLoad?: () => void;
  token?: string;
  shareToken?: string;
}

export function ProxiedImage({
  src,
  alt,
  className,
  width = 500,
  height = 500,
  priority = false,
  onLoad,
  token,
  shareToken,
}: ProxiedImageProps) {
  const [imageSrc, setImageSrc] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    const fetchImage = async () => {
      try {
        setLoading(true);
        setError(false);

        // Se não há shareToken, use a URL direta (presigned URL deve funcionar)
        if (!shareToken) {
          setImageSrc(src);
          setLoading(false);
          return;
        }

        // Com shareToken, busca a imagem através do axios com os headers corretos
        const response = await axios.get(src, {
          responseType: "blob",
          headers: {
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
            ...(shareToken ? { "x-share-token": shareToken } : {}),
          },
        });

        const blob = response.data;
        const objectUrl = URL.createObjectURL(blob);
        setImageSrc(objectUrl);
        setLoading(false);
      } catch (err) {
        console.error("Error loading image:", err);
        setError(true);
        setLoading(false);
      }
    };

    if (src) {
      fetchImage();
    }

    // Cleanup object URL
    return () => {
      if (imageSrc && imageSrc.startsWith("blob:")) {
        URL.revokeObjectURL(imageSrc);
      }
    };
  }, [src, token, shareToken, imageSrc]);

  if (loading) {
    return <Skeleton className="size-full" />;
  }

  if (error) {
    return (
      <div className={className}>
        <div className="flex items-center justify-center size-full bg-gray-100 text-gray-400">
          Failed to load image
        </div>
      </div>
    );
  }

  return (
    <Image
      src={imageSrc}
      alt={alt}
      className={className}
      width={width}
      height={height}
      priority={priority}
      unoptimized
      onLoad={onLoad}
    />
  );
}
