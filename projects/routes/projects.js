var express = require("express");
var router = express.Router();
const axios = require("axios");

const multer = require("multer");
const FormData = require("form-data");

const fs = require("fs");
const fs_extra = require("fs-extra");
const path = require("path");
const mime = require("mime-types");

const JSZip = require("jszip");

const { v4: uuidv4 } = require('uuid');

const {
  send_msg_tool,
  send_msg_client,
  send_msg_client_error,
  send_msg_client_preview,
  send_msg_client_preview_error,
  read_msg,
} = require("../utils/project_msg");

const Project = require("../controllers/project");
const Process = require("../controllers/process");
const Result = require("../controllers/result");
const Preview = require("../controllers/preview");

const {
  get_image_docker,
  get_image_host,
  post_image,
  delete_image,
} = require("../utils/minio");

const storage = multer.memoryStorage();
var upload = multer({ storage: storage });

const key = fs.readFileSync(__dirname + "/../certs/selfsigned.key");
const cert = fs.readFileSync(__dirname + "/../certs/selfsigned.crt");

const https = require("https");
const httpsAgent = new https.Agent({
  rejectUnauthorized: false, // (NOTE: this will disable client verification)
  cert: cert,
  key: key,
});

const users_ms = "https://users:10001/";
const minio_domain = process.env.MINIO_DOMAIN;
const { send_rabbit_msg } = require("../utils/rabbit_mq");

const advanced_tools = [
  "cut_ai",
  "upgrade_ai",
  "bg_remove_ai",
  "text_ai",
  "obj_ai",
  "people_ai",
];

// Helper: find share entry by token
function findShare(project, token) {
  if (!project || !project.shares) return null;
  return project.shares.find((s) => s.token === token);
}

// Helper: check if share token grants required permission ('view' or 'edit')
function shareAllows(project, token, required) {
  if (!token) return false;
  const s = findShare(project, token);
  if (!s) return false;
  if (s.expires_at && new Date(s.expires_at) < new Date()) return false;
  if (required === "view") return true;
  if (required === "edit") return s.permission === "edit";
  return false;
}

// Helper: ensure request was forwarded by gateway with authenticated user equal to :user
function isOwnerRequest(req) {
  const forwarded = req.headers['x-auth-user'];
  if (!forwarded) return false;
  return String(forwarded) === String(req.params.user);
}

function advanced_tool_num(project) {
  const tools = project.tools;
  let ans = 0;

  for (let t of tools) {
    if (advanced_tools.includes(t.procedure)) ans++;
  }

  // Multiply answer by number of images to reduce chance of a single project with infinite images
  ans *= project.imgs.length;

  return ans;
}

// Resolve a project either by (user_id, project_id) or, when a share token is provided,
// by project_id alone. Also validates the share token for the required permission.
async function loadProjectWithShare(req, res, requiredPermission = 'view') {
  const shareToken = req.query.share || req.headers['x-share-token'];

  let project = await Project.getOne(req.params.user, req.params.project);

  // If not found for this user but a share token exists, try by project id only
  if (!project && shareToken) {
    project = await Project.getById(req.params.project);
  }

  if (!project) {
    res.status(404).jsonp("Project not found");
    return null;
  }

  if (shareToken) {
    if (!shareAllows(project, shareToken, requiredPermission)) {
      res.status(403).jsonp('Invalid or expired share token');
      return null;
    }
  }

  return project;
}

