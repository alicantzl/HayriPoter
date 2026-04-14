document.addEventListener('DOMContentLoaded', () => {
    const hostTab = document.getElementById('hostTab');
    const joinTab = document.getElementById('joinTab');
    const hostSection = document.getElementById('hostSection');
    const joinSection = document.getElementById('joinSection');
    const videoSection = document.getElementById('videoSection');
    const launchScreen = document.getElementById('launchScreen');

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
    const HOST_SYNC_INTERVAL_MS = 900;
    const HARD_SYNC_THRESHOLD_SEC = 1.8;
    const SOFT_SYNC_THRESHOLD_SEC = 0.45;

    let socket = null;
    let isHost = false;
    let roomId = null;
    let lastSyncAt = 0;
    let suppressLocalEvents = false;
    let lastServerState = { isPlaying: false, currentTime: 0 };
    let nextParticipantPlayAttemptAt = 0;

    setTimeout(() => {
        if (!launchScreen) {
            return;
        }
        launchScreen.classList.add('is-hidden');
        setTimeout(() => {
            launchScreen.remove();
        }, 500);
    }, 650);

    function getSocketServerUrl() {
        const configuredUrl = window.APP_CONFIG && window.APP_CONFIG.SOCKET_SERVER_URL;
        return configuredUrl && configuredUrl.trim() ? configuredUrl.trim() : window.location.origin;
    }

    function createSocketConnection() {
        return io(getSocketServerUrl(), {
            transports: ['websocket', 'polling'],
            reconnection: true,
            reconnectionAttempts: 14,
            reconnectionDelay: 900,
            timeout: 9000
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

    function markLiveMode(enabled) {
        videoSection.classList.toggle('stage-live', enabled);
    }

    function applyRoleUi() {
        videoSection.classList.toggle('participant-locked', !isHost);
        videoSection.classList.toggle('mobile-participant', isMobile && !isHost);

        hostSettingsPanel.classList.toggle('hidden', !isHost);

        prev15sBtn.disabled = !isHost;
        next15sBtn.disabled = !isHost;
        playPauseBtn.disabled = !isHost;

        if (isHost) {
            videoPlayer.controls = true;
            playPauseBtn.innerHTML = videoPlayer.paused ? '▶ Oynat' : '⏸ Duraklat';
        } else {
            videoPlayer.controls = false;
            playPauseBtn.innerHTML = 'Host kontrolunde';
        }
    }

    async function ensureMobileFullscreen() {
        if (!isMobile || document.fullscreenElement) {
            return;
        }

        try {
            await videoPlayer.requestFullscreen();
        } catch (_error) {
            // no-op: mobile browser can reject unless strict user gesture
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
        if (!force && now - lastSyncAt < HOST_SYNC_INTERVAL_MS) {
            return;
        }

        lastSyncAt = now;
        socket.emit('media-state-change', {
            isPlaying: !videoPlayer.paused,
            currentTime: videoPlayer.currentTime
        });
    }

    function applyParticipantSyncState(state) {
        const incoming = {
            isPlaying: Boolean(state.isPlaying),
            currentTime: Number(state.currentTime) || 0
        };
        lastServerState = incoming;

        const compensation = incoming.isPlaying ? 0.28 : 0;
        const targetTime = incoming.currentTime + compensation;
        const drift = targetTime - videoPlayer.currentTime;
        const absDrift = Math.abs(drift);

        suppressLocalEvents = true;

        if (absDrift > HARD_SYNC_THRESHOLD_SEC) {
            videoPlayer.currentTime = targetTime;
        } else if (absDrift > SOFT_SYNC_THRESHOLD_SEC && incoming.isPlaying) {
            videoPlayer.playbackRate = drift > 0 ? 1.06 : 0.94;
        } else {
            videoPlayer.playbackRate = 1;
        }

        if (incoming.isPlaying) {
            if (videoPlayer.paused && Date.now() >= nextParticipantPlayAttemptAt) {
                videoPlayer.play().catch(() => {
                    nextParticipantPlayAttemptAt = Date.now() + 1800;
                });
            }
        } else {
            if (!videoPlayer.paused) {
                videoPlayer.pause();
            }
        }

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
            applyParticipantSyncState(state);
        });

        activeSocket.on('media-source-update', (media) => {
            setupVideoPlayer(media.videoLink, media.audioLink, media.subtitleLink);
            applyParticipantSyncState({
                isPlaying: media.isPlaying,
                currentTime: media.currentTime
            });
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

    function connectAs(roleLabel) {
        if (socket) {
            socket.removeAllListeners();
            socket.disconnect();
        }
        socket = createSocketConnection();
        bindSocketStatusEvents(socket, roleLabel);
        registerRoomEvents(socket);
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

        connectAs('Host');
        socket.emit('create-room', { videoLink, audioLink, subtitleLink });

        socket.on('room-created', async (data) => {
            roomId = data.roomId;
            isHost = true;

            hostSection.classList.remove('active');
            joinSection.classList.remove('active');
            videoSection.classList.remove('hidden');
            markLiveMode(true);

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

        connectAs('Katilimci');
        socket.emit('join-room', { roomId: inputRoomId });

        socket.on('room-joined', async (data) => {
            roomId = inputRoomId;
            isHost = false;

            hostSection.classList.remove('active');
            joinSection.classList.remove('active');
            videoSection.classList.remove('hidden');
            markLiveMode(true);

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
        if (suppressLocalEvents || !isHost) {
            return;
        }
        playPauseBtn.innerHTML = '⏸ Duraklat';
        emitHostState(true);
    });

    videoPlayer.addEventListener('pause', () => {
        if (suppressLocalEvents || !isHost) {
            return;
        }
        playPauseBtn.innerHTML = '▶ Oynat';
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
            socket.removeAllListeners();
            socket.disconnect();
            socket = null;
        }

        isHost = false;
        roomId = null;
        lastSyncAt = 0;
        suppressLocalEvents = false;
        lastServerState = { isPlaying: false, currentTime: 0 };
        nextParticipantPlayAttemptAt = 0;

        videoSection.classList.add('hidden');
        markLiveMode(false);
        videoSection.classList.remove('participant-locked', 'mobile-participant');
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
        videoPlayer.playbackRate = 1;
        videoPlayer.src = '';
        videoPlayer.controls = true;
        subtitleTrack.src = '';
        subtitleTrack.mode = 'disabled';
        volumeRange.value = '1';
        videoPlayer.volume = 1;
        participantCountSpan.textContent = 'Katilimci: 0';
        playPauseBtn.innerHTML = '▶ Oynat';
    }

    document.addEventListener('visibilitychange', () => {
        if (!socket || !socket.disconnected) {
            return;
        }
        socket.connect();
    });
});
