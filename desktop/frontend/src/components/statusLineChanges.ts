type Agent = "claude" | "codex";

const listeners = new Set<(agent: Agent) => void>();

export function notifyStatusLineChanged(agent: Agent): void {
  for (const listener of listeners) listener(agent);
}

export function onStatusLineChanged(
  listener: (agent: Agent) => void,
): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
