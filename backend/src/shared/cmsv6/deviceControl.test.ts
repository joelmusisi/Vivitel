import { describe, expect, it } from "vitest";
import { encodeCmsv6CtrlType, findCmsv6ControlAction, md5Hex } from "./deviceControl";

describe("cmsv6 device control", () => {
  it("computes md5 digests", () => {
    expect(md5Hex("")).toBe("d41d8cd98f00b204e9800998ecf8427e");
    expect(md5Hex("abc")).toBe("900150983cd24fb0d6963f7d28e17f72");
    expect(md5Hex("123456")).toBe("e10adc3949ba59abbe56e057f20f883e");
    expect(md5Hex("The quick brown fox jumps over the lazy dog, again and again and again!")).toHaveLength(32);
  });

  it("encodes channel-indexed control types", () => {
    expect(encodeCmsv6CtrlType(findCmsv6ControlAction("restart")!, 3)).toBe(5);
    expect(encodeCmsv6CtrlType(findCmsv6ControlAction("record-start")!, 0)).toBe(9);
    expect(encodeCmsv6CtrlType(findCmsv6ControlAction("record-start")!, 1)).toBe(65545);
    expect(findCmsv6ControlAction("nope")).toBeUndefined();
  });
});
