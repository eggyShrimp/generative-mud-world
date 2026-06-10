import type { ZodError, ZodSchema } from "zod";
import { logWrite } from "../shared/log.ts";

export interface ValidationResult<T> {
  ok: boolean;
  data?: T;
  errors?: string[];
}

function formatZodError(err: ZodError): string[] {
  return err.issues.map((i) => {
    const path = i.path.length > 0 ? ` at ${i.path.join(".")}` : "";
    return `${i.message}${path}`;
  });
}

export function validateWithSchema<T>(
  schema: ZodSchema<T>,
  data: unknown,
  context: string,
  mode: "warn" | "throw" = "warn",
): ValidationResult<T> {
  const result = schema.safeParse(data);
  if (result.success) {
    return { ok: true, data: result.data };
  }
  const errors = formatZodError(result.error);
  if (mode === "throw") {
    throw new Error(
      `[SchemaValidator] ${context}: ${errors.length} 个字段校验失败\n${errors.map((e) => `  - ${e}`).join("\n")}`,
    );
  }
  logWrite("srv", "warn", `[SchemaValidator] ${context}: ${errors.length} 个字段校验失败`);
  for (const err of errors) {
    logWrite("srv", "warn", `[SchemaValidator]   - ${err}`);
  }
  return { ok: false, errors };
}
