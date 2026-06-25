import { execSync } from "node:child_process";
import { existsSync, unlinkSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const engineDir = resolve(__dirname, "..", "engine");

function runBiomeCheck(filePath: string): { exitCode: number; stderr: string } {
  try {
    execSync(`npx biome check "${filePath}" --formatter-enabled=false`, {
      stdio: "pipe",
      timeout: 30000,
    });
    return { exitCode: 0, stderr: "" };
  } catch (e: unknown) {
    const execError = e as { status?: number; stderr?: Buffer; stdout?: Buffer };
    return {
      exitCode: execError.status ?? 1,
      stderr: execError.stderr?.toString() ?? execError.stdout?.toString() ?? "",
    };
  }
}

function writeFixture(name: string, content: string): string {
  const path = resolve(engineDir, `_test_${name}.ts`);
  writeFileSync(path, content);
  return path;
}

function cleanup(fixture: string) {
  if (existsSync(fixture)) unlinkSync(fixture);
}

describe("grit plugins", () => {
  it("no-array-constant-labels detects Chinese string arrays", () => {
    const f = writeFixture("array", 'const ARR = ["中文标签1", "中文标签2"];');
    try {
      const result = runBiomeCheck(f);
      expect(result.exitCode).not.toBe(0);
      expect(result.stderr).toContain("硬编码中文字符串数组");
    } finally {
      cleanup(f);
    }
  });

  it("no-array-constant-labels: non-Chinese arrays pass", () => {
    const f = writeFixture("valid_arr", 'const DIRECTIONS = ["north", "south", "east", "west"];');
    try {
      const result = runBiomeCheck(f);
      expect(result.exitCode).toBe(0);
    } finally {
      cleanup(f);
    }
  });

  it("no-id-format-assumption detects roomId string literal", () => {
    const f = writeFixture("id", 'const item = { roomId: "小村庄" };');
    try {
      const result = runBiomeCheck(f);
      expect(result.exitCode).not.toBe(0);
      expect(result.stderr).toContain("ID 格式假设");
    } finally {
      cleanup(f);
    }
  });

  it("no-id-format-assumption: generateRoomId() passes", () => {
    const f = writeFixture("valid_id", 'const room = { roomId: generateRoomId("v") };');
    try {
      const result = runBiomeCheck(f);
      expect(result.exitCode).toBe(0);
    } finally {
      cleanup(f);
    }
  });

  it("no-switch-without-contentpool detects switch without contentPool", () => {
    const f = writeFixture(
      "switch",
      "function f(a: string) { switch (a) { case 'x': return 1; } }",
    );
    try {
      const result = runBiomeCheck(f);
      expect(result.exitCode).not.toBe(0);
      expect(result.stderr).toContain("switch 语句中未使用 contentPool");
    } finally {
      cleanup(f);
    }
  });
});
