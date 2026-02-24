// Shared emoji detection utility
// Characters with codepoints > 255 are treated as emoji (non-Latin scripts)
export const isEmoji = (s: string): boolean => (s.codePointAt(0) ?? 0) > 255;
