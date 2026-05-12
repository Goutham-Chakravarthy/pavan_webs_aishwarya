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

async function uploadToCloudinary(file) {
  const { cloudName, apiKey, apiSecret, folder } = cloudinaryConfig;

  if (!cloudName || !apiKey || !apiSecret) {
    throw new Error("Cloudinary environment variables are missing.");
  }

  const timestamp = Math.floor(Date.now() / 1000).toString();
  const signedParams = { folder, timestamp };
  const signature = signCloudinaryParams(signedParams);
  const formData = new FormData();

  formData.append("file", new Blob([file.buffer], { type: file.mimetype }), file.originalname);
  formData.append("api_key", apiKey);
  formData.append("timestamp", timestamp);
  formData.append("folder", folder);
  formData.append("signature", signature);

  const response = await fetch(`https://api.cloudinary.com/v1_1/${cloudName}/image/upload`, {
    method: "POST",
    body: formData
  });
  const body = await response.json();

  if (!response.ok) {
    throw new Error(body.error?.message || "Cloudinary upload failed.");
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

app.get("/wall", (req, res) => {
  const brideCount = memories.filter(m => m.side === "Bride's Side" || m.side === "Bride Side").length;
  const groomCount = memories.filter(m => m.side === "Groom's Side" || m.side === "Groom Side").length;
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
    const sorted = memories
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
    memories,
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
    const uploadedImage = await uploadToCloudinary(req.file);
    const memory = {
      id: Date.now(),
      imageUrl: uploadedImage.secure_url,
      cloudinaryPublicId: uploadedImage.public_id,
      caption: req.body.caption || "A beautiful memory",
      guestName: req.body.guestName || "Anonymous",
      side: req.body.side || "Friends",
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
app.post("/react/:id", (req, res) => {
  const memory = memories.find(item => item.id === Number(req.params.id));

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
app.post("/comment/:id", (req, res) => {
  const memory = memories.find(item => item.id === Number(req.params.id));

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
app.get("/api/memory/:id", (req, res) => {
  const memory = memories.find(item => item.id === Number(req.params.id));
  if (!memory) {
    return res.status(404).json({ success: false });
  }
  res.json({ success: true, memory });
});

// Admin panel
const ADMIN_KEY = process.env.ADMIN_KEY || "admin123";

app.get("/admin", (req, res) => {
  if (req.query.key !== ADMIN_KEY) {
    return res.status(403).send("Access denied. Add ?key=YOUR_KEY to the URL.");
  }
  const brideCount = memories.filter(m => m.side === "Bride's Side").length;
  const groomCount = memories.filter(m => m.side === "Groom's Side").length;
  const totalCompetitors = brideCount + groomCount;
  const bridePercent = totalCompetitors === 0 ? 50 : Math.round((brideCount / totalCompetitors) * 100);
  const groomPercent = 100 - bridePercent;

  res.render("admin", {
    appName: process.env.APP_NAME || "WeddingSnap",
    memories,
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
app.post("/admin/delete/:id", (req, res) => {
  const id = Number(req.params.id);
  const idx = memories.findIndex(m => m.id === id);
  if (idx === -1) {
    return res.json({ success: false, error: "Not found" });
  }
  memories.splice(idx, 1);
  res.json({ success: true });
});

// Admin delete comment
app.post("/admin/delete-comment/:photoId/:commentId", (req, res) => {
  const photoId = Number(req.params.photoId);
  const commentId = Number(req.params.commentId);
  const memory = memories.find(m => m.id === photoId);
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
