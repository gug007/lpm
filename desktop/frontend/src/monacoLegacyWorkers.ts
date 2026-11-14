import type * as monacoNs from "monaco-editor";

type Monaco = typeof monacoNs;

interface WorkerOptions {
  worker?: Worker | Promise<Worker>;
  label?: string;
  createData?: unknown;
  host?: Record<string, Function>;
  keepIdleModels?: boolean;
}

// monaco-yaml starts its worker through monaco-worker-manager, which still gives
// createWebWorker the options Monaco took before 0.55: a label and createData but
// no worker. Monaco then quietly runs a worker without the language's methods and
// every request fails, so this starts it the way Monaco's own languages do.
export function withLegacyWorkerOptions(monaco: Monaco, getWorker: (label: string) => Worker): Monaco {
  const createWebWorker = <T extends object>(options: WorkerOptions) => {
    const { worker, label, createData, host, keepIdleModels } = options;
    if (worker) return monaco.editor.createWebWorker<T>({ worker, host, keepIdleModels });
    const started = getWorker(label ?? "monaco-editor-worker");
    started.postMessage("ignore");
    started.postMessage(createData);
    return monaco.editor.createWebWorker<T>({ worker: started, host, keepIdleModels });
  };
  return { ...monaco, editor: { ...monaco.editor, createWebWorker } };
}
