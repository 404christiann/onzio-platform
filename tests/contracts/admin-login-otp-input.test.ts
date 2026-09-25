import { describe, expect, it } from "vitest";
import {
  expectedEmailCodeLength,
  extractPastedEmailCode,
  shouldAutoVerifyEmailCode,
} from "@/app/admin/login/otp-code";

describe("admin email-code input", () => {
  it("submits sequential input only at the environment's known code length", () => {
    expect(expectedEmailCodeLength(undefined, "http://127.0.0.1:54321")).toBe(6);
    expect(expectedEmailCodeLength(undefined, "http://localhost:54321")).toBe(6);
    expect(expectedEmailCodeLength("8", "https://hosted.supabase.co")).toBe(8);
    expect(expectedEmailCodeLength(undefined, "https://hosted.supabase.co")).toBeNull();
    expect(expectedEmailCodeLength("6.5", "https://hosted.supabase.co")).toBeNull();
    expect(expectedEmailCodeLength("11", "https://hosted.supabase.co")).toBeNull();
    expect(shouldAutoVerifyEmailCode("492257", 8, false)).toBe(false);
    expect(shouldAutoVerifyEmailCode("492257", 8, true)).toBe(false);
    expect(shouldAutoVerifyEmailCode("49225731", 8, false)).toBe(true);
    expect(shouldAutoVerifyEmailCode("49225731", 8, true)).toBe(true);
    expect(shouldAutoVerifyEmailCode("492257", 6, false)).toBe(true);
    expect(shouldAutoVerifyEmailCode("49225731", 6, true)).toBe(false);
    expect(shouldAutoVerifyEmailCode("492257", null, false)).toBe(false);
    expect(shouldAutoVerifyEmailCode("492257", null, true)).toBe(true);
  });

  it("extracts a single code without joining expiry or date digits", () => {
    expect(extractPastedEmailCode("428913")).toBe("428913");
    expect(extractPastedEmailCode("Code: 428 913. Expires in 10 minutes.")).toBe("428913");
    expect(extractPastedEmailCode("Your code: 1234-5678-90")).toBe("1234567890");
    expect(extractPastedEmailCode("Sent 2026-09-24. Your code is 428 913. Expires in 10 minutes.")).toBe("428913");
  });

  it("rejects ambiguous or overlong clipboard text instead of guessing", () => {
    expect(extractPastedEmailCode("Reference 123456; token 654321")).toBeNull();
    expect(extractPastedEmailCode("1234567890123")).toBeNull();
    expect(extractPastedEmailCode("No code here")).toBeNull();
  });
});
