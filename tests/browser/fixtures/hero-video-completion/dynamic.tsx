export default function dynamic(loader: () => Promise<{ default: (props: Record<string, unknown>) => unknown }>) {
  let Component: ((props: Record<string, unknown>) => unknown) | null = null;
  void loader().then((mod) => { Component = mod.default; });
  return function Dynamic(props: Record<string, unknown>) {
    return Component ? Component(props) : null;
  };
}
