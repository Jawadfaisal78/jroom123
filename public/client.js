const socket = io();

// Auth elements
const loginView = document.getElementById("login");
const signupView = document.getElementById("signup");
const accountView = document.getElementById("account");

// Login elements
const loginUsername = document.getElementById("loginUsername");
const loginPassword = document.getElementById("loginPassword");
const loginBtn = document.getElementById("loginBtn");
const loginError = document.getElementById("loginError");
const showSignupBtn = document.getElementById("showSignupBtn");

// Signup elements
const signupFullName = document.getElementById("signupFullName");
const signupUsername = document.getElementById("signupUsername");
const signupPassword = document.getElementById("signupPassword");
const confirmPassword = document.getElementById("confirmPassword");
const signupBtn = document.getElementById("signupBtn");
const signupError = document.getElementById("signupError");
const showLoginBtn = document.getElementById("showLoginBtn");

// Account elements
const accountBtn = document.getElementById("accountBtn");
const accountBackBtn = document.getElementById("accountBackBtn");
const accountFullName = document.getElementById("accountFullName");
const accountUsername = document.getElementById("accountUsername");
const accountPassword = document.getElementById("accountPassword");
const accountCreatedAt = document.getElementById("accountCreatedAt");
const togglePasswordBtn = document.getElementById("togglePasswordBtn");
const logoutBtn = document.getElementById("logoutBtn");

// Account editing elements
const editAccountBtn = document.getElementById("editAccountBtn");
const accountViewMode = document.getElementById("accountViewMode");
const accountEditMode = document.getElementById("accountEditMode");
const editFullName = document.getElementById("editFullName");
const editCurrentPassword = document.getElementById("editCurrentPassword");
const editNewPassword = document.getElementById("editNewPassword");
const saveAccountBtn = document.getElementById("saveAccountBtn");
const cancelEditBtn = document.getElementById("cancelEditBtn");
const accountEditError = document.getElementById("accountEditError");

// Chat elements
const chatView   = document.getElementById("chat");
const roomTitle  = document.getElementById("roomTitle");
const roomBadge  = document.getElementById("roomBadge");
const messagesEl = document.getElementById("messages");
const msgInput   = document.getElementById("msgInput");
const sendBtn    = document.getElementById("sendBtn");
const voiceBtn   = document.getElementById("voiceBtn");

// Voice recording state
let mediaRecorder = null;
let audioChunks = [];
let isRecording = false;
let recordingStartTime = null;

// Attachments
const attachBtn  = document.getElementById("attachBtn");
const fileInput  = document.getElementById("fileInput");

// Menu elements
const menuBtn    = document.getElementById("menuBtn");
const menu       = document.getElementById("menu");
const menuClose  = document.getElementById("menuClose");
const chatList   = document.getElementById("chatList");

// Toast
const toastEl    = document.getElementById("toast");

// State
let myName = "";
let currentUser = null;
let currentRoomKey = "group";  // "group" or "userA::userB"
let typingTimer = null;
let isTyping = false;
let authToken = null;

// Token management
function saveToken(token) {
  if (token) {
    localStorage.setItem('chatAppToken', token);
    authToken = token;
  }
}

function getToken() {
  if (!authToken) {
    authToken = localStorage.getItem('chatAppToken');
  }
  return authToken;
}

function removeToken() {
  localStorage.removeItem('chatAppToken');
  authToken = null;
}

function getAuthHeaders() {
  const token = getToken();
  return token ? { 'Authorization': `Bearer ${token}` } : {};
}

// Unread counts (distinct senders)
let unreadMap = {}; // { username: countOfMessages } (we use keys length for distinct users)
let hasNewMessages = false;

