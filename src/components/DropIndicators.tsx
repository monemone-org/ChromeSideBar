interface DropIndicatorsProps
{
  showBefore: boolean;
  showAfter: boolean;
}

export const DropIndicators = ({ showBefore, showAfter }: DropIndicatorsProps) => (
  <>
    {showBefore && (
      <div className="absolute left-0 right-0 top-0 h-0.5 bg-blue-500 z-20" />
    )}
    {showAfter && (
      <div className="absolute left-0 right-0 bottom-0 h-0.5 bg-blue-500 z-20" />
    )}
  </>
);
