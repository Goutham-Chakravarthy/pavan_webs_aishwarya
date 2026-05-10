// WEDDINGSNAP JS — Full Featured

// ==================== GLOBALS ====================
let currentMemoryId = null;
let currentMemoryIndex = 0;

// Load all memories from the injected JSON block
let allMemories = [];
try {
  const dataEl = document.getElementById("memoriesData");
  if (dataEl) allMemories = JSON.parse(dataEl.textContent);
} catch(e) {}

// ==================== UPLOAD MODAL ====================
const fabUploadCamera = document.getElementById("fabUploadCamera");
const fabUploadBtn = document.getElementById("fabUploadBtn");
const fabUploadText = document.getElementById("fabUploadText");
const uploadModal = document.getElementById("uploadModal");

function openUploadSheet() {
  // Reset to step 1
  showUploadStep(1);
  uploadModal.classList.add("active");
}

function closeUploadSheet() {
  uploadModal.classList.remove("active");
}

if (fabUploadCamera) fabUploadCamera.addEventListener("click", openUploadSheet);
if (fabUploadBtn) fabUploadBtn.addEventListener("click", openUploadSheet);
if (fabUploadText) fabUploadText.addEventListener("click", openUploadSheet);

if (uploadModal) {
  uploadModal.addEventListener("click", (e) => {
    if (e.target === uploadModal) closeUploadSheet();
  });
  const dragHandle = uploadModal.querySelector('.drag-handle');
  if (dragHandle) dragHandle.addEventListener('click', closeUploadSheet);
}

// ==================== UPLOAD STEPS ====================
function showUploadStep(step) {
  document.getElementById("uploadStep1")?.classList.toggle("hidden", step !== 1);
  document.getElementById("uploadStep2")?.classList.toggle("hidden", step !== 2);
  document.getElementById("uploadStep3")?.classList.toggle("hidden", step !== 3);
  const note = document.getElementById("uploadBottomNote");
  if (note) note.classList.toggle("hidden", step === 3);
}

// ==================== GUEST NAME ====================
const guestNameInput = document.getElementById("guestNameInput");
const hiddenGuestName = document.getElementById("hiddenGuestName");
const nameBubbleSection = document.getElementById("nameBubbleSection");
const skipNameLink = document.getElementById("skipNameLink");

const savedName = localStorage.getItem("guestName");
if (savedName && nameBubbleSection) {
  nameBubbleSection.style.display = "none";
  if (hiddenGuestName) hiddenGuestName.value = savedName;
} else if (hiddenGuestName) {
  hiddenGuestName.value = "Anonymous";
}

if (guestNameInput) {
  guestNameInput.addEventListener("input", (e) => {
    localStorage.setItem("guestName", e.target.value);
    if (hiddenGuestName) hiddenGuestName.value = e.target.value || "Anonymous";
  });
}

if (skipNameLink) {
  skipNameLink.addEventListener("click", () => {
    if (nameBubbleSection) nameBubbleSection.style.display = "none";
    if (hiddenGuestName) hiddenGuestName.value = "Anonymous";
  });
}

// ==================== PHOTO SOURCE SELECTION ====================
const optCamera = document.getElementById("optCamera");
const optGallery = document.getElementById("optGallery");
const photoUploadCamera = document.getElementById("photo-upload-camera");
const photoUploadGallery = document.getElementById("photo-upload-gallery");
let selectedFile = null;

if (optCamera) {
  optCamera.addEventListener("click", () => {
    optCamera.classList.add("selected");
    if (optGallery) optGallery.classList.remove("selected");
    photoUploadCamera.click();
  });
}

if (optGallery) {
  optGallery.addEventListener("click", () => {
    if (optGallery) optGallery.classList.add("selected");
    if (optCamera) optCamera.classList.remove("selected");
    photoUploadGallery.click();
  });
}

function handleFileSelect(e) {
  const file = e.target.files[0];
  if (!file) return;
  
  selectedFile = file;
  
  // Show preview
  const reader = new FileReader();
  reader.onload = function(ev) {
    const preview = document.getElementById("photoPreview");
    const successThumb = document.getElementById("successThumb");
    if (preview) preview.src = ev.target.result;
    if (successThumb) successThumb.src = ev.target.result;
    showUploadStep(2);
    checkCooldownOnPreview(); // show countdown if in cooldown period
  };
  reader.readAsDataURL(file);
}

