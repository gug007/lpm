// A host older than a tab op refuses it as unknown; say what fixes it.
export function tabOpRefusal(err: unknown, action: string): string {
  return String(err).includes("unknown tab op")
    ? `update lpm on that machine to ${action} from here`
    : String(err);
}