// TODO process message according to type of output
function process_msg() {
  read_msg(async (msg) => {
    try {
      const msg_content = JSON.parse(msg.content.toString());
      const msg_id = msg_content.correlationId;
      const timestamp = new Date().toISOString();

      const user_msg_id = `update-client-process-${uuidv4()}`;

      const process = await Process.getOne(msg_id);

      const prev_process_input_img = process.og_img_uri;
      const prev_process_output_img = process.new_img_uri;
      
      // Get current process, delete it and create it's sucessor if possible
      const og_img_uri = process.og_img_uri;
      const img_id = process.img_id;
      
      await Process.delete(process.user_id, process.project_id, process._id);
      
      if (msg_content.status === "error") {
        console.log(JSON.stringify(msg_content));
        if (/preview/.test(msg_id)) {
          send_msg_client_preview_error(`update-client-preview-${uuidv4()}`, timestamp, process.user_id, msg_content.error.code, msg_content.error.msg)
        }
        
        else {
          send_msg_client_error(
            user_msg_id,
            timestamp,
            process.user_id,
            msg_content.error.code,
            msg_content.error.msg
          );
        }
        return;
      }
      
      const output_file_uri = msg_content.output.imageURI;
      const type = msg_content.output.type;
      const project = await Project.getOne(process.user_id, process.project_id);

      const next_pos = process.cur_pos + 1;

      if (/preview/.test(msg_id) && (type == "text" || next_pos >= project.tools.length)) {
        const file_path = path.join(__dirname, `/../${output_file_uri}`);
        const file_name = path.basename(file_path);
        const fileStream = fs.createReadStream(file_path); // Use createReadStream for efficiency

        const data = new FormData();
        await data.append(
          "file",
          fileStream,
          path.basename(file_path),
          mime.lookup(file_path)
        );

        const resp = await post_image(
          process.user_id,
          process.project_id,
          "preview",
          data
        );

        const og_key_tmp = resp.data.data.imageKey.split("/");
        const og_key = og_key_tmp[og_key_tmp.length - 1];

        
        const preview = {
          type: type,
          file_name: file_name,
          img_key: og_key,
          img_id: img_id,
          project_id: process.project_id,
          user_id: process.user_id,
        };
        
        await Preview.create(preview);

        if(next_pos >= project.tools.length){
          const previews = await Preview.getAll(process.user_id, process.project_id);

          let urls = {
            'imageUrl': '',
            'textResults': []
          };

          for(let p of previews){
            const url_resp = await get_image_host(
              process.user_id,
              process.project_id,
              "preview",
              p.img_key
            );

            const url = url_resp.data.url;

            if(p.type != "text") urls.imageUrl = url;

            else urls.textResults.push(url);
          }
          
          send_msg_client_preview(
            `update-client-preview-${uuidv4()}`,
            timestamp,
            process.user_id,
            JSON.stringify(urls)
          );

        }
      }

      if(/preview/.test(msg_id) && next_pos >= project.tools.length) return;

      if (!/preview/.test(msg_id))
        send_msg_client(
          user_msg_id,
          timestamp,
          process.user_id
        );

      if (!/preview/.test(msg_id) && (type == "text" || next_pos >= project.tools.length)) {
        const file_path = path.join(__dirname, `/../${output_file_uri}`);
        const file_name = path.basename(file_path);
        const fileStream = fs.createReadStream(file_path); // Use createReadStream for efficiency

        const data = new FormData();
        await data.append(
          "file",
          fileStream,
          path.basename(file_path),
          mime.lookup(file_path)
        );

        const resp = await post_image(
          process.user_id,
          process.project_id,
          "out",
          data
        );

        const og_key_tmp = resp.data.data.imageKey.split("/");
        const og_key = og_key_tmp[og_key_tmp.length - 1];

        const result = {
          type: type,
          file_name: file_name,
          img_key: og_key,
          img_id: img_id,
          project_id: process.project_id,
          user_id: process.user_id,
        };

        await Result.create(result);
      }

      if (next_pos >= project.tools.length) return;

      const new_msg_id = /preview/.test(msg_id)
        ? `preview-${uuidv4()}`
        : `request-${uuidv4()}`;

      const tool = project.tools.filter((t) => t.position == next_pos)[0];

      const tool_name = tool.procedure;
      const params = tool.params;

      const read_img = type == "text" ? prev_process_input_img : output_file_uri;
      const output_img = type == "text" ? prev_process_output_img : output_file_uri;

      const new_process = {
        user_id: project.user_id,
        project_id: project._id,
        img_id: img_id,
        msg_id: new_msg_id,
        cur_pos: next_pos,
        og_img_uri: read_img,
        new_img_uri: output_img,
      };

      // Making sure database entry is created before sending message to avoid conflicts
      await Process.create(new_process);
      send_msg_tool(
        new_msg_id,
        timestamp,
        new_process.og_img_uri,
        new_process.new_img_uri,
        tool_name,
        params
      );
    } catch (_) {
      send_msg_client_error(
        user_msg_id,
        timestamp,
        process.user_id,
        "30000",
        "An error happened while processing the project"
      );
      return;
    }
  });
}

// Get list of all projects from a user
router.get("/:user", (req, res, next) => {
  Project.getAll(req.params.user)
    .then((projects) => {
      const ans = [];

      for (let p of projects) {
        ans.push({
          _id: p._id,
          name: p.name,
        });
      }

      res.status(200).jsonp(ans);
    })
    .catch((_) => res.status(500).jsonp("Error acquiring user's projects"));
});

