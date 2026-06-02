/**
 * BADMINTON GOPRO CLIPPER - FRONTEND CONTROLLER
 * Handles continuous player, visual timeline scrubbing, splits management, and API calls.
 */

// App State
const state = {
  dirPath: '',
  files: [],            // List of probed files
  virtualDuration: 0,   // Cumulative duration (seconds)
  activeFileIndex: -1,  // Index of currently playing file
  virtualPlayhead: 0,   // Playhead position in global timeline (seconds)
  
  splits: [],           // List of Game splits { start, end, title, teamA, teamB, score }
  markers: {
    start: null,        // Global time (seconds)
    end: null           // Global time (seconds)
  },
  
  youtubeSettings: {
    channelName: 'My Badminton Sessions',
    privacy: 'unlisted',
    defaultDesc: 'Weekly Badminton Session.\nRecorded locally.\n\nPlayers: {players}\nScore: {score}\n\nSplits processed with Badminton GoPro Clipper.',
    clientId: '',
    clientSecret: '',
    autoUpload: false,
    playlistMode: 'none',
    playlistId: ''
  },
  
  isPlaying: false,
  isExporting: false,
  browserCurrentPath: '',
  browserSelectedPath: '',
  
  // YouTube Channel Browser State
  ytChannels: [],
  selectedYtChannelId: null
};

// DOM Elements
const elements = {
  dirPathInput: document.getElementById('dir-path-input'),
  browseBtn: document.getElementById('browse-btn'),
  scanBtn: document.getElementById('scan-btn'),
  mainPlayer: document.getElementById('main-player'),
  videoPlaceholder: document.getElementById('video-placeholder'),
  customPlayerControls: document.getElementById('custom-player-controls'),
  currentFileBadge: document.getElementById('current-file-badge'),
  videoResolutionLabel: document.getElementById('video-resolution-label'),
  
  // Playback Controls
  btnPlayPause: document.getElementById('btn-play-pause'),
  btnBack5s: document.getElementById('btn-back-5s'),
  btnBack1s: document.getElementById('btn-back-1s'),
  btnForward1s: document.getElementById('btn-forward-1s'),
  btnForward5s: document.getElementById('btn-forward-5s'),
  timeCurrent: document.getElementById('time-current'),
  timeDuration: document.getElementById('time-duration'),
  speedSelect: document.getElementById('speed-select'),
  btnPrevGame: document.getElementById('btn-prev-game'),
  btnNextGame: document.getElementById('btn-next-game'),
  
  // Timeline Workspace
  timelineWorkspace: document.getElementById('timeline-workspace'),
  timelineScrubArea: document.getElementById('timeline-scrub-area'),
  timelinePlayhead: document.getElementById('timeline-playhead'),
  timelineCanvas: document.getElementById('timeline-canvas'),
  btnMarkStart: document.getElementById('btn-mark-start'),
  btnMarkEnd: document.getElementById('btn-mark-end'),
  btnAddSplit: document.getElementById('btn-add-split'),
  markerFeedback: document.getElementById('marker-feedback'),
  
  // Sidebar Files
  filesDetailsCard: document.getElementById('files-details-card'),
  filesListHeader: document.getElementById('files-list-header'),
  filesListBody: document.getElementById('files-list-body'),
  filesMiniList: document.getElementById('files-mini-list'),
  totalFilesCount: document.getElementById('total-files-count'),
  filesSummaryText: document.getElementById('files-summary-text'),
  
  // Sidebar Splits
  splitsEditorCard: document.getElementById('splits-editor-card'),
  splitsListViewport: document.getElementById('splits-list-viewport'),
  splitsEmptyState: document.getElementById('splits-empty-state'),
  splitsCount: document.getElementById('splits-count'),
  btnSaveProject: document.getElementById('btn-save-project'),
  btnClearSplits: document.getElementById('btn-clear-splits'),
  
  // Export Hub
  exportHubCard: document.getElementById('export-hub-card'),
  btnExportAll: document.getElementById('btn-export-all'),
  
  // Console Logging
  exportConsolePanel: document.getElementById('export-console-panel'),
  consoleBody: document.getElementById('console-body'),
  consoleProgressContainer: document.getElementById('console-progress-container'),
  consoleProgressFill: document.getElementById('console-progress-fill'),
  consoleProgressText: document.getElementById('console-progress-text'),
  btnCloseConsole: document.getElementById('btn-close-console'),
  
  // YouTube Panel & Modal
  youtubeCard: document.getElementById('youtube-uploader-card'),
  btnYtConfig: document.getElementById('btn-yt-config'),
  ytModal: document.getElementById('youtube-modal'),
  btnCloseYtModal: document.getElementById('btn-close-yt-modal'),
  btnCancelYtModal: document.getElementById('btn-cancel-yt-modal'),
  btnSaveYtSettings: document.getElementById('btn-save-yt-settings'),
  ytChannelName: document.getElementById('yt-channel-name'),
  ytDefaultPrivacy: document.getElementById('yt-default-privacy'),
  ytDefaultDesc: document.getElementById('yt-default-desc'),
  ytClientId: document.getElementById('yt-client-id'),
  ytClientSecret: document.getElementById('yt-client-secret'),

  // Folder Explorer Modal
  folderModal: document.getElementById('folder-modal'),
  btnCloseFolderModal: document.getElementById('btn-close-folder-modal'),
  btnCancelFolderModal: document.getElementById('btn-cancel-folder-modal'),
  btnSelectFolder: document.getElementById('btn-select-folder'),
  btnFolderUp: document.getElementById('btn-folder-up'),
  folderBrowserPath: document.getElementById('folder-browser-path'),
  folderBrowserViewport: document.getElementById('folder-browser-viewport'),

  // Visual pins & HUD
  hudToast: document.getElementById('video-hud-toast'),
  pinStart: document.getElementById('pin-start'),
  pinEnd: document.getElementById('pin-end'),

  // YouTube Channel Browser Modal
  btnBrowseYtChannels: document.getElementById('btn-browse-yt-channels'),
  ytChannelsModal: document.getElementById('yt-channels-modal'),
  btnCloseYtChannelsModal: document.getElementById('btn-close-yt-channels-modal'),
  btnCancelYtChannelsModal: document.getElementById('btn-cancel-yt-channels-modal'),
  btnSelectYtChannel: document.getElementById('btn-select-yt-channel'),
  ytChannelSearch: document.getElementById('yt-channel-search'),
  ytChannelsViewport: document.getElementById('yt-channels-viewport'),

  // YouTube Playlist & Auto-Upload elements
  ytAutoUpload: document.getElementById('yt-auto-upload'),
  ytPlaylistMode: document.getElementById('yt-playlist-mode'),
  ytPlaylistSelectBlock: document.getElementById('yt-playlist-select-block'),
  ytPlaylistSelect: document.getElementById('yt-playlist-select'),
  ytPlaylistCreateBlock: document.getElementById('yt-playlist-create-block'),
  ytNewPlaylistTitle: document.getElementById('yt-new-playlist-title'),
  ytNewPlaylistDesc: document.getElementById('yt-new-playlist-desc'),
  btnRefreshPlaylists: document.getElementById('btn-refresh-playlists'),
  btnCreatePlaylistSubmit: document.getElementById('btn-create-playlist-submit')
};

