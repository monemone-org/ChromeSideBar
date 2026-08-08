import { TestCase } from '../types';
import { SECTION_A_CASES } from './sectionA';
import { SECTION_B_CASES } from './sectionB';
import { SECTION_D_CASES } from './sectionD';

export const ALL_CASES: TestCase[] = [
  ...SECTION_A_CASES,
  ...SECTION_B_CASES,
  ...SECTION_D_CASES,
];
