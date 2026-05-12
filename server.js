const express = require("express");
const path = require("path");
const multer = require("multer");
const dotenv = require("dotenv");
const crypto = require("crypto");
const { Blob } = require("buffer");

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

let memories = [];
let uploadsEnabled = true;
const validSides = ["Bride's Side", "Groom's Side"];

app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));

app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

const cloudinaryConfig = {
  cloudName: process.env.CLOUDINARY_CLOUD_NAME,
  apiKey: process.env.CLOUDINARY_API_KEY,
  apiSecret: process.env.CLOUDINARY_API_SECRET,
  folder: process.env.CLOUDINARY_FOLDER || "Pavan_Aishwarya"
};

function signCloudinaryParams(params) {
  const signatureBase = Object.keys(params)
    .sort()
    .map(key => `${key}=${params[key]}`)
    .join("&");

  return crypto
    .createHash("sha1")
    .update(signatureBase + cloudinaryConfig.apiSecret)
    .digest("hex");
}

function hasCloudinaryConfig() {
  const { cloudName, apiKey, apiSecret, folder } = cloudinaryConfig;
  return Boolean(cloudName && apiKey && apiSecret && folder);
}

function requireCloudinaryConfig() {
  if (!hasCloudinaryConfig()) {
    throw new Error("Cloudinary environment variables are missing.");
  }
}

function getValidSide(side) {
  return validSides.includes(side) ? side : "Bride's Side";
}

function cleanContextValue(value, maxLength = 120) {
  return String(value || "")
    .replace(/[|=&]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);
}

function buildCloudinaryContext(body = {}) {
  const caption = cleanContextValue(body.caption || "A beautiful memory");
  const guestName = cleanContextValue(body.guestName || "Anonymous", 80);
  const side = getValidSide(body.side);
  return `caption=${caption}|guestName=${guestName}|side=${side}`;
}

function getCloudinaryUploadSignature(body = {}) {
  requireCloudinaryConfig();

  const { cloudName, apiKey, folder } = cloudinaryConfig;
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const context = buildCloudinaryContext(body);
  const signedParams = { context, folder, timestamp };

  return {
    cloudName,
    apiKey,
    context,
    folder,
    timestamp,
    signature: signCloudinaryParams(signedParams)
  };
}

async function uploadToCloudinary(file, body = {}) {
  const { cloudName, apiKey, context, folder, timestamp, signature } = getCloudinaryUploadSignature(body);
  const formData = new FormData();

  formData.append("file", new Blob([file.buffer], { type: file.mimetype }), file.originalname);
  formData.append("context", context);
  formData.append("api_key", apiKey);
  formData.append("timestamp", timestamp);
  formData.append("folder", folder);
  formData.append("signature", signature);

  const response = await fetch(`https://api.cloudinary.com/v1_1/${cloudName}/image/upload`, {
    method: "POST",
    body: formData
  });
  const responseBody = await response.json();

  if (!response.ok) {
    throw new Error(responseBody.error?.message || "Cloudinary upload failed.");
  }

  return responseBody;
}

function createMemoryFromUpload(uploadedImage, body = {}) {
  const side = getValidSide(body.side);

  return {
    id: uploadedImage.asset_id || Date.now(),
    imageUrl: uploadedImage.secure_url,
    cloudinaryPublicId: uploadedImage.public_id,
    caption: body.caption || "A beautiful memory",
    guestName: body.guestName || "Anonymous",
    side,
    reactions: {
      heart: 0,
      laugh: 0,
      love: 0,
      fire: 0,
      clap: 0
    },
    comments: [],
    createdAt: new Date().toISOString()
  };
}

function getLocalMemoryForResource(resource) {
  return memories.find(memory =>
    memory.cloudinaryPublicId === resource.public_id ||
    String(memory.id) === String(resource.asset_id)
  );
}

function getDefaultReactions() {
  return {
    heart: 0,
    laugh: 0,
    love: 0,
    fire: 0,
    clap: 0
  };
}

function memoryFromCloudinaryResource(resource) {
  const localMemory = getLocalMemoryForResource(resource);
  const customContext = resource.context?.custom || {};

  return {
    id: resource.asset_id || encodeURIComponent(resource.public_id),
    imageUrl: resource.secure_url,
    cloudinaryPublicId: resource.public_id,
    caption: localMemory?.caption || customContext.caption || "A beautiful memory",
    guestName: localMemory?.guestName || customContext.guestName || "Anonymous",
    side: getValidSide(localMemory?.side || customContext.side),
    reactions: localMemory?.reactions || getDefaultReactions(),
    comments: localMemory?.comments || [],
    createdAt: resource.created_at || localMemory?.createdAt || new Date().toISOString()
  };
}

