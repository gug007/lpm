import { describe, expect, it } from "vitest";
import { portProtocol, protocolForPort, protocolUrl } from "./portProtocols";

describe("portProtocol", () => {
  it("names a server from its process, on any port", () => {
    expect(portProtocol(5433, "postgres")?.name).toBe("PostgreSQL");
    expect(portProtocol(6380, "redis-server")?.name).toBe("Redis");
  });

  it("ignores the case of the process name", () => {
    expect(portProtocol(3306, "MySQLD")?.name).toBe("MySQL");
  });

  it("takes a web runtime on a database's port to be a web server", () => {
    expect(portProtocol(5432, "node")).toBeNull();
  });

  it("goes by the port for a process that forwards it", () => {
    expect(portProtocol(5432, "com.docker.backe")?.name).toBe("PostgreSQL");
    expect(portProtocol(6379, "ssh")?.name).toBe("Redis");
  });

  it("goes by the port when the holder has no name", () => {
    expect(portProtocol(27017, "")?.name).toBe("MongoDB");
  });

  it("knows nothing about an ordinary port", () => {
    expect(portProtocol(3000, "")).toBeNull();
    expect(portProtocol(3000, "com.docker.backe")).toBeNull();
  });

  it("does not take sshd for a forwarder", () => {
    expect(portProtocol(5432, "sshd")).toBeNull();
  });
});

describe("protocolUrl", () => {
  it("uses the protocol's scheme and the port given", () => {
    expect(protocolUrl(protocolForPort(5432)!, 54320)).toBe("postgres://localhost:54320");
  });
});