// Setup Listeners on Startup
function init() {
  // Load global YouTube profiles on startup
  fetchProfiles();

  // Welcome Overlay screen bindings
  const btnWelcomeNew = document.getElementById('btn-welcome-new-profile');
  const btnWelcomeOffline = document.getElementById('btn-welcome-offline');
  const btnWelcomeBack = document.getElementById('btn-welcome-back');
  const btnWelcomeLogin = document.getElementById('btn-welcome-login-google');
  const btnWelcomeMock = document.getElementById('btn-welcome-create-mock');
  
  if (btnWelcomeNew) {
    btnWelcomeNew.addEventListener('click', () => {
      document.getElementById('welcome-screen-select').style.display = 'none';
      document.getElementById('welcome-screen-new').style.display = 'block';
    });
  }
  
  if (btnWelcomeBack) {
    btnWelcomeBack.addEventListener('click', () => {
      document.getElementById('welcome-screen-new').style.display = 'none';
      document.getElementById('welcome-screen-select').style.display = 'block';
    });
  }
  
  if (btnWelcomeOffline) {
    btnWelcomeOffline.addEventListener('click', handleRunOffline);
  }
  
  if (btnWelcomeLogin) {
    btnWelcomeLogin.addEventListener('click', triggerWelcomeGoogleLogin);
  }
  
  if (btnWelcomeMock) {
    btnWelcomeMock.addEventListener('click', triggerWelcomeCreateMock);
  }

  // Active settings profile listener
  const profileSelect = document.getElementById('yt-profile-select');
  if (profileSelect) {
    profileSelect.addEventListener('change', async (e) => {
      const val = e.target.value;
      if (val === 'offline') {
        await selectActiveProfile(null);
      } else {
        await selectActiveProfile(val);
      }
    });
  }

  // Try scanning if directory in URL search params (useful for reload)
  const urlParams = new URLSearchParams(window.location.search);
  const paramDir = urlParams.get('dir');
  if (paramDir) {
    elements.dirPathInput.value = paramDir;
    scanDirectory(paramDir);
  }

  // Browse Click
  elements.browseBtn.addEventListener('click', () => {
    browseDirectory();
  });

  // Scan Click
  elements.scanBtn.addEventListener('click', () => {
    const dir = elements.dirPathInput.value.trim();
    if (dir) scanDirectory(dir);
  });

  // Collapsible files list
  elements.filesListHeader.addEventListener('click', () => {
    elements.filesListHeader.classList.toggle('collapsed');
    elements.filesListBody.style.display = elements.filesListHeader.classList.contains('collapsed') ? 'none' : 'block';
  });

  // Playback Control Handlers
  elements.btnPlayPause.addEventListener('click', togglePlayPause);
  elements.btnBack5s.addEventListener('click', () => seekRelative(-5));
  elements.btnBack1s.addEventListener('click', () => seekRelative(-1));
  elements.btnForward1s.addEventListener('click', () => seekRelative(1));
  elements.btnForward5s.addEventListener('click', () => seekRelative(5));
  elements.speedSelect.addEventListener('change', (e) => {
    elements.mainPlayer.playbackRate = parseFloat(e.target.value);
  });
  
  elements.btnPrevGame.addEventListener('click', jumpToPrevGame);
  elements.btnNextGame.addEventListener('click', jumpToNextGame);

  // HTML5 Video Events
  elements.mainPlayer.addEventListener('play', () => {
    state.isPlaying = true;
    elements.btnPlayPause.textContent = 'Pause';
    elements.btnPlayPause.classList.add('btn-accent');
  });

  elements.mainPlayer.addEventListener('pause', () => {
    state.isPlaying = false;
    elements.btnPlayPause.textContent = 'Play';
    elements.btnPlayPause.classList.remove('btn-accent');
  });

  elements.mainPlayer.addEventListener('timeupdate', onVideoTimeUpdate);
  elements.mainPlayer.addEventListener('ended', onVideoEnded);
  
  // Dynamically sync and correct durations in case of missing or corrupted probed metadata
  elements.mainPlayer.addEventListener('loadedmetadata', () => {
    if (state.activeFileIndex === -1) return;
    const f = state.files[state.activeFileIndex];
    const playerDuration = elements.mainPlayer.duration;
    
    if (playerDuration && !isNaN(playerDuration) && playerDuration > 0) {
      // Sync if reported duration differs significantly (e.g. from 0)
      if (Math.abs(f.duration - playerDuration) > 0.5) {
        logToConsole(`[SYSTEM] Syncing duration for ${f.name}: probe was ${f.duration.toFixed(2)}s, player reports ${playerDuration.toFixed(2)}s`, 'info');
        f.duration = playerDuration;
        
        // Recompute cumulative global start & end times
        let cumulative = 0;
        state.files.forEach((file) => {
          file.globalStart = cumulative;
          file.globalEnd = cumulative + file.duration;
          cumulative = file.globalEnd;
        });
        state.virtualDuration = cumulative;
        
        // Update displays & redraw
        elements.timeDuration.textContent = formatTime(state.virtualDuration);
        renderFilesMiniList();
        drawTimelineCanvas();
        updateTimelineIndicators();
      }
    }
  });

  // Timeline Scrubber Events
  elements.timelineScrubArea.addEventListener('mousedown', onTimelineScrubStart);
  window.addEventListener('resize', drawTimelineCanvas);

  // Marker buttons
  elements.btnMarkStart.addEventListener('click', markGameStart);
  elements.btnMarkEnd.addEventListener('click', markGameEnd);
  elements.btnAddSplit.addEventListener('click', addSplitSegment);
  
  // Clear/Save Splits
  elements.btnSaveProject.addEventListener('click', saveProjectSession);
  elements.btnClearSplits.addEventListener('click', clearAllSplits);

  // Export & Console
  elements.btnExportAll.addEventListener('click', exportGames);
  elements.btnCloseConsole.addEventListener('click', () => {
    elements.exportConsolePanel.style.display = 'none';
  });

  // YouTube Settings Modal
  elements.btnYtConfig.addEventListener('click', openYtModal);
  elements.btnCloseYtModal.addEventListener('click', closeYtModal);
  elements.btnCancelYtModal.addEventListener('click', closeYtModal);
  elements.btnSaveYtSettings.addEventListener('click', saveYtSettings);

  // YouTube Playlist UI listeners
  if (elements.ytPlaylistMode) {
    elements.ytPlaylistMode.addEventListener('change', (e) => {
      const mode = e.target.value;
      elements.ytPlaylistSelectBlock.style.display = mode === 'select' ? 'block' : 'none';
      elements.ytPlaylistCreateBlock.style.display = mode === 'create' ? 'block' : 'none';
      if (mode === 'select') {
        fetchPlaylists();
      }
    });
  }

  if (elements.btnRefreshPlaylists) {
    elements.btnRefreshPlaylists.addEventListener('click', (e) => {
      e.preventDefault();
      fetchPlaylists();
    });
  }

  if (elements.btnCreatePlaylistSubmit) {
    elements.btnCreatePlaylistSubmit.addEventListener('click', async (e) => {
      e.preventDefault();
      const title = elements.ytNewPlaylistTitle.value.trim();
      const desc = elements.ytNewPlaylistDesc.value.trim();
      
      if (!title) {
        alert('Please enter a playlist title');
        return;
      }

      elements.btnCreatePlaylistSubmit.disabled = true;
      elements.btnCreatePlaylistSubmit.textContent = '🔨 Creating playlist...';
      
      try {
        const res = await fetch('/api/youtube-playlists/create', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            title,
            description: desc,
            privacy: state.youtubeSettings.privacy || 'unlisted'
          })
        });
        
        const data = await res.json();
        if (data.success && data.playlist) {
          showBannerNotification(`📁 Created playlist "${title}"!`);
          
          // Switch playlist mode to select
          elements.ytPlaylistMode.value = 'select';
          elements.ytPlaylistSelectBlock.style.display = 'block';
          elements.ytPlaylistCreateBlock.style.display = 'none';
          
          // Clear fields
          elements.ytNewPlaylistTitle.value = '';
          elements.ytNewPlaylistDesc.value = '';
          
          // Fetch playlists and select the newly created one!
          await fetchPlaylists(data.playlist.id);
        } else {
          alert('Failed to create playlist: ' + (data.error || 'Unknown error'));
        }
      } catch (err) {
        alert('Error creating playlist: ' + err.message);
      } finally {
        elements.btnCreatePlaylistSubmit.disabled = false;
        elements.btnCreatePlaylistSubmit.textContent = '🔨 Create & Select Playlist';
      }
    });
  }

  // YouTube Channel Browser Modal Bindings
  if (elements.btnBrowseYtChannels) {
    elements.btnBrowseYtChannels.addEventListener('click', (e) => {
      e.preventDefault();
      openYtChannelsModal();
    });
  }
  if (elements.btnCloseYtChannelsModal) {
    elements.btnCloseYtChannelsModal.addEventListener('click', closeYtChannelsModal);
  }
  if (elements.btnCancelYtChannelsModal) {
    elements.btnCancelYtChannelsModal.addEventListener('click', closeYtChannelsModal);
  }
  if (elements.btnSelectYtChannel) {
    elements.btnSelectYtChannel.addEventListener('click', selectYtChannel);
  }
  if (elements.ytChannelSearch) {
    elements.ytChannelSearch.addEventListener('input', (e) => {
      filterYtChannels(e.target.value);
    });
  }

  // Folder Explorer Modal Bindings
  elements.btnCloseFolderModal.addEventListener('click', closeFolderModal);
  elements.btnCancelFolderModal.addEventListener('click', closeFolderModal);
  elements.btnFolderUp.addEventListener('click', navigateFolderUp);
  elements.btnSelectFolder.addEventListener('click', confirmSelectedFolder);

  // Clickable Virtual Keys Controller
  const keyBtnSpace = document.getElementById('key-btn-space');
  const keyBtnLeft = document.getElementById('key-btn-left');
  const keyBtnRight = document.getElementById('key-btn-right');
  const keyBtnI = document.getElementById('key-btn-i');
  const keyBtnO = document.getElementById('key-btn-o');
  const keyBtnEnter = document.getElementById('key-btn-enter');

  if (keyBtnSpace) keyBtnSpace.addEventListener('click', () => { togglePlayPause(); });
  if (keyBtnLeft) keyBtnLeft.addEventListener('click', () => { seekRelative(-5); });
  if (keyBtnRight) keyBtnRight.addEventListener('click', () => { seekRelative(5); });
  if (keyBtnI) keyBtnI.addEventListener('click', () => { markGameStart(); });
  if (keyBtnO) keyBtnO.addEventListener('click', () => { markGameEnd(); });
  if (keyBtnEnter) keyBtnEnter.addEventListener('click', () => { addSplitSegment(); });

  // Global Keyboard Hotkeys
  window.addEventListener('keydown', onGlobalKeyDown);
}

/**
 * Triggers backend folder browser dialog (In-App Visual Explorer Modal)
 */
function browseDirectory() {
  openFolderModal();
}

function openFolderModal() {
  elements.folderModal.style.display = 'flex';
  state.browserSelectedPath = '';
  // Start browsing from current folder in input, or default to home folder
  let startPath = elements.dirPathInput.value.trim() || '';
  loadFolderContents(startPath);
}

function closeFolderModal() {
  elements.folderModal.style.display = 'none';
}