function getCloudinaryAdminHeaders() {
  requireCloudinaryConfig();
  const credentials = Buffer.from(`${cloudinaryConfig.apiKey}:${cloudinaryConfig.apiSecret}`).toString("base64");
  return { Authorization: `Basic ${credentials}` };
}

async function listCloudinaryResources() {
  if (!hasCloudinaryConfig()) return [];

  const resources = [];
  let nextCursor;

  do {
    const url = new URL(`https://api.cloudinary.com/v1_1/${cloudinaryConfig.cloudName}/resources/image/upload`);
    url.searchParams.set("prefix", `${cloudinaryConfig.folder}/`);
    url.searchParams.set("max_results", "500");
    url.searchParams.set("context", "true");
    if (nextCursor) url.searchParams.set("next_cursor", nextCursor);

    const response = await fetch(url, { headers: getCloudinaryAdminHeaders() });
    const body = await response.json();

    if (!response.ok) {
      throw new Error(body.error?.message || "Could not load Cloudinary photos.");
    }

    resources.push(...(body.resources || []));
    nextCursor = body.next_cursor;
  } while (nextCursor);

  return resources;
}

async function getWallMemories() {
  try {
    const cloudinaryResources = await listCloudinaryResources();
    if (cloudinaryResources.length === 0) return memories;

    const cloudinaryMemories = cloudinaryResources.map(memoryFromCloudinaryResource);
    const seen = new Set(cloudinaryMemories.map(memory => memory.cloudinaryPublicId || String(memory.id)));
    const recentLocalMemories = memories.filter(memory => {
      const key = memory.cloudinaryPublicId || String(memory.id);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    return [...cloudinaryMemories, ...recentLocalMemories]
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  } catch (error) {
    console.error("Could not load Cloudinary wall photos:", error);
    return memories;
  }
}

async function getMutableMemory(id) {
  let memory = memories.find(item => String(item.id) === String(id));
  if (memory) return memory;

  const wallMemories = await getWallMemories();
  memory = wallMemories.find(item => String(item.id) === String(id));
  if (memory) {
    memories.unshift(memory);
    return memory;
  }

  return null;
}

async function deleteCloudinaryImage(publicId) {
  requireCloudinaryConfig();

  const timestamp = Math.floor(Date.now() / 1000).toString();
  const signature = signCloudinaryParams({ public_id: publicId, timestamp });
  const formData = new URLSearchParams({
    public_id: publicId,
    api_key: cloudinaryConfig.apiKey,
    timestamp,
    signature
  });

  const response = await fetch(`https://api.cloudinary.com/v1_1/${cloudinaryConfig.cloudName}/image/destroy`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: formData
  });
  const body = await response.json();

  if (!response.ok || body.result === "error") {
    throw new Error(body.error?.message || "Could not delete Cloudinary photo.");
  }

  return body;
}

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 5 * 1024 * 1024
  },
  fileFilter: function (req, file, cb) {
    const allowedTypes = /jpeg|jpg|png|webp|heic/;
    const ext = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mime = allowedTypes.test(file.mimetype);

    if (ext || mime) {
      cb(null, true);
    } else {
      cb(new Error("Only images are allowed"));
    }
  }
});

app.get("/", (req, res) => {
  res.render("welcome", {
    appName: process.env.APP_NAME,
    coupleName: process.env.COUPLE_NAME,
    groomName: process.env.GROOM_NAME || "Pavan Kumar",
    brideName: process.env.BRIDE_NAME || "Aishwarya",
    eventDate: process.env.EVENT_DATE,
    uploadsEnabled
  });
});

