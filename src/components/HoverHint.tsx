import React, { useState, useRef, useLayoutEffect } from 'react';
import { createPortal } from 'react-dom';

interface HoverHintProps
{
  text: string;
  children: React.ReactNode;
  className?: string;
  // Element whose left edge the hint aligns to (defaults to the hovered element),
  // e.g. a row's title so the hint isn't hidden under the cursor
  getAlignElement?: (anchor: HTMLElement) => Element | null | undefined;
}

// Gap between the hovered element and the hint
const HINT_OFFSET = 4;
// Minimum distance kept between the hint and the window edge
const EDGE_MARGIN = 4;

/**
 * Shows a small label as soon as the pointer enters the wrapped element
 * (native `title` tooltips appear only after a long delay).
 * The label is portaled to document.body with fixed positioning so scroll
 * containers can't clip it and it never shifts the surrounding layout.
 * The wrapper sets an empty `title` to suppress any ancestor's native tooltip.
 */
export const HoverHint = ({ text, children, className, getAlignElement }: HoverHintProps) =>
{
  const anchorRef = useRef<HTMLSpanElement>(null);
  const hintRef = useRef<HTMLDivElement>(null);
  const [anchorRect, setAnchorRect] = useState<DOMRect | null>(null);
  const [position, setPosition] = useState<{ top: number; left: number } | null>(null);

  // Place the hint below the anchor, clamped inside the window; flip above if it would overflow the bottom
  useLayoutEffect(() =>
  {
    if (!anchorRect || !hintRef.current)
    {
      setPosition(null);
      return;
    }
    const hintWidth = hintRef.current.offsetWidth;
    const hintHeight = hintRef.current.offsetHeight;

    let top = anchorRect.bottom + HINT_OFFSET;
    if (top + hintHeight > window.innerHeight - EDGE_MARGIN)
    {
      top = anchorRect.top - hintHeight - HINT_OFFSET;
    }
    const alignElement = anchorRef.current && getAlignElement ? getAlignElement(anchorRef.current) : null;
    const preferredLeft = alignElement ? alignElement.getBoundingClientRect().left : anchorRect.left;
    const maxLeft = window.innerWidth - hintWidth - EDGE_MARGIN;
    const left = Math.max(EDGE_MARGIN, Math.min(preferredLeft, maxLeft));
    setPosition({ top, left });
  }, [anchorRect, getAlignElement]);

  return (
    <span
      ref={anchorRef}
      className={className}
      title=""
      onPointerEnter={() => setAnchorRect(anchorRef.current?.getBoundingClientRect() ?? null)}
      onPointerLeave={() => setAnchorRect(null)}
    >
      {children}
      {anchorRect && createPortal(
        <div
          ref={hintRef}
          role="tooltip"
          style={{
            position: 'fixed',
            top: position?.top ?? 0,
            left: position?.left ?? 0,
            // Hidden until measured so it doesn't flash at the top-left corner
            visibility: position ? 'visible' : 'hidden',
          }}
          // Approximates the native (system) tooltip look used by `title` elsewhere in the extension
          className="z-50 pointer-events-none whitespace-nowrap rounded-[3px] px-1.5 py-[3px] font-sans text-[12px] leading-tight shadow-md border bg-[#f6f6f6] text-[#1f1f1f] border-black/15 dark:bg-[#2b2b2b] dark:text-[#e6e6e6] dark:border-white/15"
        >
          {text}
        </div>,
        document.body
      )}
    </span>
  );
};