// Get a specific user's project (supports share token)
router.get("/:user/:project", async (req, res, next) => {
  try {
    const project = await loadProjectWithShare(req, res, 'view');
    if (!project) return;

    const ownerId = project.user_id;
    const projectId = project._id;

    const response = {
      _id: project._id,
      name: project.name,
      tools: project.tools,
      imgs: [],
    };

    for (let img of project.imgs) {
      try {
        const resp = await get_image_host(
          ownerId,
          projectId,
          "src",
          img.og_img_key
        );
        const url = resp.data.url;

        response["imgs"].push({
          _id: img._id,
          name: path.basename(img.og_uri),
          url: url,
        });
      } catch (_) {
        res.status(404).jsonp(`Error acquiring image's url`);
        return;
      }
    }

    res.status(200).jsonp(response);
  } catch (_) {
    res.status(501).jsonp(`Error acquiring user's project`);
  }
});

  // Create a share link for a project (permission: 'view' or 'edit')
  router.post('/:user/:project/share', (req, res, next) => {
    // service-level owner check
    if (!isOwnerRequest(req)) {
      res.status(401).jsonp('Only project owner can create share links');
      return;
    }
    const permission = req.body.permission;
    const expiresInDays = req.body.expiresInDays;

    if (!permission || !['view', 'edit'].includes(permission)) {
      res.status(400).jsonp('Invalid permission');
      return;
    }

    Project.getOne(req.params.user, req.params.project)
      .then(async (project) => {
        if (!project.shares) project.shares = [];
        const token = uuidv4();
        const share = {
          token: token,
          permission: permission,
        };

        if (req.body.created_by) share.created_by = req.body.created_by;
        if (expiresInDays && Number.isInteger(expiresInDays))
          share.expires_at = new Date(Date.now() + expiresInDays * 24 * 60 * 60 * 1000);

        project.shares.push(share);

        Project.update(req.params.user, req.params.project, project)
          .then((_) => {
            // notify wsGateway via rabbitmq
            try {
              const msg = {
                messageId: `share-created-${uuidv4()}`,
                timestamp: new Date().toISOString(),
                status: "ok",
                user: req.params.user,
                data: { token: token, permission: permission, created_by: share.created_by || null, expires_at: share.expires_at || null },
              };
              send_rabbit_msg(msg, 'ws_queue');
            } catch (e) {
              // ignore notification errors
            }
            res.status(201).jsonp({ token: token });
          })
          .catch((_) => res.status(503).jsonp('Error creating share'));
      })
      .catch((_) => res.status(501).jsonp('Error acquiring user project'));
  });

  // List share links for a project
  router.get('/:user/:project/shares', (req, res, next) => {
    // service-level owner check
    if (!isOwnerRequest(req)) {
      res.status(401).jsonp('Only project owner can list share links');
      return;
    }
    Project.getOne(req.params.user, req.params.project)
      .then((project) => {
        const shares = project && Array.isArray(project.shares) ? project.shares : [];
        res.status(200).jsonp(shares);
      })
      .catch((_) => res.status(501).jsonp('Error acquiring user project'));
  });

  // Delete a share link by token
  router.delete('/:user/:project/share/:token', (req, res, next) => {
    // service-level owner check
    if (!isOwnerRequest(req)) {
      res.status(401).jsonp('Only project owner can delete share links');
      return;
    }
    Project.getOne(req.params.user, req.params.project)
      .then((project) => {
        const shares = project && Array.isArray(project.shares) ? project.shares : [];
        const removed = shares.filter((s) => s.token === req.params.token)[0];
        project.shares = shares.filter((s) => s.token !== req.params.token);
        Project.update(req.params.user, req.params.project, project)
          .then((_) => {
            try {
              const msg = {
                messageId: `share-deleted-${uuidv4()}`,
                timestamp: new Date().toISOString(),
                status: "ok",
                user: req.params.user,
                data: { token: req.params.token, permission: removed ? removed.permission : null },
              };
              send_rabbit_msg(msg, 'ws_queue');
            } catch (e) {
              // ignore
            }
            res.sendStatus(204);
          })
          .catch((_) => res.status(503).jsonp('Error deleting share'));
      })
      .catch((_) => res.status(501).jsonp('Error acquiring user project'));
  });
