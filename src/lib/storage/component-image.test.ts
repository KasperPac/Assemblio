import { describe, expect, it } from "vitest";
import { componentImagePath, componentImageSrc, COMPONENT_IMAGE_BUCKET } from "./component-image";

describe("componentImagePath", () => {
  it("is the tenant-prefixed key the storage RLS policies expect", () => {
    // storage.foldername(name)[1] must equal the tenant id, or the
    // component_images_* policies deny the object.
    expect(componentImagePath("tenant-1", "comp-9")).toBe("tenant-1/comp-9");
  });

  it("puts the tenant first so the prefix check cannot be spoofed by the component id", () => {
    const path = componentImagePath("tenant-1", "../tenant-2/comp-9");
    expect(path.split("/")[0]).toBe("tenant-1");
  });
});

describe("componentImageSrc", () => {
  it("points at the signing route, never at a storage URL", () => {
    const src = componentImageSrc("comp-9");
    expect(src.startsWith("/api/component-images/comp-9")).toBe(true);
    expect(src).not.toContain("supabase");
    expect(src).not.toContain("/storage/v1/object/public");
  });

  it("carries a cache-busting version so a re-upload is not served stale", () => {
    const a = componentImageSrc("comp-9", 1000);
    const b = componentImageSrc("comp-9", 2000);
    expect(a).not.toBe(b);
    expect(a).toContain("v=1000");
  });
});

describe("COMPONENT_IMAGE_BUCKET", () => {
  it("is the bucket both the writer and the signing route use", () => {
    expect(COMPONENT_IMAGE_BUCKET).toBe("component-images");
  });
});