async function loadFolderContents(pathStr) {
  elements.folderBrowserViewport.innerHTML = '<div style="color:var(--text-dark); padding:20px; text-align:center;">Loading directories...</div>';
  
  try {
    const url = `/api/list-dirs${pathStr ? '?path=' + encodeURIComponent(pathStr) : ''}`;
    const response = await fetch(url);
    
    const contentType = response.headers.get('content-type');
    if (!contentType || !contentType.includes('application/json')) {
      throw new Error('The backend returned an HTML response instead of JSON. Please RESTART your Express backend in the terminal (run "npm start" again) to apply the new folder browser API endpoints.');
    }

    if (response.status !== 200) {
      if (pathStr) {
        loadFolderContents(''); // fallback to home
        return;
      }
      throw new Error('Unreadable directory');
    }
    
    const data = await response.json();
    state.browserCurrentPath = data.current;
    elements.folderBrowserPath.value = data.current;
    
    elements.btnFolderUp.disabled = !data.parent;
    elements.btnFolderUp.style.opacity = data.parent ? '1' : '0.4';

    elements.folderBrowserViewport.innerHTML = '';
    
    if (data.folders.length === 0) {
      elements.folderBrowserViewport.innerHTML = '<div style="color:var(--text-dark); padding:40px; text-align:center;">📁 No subfolders inside this directory.</div>';
      return;
    }

    data.folders.forEach(folder => {
      const row = document.createElement('div');
      row.className = 'folder-browser-row';
      row.innerHTML = `<span>📁</span> <span style="flex-grow:1; text-overflow:ellipsis; overflow:hidden; white-space:nowrap;">${folder.name}</span>`;
      
      row.addEventListener('click', () => {
        const selected = elements.folderBrowserViewport.querySelector('.folder-browser-row.selected');
        if (selected) selected.classList.remove('selected');
        row.classList.add('selected');
        state.browserSelectedPath = folder.path;
      });
      
      row.addEventListener('dblclick', () => {
        loadFolderContents(folder.path);
      });
      
      elements.folderBrowserViewport.appendChild(row);
    });

  } catch (err) {
    console.error('Error loading directory browser:', err);
    elements.folderBrowserViewport.innerHTML = `<div style="color:#FF0055; padding:20px; text-align:center;">❌ Error: ${err.message}</div>`;
  }
}

function navigateFolderUp() {
  if (!state.browserCurrentPath) return;
  const parts = state.browserCurrentPath.split('/');
  parts.pop();
  let parentPath = parts.join('/');
  if (parentPath === '') parentPath = '/';
  loadFolderContents(parentPath);
}

function confirmSelectedFolder() {
  const finalFolder = state.browserSelectedPath || state.browserCurrentPath;
  if (finalFolder) {
    elements.dirPathInput.value = finalFolder;
    closeFolderModal();
    scanDirectory(finalFolder);
  }
}

/**
 * Perform API request to scan GoPro directory
 */
async function scanDirectory(pathStr) {
  logToConsole(`[SYSTEM] Scanning directory: ${pathStr}...`, 'info');
  elements.scanBtn.disabled = true;
  elements.scanBtn.textContent = 'Scanning...';

  try {
    const response = await fetch('/api/scan', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ dirPath: pathStr })
    });

    const contentType = response.headers.get('content-type');
    if (!contentType || !contentType.includes('application/json')) {
      throw new Error('The backend returned an HTML response instead of JSON. Please RESTART your Express backend in the terminal (run "npm start" again) to apply the new scan API endpoints.');
    }

    const data = await response.json();
    if (response.status !== 200) {
      throw new Error(data.error || 'Server error during scanning');
    }

    if (data.files.length === 0) {
      alert('No video files found in the folder. Please verify the path.');
      throw new Error('No video files found in specified folder.');
    }

    // Load state
    state.dirPath = data.dirPath;
    state.files = data.files;
    state.splits = [];
    state.markers = { start: null, end: null };

    // Update browser URL query parameter for easy reloads
    const url = new URL(window.location);
    url.searchParams.set('dir', data.dirPath);
    window.history.pushState({}, '', url);

    // Compute cumulative global start & end times
    let cumulative = 0;
    state.files.forEach((f, idx) => {
      f.globalStart = cumulative;
      f.globalEnd = cumulative + f.duration;
      cumulative = f.globalEnd;
    });
    state.virtualDuration = cumulative;

    logToConsole(`[SYSTEM] Scanned successfully! Found ${state.files.length} video files. Total Session: ${formatTime(state.virtualDuration)}`, 'info');

    // Load saved splits session if it exists
    if (data.projectSession) {
      if (data.projectSession.splits) {
        state.splits = data.projectSession.splits;
        logToConsole(`[SYSTEM] Loaded ${state.splits.length} saved game splits from project session file.`, 'info');
      }
      if (data.projectSession.youtubeSettings) {
        state.youtubeSettings = data.projectSession.youtubeSettings;
        
        // Render connected stats in Sidebar
        const label = document.querySelector('.yt-status-disconnected');
        if (label && state.youtubeSettings.channelName) {
          label.innerHTML = `<span class="yt-dot" style="background:#10B981;"></span> YouTube Channel: <strong>${state.youtubeSettings.channelName}</strong>`;
        }
      }
    }

    // Toggle panel visibility
    elements.videoPlaceholder.style.display = 'none';
    elements.mainPlayer.style.display = 'block';
    elements.customPlayerControls.style.display = 'block';
    elements.timelineWorkspace.style.display = 'block';
    elements.filesDetailsCard.style.display = 'flex';
    elements.splitsEditorCard.style.display = 'flex';
    elements.exportHubCard.style.display = 'flex';
    elements.youtubeCard.style.display = 'flex';

    // Update files mini list sidebar
    renderFilesMiniList();
    renderSplitsList();
    updateTimelineIndicators();

    // Select first video to start
    selectFileAndPlay(0, 0, false);
    
    // Initial timeline render
    drawTimelineCanvas();

  } catch (err) {
    logToConsole(`[ERROR] Scanning directory failed: ${err.message}`, 'error');
    alert(`Failed to load directory: ${err.message}`);
  } finally {
    elements.scanBtn.disabled = false;
    elements.scanBtn.textContent = 'Scan Directory';
  }
}

/**
 * Render Files Mini List Sidebar
 */
function renderFilesMiniList() {
  elements.totalFilesCount.textContent = state.files.length;
  elements.filesMiniList.innerHTML = '';
  
  state.files.forEach((f, idx) => {
    const row = document.createElement('div');
    row.className = `file-row ${idx === state.activeFileIndex ? 'playing' : ''}`;
    row.id = `file-row-${idx}`;
    row.innerHTML = `
      <span class="file-row-name">${f.name}</span>
      <span class="file-row-dur">${formatTime(f.duration)}</span>
    `;
    
    row.addEventListener('click', () => {
      selectFileAndPlay(idx, 0, true);
    });
    
    elements.filesMiniList.appendChild(row);
  });

  const totalMin = Math.floor(state.virtualDuration / 60);
  const totalHrs = Math.floor(totalMin / 60);
  const remMin = totalMin % 60;
  elements.filesSummaryText.textContent = `Total Session Duration: ${totalHrs}h ${remMin}m (${formatTime(state.virtualDuration)})`;
}

/**
 * Select a physical file, stream it, and optionally play
 */
function selectFileAndPlay(fileIndex, relativeOffset = 0, autoPlay = true) {
  if (fileIndex < 0 || fileIndex >= state.files.length) return;

  const prevActiveIndex = state.activeFileIndex;
  state.activeFileIndex = fileIndex;
  const f = state.files[fileIndex];

  // Update active file class highlight in mini list
  if (prevActiveIndex !== -1) {
    const prevRow = document.getElementById(`file-row-${prevActiveIndex}`);
    if (prevRow) prevRow.classList.remove('playing');
  }
  const currRow = document.getElementById(`file-row-${fileIndex}`);
  if (currRow) currRow.classList.add('playing');

  // Update Badge
  elements.currentFileBadge.textContent = f.name;
  elements.videoResolutionLabel.textContent = `${f.width}x${f.height} (${f.codec})`;

  // Stream URL Range Request
  const streamUrl = `/api/stream?path=${encodeURIComponent(f.path)}`;
  
  // Set current video playback state
  const speed = parseFloat(elements.speedSelect.value);

  // To prevent visual flickers, load and seek
  elements.mainPlayer.src = streamUrl;
  elements.mainPlayer.load();
  elements.mainPlayer.currentTime = relativeOffset;
  elements.mainPlayer.playbackRate = speed;

  // Proactively update global playhead state & timeline immediately
  // to prevent stale-playhead validation bugs when switching files
  state.virtualPlayhead = f.globalStart + relativeOffset;
  elements.timeCurrent.textContent = formatTime(state.virtualPlayhead);
  updatePlayheadPosition();
  drawTimelineCanvas();

  if (autoPlay || state.isPlaying) {
    elements.mainPlayer.play().catch(e => console.log('Autoplay blocked:', e));
  }

  // Update time display durations
  elements.timeDuration.textContent = formatTime(state.virtualDuration);
}

/**
 * Seamless Playback Engine transitions
 */
function onVideoTimeUpdate() {
  if (state.activeFileIndex === -1) return;
  
  // Ignore stale playback events during video transitions (when readyState is HAVE_NOTHING)
  if (elements.mainPlayer.readyState === 0) return;
  
  const f = state.files[state.activeFileIndex];
  
  // Ensure the video player source actually matches the active file path
  // to avoid queued stale timeupdate events from previous video cleanups
  try {
    const url = new URL(elements.mainPlayer.src);
    const streamPath = url.searchParams.get('path');
    if (streamPath !== f.path) {
      return;
    }
  } catch (e) {
    // Fallback if URL parsing fails
    const playerSrc = elements.mainPlayer.src;
    const expectedPath = encodeURIComponent(f.path);
    if (!playerSrc.includes(expectedPath) && !playerSrc.includes(f.path)) {
      return;
    }
  }
  
  state.virtualPlayhead = f.globalStart + elements.mainPlayer.currentTime;

  // Render Time Indicators
  elements.timeCurrent.textContent = formatTime(state.virtualPlayhead);

  // Position playhead on timeline
  updatePlayheadPosition();
}

