// =============================================================================
// Hex helper functions (private)
// =============================================================================

const isValidHex = (hex: string): boolean =>
  /^#?[0-9A-Fa-f]{6}$/.test(hex);

const hexToRgb = (hex: string): [number, number, number] =>
{
  if (!isValidHex(hex)) return [0, 0, 0];
  const h = hex.replace('#', '');
  return [
    parseInt(h.substring(0, 2), 16),
    parseInt(h.substring(2, 4), 16),
    parseInt(h.substring(4, 6), 16),
  ];
};

const rgbToHsl = (r: number, g: number, b: number): [number, number, number] =>
{
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;

  if (max === min) return [0, 0, l * 100];

  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h = 0;

  if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
  else if (max === g) h = ((b - r) / d + 2) / 6;
  else h = ((r - g) / d + 4) / 6;

  return [h * 360, s * 100, l * 100];
};

// =============================================================================
// Raw color palette - single source of truth for all hex values.
// GROUP_COLORS and GROUP_COLOR_OPTIONS are derived from this.
// =============================================================================

interface RawColor
{
  bgHex: string;          // light mode bg
  bgStrongHex: string;    // light mode slightly stronger bg
  bgSelectedHex: string;  // light mode selected-state bg
  accentLightHex: string; // light mode accent: badge, dot, border, text
  accentDarkHex: string;  // dark mode accent: badge, dot, border, text; also used by getSpaceBgColor
  bgDarkTintHex: string;  // dark mode bg tint (usually = accentDarkHex; grey uses accentLightHex)
  bgDarkOpacity: number;  // base opacity for dark bg class (grey=30, others=20)
}

const RAW_COLORS: Record<string, RawColor> = {
  grey:   { bgHex: '#F1F3F4', bgStrongHex: '#ECEEF0', bgSelectedHex: '#E0E2E4', accentLightHex: '#5F6368', accentDarkHex: '#BDC1C6', bgDarkTintHex: '#5F6368', bgDarkOpacity: 30 },
  blue:   { bgHex: '#E8F0FE', bgStrongHex: '#DCE9FC', bgSelectedHex: '#C2D9FA', accentLightHex: '#1A73E8', accentDarkHex: '#8AB4F8', bgDarkTintHex: '#8AB4F8', bgDarkOpacity: 20 },
  red:    { bgHex: '#FCE8E6', bgStrongHex: '#FADCD9', bgSelectedHex: '#F7C0BA', accentLightHex: '#D93025', accentDarkHex: '#F28B82', bgDarkTintHex: '#F28B82', bgDarkOpacity: 20 },
  yellow: { bgHex: '#FEF7E0', bgStrongHex: '#FDF3D5', bgSelectedHex: '#FBEAB4', accentLightHex: '#E37400', accentDarkHex: '#FDD663', bgDarkTintHex: '#FDD663', bgDarkOpacity: 20 },
  green:  { bgHex: '#E6F4EA', bgStrongHex: '#DAEFE0', bgSelectedHex: '#BCE2C6', accentLightHex: '#188038', accentDarkHex: '#81C995', bgDarkTintHex: '#81C995', bgDarkOpacity: 20 },
  pink:   { bgHex: '#FEE7F5', bgStrongHex: '#FDDAF0', bgSelectedHex: '#FBBEE4', accentLightHex: '#D01884', accentDarkHex: '#FF8BCB', bgDarkTintHex: '#FF8BCB', bgDarkOpacity: 20 },
  purple: { bgHex: '#F3E8FD', bgStrongHex: '#EDDCFC', bgSelectedHex: '#DEC2F9', accentLightHex: '#9333EA', accentDarkHex: '#D7AEFB', bgDarkTintHex: '#D7AEFB', bgDarkOpacity: 20 },
  cyan:   { bgHex: '#E4F7FB', bgStrongHex: '#D7F3F9', bgSelectedHex: '#B6E9F4', accentLightHex: '#11858E', accentDarkHex: '#78D9EC', bgDarkTintHex: '#78D9EC', bgDarkOpacity: 20 },
  orange: { bgHex: '#FEF1E8', bgStrongHex: '#FDEADD', bgSelectedHex: '#FBD9BE', accentLightHex: '#FA903E', accentDarkHex: '#FCAD70', bgDarkTintHex: '#FCAD70', bgDarkOpacity: 20 },
};

// Build a GROUP_COLORS entry from raw color data.
// bgLightHex and accentDarkHex are exposed for programmatic use by getSpaceBgColor.
const buildGroupColor = (c: RawColor) => ({
  bg:         `bg-[${c.bgHex}] dark:bg-[${c.bgDarkTintHex}]/${c.bgDarkOpacity}`,
  bgStrong:   `bg-[${c.bgStrongHex}] dark:bg-[${c.bgDarkTintHex}]/${c.bgDarkOpacity + 10}`,
  bgSelected: `bg-[${c.bgSelectedHex}] dark:bg-[${c.bgDarkTintHex}]/${c.bgDarkOpacity + 30}`,
  badge:      `bg-[${c.accentLightHex}] dark:bg-[${c.accentDarkHex}]`,
  dot:        `bg-[${c.accentLightHex}] dark:bg-[${c.accentDarkHex}]`,
  border:     `border-[${c.accentLightHex}] dark:border-[${c.accentDarkHex}]`,
  text:       `text-[${c.accentLightHex}] dark:text-[${c.accentDarkHex}]`,
  bgLightHex:    c.bgHex,
  accentDarkHex: c.accentDarkHex,
});

