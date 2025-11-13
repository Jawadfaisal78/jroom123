
// WebRTC Calling System
class CallManager {
  constructor(socket, currentUser) {
    this.socket = socket;
    this.currentUser = currentUser;
    this.localStream = null;
    this.remoteStream = null;
    this.peerConnection = null;
    this.isInCall = false;
    this.currentCall = null;
    
    this.setupCallUI();
    this.setupSocketEvents();
    this.setupPeerConnection();
  }
  
  setupCallUI() {
    // Create call UI elements
    const callUI = document.createElement('div');
    callUI.id = 'callUI';
    callUI.className = 'call-overlay hidden';
    callUI.innerHTML = `
      <div class="call-container">
        <div class="call-header">
          <h3 id="callTitle">Calling...</h3>
          <p id="callStatus">Connecting...</p>
        </div>
        
        <div class="call-video-container">
          <video id="remoteVideo" autoplay playsinline></video>
          <video id="localVideo" autoplay playsinline muted></video>
        </div>
        
        <div class="call-controls">
          <button id="muteBtn" class="call-btn mute-btn" title="Mute">
            <span class="icon">🎤</span>
          </button>
          <button id="videoBtn" class="call-btn video-btn" title="Video">
            <span class="icon">📹</span>
          </button>
          <button id="endCallBtn" class="call-btn end-btn" title="End Call">
            <span class="icon">📞</span>
          </button>
        </div>
      </div>
      
      <div id="incomingCallUI" class="incoming-call hidden">
        <div class="incoming-call-content">
          <h3 id="incomingCallTitle">Incoming Call</h3>
          <p id="incomingCallFrom">From: Unknown</p>
          <div class="incoming-call-buttons">
            <button id="acceptCallBtn" class="call-btn accept-btn">
              <span class="icon">📞</span>
              <span>Accept</span>
            </button>
            <button id="rejectCallBtn" class="call-btn reject-btn">
              <span class="icon">❌</span>
              <span>Reject</span>
            </button>
          </div>
        </div>
      </div>
    `;
    
    document.body.appendChild(callUI);
    
    // Get UI elements
    this.callUI = callUI;
    this.callTitle = document.getElementById('callTitle');
    this.callStatus = document.getElementById('callStatus');
    this.remoteVideo = document.getElementById('remoteVideo');
    this.localVideo = document.getElementById('localVideo');
    this.muteBtn = document.getElementById('muteBtn');
    this.videoBtn = document.getElementById('videoBtn');
    this.endCallBtn = document.getElementById('endCallBtn');
    this.incomingCallUI = document.getElementById('incomingCallUI');
    this.incomingCallTitle = document.getElementById('incomingCallTitle');
    this.incomingCallFrom = document.getElementById('incomingCallFrom');
    this.acceptCallBtn = document.getElementById('acceptCallBtn');
    this.rejectCallBtn = document.getElementById('rejectCallBtn');
    
    // Add event listeners
    this.endCallBtn.addEventListener('click', () => this.endCall());
    this.muteBtn.addEventListener('click', () => this.toggleMute());
    this.videoBtn.addEventListener('click', () => this.toggleVideo());
    this.acceptCallBtn.addEventListener('click', () => this.acceptCall());
    this.rejectCallBtn.addEventListener('click', () => this.rejectCall());
  }
  
  setupSocketEvents() {
    this.socket.on('call-offer', (data) => {
      this.handleCallOffer(data);
    });
    
    this.socket.on('call-answer', (data) => {
      this.handleCallAnswer(data);
    });
    
    this.socket.on('call-ice-candidate', (data) => {
      this.handleIceCandidate(data);
    });
    
    this.socket.on('call-rejected', (data) => {
      this.handleCallRejected(data);
    });
    
    this.socket.on('call-ended', (data) => {
      this.handleCallEnded(data);
    });
    
    this.socket.on('call-user-busy', (data) => {
      this.handleUserBusy(data);
    });
  }
  
  setupPeerConnection() {
    const configuration = {
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' }
      ]
    };
    
    this.peerConnection = new RTCPeerConnection(configuration);
    
    this.peerConnection.onicecandidate = (event) => {
      if (event.candidate && this.currentCall) {
        this.socket.emit('call-ice-candidate', {
          to: this.currentCall.targetUser,
          candidate: event.candidate
        });
      }
    };
    
    this.peerConnection.ontrack = (event) => {
      this.remoteStream = event.streams[0];
      this.remoteVideo.srcObject = this.remoteStream;
      this.callStatus.textContent = 'Connected';
    };
    
