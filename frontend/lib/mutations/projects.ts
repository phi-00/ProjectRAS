import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  addProject,
  addProjectImages,
  addProjectTool,
  clearProjectTools,
  deleteProject,
  deleteProjectImages,
  deleteProjectTool,
  downloadProjectImages,
  downloadProjectImage,
  downloadProjectResults,
  processProject,
  cancelProcessing,
  updateProject,
  updateProjectTool,
  previewProjectImage,
  createShare,
} from "../projects";
import { createBlobUrlFromFile, downloadBlob } from "../utils";

export const useAddProject = (uid: string, token: string) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: addProject,
    onSuccess: () => {
      qc.invalidateQueries({
        refetchType: "all",
        queryKey: ["projects", uid, token],
      });
    },
  });
};

export const useDeleteProject = (uid: string, pid: string, token: string, shareToken?: string) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: deleteProject,
    onSuccess: () => {
      qc.invalidateQueries({
        refetchType: "all",
        queryKey: ["projects", uid, token],
      });
      qc.invalidateQueries({
        refetchType: "all",
        queryKey: ["project", uid, pid, token, shareToken],
      });
      qc.invalidateQueries({
        refetchType: "all",
        queryKey: ["projectImages", uid, pid, token, shareToken],
      });
      qc.invalidateQueries({
        refetchType: "all",
        queryKey: ["projectResults", uid, pid, token, shareToken],
      });
    },
  });
};

export const useUpdateProject = (uid: string, pid: string, token: string, shareToken?: string) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: updateProject,
    onSuccess: () => {
      qc.invalidateQueries({
        refetchType: "all",
        queryKey: ["projects", uid, token],
      });
      qc.invalidateQueries({
        refetchType: "all",
        queryKey: ["project", uid, pid, token, shareToken],
      });
    },
  });
};

export const useAddProjectImages = (
  uid: string,
  pid: string,
  token: string,
  shareToken?: string,
) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: addProjectImages,
    onSuccess: () => {
      qc.invalidateQueries({
        refetchType: "all",
        queryKey: ["project", uid, pid, token, shareToken],
      });
      qc.invalidateQueries({
        refetchType: "all",
        queryKey: ["projectImages", uid, pid, token, shareToken],
      });
    },
  });
};

export const useDeleteProjectImages = (
  uid: string,
  pid: string,
  token: string,
  shareToken?: string,
) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: deleteProjectImages,
    onSuccess: () => {
      qc.invalidateQueries({
        refetchType: "all",
        queryKey: ["project", uid, pid, token, shareToken],
      });
      qc.invalidateQueries({
        refetchType: "all",
        queryKey: ["projectImages", uid, pid, token, shareToken],
      });
    },
  });
};

export const useDownloadProjectImage = (edited?: boolean) => {
  return useMutation({
    mutationFn: downloadProjectImage,
    onSuccess: async (image) => {
      const blobUrl = await createBlobUrlFromFile(image.file);
      downloadBlob(image.file.name, blobUrl);
    },
  });
};

export const useDownloadProject = () => {
  return useMutation({
    mutationFn: downloadProjectImages,
    onSuccess: async (project) => {
      const blobUrl = await createBlobUrlFromFile(project.file);
      downloadBlob(project.file.name, blobUrl);
    },
  });
};

export const useDownloadProjectResults = () => {
  return useMutation({
    mutationFn: downloadProjectResults,
    onSuccess: async (project, variables) => {
      const blobUrl = await createBlobUrlFromFile(project.file);
      downloadBlob(project.file.name, blobUrl);
    },
  });
};

export const useProcessProject = () => {
  return useMutation({
    mutationFn: processProject,
  });
};

export const useAddProjectTool = (uid: string, pid: string, token: string, shareToken?: string) => {
export const useCancelProcessing = (
  uid: string,
  pid: string,
  token: string,
) => {
  return useMutation({
    mutationFn: cancelProcessing,
  });
};

export const useAddProjectTool = (uid: string, pid: string, token: string) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: addProjectTool,
    onSuccess: () => {
      qc.invalidateQueries({
        refetchType: "all",
        queryKey: ["project", uid, pid, token, shareToken],
      });
      qc.invalidateQueries({
        refetchType: "all",
        queryKey: ["projectResults", uid, pid, token, shareToken],
      });
    },
  });
};

export const usePreviewProjectResult = () => {
  return useMutation({
    mutationFn: previewProjectImage,
  });
};

export const useUpdateProjectTool = (
  uid: string,
  pid: string,
  token: string,
  shareToken?: string,
) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: updateProjectTool,
    onSuccess: () => {
      qc.invalidateQueries({
        refetchType: "all",
        queryKey: ["project", uid, pid, token, shareToken],
      });
      qc.invalidateQueries({
        refetchType: "all",
        queryKey: ["projectResults", uid, pid, token, shareToken],
      });
    },
  });
};

export const useDeleteProjectTool = (
  uid: string,
  pid: string,
  token: string,
  shareToken?: string,
) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: deleteProjectTool,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["project", uid, pid, token, shareToken] });
      qc.invalidateQueries({
        refetchType: "all",
        queryKey: ["projectResults", uid, pid, token, shareToken],
      });
    },
  });
};

export const useClearProjectTools = (
  uid: string,
  pid: string,
  token: string,
  shareToken?: string,
) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: clearProjectTools,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["project", uid, pid, token, shareToken] });
      qc.invalidateQueries({
        refetchType: "all",
        queryKey: ["projectResults", uid, pid, token, shareToken],
      });
    },
  });
};

export const useCreateShare = (uid: string, pid: string, token: string) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ permission, expiresInDays, created_by }: { permission: "view" | "edit"; expiresInDays?: number; created_by?: string }) =>
      createShare({ uid, pid, token, permission, expiresInDays, created_by }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["project", uid, pid, token] });
      qc.invalidateQueries({ queryKey: ["projects", uid, token] });
    },
  });
};
