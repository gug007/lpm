import { describe, expect, it } from "vitest";
import { wslDistroOf } from "./wslPath";

describe("wslDistroOf", () => {
  it("reads the distro from every name Windows gives a WSL folder", () => {
    expect(wslDistroOf("\\\\wsl.localhost\\Ubuntu\\home\\dana\\app")).toBe("Ubuntu");
    expect(wslDistroOf("\\\\wsl$\\Debian\\srv\\api")).toBe("Debian");
    expect(wslDistroOf("//wsl.localhost/Ubuntu-24.04/home/dana")).toBe("Ubuntu-24.04");
    expect(wslDistroOf("\\\\?\\UNC\\WSL$\\Ubuntu\\home")).toBe("Ubuntu");
  });

  it("knows any other folder isn't one", () => {
    expect(wslDistroOf("C:\\Users\\dana\\app")).toBeNull();
    expect(wslDistroOf("\\\\fileserver\\share\\app")).toBeNull();
    expect(wslDistroOf("/Users/dana/app")).toBeNull();
    expect(wslDistroOf("\\\\wsl.localhost")).toBeNull();
    expect(wslDistroOf(undefined)).toBeNull();
  });
});