function onVideoEnded() {
  // Continuous playlist merge transition
  if (state.activeFileIndex !== -1 && state.activeFileIndex + 1 < state.files.length) {
    logToConsole(`[SYSTEM] Transitioning seamlessly to next GoPro file: ${state.files[state.activeFileIndex + 1].name}`, 'info');
    selectFileAndPlay(state.activeFileIndex + 1, 0, true);
  } else {
    state.isPlaying = false;
    elements.btnPlayPause.textContent = 'Play';
    elements.btnPlayPause.classList.remove('btn-accent');
  }
}

/**
 * Handle timeline click scrubbing
 */
function onTimelineScrubStart(e) {
  if (state.files.length === 0) return;
  
  const rect = elements.timelineScrubArea.getBoundingClientRect();
  
  function updatePosition(clientX) {
    const clickX = Math.max(0, Math.min(clientX - rect.left, rect.width));
    const percentage = clickX / rect.width;
    const globalTargetTime = percentage * state.virtualDuration;
    seekGlobal(globalTargetTime);
  }

  updatePosition(e.clientX);

  function onMouseMove(moveEvent) {
    updatePosition(moveEvent.clientX);
  }

  function onMouseUp() {
    window.removeEventListener('mousemove', onMouseMove);
    window.removeEventListener('mouseup', onMouseUp);
  }

  window.addEventListener('mousemove', onMouseMove);
  window.addEventListener('mouseup', onMouseUp);
}

/**
 * Seek to a global timestamp in seconds
 */
function seekGlobal(targetGlobalTime) {
  if (targetGlobalTime < 0) targetGlobalTime = 0;
  if (targetGlobalTime > state.virtualDuration) targetGlobalTime = state.virtualDuration;

  // Find corresponding file
  const fileIndex = state.files.findIndex(f => targetGlobalTime >= f.globalStart && targetGlobalTime < f.globalEnd);
  
  if (fileIndex !== -1) {
    const relativeTime = targetGlobalTime - state.files[fileIndex].globalStart;
    
    // Proactively update global playhead state & timeline immediately
    // to prevent asynchronous browser seek latency validation bugs
    state.virtualPlayhead = targetGlobalTime;
    elements.timeCurrent.textContent = formatTime(state.virtualPlayhead);
    updatePlayheadPosition();
    drawTimelineCanvas();

    if (fileIndex === state.activeFileIndex) {
      // Seek inside current video directly
      elements.mainPlayer.currentTime = relativeTime;
    } else {
      // Load next file and seek
      selectFileAndPlay(fileIndex, relativeTime, state.isPlaying);
    }
  } else if (targetGlobalTime === state.virtualDuration) {
    // Edge case: seek to absolute end
    const lastIndex = state.files.length - 1;
    
    state.virtualPlayhead = state.virtualDuration;
    elements.timeCurrent.textContent = formatTime(state.virtualPlayhead);
    updatePlayheadPosition();
    drawTimelineCanvas();

    selectFileAndPlay(lastIndex, state.files[lastIndex].duration - 0.1, false);
  }
}

/**
 * Seek video relative to current position (e.g. forward/back 5s)
 */
function seekRelative(offset) {
  const targetGlobal = state.virtualPlayhead + offset;
  seekGlobal(targetGlobal);
}

/**
 * Position timeline playhead pointer in DOM
 */
function updatePlayheadPosition() {
  const percentage = (state.virtualPlayhead / state.virtualDuration) * 100;
  elements.timelinePlayhead.style.left = `${percentage}%`;
}

/**
 * Draw custom gorgeous visual timeline canvas
 */
function drawTimelineCanvas() {
  const canvas = elements.timelineCanvas;
  if (!canvas || state.files.length === 0) return;

  const ctx = canvas.getContext('2d');
  const width = elements.timelineScrubArea.clientWidth;
  const height = canvas.height;
  canvas.width = width; // resize to match parent width

  // Clear background
  ctx.fillStyle = '#121021';
  ctx.fillRect(0, 0, width, height);

  // Draw file chunks
  state.files.forEach((f, idx) => {
    const xStart = (f.globalStart / state.virtualDuration) * width;
    const xEnd = (f.globalEnd / state.virtualDuration) * width;
    const chunkWidth = xEnd - xStart;

    // Zebra striping backgrounds
    ctx.fillStyle = idx % 2 === 0 ? 'rgba(123, 44, 191, 0.05)' : 'rgba(255, 255, 255, 0.01)';
    ctx.fillRect(xStart, 0, chunkWidth, height);

    // Draw borders/limits
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.06)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(xStart, 0);
    ctx.lineTo(xStart, height);
    ctx.stroke();

    // Text tag for chapters (top right of each chunk)
    if (chunkWidth > 80) {
      ctx.fillStyle = 'rgba(148, 163, 184, 0.3)';
      ctx.font = '500 9px "JetBrains Mono", monospace';
      ctx.fillText(f.name, xStart + 8, height - 8);
    }
  });

  // Draw ACTIVE GAME SEGMENTS (glowing green blocks)
  state.splits.forEach((split, index) => {
    const xStart = (split.start / state.virtualDuration) * width;
    const xEnd = (split.end / state.virtualDuration) * width;
    const rectWidth = xEnd - xStart;

    // Glowing Neon Green Block
    ctx.fillStyle = 'rgba(0, 245, 212, 0.15)';
    ctx.fillRect(xStart, 0, rectWidth, height - 15);

    // Border highlights
    ctx.strokeStyle = '#00F5D4';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(xStart, 0, rectWidth, height - 15);

    // Game tag number text
    ctx.fillStyle = '#00F5D4';
    ctx.font = '700 9px "Outfit", sans-serif';
    ctx.fillText(split.title || `Game ${index + 1}`, xStart + 6, 15);
  });

  // Draw current marker highlights (red highlight of selection)
  if (state.markers.start !== null) {
    const xStart = (state.markers.start / state.virtualDuration) * width;
    ctx.strokeStyle = '#EF4444';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(xStart, 0);
    ctx.lineTo(xStart, height);
    ctx.stroke();
    
    // Draw text tag
    ctx.fillStyle = '#EF4444';
    ctx.font = '700 9px "JetBrains Mono", monospace';
    ctx.fillText('IN', xStart + 4, 30);

    if (state.markers.end !== null) {
      const xEnd = (state.markers.end / state.virtualDuration) * width;
      
      // End line
      ctx.strokeStyle = '#EF4444';
      ctx.beginPath();
      ctx.moveTo(xEnd, 0);
      ctx.lineTo(xEnd, height);
      ctx.stroke();
      ctx.fillText('OUT', xEnd - 22, 30);

      // Fill select area
      ctx.fillStyle = 'rgba(239, 68, 68, 0.08)';
      ctx.fillRect(xStart, 0, xEnd - xStart, height);
    }
  }

  // Draw Ruler Ticks on the bottom boundary
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(0, height - 20);
  ctx.lineTo(width, height - 20);
  ctx.stroke();

  const tickSpacing = width / 10; // 10 major subdivisions
  for (let i = 0; i <= 10; i++) {
    const x = i * tickSpacing;
    const globalTime = (i / 10) * state.virtualDuration;

    ctx.beginPath();
    ctx.moveTo(x, height - 20);
    ctx.lineTo(x, height - 15);
    ctx.stroke();

    ctx.fillStyle = 'rgba(148, 163, 184, 0.5)';
    ctx.font = '400 9px "JetBrains Mono", monospace';
    ctx.textAlign = i === 10 ? 'right' : i === 0 ? 'left' : 'center';
    ctx.fillText(formatTime(globalTime).substring(0, 5), x, height - 4);
  }
}

/**
 * Show a floating HUD toast notification overlay inside the video player
 */
let hudTimeout = null;
function showHudToast(text) {
  if (!elements.hudToast) return;
  
  if (hudTimeout) {
    clearTimeout(hudTimeout);
  }
  
  elements.hudToast.textContent = text;
  elements.hudToast.style.display = 'block';
  
  // Slide up and fade out after 2 seconds
  hudTimeout = setTimeout(() => {
    elements.hudToast.style.display = 'none';
  }, 2200);
}

/**
 * Handle Marker boundaries
 */
function markGameStart() {
  if (document.activeElement) document.activeElement.blur();
  state.markers.start = state.virtualPlayhead;
  if (state.markers.end !== null && state.markers.end <= state.markers.start) {
    state.markers.end = null; // reset if end is before start
  }
  updateTimelineIndicators();
  drawTimelineCanvas();
  
  // Position HTML Start Pin
  if (elements.pinStart) {
    const pct = (state.markers.start / state.virtualDuration) * 100;
    elements.pinStart.style.left = `${pct}%`;
    elements.pinStart.style.display = 'block';
  }
  // Hide End Pin if it was reset
  if (state.markers.end === null && elements.pinEnd) {
    elements.pinEnd.style.display = 'none';
  }
  
  showHudToast(`🎯 Match Start Point Marked: ${formatTime(state.markers.start)}`);
  logToConsole(`[SYSTEM] Placed START marker at ${formatTime(state.markers.start)}`, 'info');
}

function markGameEnd() {
  if (document.activeElement) document.activeElement.blur();
  if (state.markers.start === null) {
    alert('Please mark a Start Point first.');
    return;
  }
  if (state.virtualPlayhead <= state.markers.start) {
    alert(`End Point (${formatTime(state.virtualPlayhead)}) must be after Start Point (${formatTime(state.markers.start)}).`);
    return;
  }
  state.markers.end = state.virtualPlayhead;
  updateTimelineIndicators();
  drawTimelineCanvas();
  
  // Position HTML End Pin
  if (elements.pinEnd) {
    const pct = (state.markers.end / state.virtualDuration) * 100;
    elements.pinEnd.style.left = `${pct}%`;
    elements.pinEnd.style.display = 'block';
  }
  
  showHudToast(`🏁 Match End Point Marked: ${formatTime(state.markers.end)}`);
  logToConsole(`[SYSTEM] Placed END marker at ${formatTime(state.markers.end)}`, 'info');
}