// Get a specific project's image
router.get("/:user/:project/img/:img", async (req, res, next) => {
  try {
    const project = await loadProjectWithShare(req, res, 'view');
    if (!project) return;

    const ownerId = project.user_id;
    const projectId = project._id;

    try {
      const img = project.imgs.filter((i) => i._id == req.params.img)[0];
      const resp = await get_image_host(
        ownerId,
        projectId,
        "src",
        img.og_img_key
      );
      res.status(200).jsonp({
        _id: img._id,
        name: path.basename(img.og_uri),
        url: resp.data.url,
      });
    } catch (_) {
      res.status(404).jsonp("No image with such id.");
    }
  } catch (_) {
    res.status(501).jsonp(`Error acquiring user's project`);
  }
});

// Get project images
router.get("/:user/:project/imgs", async (req, res, next) => {
  try {
    const project = await loadProjectWithShare(req, res, 'view');
    if (!project) return;

    const ownerId = project.user_id;
    const projectId = project._id;

    try {
      const ans = [];

      for (let img of project.imgs) {
        try {
          const resp = await get_image_host(
            ownerId,
            projectId,
            "src",
            img.og_img_key
          );
          const url = resp.data.url;

          ans.push({
            _id: img._id,
            name: path.basename(img.og_uri),
            url: url,
          });
        } catch (_) {
          res.status(404).jsonp(`Error acquiring image's url`);
          return;
        }
      }
      res.status(200).jsonp(ans);
    } catch (_) {
      res.status(404).jsonp("No image with such id.");
    }
  } catch (_) {
    res.status(501).jsonp(`Error acquiring user's project`);
  }
});

// Get results of processing a project
router.get("/:user/:project/process", async (req, res, next) => {
  try {
    const project = await loadProjectWithShare(req, res, 'view');
    if (!project) return;

    const ownerId = project.user_id;
    const projectId = project._id;

    const zip = new JSZip();
    const results = await Result.getAll(ownerId, projectId);

    const result_path = `/../images/users/${ownerId}/projects/${projectId}/tmp`;

    fs.mkdirSync(path.join(__dirname, result_path), { recursive: true });

    for (let r of results) {
      const res_path = path.join(__dirname, result_path, r.file_name);

      const resp = await get_image_docker(
        r.user_id,
        r.project_id,
        "out",
        r.img_key
      );
      const url = resp.data.url;

      const file_resp = await axios.get(url, { responseType: "stream" });
      const writer = fs.createWriteStream(res_path);

      // Use a Promise to handle the stream completion
      await new Promise((resolve, reject) => {
        writer.on("finish", resolve);
        writer.on("error", reject);
        file_resp.data.pipe(writer); // Pipe AFTER setting up the event handlers
      });

      const fs_res = fs.readFileSync(res_path);
      zip.file(r.file_name, fs_res);
    }

    fs.rmSync(path.join(__dirname, result_path), {
      recursive: true,
      force: true,
    });

    const ans = await zip.generateAsync({ type: "blob" });

    res.type(ans.type);
    res.set(
      "Content-Disposition",
      `attachment; filename=user_${ownerId}_project_${projectId}_results.zip`
    );
    const b = await ans.arrayBuffer();
    res.status(200).send(Buffer.from(b));
  } catch (_) {
    res.status(601).jsonp(`Error acquiring project's processing result`);
  }
});


// Get results of processing a project
router.get("/:user/:project/process/url", async (req, res, next) => {
  try {
    const project = await loadProjectWithShare(req, res, 'view');
    if (!project) return;

    const ans = {
      'imgs': [],
      'texts': []
    };
    const results = await Result.getAll(project.user_id, project._id);

    for (let r of results) {
      const resp = await get_image_host(
        r.user_id,
        r.project_id,
        "out",
        r.img_key
      );
      const url = resp.data.url;

      if(r.type == 'text') ans.texts.push({ og_img_id : r.img_id, name: r.file_name, url: url })

      else ans.imgs.push({ og_img_id : r.img_id, name: r.file_name, url: url })
    }

    res.status(200).jsonp(ans);
  } catch (_) {
    res.status(601).jsonp(`Error acquiring project's processing result`);
  }
});


// Get number of advanced tools used in a project
router.get("/:user/:project/advanced_tools", (req, res, next) => {
  // Getting last processed request from project in order to get their result's path
  Project.getOne(req.params.user, req.params.project)
    .then((project) => {
      const tools = project.tools;
      let ans = 0;

      for (let t of tools) {
        if (advanced_tools.includes(t.procedure)) ans++;
      }

      // Multiply answer by number of images to reduce chance of a single project with infinite images
      ans *= project.imgs.length;
      res.status(200).jsonp(ans);
    })
    .catch((_) => res.status(501).jsonp(`Error acquiring user's project`));
});