// --- UI helpers with smooth transitions ---
function show(view, skipAnimation = false) {
  const views = [loginView, signupView, chatView, accountView];
  let targetView;
  
  if (view === "login") targetView = loginView;
  else if (view === "signup") targetView = signupView;
  else if (view === "chat") targetView = chatView;
  else if (view === "account") targetView = accountView;
  
  if (!targetView) return;
  
  // Hide all views immediately
  views.forEach(v => v.classList.add("hidden"));
  
  // Show target view
  targetView.classList.remove("hidden");
  
  // Add entrance animation if not skipping
  if (!skipAnimation) {
    targetView.style.opacity = '0';
    targetView.style.transform = 'translateY(10px)';
    
    setTimeout(() => {
      targetView.style.transition = 'opacity 0.3s ease, transform 0.3s ease';
      targetView.style.opacity = '1';
      targetView.style.transform = 'translateY(0)';
      
      setTimeout(() => {
        targetView.style.transition = '';
        targetView.style.opacity = '';
        targetView.style.transform = '';
      }, 300);
    }, 10);
  }
}
function setRoomUI({ label, isPrivate }) {
  roomTitle.textContent = isPrivate ? `Private: ${label}` : "Group";
  roomBadge.textContent = isPrivate ? "Private" : "Group";
}
function renderHistory(items) {
  messagesEl.innerHTML = "";
  if (items && items.length > 0) {
    items.forEach(renderMessage);
  }
  messagesEl.scrollTop = messagesEl.scrollHeight;
}
function renderMessage(msg) {
  const wrap = document.createElement("div");
  wrap.className = "msg" + (msg.user === myName ? " me" : "");

  if (msg.type === "voice" && msg.voice) {
    // Voice message bubble
    const audioUrl = `data:${msg.voice.mimeType};base64,${msg.voice.audio}`;
    const duration = msg.voice.duration ? `${msg.voice.duration}s` : '';
    
    wrap.innerHTML = `
      <div class="voice-message">
        <span>🎤</span>
        <audio controls preload="none">
          <source src="${audioUrl}" type="${msg.voice.mimeType}">
          Your browser does not support audio playback.
        </audio>
        <span class="voice-duration">${duration}</span>
      </div>
      <div class="meta">
        <span>${escapeHtml(msg.user)}</span>
        <span>${new Date(msg.ts).toLocaleTimeString()}</span>
      </div>
    `;
  } else if (msg.type === "file" && msg.file) {
    // File bubble
    const isImage = msg.file.mime && msg.file.mime.startsWith("image/");
    const fileSize = formatBytes(msg.file.size || 0);
    const safeName = escapeHtml(msg.file.name || "file");
    const safeUrl  = msg.file.url;

    let inner = `<div class="attachment">`;
    if (isImage) {
      inner += `<a href="${safeUrl}" target="_blank" rel="noopener">
                  <img src="${safeUrl}" alt="${safeName}">
                </a>`;
    }
    inner += `
      <div class="file-card">
        <span class="file-icon">📎</span>
        <div class="file-info">
          <a href="${safeUrl}" target="_blank" rel="noopener">${safeName}</a>
          <div class="meta">${fileSize} • ${escapeHtml(msg.user)} • ${new Date(msg.ts).toLocaleTimeString()}</div>
        </div>
      </div>
    </div>`;
    wrap.innerHTML = inner;
  } else {
    // Text bubble
    wrap.innerHTML = `
      <div class="text">${escapeHtml(msg.text || "")}</div>
      <div class="meta">
        <span>${escapeHtml(msg.user)}</span>
        <span>${new Date(msg.ts).toLocaleTimeString()}</span>
      </div>
    `;
  }

  messagesEl.appendChild(wrap);
}
function escapeHtml(s) {
  return String(s)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}
function toggleMenu(forceState) {
  const shouldOpen = typeof forceState === "boolean" ? forceState : menu.classList.contains("hidden");
  
  if (shouldOpen) {
    // Create and show overlay
    let overlay = document.querySelector('.menu-overlay');
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.className = 'menu-overlay';
      document.body.appendChild(overlay);
      
      // Close menu when overlay is clicked
      overlay.addEventListener('click', () => toggleMenu(false));
    }
    
    // Animate menu in
    menu.classList.remove("hidden");
    setTimeout(() => {
      menu.classList.add("show");
      overlay.classList.add("show");
    }, 10);
    
    // Add escape key listener
    document.addEventListener('keydown', handleEscapeKey);
    
    // Animate menu items in sequence
    const menuItems = menu.querySelectorAll('#chatList li');
    menuItems.forEach((item, index) => {
      item.style.opacity = '0';
      item.style.transform = 'translateX(20px)';
      setTimeout(() => {
        item.style.transition = 'opacity 0.3s ease, transform 0.3s ease';
        item.style.opacity = '1';
        item.style.transform = 'translateX(0)';
      }, 100 + (index * 50));
    });
    
  } else {
    // Animate menu out
    const overlay = document.querySelector('.menu-overlay');
    menu.classList.remove("show");
    if (overlay) overlay.classList.remove("show");
    
    setTimeout(() => {
      menu.classList.add("hidden");
      if (overlay) overlay.remove();
    }, 400);
    
    // Remove escape key listener
    document.removeEventListener('keydown', handleEscapeKey);
  }
}

function handleEscapeKey(e) {
  if (e.key === "Escape") {
    toggleMenu(false);
  }
}
function toast(msg) {
  toastEl.textContent = msg;
  toastEl.classList.remove("hidden");
  toastEl.classList.add("show");
  
  clearTimeout(toastEl._t);
  clearTimeout(toastEl._hideTimer);
  
  // Auto-hide after delay
  toastEl._t = setTimeout(() => {
    toastEl.classList.remove("show");
    toastEl._hideTimer = setTimeout(() => {
      toastEl.classList.add("hidden");
    }, 400);
  }, 2500);
  
  // Add click to dismiss
  toastEl.onclick = () => {
    clearTimeout(toastEl._t);
    clearTimeout(toastEl._hideTimer);
    toastEl.classList.remove("show");
    setTimeout(() => toastEl.classList.add("hidden"), 400);
  };
}
function privateRoomOf(a, b) {
  return [a, b].sort().join("::");
}
function formatBytes(bytes) {
  if (!bytes) return "0 B";
  const sizes = ["B","KB","MB","GB","TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return (bytes / Math.pow(1024, i)).toFixed(i ? 1 : 0) + " " + sizes[i];
}

// --- Authentication functions ---
async function login(username, password) {
  try {
    // Clear previous errors
    loginError.textContent = "";
    
    // Client-side validation
    if (!username.trim() || !password.trim()) {
      loginError.textContent = "Username and password are required";
      return;
    }
    
    const response = await fetch('/login', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ 
        username: username.trim(), 
        password: password 
      })
    });
    
    const data = await response.json();
    
    if (data.success) {
      // Save token
      saveToken(data.token);
      
      currentUser = data.user;
      myName = data.user.username;
      
      // Update account page
      accountFullName.textContent = data.user.fullName || data.user.username;
      accountUsername.textContent = data.user.username;
      accountCreatedAt.textContent = new Date(data.user.createdAt).toLocaleDateString();
      
      // Clear login form
      loginUsername.value = "";
      loginPassword.value = "";
      
      // Join chat with the old password system for now
      socket.emit("joinGroup", { name: data.user.username, password: "123" });
      
      // Initialize call manager
      if (typeof initializeCallManager === 'function') {
        initializeCallManager();
      }
    } else {
      loginError.textContent = data.error || "Login failed";
    }
  } catch (error) {
    console.error("Login error:", error);
    loginError.textContent = "Network error. Please try again.";
  }
}