function updateTimelineIndicators() {
  const startText = state.markers.start !== null ? formatTime(state.markers.start) : '--:--:--';
  const endText = state.markers.end !== null ? formatTime(state.markers.end) : '--:--:--';
  elements.markerFeedback.textContent = `Start: ${startText} | End: ${endText}`;
}

/**
 * Split Segment Creator
 */
function addSplitSegment() {
  if (document.activeElement) document.activeElement.blur();
  if (state.markers.start === null || state.markers.end === null) {
    alert('You must define both a Start and an End point to add a game split.');
    return;
  }

  const duration = state.markers.end - state.markers.start;
  if (duration <= 0) {
    alert('Invalid split segment. Start must precede End.');
    return;
  }

  // Create new split details
  const newGameIndex = state.splits.length + 1;
  const newSplit = {
    start: state.markers.start,
    end: state.markers.end,
    title: `Game ${newGameIndex}`,
    teamA: '',
    teamB: '',
    score: ''
  };

  state.splits.push(newSplit);
  
  // Sort splits chronologically
  state.splits.sort((a, b) => a.start - b.start);

  // Re-index titles for sorted list
  state.splits.forEach((s, idx) => {
    if (s.title.startsWith('Game ')) {
      s.title = `Game ${idx + 1}`;
    }
  });

  // Reset markers & Hide HTML pins
  state.markers.start = null;
  state.markers.end = null;
  if (elements.pinStart) elements.pinStart.style.display = 'none';
  if (elements.pinEnd) elements.pinEnd.style.display = 'none';

  updateTimelineIndicators();
  renderSplitsList();
  drawTimelineCanvas();

  logToConsole(`[SYSTEM] Added Game Split. Total Splits: ${state.splits.length}`, 'info');
}

/**
 * Render Sidebar Game Cards
 */
function renderSplitsList() {
  elements.splitsCount.textContent = state.splits.length;
  
  if (state.splits.length === 0) {
    elements.splitsEmptyState.style.display = 'flex';
    return;
  }
  
  elements.splitsEmptyState.style.display = 'none';
  
  // Maintain existing input fields values by storing them
  const inputsBackup = [];
  const cards = elements.splitsListViewport.querySelectorAll('.split-card');
  cards.forEach(card => {
    const idx = parseInt(card.dataset.index, 10);
    const titleInput = card.querySelector('.title-input');
    const teamAInput = card.querySelector('.teama-input');
    const teamBInput = card.querySelector('.teamb-input');
    const scoreInput = card.querySelector('.score-input');
    if (titleInput) {
      inputsBackup[idx] = {
        title: titleInput.value,
        teamA: teamAInput.value,
        teamB: teamBInput.value,
        score: scoreInput.value
      };
    }
  });

  // Remove only split cards, do NOT delete the empty-state
  const existingCards = elements.splitsListViewport.querySelectorAll('.split-card');
  existingCards.forEach(c => c.remove());

  state.splits.forEach((s, idx) => {
    const backup = inputsBackup[idx] || {};
    s.title = backup.title !== undefined ? backup.title : s.title;
    s.teamA = backup.teamA !== undefined ? backup.teamA : s.teamA;
    s.teamB = backup.teamB !== undefined ? backup.teamB : s.teamB;
    s.score = backup.score !== undefined ? backup.score : s.score;

    const duration = s.end - s.start;
    const card = document.createElement('div');
    card.className = 'split-card';
    card.dataset.index = idx;
    
    card.innerHTML = `
      <div class="split-card-header">
        <span class="split-card-title">🏸 Game ${idx + 1}</span>
        <span class="split-card-time">${formatTime(duration)}</span>
      </div>
      
      <div class="split-card-form">
        <input type="text" class="title-input" placeholder="Title (e.g. Game 1 - Finals)" value="${s.title}">
        
        <div class="form-row">
          <input type="text" class="teama-input" placeholder="Team A Players" value="${s.teamA}">
          <input type="text" class="teamb-input" placeholder="Team B Players" value="${s.teamB}">
        </div>
        
        <input type="text" class="score-input" placeholder="Score (e.g. 21-19)" value="${s.score}">
      </div>
      
      <div class="split-card-actions">
        <div class="split-card-btn-grp">
          <button class="btn-split-action btn-preview-split" title="Jump to Game Start">▶️ Preview</button>
        </div>
        <button class="btn-split-action delete btn-delete-split" title="Remove Game Split">🗑️ Delete</button>
      </div>
    `;

    // Hook events inside card
    card.querySelector('.title-input').addEventListener('input', (e) => { s.title = e.target.value; drawTimelineCanvas(); });
    card.querySelector('.teama-input').addEventListener('input', (e) => { s.teamA = e.target.value; });
    card.querySelector('.teamb-input').addEventListener('input', (e) => { s.teamB = e.target.value; });
    card.querySelector('.score-input').addEventListener('input', (e) => { s.score = e.target.value; });

    card.querySelector('.btn-preview-split').addEventListener('click', () => {
      seekGlobal(s.start);
      if (!state.isPlaying) togglePlayPause();
    });

    card.querySelector('.btn-delete-split').addEventListener('click', () => {
      state.splits.splice(idx, 1);
      renderSplitsList();
      drawTimelineCanvas();
      logToConsole(`[SYSTEM] Deleted split ${idx + 1}`, 'info');
    });

    elements.splitsListViewport.appendChild(card);
  });
}

/**
 * Prev/Next Game fast scrubbing
 */
function jumpToPrevGame() {
  if (state.splits.length === 0) return;
  const current = state.virtualPlayhead;
  const splitsSorted = [...state.splits].sort((a,b)=> b.start - a.start);
  const match = splitsSorted.find(s => s.start < current - 2);
  if (match) seekGlobal(match.start);
}

function jumpToNextGame() {
  if (state.splits.length === 0) return;
  const current = state.virtualPlayhead;
  const match = state.splits.find(s => s.start > current + 2);
  if (match) seekGlobal(match.start);
}

/**
 * Save Project splits list to local badminton_session.json file
 */
