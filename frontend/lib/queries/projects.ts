import { useQuery } from "@tanstack/react-query";
import {
  fetchProjects,
  fetchProject,
  getProjectImages,
  ProjectImage,
  fetchProjectResults,
} from "../projects";
import { io } from "socket.io-client";

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
  });
};