// Create new project
router.post("/:user", (req, res, next) => {
  const project = {
    name: req.body.name,
    user_id: req.params.user,
    imgs: [],
    tools: [],
  };

  Project.create(project)
    .then((project) => res.status(201).jsonp(project))
    .catch((_) => res.status(502).jsonp(`Error creating new project`));
});

// Preview an image
router.post("/:user/:project/preview/:img", (req, res, next) => {
  // Get project and create a new process entry
  console.log("entrou")
  console.log(req.params.user, req.params.project, req.params.img)
  Project.getOne(req.params.user, req.params.project)
    .then(async (project) => {
      const prev_preview = await Preview.getAll(
        req.params.user,
        req.params.project
      );

      for(let p of prev_preview){
        await delete_image(
          req.params.user,
          req.params.project,
          "preview",
          p.img_key
        );
        await Preview.delete(
          req.params.user,
          req.params.project,
          p.img_id
        );
      }

      // Remove previous preview
      if (prev_preview !== null && prev_preview !== undefined) {
      }

      const source_path = `/../images/users/${req.params.user}/projects/${req.params.project}/src`;
      const result_path = `/../images/users/${req.params.user}/projects/${req.params.project}/preview`;

      if (!fs.existsSync(path.join(__dirname, source_path)))
        fs.mkdirSync(path.join(__dirname, source_path), { recursive: true });

      if (!fs.existsSync(path.join(__dirname, result_path)))
        fs.mkdirSync(path.join(__dirname, result_path), { recursive: true });

      // Retrive image information
      const img = project.imgs.filter((i) => i._id == req.params.img)[0];
      const msg_id = `preview-${uuidv4()}`;
      const timestamp = new Date().toISOString();
      const og_img_uri = img.og_uri;
      const img_id = img._id;

      // Retrieve image and store it using file system
      const resp = await get_image_docker(
        req.params.user,
        req.params.project,
        "src",
        img.og_img_key
      );
      const url = resp.data.url;

      const img_resp = await axios.get(url, { responseType: "stream" });

      const writer = fs.createWriteStream(og_img_uri);

      // Use a Promise to handle the stream completion
      await new Promise((resolve, reject) => {
        writer.on("finish", resolve);
        writer.on("error", reject);
        img_resp.data.pipe(writer); // Pipe AFTER setting up the event handlers
      });

      const img_name_parts = img.new_uri.split("/");
      const img_name = img_name_parts[img_name_parts.length - 1];
      const new_img_uri = `./images/users/${req.params.user}/projects/${req.params.project}/preview/${img_name}`;

      const tool = project.tools.filter((t) => t.position == 0)[0];
      const tool_name = tool.procedure;
      const params = tool.params;

      const process = {
        user_id: req.params.user,
        project_id: req.params.project,
        img_id: img_id,
        msg_id: msg_id,
        cur_pos: 0,
        og_img_uri: og_img_uri,
        new_img_uri: new_img_uri,
      };

      // Making sure database entry is created before sending message to avoid conflicts
      Process.create(process)
        .then((_) => {
          send_msg_tool(
            msg_id,
            timestamp,
            og_img_uri,
            new_img_uri,
            tool_name,
            params
          );
          res.sendStatus(201);
        })
        .catch((_) =>
          res.status(603).jsonp(`Error creating preview process request`)
        );
    })
    .catch((_) => res.status(501).jsonp(`Error acquiring user's project`));
});