async function signup(fullName, username, password, confirmPassword) {
  try {
    // Clear previous errors
    signupError.textContent = "";
    signupError.style.color = "var(--danger)";
    
    // Client-side validation
    if (!fullName.trim() || !username.trim() || !password.trim() || !confirmPassword.trim()) {
      signupError.textContent = "All fields are required";
      return;
    }
    
    if (password !== confirmPassword) {
      signupError.textContent = "Passwords do not match";
      return;
    }
    
    if (fullName.trim().length < 2) {
      signupError.textContent = "Full name must be at least 2 characters";
      return;
    }
    
    if (username.trim().length < 3) {
      signupError.textContent = "Username must be at least 3 characters";
      return;
    }
    
    if (password.length < 6) {
      signupError.textContent = "Password must be at least 6 characters";
      return;
    }
    
    const response = await fetch('/signup', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ 
        fullName: fullName.trim(),
        username: username.trim(), 
        password: password, 
        confirmPassword: confirmPassword 
      })
    });
    
    const data = await response.json();
    
    if (data.success) {
      if (data.token && data.user) {
        // Auto-login after successful signup
        saveToken(data.token);
        currentUser = data.user;
        myName = data.user.username;
        
        // Update account page
        accountFullName.textContent = data.user.fullName || data.user.username;
        accountUsername.textContent = data.user.username;
        accountCreatedAt.textContent = new Date(data.user.createdAt).toLocaleDateString();
        
        // Clear form fields
        signupFullName.value = "";
        signupUsername.value = "";
        signupPassword.value = "";
        confirmPassword.value = "";
        
        // Join chat immediately
        socket.emit("joinGroup", { name: data.user.username, password: "123" });
        
        // Initialize call manager
        if (typeof initializeCallManager === 'function') {
          initializeCallManager();
        }
        
        toast("Account created successfully!");
      } else {
        // Fallback to old behavior
        signupError.style.color = "var(--accent)";
        signupError.textContent = data.message;
        
        // Clear form fields
        signupFullName.value = "";
        signupUsername.value = "";
        signupPassword.value = "";
        confirmPassword.value = "";
        
        // Redirect to login after 1.5 seconds
        setTimeout(() => {
          show("login");
          signupError.textContent = "";
          signupError.style.color = "var(--danger)";
          loginUsername.focus();
        }, 1500);
      }
    } else {
      signupError.textContent = data.error || "Signup failed";
    }
  } catch (error) {
    console.error("Signup error:", error);
    signupError.textContent = "Network error. Please try again.";
  }
}

async function updateAccount(fullName, currentPassword, newPassword) {
  try {
    accountEditError.textContent = "";
    
    if (!currentUser) {
      accountEditError.textContent = "Not logged in";
      return;
    }
    
    // Validation
    if (fullName && fullName.trim().length < 2) {
      accountEditError.textContent = "Full name must be at least 2 characters";
      return;
    }
    
    if (newPassword && newPassword.length < 6) {
      accountEditError.textContent = "New password must be at least 6 characters";
      return;
    }
    
    if (newPassword && !currentPassword) {
      accountEditError.textContent = "Current password is required to change password";
      return;
    }
    
    const response = await fetch('/update-account', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      headers: {
        'Content-Type': 'application/json',
        ...getAuthHeaders()
      },
      body: JSON.stringify({
        fullName: fullName?.trim(),
        currentPassword: currentPassword,
        newPassword: newPassword
      })
    });
    
    const data = await response.json();
    
    if (data.success) {
      // Update token if provided
      if (data.token) {
        saveToken(data.token);
      }
      
      // Update current user data
      currentUser = data.user;
      
      // Update display
      accountFullName.textContent = data.user.fullName || data.user.username;
      
      // Clear edit form
      editFullName.value = "";
      editCurrentPassword.value = "";
      editNewPassword.value = "";
      
      // Switch back to view mode
      toggleAccountEditMode(false);
      
      toast("Account updated successfully");
    } else {
      accountEditError.textContent = data.error || "Update failed";
    }
  } catch (error) {
    console.error("Account update error:", error);
    accountEditError.textContent = "Network error. Please try again.";
  }
}

function toggleAccountEditMode(isEditing) {
  if (isEditing) {
    accountViewMode.classList.add("hidden");
    accountEditMode.classList.remove("hidden");
    editAccountBtn.textContent = "Cancel";
    
    // Pre-fill edit form
    editFullName.value = currentUser?.fullName || "";
  } else {
    accountViewMode.classList.remove("hidden");
    accountEditMode.classList.add("hidden");
    editAccountBtn.textContent = "Edit";
    
    // Clear edit form
    editFullName.value = "";
    editCurrentPassword.value = "";
    editNewPassword.value = "";
    accountEditError.textContent = "";
  }
}

function logout() {
  // Clear token
  removeToken();
  
  currentUser = null;
  myName = "";
  socket.disconnect();
  show("login");
  
  // Clear forms
  loginUsername.value = "";
  loginPassword.value = "";
  loginError.textContent = "";
  
  // Clear unread counts
  unreadMap = {};
  updateUnreadBadge();
  
  // Reconnect socket for next login
  setTimeout(() => {
    socket.connect();
  }, 100);
  
  toast("Logged out successfully");
}