// =============================================================================
// Chrome tab group colors - derived from RAW_COLORS.
// Consumers use Tailwind classes (bg, bgStrong, etc.) or raw hex (bgLightHex,
// accentDarkHex) for programmatic color math.
// =============================================================================

export const GROUP_COLORS: Record<string, ReturnType<typeof buildGroupColor>> = {
  grey:   buildGroupColor(RAW_COLORS.grey),
  blue:   buildGroupColor(RAW_COLORS.blue),
  red:    buildGroupColor(RAW_COLORS.red),
  yellow: buildGroupColor(RAW_COLORS.yellow),
  green:  buildGroupColor(RAW_COLORS.green),
  pink:   buildGroupColor(RAW_COLORS.pink),
  purple: buildGroupColor(RAW_COLORS.purple),
  cyan:   buildGroupColor(RAW_COLORS.cyan),
  orange: buildGroupColor(RAW_COLORS.orange),
};

// Shared size for color picker circles (used in dialogs)
export const COLOR_CIRCLE_SIZE = 'w-5 h-5';

// Chrome tab group color options for pickers, in display order.
// dot is derived from GROUP_COLORS to avoid duplicating hex strings.
export const GROUP_COLOR_OPTIONS: { value: chrome.tabGroups.ColorEnum; dot: string }[] = [
  { value: 'grey',   dot: GROUP_COLORS.grey.dot },
  { value: 'blue',   dot: GROUP_COLORS.blue.dot },
  { value: 'red',    dot: GROUP_COLORS.red.dot },
  { value: 'yellow', dot: GROUP_COLORS.yellow.dot },
  { value: 'green',  dot: GROUP_COLORS.green.dot },
  { value: 'pink',   dot: GROUP_COLORS.pink.dot },
  { value: 'purple', dot: GROUP_COLORS.purple.dot },
  { value: 'cyan',   dot: GROUP_COLORS.cyan.dot },
  { value: 'orange', dot: GROUP_COLORS.orange.dot },
];

export const getRandomGroupColor = (): chrome.tabGroups.ColorEnum =>
{
  const colors = GROUP_COLOR_OPTIONS.map(opt => opt.value);
  return colors[Math.floor(Math.random() * colors.length)];
};

// =============================================================================
// Color utilities
// =============================================================================

export const isChromeColorName = (color: string): boolean =>
  color in GROUP_COLORS;

export const hexToNearestChromeColor = (hex: string): chrome.tabGroups.ColorEnum =>
{
  const [r, g, b] = hexToRgb(hex);
  const [hue, saturation] = rgbToHsl(r, g, b);

  if (saturation < 10) return 'grey';

  // Hue ranges: Red 0-15/346-360, Orange 16-45, Yellow 46-65, Green 66-165,
  //             Cyan 166-195, Blue 196-260, Purple 261-290, Pink 291-345
  if (hue < 16 || hue >= 346) return 'red';
  if (hue < 46) return 'orange';
  if (hue < 66) return 'yellow';
  if (hue < 166) return 'green';
  if (hue < 196) return 'cyan';
  if (hue < 261) return 'blue';
  if (hue < 291) return 'purple';
  return 'pink';
};

export const toChromeColor = (color: string): chrome.tabGroups.ColorEnum =>
{
  if (isChromeColorName(color)) return color as chrome.tabGroups.ColorEnum;
  if (isValidHex(color)) return hexToNearestChromeColor(color);
  return 'grey';
};

export interface HexColorStyle
{
  bg: string;
  badge: string;
  text: string;
}

export const getHexColorStyle = (hex: string): HexColorStyle =>
{
  const [r, g, b] = hexToRgb(hex);
  return {
    bg: `rgba(${r}, ${g}, ${b}, 0.15)`,
    badge: hex,
    text: hex,
  };
};

// =============================================================================
// Space background color
// =============================================================================