// Add new image to a project
router.post(
  "/:user/:project/img",
  upload.single("image"),
  async (req, res, next) => {
    if (!req.file) {
      res.status(400).jsonp("No file found");
      return;
    }

    Project.getOne(req.params.user, req.params.project)
      .then(async (project) => {
        // If share token present, require edit permission
        const shareToken = req.query.share || req.headers['x-share-token'];
        if (shareToken && !shareAllows(project, shareToken, 'edit')) {
          res.status(403).jsonp('Share token does not allow edit');
          return;
        }
        const same_name_img = project.imgs.filter(
          (i) => path.basename(i.og_uri) == req.file.originalname
        );

        if (same_name_img.length > 0) {
          res
            .status(400)
            .jsonp("This project already has an image with that name.");
          return;
        }

        try {
          const data = new FormData();
          data.append("file", req.file.buffer, {
            filename: req.file.originalname,
            contentType: req.file.mimetype,
          });
          const resp = await post_image(
            req.params.user,
            req.params.project,
            "src",
            data
          );

          const og_key_tmp = resp.data.data.imageKey.split("/");
          const og_key = og_key_tmp[og_key_tmp.length - 1];

          try {
            const og_uri = `./images/users/${req.params.user}/projects/${req.params.project}/src/${req.file.originalname}`;
            const new_uri = `./images/users/${req.params.user}/projects/${req.params.project}/out/${req.file.originalname}`;

            // Insert new image
            project["imgs"].push({
              og_uri: og_uri,
              new_uri: new_uri,
              og_img_key: og_key,
            });

            Project.update(req.params.user, req.params.project, project)
              .then((_) => res.sendStatus(204))
              .catch((_) =>
                res.status(503).jsonp(`Error updating project information`)
              );
          } catch (_) {
            res.status(501).jsonp(`Updating project information`);
          }
        } catch (_) {
          res.status(501).jsonp(`Error storing image`);
        }
      })
      .catch((_) => res.status(501).jsonp(`Error acquiring user's project`));
  }
);

// Add new tool to a project
router.post("/:user/:project/tool", (req, res, next) => {
  // Reject posts to tools that don't fullfil the requirements
  if (!req.body.procedure || !req.body.params) {
    res
      .status(400)
      .jsonp(`A tool should have a procedure and corresponding parameters`);
    return;
  }

  let required_types = ["free", "premium"];

  if (!advanced_tools.includes(req.body.procedure))
    required_types.push("anonymous");

  const shareToken = req.query.share || req.headers['x-share-token'];
  if (shareToken) {
    // If using a share token, require edit permission and skip owner-type check
    Project.getOne(req.params.user, req.params.project)
      .then((project) => {
        if (!shareAllows(project, shareToken, 'edit')) {
          res.status(403).jsonp('Share token does not allow edit');
          return;
        }

        const tool = {
          position: project['tools'].length,
          ...req.body,
        };

        project['tools'].push(tool);

        Project.update(req.params.user, req.params.project, project)
          .then((_) => res.sendStatus(204))
          .catch((_) => res.status(503).jsonp(`Error updating project information`));
      })
      .catch((_) => res.status(501).jsonp(`Error acquiring user's project`));
  } else {
    axios
      .get(users_ms + `${req.params.user}/type`, { httpsAgent: httpsAgent })
      .then((resp) => {
        // Check user type before proceeding
        if (!required_types.includes(resp.data.type)) {
          return res.status(403).jsonp(`User type can't use this tool`); // Return a 403 Forbidden
        }

        // Get project and insert new tool
        Project.getOne(req.params.user, req.params.project)
          .then((project) => {
            const tool = {
              position: project['tools'].length,
              ...req.body,
            };

            project['tools'].push(tool);

            Project.update(req.params.user, req.params.project, project)
              .then((_) => res.sendStatus(204))
              .catch((_) =>
                res.status(503).jsonp(`Error updating project information`)
              );
          })
          .catch((_) => res.status(501).jsonp(`Error acquiring user's project`));
      })
      .catch((_) => res.send(401).jsonp(`Error accessing picturas-user-ms`));
  }
});

// Reorder tools of a project
router.post("/:user/:project/reorder", (req, res, next) => {
  // Remove all tools from project and reinsert them according to new order
  Project.getOne(req.params.user, req.params.project)
    .then((project) => {
      const shareToken = req.query.share || req.headers['x-share-token'];
      if (shareToken && !shareAllows(project, shareToken, 'edit')) {
        res.status(403).jsonp('Share token does not allow edit');
        return;
      }
      project["tools"] = [];

      for (let t of req.body) {
        const tool = {
          position: project["tools"].length,
          ...t,
        };

        project["tools"].push(tool);
      }

      Project.update(req.params.user, req.params.project, project)
        .then((project) => res.status(204).jsonp(project))
        .catch((_) =>
          res.status(503).jsonp(`Error updating project information`)
        );
    })
    .catch((_) => res.status(501).jsonp(`Error acquiring user's project`));
});

