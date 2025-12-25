interface DropIndicatorsProps
{
  showBefore: boolean;
  showAfter: boolean;
  beforeIndentPx?: number;
  afterIndentPx?: number;
}

export const DropIndicators = ({ showBefore, showAfter, beforeIndentPx, afterIndentPx }: DropIndicatorsProps) => (
  <>
    {showBefore && (
      <div
        className="absolute right-0 top-0 h-0.5 bg-blue-500 z-20"
        style={{ left: beforeIndentPx ?? 0 }}
      />
    )}
    {showAfter && (
      <div
        className="absolute right-0 bottom-0 h-0.5 bg-blue-500 z-20"
        style={{ left: afterIndentPx ?? 0 }}
      />
    )}
  </>
);
