var Project = require("../models/project");

module.exports.getAll = async (user_id) => {
  return await Project.find({ user_id: user_id }).sort({ _id: 1 }).exec();
};

module.exports.getOne = async (user_id, project_id) => {
  return await Project.findOne({ user_id: user_id, _id: project_id }).exec();
};

module.exports.create = async (project) => {
  const crypto = require('crypto');
  const shareToken = crypto.randomBytes(32).toString('hex');
  project.shareToken = shareToken;
  project.shareEnabled = true;
  return await Project.create(project);
};

module.exports.update = (user_id, project_id, project) => {
  return Project.updateOne({ user_id: user_id, _id: project_id }, project);
};

module.exports.delete = (user_id, project_id) => {
  return Project.deleteOne({ user_id: user_id, _id: project_id });
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
