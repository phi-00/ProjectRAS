const mongoose = require("mongoose");

var processSchema = new mongoose.Schema({
  user_id: { type: mongoose.Schema.Types.ObjectId, required: true },
  project_id: { type: mongoose.Schema.Types.ObjectId, required: true },
  img_id: { type: mongoose.Schema.Types.ObjectId, required: true },
  msg_id: { type: String, required: true },
  cur_pos: { type: Number, required: true },
  og_img_uri: { type: String, required: true },
  new_img_uri: { type: String, required: true },
  initiated_by: { type: mongoose.Schema.Types.ObjectId, required: false },
  status: { type: String, enum: ["processing", "completed", "cancelled", "error"], default: "processing" },
  start_time: { type: Date, default: Date.now },
  cancelled_time: { type: Date },
});

module.exports = mongoose.model("process", processSchema);
