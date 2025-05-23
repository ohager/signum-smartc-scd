import { atom, useAtom } from "jotai";
import type { MachineData } from "../machine-data";

export const asmMachineDataAtom = atom<MachineData | null>(null)

export const useMachineData = () => {
  const [machineData, setMachineData] = useAtom(asmMachineDataAtom)
  return { machineData, setMachineData }
}