// Process a specific project
router.post("/:user/:project/process", (req, res) => {
  Project.getOne(req.params.user, req.params.project)
    .then(async (project) => {
      const shareToken = req.query.share || req.headers["x-share-token"];

      if (shareToken && !shareAllows(project, shareToken, "edit")) {
        return res.status(403).jsonp("Share token does not allow edit");
      }

      // Delete previous results
      try {
        const prev_results = await Result.getAll(
          req.params.user,
          req.params.project
        );

        for (const r of prev_results) {
          await delete_image(
            req.params.user,
            req.params.project,
            "out",
            r.img_key
          );
          await Result.delete(r.user_id, r.project_id, r.img_id);
        }
      } catch {
        return res.status(400).jsonp("Error deleting previous results");
      }

      if (!project.tools || project.tools.length === 0) {
        return res.status(400).jsonp("No tools selected");
      }

      const adv_tools = advanced_tool_num(project);
      const usingShare = !!shareToken;

      // Check quota only if NOT using share
      if (!usingShare) {
        try {
          const quotaResp = await axios.get(
            users_ms + `${req.params.user}/process/${adv_tools}`,
            { httpsAgent }
          );

          if (!quotaResp.data) {
            return res
              .status(404)
              .jsonp("No more daily_operations available");
          }
        } catch {
          return res.status(400).jsonp("Error checking if can process");
        }
      }

      const source_path = `/../images/users/${req.params.user}/projects/${req.params.project}/src`;
      const result_path = `/../images/users/${req.params.user}/projects/${req.params.project}/out`;

      // Reset folders
      for (const p of [source_path, result_path]) {
        const fullPath = path.join(__dirname, p);
        if (fs.existsSync(fullPath)) {
          fs.rmSync(fullPath, { recursive: true, force: true });
        }
        fs.mkdirSync(fullPath, { recursive: true });
      }

      let error = false;

      for (const img of project.imgs) {
        try {
          const resp = await get_image_docker(
            req.params.user,
            req.params.project,
            "src",
            img.og_img_key
          );

          const imgResp = await axios.get(resp.data.url, {
            responseType: "stream",
          });

          const writer = fs.createWriteStream(img.og_uri);

          await new Promise((resolve, reject) => {
            writer.on("finish", resolve);
            writer.on("error", reject);
            imgResp.data.pipe(writer);
          });

          const msg_id = `request-${uuidv4()}`;
          const timestamp = new Date().toISOString();

          const tool = project.tools.find((t) => t.position === 0);

          const process = {
            user_id: req.params.user,
            project_id: req.params.project,
            img_id: img._id,
            msg_id,
            cur_pos: 0,
            og_img_uri: img.og_uri,
            new_img_uri: img.new_uri,
          };

          await Process.create(process);

          send_msg_tool(
            msg_id,
            timestamp,
            img.og_uri,
            img.new_uri,
            tool.procedure,
            tool.params
          );
        } catch {
          error = true;
        }
      }

      if (error) {
        return res.status(603).jsonp(
          "There were some errors creating all process requests. Some results can be invalid."
        );
      }

      res.sendStatus(201);
    })
    .catch(() => {
      res.status(501).jsonp("Error acquiring user's project");
    });
});


// Update a specific project
router.put("/:user/:project", (req, res, next) => {
  Project.getOne(req.params.user, req.params.project)
    .then((project) => {
      const shareToken = req.query.share || req.headers['x-share-token'];
      if (shareToken && !shareAllows(project, shareToken, 'edit')) {
        res.status(403).jsonp('Share token does not allow edit');
        return;
      }
      project.name = req.body.name || project.name;
      Project.update(req.params.user, req.params.project, project)
        .then((_) => res.sendStatus(204))
        .catch((_) =>
          res.status(503).jsonp(`Error updating project information`)
        );
    })
    .catch((_) => res.status(501).jsonp(`Error acquiring user's project`));
});

// Update a tool from a specific project
router.put("/:user/:project/tool/:tool", (req, res, next) => {
  // Get project and update required tool with new data, keeping it's original position and procedure
  Project.getOne(req.params.user, req.params.project)
    .then((project) => {
      const shareToken = req.query.share || req.headers['x-share-token'];
      if (shareToken && !shareAllows(project, shareToken, 'edit')) {
        res.status(403).jsonp('Share token does not allow edit');
        return;
      }
      try {
        const tool_pos = project["tools"].findIndex(
          (i) => i._id == req.params.tool
        );
        const prev_tool = project["tools"][tool_pos];

        project["tools"][tool_pos] = {
          position: prev_tool.position,
          procedure: prev_tool.procedure,
          params: req.body.params,
          _id: prev_tool._id,
        };

        Project.update(req.params.user, req.params.project, project)
          .then((_) => res.sendStatus(204))
          .catch((_) =>
            res.status(503).jsonp(`Error updating project information`)
          );
      } catch (_) {
        res
          .status(599)
          .jsonp(`Error updating tool. Make sure such tool exists`);
      }
    })
    .catch((_) => res.status(501).jsonp(`Error acquiring user's project`));
});