// --- Audio & Notifications ---
let notificationSound = null;
let serviceWorkerRegistration = null;
let notificationPermission = 'default';
let hasShownPermissionDialog = false;

// Initialize notification sound
function initNotificationSound() {
  if (!notificationSound) {
    notificationSound = new Audio('/sounds/sound.mp3');
    notificationSound.volume = 0.7;
    notificationSound.preload = 'auto';
  }
}

// Register service worker for mobile notifications
async function initServiceWorker() {
  if ('serviceWorker' in navigator) {
    try {
      serviceWorkerRegistration = await navigator.serviceWorker.register('/sw.js', {
        scope: '/'
      });
      
      serviceWorkerRegistration.addEventListener('updatefound', () => {
        console.log('Service Worker update found');
      });
      
      await serviceWorkerRegistration.update();
      
      if (serviceWorkerRegistration.waiting) {
        serviceWorkerRegistration.waiting.postMessage({ type: 'SKIP_WAITING' });
      }
      
      console.log('Service Worker registered successfully');
    } catch (error) {
      console.log('Service Worker registration failed:', error);
    }
  }
}

// Request notification permission after user gesture
async function requestNotificationPermission() {
  if (!('Notification' in window)) return 'denied';
  
  if (Notification.permission === 'default' && !hasShownPermissionDialog) {
    hasShownPermissionDialog = true;
    try {
      notificationPermission = await Notification.requestPermission();
    } catch (error) {
      console.log('Notification permission request failed:', error);
      notificationPermission = 'denied';
    }
  } else {
    notificationPermission = Notification.permission;
  }
  
  return notificationPermission;
}

// Show notification with mobile support and background detection
async function showNotification(msg) {
  const isBackground = document.hidden || document.visibilityState === 'hidden';
  hasNewMessages = true;
  
  // Always play sound for notifications (even in background for immediate feedback)
  playNotificationSound();

  // Vibrate on mobile (works in background too)
  if ("vibrate" in navigator) {
    navigator.vibrate([200, 100, 200]);
  }

  // Try to show notification
  const permission = await requestNotificationPermission();
  
  if (permission === 'granted') {
    try {
      // Enhanced notification data
      const notificationData = {
        type: 'SHOW_NOTIFICATION',
        title: '💬 Chat App',
        body: msg,
        tag: 'chat-message-' + Date.now(),
        data: {
          timestamp: Date.now(),
          isBackground: isBackground,
          currentRoom: currentRoomKey
        }
      };

      // Use service worker for background notifications (better mobile support)
      if (serviceWorkerRegistration && serviceWorkerRegistration.active && isBackground) {
        serviceWorkerRegistration.active.postMessage(notificationData);
      } else {
        // Direct notification API for foreground or as fallback
        const notification = new Notification("💬 Chat App", { 
          body: msg,
          icon: 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMTkyIiBoZWlnaHQ9IjE5MiIgdmlld0JveD0iMCAwIDI0IDI0IiBmaWxsPSJub25lIiB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciPjxwYXRoIGQ9Ik0yMCAySDE0QzMuNDUgMiAzIDIuNDUgMyAzVjIxTDcgMTdIMjBDMjAuNTUgMTcgMjEgMTYuNTUgMjEgMTZWM0MyMSAyLjQ1IDIwLjU1IDIgMjAgMloiIGZpbGw9IiMwMGE4ODQiLz48L3N2Zz4=',
          badge: 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMTkyIiBoZWlnaHQ9IjE5MiIgdmlld0JveD0iMCAwIDI0IDI0IiBmaWxsPSJub25lIiB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciPjxwYXRoIGQ9Ik0yMCAySDE0QzMuNDUgMiAzIDIuNDUgMyAzVjIxTDcgMTdIMjBDMjAuNTUgMTcgMjEgMTYuNTUgMjEgMTZWM0MyMSAyLjQ1IDIwLjU1IDIgMjAgMloiIGZpbGw9IiMwMGE4ODQiLz48L3N2Zz4=',
          tag: notificationData.tag,
          requireInteraction: false,
          silent: false,
          data: notificationData.data
        });

        // Auto close after delay
        setTimeout(() => notification.close(), isBackground ? 8000 : 6000);
      }
        
      // Set app badge if supported
      if ('setAppBadge' in navigator) {
        const totalUnread = Object.keys(unreadMap).length;
        navigator.setAppBadge(totalUnread > 0 ? totalUnread : 1);
      }
    } catch (error) {
      console.log('Failed to show notification:', error);
      showInAppNotification(msg);
    }
  } else {
    // Fallback to in-app toast for denied/unsupported
    showInAppNotification(msg);
  }
}

// Fallback in-app notification
function showInAppNotification(msg) {
  toast(`💬 ${msg}`);
}

