export const LAYOUT = {
  BASE_PADDING_LEFT: 8,
  INDENT_STEP: 16,
  CHEVRON_WIDTH: 26, // Space for the collapse/expand arrow
  ICON_WIDTH: 20,    // Space for favicon/folder icon
  GAP: 6             // Gap between elements
};

export const getIndentPadding = (depth: number): number => {
  return LAYOUT.BASE_PADDING_LEFT + depth * LAYOUT.INDENT_STEP;
};

export const getIndentStyle = (depth: number): React.CSSProperties => ({
  paddingLeft: `${getIndentPadding(depth)}px`,
});
