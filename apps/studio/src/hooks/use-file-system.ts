import {FileSystem} from "@/lib/file-system"

export const useFileSystem = () => {
  return FileSystem.getInstance()
}
