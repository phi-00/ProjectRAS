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
const sharp = require("sharp");
const bmp = require("bmp-js");

const { v4: uuidv4 } = require('uuid');

// Helper function to convert image buffer to BMP using sharp + bmp-js
async function convertToBmp(inputBuffer) {
  // Get raw pixel data from sharp (RGBA format)
  const { data, info } = await sharp(inputBuffer)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  
  // Convert RGBA to ABGR (bmp-js expects ABGR format)
  const pixelData = Buffer.alloc(info.width * info.height * 4);
  for (let i = 0; i < data.length; i += 4) {
    pixelData[i] = data[i + 3];     // A
    pixelData[i + 1] = data[i + 2]; // B
    pixelData[i + 2] = data[i + 1]; // G
    pixelData[i + 3] = data[i];     // R
  }
  
  const bmpData = {
    data: pixelData,
    width: info.width,
    height: info.height
  };
  
  const rawBmp = bmp.encode(bmpData);
  return rawBmp.data;
}

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

const advanced_tools = [
  "cut_ai",
  "upgrade_ai",
  "bg_remove_ai",
  "text_ai",
  "obj_ai",
  "people_ai",
];

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

// TODO process message according to type of output
function process_msg() {
  read_msg(async (msg) => {
    try {
      const msg_content = JSON.parse(msg.content.toString());
      const msg_id = msg_content.correlationId;
      const timestamp = new Date().toISOString();

      const user_msg_id = `update-client-process-${uuidv4()}`;

      console.log('[process_msg] Received message:', msg_id);

      const process = await Process.getOne(msg_id);

      // Check if process was cancelled
      if (process && process.status === "cancelled") {
        console.log('[process_msg] Process was cancelled:', msg_id);
        await Process.delete(process.user_id, process.project_id, process._id);
        send_msg_client_error(
          user_msg_id,
          timestamp,
          process.user_id,
          "00001",
          "Process was cancelled by user"
        );
        return;
      }

      const prev_process_input_img = process.og_img_uri;
      const prev_process_output_img = process.new_img_uri;
      
      // Get current process, delete it and create it's sucessor if possible
      const og_img_uri = process.og_img_uri;
      const img_id = process.img_id;
      
      await Process.delete(process.user_id, process.project_id, process._id);
      
      if (msg_content.status === "error") {
        console.log('[process_msg] Error status:', JSON.stringify(msg_content));
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

      if (!/preview/.test(msg_id)) {
        console.log('[process_msg] Sending process update for user:', process.user_id);
        send_msg_client(
          user_msg_id,
          timestamp,
          process.user_id
        );
      }

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
        status: "processing",
        start_time: new Date(),
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

// Get a specific user's project
router.get("/:user/:project", (req, res, next) => {
  Project.getOne(req.params.user, req.params.project)
    .then(async (project) => {
      const response = {
        _id: project._id,
        name: project.name,
        tools: project.tools,
        imgs: [],
      };

      for (let img of project.imgs) {
        try {
          const resp = await get_image_host(
            req.params.user,
            req.params.project,
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
    })
    .catch((_) => res.status(501).jsonp(`Error acquiring user's project`));
});

// Get a specific project's image
router.get("/:user/:project/img/:img", async (req, res, next) => {
  Project.getOne(req.params.user, req.params.project)
    .then(async (project) => {
      try {
        const img = project.imgs.filter((i) => i._id == req.params.img)[0];
        const resp = await get_image_host(
          req.params.user,
          req.params.project,
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
    })
    .catch((_) => res.status(501).jsonp(`Error acquiring user's project`));
});

// Get project images
router.get("/:user/:project/imgs", async (req, res, next) => {
  Project.getOne(req.params.user, req.params.project)
    .then(async (project) => {
      try {
        const ans = [];

        for (let img of project.imgs) {
          try {
            const resp = await get_image_host(
              req.params.user,
              req.params.project,
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
    })
    .catch((_) => res.status(501).jsonp(`Error acquiring user's project`));
});

// Download and convert a single image to specified format
router.get("/:user/:project/img/:img/download", async (req, res, next) => {
  const format = (req.query.format || "png").toLowerCase();
  console.log(`[DEBUG] /img/:img/download endpoint called with format: ${format}`);
  
  // Validate format
  const validFormats = ["png", "jpeg", "bmp", "tiff"];
  if (!validFormats.includes(format)) {
    return res.status(400).jsonp(`Invalid format. Supported formats: ${validFormats.join(", ")}`);
  }
  
  try {
    const project = await Project.getOne(req.params.user, req.params.project);
    const img = project.imgs.filter((i) => i._id == req.params.img)[0];
    
    if (!img) {
      return res.status(404).jsonp("No image with such id.");
    }
    
    // Get image from MinIO
    const resp = await get_image_docker(
      req.params.user,
      req.params.project,
      "src",
      img.og_img_key
    );
    const url = resp.data.url;
    
    // Download image
    const file_resp = await axios.get(url, { responseType: "arraybuffer" });
    const imageBuffer = Buffer.from(file_resp.data);
    
    // Convert image to requested format
    let convertedBuffer;
    const originalName = path.basename(img.og_uri);
    const newName = originalName.replace(/\.[^/.]+$/, `.${format}`);
    
    console.log(`[DEBUG] Converting image: ${originalName} -> ${newName}`);
    
    if (format === "png") {
      convertedBuffer = await sharp(imageBuffer).png().toBuffer();
    } else if (format === "jpeg") {
      convertedBuffer = await sharp(imageBuffer).jpeg({ quality: 95 }).toBuffer();
    } else if (format === "bmp") {
      convertedBuffer = await convertToBmp(imageBuffer);
    } else if (format === "tiff") {
      convertedBuffer = await sharp(imageBuffer).tiff({ quality: 95 }).toBuffer();
    }
    
    // Set correct MIME type
    const mimeTypes = {
      png: "image/png",
      jpeg: "image/jpeg",
      bmp: "image/bmp",
      tiff: "image/tiff"
    };
    
    res.set("Content-Type", mimeTypes[format]);
    res.set("Content-Disposition", `attachment; filename="${newName}"`);
    res.status(200).send(convertedBuffer);
    
  } catch (err) {
    console.error(`Error downloading/converting image:`, err);
    res.status(500).jsonp("Error downloading/converting image");
  }
});

// Get results of processing a project
router.get("/:user/:project/process", (req, res, next) => {
  console.log(`[DEBUG] /process endpoint called`);
  console.log(`[DEBUG] Query params:`, req.query);
  console.log(`[DEBUG] Full URL:`, req.originalUrl);
  const format = (req.query.format || "zip").toLowerCase(); // default format is zip
  console.log(`[DEBUG] /process endpoint - format after processing: ${format}`);

  Project.getOne(req.params.user, req.params.project)
    .then(async (_) => {
      const results = await Result.getAll(req.params.user, req.params.project);
      console.log(`[DEBUG] Total results from DB: ${results.length}`);
      if (results.length > 0) {
        console.log(`[DEBUG] First result - type: "${results[0].type}", img_id defined: ${results[0].img_id ? 'YES' : 'NO'}`);
      }

      // Get all image files
      const result_path = `/../images/users/${req.params.user}/projects/${req.params.project}/tmp`;
      fs.mkdirSync(path.join(__dirname, result_path), { recursive: true });

      const imageFiles = [];
      const uniqueOriginalImages = new Set();
      
      for (let r of results) {
        if (r.type !== "text") { // Skip text files
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
            file_resp.data.pipe(writer);
          });

          // Check what format the file actually is
          const fileBuffer = fs.readFileSync(res_path);
          const isPNG = fileBuffer[0] === 0x89 && fileBuffer[1] === 0x50 && fileBuffer[2] === 0x4e && fileBuffer[3] === 0x47;
          const isJPEG = fileBuffer[0] === 0xff && fileBuffer[1] === 0xd8;
          const isGIF = fileBuffer[0] === 0x47 && fileBuffer[1] === 0x49 && fileBuffer[2] === 0x46;
          const actualFormat = isPNG ? 'PNG' : isJPEG ? 'JPEG' : isGIF ? 'GIF' : 'UNKNOWN';
          console.log(`[DEBUG] File ${r.file_name}: has extension .${path.extname(r.file_name).slice(1)}, actual format: ${actualFormat}`);

          imageFiles.push({
            path: res_path,
            name: r.file_name,
            imgId: r.img_id, // Track original image ID
          });
          
          // Track unique original images (convert to string for comparison)
          const imgIdStr = r.img_id.toString();
          uniqueOriginalImages.add(imgIdStr);
          console.log(`[DEBUG] Added result for image ${imgIdStr}, file: ${r.file_name}`);
        }
      }
      
      console.log(`[DEBUG] After filtering - imageFiles: ${imageFiles.length}, uniqueImages: ${uniqueOriginalImages.size}`);
      console.log(`[DEBUG] Unique image IDs: ${Array.from(uniqueOriginalImages).join(', ') || 'NONE'}`);
      
      // If no images, return error
      if (imageFiles.length === 0) {
        fs.rmSync(path.join(__dirname, result_path), {
          recursive: true,
          force: true,
        });
        res.status(404).jsonp("No processed images found");
        return;
      }

      // Handle image format conversion (PNG/JPEG/BMP/TIFF)
      console.log(`[DEBUG] About to check format condition: format="${format}"`);
      if (format === "png" || format === "jpeg" || format === "bmp" || format === "tiff") {
        console.log(`[DEBUG] ENTERING image conversion block for format: ${format}`);
        if (imageFiles.length === 1 || (uniqueOriginalImages.size === 1 && imageFiles.length > 0)) {
          console.log(`[DEBUG] Single image detected (files: ${imageFiles.length}, unique: ${uniqueOriginalImages.size}), returning directly`);
          const img = imageFiles[0];
          const fs_res = fs.readFileSync(img.path);
          
          try {
            let convertedBuffer;
            // Use proper extension for each format
            const ext = format;
            const newName = img.name.replace(/\.[^/.]+$/, `.${ext}`);
            console.log(`[DEBUG] Converting image to ${ext}: ${img.name} -> ${newName}`);
            
            if (format === "png") {
              console.log(`[DEBUG] Converting to PNG (single image)`);
              convertedBuffer = await sharp(fs_res).png().toBuffer();
            } else if (format === "jpeg") {
              console.log(`[DEBUG] Converting to JPEG (single image)`);
              convertedBuffer = await sharp(fs_res).jpeg({ quality: 95 }).toBuffer();
            } else if (format === "bmp") {
              console.log(`[DEBUG] Converting to BMP (single image)`);
              convertedBuffer = await convertToBmp(fs_res);
            } else if (format === "tiff") {
              console.log(`[DEBUG] Converting to TIFF (single image)`);
              convertedBuffer = await sharp(fs_res).tiff({ quality: 95 }).toBuffer();
            } else {
              console.log(`[DEBUG] WARNING: Format did not match any conversion condition (single): ${format}`);
            }
            
            if (!convertedBuffer) {
              throw new Error(`Conversion resulted in undefined buffer for format: ${format}`);
            }
            
            fs.rmSync(path.join(__dirname, result_path), {
              recursive: true,
              force: true,
            });

            // Set correct MIME type for each format
            const mimeTypes = {
              png: "image/png",
              jpeg: "image/jpeg",
              bmp: "image/bmp",
              tiff: "image/tiff"
            };
            const mimeType = mimeTypes[format] || "image/png";
            res.set("Content-Type", mimeType);
            res.set(
              "Content-Disposition",
              `attachment; filename=${newName}`
            );
            console.log(`[DEBUG] Sending single image file: ${newName} (${mimeType})`);
            res.status(200).send(convertedBuffer);
            return;
          } catch (err) {
            console.error(`Error converting image ${img.name} to ${format}:`, err);
            // Clean up temp directory on error
            fs.rmSync(path.join(__dirname, result_path), {
              recursive: true,
              force: true,
            });
            res.status(500).jsonp(`Error converting image to ${format}`);
            return;
          }
        }
        
        console.log(`[DEBUG] Multiple images detected (${uniqueOriginalImages.size}), grouping by original image and creating ZIP`);
        
        // Multiple original images: return as ZIP with all images converted to the requested format
        // Group imageFiles by original image and take the latest result for each
        const imagesByOriginal = {};
        for (let img of imageFiles) {
          const imgId = img.imgId ? img.imgId.toString() : `unnamed_${Object.keys(imagesByOriginal).length}`;
          // Keep only the most recent result for each original image
          if (!imagesByOriginal[imgId] || imagesByOriginal[imgId].index < imageFiles.indexOf(img)) {
            imagesByOriginal[imgId] = img;
            imagesByOriginal[imgId].index = imageFiles.indexOf(img);
          }
        }
        
        const uniqueImages = Object.values(imagesByOriginal);
        console.log(`[DEBUG] After grouping: ${uniqueImages.length} unique images will be added to ZIP, converting to ${format}`);
        const zip = new JSZip();
        
        for (let img of uniqueImages) {
          const fs_res = fs.readFileSync(img.path);
          
          // Convert image to the requested format
          try {
            let convertedBuffer;
            // Use proper extension for each format
            const ext = format;
            const newName = img.name.replace(/\.[^/.]+$/, `.${ext}`);
            
            console.log(`[DEBUG] Converting image for ZIP: ${img.name} -> ${newName} (format: ${format})`);
            
            if (format === "png") {
              console.log(`[DEBUG] Converting to PNG`);
              convertedBuffer = await sharp(fs_res).png().toBuffer();
            } else if (format === "jpeg") {
              console.log(`[DEBUG] Converting to JPEG`);
              convertedBuffer = await sharp(fs_res).jpeg({ quality: 95 }).toBuffer();
            } else if (format === "bmp") {
              console.log(`[DEBUG] Converting to BMP`);
              convertedBuffer = await convertToBmp(fs_res);
            } else if (format === "tiff") {
              console.log(`[DEBUG] Converting to TIFF`);
              convertedBuffer = await sharp(fs_res).tiff({ quality: 95 }).toBuffer();
            } else {
              console.log(`[DEBUG] WARNING: Format did not match any conversion condition: ${format}`);
            }
            
            if (convertedBuffer) {
              zip.file(newName, convertedBuffer);
              console.log(`[DEBUG] Successfully added converted image: ${newName} (${convertedBuffer.length} bytes)`);
            } else {
              throw new Error(`Conversion resulted in undefined buffer for format: ${format}`);
            }
          } catch (err) {
            console.error(`Error converting image ${img.name} to ${format}:`, err);
            // If conversion fails, add original file with correct extension
            const ext = format;
            const newName = img.name.replace(/\.[^/.]+$/, `.${ext}`);
            console.log(`[DEBUG] Adding original file as fallback: ${newName}`);
            zip.file(newName, fs_res);
          }
        }

        fs.rmSync(path.join(__dirname, result_path), {
          recursive: true,
          force: true,
        });

        const ans = await zip.generateAsync({ type: "blob" });
        res.set("Content-Type", "application/zip");
        res.set(
          "Content-Disposition",
          `attachment; filename=user_${req.params.user}_project_${req.params.project}_results_${format}s.zip`
        );
        const b = await ans.arrayBuffer();
        res.status(200).send(Buffer.from(b));
      } else {
        // Default ZIP format
        const zip = new JSZip();

        for (let img of imageFiles) {
          const fs_res = fs.readFileSync(img.path);
          
          // Detect actual file format and fix extension if needed
          const isPNG = fs_res[0] === 0x89 && fs_res[1] === 0x50 && fs_res[2] === 0x4e && fs_res[3] === 0x47;
          const isJPEG = fs_res[0] === 0xff && fs_res[1] === 0xd8;
          const isGIF = fs_res[0] === 0x47 && fs_res[1] === 0x49 && fs_res[2] === 0x46;
          
          let correctName = img.name;
          if (isPNG && !img.name.toLowerCase().endsWith('.png')) {
            correctName = img.name.replace(/\.[^/.]+$/, '.png');
            console.log(`[DEBUG] Fixed PNG filename from ${img.name} to ${correctName}`);
          } else if (isJPEG && !img.name.toLowerCase().endsWith('.jpg') && !img.name.toLowerCase().endsWith('.jpeg')) {
            correctName = img.name.replace(/\.[^/.]+$/, '.jpg');
            console.log(`[DEBUG] Fixed JPEG filename from ${img.name} to ${correctName}`);
          } else if (isGIF && !img.name.toLowerCase().endsWith('.gif')) {
            correctName = img.name.replace(/\.[^/.]+$/, '.gif');
            console.log(`[DEBUG] Fixed GIF filename from ${img.name} to ${correctName}`);
          }
          
          zip.file(correctName, fs_res);
        }

        fs.rmSync(path.join(__dirname, result_path), {
          recursive: true,
          force: true,
        });

        const ans = await zip.generateAsync({ type: "blob" });
        res.set("Content-Type", "application/zip");
        res.set(
          "Content-Disposition",
          `attachment; filename=user_${req.params.user}_project_${req.params.project}_results.zip`
        );
        const b = await ans.arrayBuffer();
        res.status(200).send(Buffer.from(b));
      }
    })
    .catch((_) =>
      res.status(601).jsonp(`Error acquiring project's processing result`)
    );
});


// Get results of processing a project
router.get("/:user/:project/process/url", (req, res, next) => {
  // Getting last processed request from project in order to get their result's path

  Project.getOne(req.params.user, req.params.project)
    .then(async (_) => {
      const ans = {
        'imgs': [],
        'texts': []
      };
      const results = await Result.getAll(req.params.user, req.params.project);

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
    })
    .catch((_) =>
      res.status(601).jsonp(`Error acquiring project's processing result`)
    );
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
              new_uri: `./images/users/${req.params.user}/projects/${req.params.project}/out/${path.parse(req.file.originalname).name}.png`,
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
            position: project["tools"].length,
            ...req.body,
          };

          project["tools"].push(tool);

          Project.update(req.params.user, req.params.project, project)
            .then((_) => res.sendStatus(204))
            .catch((_) =>
              res.status(503).jsonp(`Error updating project information`)
            );
        })
        .catch((_) => res.status(501).jsonp(`Error acquiring user's project`));
    })
    .catch((_) => res.send(401).jsonp(`Error accessing picturas-user-ms`));
});

// Reorder tools of a project
router.post("/:user/:project/reorder", (req, res, next) => {
  // Remove all tools from project and reinsert them according to new order
  Project.getOne(req.params.user, req.params.project)
    .then((project) => {
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
router.post("/:user/:project/process", (req, res, next) => {
  // Get project and create a new process entry
  Project.getOne(req.params.user, req.params.project)
    .then(async (project) => {
      try {
        const prev_results = await Result.getAll(
          req.params.user,
          req.params.project
        );
        for (let r of prev_results) {
          await delete_image(
            req.params.user,
            req.params.project,
            "out",
            r.img_key
          );
          await Result.delete(r.user_id, r.project_id, r.img_id);
        }
      } catch (_) {
        res.status(400).jsonp("Error deleting previous results");
        return;
      }

      if (project.tools.length == 0) {
        res.status(400).jsonp("No tools selected");
        return;
      }

      const adv_tools = advanced_tool_num(project);
      axios
        .get(users_ms + `${req.params.user}/process/${adv_tools}`, {
          httpsAgent: httpsAgent,
        })
        .then(async (resp) => {
          const can_process = resp.data;

          if (!can_process) {
            res.status(404).jsonp("No more daily_operations available");
            return;
          }

          const source_path = `/../images/users/${req.params.user}/projects/${req.params.project}/src`;
          const result_path = `/../images/users/${req.params.user}/projects/${req.params.project}/out`;

          if (fs.existsSync(path.join(__dirname, source_path)))
            fs.rmSync(path.join(__dirname, source_path), {
              recursive: true,
              force: true,
            });

          fs.mkdirSync(path.join(__dirname, source_path), { recursive: true });

          if (fs.existsSync(path.join(__dirname, result_path)))
            fs.rmSync(path.join(__dirname, result_path), {
              recursive: true,
              force: true,
            });

          fs.mkdirSync(path.join(__dirname, result_path), { recursive: true });

          let error = false;

          for (let img of project.imgs) {
            let url = "";
            try {
              const resp = await get_image_docker(
                req.params.user,
                req.params.project,
                "src",
                img.og_img_key
              );
              url = resp.data.url;

              const img_resp = await axios.get(url, { responseType: "stream" });

              const writer = fs.createWriteStream(img.og_uri);

              // Use a Promise to handle the stream completion
              await new Promise((resolve, reject) => {
                writer.on("finish", resolve);
                writer.on("error", reject);
                img_resp.data.pipe(writer); // Pipe AFTER setting up the event handlers
              });
            } catch (_) {
              res.status(400).jsonp("Error acquiring source images");
              return;
            }

            const msg_id = `request-${uuidv4()}`;
            const timestamp = new Date().toISOString();

            const og_img_uri = img.og_uri;
            const new_img_uri = img.new_uri;
            const tool = project.tools.filter((t) => t.position === 0)[0];

            const tool_name = tool.procedure;
            const params = tool.params;

            const process = {
              user_id: req.params.user,
              project_id: req.params.project,
              img_id: img._id,
              msg_id: msg_id,
              cur_pos: 0,
              og_img_uri: og_img_uri,
              new_img_uri: new_img_uri,
              status: "processing",
              start_time: new Date(),
            };

            // Making sure database entry is created before sending message to avoid conflicts
            await Process.create(process)
              .then((_) => {
                send_msg_tool(
                  msg_id,
                  timestamp,
                  og_img_uri,
                  new_img_uri,
                  tool_name,
                  params
                );
              })
              .catch((_) => (error = true));
          }

          if (error)
            res
              .status(603)
              .jsonp(
                `There were some erros creating all process requests. Some results can be invalid.`
              );
          else res.sendStatus(201);
        })
        .catch((_) => res.status(400).jsonp(`Error checking if can process`));
    })
    .catch((_) => res.status(501).jsonp(`Error acquiring user's project`));
});

// Get active processes for a specific project
router.get("/:user/:project/processes", (req, res, next) => {
  console.log("[GET /processes] Received request for user:", req.params.user, "project:", req.params.project);
  
  Process.getProject(req.params.user, req.params.project)
    .then((processes) => {
      console.log("[GET /processes] Got processes:", processes?.length || 0);
      // Filter for only active processes
      const activeProcesses = processes.filter((p) => p.status === "processing");
      console.log("[GET /processes] Returning active processes:", activeProcesses?.length || 0);
      res.status(200).jsonp(activeProcesses);
    })
    .catch((err) => {
      console.error("[GET /processes] Error:", err.message || err);
      res.status(501).jsonp("Error acquiring project's processes");
    });
});

// Cancel a specific project processing
router.delete("/:user/:project/process/:process_id", (req, res, next) => {
  Process.getOne(req.params.user, req.params.project, req.params.process_id)
    .then(async (process) => {
      if (!process) {
        res.status(404).jsonp("Process not found");
        return;
      }

      try {
        // Mark process as cancelled
        await Process.update(
          req.params.user,
          req.params.project,
          req.params.process_id,
          { status: "cancelled" }
        );

        send_msg_client_error(
          `update-client-process-${uuidv4()}`,
          new Date().toISOString(),
          req.params.user,
          "00000",
          "Process cancelled by user"
        );

        res.sendStatus(204);
      } catch (_) {
        res.status(500).jsonp("Error cancelling process");
      }
    })
    .catch((_) => res.status(501).jsonp("Error acquiring process"));
});

// Update a specific project
router.put("/:user/:project", (req, res, next) => {
  Project.getOne(req.params.user, req.params.project)
    .then((project) => {
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
