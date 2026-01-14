// Chrome tab group colors - shared between TabList and Spaces
export const GROUP_COLORS: Record<string, {
  bg: string;
  bgStrong: string;
  badge: string;
  dot: string;
  border: string;
  text: string;
}> = {
  grey:   { bg: 'bg-[#F1F3F4] dark:bg-[#5F6368]/30', bgStrong: 'bg-[#E8EAED] dark:bg-[#5F6368]/50', badge: 'bg-[#5F6368] dark:bg-[#BDC1C6]', dot: 'bg-[#5F6368] dark:bg-[#BDC1C6]', border: 'border-[#5F6368] dark:border-[#BDC1C6]', text: 'text-[#5F6368] dark:text-[#BDC1C6]' },
  blue:   { bg: 'bg-[#E8F0FE] dark:bg-[#8AB4F8]/20', bgStrong: 'bg-[#D2E3FC] dark:bg-[#8AB4F8]/40', badge: 'bg-[#1A73E8] dark:bg-[#8AB4F8]', dot: 'bg-[#1A73E8] dark:bg-[#8AB4F8]', border: 'border-[#1A73E8] dark:border-[#8AB4F8]', text: 'text-[#1A73E8] dark:text-[#8AB4F8]' },
  red:    { bg: 'bg-[#FCE8E6] dark:bg-[#F28B82]/20', bgStrong: 'bg-[#F9D0CC] dark:bg-[#F28B82]/40', badge: 'bg-[#D93025] dark:bg-[#F28B82]', dot: 'bg-[#D93025] dark:bg-[#F28B82]', border: 'border-[#D93025] dark:border-[#F28B82]', text: 'text-[#D93025] dark:text-[#F28B82]' },
  yellow: { bg: 'bg-[#FEF7E0] dark:bg-[#FDD663]/20', bgStrong: 'bg-[#FCEFC7] dark:bg-[#FDD663]/40', badge: 'bg-[#E37400] dark:bg-[#FDD663]', dot: 'bg-[#E37400] dark:bg-[#FDD663]', border: 'border-[#E37400] dark:border-[#FDD663]', text: 'text-[#E37400] dark:text-[#FDD663]' },
  green:  { bg: 'bg-[#E6F4EA] dark:bg-[#81C995]/20', bgStrong: 'bg-[#CEEAD6] dark:bg-[#81C995]/40', badge: 'bg-[#188038] dark:bg-[#81C995]', dot: 'bg-[#188038] dark:bg-[#81C995]', border: 'border-[#188038] dark:border-[#81C995]', text: 'text-[#188038] dark:text-[#81C995]' },
  pink:   { bg: 'bg-[#FEE7F5] dark:bg-[#FF8BCB]/20', bgStrong: 'bg-[#FCCFEB] dark:bg-[#FF8BCB]/40', badge: 'bg-[#D01884] dark:bg-[#FF8BCB]', dot: 'bg-[#D01884] dark:bg-[#FF8BCB]', border: 'border-[#D01884] dark:border-[#FF8BCB]', text: 'text-[#D01884] dark:text-[#FF8BCB]' },
  purple: { bg: 'bg-[#F3E8FD] dark:bg-[#D7AEFB]/20', bgStrong: 'bg-[#E8D0FB] dark:bg-[#D7AEFB]/40', badge: 'bg-[#9333EA] dark:bg-[#D7AEFB]', dot: 'bg-[#9333EA] dark:bg-[#D7AEFB]', border: 'border-[#9333EA] dark:border-[#D7AEFB]', text: 'text-[#9333EA] dark:text-[#D7AEFB]' },
  cyan:   { bg: 'bg-[#E4F7FB] dark:bg-[#78D9EC]/20', bgStrong: 'bg-[#CBEFF7] dark:bg-[#78D9EC]/40', badge: 'bg-[#11858E] dark:bg-[#78D9EC]', dot: 'bg-[#11858E] dark:bg-[#78D9EC]', border: 'border-[#11858E] dark:border-[#78D9EC]', text: 'text-[#11858E] dark:text-[#78D9EC]' },
  orange: { bg: 'bg-[#FEF1E8] dark:bg-[#FCAD70]/20', bgStrong: 'bg-[#FCE3D1] dark:bg-[#FCAD70]/40', badge: 'bg-[#FA903E] dark:bg-[#FCAD70]', dot: 'bg-[#FA903E] dark:bg-[#FCAD70]', border: 'border-[#FA903E] dark:border-[#FCAD70]', text: 'text-[#FA903E] dark:text-[#FCAD70]' },
};

// Shared size for color picker circles (used in dialogs)
export const COLOR_CIRCLE_SIZE = 'w-5 h-5';

// Chrome tab group color options for pickers
export const GROUP_COLOR_OPTIONS: { value: chrome.tabGroups.ColorEnum; dot: string }[] = [
  { value: 'grey', dot: 'bg-[#5F6368] dark:bg-[#BDC1C6]' },
  { value: 'blue', dot: 'bg-[#1A73E8] dark:bg-[#8AB4F8]' },
  { value: 'red', dot: 'bg-[#D93025] dark:bg-[#F28B82]' },
  { value: 'yellow', dot: 'bg-[#E37400] dark:bg-[#FDD663]' },
  { value: 'green', dot: 'bg-[#188038] dark:bg-[#81C995]' },
  { value: 'pink', dot: 'bg-[#D01884] dark:bg-[#FF8BCB]' },
  { value: 'purple', dot: 'bg-[#9333EA] dark:bg-[#D7AEFB]' },
  { value: 'cyan', dot: 'bg-[#11858E] dark:bg-[#78D9EC]' },
  { value: 'orange', dot: 'bg-[#FA903E] dark:bg-[#FCAD70]' },
];
