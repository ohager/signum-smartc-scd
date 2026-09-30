import { useEffect, useState } from "react";
import { useFileSystem } from "@/hooks/use-file-system.ts";
import type { IndexedLabelMap } from "../model/resolve-label-map";
import { loadLabelMaps } from "./label-map-index";

/**
 * The workspace's Label Maps, kept current. Any file event may be a label
 * change — including one this tab wrote through "Set label" — so every open
 * inspection re-resolves without being told.
 */
export function useLabelMaps(): IndexedLabelMap[] {
  const fs = useFileSystem();
  const [maps, setMaps] = useState<IndexedLabelMap[]>([]);

  useEffect(() => {
    let generation = 0;
    const reload = () => {
      const mine = ++generation;
      loadLabelMaps(fs)
        .then((next) => mine === generation && setMaps(next))
        .catch(() => mine === generation && setMaps([]));
    };
    reload();
    fs.addEventListener("file:*", reload);
    fs.addEventListener("fs:reloaded", reload);
    return () => {
      generation = -1;
      fs.removeEventListener("file:*", reload);
      fs.removeEventListener("fs:reloaded", reload);
    };
  }, [fs]);

  return maps;
}