app.get("/wall", async (req, res) => {
  const wallMemories = await getWallMemories();
  const brideCount = wallMemories.filter(m => m.side === "Bride's Side" || m.side === "Bride Side").length;
  const groomCount = wallMemories.filter(m => m.side === "Groom's Side" || m.side === "Groom Side").length;
  const totalCompetitors = brideCount + groomCount;
  const bridePercent = totalCompetitors === 0 ? 50 : Math.round((brideCount / totalCompetitors) * 100);
  const groomPercent = totalCompetitors === 0 ? 50 : Math.round((groomCount / totalCompetitors) * 100);

  let winnerText = "It's a Tie! 🤝";
  if (brideCount > groomCount) winnerText = "Bride's Side Winning! 🎉";
  else if (groomCount > brideCount) winnerText = "Groom's Side Winning! 🎉";
  else if (totalCompetitors === 0) winnerText = "Battle of the Sides!";

  // Compute Top Moments: best photo per emoji reaction type
  const emojiTypes = [
    { type: 'heart', emoji: '❤️', label: 'Most Loved' },
    { type: 'laugh', emoji: '😂', label: 'Funniest' },
    { type: 'love', emoji: '😍', label: 'Most Beautiful' },
    { type: 'fire', emoji: '🔥', label: 'Most Fire' },
    { type: 'clap', emoji: '🙌', label: 'Most Celebrated' }
  ];

  const highlights = [];
  const usedIds = new Set();

  for (const { type, emoji, label } of emojiTypes) {
    const sorted = wallMemories
      .filter(m => !usedIds.has(m.id) && (m.reactions?.[type] || 0) > 0)
      .sort((a, b) => (b.reactions?.[type] || 0) - (a.reactions?.[type] || 0));

    if (sorted.length > 0) {
      usedIds.add(sorted[0].id);
      highlights.push({ memory: sorted[0], emoji, label, count: sorted[0].reactions[type] });
    }
  }

  res.render("index", {
    appName: process.env.APP_NAME,
    coupleName: process.env.COUPLE_NAME,
    groomName: process.env.GROOM_NAME || "Pavan Kumar",
    brideName: process.env.BRIDE_NAME || "Aishwarya",
    eventDate: process.env.EVENT_DATE,
    memories: wallMemories,
    brideCount,
    groomCount,
    bridePercent,
    groomPercent,
    winnerText,
    highlights,
    uploadsEnabled
  });
});

app.get("/upload", (req, res) => {
  res.redirect("/wall");
});