if (photoUploadCamera) photoUploadCamera.addEventListener("change", handleFileSelect);
if (photoUploadGallery) photoUploadGallery.addEventListener("change", handleFileSelect);

// ==================== CAPTION COUNTER ====================
const captionInput = document.getElementById("captionInput");
const charCount = document.getElementById("charCount");

if (captionInput && charCount) {
  captionInput.addEventListener("input", () => {
    charCount.textContent = captionInput.value.length;
  });
}

// ==================== SIDE PILLS ====================
const savedSide = localStorage.getItem("guestSide");
const sidePillsContainer = document.querySelector(".side-pills");
const sideLabel = document.querySelector(".side-label");

if (savedSide) {
  // Side already chosen — auto-fill and hide the pills
  const hiddenSide = document.getElementById("hiddenSide");
  if (hiddenSide) hiddenSide.value = savedSide;
  if (sidePillsContainer) sidePillsContainer.style.display = "none";
  if (sideLabel) sideLabel.style.display = "none";
}

document.querySelectorAll(".side-pill").forEach(pill => {
  pill.addEventListener("click", () => {
    document.querySelectorAll(".side-pill").forEach(p => p.classList.remove("active"));
    pill.classList.add("active");
    const hiddenSide = document.getElementById("hiddenSide");
    if (hiddenSide) hiddenSide.value = pill.dataset.side;
    localStorage.setItem("guestSide", pill.dataset.side);
  });
});

// ==================== UPLOAD COOLDOWN SYSTEM ====================
const COOLDOWN_MS = 5 * 60 * 1000; // 5 minutes
const FREE_UPLOADS = 2;

function getUploadHistory() {
  try { return JSON.parse(localStorage.getItem("uploadHistory") || "[]"); }
  catch { return []; }
}

function saveUploadTimestamp() {
  const history = getUploadHistory();
  history.push(Date.now());
  localStorage.setItem("uploadHistory", JSON.stringify(history));
}

function getCooldownRemaining() {
  const history = getUploadHistory();
  if (history.length < FREE_UPLOADS) return 0; // still free
  const lastUpload = history[history.length - 1];
  const elapsed = Date.now() - lastUpload;
  const remaining = COOLDOWN_MS - elapsed;
  return remaining > 0 ? remaining : 0;
}

