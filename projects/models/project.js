const mongoose = require("mongoose");

const toolSchema = new mongoose.Schema({
  position: { type: Number, required: true },
  procedure: { type: String, required: true },
  params: { type: mongoose.Schema.Types.Mixed, required: true }, // This field can be any type of object
});

const imgSchema = new mongoose.Schema({
  og_uri: { type: String, required: true },
  new_uri: { type: String, required: true },
  og_img_key: { type: String, required: true },
});

const projectSchema = new mongoose.Schema({
  name: { type: String, required: true },
  user_id: { type: mongoose.Schema.Types.ObjectId, required: true }, // Maybe mudar para falso por causa de users anónimos, ou procurar alguma solução
  imgs: { type: [imgSchema], default: [] },
  tools: { type: [toolSchema], default: [] },
  shares: {
    type: [
      new mongoose.Schema({
        token: { type: String, required: true },
        permission: { type: String, enum: ["view", "edit"], required: true },
        created_by: { type: mongoose.Schema.Types.ObjectId, required: false },
        created_at: { type: Date, default: Date.now },
        expires_at: { type: Date, required: false },
      })
    ],
    default: [],
  },
});

module.exports = mongoose.model("project", projectSchema);
