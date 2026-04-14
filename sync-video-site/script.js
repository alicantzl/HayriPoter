document.addEventListener('DOMContentLoaded', () => {
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
    const volumeRange = document.getElementById('volumeRange');
    const participantCountSpan = document.getElementById('participantCount');
    const statusTextSpan = document.getElementById('statusText');
    const connectionStatusDiv = document.getElementById('connectionStatus');
    const hostSettingsPanel = document.getElementById('hostSettingsPanel');
    const hostVideoLinkInput = document.getElementById('hostVideoLink');
    const hostAudioLinkInput = document.getElementById('hostAudioLink');
    const hostSubtitleLinkInput = document.getElementById('hostSubtitleLink');
    const applyMediaLinksBtn = document.getElementById('applyMediaLinksBtn');

    const isMobile = window.matchMedia('(max-width: 720px), (pointer: coarse)').matches;
    const SYNC_INTERVAL_MS = 700;
    const HARD_SYNC_THRESHOLD_SEC = 1.2;

    let socket = null;
    let isHost = false;
    let roomId = null;
    let isPlaying = false;
    let lastSyncAt = 0;
    let suppressLocalEvents = false;
    let lastServerState = { isPlaying: false, currentTime: 0 };

    function getSocketServerUrl() {
        const configuredUrl = window.APP_CONFIG && window.APP_CONFIG.SOCKET_SERVER_URL;
        return configuredUrl && configuredUrl.trim() ? configuredUrl.trim() : window.location.origin;
    }

    function createSocketConnection() {
        return io(getSocketServerUrl(), {
            transports: ['websocket', 'polling'],
            reconnection: true,
            reconnectionAttempts: 12,
            reconnectionDelay: 1000
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
        activeSocket.on('connect', () => setConnectionStatus('connected', roleLabel));
        activeSocket.on('disconnect', () => setConnectionStatus('disconnected', roleLabel));
        activeSocket.on('connect_error', () => setConnectionStatus('reconnecting', roleLabel));
        activeSocket.io.on('reconnect_attempt', () => setConnectionStatus('reconnecting', roleLabel));
        activeSocket.io.on('reconnect', () => setConnectionStatus('connected', roleLabel));
    }

    function applyRoleUi() {
        videoSection.classList.toggle('participant-locked', !isHost);
        videoSection.classList.toggle('mobile-view', isMobile);
        videoSection.classList.toggle('mobile-participant', isMobile && !isHost);

        hostSettingsPanel.classList.toggle('hidden', !isHost);

        prev15sBtn.disabled = !isHost;
        next15sBtn.disabled = !isHost;
        playPauseBtn.disabled = !isHost;

        if (!isHost) {
            videoPlayer.controls = false;
            playPauseBtn.innerHTML = '🔒 Host kontrolunde';
        } else {
            videoPlayer.controls = true;
            playPauseBtn.innerHTML = videoPlayer.paused ? '▶️ Oynat' : '⏸️ Duraklat';
        }
    }

    async function ensureMobileFullscreen() {
        if (!isMobile || document.fullscreenElement) {
            return;
        }

        try {
            await videoPlayer.requestFullscreen();
        } catch (_err) {
            setConnectionStatus('connected', isHost ? 'Host' : 'Katilimci');
        }
    }

    function setupVideoPlayer(videoLink, audioLink, subtitleLink) {
        videoPlayer.src = videoLink || '';
        if (subtitleLink) {
            subtitleTrack.src = subtitleLink;
            subtitleTrack.mode = 'showing';
        } else {
            subtitleTrack.src = '';
            subtitleTrack.mode = 'disabled';
        }
        if (audioLink) {
            console.log('Separate audio link provided:', audioLink);
        }
        videoPlayer.load();
    }

    function emitHostState(force = false) {
        if (!socket || !isHost) {
            return;
        }

        const now = Date.now();
        if (!force && now - lastSyncAt < SYNC_INTERVAL_MS) {
            return;
        }

        lastSyncAt = now;
        socket.emit('media-state-change', {
            isPlaying: !videoPlayer.paused,
            currentTime: videoPlayer.currentTime
        });
    }

    function applyIncomingMediaState(state) {
        lastServerState = {
            isPlaying: Boolean(state.isPlaying),
            currentTime: Number(state.currentTime) || 0
        };

        suppressLocalEvents = true;
        const drift = Math.abs(videoPlayer.currentTime - lastServerState.currentTime);
        if (drift > HARD_SYNC_THRESHOLD_SEC || videoPlayer.paused !== !lastServerState.isPlaying) {
            videoPlayer.currentTime = lastServerState.currentTime;
        }

        if (lastServerState.isPlaying) {
            videoPlayer.play().catch(() => {});
        } else {
            videoPlayer.pause();
        }

        isPlaying = lastServerState.isPlaying;
        suppressLocalEvents = false;
    }

    function registerRoomEvents(activeSocket) {
        activeSocket.on('participant-count-update', (count) => {
            participantCountSpan.textContent = `Katilimci: ${count}`;
        });

        activeSocket.on('media-state-update', (state) => {
            if (isHost) {
                return;
            }
            applyIncomingMediaState(state);
        });

        activeSocket.on('media-source-update', (media) => {
            setupVideoPlayer(media.videoLink, media.audioLink, media.subtitleLink);
            applyIncomingMediaState({
                isPlaying: media.isPlaying,
                currentTime: media.currentTime
            });
            alert('Host yeni film ayari uyguladi. Oynatici guncellendi.');
        });

        activeSocket.on('disconnected-from-room', () => {
            setConnectionStatus('disconnected', isHost ? 'Host' : 'Katilimci');
            alert('Oda kapandi. Host baglantidan ayrildi.');
            resetUI();
        });

        activeSocket.on('error', (message) => {
            alert(message);
        });
    }

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

    createRoomBtn.addEventListener('click', async () => {
        const videoLink = videoLinkInput.value.trim();
        const audioLink = audioLinkInput.value.trim();
        const subtitleLink = subtitleLinkInput.value.trim();

        if (!videoLink) {
            alert('Lutfen video linki girin');
            return;
        }

        if (socket) {
            socket.disconnect();
        }
        socket = createSocketConnection();
        bindSocketStatusEvents(socket, 'Host');
        registerRoomEvents(socket);

        socket.emit('create-room', { videoLink, audioLink, subtitleLink });

        socket.on('room-created', async (data) => {
            roomId = data.roomId;
            isHost = true;

            hostSection.classList.remove('active');
            joinSection.classList.remove('active');
            videoSection.classList.remove('hidden');

            setupVideoPlayer(videoLink, audioLink, subtitleLink);
            hostVideoLinkInput.value = videoLink;
            hostAudioLinkInput.value = audioLink;
            hostSubtitleLinkInput.value = subtitleLink;

            document.querySelector('.tabs').style.display = 'none';
            document.querySelector('h1').textContent = `Oda ID: ${roomId}`;

            participantCountSpan.textContent = 'Katilimci: 1';
            applyRoleUi();
            await ensureMobileFullscreen();
        });
    });

    joinRoomBtn.addEventListener('click', async () => {
        const inputRoomId = roomIdInput.value.trim().toUpperCase();
        if (!inputRoomId) {
            alert('Lutfen oda ID girin');
            return;
        }

        if (socket) {
            socket.disconnect();
        }
        socket = createSocketConnection();
        bindSocketStatusEvents(socket, 'Katilimci');
        registerRoomEvents(socket);

        socket.emit('join-room', { roomId: inputRoomId });

        socket.on('room-joined', async (data) => {
            roomId = inputRoomId;
            isHost = false;

            hostSection.classList.remove('active');
            joinSection.classList.remove('active');
            videoSection.classList.remove('hidden');

            setupVideoPlayer(data.videoLink, data.audioLink, data.subtitleLink);

            document.querySelector('.tabs').style.display = 'none';
            document.querySelector('h1').textContent = `Oda ID: ${roomId}`;

            applyRoleUi();
            await ensureMobileFullscreen();
        });
    });

    volumeRange.addEventListener('input', () => {
        videoPlayer.volume = Number(volumeRange.value);
    });

    applyMediaLinksBtn.addEventListener('click', () => {
        if (!socket || !isHost) {
            return;
        }

        const videoLink = hostVideoLinkInput.value.trim();
        const audioLink = hostAudioLinkInput.value.trim();
        const subtitleLink = hostSubtitleLinkInput.value.trim();

        if (!videoLink) {
            alert('Video linki bos olamaz');
            return;
        }

        setupVideoPlayer(videoLink, audioLink, subtitleLink);
        videoPlayer.currentTime = 0;
        videoPlayer.pause();
        emitHostState(true);

        socket.emit('update-media-links', {
            videoLink,
            audioLink,
            subtitleLink
        });
    });

    videoPlayer.addEventListener('play', () => {
        if (suppressLocalEvents) {
            return;
        }

        if (!isHost) {
            videoPlayer.pause();
            videoPlayer.currentTime = lastServerState.currentTime;
            return;
        }

        isPlaying = true;
        playPauseBtn.innerHTML = '⏸️ Duraklat';
        emitHostState(true);
    });

    videoPlayer.addEventListener('pause', () => {
        if (suppressLocalEvents) {
            return;
        }

        if (!isHost) {
            if (lastServerState.isPlaying) {
                videoPlayer.play().catch(() => {});
            }
            return;
        }

        isPlaying = false;
        playPauseBtn.innerHTML = '▶️ Oynat';
        emitHostState(true);
    });

    videoPlayer.addEventListener('seeking', () => {
        if (isHost || suppressLocalEvents) {
            return;
        }
        videoPlayer.currentTime = lastServerState.currentTime;
    });

    videoPlayer.addEventListener('seeked', () => {
        if (suppressLocalEvents || !isHost) {
            return;
        }
        emitHostState(true);
    });

    videoPlayer.addEventListener('timeupdate', () => {
        if (!isHost || suppressLocalEvents) {
            return;
        }
        emitHostState(false);
    });

    prev15sBtn.addEventListener('click', () => {
        if (!isHost) {
            return;
        }
        videoPlayer.currentTime = Math.max(0, videoPlayer.currentTime - 15);
        emitHostState(true);
    });

    next15sBtn.addEventListener('click', () => {
        if (!isHost) {
            return;
        }
        videoPlayer.currentTime = Math.min(videoPlayer.duration || 0, videoPlayer.currentTime + 15);
        emitHostState(true);
    });

    playPauseBtn.addEventListener('click', () => {
        if (!isHost) {
            return;
        }

        if (videoPlayer.paused) {
            videoPlayer.play().catch(() => {});
        } else {
            videoPlayer.pause();
        }
    });

    fullscreenBtn.addEventListener('click', async () => {
        if (!document.fullscreenElement) {
            await videoPlayer.requestFullscreen().catch(() => {});
        } else {
            await document.exitFullscreen().catch(() => {});
        }
    });

    function resetUI() {
        if (socket) {
            socket.disconnect();
            socket = null;
        }

        isHost = false;
        roomId = null;
        isPlaying = false;
        suppressLocalEvents = false;
        lastServerState = { isPlaying: false, currentTime: 0 };

        videoSection.classList.add('hidden');
        videoSection.classList.remove('participant-locked', 'mobile-view', 'mobile-participant');
        document.querySelector('.tabs').style.display = 'flex';
        document.querySelector('h1').textContent = 'Video Senkronizasyon Platformu';

        videoLinkInput.value = '';
        audioLinkInput.value = '';
        subtitleLinkInput.value = '';
        roomIdInput.value = '';

        hostTab.classList.add('active');
        joinTab.classList.remove('active');
        hostSection.classList.add('active');
        joinSection.classList.remove('active');

        videoPlayer.pause();
        videoPlayer.currentTime = 0;
        videoPlayer.src = '';
        subtitleTrack.src = '';
        subtitleTrack.mode = 'disabled';
        volumeRange.value = '1';
        videoPlayer.volume = 1;
        participantCountSpan.textContent = 'Katilimci: 0';
    }

    document.addEventListener('visibilitychange', () => {
        if (!socket || !socket.disconnected) {
            return;
        }
        socket.connect();
    });
});