    this.peerConnection.onconnectionstatechange = () => {
      console.log('Connection state:', this.peerConnection.connectionState);
      if (this.peerConnection.connectionState === 'connected') {
        this.callStatus.textContent = 'Connected';
      } else if (this.peerConnection.connectionState === 'disconnected') {
        this.endCall();
      }
    };
  }
  
  async startCall(targetUser) {
    if (this.isInCall) {
      toast('Already in a call');
      return;
    }
    
    try {
      // Get user media
      this.localStream = await navigator.mediaDevices.getUserMedia({
        video: true,
        audio: true
      });
      
      this.localVideo.srcObject = this.localStream;
      
      // Add tracks to peer connection
      this.localStream.getTracks().forEach(track => {
        this.peerConnection.addTrack(track, this.localStream);
      });
      
      // Create and send offer
      const offer = await this.peerConnection.createOffer();
      await this.peerConnection.setLocalDescription(offer);
      
      this.currentCall = {
        targetUser,
        type: 'outgoing',
        startTime: Date.now()
      };
      
      this.socket.emit('call-offer', {
        to: targetUser,
        offer: offer,
        from: this.currentUser.username
      });
      
      this.showCallUI(targetUser, 'Calling...');
      this.isInCall = true;
      
      // Set timeout for call
      setTimeout(() => {
        if (this.currentCall && this.currentCall.type === 'outgoing' && this.callStatus.textContent === 'Calling...') {
          this.endCall();
          toast('Call timeout');
        }
      }, 30000); // 30 second timeout
      
    } catch (error) {
      console.error('Error starting call:', error);
      toast('Failed to access camera/microphone');
    }
  }
  
  async handleCallOffer(data) {
    if (this.isInCall) {
      this.socket.emit('call-user-busy', { to: data.from });
      return;
    }
    
    this.currentCall = {
      targetUser: data.from,
      type: 'incoming',
      offer: data.offer
    };
    
    this.showIncomingCall(data.from);
  }
  
  async acceptCall() {
    try {
      if (!this.currentCall) return;
      
      // Get user media
      this.localStream = await navigator.mediaDevices.getUserMedia({
        video: true,
        audio: true
      });
      
      this.localVideo.srcObject = this.localStream;
      
      // Add tracks to peer connection
      this.localStream.getTracks().forEach(track => {
        this.peerConnection.addTrack(track, this.localStream);
      });
      
      // Set remote description from offer
      await this.peerConnection.setRemoteDescription(this.currentCall.offer);
      
      // Create and send answer
      const answer = await this.peerConnection.createAnswer();
      await this.peerConnection.setLocalDescription(answer);
      
      this.socket.emit('call-answer', {
        to: this.currentCall.targetUser,
        answer: answer
      });
      
      this.hideIncomingCall();
      this.showCallUI(this.currentCall.targetUser, 'Connected');
      this.isInCall = true;
      
    } catch (error) {
      console.error('Error accepting call:', error);
      this.rejectCall();
    }
  }
  
  rejectCall() {
    if (this.currentCall) {
      this.socket.emit('call-rejected', { to: this.currentCall.targetUser });
      this.currentCall = null;
    }
    this.hideIncomingCall();
  }
  
  async handleCallAnswer(data) {
    if (this.currentCall && this.peerConnection) {
      await this.peerConnection.setRemoteDescription(data.answer);
      this.callStatus.textContent = 'Connected';
    }
  }
  
  async handleIceCandidate(data) {
    if (this.peerConnection) {
      await this.peerConnection.addIceCandidate(data.candidate);
    }
  }
  
  handleCallRejected(data) {
    this.callStatus.textContent = 'Call rejected';
    setTimeout(() => this.endCall(), 2000);
  }
  
  handleCallEnded(data) {
    this.endCall();
  }
  
  handleUserBusy(data) {
    this.callStatus.textContent = 'User is busy';
    setTimeout(() => this.endCall(), 2000);
  }
  
  endCall() {
    // Clean up streams
    if (this.localStream) {
      this.localStream.getTracks().forEach(track => track.stop());
      this.localStream = null;
    }
    
    if (this.remoteStream) {
      this.remoteStream.getTracks().forEach(track => track.stop());
      this.remoteStream = null;
    }
    
    // Clean up peer connection
    if (this.peerConnection) {
      this.peerConnection.close();
      this.setupPeerConnection(); // Create new peer connection for next call
    }
    
    // Notify other user
    if (this.currentCall) {
      this.socket.emit('call-ended', { to: this.currentCall.targetUser });
    }
    
    // Reset state
    this.currentCall = null;
    this.isInCall = false;
    
    // Hide UI
    this.hideCallUI();
    this.hideIncomingCall();
  }
  
  toggleMute() {
    if (this.localStream) {
      const audioTrack = this.localStream.getAudioTracks()[0];
      if (audioTrack) {
        audioTrack.enabled = !audioTrack.enabled;
        this.muteBtn.classList.toggle('muted', !audioTrack.enabled);
        this.muteBtn.querySelector('.icon').textContent = audioTrack.enabled ? '🎤' : '🔇';
      }
    }
  }
  
  toggleVideo() {
    if (this.localStream) {
      const videoTrack = this.localStream.getVideoTracks()[0];
      if (videoTrack) {
        videoTrack.enabled = !videoTrack.enabled;
        this.videoBtn.classList.toggle('disabled', !videoTrack.enabled);
        this.videoBtn.querySelector('.icon').textContent = videoTrack.enabled ? '📹' : '📷';
      }
    }
  }
  
  showCallUI(targetUser, status) {
    this.callTitle.textContent = targetUser;
    this.callStatus.textContent = status;
    this.callUI.classList.remove('hidden');
  }
  
  hideCallUI() {
    this.callUI.classList.add('hidden');
  }
  
  showIncomingCall(fromUser) {
    this.incomingCallFrom.textContent = `From: ${fromUser}`;
    this.incomingCallUI.classList.remove('hidden');
    
    // Play ringing sound
    this.playRingtone();
  }
  
  hideIncomingCall() {
    this.incomingCallUI.classList.add('hidden');
    this.stopRingtone();
  }
  
  playRingtone() {
    // Create a simple ringtone using Web Audio API
    if (!this.audioContext) {
      this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
    }
    
    const oscillator = this.audioContext.createOscillator();
    const gainNode = this.audioContext.createGain();
    
    oscillator.connect(gainNode);
    gainNode.connect(this.audioContext.destination);
    
    oscillator.frequency.setValueAtTime(800, this.audioContext.currentTime);
    gainNode.gain.setValueAtTime(0.1, this.audioContext.currentTime);
    
    oscillator.start();
    oscillator.stop(this.audioContext.currentTime + 0.5);
    
    this.ringtoneInterval = setInterval(() => {
      if (this.incomingCallUI.classList.contains('hidden')) {
        this.stopRingtone();
        return;
      }
      
      const osc = this.audioContext.createOscillator();
      const gain = this.audioContext.createGain();
      
      osc.connect(gain);
      gain.connect(this.audioContext.destination);
      
      osc.frequency.setValueAtTime(800, this.audioContext.currentTime);
      gain.gain.setValueAtTime(0.1, this.audioContext.currentTime);
      
      osc.start();
      osc.stop(this.audioContext.currentTime + 0.5);
    }, 2000);
  }
  
  stopRingtone() {
    if (this.ringtoneInterval) {
      clearInterval(this.ringtoneInterval);
      this.ringtoneInterval = null;
    }
  }
}

