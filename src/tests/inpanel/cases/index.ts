import { TestCase } from '../types';
import { SECTION_A_CASES } from './sectionA';
import { SECTION_B_CASES } from './sectionB';
import { SECTION_C_CASES } from './sectionC';
import { SECTION_D_CASES } from './sectionD';
import { SECTION_E_CASES } from './sectionE';
import { SECTION_F_CASES } from './sectionF';

export const ALL_CASES: TestCase[] = [
  ...SECTION_A_CASES,
  ...SECTION_B_CASES,
  ...SECTION_C_CASES,
  ...SECTION_D_CASES,
  ...SECTION_E_CASES,
  ...SECTION_F_CASES,
];
