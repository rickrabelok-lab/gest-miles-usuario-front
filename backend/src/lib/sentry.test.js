import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import { initSentry, captureException } from "./sentry.js";

afterEach(() => {
  delete process.env.SENTRY_DSN;
});

test("initSentry: no-op sem SENTRY_DSN (não lança)", () => {
  delete process.env.SENTRY_DSN;
  assert.doesNotThrow(() => initSentry());
});

test("captureException: no-op sem init (não lança)", () => {
  delete process.env.SENTRY_DSN;
  assert.doesNotThrow(() => captureException(new Error("x")));
});
