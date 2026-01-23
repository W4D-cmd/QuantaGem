"use client";

import React, { useMemo } from "react";
import { getSVGDimensions } from "@/lib/webr/svg-utils";

interface RCodeBlockSVGViewProps {
  svg: string;
}

export const RCodeBlockSVGView: React.FC<RCodeBlockSVGViewProps> = ({ svg }) => {
  const { width, height } = useMemo(() => getSVGDimensions(svg), [svg]);

  // Calculate aspect ratio for responsive sizing
  const aspectRatio = width / height;

  return (
    <div
      className="w-full flex items-center justify-center bg-white dark:bg-neutral-100 rounded-lg overflow-hidden"
      style={{
        aspectRatio: aspectRatio,
        maxHeight: "500px",
      }}
    >
      <div
        className="w-full h-full flex items-center justify-center"
        dangerouslySetInnerHTML={{ __html: svg }}
        style={{
          maxWidth: "100%",
          maxHeight: "100%",
        }}
      />
    </div>
  );
};
