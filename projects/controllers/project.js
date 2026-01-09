var Project = require("../models/project");
const projectMsg = require("../utils/project_msg");

module.exports.getAll = async (user_id) => {
  return await Project.find({ user_id: user_id }).sort({ _id: 1 }).exec();
};

module.exports.getOne = async (user_id, project_id) => {
  return await Project.findOne({ user_id: user_id, _id: project_id }).exec();
};

module.exports.getById = async (project_id) => {
  return await Project.findOne({ _id: project_id }).exec();
};

module.exports.create = async (project) => {
  const crypto = require('crypto');
  const shareToken = crypto.randomBytes(32).toString('hex');
  project.shareToken = shareToken;
  project.shareEnabled = true;
  return await Project.create(project);
};

module.exports.update = async (user_id, project_id, data) => {
  // 🔥 GARANTIR QUE TOOLS FICAM COM POSITION CORRETA
  if (data.tools) {
    data.tools = data.tools.map((tool, index) => ({
      ...tool,
      position: index,
    }));
  }

  return Project.updateOne(
    { user_id: user_id, _id: project_id },
    { $set: data }
  );
};

module.exports.delete = (user_id, project_id) => {
  return Project.deleteOne({ user_id: user_id, _id: project_id });
};

module.exports.processPipeline = async (user_id, project_id) => {
  // 1. Procurar o projeto fresco na BD para garantir que temos as posições novas
  const project = await Project.findOne({ user_id, _id: project_id }).exec();
  if (!project) throw new Error("Project not found");

  // 2. T-06: Ordenar obrigatoriamente pelo campo position antes de enviar para o RabbitMQ
  const sortedTools = project.tools.sort((a, b) => (a.position ?? 0) - (b.position ?? 0));

  for (const img of project.imgs) {
    let currentInput = img.og_uri;

    for (let i = 0; i < sortedTools.length; i++) {
      const step = sortedTools[i];
      const isLastStep = i === sortedTools.length - 1;
      
      // Define o destino: se for o último filtro, vai para o destino final (new_uri)
      const nextOutput = isLastStep 
        ? img.new_uri 
        : `projects/${project_id}/temp_step_${i}_${Date.now()}.png`;

      // Envia para o RabbitMQ respeitando a nova ordem
      projectMsg.send_msg_tool(
        `msg-${Date.now()}-${i}`, 
        new Date().toISOString(), 
        currentInput, 
        nextOutput, 
        step.procedure, 
        step.params
      );

      currentInput = nextOutput;
    }
  }
};
module.exports.generateShareToken = async (user_id, project_id) => {
  const crypto = require('crypto');
  const shareToken = crypto.randomBytes(32).toString('hex');
  await Project.updateOne(
    { user_id: user_id, _id: project_id },
    { shareToken: shareToken, shareEnabled: true }
  );
  return shareToken;
};

module.exports.disableShare = async (user_id, project_id) => {
  await Project.updateOne(
    { user_id: user_id, _id: project_id },
    { shareToken: null, shareEnabled: false }
  );
};

module.exports.getByShareToken = async (shareToken) => {
  return await Project.findOne({ shareToken: shareToken, shareEnabled: true }).exec();
};