function formatCountdown(ms) {
  const mins = Math.floor(ms / 60000);
  const secs = Math.floor((ms % 60000) / 1000);
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

let cooldownInterval = null;

function startCooldownUI() {
  const btn = document.getElementById("btnShareMemory");
  if (!btn) return;

  function tick() {
    const remaining = getCooldownRemaining();
    if (remaining <= 0) {
      clearInterval(cooldownInterval);
      cooldownInterval = null;
      btn.disabled = false;
      btn.textContent = "Share to the Memory Wall →";
      btn.style.opacity = "1";
      return;
    }
    btn.disabled = true;
    btn.textContent = `⏳ Next upload in ${formatCountdown(remaining)}`;
    btn.style.opacity = "0.7";
  }

  tick();
  cooldownInterval = setInterval(tick, 1000);
}

// Check cooldown on step 2 open
function checkCooldownOnPreview() {
  const remaining = getCooldownRemaining();
  if (remaining > 0) startCooldownUI();
}

// ==================== SHARE MEMORY (FORM SUBMIT) ====================
const btnShareMemory = document.getElementById("btnShareMemory");
let isUploading = false;

if (btnShareMemory) {
  btnShareMemory.addEventListener("click", () => {
    if (!selectedFile || isUploading) return;

    // Check cooldown
    const cooldown = getCooldownRemaining();
    if (cooldown > 0) {
      startCooldownUI();
      return;
    }

    isUploading = true;
    btnShareMemory.disabled = true;
    btnShareMemory.textContent = "Uploading... ⚡";

    // Fill the hidden form fields
    const uploadForm = document.getElementById("uploadForm");
    const hiddenCaption = document.getElementById("hiddenCaption");
    const hiddenSideInput = document.getElementById("hiddenSide");

    if (hiddenCaption) hiddenCaption.value = captionInput?.value || "";
    if (hiddenSideInput) hiddenSideInput.value = document.getElementById("hiddenSide")?.value || "Friends";

    // Transfer the selected file to the form's file input
    // Use the gallery input as it's more universal
    const dt = new DataTransfer();
    dt.items.add(selectedFile);
    if (photoUploadGallery) {
      photoUploadGallery.files = dt.files;
    }

    // Record timestamp before submit (page will reload)
    saveUploadTimestamp();

    // Flag for toast notification after redirect
    sessionStorage.setItem("justUploaded", "1");

    // Submit — page will redirect to /wall
    if (uploadForm) uploadForm.submit();
  });
}

// Back to wall button
const btnBackToWall = document.getElementById("btnBackToWall");
if (btnBackToWall) {
  btnBackToWall.addEventListener("click", () => {
    window.location.reload();
  });
}

// ==================== CONFETTI ====================
function fireConfetti() {
  const canvas = document.getElementById("confettiCanvas");
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;

  const colors = ["#FFD700", "#FF4081", "#4FC3F7", "#69F0AE", "#FF9100", "#FF6B9D"];
  const particles = [];

  for (let i = 0; i < 80; i++) {
    particles.push({
      x: Math.random() * canvas.width,
      y: Math.random() * canvas.height - canvas.height,
      r: Math.random() * 6 + 3,
      color: colors[Math.floor(Math.random() * colors.length)],
      vx: (Math.random() - 0.5) * 4,
      vy: Math.random() * 4 + 2,
      rot: Math.random() * 360,
      vr: (Math.random() - 0.5) * 10
    });
  }

  let frame = 0;
  function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    particles.forEach(p => {
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate((p.rot * Math.PI) / 180);
      ctx.fillStyle = p.color;
      ctx.fillRect(-p.r, -p.r / 2, p.r * 2, p.r);
      ctx.restore();
      p.x += p.vx;
      p.y += p.vy;
      p.rot += p.vr;
      p.vy += 0.05;
    });
    frame++;
    if (frame < 120) requestAnimationFrame(draw);
    else ctx.clearRect(0, 0, canvas.width, canvas.height);
  }
  draw();
}

// ==================== PHOTO VIEW MODAL ====================
const photoModal = document.getElementById("photoModal");
const photoModalClose = document.getElementById("photoModalClose");

function openPhotoModal(memory) {
  currentMemoryId = memory.id;
  currentMemoryIndex = allMemories.findIndex(m => m.id === memory.id);
  if (currentMemoryIndex === -1) currentMemoryIndex = 0;

  document.getElementById("modalPhoto").src = memory.imageUrl;
  document.getElementById("modalCaption").textContent = memory.caption || "No caption";
  document.getElementById("modalCredit").textContent = "by " + (memory.guestName || "Anonymous");

  // Time ago
  const timeAgo = getTimeAgo(memory.createdAt);
  document.getElementById("modalMeta").textContent = `${timeAgo} · ${memory.side || "Friends"}`;

  // Reactions
  updateReactionCountsUI(memory.reactions);

  // Restore user's saved reaction for this photo
  const savedReaction = getMyReaction(memory.id);
  document.querySelectorAll(".reaction-pill").forEach(p => {
    p.classList.toggle("active", p.dataset.type === savedReaction);
  });

  // Comments + comment limit check
  renderComments(memory.comments || []);
  checkCommentLimit(memory.id);

  // Show/hide nav arrows
  const showNav = allMemories.length > 1;
  if (photoNavPrev) photoNavPrev.style.display = showNav ? "flex" : "none";
  if (photoNavNext) photoNavNext.style.display = showNav ? "flex" : "none";

  photoModal.classList.add("active");
}

function closePhotoModal() {
  photoModal.classList.remove("active");
  currentMemoryId = null;
}

if (photoModalClose) photoModalClose.addEventListener("click", closePhotoModal);
if (photoModal) {
  photoModal.addEventListener("click", (e) => {
    if (e.target === photoModal) closePhotoModal();
  });
}

