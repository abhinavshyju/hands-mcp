import { describe, expect, it } from "vitest";
import type { AuditEvent } from "./schemas.js";
import {
  describeActivity,
  formatActivityLines,
  formatDurationMs,
  peelCwdFromCommand,
  summarizeCommand,
  wrapActivityText,
} from "./activityFormat.js";

function event(partial: Partial<AuditEvent> & Pick<AuditEvent, "type">): AuditEvent {
  return {
    id: "id1",
    ts: new Date("2026-01-15T09:41:02Z").getTime(),
    ...partial,
  };
}

describe("peelCwdFromCommand", () => {
  it("splits cd dir && rest", () => {
    expect(peelCwdFromCommand("cd /home/abhinav/proj && npm run typecheck")).toEqual({
      cwd: "/home/abhinav/proj",
      command: "npm run typecheck",
    });
  });

  it("handles quoted cd path", () => {
    expect(peelCwdFromCommand("cd '/tmp/my dir' && git status")).toEqual({
      cwd: "/tmp/my dir",
      command: "git status",
    });
  });

  it("leaves command unchanged when no cd prefix", () => {
    expect(peelCwdFromCommand("npm test")).toEqual({ command: "npm test" });
  });
});

describe("summarizeCommand", () => {
  it("summarizes cat heredoc as write path", () => {
    expect(summarizeCommand("cat > public/check.html <<'EOF'\n<html></html>\nEOF")).toBe(
      "write public/check.html",
    );
  });

  it("summarizes python heredoc", () => {
    expect(summarizeCommand("python3 <<'PY'\nprint(1)\nPY")).toBe("python script");
  });

  it("uses first line for normal commands", () => {
    expect(summarizeCommand("grep -nE 'foo' bar.ts")).toBe("grep -nE 'foo' bar.ts");
  });
});

describe("describeActivity", () => {
  it("formats run_command with peeled cwd", () => {
    const d = describeActivity(
      event({
        type: "tool.finished",
        tool: "run_command",
        durationMs: 2100,
        args: {
          command: "cd /home/abhinav/motherkitchen-website && npm run typecheck",
        },
      }),
    );
    expect(d.verb).toBe("Run");
    expect(d.detail).toBe("npm run typecheck");
    expect(d.cwd).toBe("/home/abhinav/motherkitchen-website");
    expect(d.duration).toBe("2.1s");
  });

  it("marks start_process as background", () => {
    const d = describeActivity(
      event({
        type: "tool.finished",
        tool: "start_process",
        args: { command: "cd /proj && npm run dev -- --host 127.0.0.1" },
      }),
    );
    expect(d.verb).toBe("Start");
    expect(d.background).toBe(true);
    expect(d.detail).toContain("npm run dev");
  });

  it("formats errors", () => {
    const d = describeActivity(
      event({
        type: "tool.error",
        tool: "run_command",
        error: "exit 1",
        args: { command: "git restore -- .wrangler/state" },
      }),
    );
    expect(d.failed).toBe(true);
    expect(d.verb).toBe("✗ Run");
    expect(d.error).toBe("exit 1");
  });

  it("formats write path", () => {
    const d = describeActivity(
      event({
        type: "tool.finished",
        tool: "write_file",
        args: { path: "public/__visual-check.html" },
      }),
    );
    expect(d.verb).toBe("Write");
    expect(d.detail).toBe("public/__visual-check.html");
  });
});

describe("formatDurationMs", () => {
  it("formats sub-second and seconds", () => {
    expect(formatDurationMs(340)).toBe("340ms");
    expect(formatDurationMs(1200)).toBe("1.2s");
    expect(formatDurationMs(12000)).toBe("12s");
  });
});

describe("wrapActivityText", () => {
  it("wraps long lines with indent", () => {
    const lines = wrapActivityText(
      "one two three four five six seven eight nine ten eleven twelve",
      30,
      "          ",
    );
    expect(lines.length).toBeGreaterThan(1);
    expect(lines[1]).toMatch(/^ {10}/);
  });
});

describe("formatActivityLines", () => {
  it("includes cwd and duration on secondary line", () => {
    const lines = formatActivityLines(
      event({
        type: "tool.finished",
        tool: "run_command",
        durationMs: 500,
        args: { command: "cd /proj && npm test" },
      }),
      { terminalWidth: 120 },
    );
    expect(lines[0]).toMatch(/Run\s+npm test/);
    expect(lines.some((l) => l.includes("cwd /proj"))).toBe(true);
    expect(lines.some((l) => l.includes("(500ms)"))).toBe(true);
  });
});
