document.addEventListener('DOMContentLoaded', () => {
    // DOM Elements
    const hostTab = document.getElementById('hostTab');
    const joinTab = document.getElementById('joinTab');
    const hostSection = document.getElementById('hostSection');
    const joinSection = document.getElementById('joinSection');
    const videoSection = document.getElementById('videoSection');
    
    const videoLinkInput = document.getElementById('videoLink');
    const audioLinkInput = document.getElementById('audioLink');
    const subtitleLinkInput = document.getElementById('subtitleLink');
    const createRoomBtn = document.getElementById('createRoomBtn');
    
    const roomIdInput = document.getElementById('roomId');
    const joinRoomBtn = document.getElementById('joinRoomBtn');
    
    const videoPlayer = document.getElementById('videoPlayer');
    const subtitleTrack = document.getElementById('subtitleTrack');
    const prev15sBtn = document.getElementById('prev15s');
    const playPauseBtn = document.getElementById('playPauseBtn');
    const next15sBtn = document.getElementById('next15s');
    const fullscreenBtn = document.getElementById('fullscreenBtn');
    const participantCountSpan = document.getElementById('participantCount');
    const statusTextSpan = document.getElementById('statusText');
    const connectionStatusDiv = document.getElementById('connectionStatus');
    
    // Socket connection
    let socket = null;
    let isHost = false;
    let roomId = null;
    let currentMediaTime = 0;
    let isPlaying = false;

    function getSocketServerUrl() {
        const configuredUrl = window.APP_CONFIG && window.APP_CONFIG.SOCKET_SERVER_URL;
        if (configuredUrl && configuredUrl.trim()) {
            return configuredUrl.trim();
        }

        return window.location.origin;
    }

    function createSocketConnection() {
        return io(getSocketServerUrl(), {
            transports: ['websocket', 'polling'],
            reconnection: true,
            reconnectionAttempts: 10,
            reconnectionDelay: 1200
        });
    }

    function setConnectionStatus(state, roleLabel) {
        const roleText = roleLabel ? ` (${roleLabel})` : '';

        if (state === 'connected') {
            statusTextSpan.textContent = `[OK] Baglanti kuruldu${roleText}`;
        } else if (state === 'reconnecting') {
            statusTextSpan.textContent = `[~] Yeniden baglaniyor${roleText}...`;
        } else if (state === 'disconnected') {
            statusTextSpan.textContent = `[X] Baglanti kesildi${roleText}`;
        } else {
            statusTextSpan.textContent = `[...] Baglanti kuruluyor${roleText}...`;
        }

        connectionStatusDiv.className = `status-indicator ${state}`;
    }

    function bindSocketStatusEvents(activeSocket, roleLabel) {
        setConnectionStatus('connecting', roleLabel);

        activeSocket.on('connect', () => {
            setConnectionStatus('connected', roleLabel);
        });

        activeSocket.on('disconnect', () => {
            setConnectionStatus('disconnected', roleLabel);
        });

        activeSocket.on('connect_error', () => {
            setConnectionStatus('reconnecting', roleLabel);
        });

        activeSocket.io.on('reconnect_attempt', () => {
            setConnectionStatus('reconnecting', roleLabel);
        });

        activeSocket.io.on('reconnect', () => {
            setConnectionStatus('connected', roleLabel);
        });
    }
    
    // Tab switching
    hostTab.addEventListener('click', () => {
        hostTab.classList.add('active');
        joinTab.classList.remove('active');
        hostSection.classList.add('active');
        joinSection.classList.remove('active');
    });
    
    joinTab.addEventListener('click', () => {
        joinTab.classList.add('active');
        hostTab.classList.remove('active');
        joinSection.classList.add('active');
        hostSection.classList.remove('active');
    });
    
    // Create room functionality
    createRoomBtn.addEventListener('click', () => {
        const videoLink = videoLinkInput.value.trim();
        const audioLink = audioLinkInput.value.trim();
        const subtitleLink = subtitleLinkInput.value.trim();
        
        if (!videoLink) {
            alert('Lütfen video linki girin');
            return;
        }
        
        // Initialize socket connection
        socket = createSocketConnection();
        bindSocketStatusEvents(socket, 'Host');
        
        socket.emit('create-room', {
            videoLink,
            audioLink,
            subtitleLink
        });
        
        socket.on('room-created', (data) => {
            roomId = data.roomId;
            isHost = true;
            
            // Show video section
            hostSection.classList.remove('active');
            joinSection.classList.remove('active');
            videoSection.classList.remove('hidden');
            
            // Setup video player
            setupVideoPlayer(videoLink, audioLink, subtitleLink);
            
            // Update UI
            document.querySelector('.tabs').style.display = 'none';
            document.querySelector('h1').textContent = `Oda ID: ${roomId}`;
            
            // Host controls
            setupHostControls();
        });

        socket.on('participant-count-update', (count) => {
            participantCountSpan.textContent = `Katılımcı: ${count}`;
        });
        
        socket.on('error', (message) => {
            alert(message);
        });
    });
    
    // Join room functionality
    joinRoomBtn.addEventListener('click', () => {
        const inputRoomId = roomIdInput.value.trim().toUpperCase();
        
        if (!inputRoomId) {
            alert('Lütfen oda ID girin');
            return;
        }
        
        // Initialize socket connection
        socket = createSocketConnection();
        bindSocketStatusEvents(socket, 'Katilimci');
        
        socket.emit('join-room', {
            roomId: inputRoomId
        });
        
        socket.on('room-joined', (data) => {
            roomId = inputRoomId;
            isHost = false;
            
            // Show video section
            hostSection.classList.remove('active');
            joinSection.classList.remove('active');
            videoSection.classList.remove('hidden');
            
            // Setup video player with received media info
            setupVideoPlayer(data.videoLink, data.audioLink, data.subtitleLink);
            
            // Update UI
            document.querySelector('.tabs').style.display = 'none';
            document.querySelector('h1').textContent = `Oda ID: ${roomId}`;
            
            // Participant controls
            setupParticipantControls();
        });
        
        socket.on('error', (message) => {
            alert(message);
        });
        
        socket.on('participant-count-update', (count) => {
            participantCountSpan.textContent = `Katılımcı: ${count}`;
        });
        
        socket.on('media-state-update', (state) => {
            // Update video player state based on host
            if (state.isPlaying !== isPlaying) {
                if (state.isPlaying) {
                    videoPlayer.play();
                    playPauseBtn.innerHTML = '⏸️ Duraklat';
                } else {
                    videoPlayer.pause();
                    playPauseBtn.innerHTML = '▶️ Oynat';
                }
                isPlaying = state.isPlaying;
            }
            
            // Update current time (prevent seeking if user is manually seeking)
            if (!videoPlayer.seeking) {
                videoPlayer.currentTime = state.currentTime;
                currentMediaTime = state.currentTime;
            }
        });
        
        socket.on('disconnected-from-room', () => {
            setConnectionStatus('disconnected', isHost ? 'Host' : 'Katilimci');
            alert('Odanız bağlantısı kesildi');
            resetUI();
        });
    });
    
    // Video player event listeners
    videoPlayer.addEventListener('play', () => {
        isPlaying = true;
        playPauseBtn.innerHTML = '⏸️ Duraklat';
        
        // Emit play state to server
        if (socket && isHost) {
            socket.emit('media-state-change', {
                isPlaying: true,
                currentTime: videoPlayer.currentTime
            });
        }
    });
    
    videoPlayer.addEventListener('pause', () => {
        isPlaying = false;
        playPauseBtn.innerHTML = '▶️ Oynat';
        
        // Emit pause state to server
        if (socket && isHost) {
            socket.emit('media-state-change', {
                isPlaying: false,
                currentTime: videoPlayer.currentTime
            });
        }
    });
    
    videoPlayer.addEventListener('seeked', () => {
        // Emit seek event to server
        if (socket && isHost) {
            socket.emit('media-state-change', {
                isPlaying: !videoPlayer.paused,
                currentTime: videoPlayer.currentTime
            });
        }
    });
    
    videoPlayer.addEventListener('timeupdate', () => {
        currentMediaTime = videoPlayer.currentTime;
        
        // Only emit time updates from host to reduce traffic
        if (isHost && socket) {
            // Emit every 2 seconds to reduce network traffic
            if (Math.floor(currentMediaTime) % 2 === 0) {
                socket.emit('media-state-change', {
                    isPlaying: !videoPlayer.paused,
                    currentTime: videoPlayer.currentTime
                });
            }
        }
    });
    
    // Control button listeners
    prev15sBtn.addEventListener('click', () => {
        videoPlayer.currentTime = Math.max(0, videoPlayer.currentTime - 15);
    });
    
    next15sBtn.addEventListener('click', () => {
        videoPlayer.currentTime = Math.min(
            videoPlayer.duration || 0, 
            videoPlayer.currentTime + 15
        );
    });
    
    playPauseBtn.addEventListener('click', () => {
        if (videoPlayer.paused) {
            videoPlayer.play();
        } else {
            videoPlayer.pause();
        }
    });
    
    fullscreenBtn.addEventListener('click', () => {
        if (!document.fullscreenElement) {
            videoPlayer.requestFullscreen().catch(err => {
                console.error(`Fullscreen error: ${err.message}`);
            });
        } else {
            document.exitFullscreen();
        }
    });
    
    // Helper functions
    function setupVideoPlayer(videoLink, audioLink, subtitleLink) {
        // Set video source
        videoPlayer.src = videoLink;
        
        // Set audio source if provided (for separate audio/video)
        if (audioLink) {
            // For separate audio/video, we'd need to use Web Audio API or similar
            // For simplicity, we'll just set the video source as is
            console.log('Separate audio link provided:', audioLink);
        }
        
        // Set subtitle track if provided
        if (subtitleLink) {
            subtitleTrack.src = subtitleLink;
            subtitleTrack.mode = 'showing';
        } else {
            subtitleTrack.mode = 'disabled';
        }
        
        // Load subtitles
        videoPlayer.load();
    }
    
    function setupHostControls() {
        // Host can control playback
        setConnectionStatus('connected', 'Host');
        
        // Update participant count initially
        participantCountSpan.textContent = 'Katılımcı: 1';
    }
    
    function setupParticipantControls() {
        // Participant can only view
        setConnectionStatus('connected', 'Katilimci');
    }
    
    function resetUI() {
        // Reset UI to initial state
        if (socket) {
            socket.disconnect();
            socket = null;
        }
        
        isHost = false;
        roomId = null;
        currentMediaTime = 0;
        isPlaying = false;
        
        videoSection.classList.add('hidden');
        document.querySelector('.tabs').style.display = 'flex';
        document.querySelector('h1').textContent = 'Video Senkronizasyon Platformu';
        
        // Clear inputs
        videoLinkInput.value = '';
        audioLinkInput.value = '';
        subtitleLinkInput.value = '';
        roomIdInput.value = '';
        
        // Reset tabs
        hostTab.classList.add('active');
        joinTab.classList.remove('active');
        hostSection.classList.add('active');
        joinSection.classList.remove('active');
        
        // Reset video player
        videoPlayer.pause();
        videoPlayer.currentTime = 0;
        playPauseBtn.innerHTML = '▶️ Oynat';
        videoPlayer.src = '';
        subtitleTrack.src = '';
        subtitleTrack.mode = 'disabled';
    }
    
    // Handle page visibility changes (for mobile reconnection)
    document.addEventListener('visibilitychange', () => {
        if (document.hidden) {
            // Page is hidden, could be due to app switching
            if (socket && socket.disconnected) {
                socket.connect();
            }
        } else {
            // Page is visible again
            if (socket && socket.disconnected) {
                socket.connect();
            }
        }
    });
});