// ==================== PHOTO NAVIGATION ====================
function navigatePhoto(dir) {
  if (allMemories.length === 0) return;
  currentMemoryIndex = (currentMemoryIndex + dir + allMemories.length) % allMemories.length;
  openPhotoModal(allMemories[currentMemoryIndex]);
}

const photoNavPrev = document.getElementById("photoNavPrev");
const photoNavNext = document.getElementById("photoNavNext");
if (photoNavPrev) photoNavPrev.addEventListener("click", () => navigatePhoto(-1));
if (photoNavNext) photoNavNext.addEventListener("click", () => navigatePhoto(1));

// Keyboard navigation
document.addEventListener("keydown", (e) => {
  if (!photoModal?.classList.contains("active")) return;
  if (e.key === "ArrowLeft") navigatePhoto(-1);
  if (e.key === "ArrowRight") navigatePhoto(1);
  if (e.key === "Escape") closePhotoModal();
});

// Touch swipe navigation
let touchStartX = 0;
if (photoModal) {
  photoModal.addEventListener("touchstart", (e) => { touchStartX = e.touches[0].clientX; }, { passive: true });
  photoModal.addEventListener("touchend", (e) => {
    const diff = touchStartX - e.changedTouches[0].clientX;
    if (Math.abs(diff) > 50) navigatePhoto(diff > 0 ? 1 : -1);
  });
}

function getTimeAgo(dateStr) {
  if (!dateStr) return "Just now";
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

// ==================== REACTIONS ====================
// localStorage helpers — one reaction per device per photo
function getMyReaction(memoryId) {
  try { return JSON.parse(localStorage.getItem("reactions") || "{}")[memoryId] || null; }
  catch { return null; }
}
function setMyReaction(memoryId, type) {
  try {
    const all = JSON.parse(localStorage.getItem("reactions") || "{}");
    if (type === null) delete all[memoryId];
    else all[memoryId] = type;
    localStorage.setItem("reactions", JSON.stringify(all));
  } catch {}
}

function getDeviceId() {
  let id = localStorage.getItem("deviceId");
  if (!id) { id = Math.random().toString(36); localStorage.setItem("deviceId", id); }
  return id;
}

function updateReactionCountsUI(reactions) {
  const setOrClear = (id, count) => {
    document.getElementById(id).textContent = count > 0 ? count : "";
  };
  setOrClear("rHeart", reactions?.heart || 0);
  setOrClear("rLaugh", reactions?.laugh || 0);
  setOrClear("rLove", reactions?.love || 0);
  setOrClear("rFire", reactions?.fire || 0);
  setOrClear("rClap", reactions?.clap || 0);
}

document.querySelectorAll(".reaction-pill").forEach(pill => {
  pill.addEventListener("click", async () => {
    if (!currentMemoryId) return;

    const type = pill.dataset.type;
    const currentReaction = getMyReaction(currentMemoryId);
    const deviceId = getDeviceId();

    // If tapping the same emoji → remove reaction
    if (currentReaction === type) {
      setMyReaction(currentMemoryId, null);
      document.querySelectorAll(".reaction-pill").forEach(p => p.classList.remove("active"));
      
      try {
        const res = await fetch(`/react/${currentMemoryId}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ type: null, deviceId })
        });
        const data = await res.json();
        if (data.success) updateReactionCountsUI(data.reactions);
      } catch (err) {}
      return;
    }

    // Bounce animation
    pill.style.transform = "scale(1.3)";
    setTimeout(() => { pill.style.transform = "scale(1)"; }, 200);

    try {
      const res = await fetch(`/react/${currentMemoryId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type, deviceId })
      });
      const data = await res.json();
      if (data.success) {
        updateReactionCountsUI(data.reactions);

        // Save and highlight active reaction
        setMyReaction(currentMemoryId, type);
        document.querySelectorAll(".reaction-pill").forEach(p => p.classList.remove("active"));
        pill.classList.add("active");
      }
    } catch (err) {
      console.error("Reaction failed:", err);
    }
  });
});