// Delete a project
router.delete("/:user/:project", (req, res, next) => {
  Project.getOne(req.params.user, req.params.project).then(async (project) => {
    const shareToken = req.query.share || req.headers['x-share-token'];
    if (shareToken && !shareAllows(project, shareToken, 'edit')) {
      res.status(403).jsonp('Share token does not allow edit');
      return;
    }
    // Remove all images related to the project from the file system
    const previous_img = JSON.parse(JSON.stringify(project["imgs"]));
    for (let img of previous_img) {
      await delete_image(
        req.params.user,
        req.params.project,
        "src",
        img.og_img_key
      );
      project["imgs"].remove(img); // Not really needed, but in case of error serves as reference point
    }

    const results = await Result.getAll(req.params.user, req.params.project);

    const previews = await Preview.getAll(req.params.user, req.params.project);

    for (let r of results) {
      await delete_image(req.params.user, req.params.project, "out", r.img_key);
      await Result.delete(r.user_id, r.project_id, r.img_id);
    }

    for (let p of previews) {
      await delete_image(
        req.params.user,
        req.params.project,
        "preview",
        p.img_key
      );
      await Preview.delete(p.user_id, p.project_id, p.img_id);
    }

    Project.delete(req.params.user, req.params.project)
      .then((_) => res.sendStatus(204))
      .catch((_) => res.status(504).jsonp(`Error deleting user's project`));
  });
});

// Delete an image from a project
router.delete("/:user/:project/img/:img", (req, res, next) => {
  // Get project and delete specified image
  Project.getOne(req.params.user, req.params.project)
    .then(async (project) => {
      const shareToken = req.query.share || req.headers['x-share-token'];
      if (shareToken && !shareAllows(project, shareToken, 'edit')) {
        res.status(403).jsonp('Share token does not allow edit');
        return;
      }
      try {
        const img = project["imgs"].filter((i) => i._id == req.params.img)[0];

        await delete_image(
          req.params.user,
          req.params.project,
          "src",
          img.og_img_key
        );
        project["imgs"].remove(img);

        const results = await Result.getOne(
          req.params.user,
          req.params.project,
          img._id
        );

        const previews = await Preview.getOne(
          req.params.user,
          req.params.project,
          img._id
        );

        if (results !== null && results !== undefined) {
          await delete_image(
            req.params.user,
            req.params.project,
            "out",
            results.img_key
          );
          await Result.delete(
            results.user_id,
            results.project_id,
            results.img_id
          );
        }

        if (previews !== null && previews !== undefined) {
          await delete_image(
            req.params.user,
            req.params.project,
            "preview",
            previews.img_key
          );
          await Preview.delete(
            previews.user_id,
            previews.project_id,
            previews.img_id
          );
        }

        Project.update(req.params.user, req.params.project, project)
          .then((_) => res.sendStatus(204))
          .catch((_) =>
            res.status(503).jsonp(`Error updating project information`)
          );
      } catch (_) {
        res.status(400).jsonp(`Error deleting image information.`);
      }
    })
    .catch((_) => res.status(501).jsonp(`Error acquiring user's project`));
});

// Delete a tool from a project
router.delete("/:user/:project/tool/:tool", (req, res, next) => {
  // Get project and delete specified tool, updating the position of all tools that follow
  Project.getOne(req.params.user, req.params.project)
    .then((project) => {
      const shareToken = req.query.share || req.headers['x-share-token'];
      if (shareToken && !shareAllows(project, shareToken, 'edit')) {
        res.status(403).jsonp('Share token does not allow edit');
        return;
      }
      try {
        const tool = project["tools"].filter(
          (i) => i._id == req.params.tool
        )[0];

        project["tools"].remove(tool);

        for (let i = 0; i < project["tools"].length; i++) {
          if (project["tools"][i].position > tool.position)
            project["tools"][i].position--;
        }

        Project.update(req.params.user, req.params.project, project)
          .then((_) => res.sendStatus(204))
          .catch((_) =>
            res.status(503).jsonp(`Error updating project information`)
          );
      } catch (_) {
        res.status(400).jsonp(`Error deleting tool's information`);
      }
    })
    .catch((_) => res.status(501).jsonp(`Error acquiring user's project`));
});

module.exports = { router, process_msg };
