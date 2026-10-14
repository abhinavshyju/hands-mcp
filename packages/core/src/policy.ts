import type { PolicyAction, ToolGroup, WorkspaceMode } from "@editer/shared";
import { PolicyDeniedError } from "@editer/shared";

export interface PolicyInput {
  mode: WorkspaceMode;
  group: ToolGroup;
  mutating: boolean;
  overrides?: Partial<Record<ToolGroup, PolicyAction>>;
}

const DEFAULTS: Record<WorkspaceMode, Record<"edit" | "exec" | "other", PolicyAction>> = {
  readonly: { edit: "deny", exec: "deny", other: "allow" },
  review: { edit: "allow", exec: "approve", other: "allow" },
  auto: { edit: "allow", exec: "allow", other: "allow" },
};

function bucket(group: ToolGroup, mutating: boolean): "edit" | "exec" | "other" {
  if (!mutating) return "other";
  if (
    group === "exec" ||
    group === "quality" ||
    group === "highlevel" ||
    group === "browser"
  ) {
    return "exec";
  }
  if (group === "edit" || group === "checkpoints" || group === "git") return "edit";
  return "edit";
}

export function resolvePolicy(input: PolicyInput): PolicyAction {
  const override = input.overrides?.[input.group];
  if (override) return override;
  if (!input.mutating) return "allow";
  if (input.mode === "readonly") return "deny";
  return DEFAULTS[input.mode][bucket(input.group, input.mutating)];
}

export function assertAllowed(action: PolicyAction): void {
  if (action === "deny") {
    throw new PolicyDeniedError("This tool is denied in the current workspace mode");
  }
}
