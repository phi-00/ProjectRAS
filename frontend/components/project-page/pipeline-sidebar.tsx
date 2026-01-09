import React, { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { ArrowUp, ArrowDown } from "lucide-react";
import { updateToolsOrder } from "@/lib/queries/projects";

export type Tool = {
  _id: string;
  position: number;
  procedure: string;
};

export const PipelineSidebar = ({ project, token, userId }: any) => {
  // 🔹 STATE LOCAL É A FONTE DA VERDADE
  const [tools, setTools] = useState<Tool[]>([]);

  // 🔹 Inicializa tools a partir do projeto
  useEffect(() => {
    if (project?.tools) {
      const sorted = [...project.tools].sort(
        (a: Tool, b: Tool) => a.position - b.position
      );
      setTools(sorted);
    }
  }, [project]);

  const handleMove = async (index: number, direction: "up" | "down") => {
    const newTools = [...tools];

    const targetIndex = direction === "up" ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= newTools.length) return;

    // 🔹 Troca no FRONTEND
    [newTools[index], newTools[targetIndex]] = [
      newTools[targetIndex],
      newTools[index],
    ];

    // 🔹 Atualiza posições
    const reordered = newTools.map((tool, i) => ({
      ...tool,
      position: i,
    }));

    // 🔹 Atualiza UI imediatamente
    setTools(reordered);

    // 🔹 Atualiza BACKEND (usar userId passado como prop como fallback)
    try {
      const uid = project?.user_id ?? userId;
      console.log("PipelineSidebar: updateToolsOrder uid, pid", uid, project?._id);
      if (!uid) throw new Error("Missing user id for reorder");
      await updateToolsOrder(uid, project._id, reordered, token);
    } catch (err) {
      console.error("Failed to update tools order:", err);
    }
  };

  return (
    <div className="flex flex-col flex-1 bg-white">
      <div className="p-4 border-b bg-slate-50">
        <h3 className="text-xs font-bold uppercase text-slate-500">
          Pipeline de Edição
        </h3>
      </div>

      <div className="flex-1 overflow-y-auto p-2 flex flex-col gap-2">
        {tools.map((tool, index) => (
          <div
            key={tool._id}
            className="group flex items-center justify-between p-2 bg-slate-100 rounded-md border border-slate-200"
          >
            <span className="text-xs font-semibold truncate capitalize ml-1">
              {index + 1}. {(tool.procedure ?? "").replace("_ai", "")}
            </span>

            <div className="flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6"
                onClick={() => handleMove(index, "up")}
                disabled={index === 0}
              >
                <ArrowUp className="size-3" />
              </Button>

              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6"
                onClick={() => handleMove(index, "down")}
                disabled={index === tools.length - 1}
              >
                <ArrowDown className="size-3" />
              </Button>
            </div>
          </div>
        ))}

        {tools.length === 0 && (
          <p className="text-[10px] text-center text-slate-400 mt-4 px-2 italic">
            Selecione filtros na barra à esquerda para começar.
          </p>
        )}
      </div>
    </div>
  );
};