async function saveProjectSession() {
  if (!state.dirPath) return;

  logToConsole(`[SYSTEM] Saving project session details...`, 'info');
  
  const payload = {
    dirPath: state.dirPath,
    projectData: {
      splits: state.splits,
      youtubeSettings: state.youtubeSettings
    }
  };

  try {
    const response = await fetch('/api/save-project', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    
    const data = await response.json();
    if (data.success) {
      logToConsole(`[SYSTEM] Saved splits project session successfully inside folder!`, 'info');
      showBannerNotification('💾 Project Splits Saved Successfully!');
    } else {
      throw new Error(data.error);
    }
  } catch (err) {
    logToConsole(`[ERROR] Save project splits failed: ${err.message}`, 'error');
    alert(`Failed to save project splits: ${err.message}`);
  }
}

/**
 * Clear splits list
 */
function clearAllSplits() {
  if (state.splits.length === 0) return;
  if (confirm('Are you sure you want to clear all defined game splits?')) {
    state.splits = [];
    renderSplitsList();
    drawTimelineCanvas();
    logToConsole('[SYSTEM] Cleared all splits.', 'info');
  }
}

/**
 * Lossless Cutting & Concatenation Trigger
 */
async function exportGames() {
  if (state.files.length === 0) return;
  if (state.splits.length === 0) {
    alert('Please define at least one game split segment to export.');
    return;
  }
  
  // Verify score and details are filled, ask for warning
  const missingDetails = state.splits.some(s => !s.teamA || !s.teamB || !s.score);
  if (missingDetails) {
    const proceed = confirm('Warning: Some game splits do not have players or scores entered. The exported filenames will contain default text. Proceed anyway?');
    if (!proceed) return;
  }

  // Open Log console
  elements.exportConsolePanel.style.display = 'flex';
  elements.consoleBody.textContent = '';
  
  logToConsole('==================================================', 'info');
  logToConsole('      ⚡ BADMINTON LOSSLESS EXPORT PIPELINE ⚡      ', 'info');
  logToConsole('==================================================', 'info');
  logToConsole(`[SYSTEM] Initializing exports for ${state.splits.length} games.`, 'info');

  state.isExporting = true;
  elements.btnExportAll.disabled = true;
  elements.btnExportAll.textContent = 'Processing Export...';
  
  // Show progress bar
  elements.consoleProgressContainer.style.display = 'block';
  updateExportProgress(0);

  const payload = {
    dirPath: state.dirPath,
    splits: state.splits,
    files: state.files.map(f => ({ name: f.name, path: f.path, duration: f.duration })),
    youtubeSettings: {
      autoUpload: elements.ytAutoUpload ? elements.ytAutoUpload.checked : false,
      playlistId: state.youtubeSettings.playlistMode === 'select' ? state.youtubeSettings.playlistId : null,
      privacy: state.youtubeSettings.privacy || 'unlisted',
      defaultDesc: state.youtubeSettings.defaultDesc
    }
  };

  try {
    // Send request using native fetch, and read chunked stream
    const response = await fetch('/api/export', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    if (response.status !== 200) {
      throw new Error(`Export API error: ${response.statusText}`);
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder('utf-8');
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop(); // save remaining partial chunk

      for (const line of lines) {
        if (line.trim()) {
          try {
            const data = JSON.parse(line);
            handleExportProgressChunk(data);
          } catch (e) {
            console.error('Failed to parse progress chunk:', line, e);
          }
        }
      }
    }

  } catch (err) {
    logToConsole(`[CRITICAL ERROR] Export crashed: ${err.message}`, 'error');
    elements.consoleProgressFill.style.background = '#EF4444';
    elements.consoleProgressText.textContent = 'EXPORT FAILED';
  } finally {
    state.isExporting = false;
    elements.btnExportAll.disabled = false;
    elements.btnExportAll.textContent = '⚡ Export Game Specific Videos';
  }
}

/**
 * Handle real-time stream callbacks from ffmpeg pipeline
 */
function handleExportProgressChunk(data) {
  switch (data.status) {
    case 'game_start':
      logToConsole(`\n[EXPORT] >>> ${data.message}`, 'info');
      // Compute percentage
      const startPct = Math.round((data.gameIndex / state.splits.length) * 100);
      updateExportProgress(startPct, `Processing game ${data.gameIndex + 1}/${state.splits.length}...`);
      break;
      
    case 'game_complete':
      logToConsole(`[EXPORT] ✓ ${data.message}`, 'success');
      
      // Auto-append simulated YouTube uploader buttons next to exports inside logger!
      appendYtUploadButtonToLog(data.filename, data.outputPath, state.splits[data.gameIndex]);
      
      const completePct = Math.round(((data.gameIndex + 1) / state.splits.length) * 100);
      updateExportProgress(completePct, `Game ${data.gameIndex + 1} done.`);
      break;

    case 'upload_start':
      logToConsole(`🚀 [YOUTUBE] ${data.message}`, 'info');
      break;

    case 'upload_complete':
      logToConsole(`✓ [YOUTUBE] ${data.message}`, 'success');
      showBannerNotification(`🎥 YouTube Live: ${data.message}`);
      break;

    case 'upload_error':
      logToConsole(`⚠️ [YOUTUBE ERROR] ${data.message}`, 'error');
      break;

    case 'info':
      logToConsole(`[FFMPEG] ${data.message}`, 'info');
      break;
      
    case 'warning':
      logToConsole(`[WARNING] ${data.message}`, 'warning');
      break;

    case 'error':
      logToConsole(`[ERROR] ${data.message}`, 'error');
      break;
      
    case 'all_complete':
      logToConsole(`\n==================================================`, 'success');
      logToConsole(`⚡ ${data.message}`, 'success');
      logToConsole(`==================================================`, 'success');
      updateExportProgress(100, 'All Games Exported Successfully!');
      showBannerNotification('⚡ All Games Exported Successfully!');
      break;
      
    case 'critical_error':
      logToConsole(`\n[CRITICAL] ${data.message}`, 'error');
      elements.consoleProgressFill.style.background = '#EF4444';
      elements.consoleProgressText.textContent = 'CRITICAL FAILURE';
      break;
  }
}

function updateExportProgress(percent, label) {
  elements.consoleProgressFill.style.width = `${percent}%`;
  elements.consoleProgressText.textContent = label ? `Exporting: ${percent}% - ${label}` : `Exporting: ${percent}%`;
}

/**
 * Render quick action buttons directly inside logger
 */
function appendYtUploadButtonToLog(filename, fullPath, splitInfo) {
  const container = document.createElement('div');
  container.className = 'console-in-log-action';
  container.style.margin = '5px 0 15px 15px';
  container.style.display = 'flex';
  container.style.gap = '10px';
  
  const uploadBtn = document.createElement('button');
  uploadBtn.className = 'btn btn-outline btn-sm';
  uploadBtn.style.padding = '3px 8px';
  uploadBtn.style.fontSize = '10px';
  uploadBtn.style.border = '1px solid #ff0055';
  uploadBtn.style.color = '#ff0055';
  uploadBtn.innerHTML = `🎥 Upload "${filename}" to YouTube`;
  
  uploadBtn.addEventListener('click', async () => {
    uploadBtn.disabled = true;
    uploadBtn.textContent = 'Uploading... 0%';
    logToConsole(`\n[YOUTUBE] Triggering upload for ${filename}...`, 'info');
    
    // Construct descriptions and descriptive title
    let desc = state.youtubeSettings.defaultDesc;
    const playersString = `${splitInfo.teamA || 'Team A'} vs ${splitInfo.teamB || 'Team B'}`;
    desc = desc.replace('{players}', playersString).replace('{score}', splitInfo.score || 'N/A');

    const youtubeTitle = `${splitInfo.teamA || 'Team A'} vs ${splitInfo.teamB || 'Team B'} (${splitInfo.score || 'Score'})`;

    try {
      const response = await fetch('/api/youtube-upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          videoPath: fullPath,
          title: youtubeTitle,
          description: desc,
          privacy: state.youtubeSettings.privacy,
          playlistId: state.youtubeSettings.playlistMode === 'select' ? state.youtubeSettings.playlistId : null
        })
      });

      let mockPercent = 0;
      const interval = setInterval(() => {
        mockPercent += 20;
        if (mockPercent <= 100) {
          uploadBtn.textContent = `Uploading... ${mockPercent}%`;
        }
      }, 400);

      const result = await response.json();
      clearInterval(interval);

      if (result.success) {
        uploadBtn.textContent = '✓ Uploaded to YouTube!';
        uploadBtn.style.borderColor = '#10B981';
        uploadBtn.style.color = '#10B981';
        logToConsole(`[YOUTUBE] Success! Video live at: ${result.url}`, 'success');
        showBannerNotification(`🎥 Video Live on YouTube: ${result.url}`);
      } else {
        throw new Error(result.error);
      }
    } catch (err) {
      uploadBtn.disabled = false;
      uploadBtn.textContent = '❌ Upload Failed';
      logToConsole(`[YOUTUBE ERROR] Upload failed: ${err.message}`, 'error');
    }
  });

  elements.consoleBody.appendChild(container);
  container.appendChild(uploadBtn);
  elements.consoleBody.scrollTop = elements.consoleBody.scrollHeight;
}

/**
 * YouTube Modals Actions
 */
function openYtModal() {
  elements.ytChannelName.value = state.youtubeSettings.channelName;
  elements.ytDefaultPrivacy.value = state.youtubeSettings.privacy;
  elements.ytDefaultDesc.value = state.youtubeSettings.defaultDesc;
  elements.ytClientId.value = state.youtubeSettings.clientId || '';
  elements.ytClientSecret.value = state.youtubeSettings.clientSecret || '';

  // Clear playlist input fields
  if (elements.ytNewPlaylistTitle) elements.ytNewPlaylistTitle.value = '';
  if (elements.ytNewPlaylistDesc) elements.ytNewPlaylistDesc.value = '';

  // Populate playlist fields from state
  const playlistMode = state.youtubeSettings.playlistMode || 'none';
  if (elements.ytPlaylistMode) elements.ytPlaylistMode.value = playlistMode;
  if (elements.ytPlaylistSelectBlock) elements.ytPlaylistSelectBlock.style.display = playlistMode === 'select' ? 'block' : 'none';
  if (elements.ytPlaylistCreateBlock) elements.ytPlaylistCreateBlock.style.display = playlistMode === 'create' ? 'block' : 'none';

  if (playlistMode === 'select') {
    fetchPlaylists(state.youtubeSettings.playlistId);
  }

  elements.ytModal.style.display = 'flex';
}

function closeYtModal() {
  elements.ytModal.style.display = 'none';
}

function saveYtSettings() {
  const playlistMode = elements.ytPlaylistMode ? elements.ytPlaylistMode.value : 'none';
  const playlistId = playlistMode === 'select' ? elements.ytPlaylistSelect.value : '';

  state.youtubeSettings = {
    channelName: elements.ytChannelName.value.trim(),
    privacy: elements.ytDefaultPrivacy.value,
    defaultDesc: elements.ytDefaultDesc.value,
    clientId: elements.ytClientId.value.trim(),
    clientSecret: elements.ytClientSecret.value.trim(),
    autoUpload: elements.ytAutoUpload ? elements.ytAutoUpload.checked : false,
    playlistMode: playlistMode,
    playlistId: playlistId
  };
  
  // Render connected stats in Sidebar
  const label = document.querySelector('.yt-status-disconnected');
  if (label) {
    label.innerHTML = `<span class="yt-dot" style="background:#10B981;"></span> YouTube Channel: <strong>${state.youtubeSettings.channelName}</strong>`;
  }

  closeYtModal();
  logToConsole(`[SYSTEM] YouTube settings saved: Target channel is "${state.youtubeSettings.channelName}" (${state.youtubeSettings.privacy})`, 'info');
}

async function fetchPlaylists(selectedPlaylistId) {
  if (!elements.ytPlaylistSelect) return;
  
  elements.ytPlaylistSelect.innerHTML = '<option value="">Fetching playlists...</option>';
  
  try {
    const response = await fetch('/api/youtube-playlists');
    const data = await response.json();
    
    if (data.success && data.playlists) {
      elements.ytPlaylistSelect.innerHTML = '';
      if (data.playlists.length === 0) {
        elements.ytPlaylistSelect.innerHTML = '<option value="">-- No playlists found --</option>';
        return;
      }
      
      data.playlists.forEach(pl => {
        const option = document.createElement('option');
        option.value = pl.id;
        option.textContent = `${pl.title} (${pl.privacyStatus})`;
        if (selectedPlaylistId && pl.id === selectedPlaylistId) {
          option.selected = true;
        }
        elements.ytPlaylistSelect.appendChild(option);
      });
    } else {
      elements.ytPlaylistSelect.innerHTML = `<option value="">-- Error: ${data.error || 'Failed to fetch'} --</option>`;
    }
  } catch (err) {
    elements.ytPlaylistSelect.innerHTML = `<option value="">-- Error: ${err.message} --</option>`;
  }
}

