import { lazy, Suspense, type ComponentType } from "react";

// A component whose code is fetched the first time it renders, with nothing in
// its place until then.
export function deferred<P extends object>(load: () => Promise<ComponentType<P>>) {
  const Loaded = lazy(async () => ({ default: await load() })) as unknown as ComponentType<P>;
  return function Deferred(props: P) {
    return (
      <Suspense fallback={null}>
        <Loaded {...props} />
      </Suspense>
    );
  };
}
