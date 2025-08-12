"use client";

import React, { useState, useRef, useLayoutEffect, ReactNode, useCallback, useEffect } from "react";
import Tooltip from "./Tooltip";

interface TruncatedTooltipProps {
  children: ReactNode;
  title: string;
}

const TruncatedTooltip: React.FC<TruncatedTooltipProps> = ({ children, title }) => {
  const [isTruncated, setIsTruncated] = useState(false);
  const contentRef = useRef<HTMLSpanElement>(null);

  const checkTruncation = useCallback(() => {
    const element = contentRef.current;
    if (element) {
      const hasOverflow = element.scrollWidth > element.clientWidth;
      if (hasOverflow !== isTruncated) {
        setIsTruncated(hasOverflow);
      }
    }
  }, [isTruncated]);

  useLayoutEffect(() => {
    checkTruncation();
  }, [children, checkTruncation]);

  useEffect(() => {
    window.addEventListener("resize", checkTruncation);
    return () => {
      window.removeEventListener("resize", checkTruncation);
    };
  }, [checkTruncation]);

  const content = (
    <span ref={contentRef} className="truncate">
      {children}
    </span>
  );

  return isTruncated ? <Tooltip text={title}>{content}</Tooltip> : content;
};

export default TruncatedTooltip;