// Cross-chat notification with enhanced styling
async function showCrossChatNotification(title, body) {
  const isBackground = document.hidden || document.visibilityState === 'hidden';
  hasNewMessages = true;
  
  // Always play sound for cross-chat notifications
  playNotificationSound();

  // Vibrate on mobile
  if ("vibrate" in navigator) {
    navigator.vibrate([150, 75, 150]);
  }

  // Try to show notification
  const permission = await requestNotificationPermission();
  
  if (permission === 'granted') {
    try {
      // Enhanced notification data for cross-chat
      const notificationData = {
        type: 'SHOW_NOTIFICATION',
        title: title,
        body: body,
        tag: 'cross-chat-' + Date.now(),
        data: {
          timestamp: Date.now(),
          isBackground: isBackground,
          currentRoom: currentRoomKey,
          isCrossChat: true
        }
      };

      // Use service worker for background notifications
      if (serviceWorkerRegistration && serviceWorkerRegistration.active && isBackground) {
        serviceWorkerRegistration.active.postMessage(notificationData);
      } else {
        // Direct notification API for foreground or as fallback
        const notification = new Notification(title, { 
          body: body,
          icon: 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMTkyIiBoZWlnaHQ9IjE5MiIgdmlld0JveD0iMCAwIDI0IDI0IiBmaWxsPSJub25lIiB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciPjxwYXRoIGQ9Ik0yMCAySDE0QzMuNDUgMiAzIDIuNDUgMyAzVjIxTDcgMTdIMjBDMjAuNTUgMTcgMjEgMTYuNTUgMjEgMTZWM0MyMSAyLjQ1IDIwLjU1IDIgMjAgMloiIGZpbGw9IiMwMGE4ODQiLz48L3N2Zz4=',
          badge: 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMTkyIiBoZWlnaHQ9IjE5MiIgdmlld0JveD0iMCAwIDI0IDI0IiBmaWxsPSJub25lIiB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciPjxwYXRoIGQ9Ik0yMCAySDE0QzMuNDUgMiAzIDIuNDUgMyAzVjIxTDcgMTdIMjBDMjAuNTUgMTcgMjEgMTYuNTUgMjEgMTZWM0MyMSAyLjQ1IDIwLjU1IDIgMjAgMloiIGZpbGw9IiMwMGE4ODQiLz48L3N2Zz4=',
          tag: notificationData.tag,
          requireInteraction: true, // Make cross-chat notifications more persistent
          silent: false,
          data: notificationData.data
        });

        // Auto close after longer delay for cross-chat
        setTimeout(() => notification.close(), isBackground ? 12000 : 8000);
      }
        
      // Set app badge if supported
      if ('setAppBadge' in navigator) {
        const totalUnread = Object.keys(unreadMap).length;
        navigator.setAppBadge(totalUnread > 0 ? totalUnread : 1);
      }
    } catch (error) {
      console.log('Failed to show cross-chat notification:', error);
      showInAppNotification(`${title}: ${body}`);
    }
  } else {
    // Fallback to enhanced in-app toast for cross-chat
    toast(`🔔 ${title}: ${body}`);
  }
}

function playNotificationSound() {
  if (notificationSound) {
    try {
      notificationSound.currentTime = 0;
      const playPromise = notificationSound.play();
      if (playPromise !== undefined) {
        playPromise.catch((error) => {
          console.log('Could not play notification sound:', error);
          // Try to create a new audio instance as fallback
          try {
            const fallbackSound = new Audio('/sounds/sound.mp3');
            fallbackSound.volume = 0.7;
            fallbackSound.play().catch(() => {});
          } catch (e) {}
        });
      }
    } catch (error) {
      console.log('Sound playback error:', error);
    }
  }
}

// Initialize on first user interaction
function initOnUserGesture() {
  initNotificationSound();
  requestNotificationPermission();
}

// Token verification function
async function verifyStoredToken() {
  const token = getToken();
  if (!token) {
    return false;
  }
  
  try {
    const response = await fetch('/verify-token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...getAuthHeaders()
      }
    });
    
    const data = await response.json();
    
    if (data.success && data.user) {
      // Token is valid, restore session
      currentUser = data.user;
      myName = data.user.username;
      
      // Update account page
      accountFullName.textContent = data.user.fullName || data.user.username;
      accountUsername.textContent = data.user.username;
      accountCreatedAt.textContent = new Date(data.user.createdAt).toLocaleDateString();
      
      // Join chat automatically
      socket.emit("joinGroup", { name: data.user.username, password: "123" });
      
      // Initialize call manager
      if (typeof initializeCallManager === 'function') {
        initializeCallManager();
      }
      
      return true;
    } else {
      // Token is invalid, remove it
      removeToken();
      return false;
    }
  } catch (error) {
    console.error("Token verification failed:", error);
    removeToken();
    return false;
  }
}

// Initialize service worker and set up gesture listeners
document.addEventListener('DOMContentLoaded', async () => {
  initServiceWorker();
  
  // Try to verify stored token first
  const isAuthenticated = await verifyStoredToken();
  
  if (isAuthenticated) {
    // Show chat if user is already authenticated
    show("chat", true);
  } else {
    // Show login page if not authenticated
    show("login", true);
    
    // Add a slight delay before focusing to allow page to settle
    setTimeout(() => {
      loginUsername.focus();
    }, 100);
  }
  
  // Set up one-time gesture listeners
  document.addEventListener('click', initOnUserGesture, { once: true });
  document.addEventListener('keydown', initOnUserGesture, { once: true });
  document.addEventListener('touchstart', initOnUserGesture, { once: true });
  
  // Handle visibility changes for background notifications
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) {
      // Update badge to show remaining unread when user returns to app
      if ('setAppBadge' in navigator) {
        const unreadCount = Object.keys(unreadMap).length;
        navigator.setAppBadge(unreadCount);
      }
      // Clear notification permission dialog flag when returning to foreground
      if (document.visibilityState === 'visible') {
        hasShownPermissionDialog = false;
      }
      // Update title
      updateUnreadBadge();
    }
  });
  
  // Handle page focus/blur for better background detection
  window.addEventListener('focus', () => {
    const unreadCount = Object.keys(unreadMap).length;
    if ('setAppBadge' in navigator) {
      navigator.setAppBadge(unreadCount);
    }
    // Update title when focused
    updateUnreadBadge();
  });
  
  // Handle page blur to detect when app goes to background
  window.addEventListener('blur', () => {
    hasNewMessages = false;
  });
});

