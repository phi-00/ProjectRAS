import { useQuery } from "@tanstack/react-query";
import {
  fetchProjects,
  fetchProject,
  getProjectImages,
  ProjectImage,
  fetchProjectResults,
  fetchActiveProcesses,
} from "../projects";
import { io } from "socket.io-client";
import { api } from "../axios";

export const useGetProjects = (uid: string, token: string) => {
  return useQuery({
    queryKey: ["projects", uid, token],
    queryFn: () => fetchProjects(uid, token),
  });
};

export const useGetProject = (uid: string, pid: string, token: string, shareToken?: string) => {
  return useQuery({
    queryKey: ["project", uid, pid, token, shareToken],
    queryFn: () => fetchProject(uid, pid, token, shareToken),
    refetchOnWindowFocus: shareToken ? false : true,
    refetchOnReconnect: shareToken ? false : true,
  });
};

export const useGetProjectImages = (
  uid: string,
  pid: string,
  token: string,
  shareToken?: string,
  initialData?: ProjectImage[],
) => {
  return useQuery({
    queryKey: ["projectImages", uid, pid, token, shareToken],
    queryFn: () => getProjectImages(uid, pid, token, shareToken),
    initialData: initialData,
  });
};

export const useGetSocket = (token: string) => {
  return useQuery({
    queryKey: ["socket", token],
    queryFn: () =>
      io("http://localhost:8080", {
        auth: {
          token: token,
        },
      }),
    refetchOnWindowFocus: false,
    refetchOnMount: false,
  });
};

export const useGetProjectResults = (
  uid: string,
  pid: string,
  token: string,
  shareToken?: string,
) => {
  return useQuery({
    queryKey: ["projectResults", uid, pid, token, shareToken],
    queryFn: () => fetchProjectResults(uid, pid, token, shareToken),
    refetchOnWindowFocus: shareToken ? false : true,
    refetchOnReconnect: shareToken ? false : true,
  });
};

export const useGetActiveProcesses = (
  uid: string,
  pid: string,
  token: string,
) => {
  return useQuery({
    queryKey: ["activeProcesses", uid, pid, token],
    queryFn: () => fetchActiveProcesses(uid, pid, token),
    refetchInterval: 2000, // Refetch every 2 seconds
  });
};

export const updateToolsOrder = async (uid: string, pid: string, orderedTools: any[], token: string) => {
  const response = await api.put(
    `/projects/${uid}/${pid}/reorder`,
    orderedTools,
    {
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
    },
  );

  if (response.status !== 204 && response.status !== 200) throw new Error('Erro ao reordenar');
  return response.data;
};