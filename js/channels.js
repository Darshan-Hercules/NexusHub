/**
 * channels.js – Channel management with Supabase (Server-based)
 */
const Channels = (() => {
  const TYPE_ICONS = { discussion: '#', announcement: '📢', task: '✅', qa: '❓', voice: '🔊', video: '📹' };
  const TYPE_LABELS = { discussion: 'Discussion', announcement: 'Announcement', task: 'Task Board', qa: 'Q&A', voice: 'Voice', video: 'Video' };

  const renderList = async (spaceId, activeChannelId) => {
    const chs = await Store.channels.forSpace(spaceId);
    if (chs.length === 0) {
      return `<div class="empty-state" style="padding:var(--space-6)"><p>No channels yet. Create one!</p></div>`;
    }

    // Group by type
    const groups = {
      discussion: { label: 'Text Channels', items: [] },
      announcement: { label: 'Announcements', items: [] },
      task: { label: 'Tasks', items: [] },
      qa: { label: 'Q&A', items: [] },
      voice: { label: 'Voice Channels', items: [] },
      video: { label: 'Video Channels', items: [] },
    };
    chs.forEach(ch => { if (groups[ch.type]) groups[ch.type].items.push(ch); });

    const currentUser = Auth.current();
    const members = await Store.spaces.members(spaceId);
    const currentMember = members.find(m => m.user_id === currentUser?.id);
    const space = await Store.spaces.find(spaceId);
    const isStaff = (currentMember && ['admin', 'moderator'].includes(currentMember.role)) || (space && space.owner_id === currentUser?.id);

    return Object.entries(groups).map(([type, group]) => {
      // Always show these core categories so users have a "+" button to click
      const isCore = ['discussion', 'voice', 'video'].includes(type);
      if (group.items.length === 0 && !isCore) return '';

      const isVoiceVideo = type === 'voice' || type === 'video';
      return `
        <div class="channel-section">
          <div class="channel-section-header">
            <span class="channel-section-label">${group.label}</span>
            <button class="channel-section-add" onclick="Channels.showCreateModal('${spaceId}','${type}')" title="Add channel">+</button>
          </div>
          ${group.items.length === 0 ?
          `<div style="padding:var(--space-2) var(--space-4); font-size:var(--text-xs); color:var(--text-muted); font-style:italic">No ${group.label.toLowerCase()} yet</div>` :
          group.items.map(ch => {
            const editBtn = isStaff ? `<button class="channel-edit-btn" onclick="event.stopPropagation(); Channels.showEditModal('${spaceId}','${ch.id}')" title="Edit channel">⚙️</button>` : '';

            return isVoiceVideo ? `
              <div class="channel-item voice-video-item ${ch.id === activeChannelId ? 'active' : ''}" 
                   id="ch-item-${ch.id}"
                   onclick="Channels.joinVoiceVideo('${ch.id}','${ch.type}')">
                <div class="channel-item-info">
                  <span class="channel-type-icon">${TYPE_ICONS[ch.type] || '#'}</span>
                  <span>${ch.name}</span>
                </div>
                ${editBtn}
              </div>
            ` : `
              <div class="channel-item ${ch.id === activeChannelId ? 'active' : ''}"
                   id="ch-item-${ch.id}"
                   onclick="App.navigate('workspace',{spaceId:'${spaceId}',channelId:'${ch.id}'})">
                <div style="display:flex; align-items:center; flex:1; overflow:hidden">
                  <span class="channel-type-icon">${TYPE_ICONS[ch.type] || '#'}</span>
                  <span style="overflow:hidden; text-overflow:ellipsis; white-space:nowrap">${ch.name}</span>
                </div>
                ${editBtn}
              </div>
            `;
          }).join('')}
        </div>`;
    }).join('');
  };

  const showCreateModal = (spaceId, defaultType = 'discussion') => {
    const overlay = document.getElementById('modal-overlay');
    overlay.innerHTML = `
      <div class="modal">
        <div class="modal-header">
          <h2>Create Channel</h2>
          <button class="modal-close" onclick="Channels.closeModal()">✕</button>
        </div>
        <div class="modal-body">
          <div class="input-group">
            <label>Channel Type</label>
            <select id="ch-type" class="input-field">
              <option value="discussion" ${defaultType === 'discussion' ? 'selected' : ''}>💬 Discussion</option>
              <option value="announcement" ${defaultType === 'announcement' ? 'selected' : ''}>📢 Announcement</option>
              <option value="task" ${defaultType === 'task' ? 'selected' : ''}>✅ Task Board</option>
              <option value="qa" ${defaultType === 'qa' ? 'selected' : ''}>❓ Q&A</option>
              <option value="voice" ${defaultType === 'voice' ? 'selected' : ''}>🔊 Voice Channel</option>
              <option value="video" ${defaultType === 'video' ? 'selected' : ''}>📹 Video Channel</option>
            </select>
          </div>
          <div class="input-group">
            <label>Channel Name *</label>
            <input id="ch-name" class="input-field" placeholder="e.g. general, announcements..." />
            <div id="ch-name-err" class="form-error"></div>
          </div>
          <div class="input-group">
            <label>Description</label>
            <input id="ch-desc" class="input-field" placeholder="What is this channel for?" />
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn btn-secondary" onclick="Channels.closeModal()">Cancel</button>
          <button class="btn btn-primary" onclick="Channels.create('${spaceId}')">Create Channel</button>
        </div>
      </div>`;
    overlay.classList.remove('hidden');
    document.getElementById('ch-name')?.focus();
  };

  const closeModal = () => {
    const overlay = document.getElementById('modal-overlay');
    overlay.classList.add('hidden');
    overlay.innerHTML = '';
  };

  const create = async (spaceId) => {
    const user = Auth.current();
    const name = document.getElementById('ch-name')?.value.trim();
    const errEl = document.getElementById('ch-name-err');
    const btn = document.querySelector('.modal-footer .btn-primary');

    if (!name) { if (errEl) errEl.textContent = 'Channel name is required.'; return; }
    if (!user) { if (errEl) errEl.textContent = 'Session lost. Please login again.'; return; }

    try {
      if (btn) { btn.disabled = true; btn.textContent = 'Creating...'; }

      const chType = document.getElementById('ch-type')?.value || 'discussion';
      const chDesc = document.getElementById('ch-desc')?.value.trim() || '';

      const { data, error } = await Store.channels.create({
        spaceId,
        name,
        type: chType,
        description: chDesc,
        createdBy: user.id,
      });

      if (error) throw error;

      closeModal();
      App.navigate('workspace', { spaceId, channelId: data.id });
    } catch (e) {
      console.error('Channels: Create error:', e);
      if (errEl) errEl.textContent = e.message || 'Failed to create channel. Please try again.';
      if (btn) { btn.disabled = false; btn.textContent = 'Create Channel'; }
    }
  };

  const joinVoiceVideo = async (channelId, type) => {
    const user = Auth.current();
    if (!user) return;

    // Show the modal immediately
    const overlay = document.getElementById('modal-overlay');
    const label = type === 'voice' ? 'Voice Call' : 'Video Call';
    const icon = type === 'voice' ? '🎤' : '📹';

    // Initial state
    let isMuted = false;
    let isCameraOff = type === 'voice';

    const renderCallUI = (participants = []) => {
      overlay.innerHTML = `
        <div class="modal voice-call-modal">
          <div class="modal-header">
            <h2>${icon} ${label}</h2>
            <button class="modal-close" onclick="Channels.leaveAndClose('${channelId}')">✕</button>
          </div>
          <div class="modal-body call-container">
            <div class="participants-grid" id="participants-grid">
              ${participants.map(p => `
                <div class="participant-card ${p.isSpeaking ? 'speaking' : ''}" style="--user-color: ${p.color || 'var(--accent)'}" id="participant-${p.id}">
                  <div class="participant-avatar">
                    <div class="remote-video-container" id="video-${p.id}"></div>
                    ${p.avatar ? `<img src="${p.avatar}" alt="${p.name}" class="avatar-img-call">` : `<div class="avatar-placeholder">${p.name[0]}</div>`}
                    <div class="participant-status-icons">
                      ${p.muted ? '<span class="status-icon mic-off">🔇</span>' : ''}
                      ${p.camera ? '<span class="status-icon cam-on">📹</span>' : ''}
                    </div>
                  </div>
                  <div class="participant-info">
                    <span class="participant-name">${p.name}</span>
                    ${p.id === user.id ? '<span class="you-tag">(You)</span>' : ''}
                  </div>
                </div>
              `).join('')}
              ${participants.length === 1 ? `
                <div class="voice-waiting-card">
                  <div class="voice-pulse-ring"></div>
                  <p>Waiting for others to join...</p>
                </div>
              ` : ''}
            </div>
            
            <div class="call-controls">
              <button class="control-btn ${isMuted ? 'active' : ''}" id="toggle-mic" title="${isMuted ? 'Unmute' : 'Mute'}">
                ${isMuted ? '🔇' : '🎤'}
              </button>
              ${type === 'video' ? `
                <button class="control-btn ${isCameraOff ? 'active' : ''}" id="toggle-cam" title="${isCameraOff ? 'Turn Camera On' : 'Turn Camera Off'}">
                  ${isCameraOff ? '🚫📹' : '📹'}
                </button>
              ` : ''}
              <button class="control-btn btn-danger" onclick="Channels.leaveAndClose('${channelId}')" title="Disconnect">
                📞
              </button>
            </div>
          </div>
        </div>`;

      // Attach local listeners
      document.getElementById('toggle-mic')?.addEventListener('click', () => {
        isMuted = !isMuted;
        if (Store.webrtc.localStream) {
          Store.webrtc.localStream.getAudioTracks().forEach(t => t.enabled = !isMuted);
        }
        Store.presence.updateState(channelId, { muted: isMuted });
        renderCallUI(participants);
      });
      document.getElementById('toggle-cam')?.addEventListener('click', () => {
        isCameraOff = !isCameraOff;
        if (Store.webrtc.localStream) {
          Store.webrtc.localStream.getVideoTracks().forEach(t => t.enabled = !isCameraOff);
        }
        Store.presence.updateState(channelId, { camera: !isCameraOff });
        renderCallUI(participants);
      });

      // Handle local video if camera is on
      if (!isCameraOff && type === 'video') {
        const localVideoWrap = document.querySelector(`#video-${user.id}`);
        if (localVideoWrap && !localVideoWrap.querySelector('video')) {
          const video = document.createElement('video');
          video.srcObject = Store.webrtc.localStream;
          video.autoplay = true;
          video.muted = true; // Don't hear yourself
          video.playsInline = true;
          localVideoWrap.appendChild(video);
        }
      }
    };

    try {
      // 1. Initialize WebRTC Media Capture first
      await Store.webrtc.init(type);

      // 2. Setup Remote Stream handling
      Store.webrtc.onRemoteStream = (userId, stream) => {
        console.log('Channels: Attaching remote stream for', userId);
        const container = document.querySelector(`#video-${userId}`);
        if (container) {
          // Clear existing
          container.innerHTML = '';
          const media = document.createElement(type === 'video' ? 'video' : 'audio');
          media.srcObject = stream;
          media.autoplay = true;
          media.playsInline = true;
          container.appendChild(media);

          // Hide avatar if video
          if (type === 'video') {
            const avatar = container.parentElement.querySelector('.avatar-img-call, .avatar-placeholder');
            if (avatar) avatar.style.display = 'none';
          }
        }
      };

      // 3. Join Presence (this now also sets up signaling listeners)
      await Store.presence.joinVoice(channelId, user, async (participants) => {
        // Track new participants to start WebRTC
        const currentPeerIds = Array.from(Store.webrtc.peers.keys());
        participants.forEach(p => {
          if (p.id !== user.id && !currentPeerIds.includes(p.id)) {
            // New participant joined, we start the call if we were already there
            console.log('Channels: New participant detected, starting WebRTC call with', p.id);
            Store.webrtc.startCall(channelId, p.id);
          }
        });

        // Remove participants who left
        const participantIds = participants.map(p => p.id);
        currentPeerIds.forEach(peerId => {
          if (!participantIds.includes(peerId)) {
            console.log('Channels: Participant left, closing peer', peerId);
            Store.webrtc.closePeer(peerId);
          }
        });

        renderCallUI(participants);
      });

      // Initial render with just self
      renderCallUI([{ id: user.id, name: user.display_name || user.username, avatar: user.avatar_url, color: user.color, muted: isMuted, camera: !isCameraOff }]);
      overlay.classList.remove('hidden');

    } catch (e) {
      console.error('Channels: Call join error:', e);
      Notifications.showToast('Could not access microphone/camera', 'error');
      Channels.leaveAndClose(channelId);
    }
  };

  const leaveAndClose = async (channelId) => {
    Store.webrtc.cleanup();
    await Store.presence.leaveVoice(channelId);
    closeModal();
  };

  const showEditModal = async (spaceId, channelId) => {
    const channel = await Store.channels.find(channelId);
    if (!channel) return;

    const overlay = document.getElementById('modal-overlay');
    overlay.innerHTML = `
      <div class="modal">
        <div class="modal-header">
          <h2>Edit Channel</h2>
          <button class="modal-close" onclick="Channels.closeModal()">✕</button>
        </div>
        <div class="modal-body">
          <div class="input-group">
            <label>Channel Type</label>
            <select id="edit-ch-type" class="input-field">
              ${Object.entries(TYPE_LABELS).map(([val, label]) => `<option value="${val}" ${channel.type === val ? 'selected' : ''}>${TYPE_ICONS[val]} ${label}</option>`).join('')}
            </select>
          </div>
          <div class="input-group">
            <label>Channel Name *</label>
            <input id="edit-ch-name" class="input-field" value="${channel.name}" />
            <div id="edit-ch-name-err" class="form-error"></div>
          </div>
          <div class="input-group">
            <label>Description</label>
            <input id="edit-ch-desc" class="input-field" value="${channel.description || ''}" />
          </div>
        </div>
        <div class="modal-footer" style="justify-content: space-between">
          <button class="btn btn-danger" onclick="Channels.deleteChannel('${spaceId}','${channelId}','${channel.name.replace(/'/g, "\\'")}')">Delete Channel</button>
          <div style="display:flex; gap:var(--space-2)">
            <button class="btn btn-secondary" onclick="Channels.closeModal()">Cancel</button>
            <button class="btn btn-primary" onclick="Channels.update('${spaceId}','${channelId}')">Save Changes</button>
          </div>
        </div>
      </div>`;
    overlay.classList.remove('hidden');
  };

  const update = async (spaceId, channelId) => {
    const name = document.getElementById('edit-ch-name')?.value.trim();
    const type = document.getElementById('edit-ch-type')?.value;
    const description = document.getElementById('edit-ch-desc')?.value.trim();
    const errEl = document.getElementById('edit-ch-name-err');
    const btn = document.querySelector('.modal-footer .btn-primary');

    if (!name) { if (errEl) errEl.textContent = 'Channel name is required.'; return; }

    try {
      if (btn) { btn.disabled = true; btn.textContent = 'Saving...'; }
      const { error } = await Store.channels.update(channelId, spaceId, { name, type, description });
      if (error) throw error;

      closeModal();
      // Force refresh sidebar
      const currentChId = new URLSearchParams(window.location.hash.split('?')[1]).get('channelId') || channelId;
      App.navigate('workspace', { spaceId, channelId: currentChId });
    } catch (e) {
      console.error('Channels: Update error:', e);
      if (errEl) errEl.textContent = e.message || 'Failed to update channel.';
      if (btn) { btn.disabled = false; btn.textContent = 'Save Changes'; }
    }
  };

  const deleteChannel = async (spaceId, channelId, name) => {
    if (!confirm(`Are you sure you want to delete #${name}?\nAll messages in this channel will be permanently removed.`)) return;

    try {
      const success = await Store.channels.delete(channelId, spaceId);
      if (!success) throw new Error('Failed to delete channel');

      closeModal();
      // Navigate to home or first available channel
      App.navigate('workspace', { spaceId });
    } catch (e) {
      alert(e.message);
    }
  };

  return { renderList, showCreateModal, closeModal, create, joinVoiceVideo, leaveAndClose, showEditModal, update, deleteChannel, TYPE_ICONS, TYPE_LABELS };
})();