// --- Auth event handlers ---
loginBtn.addEventListener("click", (e) => {
  if (window.AnimationManager) {
    AnimationManager.ripple(loginBtn, e);
  }
  const username = loginUsername.value.trim();
  const password = loginPassword.value.trim();
  if (username && password) {
    login(username, password);
  }
});

signupBtn.addEventListener("click", (e) => {
  if (window.AnimationManager) {
    AnimationManager.ripple(signupBtn, e);
  }
  const fullName = signupFullName.value.trim();
  const username = signupUsername.value.trim();
  const password = signupPassword.value.trim();
  const confirmPass = confirmPassword.value.trim();
  if (fullName && username && password && confirmPass) {
    signup(fullName, username, password, confirmPass);
  }
});

showSignupBtn.addEventListener("click", (e) => {
  e.preventDefault();
  show("signup");
  signupUsername.focus();
});

showLoginBtn.addEventListener("click", (e) => {
  e.preventDefault();
  show("login");
  loginUsername.focus();
});

accountBtn.addEventListener("click", () => {
  show("account");
});

accountBackBtn.addEventListener("click", () => {
  show("chat");
});

togglePasswordBtn.addEventListener("click", () => {
  if (togglePasswordBtn.textContent === "Show") {
    // For security, we don't store the actual password, so we show a message
    accountPassword.textContent = "Password is securely hashed and cannot be displayed";
    togglePasswordBtn.textContent = "Hide";
  } else {
    accountPassword.textContent = "••••••••";
    togglePasswordBtn.textContent = "Show";
  }
});

editAccountBtn.addEventListener("click", () => {
  const isCurrentlyEditing = accountEditMode.classList.contains("hidden") === false;
  toggleAccountEditMode(!isCurrentlyEditing);
});

saveAccountBtn.addEventListener("click", () => {
  const fullName = editFullName.value.trim();
  const currentPassword = editCurrentPassword.value;
  const newPassword = editNewPassword.value;
  
  if (fullName || (currentPassword && newPassword)) {
    updateAccount(fullName, currentPassword, newPassword);
  } else {
    accountEditError.textContent = "Please make at least one change";
  }
});

cancelEditBtn.addEventListener("click", () => {
  toggleAccountEditMode(false);
});

logoutBtn.addEventListener("click", logout);

// Enter key handlers with enhanced focus animations
[loginUsername, loginPassword].forEach(el => {
  el.addEventListener("keydown", (e) => {
    if (e.key === "Enter") loginBtn.click();
  });
  
  // Add focus animations
  el.addEventListener("focus", () => {
    el.style.transform = 'translateY(-2px)';
    el.style.boxShadow = '0 8px 25px rgba(0, 168, 132, 0.15)';
  });
  
  el.addEventListener("blur", () => {
    el.style.transform = 'translateY(0)';
    el.style.boxShadow = 'none';
  });
});

[signupFullName, signupUsername, signupPassword, confirmPassword].forEach(el => {
  el.addEventListener("keydown", (e) => {
    if (e.key === "Enter") signupBtn.click();
  });
  
  // Add focus animations
  el.addEventListener("focus", () => {
    el.style.transform = 'translateY(-2px)';
    el.style.boxShadow = '0 8px 25px rgba(0, 168, 132, 0.15)';
  });
  
  el.addEventListener("blur", () => {
    el.style.transform = 'translateY(0)';
    el.style.boxShadow = 'none';
  });
});

[editFullName, editCurrentPassword, editNewPassword].forEach(el => {
  el.addEventListener("keydown", (e) => {
    if (e.key === "Enter") saveAccountBtn.click();
  });
  
  // Add focus animations
  el.addEventListener("focus", () => {
    el.style.transform = 'translateY(-2px)';
    el.style.boxShadow = '0 8px 25px rgba(0, 168, 132, 0.15)';
  });
  
  el.addEventListener("blur", () => {
    el.style.transform = 'translateY(0)';
    el.style.boxShadow = 'none';
  });
});

socket.on("authError", (msg) => {
  loginError.textContent = msg || "Auth error";
});

// --- Room switching & history ---
socket.on("switchedRoom", ({ roomKey, label, isPrivate }) => {
  console.log("Room switched:", roomKey, label, isPrivate);
  
  // Update room state FIRST
  currentRoomKey = roomKey;
  
  // Show chat view immediately (no animation to prevent flickering)
  show("chat", true);
  
  // Update UI after chat is shown
  setRoomUI({ label, isPrivate });

  // Reset unread for this peer if private
  if (isPrivate) {
    // Find the actual username from the room key for private chats
    const [u1, u2] = roomKey.split("::");
    const targetUsername = u1 === myName ? u2 : u1;
    
    // Clear unread for the target user
    delete unreadMap[targetUsername];
    updateUnreadBadge();
    
    // Force refresh of users list to update styling immediately
    setTimeout(() => {
      socket.emit("requestUsersList");
    }, 50);
  }
  
  // Clear app badge when user is actively using the app
  if ('setAppBadge' in navigator) {
    const remainingUnread = Object.keys(unreadMap).length;
    navigator.setAppBadge(remainingUnread);
  }
  
  // Update call button visibility
  if (typeof addCallButton === 'function') {
    addCallButton();
  }
});

