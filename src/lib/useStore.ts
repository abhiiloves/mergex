import { useEffect, useState } from "react";
import { db, subscribe } from "@/lib/store";

export function useStore<T>(selector: () => T): T {
  const [v, setV] = useState<T>(selector);
  useEffect(() => {
    const fn = () => setV(() => selector());
    const unsub = subscribe(fn);
    return () => { unsub; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return v;
}

export { db };