// Initialize call manager when user is authenticated
let callManager = null;

function initializeCallManager() {
  if (currentUser && !callManager) {
    callManager = new CallManager(socket, currentUser);
  }
}

// Add call button to private chat header
function addCallButton() {
  const roomInfo = document.querySelector('.room-info');
  let callBtn = document.getElementById('callBtn');
  
  if (!callBtn) {
    callBtn = document.createElement('button');
    callBtn.id = 'callBtn';
    callBtn.className = 'icon-btn call-btn';
    callBtn.title = 'Video Call';
    callBtn.innerHTML = '📞';
    callBtn.style.display = 'none';
    
    callBtn.addEventListener('click', () => {
      if (currentRoomKey !== 'group' && currentRoomKey.includes('::')) {
        const [u1, u2] = currentRoomKey.split('::');
        const targetUser = u1 === myName ? u2 : u1;
        
        if (callManager) {
          callManager.startCall(targetUser);
        } else {
          toast('Call feature not available');
        }
      }
    });
    
    roomInfo.appendChild(callBtn);
  }
  
  // Show/hide call button based on room type
  if (currentRoomKey !== 'group' && currentRoomKey.includes('::')) {
    callBtn.style.display = 'inline-block';
  } else {
    callBtn.style.display = 'none';
  }
}