// Returns a CSS color for the sidebar background.
// alpha: 0-1, where 1.0 = full intensity (user-facing 100%).
//
// Both modes blend from their neutral base toward accentDarkHex at alpha*50%:
//   Light: white  → accentDarkHex at 50%  (e.g. blue gives rgb(197,218,252) at 100%)
//   Dark:  gray-900 → accentDarkHex at 50% (opaque - avoids looking bright when
//          dark:bg-gray-900 is removed from the container)
export const getSpaceBgColor = (color: string, isDark: boolean, alpha: number = 1): string => {
  const accentHex = GROUP_COLORS[color]?.accentDarkHex ?? (isValidHex(color) ? color : '#BDC1C6');
  const [aR, aG, aB] = hexToRgb(accentHex);

  if (isDark) {
    const blend = 0.50 * alpha;
    // gray-900 = #111827 = rgb(17, 24, 39)
    const [bgR, bgG, bgB] = [17, 24, 39];
    return `rgb(${Math.round(bgR + (aR - bgR) * blend)}, ${Math.round(bgG + (aG - bgG) * blend)}, ${Math.round(bgB + (aB - bgB) * blend)})`;
  }
  else
  {
    const blend = 0.75 * alpha;
    // white = rgb(255, 255, 255)
    return `rgb(${Math.round(255 + (aR - 255) * blend)}, ${Math.round(255 + (aG - 255) * blend)}, ${Math.round(255 + (aB - 255) * blend)})`;
  }
};

// =============================================================================
// Tailwind JIT safelist
//
// Tailwind's scanner needs complete class name strings to generate the CSS.
// GROUP_COLORS builds its classes from RAW_COLORS via template literals, which
// the scanner can't see. The full set of generated classes is listed here so
// the scanner picks them up. Update this comment if RAW_COLORS changes.
//
// grey:
//   bg-[#F1F3F4] bg-[#ECEEF0] bg-[#E0E2E4] bg-[#5F6368]
//   dark:bg-[#5F6368]/30 dark:bg-[#5F6368]/40 dark:bg-[#5F6368]/60
//   dark:bg-[#BDC1C6] border-[#5F6368] dark:border-[#BDC1C6] text-[#5F6368] dark:text-[#BDC1C6]
// blue:
//   bg-[#E8F0FE] bg-[#DCE9FC] bg-[#C2D9FA] bg-[#1A73E8]
//   dark:bg-[#8AB4F8]/20 dark:bg-[#8AB4F8]/30 dark:bg-[#8AB4F8]/50
//   dark:bg-[#8AB4F8] border-[#1A73E8] dark:border-[#8AB4F8] text-[#1A73E8] dark:text-[#8AB4F8]
// red:
//   bg-[#FCE8E6] bg-[#FADCD9] bg-[#F7C0BA] bg-[#D93025]
//   dark:bg-[#F28B82]/20 dark:bg-[#F28B82]/30 dark:bg-[#F28B82]/50
//   dark:bg-[#F28B82] border-[#D93025] dark:border-[#F28B82] text-[#D93025] dark:text-[#F28B82]
// yellow:
//   bg-[#FEF7E0] bg-[#FDF3D5] bg-[#FBEAB4] bg-[#E37400]
//   dark:bg-[#FDD663]/20 dark:bg-[#FDD663]/30 dark:bg-[#FDD663]/50
//   dark:bg-[#FDD663] border-[#E37400] dark:border-[#FDD663] text-[#E37400] dark:text-[#FDD663]
// green:
//   bg-[#E6F4EA] bg-[#DAEFE0] bg-[#BCE2C6] bg-[#188038]
//   dark:bg-[#81C995]/20 dark:bg-[#81C995]/30 dark:bg-[#81C995]/50
//   dark:bg-[#81C995] border-[#188038] dark:border-[#81C995] text-[#188038] dark:text-[#81C995]
// pink:
//   bg-[#FEE7F5] bg-[#FDDAF0] bg-[#FBBEE4] bg-[#D01884]
//   dark:bg-[#FF8BCB]/20 dark:bg-[#FF8BCB]/30 dark:bg-[#FF8BCB]/50
//   dark:bg-[#FF8BCB] border-[#D01884] dark:border-[#FF8BCB] text-[#D01884] dark:text-[#FF8BCB]
// purple:
//   bg-[#F3E8FD] bg-[#EDDCFC] bg-[#DEC2F9] bg-[#9333EA]
//   dark:bg-[#D7AEFB]/20 dark:bg-[#D7AEFB]/30 dark:bg-[#D7AEFB]/50
//   dark:bg-[#D7AEFB] border-[#9333EA] dark:border-[#D7AEFB] text-[#9333EA] dark:text-[#D7AEFB]
// cyan:
//   bg-[#E4F7FB] bg-[#D7F3F9] bg-[#B6E9F4] bg-[#11858E]
//   dark:bg-[#78D9EC]/20 dark:bg-[#78D9EC]/30 dark:bg-[#78D9EC]/50
//   dark:bg-[#78D9EC] border-[#11858E] dark:border-[#78D9EC] text-[#11858E] dark:text-[#78D9EC]
// orange:
//   bg-[#FEF1E8] bg-[#FDEADD] bg-[#FBD9BE] bg-[#FA903E]
//   dark:bg-[#FCAD70]/20 dark:bg-[#FCAD70]/30 dark:bg-[#FCAD70]/50
//   dark:bg-[#FCAD70] border-[#FA903E] dark:border-[#FCAD70] text-[#FA903E] dark:text-[#FCAD70]
// =============================================================================
