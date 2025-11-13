const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const multer = require("multer");
const fs = require("fs");
const path = require("path");
const bcrypt = require("bcrypt");
const fsPromises = require("fs").promises;
const jwt = require("jsonwebtoken");

// --- Config ---
const PORT = process.env.PORT || 3000;
const USERS_FILE = path.join(__dirname, "users.json");
const JWT_SECRET = process.env.JWT_SECRET || "your-secret-key-change-in-production";
const JWT_EXPIRES_IN = "30d"; // 30 days

// JWT middleware
function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'Access token required' });
  }

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) {
      return res.status(403).json({ error: 'Invalid or expired token' });
    }
    req.user = user;
    next();
  });
}

// --- Helper functions for user management ---
async function loadUsers() {
  try {
    const data = await fsPromises.readFile(USERS_FILE, 'utf8');
    return JSON.parse(data);
  } catch (error) {
    if (error.code === 'ENOENT') {
      // File doesn't exist, return empty array
      return [];
    }
    throw error;
  }
}

async function saveUsers(users) {
  await fsPromises.writeFile(USERS_FILE, JSON.stringify(users, null, 2), 'utf8');
}

async function findUser(username) {
  const users = await loadUsers();
  return users.find(user => user.username.toLowerCase() === username.toLowerCase());
}

async function updateUser(username, updates) {
  const users = await loadUsers();
  const userIndex = users.findIndex(user => user.username.toLowerCase() === username.toLowerCase());
  if (userIndex !== -1) {
    users[userIndex] = { ...users[userIndex], ...updates };
    await saveUsers(users);
    return users[userIndex];
  }
  return null;
}
const CHAT_PASSWORD = process.env.CHAT_PASSWORD || "123";
const HISTORY_LIMIT = 200;
const UPLOAD_DIR = path.join(__dirname, "uploads");
const KEEPALIVE_INTERVAL = 4 * 60 * 1000; // 4 minutes
const KEEPALIVE_URL = process.env.KEEPALIVE_URL || null;

// --- Ensure uploads folder exists ---
if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

// --- Multer setup for file uploads ---
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOAD_DIR),
  filename: (req, file, cb) => {
    const safeOriginal = file.originalname.replace(/[^a-zA-Z0-9._-]/g, "_");
    const unique = Date.now() + "_" + Math.random().toString(36).slice(2, 8);
    cb(null, unique + "_" + safeOriginal);
  }
});
const upload = multer({
  storage,
  limits: { fileSize: 15 * 1024 * 1024 }, // 15 MB
  fileFilter: (req, file, cb) => {
    // Allow common types (images, audio/video, docs, archives)
    const ok = [
      "image/", "video/", "audio/",
      "application/pdf",
      "application/zip", "application/x-zip-compressed",
      "application/vnd.ms-excel",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "application/msword",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "application/vnd.ms-powerpoint",
      "application/vnd.openxmlformats-officedocument.presentationml.presentation",
      "text/plain"
    ].some(prefix => file.mimetype.startsWith(prefix) || file.mimetype === prefix);
    if (!ok) return cb(new Error("Unsupported file type"));
    cb(null, true);
  }
});

// --- App & Socket.IO ---
const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

app.use(express.static("public"));
app.use("/uploads", express.static(UPLOAD_DIR));
app.use(express.json());

