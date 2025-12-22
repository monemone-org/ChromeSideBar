const BASE_PADDING = 8;
const DEPTH_INCREMENT = 16;

export const getIndentPadding = (depth: number): number => {
  return BASE_PADDING + depth * DEPTH_INCREMENT;
};

export const getIndentStyle = (depth: number): React.CSSProperties => ({
  paddingLeft: `${getIndentPadding(depth)}px`,
});
