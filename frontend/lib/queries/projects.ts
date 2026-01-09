import { useQuery } from "@tanstack/react-query";
import {
  fetchProjects,
  fetchProject,
  getProjectImages,
  ProjectImage,
  fetchProjectResults,
} from "../projects";
import { io } from "socket.io-client";
import { api } from "../axios";

export const useGetProjects = (uid: string, token: string) => {
  return useQuery({
    queryKey: ["projects", uid, token],
    queryFn: () => fetchProjects(uid, token),
  });
};

export const useGetProject = (uid: string, pid: string, token: string) => {
  return useQuery({
    queryKey: ["project", uid, pid, token],
    queryFn: () => fetchProject(uid, pid, token),
  });
};

export const useGetProjectImages = (
  uid: string,
  pid: string,
  token: string,
  initialData?: ProjectImage[],
) => {
  return useQuery({
    queryKey: ["projectImages", uid, pid, token],
    queryFn: () => getProjectImages(uid, pid, token),
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
) => {
  return useQuery({
    queryKey: ["projectResults", uid, pid, token],
    queryFn: () => fetchProjectResults(uid, pid, token),
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