// --- Authentication endpoints ---
app.post("/signup", async (req, res) => {
  try {
    const { fullName, username, password, confirmPassword } = req.body;
    
    // Validate input types and presence
    if (!fullName || !username || !password || !confirmPassword) {
      return res.status(400).json({ error: "All fields are required" });
    }
    
    if (typeof fullName !== 'string' || typeof username !== 'string' || typeof password !== 'string' || typeof confirmPassword !== 'string') {
      return res.status(400).json({ error: "Invalid input format" });
    }
    
    // Trim whitespace
    const trimmedFullName = fullName.trim();
    const trimmedUsername = username.trim();
    const trimmedPassword = password.trim();
    const trimmedConfirmPassword = confirmPassword.trim();
    
    if (!trimmedFullName || !trimmedUsername || !trimmedPassword || !trimmedConfirmPassword) {
      return res.status(400).json({ error: "All fields are required" });
    }
    
    // Validate password match
    if (trimmedPassword !== trimmedConfirmPassword) {
      return res.status(400).json({ error: "Passwords do not match" });
    }
    
    // Validate full name length
    if (trimmedFullName.length < 2) {
      return res.status(400).json({ error: "Full name must be at least 2 characters" });
    }
    
    // Validate username length
    if (trimmedUsername.length < 3) {
      return res.status(400).json({ error: "Username must be at least 3 characters" });
    }
    
    // Validate password length
    if (trimmedPassword.length < 6) {
      return res.status(400).json({ error: "Password must be at least 6 characters" });
    }
    
    // Validate username format (alphanumeric and common special chars)
    if (!/^[a-zA-Z0-9_-]+$/.test(trimmedUsername)) {
      return res.status(400).json({ error: "Username can only contain letters, numbers, underscores, and hyphens" });
    }
    
    // Validate full name format (letters, spaces, and common punctuation)
    if (!/^[a-zA-Z\s\-'\.]+$/.test(trimmedFullName)) {
      return res.status(400).json({ error: "Full name can only contain letters, spaces, hyphens, apostrophes, and periods" });
    }
    
    // Check if user already exists
    const existingUser = await findUser(trimmedUsername);
    if (existingUser) {
      console.log(`Signup attempt failed: Username '${trimmedUsername}' already exists`);
      return res.status(400).json({ error: "Username already exists" });
    }
    
    // Hash password
    const saltRounds = 12;
    const hashedPassword = await bcrypt.hash(trimmedPassword, saltRounds);
    
    // Create user object
    const userData = {
      fullName: trimmedFullName,
      username: trimmedUsername,
      password: hashedPassword,
      createdAt: new Date().toISOString()
    };
    
    // Load existing users and add new user
    const users = await loadUsers();
    users.push(userData);
    
    // Save to file
    await saveUsers(users);
    
    // Generate JWT token for immediate login
    const tokenPayload = {
      username: trimmedUsername,
      fullName: trimmedFullName,
      createdAt: userData.createdAt
    };
    
    const token = jwt.sign(tokenPayload, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
    
    console.log("User created successfully:", trimmedUsername);
    res.json({ 
      success: true, 
      message: "Account created successfully",
      token: token,
      user: {
        fullName: trimmedFullName,
        username: trimmedUsername,
        createdAt: userData.createdAt
      }
    });
  } catch (error) {
    console.error("Signup error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

app.post("/login", async (req, res) => {
  try {
    const { username, password } = req.body;
    
    if (!username || !password) {
      return res.status(400).json({ error: "Username and password are required" });
    }
    
    if (typeof username !== 'string' || typeof password !== 'string') {
      return res.status(400).json({ error: "Invalid input format" });
    }
    
    // Find user in JSON file
    const user = await findUser(username.trim());
    if (!user) {
      console.log(`Login attempt failed: User '${username.trim()}' not found`);
      return res.status(401).json({ error: "Invalid username or password" });
    }
    
    // Verify password
    const isValidPassword = await bcrypt.compare(password, user.password);
    if (!isValidPassword) {
      console.log(`Login attempt failed: Invalid password for user '${username.trim()}'`);
      return res.status(401).json({ error: "Invalid username or password" });
    }
    
    // Generate JWT token
    const tokenPayload = {
      username: user.username,
      fullName: user.fullName || user.username,
      createdAt: user.createdAt
    };
    
    const token = jwt.sign(tokenPayload, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
    
    console.log(`User '${user.username}' logged in successfully`);
    res.json({ 
      success: true,
      token: token,
      user: { 
        fullName: user.fullName || user.username,
        username: user.username,
        createdAt: user.createdAt
      }
    });
  } catch (error) {
    console.error("Login error:", error);
    res.status(500).json({ error: "Internal server error during login" });
  }
});

// Token verification endpoint
app.post("/verify-token", authenticateToken, async (req, res) => {
  try {
    // If we reach here, the token is valid (middleware passed)
    const user = await findUser(req.user.username);
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }
    
    res.json({
      success: true,
      user: {
        fullName: user.fullName || user.username,
        username: user.username,
        createdAt: user.createdAt
      }
    });
  } catch (error) {
    console.error("Token verification error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Account update endpoint
app.post("/update-account", authenticateToken, async (req, res) => {
  try {
    const { fullName, currentPassword, newPassword } = req.body;
    
    // Get username from JWT token
    const username = req.user.username;
    
    // Find user
    const user = await findUser(username);
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }
    
    const updates = {};
    
    // Update full name if provided
    if (fullName && fullName.trim()) {
      const trimmedFullName = fullName.trim();
      if (trimmedFullName.length < 2) {
        return res.status(400).json({ error: "Full name must be at least 2 characters" });
      }
      if (!/^[a-zA-Z\s\-'\.]+$/.test(trimmedFullName)) {
        return res.status(400).json({ error: "Full name can only contain letters, spaces, hyphens, apostrophes, and periods" });
      }
      updates.fullName = trimmedFullName;
    }
    
    // Update password if provided
    if (newPassword) {
      if (!currentPassword) {
        return res.status(400).json({ error: "Current password is required to change password" });
      }
      
      // Verify current password
      const isValidPassword = await bcrypt.compare(currentPassword, user.password);
      if (!isValidPassword) {
        return res.status(401).json({ error: "Current password is incorrect" });
      }
      
      if (newPassword.length < 6) {
        return res.status(400).json({ error: "New password must be at least 6 characters" });
      }
      
      // Hash new password
      const saltRounds = 12;
      updates.password = await bcrypt.hash(newPassword, saltRounds);
    }
    
    // Update user
    const updatedUser = await updateUser(username, updates);
    if (!updatedUser) {
      return res.status(500).json({ error: "Failed to update user" });
    }
    
    // Generate new token with updated info
    const tokenPayload = {
      username: updatedUser.username,
      fullName: updatedUser.fullName || updatedUser.username,
      createdAt: updatedUser.createdAt
    };
    
    const newToken = jwt.sign(tokenPayload, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
    
    console.log(`User '${username}' updated successfully`);
    res.json({ 
      success: true, 
      message: "Account updated successfully",
      token: newToken,
      user: {
        fullName: updatedUser.fullName || updatedUser.username,
        username: updatedUser.username,
        createdAt: updatedUser.createdAt
      }
    });
  } catch (error) {
    console.error("Account update error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// --- Health endpoint for keep-alive ---
app.get("/health", (req, res) => {
  res.status(200).json({ 
    status: "ok", 
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    users: idByName.size
  });
});

// --- HTTP upload endpoint ---
app.post("/upload", upload.single("file"), (req, res) => {
  if (!req.file) return res.status(400).json({ error: "No file" });
  const url = `/uploads/${req.file.filename}`;
  res.json({
    url,
    name: req.file.originalname,
    size: req.file.size,
    mime: req.file.mimetype
  });
});

// --- In-memory state ---
const usersById = new Map();      // socket.id -> { name }
const idByName = new Map();       // username -> socket.id
const roomHistory = new Map();    // roomKey -> [message]

// --- Helpers ---
const groupRoom = "group";
function privateRoomOf(a, b) {
  return [a, b].sort((x, y) => x.localeCompare(y)).join("::");
}
function pushHistory(roomKey, msg) {
  const list = roomHistory.get(roomKey) || [];
  list.push(msg);
  if (list.length > HISTORY_LIMIT) list.shift();
  roomHistory.set(roomKey, list);
}
function getHistory(roomKey, limit = 50) {
  const list = roomHistory.get(roomKey) || [];
  return list.slice(-limit);
}
async function broadcastUsers() {
  const usernames = Array.from(idByName.keys()).sort((a, b) => a.localeCompare(b));
  
  // Get full names for all online users
  const usersWithFullNames = [];
  for (const username of usernames) {
    try {
      const user = await findUser(username);
      usersWithFullNames.push({
        username: username,
        fullName: user ? (user.fullName || username) : username
      });
    } catch (error) {
      // Fallback to username if lookup fails
      usersWithFullNames.push({
        username: username,
        fullName: username
      });
    }
  }
  
  io.emit("usersList", usersWithFullNames);
}

io.on("connection", (socket) => {
  // Join the app (defaults into group)
  socket.on("joinGroup", ({ name, password }) => {
    const username = (name || "").trim();
    const pwd = (password || "").trim();

    if (!username) return socket.emit("authError", "Name is required.");
    if (pwd !== CHAT_PASSWORD) return socket.emit("authError", "Wrong password.");
    if (idByName.has(username)) return socket.emit("authError", "Name already in use.");

    usersById.set(socket.id, { name: username });
    idByName.set(username, socket.id);

    socket.data.username = username;
    socket.data.currentRoom = groupRoom;

    socket.join(groupRoom);

    if (!roomHistory.has(groupRoom)) roomHistory.set(groupRoom, []);

    socket.emit("switchedRoom", { roomKey: groupRoom, label: "Group", isPrivate: false });
    socket.emit("roomHistory", { roomKey: groupRoom, items: getHistory(groupRoom) });

    broadcastUsers();
  });

  // Switch to group room
  socket.on("joinGroupRoom", () => {
    if (!socket.data?.username) return;
    const prev = socket.data.currentRoom;
    if (prev && prev !== groupRoom) socket.leave(prev);

    socket.join(groupRoom);
    socket.data.currentRoom = groupRoom;

    socket.emit("switchedRoom", { roomKey: groupRoom, label: "Group", isPrivate: false });
    socket.emit("roomHistory", { roomKey: groupRoom, items: getHistory(groupRoom) });
  });

  // Open private chat with target
  socket.on("openPrivate", (targetUser) => {
    const me = socket.data?.username;
    if (!me) return;
    const targetName = (targetUser || "").trim();
    if (!idByName.has(targetName)) return; // target offline

    const targetId = idByName.get(targetName);
    const roomKey = privateRoomOf(me, targetName);

    if (!roomHistory.has(roomKey)) roomHistory.set(roomKey, []);

    // Leave previous room
    if (socket.data.currentRoom) {
      socket.leave(socket.data.currentRoom);
    }
    
    // Join new room and update state
    socket.join(roomKey);
    socket.data.currentRoom = roomKey;

    // Add target to room if they're online
    const targetSocket = io.sockets.sockets.get(targetId);
    if (targetSocket) targetSocket.join(roomKey);

    // Send room switch notification first
    socket.emit("switchedRoom", { roomKey, label: targetName, isPrivate: true });
    
    // Then send history immediately
    socket.emit("roomHistory", { roomKey, items: getHistory(roomKey) });

    // Notify target user
    if (targetSocket) {
      targetSocket.emit("privatePing", { from: me, roomKey });
    }
  });

  // Explicit history request (optional)
  socket.on("getHistory", (roomKey) => {
    if (!roomKey) return;
    socket.emit("roomHistory", { roomKey, items: getHistory(roomKey) });
  });

  // Text message
  socket.on("chatMessage", (text) => {
    const me = socket.data?.username;
    const roomKey = socket.data?.currentRoom;
    const message = (text || "").trim();
    if (!me || !roomKey || !message) return;

    // Server-side validation: Ensure user is actually in the room they claim to send from
    if (!socket.rooms.has(roomKey)) {
      console.warn(`User ${me} tried to send message to room ${roomKey} but is not in that room`);
      return;
    }

    const payload = {
      type: "text",
      roomKey,
      user: me,
      text: message,
      ts: Date.now()
    };

    pushHistory(roomKey, payload);
    io.to(roomKey).emit("message", payload);

    // Cross-chat notifications and unread tracking
    if (roomKey !== groupRoom) {
      // Private room - notify target user if they're not in this private chat
      const [u1, u2] = roomKey.split("::");
      const targetName = me === u1 ? u2 : u1;
      const targetId = idByName.get(targetName);
      const targetSocket = io.sockets.sockets.get(targetId);
      
      if (targetSocket && targetSocket.data.currentRoom !== roomKey) {
        // Target user is online but not in this private chat
        targetSocket.emit("privateUnread", {
          from: me,
          kind: "text",
          preview: message.slice(0, 80)
        });
        
        // Send cross-chat notification
        targetSocket.emit("crossChatNotification", {
          type: "private",
          from: me,
          message: message.slice(0, 100),
          roomKey: roomKey
        });
      }
    } else {
      // Group room - notify all users who are in private chats
      Array.from(idByName.entries()).forEach(([username, socketId]) => {
        if (username === me) return; // Don't notify sender
        
        const userSocket = io.sockets.sockets.get(socketId);
        if (userSocket && userSocket.data.currentRoom !== groupRoom) {
          // User is in a private chat, notify them about group message
          userSocket.emit("crossChatNotification", {
            type: "group",
            from: me,
            message: message.slice(0, 100),
            roomKey: groupRoom
          });
        }
      });
    }
  });

  // Handle sendMessage event (matches client emit)
  socket.on("sendMessage", (text) => {
    const me = socket.data?.username;
    const roomKey = socket.data?.currentRoom;
    const message = (text || "").trim();
    if (!me || !roomKey || !message) return;

    // Server-side validation: Ensure user is actually in the room they claim to send from
    if (!socket.rooms.has(roomKey)) {
      console.warn(`User ${me} tried to send message to room ${roomKey} but is not in that room`);
      return;
    }

    const payload = {
      type: "text",
      roomKey,
      user: me,
      text: message,
      ts: Date.now()
    };

    pushHistory(roomKey, payload);
    io.to(roomKey).emit("message", payload);

    // Cross-chat notifications and unread tracking
    if (roomKey !== groupRoom) {
      // Private room - notify target user if they're not in this private chat
      const [u1, u2] = roomKey.split("::");
      const targetName = me === u1 ? u2 : u1;
      const targetId = idByName.get(targetName);
      const targetSocket = io.sockets.sockets.get(targetId);
      
      if (targetSocket && targetSocket.data.currentRoom !== roomKey) {
        // Target user is online but not in this private chat
        targetSocket.emit("privateUnread", {
          from: me,
          kind: "text",
          preview: message.slice(0, 80)
        });
        
        // Send cross-chat notification
        targetSocket.emit("crossChatNotification", {
          type: "private",
          from: me,
          message: message.slice(0, 100),
          roomKey: roomKey
        });
      }
    } else {
      // Group room - notify all users who are in private chats
      Array.from(idByName.entries()).forEach(([username, socketId]) => {
        if (username === me) return; // Don't notify sender
        
        const userSocket = io.sockets.sockets.get(socketId);
        if (userSocket && userSocket.data.currentRoom !== groupRoom) {
          // User is in a private chat, notify them about group message
          userSocket.emit("crossChatNotification", {
            type: "group",
            from: me,
            message: message.slice(0, 100),
            roomKey: groupRoom
          });
        }
      });
    }
  });

  // Voice message
  socket.on("voiceMessage", (voiceData) => {
    const me = socket.data?.username;
    const roomKey = socket.data?.currentRoom;
    if (!me || !roomKey) return;
    if (!voiceData || !voiceData.audio) return;

    // Server-side validation: Ensure user is actually in the room they claim to send from
    if (!socket.rooms.has(roomKey)) {
      console.warn(`User ${me} tried to send voice message to room ${roomKey} but is not in that room`);
      return;
    }

    const payload = {
      type: "voice",
      roomKey,
      user: me,
      voice: {
        audio: voiceData.audio,
        mimeType: voiceData.mimeType || "audio/webm",
        duration: voiceData.duration || 0
      },
      ts: Date.now()
    };

    pushHistory(roomKey, payload);
    io.to(roomKey).emit("message", payload);

    // Cross-chat notifications and unread tracking
    if (roomKey !== groupRoom) {
      // Private room - notify target user if they're not in this private chat
      const [u1, u2] = roomKey.split("::");
      const targetName = me === u1 ? u2 : u1;
      const targetId = idByName.get(targetName);
      const targetSocket = io.sockets.sockets.get(targetId);
      
      if (targetSocket && targetSocket.data.currentRoom !== roomKey) {
        // Target user is online but not in this private chat
        targetSocket.emit("privateUnread", {
          from: me,
          kind: "voice",
          preview: "Voice message"
        });
        
        // Send cross-chat notification
        targetSocket.emit("crossChatNotification", {
          type: "private",
          from: me,
          message: "🎤 Voice message",
          roomKey: roomKey
        });
      }
    } else {
      // Group room - notify all users who are in private chats
      Array.from(idByName.entries()).forEach(([username, socketId]) => {
        if (username === me) return; // Don't notify sender
        
        const userSocket = io.sockets.sockets.get(socketId);
        if (userSocket && userSocket.data.currentRoom !== groupRoom) {
          // User is in a private chat, notify them about group voice message
          userSocket.emit("crossChatNotification", {
            type: "group",
            from: me,
            message: "🎤 Voice message",
            roomKey: groupRoom
          });
        }
      });
    }
  });

  // File message (after HTTP upload)
  socket.on("fileMessage", (fileMeta) => {
    const me = socket.data?.username;
    const roomKey = socket.data?.currentRoom;
    if (!me || !roomKey) return;
    if (!fileMeta || !fileMeta.url || !fileMeta.name) return;

    // Server-side validation: Ensure user is actually in the room they claim to send from
    if (!socket.rooms.has(roomKey)) {
      console.warn(`User ${me} tried to send file message to room ${roomKey} but is not in that room`);
      return;
    }

    const payload = {
      type: "file",
      roomKey,
      user: me,
      file: {
        url: fileMeta.url,
        name: fileMeta.name,
        size: fileMeta.size || 0,
        mime: fileMeta.mime || "application/octet-stream"
      },
      ts: Date.now()
    };

    pushHistory(roomKey, payload);
    io.to(roomKey).emit("message", payload);

    // Cross-chat notifications and unread tracking
    if (roomKey !== groupRoom) {
      // Private room - notify target user if they're not in this private chat
      const [u1, u2] = roomKey.split("::");
      const targetName = me === u1 ? u2 : u1;
      const targetId = idByName.get(targetName);
      const targetSocket = io.sockets.sockets.get(targetId);
      
      if (targetSocket && targetSocket.data.currentRoom !== roomKey) {
        // Target user is online but not in this private chat
        targetSocket.emit("privateUnread", {
          from: me,
          kind: "file",
          fileName: fileMeta.name
        });
        
        // Send cross-chat notification
        targetSocket.emit("crossChatNotification", {
          type: "private",
          from: me,
          message: `📎 ${fileMeta.name}`,
          roomKey: roomKey
        });
      }
    } else {
      // Group room - notify all users who are in private chats
      Array.from(idByName.entries()).forEach(([username, socketId]) => {
        if (username === me) return; // Don't notify sender
        
        const userSocket = io.sockets.sockets.get(socketId);
        if (userSocket && userSocket.data.currentRoom !== groupRoom) {
          // User is in a private chat, notify them about group file message
          userSocket.emit("crossChatNotification", {
            type: "group",
            from: me,
            message: `📎 ${fileMeta.name}`,
            roomKey: groupRoom
          });
        }
      });
    }
  });

  // Typing indicator
  socket.on("typing", (isTyping) => {
    const me = socket.data?.username;
    const roomKey = socket.data?.currentRoom;
    if (!me || !roomKey) return;
    socket.to(roomKey).emit("typing", { user: me, isTyping: !!isTyping, roomKey });
  });

  // WebRTC calling events
  socket.on("call-offer", ({ to, offer, from }) => {
    const targetId = idByName.get(to);
    if (targetId) {
      io.to(targetId).emit("call-offer", { offer, from });
    }
  });

  socket.on("call-answer", ({ to, answer }) => {
    const targetId = idByName.get(to);
    if (targetId) {
      io.to(targetId).emit("call-answer", { answer });
    }
  });

  socket.on("call-ice-candidate", ({ to, candidate }) => {
    const targetId = idByName.get(to);
    if (targetId) {
      io.to(targetId).emit("call-ice-candidate", { candidate });
    }
  });

  socket.on("call-rejected", ({ to }) => {
    const targetId = idByName.get(to);
    if (targetId) {
      io.to(targetId).emit("call-rejected", {});
    }
  });

  socket.on("call-ended", ({ to }) => {
    const targetId = idByName.get(to);
    if (targetId) {
      io.to(targetId).emit("call-ended", {});
    }
  });

  socket.on("call-user-busy", ({ to }) => {
    const targetId = idByName.get(to);
    if (targetId) {
      io.to(targetId).emit("call-user-busy", {});
    }
  });

  // Manual request for users list update
  socket.on("requestUsersList", () => {
    broadcastUsers();
  });

  // Disconnect cleanup
  socket.on("disconnect", () => {
    const me = usersById.get(socket.id)?.name;
    usersById.delete(socket.id);
    if (me && idByName.get(me) === socket.id) {
      idByName.delete(me);
    }
    broadcastUsers();
  });
});

// --- Keep-alive functionality ---
let keepAliveTimer = null;

function startKeepAlive() {
  if (keepAliveTimer) return; // Prevent duplicate timers
  
  const targetUrl = KEEPALIVE_URL || `http://localhost:${PORT}/health`;
  
  keepAliveTimer = setInterval(async () => {
    try {
      const response = await fetch(targetUrl);
      console.log(`Keep-alive ping: ${response.status} at ${new Date().toISOString()}`);
    } catch (error) {
      console.error(`Keep-alive ping failed: ${error.message}`);
    }
  }, KEEPALIVE_INTERVAL);
  
  console.log(`Keep-alive started: pinging ${targetUrl} every ${KEEPALIVE_INTERVAL / 1000}s`);
}

function stopKeepAlive() {
  if (keepAliveTimer) {
    clearInterval(keepAliveTimer);
    keepAliveTimer = null;
    console.log("Keep-alive stopped");
  }
}

// Graceful shutdown
process.on('SIGTERM', stopKeepAlive);
process.on('SIGINT', stopKeepAlive);

server.listen(PORT, "0.0.0.0", () => {
  console.log(`Server running at http://0.0.0.0:${PORT}`);
  
  // Start keep-alive after server is ready
  setTimeout(startKeepAlive, 5000); // Wait 5s after startup
});