// ==================== COMMENTS ====================
function renderComments(comments) {
  const list = document.getElementById("commentsList");
  if (!list) return;

  if (!comments || comments.length === 0) {
    list.innerHTML = '<p class="no-comments">No comments yet. Be the first! 💬</p>';
    return;
  }

  list.innerHTML = comments.map(c => {
    const initials = (c.name || "A").substring(0, 2).toUpperCase();
    const timeAgo = getTimeAgo(c.createdAt);
    return `
      <div class="comment-item">
        <div class="comment-avatar">${initials}</div>
        <div class="comment-body">
          <span class="comment-name">${c.name || "Anonymous"}</span>
          <span class="comment-text">${c.text}</span>
          <span class="comment-time">${timeAgo}</span>
        </div>
      </div>
    `;
  }).join("");
}

// ==================== COMMENT LIMIT ====================
const COMMENT_LIMIT = 2;

function getMyCommentCount(memoryId) {
  try { return JSON.parse(localStorage.getItem("commentCounts") || "{}")[memoryId] || 0; }
  catch { return 0; }
}

function incrementMyCommentCount(memoryId) {
  try {
    const all = JSON.parse(localStorage.getItem("commentCounts") || "{}");
    all[memoryId] = (all[memoryId] || 0) + 1;
    localStorage.setItem("commentCounts", JSON.stringify(all));
  } catch {}
}

function checkCommentLimit(memoryId) {
  const count = getMyCommentCount(memoryId);
  const limitMsg = document.getElementById("commentLimitMsg");
  const inputRow = document.getElementById("commentInputRow");
  if (count >= COMMENT_LIMIT) {
    limitMsg?.classList.remove("hidden");
    inputRow?.classList.add("hidden");
  } else {
    limitMsg?.classList.add("hidden");
    inputRow?.classList.remove("hidden");
  }
}

const commentInput = document.getElementById("commentInput");
const commentSend = document.getElementById("commentSend");

if (commentSend) commentSend.addEventListener("click", submitComment);
if (commentInput) {
  commentInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") submitComment();
  });
}

async function submitComment() {
  if (!currentMemoryId || !commentInput) return;
  const text = commentInput.value.trim();
  if (!text) return;

  if (getMyCommentCount(currentMemoryId) >= COMMENT_LIMIT) {
    checkCommentLimit(currentMemoryId);
    return;
  }

  const name = localStorage.getItem("guestName") || "Anonymous";

  try {
    const res = await fetch(`/comment/${currentMemoryId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, text })
    });
    const data = await res.json();
    if (data.success) {
      incrementMyCommentCount(currentMemoryId);
      commentInput.value = "";
      // Refresh comments from server
      const memRes = await fetch(`/api/memory/${currentMemoryId}`);
      const memData = await memRes.json();
      if (memData.success) {
        renderComments(memData.memory.comments);
        checkCommentLimit(currentMemoryId);
      }
    }
  } catch (err) {
    console.error("Comment failed:", err);
  }
}

// ==================== TOAST NOTIFICATIONS ====================
function showToast(msg, duration = 3000) {
  const toast = document.getElementById("toast");
  if (!toast) return;
  toast.textContent = msg;
  toast.classList.add("visible");
  setTimeout(() => toast.classList.remove("visible"), duration);
}

// Show upload success toast if redirected after an upload
if (sessionStorage.getItem("justUploaded")) {
  sessionStorage.removeItem("justUploaded");
  showToast("🎉 Memory is live on the wall!");
}

// ==================== BENTO TILE TAP ====================
document.querySelectorAll('.bento-tile').forEach(tile => {
  tile.addEventListener('click', () => {
    tile.style.transform = 'scale(0.96)';
    setTimeout(() => { tile.style.transform = ''; }, 150);

    const memoryData = tile.dataset.memory;
    if (memoryData) {
      try {
        const memory = JSON.parse(decodeURIComponent(memoryData));
        openPhotoModal(memory);
      } catch (err) {
        console.error('Failed to parse memory data:', err);
      }
    }
  });
});

// ==================== HIGHLIGHT CARD TAP ====================
document.querySelectorAll('.highlight-card').forEach(card => {
  card.addEventListener('click', () => {
    const memoryData = card.dataset.memory;
    if (memoryData) {
      try {
        const memory = JSON.parse(decodeURIComponent(memoryData));
        openPhotoModal(memory);
      } catch (err) {
        console.error('Failed to parse highlight data:', err);
      }
    }
  });
});