/**
 * YouTube Channel Browser Modal Logic
 */
async function openYtChannelsModal() {
  elements.ytChannelsModal.style.display = 'flex';
  elements.ytChannelSearch.value = '';
  elements.btnSelectYtChannel.disabled = true;
  elements.ytChannelsViewport.innerHTML = '<div style="color:var(--text-bright); padding:20px; text-align:center;">Loading channels...</div>';
  
  const clientId = elements.ytClientId.value.trim();
  const clientSecret = elements.ytClientSecret.value.trim();
  
  let url = '/api/youtube-channels';
  if (clientId && clientSecret && state.dirPath) {
    url += `?dirPath=${encodeURIComponent(state.dirPath)}`;
  }
  
  try {
    const response = await fetch(url);
    const data = await response.json();
    
    if (data.needs_auth) {
      elements.ytChannelsViewport.innerHTML = `
        <div style="display:flex; flex-direction:column; align-items:center; justify-content:center; text-align:center; padding:30px 20px; gap:15px; height:100%; box-sizing:border-box;">
          <span style="font-size:36px;">🔒</span>
          <h4 style="font-family:'Outfit', sans-serif; font-size:14px; font-weight:700; margin:0; color:var(--text-bright);">Google Account Authorization Required</h4>
          <p style="font-size:11px; color:var(--text-muted); line-height:1.5; margin:0;">Click below to securely sign in with your Google account and authorize this application to retrieve your channels.</p>
          <button class="btn btn-primary btn-block" id="btn-trigger-oauth" style="font-size:12px; font-weight:700; padding:10px; margin-top:5px;">🚀 Sign In with Google</button>
        </div>
      `;
      
      const btnTrigger = document.getElementById('btn-trigger-oauth');
      if (btnTrigger) {
        btnTrigger.addEventListener('click', async () => {
          btnTrigger.disabled = true;
          btnTrigger.textContent = 'Redirecting to Google...';
          
          try {
            const authResponse = await fetch(`/api/youtube-auth-url?clientId=${encodeURIComponent(clientId)}&clientSecret=${encodeURIComponent(clientSecret)}&dirPath=${encodeURIComponent(state.dirPath)}`);
            const authData = await authResponse.json();
            
            if (authData.success && authData.url) {
              // Open OAuth flow in a popup window centered
              const width = 500;
              const height = 650;
              const left = (screen.width - width) / 2;
              const top = (screen.height - height) / 2;
              const popup = window.open(
                authData.url,
                'Google OAuth',
                `width=${width},height=${height},left=${left},top=${top},status=no,resizable=yes`
              );
              
              // Watch for popup message indicating success
              const handleMessage = (event) => {
                if (event.data === 'oauth-success') {
                  window.removeEventListener('message', handleMessage);
                  logToConsole('[SYSTEM] OAuth authentication completed successfully!', 'success');
                  openYtChannelsModal(); // reload channels!
                }
              };
              window.addEventListener('message', handleMessage);
              
              // Fallback poll in case popup is closed
              const timer = setInterval(() => {
                if (popup.closed) {
                  clearInterval(timer);
                  btnTrigger.disabled = false;
                  btnTrigger.textContent = '🚀 Sign In with Google';
                  // Check if tokens got saved by reloading channels list
                  setTimeout(openYtChannelsModal, 500);
                }
              }, 1000);
            } else {
              throw new Error('Failed to generate Google auth URL');
            }
          } catch (e) {
            alert(`Authorization failed: ${e.message}`);
            btnTrigger.disabled = false;
            btnTrigger.textContent = '🚀 Sign In with Google';
          }
        });
      }
      return;
    }

    if (data.success) {
      state.ytChannels = data.channels;
      renderYtChannels(state.ytChannels);
    } else {
      throw new Error(data.error || 'Failed to fetch channels');
    }
  } catch (err) {
    elements.ytChannelsViewport.innerHTML = `<div style="color:#FF0055; padding:20px; text-align:center;">❌ Error: ${err.message}</div>`;
  }
}

function closeYtChannelsModal() {
  elements.ytChannelsModal.style.display = 'none';
  state.selectedYtChannelId = null;
}

function renderYtChannels(channels) {
  elements.ytChannelsViewport.innerHTML = '';
  if (channels.length === 0) {
    elements.ytChannelsViewport.innerHTML = '<div style="color:var(--text-muted); padding:20px; text-align:center;">No channels found matching query.</div>';
    return;
  }

  channels.forEach(ch => {
    const row = document.createElement('div');
    row.className = `yt-channel-row ${ch.id === state.selectedYtChannelId ? 'selected' : ''}`;
    
    // Create initials for avatar
    const initials = ch.name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();
    
    row.innerHTML = `
      <div class="yt-channel-avatar" style="background:${ch.avatarColor || 'var(--color-primary)'};">
        ${initials}
      </div>
      <div class="yt-channel-details">
        <span class="yt-channel-name-text">${ch.name}</span>
        <span class="yt-channel-subs">${ch.subscribers} subscribers</span>
      </div>
      ${ch.primary ? '<span class="yt-channel-badge">Primary</span>' : ''}
    `;

    row.addEventListener('click', () => {
      // Toggle selection styling
      const prevSelected = elements.ytChannelsViewport.querySelector('.yt-channel-row.selected');
      if (prevSelected) prevSelected.classList.remove('selected');
      
      row.classList.add('selected');
      state.selectedYtChannelId = ch.id;
      elements.btnSelectYtChannel.disabled = false;
    });

    row.addEventListener('dblclick', () => {
      state.selectedYtChannelId = ch.id;
      selectYtChannel();
    });

    elements.ytChannelsViewport.appendChild(row);
  });
}

function filterYtChannels(query) {
  const q = query.toLowerCase().trim();
  if (!q) {
    renderYtChannels(state.ytChannels);
    return;
  }
  const filtered = state.ytChannels.filter(ch => ch.name.toLowerCase().includes(q));
  renderYtChannels(filtered);
}

function selectYtChannel() {
  if (!state.selectedYtChannelId) return;
  const channel = state.ytChannels.find(ch => ch.id === state.selectedYtChannelId);
  if (channel) {
    elements.ytChannelName.value = channel.name;
    closeYtChannelsModal();
    logToConsole(`[SYSTEM] Selected target channel "${channel.name}" from browser.`, 'info');
  }
}

/**
 * Handle Keyboard Shortcuts
 */
function onGlobalKeyDown(e) {
  // If typing in input fields, ignore hotkeys
  if (document.activeElement.tagName === 'INPUT' || document.activeElement.tagName === 'TEXTAREA') {
    if (e.key === 'Enter' && document.activeElement.classList.contains('score-input')) {
      // Blur inputs on enter
      document.activeElement.blur();
    }
    return;
  }

  switch (e.key) {
    case ' ': // Space - Play/Pause
      e.preventDefault();
      togglePlayPause();
      break;
    case 'ArrowLeft': // ArrowLeft - seek back 5s
      e.preventDefault();
      seekRelative(-5);
      break;
    case 'ArrowRight': // ArrowRight - seek forward 5s
      e.preventDefault();
      seekRelative(5);
      break;
    case 'i':
    case 'I': // I - Mark start point
      markGameStart();
      break;
    case 'o':
    case 'O': // O - Mark end point
      markGameEnd();
      break;
    case 'Enter': // Enter - Add split
      e.preventDefault();
      addSplitSegment();
      break;
  }
}

function togglePlayPause() {
  if (state.files.length === 0) return;
  if (state.isPlaying) {
    elements.mainPlayer.pause();
  } else {
    elements.mainPlayer.play().catch(e => console.log('Playback error:', e));
  }
}

/**
 * Console log utility
 */
function logToConsole(message, type = 'info') {
  const line = document.createElement('div');
  line.textContent = message;
  
  if (type === 'error') {
    line.style.color = '#FF0055';
  } else if (type === 'success') {
    line.style.color = '#00F5D4';
  } else if (type === 'warning') {
    line.style.color = '#F59E0B';
  }
  
  elements.consoleBody.appendChild(line);
  elements.consoleBody.scrollTop = elements.consoleBody.scrollHeight;
}

/**
 * Format time in seconds to HH:MM:SS
 */
function formatTime(secs) {
  if (isNaN(secs) || secs === null) return '00:00:00';
  const secNum = parseInt(secs, 10);
  const hours   = Math.floor(secNum / 3600);
  const minutes = Math.floor((secNum - (hours * 3600)) / 60);
  const seconds = secNum - (hours * 3600) - (minutes * 60);

  return [
    hours.toString().padStart(2, '0'),
    minutes.toString().padStart(2, '0'),
    seconds.toString().padStart(2, '0')
  ].join(':');
}

/**
 * Toast / Banner Notifications helper
 */
function showBannerNotification(text) {
  const banner = document.createElement('div');
  banner.style.position = 'fixed';
  banner.style.top = '40px';
  banner.style.left = '50%';
  banner.style.transform = 'translateX(-50%)';
  banner.style.background = 'linear-gradient(135deg, #7B2CBF, #00F5D4)';
  banner.style.color = '#000';
  banner.style.fontWeight = '800';
  banner.style.fontFamily = '"Outfit", sans-serif';
  banner.style.padding = '12px 24px';
  banner.style.borderRadius = '30px';
  banner.style.boxShadow = '0 10px 25px rgba(0, 245, 212, 0.4)';
  banner.style.zIndex = '9999';
  banner.style.fontSize = '14px';
  banner.style.animation = 'bannerEntry 0.3s cubic-bezier(0.18, 0.89, 0.32, 1.28)';
  banner.textContent = text;

  document.body.appendChild(banner);

  // Add keyframe dynamic injection for entry
  const style = document.createElement('style');
  style.textContent = `
    @keyframes bannerEntry {
      0% { top: -20px; opacity: 0; }
      100% { top: 40px; opacity: 1; }
    }
  `;
  document.head.appendChild(style);

  setTimeout(() => {
    banner.style.transition = 'opacity 0.5s ease';
    banner.style.opacity = '0';
    setTimeout(() => {
      banner.remove();
      style.remove();
    }, 500);
  }, 3500);
}

