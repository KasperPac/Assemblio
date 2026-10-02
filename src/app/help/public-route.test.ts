import { existsSync, readFileSync } from "fs";
import path from "path";
import { describe, it, expect } from "vitest";

// main still has the root middleware.ts; PR #34 moves it to src/proxy.ts. Check whichever exist.
const CANDIDATES = ["middleware.ts", "src/middleware.ts", "src/proxy.ts"];

describe("help centre is public", () => {
  it("is not covered by the login middleware/proxy", () => {
    const present = CANDIDATES.filter((f) => existsSync(path.join(process.cwd(), f)));
    expect(present.length).toBeGreaterThan(0);
    for (const file of present) {
      const source = readFileSync(path.join(process.cwd(), file), "utf8");
      const matcher = /matcher:\s*(\[[^\]]*\])/.exec(source)?.[1];
      expect(matcher, file).toBe('["/app/:path*"]');
    }
  });
});
