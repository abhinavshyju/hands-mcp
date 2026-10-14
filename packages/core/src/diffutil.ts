import { createTwoFilesPatch } from "diff";

export function unifiedDiff(file: string, before: string, after: string): string {
  return createTwoFilesPatch(file, file, before, after, "before", "after");
}
