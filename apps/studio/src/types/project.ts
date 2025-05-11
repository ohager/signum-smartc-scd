export type ProjectFileType = "contract" | "scd" | "test" | "doc" | "asm";

export interface ProjectFile {
  id: string;
  projectId: string;
  name: string;
  type: ProjectFileType;
  lastModified: Date;
  data?: any;
}

export interface Project {
  id: string;
  name: string;
  files: ProjectFile[];
  createdAt: Date;
  lastModified: Date;
}
