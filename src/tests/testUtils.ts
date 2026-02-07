// Shared types and utilities for in-app unit tests

export interface TestResult
{
  name: string;
  passed: boolean;
  error?: string;
}
