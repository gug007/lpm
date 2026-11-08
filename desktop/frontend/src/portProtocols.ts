export interface PortProtocol {
  name: string;
  scheme: string;
  port: number;
  processes: string[];
}

// Servers that don't speak HTTP, so a browser can do nothing with them.
const PROTOCOLS: PortProtocol[] = [
  { name: "PostgreSQL", scheme: "postgres", port: 5432, processes: ["postgres"] },
  { name: "MySQL", scheme: "mysql", port: 3306, processes: ["mysqld", "mariadbd"] },
  { name: "Redis", scheme: "redis", port: 6379, processes: ["redis-server", "valkey-server"] },
  { name: "MongoDB", scheme: "mongodb", port: 27017, processes: ["mongod"] },
  { name: "RabbitMQ", scheme: "amqp", port: 5672, processes: [] },
  { name: "NATS", scheme: "nats", port: 4222, processes: ["nats-server"] },
];

// Processes that publish a port for something else, such as a container or a
// tunnel, so the port number is all there is to go on.
const FORWARDER = /^(com\.docker|docker|vpnkit|orbstack|limactl|colima|podman|gvproxy|ssh$|kubectl)/;

export function protocolForPort(port: number): PortProtocol | null {
  return PROTOCOLS.find((protocol) => protocol.port === port) ?? null;
}

// What a port speaks, from the process holding it. A process that says nothing
// either way, such as `node` on :5432, is taken to be a web server.
export function portProtocol(port: number, process: string): PortProtocol | null {
  const holder = process.toLowerCase();
  const named = PROTOCOLS.find((protocol) => protocol.processes.includes(holder));
  if (named) return named;
  return !holder || FORWARDER.test(holder) ? protocolForPort(port) : null;
}

export const protocolUrl = (protocol: PortProtocol, port: number) => `${protocol.scheme}://localhost:${port}`;