/**
 * Global Profiles Front-end Engine
 */
async function fetchProfiles() {
  try {
    const response = await fetch('/api/youtube-profiles');
    const data = await response.json();
    state.profiles = data.profiles;
    state.activeProfileId = data.activeProfileId;
    
    renderWelcomeProfiles();
    renderSettingsProfiles();
    updateActiveProfileSidebar();
    
    // Sync active settings to state
    if (state.activeProfileId) {
      const active = state.profiles.find(p => p.id === state.activeProfileId);
      if (active) {
        state.youtubeSettings.channelName = active.name;
        state.youtubeSettings.clientId = active.clientId || '';
        // If active profile exists, automatically hide welcome overlay on reload
        const overlay = document.getElementById('auth-welcome-overlay');
        if (overlay && !overlay.classList.contains('hidden')) {
          overlay.style.display = 'none';
          overlay.classList.add('hidden');
        }
      }
    }
  } catch (err) {
    console.error('Error fetching global profiles:', err.message);
  }
}

function renderWelcomeProfiles() {
  const container = document.getElementById('welcome-profiles-list');
  if (!container) return;
  
  if (state.profiles.length === 0) {
    container.innerHTML = `
      <div style="color:var(--text-muted); padding:30px 20px; text-align:center; font-size:12px; background:rgba(0,0,0,0.15); border-radius:var(--radius-md); border:1px dashed var(--border-color); width:100%; box-sizing:border-box;">
        <span style="font-size:24px; display:block; margin-bottom:8px;">🔒</span>
        No profiles configured. Click below to connect your YouTube channel or run offline.
      </div>
    `;
    return;
  }
  
  container.innerHTML = '';
  state.profiles.forEach(p => {
    const item = document.createElement('div');
    item.className = `profile-card-item ${p.id === state.activeProfileId ? 'active' : ''}`;
    
    const initials = p.name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();
    
    item.innerHTML = `
      <div class="profile-card-avatar" style="background:${p.avatarColor || 'var(--color-primary)'};">
        ${initials}
      </div>
      <div class="profile-card-info">
        <span class="profile-card-name">${p.name}</span>
        <span class="profile-card-subs">${p.subscribers} subscribers ${p.isMock ? '(Simulation)' : ''}</span>
      </div>
      ${p.id === state.activeProfileId ? '<span class="profile-card-badge">Active</span>' : ''}
      <button class="profile-card-delete-btn" title="Delete Profile" onclick="event.stopPropagation(); deleteProfile('${p.id}')">×</button>
    `;
    
    item.addEventListener('click', async () => {
      await selectActiveProfile(p.id);
      dismissWelcomeOverlay();
    });
    
    container.appendChild(item);
  });
}

async function deleteProfile(id) {
  if (!confirm('Are you sure you want to delete this profile?')) return;
  try {
    const response = await fetch('/api/youtube-profiles/delete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id })
    });
    if (response.ok) {
      showBannerNotification('👤 Profile deleted successfully.');
      await fetchProfiles();
    }
  } catch (err) {
    alert('Error deleting profile: ' + err.message);
  }
}

async function selectActiveProfile(id) {
  try {
    const response = await fetch('/api/youtube-profiles/active', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id })
    });
    const data = await response.json();
    if (data.success) {
      await fetchProfiles();
      logToConsole(`[SYSTEM] Switched active profile: ${id === 'offline' || id === null ? 'Offline Mode' : 'Profile connected'}`, 'info');
      showBannerNotification(`👤 Profile Switched successfully.`);
    }
  } catch (err) {
    console.error('Error switching active profile:', err.message);
  }
}

async function handleRunOffline() {
  await selectActiveProfile(null);
  dismissWelcomeOverlay();
}

function dismissWelcomeOverlay() {
  const overlay = document.getElementById('auth-welcome-overlay');
  if (overlay) {
    overlay.classList.add('hidden');
    setTimeout(() => {
      overlay.style.display = 'none';
    }, 400);
  }
}

function updateActiveProfileSidebar() {
  const label = document.querySelector('.yt-credentials');
  if (!label) return;
  
  if (!state.activeProfileId) {
    label.innerHTML = `
      <div class="yt-status-disconnected">
        <span class="yt-dot" style="background:#64748B;"></span> Offline / Simulation Mode
      </div>
    `;
    return;
  }
  
  const active = state.profiles.find(p => p.id === state.activeProfileId);
  if (active) {
    label.innerHTML = `
      <div class="yt-status-disconnected">
        <span class="yt-dot" style="background:${active.avatarColor || '#10B981'};"></span>
        YouTube Channel: <strong>${active.name}</strong> ${active.isMock ? '(Simulation)' : ''}
      </div>
    `;
    
    // Sync settings modal fields
    elements.ytChannelName.value = active.name;
    elements.ytClientId.value = active.clientId || '';
  } else {
    label.innerHTML = `
      <div class="yt-status-disconnected">
        <span class="yt-dot" style="background:#64748B;"></span> Offline / Simulation Mode
      </div>
    `;
  }
}

function renderSettingsProfiles() {
  const select = document.getElementById('yt-profile-select');
  const manageList = document.getElementById('yt-profiles-manage-list');
  if (!select || !manageList) return;
  
  select.innerHTML = '<option value="offline">Run Offline / Simulation Mode</option>';
  state.profiles.forEach(p => {
    const opt = document.createElement('option');
    opt.value = p.id;
    opt.textContent = `${p.name} (${p.subscribers} subs) ${p.isMock ? '[Sim]' : ''}`;
    if (p.id === state.activeProfileId) {
      opt.selected = true;
    }
    select.appendChild(opt);
  });
  
  if (state.profiles.length === 0) {
    manageList.innerHTML = '<div style="color:var(--text-muted); font-size:11px; padding:6px; text-align:center;">No saved YouTube profiles.</div>';
    return;
  }
  
  manageList.innerHTML = '';
  state.profiles.forEach(p => {
    const row = document.createElement('div');
    row.className = 'yt-profile-manage-row';
    row.innerHTML = `
      <div class="yt-profile-manage-info">
        <span class="yt-profile-manage-dot" style="background:${p.avatarColor || 'var(--color-primary)'};"></span>
        <span class="yt-profile-manage-name">${p.name} ${p.isMock ? '(Sim)' : ''}</span>
      </div>
      <button class="yt-profile-manage-delete" title="Delete Profile" onclick="event.stopPropagation(); deleteProfile('${p.id}')">Delete</button>
    `;
    manageList.appendChild(row);
  });
}

async function triggerWelcomeGoogleLogin() {
  const clientId = document.getElementById('welcome-client-id').value.trim();
  const clientSecret = document.getElementById('welcome-client-secret').value.trim();
  
  const btn = document.getElementById('btn-welcome-login-google');
  btn.disabled = true;
  btn.textContent = 'Redirecting to Google...';
  
  try {
    const authResponse = await fetch(`/api/youtube-auth-url?clientId=${encodeURIComponent(clientId)}&clientSecret=${encodeURIComponent(clientSecret)}`);
    const authData = await authResponse.json();
    
    if (authData.success && authData.url) {
      const width = 500;
      const height = 650;
      const left = (screen.width - width) / 2;
      const top = (screen.height - height) / 2;
      const popup = window.open(
        authData.url,
        'Google OAuth',
        `width=${width},height=${height},left=${left},top=${top},status=no,resizable=yes`
      );
      
      const handleMessage = async (event) => {
        if (event.data === 'oauth-success') {
          window.removeEventListener('message', handleMessage);
          showBannerNotification('🚀 Connected to YouTube Live Account!');
          await fetchProfiles();
          dismissWelcomeOverlay();
        }
      };
      window.addEventListener('message', handleMessage);
      
      const timer = setInterval(async () => {
        if (popup.closed) {
          clearInterval(timer);
          btn.disabled = false;
          btn.textContent = '🚀 Login with Google';
          await fetchProfiles();
          if (state.activeProfileId) {
            dismissWelcomeOverlay();
          }
        }
      }, 1000);
    } else {
      throw new Error('Failed to generate Google auth URL');
    }
  } catch (e) {
    alert(`Authorization failed: ${e.message}`);
    btn.disabled = false;
    btn.textContent = '🚀 Login with Google';
  }
}

async function triggerWelcomeCreateMock() {
  const name = document.getElementById('welcome-mock-name').value.trim();
  if (!name) {
    alert('Please enter a mock channel name.');
    return;
  }
  
  try {
    const response = await fetch('/api/youtube-profiles/create-mock', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name })
    });
    const data = await response.json();
    if (data.success) {
      showBannerNotification(`👤 Created Simulation Profile "${name}"!`);
      await fetchProfiles();
      dismissWelcomeOverlay();
    } else {
      alert('Failed to create mock profile: ' + data.error);
    }
  } catch (err) {
    alert('Error creating mock profile: ' + err.message);
  }
}

// Expose deleteProfile globally for onclick bindings
window.deleteProfile = deleteProfile;

// Start client loop
window.onload = init;