socket.on("roomHistory", ({ roomKey, items }) => {
  console.log("Room history received:", roomKey, items?.length, "messages");
  
  // Always check if this history is for the current room
  if (roomKey !== currentRoomKey) {
    console.log("History ignored - not current room");
    return;
  }
  
  // Clear any existing messages first
  messagesEl.innerHTML = "";
  
  // Render messages for this room
  if (items && items.length > 0) {
    console.log("Rendering", items.length, "messages");
    items.forEach((msg, index) => {
      // Add a small delay between messages to make them visible
      setTimeout(() => {
        renderMessage(msg);
        // Scroll to bottom after last message
        if (index === items.length - 1) {
          messagesEl.scrollTop = messagesEl.scrollHeight;
        }
      }, index * 10);
    });
  } else {
    console.log("No messages to render");
    // Ensure the messages area is visible even with no messages
    messagesEl.style.minHeight = "100px";
  }
});

// --- Users list & menu ---
socket.on("usersList", (users) => {
  chatList.innerHTML = "";

  // Group entry
  const groupItem = document.createElement("li");
  groupItem.innerHTML = `
    <div class="item-left">
      <span class="pill">All</span>
      <strong>Group</strong>
    </div>
  `;
  groupItem.addEventListener("click", () => {
    socket.emit("joinGroupRoom");
    toggleMenu(false);
  });
  chatList.appendChild(groupItem);

  // Online users
  users.forEach((userInfo) => {
    const username = typeof userInfo === 'string' ? userInfo : userInfo.username;
    const fullName = typeof userInfo === 'object' ? userInfo.fullName : username;
    const displayName = fullName || username;
    
    if (username === myName) return;
    const item = document.createElement("li");
    const hasUnread = unreadMap[username] && unreadMap[username] > 0;
    const unreadCount = unreadMap[username] || 0;
    
    // Style for unread messages: bold green name with count
    const nameStyle = hasUnread ? 'style="color: #00e676; font-weight: bold;"' : '';
    const nameWithCount = hasUnread ? `${escapeHtml(displayName)} (${unreadCount})` : escapeHtml(displayName);
    
    item.innerHTML = `
      <div class="item-left">
        <span class="pill">Online</span>
        <span ${nameStyle}>${nameWithCount}</span>
        ${username !== displayName && !hasUnread ? `<small style="color: var(--muted); font-size: 11px;">@${escapeHtml(username)}</small>` : ''}
      </div>
    `;
    item.addEventListener("click", () => {
      socket.emit("openPrivate", username);
      toggleMenu(false);
      
      // Clear unread for this user when clicked
      if (hasUnread) {
        delete unreadMap[username];
        updateUnreadBadge();
        // Refresh the users list to update styling
        setTimeout(() => {
          socket.emit("requestUsersList");
        }, 100);
      }
    });
    chatList.appendChild(item);
  });
});

// Incoming private ping (optional)
socket.on("privatePing", ({ from }) => {
  if (from) toast(`Private chat with ${from} is open`);
});

// --- Unread + notifications ---
socket.on("privateUnread", ({ from, kind, preview, fileName }) => {
  // Ignore if already in that private room
  if (currentRoomKey === privateRoomOf(myName, from)) return;

  unreadMap[from] = (unreadMap[from] || 0) + 1;
  updateUnreadBadge();

  // Note: Notification is already handled by the main "message" event handler
  // This prevents duplicate notifications for private messages
});

function updateUnreadBadge() {
  const distinct = Object.keys(unreadMap).length;
  const totalMessages = Object.values(unreadMap).reduce((sum, count) => sum + count, 0);
  
  // Show distinct users count, but could show total messages if preferred
  const badgeCount = distinct;
  
  menuBtn.setAttribute("data-badge", badgeCount > 0 ? String(badgeCount) : "");
  
  // Add visual feedback when badge updates
  if (badgeCount > 0) {
    menuBtn.classList.add("has-unread");
    // Animate the badge
    setTimeout(() => {
      const badge = menuBtn.querySelector("::after");
      if (badge) {
        menuBtn.style.animation = "none";
        setTimeout(() => {
          menuBtn.style.animation = "pulse-badge 1.5s ease-in-out infinite";
        }, 10);
      }
    }, 100);
  } else {
    menuBtn.classList.remove("has-unread");
    menuBtn.style.animation = "";
  }
  
  // Update browser badge if supported
  if ('setAppBadge' in navigator) {
    navigator.setAppBadge(badgeCount > 0 ? badgeCount : 0);
  }
  
  // Update page title with unread indicator
  if (badgeCount > 0) {
    document.title = `(${badgeCount}) Chat App`;
  } else {
    document.title = "Chat App";
  }
}

// --- Messages ---
sendBtn.addEventListener("click", (e) => {
  if (window.AnimationManager) {
    AnimationManager.ripple(sendBtn, e);
  }
  sendMessage();
});

msgInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") {
    if (window.AnimationManager) {
      AnimationManager.bounce(sendBtn);
    }
    sendMessage();
  }
  // typing indicator
  if (!isTyping) {
    isTyping = true;
    socket.emit("typing", true);
  }
  clearTimeout(typingTimer);
  typingTimer = setTimeout(() => {
    isTyping = false;
    socket.emit("typing", false);
  }, 1200);
});

