import type { Project, ProjectFile, ProjectFileType } from "@/types/project";
import { atom } from "jotai";
import { atomWithStorage } from "jotai/utils";
import {
  deleteFileData,
  readFileData,
  saveFileData,
} from "./internal/idb-file-store";

export const projectsAtom = atomWithStorage<Project[]>(
  "scd:projects",
  [],
  {
    getItem: (key: string) => {
      const value = localStorage.getItem(key);
      try {
        return value ? JSON.parse(value) : [];
      } catch (error) {
        console.error(`Error parsing ${key}:`, error);
        return [];
      }
    },
    removeItem: (key: string) => {
      localStorage.removeItem(key);
    },
    setItem: (key: string, value: Project[]) => {
      localStorage.setItem(key, JSON.stringify(value));
    },
  },
  {
    getOnInit: true,
  },
);

export const activeProjectIdAtom = atomWithStorage<string | null>(
  "scd:activeProjectId",
  null,
  localStorage,
  { getOnInit: true },
);
export const activeFileIdAtom = atomWithStorage<string | null>(
  "scd:activeFileId",
  null,
  localStorage,
  { getOnInit: true },
);

// Derived atoms
export const activeProjectAtom = atom((get) => {
  const projects = get(projectsAtom) as Project[];
  const activeProjectId = get(activeProjectIdAtom);
  return projects.find((p) => p.id === activeProjectId) || null;
});

export const activeFileAtom = atom((get) => {
  const activeProject = get(activeProjectAtom);
  const activeFileId = get(activeFileIdAtom);
  return activeProject?.files.find((f) => f.id === activeFileId) || null;
});

export const getFileAtom = atom((get) => {
  const projects = get(projectsAtom) as Project[];
  return async ({
    projectId,
    fileId,
  }: {
    projectId: string;
    fileId: string;
  }) => {
    const project = projects.find((p) => p.id === projectId);
    if (project) {
      const file = project.files.find((f) => f.id === fileId);
      const data = await readFileData(fileId);
      return file ? { ...file, data } : null;
    }
    return null;
  };
});

// Action atoms
export const addProjectAtom = atom(null, (get, set, projectName: string) => {
  const projects = get(projectsAtom) as Project[];
  const newProject: Project = {
    id: crypto.randomUUID(),
    name: projectName,
    files: [],
    createdAt: new Date(),
    lastModified: new Date(),
  };
  set(projectsAtom, [...projects, newProject]);
  return newProject.id;
});

export const addFileAtom = atom(
  null,
  (
    get,
    set,
    payload: { projectId: string; fileName: string; type: ProjectFileType },
  ) => {
    const projects = get(projectsAtom) as Project[];
    const newFile: ProjectFile = {
      id: crypto.randomUUID(),
      projectId: payload.projectId,
      name: payload.fileName,
      type: payload.type,
      lastModified: new Date(),
    };

    set(
      projectsAtom,
      projects.map((project) =>
        project.id === payload.projectId
          ? {
              ...project,
              files: [...project.files, newFile],
              lastModified: new Date(),
            }
          : project,
      ),
    );
    return newFile.id;
  },
);

export const saveFileAtom = atom(null, (get, set, file: ProjectFile) => {
  const projects = get(projectsAtom) as Project[];
  const currentTime = new Date();

  set(
    projectsAtom,
    projects.map((project) =>
      project.id === file.projectId
        ? {
            ...project,
            lastModified: currentTime,
            files: project.files.map((f) =>
              f.id === file.id
                ? {
                    ...f,
                    lastModified: currentTime,
                  }
                : f,
            ),
          }
        : project,
    ),
  );
  return saveFileData(file.id, file.data);
});

export const deleteProjectAtom = atom(null, (get, set, projectId: string) => {
  const projects = get(projectsAtom) as Project[];
  projects
    .find((p) => p.id === projectId)
    ?.files.forEach((file) => {
      deleteFileData(file.id);
    });
  set(
    projectsAtom,
    projects.filter((p) => p.id !== projectId),
  );
  const activeProjectId = get(activeProjectIdAtom);
  if (activeProjectId === projectId) {
    set(activeProjectIdAtom, "");
    set(activeFileIdAtom, "");
  }
});

export const deleteFileAtom = atom(
  null,
  (get, set, payload: { projectId: string; fileId: string }) => {
    const projects = get(projectsAtom) as Project[]; // force refresh

    const currentTime = new Date();

    set(
      projectsAtom,
      projects.map((project) =>
        project.id === payload.projectId
          ? {
              ...project,
              lastModified: currentTime,
              files: project.files.filter((f) => f.id !== payload.fileId),
            }
          : project,
      ),
    );

    const activeFileId = get(activeFileIdAtom);
    if (activeFileId === payload.fileId) {
      set(activeFileIdAtom, "");
    }
    return deleteFileData(payload.fileId);
  },
);

// Optional: Search functionality
export const searchQueryAtom = atom("");

export const searchResultsAtom = atom((get) => {
  const projects = get(projectsAtom) as Project[];
  const query = get(searchQueryAtom).toLowerCase();

  if (!query) return projects;

  return projects
    .map((project) => ({
      ...project,
      files: project.files.filter(
        (file) =>
          file.name.toLowerCase().includes(query) ||
          file.type.toLowerCase().includes(query),
      ),
    }))
    .filter(
      (project) =>
        project.name.toLowerCase().includes(query) || project.files.length > 0,
    );
});
