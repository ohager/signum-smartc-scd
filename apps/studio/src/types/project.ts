export type ProjectFileType = "contract" | "scd" | "test" | "doc";

export interface ProjectFile {
  id: string;
  name: string;
  type: ProjectFileType;
  lastModified: Date;
}

export interface Project {
  id: string;
  name: string;
  files: ProjectFile[];
  createdAt: Date;
  lastModified: Date;
}
