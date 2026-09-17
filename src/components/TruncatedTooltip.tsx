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
      setIsTruncated((prev) => (prev === hasOverflow ? prev : hasOverflow));
    }
  }, []);

  useLayoutEffect(() => {
    checkTruncation();
  }, [checkTruncation, title]);

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
