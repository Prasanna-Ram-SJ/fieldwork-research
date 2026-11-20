"use client";
import { useState } from "react";
import { Globe2 } from "lucide-react";
import { sourceIconUrl } from "@/lib/ui/source-icon";
export function SourceIcon({ url }: { url?: string }) {
  const [failed, setFailed] = useState<string | null>(null),
    src = url ? sourceIconUrl(url) : null;
  return (
    <span className="source-icon" aria-hidden="true">
      {src && failed !== src ? (
        <img
          src={src}
          alt=""
          width={16}
          height={16}
          loading="lazy"
          decoding="async"
          referrerPolicy="no-referrer"
          onError={() => setFailed(src)}
        />
      ) : (
        <Globe2 size={15} strokeWidth={1.5} />
      )}
    </span>
  );
}