function sendMessage() {
  const text = msgInput.value.trim();
  if (!text) return;
  socket.emit("sendMessage", text);
  msgInput.value = "";
}

// Render incoming message
socket.on("message", (payload) => {
  renderMessage(payload);
  messagesEl.scrollTop = messagesEl.scrollHeight;

  // Only show notification for messages from other users in the current room
  if (payload.user !== myName && payload.roomKey === currentRoomKey) {
    let notificationMsg;
    if (payload.type === "file") {
      notificationMsg = `${payload.user} sent a file${payload.file?.name ? `: ${payload.file.name}` : ""}`;
    } else if (payload.type === "voice") {
      notificationMsg = `${payload.user} sent a voice message`;
    } else {
      notificationMsg = `${payload.user}: ${payload.text}`;
    }
    showNotification(notificationMsg);
  }
});

// Handle cross-chat notifications (messages from other chats)
socket.on("crossChatNotification", ({ type, from, message, roomKey }) => {
  // Only show if not from current user and not in the source room
  if (from !== myName && roomKey !== currentRoomKey) {
    let notificationTitle;
    let notificationBody;
    
    if (type === "group") {
      notificationTitle = "📢 Group Chat";
      notificationBody = `${from}: ${message}`;
    } else {
      notificationTitle = "💬 Private Message";
      notificationBody = `${from}: ${message}`;
    }
    
    // Show notification with sound
    showCrossChatNotification(notificationTitle, notificationBody);
    
    // Play notification sound specifically for cross-chat messages
    playNotificationSound();
    
    // Vibrate on mobile
    if ("vibrate" in navigator) {
      navigator.vibrate([150, 75, 150]);
    }
  }
});

// Typing indicator (simple inline toast)
socket.on("typing", ({ user, isTyping, roomKey }) => {
  if (roomKey !== currentRoomKey) return;
  if (isTyping) toast(`${user} is typing...`);
});

// --- Voice Messages ---
voiceBtn.addEventListener("mousedown", startVoiceRecording);
voiceBtn.addEventListener("mouseup", stopVoiceRecording);
voiceBtn.addEventListener("mouseleave", stopVoiceRecording);
voiceBtn.addEventListener("touchstart", startVoiceRecording);
voiceBtn.addEventListener("touchend", stopVoiceRecording);
voiceBtn.addEventListener("touchcancel", stopVoiceRecording);

async function startVoiceRecording(e) {
  e.preventDefault();
  if (isRecording) return;

  try {
    const stream = await navigator.mediaDevices.getUserMedia({ 
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true
      } 
    });
    
    audioChunks = [];
    mediaRecorder = new MediaRecorder(stream, {
      mimeType: MediaRecorder.isTypeSupported('audio/webm;codecs=opus') ? 'audio/webm;codecs=opus' : 'audio/webm'
    });
    
    mediaRecorder.ondataavailable = (event) => {
      if (event.data.size > 0) {
        audioChunks.push(event.data);
      }
    };
    
    mediaRecorder.onstop = async () => {
      const audioBlob = new Blob(audioChunks, { type: mediaRecorder.mimeType });
      const duration = Date.now() - recordingStartTime;
      
      // Convert to base64 for socket transmission
      const reader = new FileReader();
      reader.onloadend = () => {
        const base64Audio = reader.result.split(',')[1];
        socket.emit('voiceMessage', {
          audio: base64Audio,
          mimeType: mediaRecorder.mimeType,
          duration: Math.round(duration / 1000)
        });
      };
      reader.readAsDataURL(audioBlob);
      
      // Stop all tracks
      stream.getTracks().forEach(track => track.stop());
    };
    
    mediaRecorder.start();
    isRecording = true;
    recordingStartTime = Date.now();
    voiceBtn.classList.add('recording');
    voiceBtn.title = 'Recording... Release to send';
    
  } catch (error) {
    console.error('Error accessing microphone:', error);
    toast('Microphone access denied or not available');
  }
}

function stopVoiceRecording(e) {
  e.preventDefault();
  if (!isRecording || !mediaRecorder) return;
  
  const recordingDuration = Date.now() - recordingStartTime;
  
  // Only send if recording is at least 1 second
  if (recordingDuration >= 1000) {
    mediaRecorder.stop();
  } else {
    // Cancel recording if too short
    mediaRecorder.stop();
    toast('Recording too short');
  }
  
  isRecording = false;
  voiceBtn.classList.remove('recording');
  voiceBtn.title = 'Voice Message';
}

// --- Attachments ---
attachBtn.addEventListener("click", () => fileInput.click());
fileInput.addEventListener("change", async () => {
  const files = Array.from(fileInput.files || []);
  if (!files.length) return;

  for (const file of files) {
    try {
      const meta = await uploadFile(file);
      socket.emit("fileMessage", meta);
    } catch (e) {
      toast("Upload failed for " + (file?.name || "file"));
    }
  }
  fileInput.value = ""; // reset
});

async function uploadFile(file) {
  const fd = new FormData();
  fd.append("file", file);
  const res = await fetch("/upload", { method: "POST", body: fd });
  if (!res.ok) throw new Error("Upload failed");
  return await res.json(); // { url, name, size, mime }
}

// --- Menu controls ---
menuBtn.addEventListener("click", () => toggleMenu());
menuClose.addEventListener("click", () => toggleMenu(false));
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") toggleMenu(false);
});