app.post("/api/upload-signature", (req, res) => {
  if (!uploadsEnabled) {
    return res.status(403).json({ success: false, error: "Uploads are currently paused by the admin." });
  }

  try {
    res.json({ success: true, ...getCloudinaryUploadSignature(req.body) });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.post("/api/memories", (req, res) => {
  if (!uploadsEnabled) {
    return res.status(403).json({ success: false, error: "Uploads are currently paused by the admin." });
  }

  const { secureUrl, publicId } = req.body;
  if (!secureUrl || !publicId) {
    return res.status(400).json({ success: false, error: "Uploaded image details are missing." });
  }

  const memory = createMemoryFromUpload(
    { secure_url: secureUrl, public_id: publicId, asset_id: req.body.assetId },
    req.body
  );
  memories.unshift(memory);
  res.json({ success: true, memory });
});

app.post("/upload", upload.single("photo"), async (req, res) => {
  if (!uploadsEnabled) {
    if (req.headers['x-requested-with'] === 'XMLHttpRequest' || req.headers.accept?.includes('application/json')) {
      return res.json({ success: false, error: "Uploads are currently paused by the admin." });
    }
    return res.status(403).send("Uploads are currently paused by the admin.");
  }

  if (!req.file) {
    return res.status(400).send("Please choose a photo to upload.");
  }

  try {
    const uploadedImage = await uploadToCloudinary(req.file, req.body);
    const memory = createMemoryFromUpload(uploadedImage, req.body);

    memories.unshift(memory);

    // Return JSON for AJAX uploads
    if (req.headers['x-requested-with'] === 'XMLHttpRequest' || req.headers.accept?.includes('application/json')) {
      return res.json({ success: true, memory });
    }

    res.redirect("/wall");
  } catch (error) {
    console.error("Upload failed:", error);
    if (req.headers['x-requested-with'] === 'XMLHttpRequest' || req.headers.accept?.includes('application/json')) {
      return res.status(500).json({ success: false, error: error.message });
    }
    res.status(500).send("Photo upload failed. Please try again.");
  }
});

// React to a photo (5 emoji types)
app.post("/react/:id", async (req, res) => {
  const memory = await getMutableMemory(req.params.id);

  if (!memory) {
    return res.status(404).json({ success: false });
  }
  const { type, deviceId } = req.body;
  const validTypes = ["heart", "laugh", "love", "fire", "clap"];

  if (!memory.userReactions) memory.userReactions = {};

  if (type === null) {
     const oldType = memory.userReactions[deviceId];
     if (oldType && memory.reactions[oldType] > 0) {
       memory.reactions[oldType] -= 1;
     }
     delete memory.userReactions[deviceId];
  } else {
     if (!validTypes.includes(type)) {
       return res.status(400).json({ success: false, error: "Invalid reaction type" });
     }
     const oldType = memory.userReactions[deviceId];
     if (oldType && oldType !== type) {
       if (memory.reactions[oldType] > 0) memory.reactions[oldType] -= 1;
     }
     if (oldType !== type) {
       memory.userReactions[deviceId] = type;
       memory.reactions[type] += 1;
     }
  }

  res.json({
    success: true,
    reactions: memory.reactions
  });
});

// Add a comment to a photo
app.post("/comment/:id", async (req, res) => {
  const memory = await getMutableMemory(req.params.id);

  if (!memory) {
    return res.status(404).json({ success: false });
  }

  const { name, text } = req.body;

  if (!text || text.trim().length === 0) {
    return res.status(400).json({ success: false, error: "Comment cannot be empty" });
  }

  const comment = {
    id: Date.now(),
    name: name || "Anonymous",
    text: text.trim().substring(0, 200),
    createdAt: new Date().toISOString()
  };

  if (!memory.comments) memory.comments = [];
  memory.comments.unshift(comment);

  res.json({
    success: true,
    comment,
    totalComments: memory.comments.length
  });
});

// Get a single memory (for modal refresh)
app.get("/api/memory/:id", async (req, res) => {
  const memory = await getMutableMemory(req.params.id);
  if (!memory) {
    return res.status(404).json({ success: false });
  }
  res.json({ success: true, memory });
});

// Admin panel
const ADMIN_KEY = process.env.ADMIN_KEY || "admin123";

app.get("/admin", async (req, res) => {
  if (req.query.key !== ADMIN_KEY) {
    return res.status(403).send("Access denied. Add ?key=YOUR_KEY to the URL.");
  }
  const wallMemories = await getWallMemories();
  const brideCount = wallMemories.filter(m => m.side === "Bride's Side").length;
  const groomCount = wallMemories.filter(m => m.side === "Groom's Side").length;
  const totalCompetitors = brideCount + groomCount;
  const bridePercent = totalCompetitors === 0 ? 50 : Math.round((brideCount / totalCompetitors) * 100);
  const groomPercent = 100 - bridePercent;

  res.render("admin", {
    appName: process.env.APP_NAME || "WeddingSnap",
    memories: wallMemories,
    brideCount,
    groomCount,
    bridePercent,
    groomPercent,
    uploadsEnabled
  });
});

// Admin toggle uploads
app.post("/admin/toggle-uploads", (req, res) => {
  const id = req.body.key;
  // Note: we can pass key via query parameter too, but we can also check the body if we want, or rely on URL query param.
  if (req.query.key !== ADMIN_KEY) {
    return res.status(403).json({ success: false, error: "Access denied" });
  }
  uploadsEnabled = !uploadsEnabled;
  res.json({ success: true, uploadsEnabled });
});

// Admin delete photo
app.post("/admin/delete/:id", async (req, res) => {
  if (req.query.key !== ADMIN_KEY && req.body?.key !== ADMIN_KEY) {
    return res.status(403).json({ success: false, error: "Access denied" });
  }

  try {
    const id = req.params.id;
    const wallMemories = await getWallMemories();
    const memory = wallMemories.find(item => String(item.id) === String(id));
    if (!memory) {
      return res.json({ success: false, error: "Not found" });
    }

    if (memory.cloudinaryPublicId) {
      await deleteCloudinaryImage(memory.cloudinaryPublicId);
    }
    memories = memories.filter(item => String(item.id) !== String(id) && item.cloudinaryPublicId !== memory.cloudinaryPublicId);
    res.json({ success: true });
  } catch (error) {
    console.error("Admin delete failed:", error);
    res.status(500).json({ success: false, error: error.message || "Delete failed" });
  }
});

// Admin delete comment
app.post("/admin/delete-comment/:photoId/:commentId", async (req, res) => {
  const photoId = req.params.photoId;
  const commentId = Number(req.params.commentId);
  const memory = await getMutableMemory(photoId);
  if (!memory || !memory.comments) {
    return res.json({ success: false, error: "Not found" });
  }
  const idx = memory.comments.findIndex(c => c.id === commentId);
  if (idx === -1) {
    return res.json({ success: false, error: "Comment not found" });
  }
  memory.comments.splice(idx, 1);
  res.json({ success: true });
});

app.listen(PORT, () => {
  console.log(`WeddingSnap running at http://localhost:${PORT}`);
});
