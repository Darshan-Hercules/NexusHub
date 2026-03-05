/**
 * store.js – Supabase data layer
 * Models: profiles, spaces, channels, messages, tasks, notifications
 */

const Store = (() => {
  const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
  const now = () => new Date().toISOString();

  // ── Avatar colors ─────────────────────────────────────
  const AVATAR_COLORS = [
    '#7c6ff7', '#f472b6', '#60a5fa', '#4ade80', '#fbbf24',
    '#f87171', '#a78bfa', '#34d399', '#38bdf8', '#fb923c'
  ];
  const avatarColor = (name) => {
    let h = 0;
    if (name) {
      for (let c of name) h = (h * 31 + c.charCodeAt(0)) & 0xffffffff;
    }
    return AVATAR_COLORS[Math.abs(h) % AVATAR_COLORS.length];
  };
  const initials = (name) => (name || '?').split(' ').map(p => p[0]).join('').slice(0, 2).toUpperCase();

  // ── Session (keeping local session sync for UI) ──────────
  const session = {
    get: () => JSON.parse(localStorage.getItem('nexus_session') || 'null'),
    set: (user) => localStorage.setItem('nexus_session', JSON.stringify(user)),
    clear: () => localStorage.removeItem('nexus_session'),
  };

  // ── Users (Profiles) ───────────────────────────────────
  const users = {
    find: async (id) => {
      const { data } = await supabase.from('profiles').select('*').eq('id', id).single();
      return data;
    },
    avatarColor,
    initials,
  };

  // ── Cache ───────────────────────────────────────────
  const cache = {
    spaces: new Map(),
    channels: new Map(),
    userSpaces: new Map(),
    spaceChannels: new Map()
  };

  const clearCache = () => {
    Object.values(cache).forEach(m => m.clear());
  };

  // ── Spaces ────────────────────────────────────────────
  const spaces = {
    all: async () => {
      const { data } = await supabase.from('spaces').select('*');
      return data || [];
    },
    find: async (id) => {
      if (cache.spaces.has(id)) return cache.spaces.get(id);
      try {
        const query = supabase.from('spaces').select('*').eq('id', id).single();
        const timeout = new Promise((_, reject) => setTimeout(() => reject(new Error('Space fetch timed out (10s)')), 10000));
        const { data, error } = await Promise.race([query, timeout]);
        if (error) throw error;
        if (data) cache.spaces.set(id, data);
        return data;
      } catch (err) {
        console.error('Store: Error in spaces.find:', err);
        return null;
      }
    },
    findByCode: async (code) => {
      try {
        const query = supabase.from('spaces').select('*').eq('invite_code', code.toUpperCase()).single();
        const timeout = new Promise((_, reject) => setTimeout(() => reject(new Error('Invite code fetch timed out (10s)')), 10000));
        const { data, error } = await Promise.race([query, timeout]);
        if (error) throw error;
        return data;
      } catch (err) {
        console.error('Store: Error in spaces.findByCode:', err);
        return null;
      }
    },
    forUser: async (userId) => {
      if (cache.userSpaces.has(userId)) return cache.userSpaces.get(userId);
      console.log('Store: Fetching spaces for user...', userId);
      try {
        const query = (async () => {
          const { data: membership, error: memErr } = await supabase
            .from('space_members')
            .select('space_id')
            .eq('user_id', userId);
          if (memErr) throw memErr;
          return membership;
        })();

        const timeout = new Promise((_, reject) =>
          setTimeout(() => reject(new Error('Supabase query timed out (15s)')), 15000)
        );

        const membership = await Promise.race([query, timeout]);
        if (!membership || !membership.length) return [];

        const ids = membership.map(m => m.space_id);
        const { data: spaces, error: spErr } = await supabase
          .from('spaces')
          .select('*')
          .in('id', ids);

        if (spErr) throw spErr;
        const result = spaces || [];
        cache.userSpaces.set(userId, result);
        result.forEach(s => cache.spaces.set(s.id, s));
        return result;
      } catch (err) {
        console.error('Store: Error in forUser:', err);
        return [];
      }
    },
    create: async ({ name, description, icon, color, ownerId }) => {
      console.log(`Store: Attempting to create space "${name}" for owner ID: ${ownerId}`);
      try {
        const spaceId = crypto.randomUUID();
        const inviteCode = (name.slice(0, 4).toUpperCase().replace(/[^A-Z0-9]/g, '') || 'SPACE') + '-' + Math.random().toString(36).slice(2, 6).toUpperCase();

        const spaceData = {
          id: spaceId,
          name,
          description,
          icon: icon || '🚀',
          color: color || '#7c6ff7',
          invite_code: inviteCode,
          owner_id: ownerId
        };

        const spaceQuery = supabase
          .from('spaces')
          .insert([spaceData]);

        const timeout = new Promise((_, reject) => setTimeout(() => reject(new Error('Space insertion timed out (10s)')), 10000));
        const { error: spaceErr } = await Promise.race([spaceQuery, timeout]);

        if (spaceErr) {
          console.error('Store: CRITICAL ERROR inserting space:');
          console.dir(spaceErr);
          return null;
        }

        // Add owner to members
        const memQuery = supabase.from('space_members').insert([{ space_id: spaceId, user_id: ownerId, role: 'admin' }]);
        const { error: memErr } = await Promise.race([memQuery, timeout]);
        if (memErr) console.error('Store: Error adding owner to space_members details:', memErr);

        // Push the new space into the cache so it appears in the UI immediately
        cache.spaces.set(spaceId, spaceData);
        const existingUserSpaces = cache.userSpaces.get(ownerId) || [];
        cache.userSpaces.set(ownerId, [...existingUserSpaces, spaceData]);

        // Pre-populate empty channel cache to avoid network hit on first open
        cache.spaceChannels.set(spaceId, []);

        return spaceData;
      } catch (err) {
        console.error('Store: Internal error in spaces.create:', err);
        return null;
      }
    },
    join: async (spaceId, userId) => {
      cache.userSpaces.delete(userId);
      const { data, error } = await supabase.from('space_members').insert([{ space_id: spaceId, user_id: userId, role: 'member' }]);
      return !error;
    },
    members: async (spaceId) => {
      const { data } = await supabase.from('space_members').select('*, profiles(id, display_name, username, email, color, avatar_url)').eq('space_id', spaceId);
      return data || [];
    },
    update: async (spaceId, updates) => {
      console.log('Store: Updating space', spaceId, updates);
      const { data, error } = await supabase
        .from('spaces')
        .update(updates)
        .eq('id', spaceId)
        .select()
        .single();
      if (error) throw error;
      cache.spaces.set(spaceId, data);
      // Invalidate userSpaces cache for all members (simplified: just clear it)
      cache.userSpaces.clear();
      return data;
    },
    userRole: async (spaceId, userId) => {
      const { data } = await supabase.from('space_members').select('role').eq('space_id', spaceId).eq('user_id', userId).single();
      return data ? data.role : null;
    },
    memberCount: async (spaceId) => {
      const { count } = await supabase.from('space_members').select('*', { count: 'exact', head: true }).eq('space_id', spaceId);
      return count || 0;
    },
    channelCount: async (spaceId) => {
      const { count } = await supabase.from('channels').select('*', { count: 'exact', head: true }).eq('space_id', spaceId);
      return count || 0;
    },
    updateMemberRole: async (spaceId, userId, role) => {
      const { data, error } = await supabase
        .from('space_members')
        .update({ role })
        .eq('space_id', spaceId)
        .eq('user_id', userId)
        .select()
        .single();
      if (error) console.error('Store: Error updating member role:', error);
      return data;
    },
    removeMember: async (spaceId, userId) => {
      const { error } = await supabase
        .from('space_members')
        .delete()
        .eq('space_id', spaceId)
        .eq('user_id', userId);
      if (error) console.error('Store: Error removing member:', error);
      cache.userSpaces.delete(userId);
      return !error;
    },
    delete: async (spaceId, ownerId) => {
      const { error } = await supabase
        .from('spaces')
        .delete()
        .eq('id', spaceId);
      if (error) {
        console.error('Store: Error deleting space:', error);
        return false;
      }
      // Clean up caches
      cache.spaces.delete(spaceId);
      cache.spaceChannels.delete(spaceId);
      if (ownerId) {
        const existing = cache.userSpaces.get(ownerId);
        if (existing) {
          cache.userSpaces.set(ownerId, existing.filter(s => s.id !== spaceId));
        }
      }
      return true;
    },
  };

  // ── Channels ──────────────────────────────────────────
  const channels = {
    find: async (id) => {
      if (cache.channels.has(id)) return cache.channels.get(id);
      const { data } = await supabase.from('channels').select('*').eq('id', id).single();
      if (data) cache.channels.set(id, data);
      return data;
    },
    forSpace: async (spaceId) => {
      if (cache.spaceChannels.has(spaceId)) return cache.spaceChannels.get(spaceId);
      try {
        const query = supabase.from('channels').select('*').eq('space_id', spaceId).order('created_at', { ascending: true });
        const timeout = new Promise((_, reject) => setTimeout(() => reject(new Error('Channels fetch timed out (10s)')), 10000));
        const { data, error } = await Promise.race([query, timeout]);
        if (error) throw error;
        const result = data || [];
        cache.spaceChannels.set(spaceId, result);
        result.forEach(ch => cache.channels.set(ch.id, ch));
        return result;
      } catch (err) {
        console.error('Store: Error in channels.forSpace:', err);
        return [];
      }
    },
    create: async ({ spaceId, name, type, description, createdBy }) => {
      try {
        const payload = {
          space_id: spaceId,
          name: name.toLowerCase().replace(/\s+/g, '-'),
          type,
          description: description || '',
          created_by: createdBy
        };

        const query = supabase
          .from('channels')
          .insert([payload])
          .select()
          .single();

        const timeout = new Promise((_, reject) => setTimeout(() => reject(new Error('Channel creation timed out (10s)')), 10000));
        const { data, error } = await Promise.race([query, timeout]);

        if (error) return { data: null, error };

        // Update cache
        if (data) {
          cache.channels.set(data.id, data);
          const existing = cache.spaceChannels.get(spaceId) || [];
          if (!existing.find(c => c.id === data.id)) {
            cache.spaceChannels.set(spaceId, [...existing, data]);
          }
        }
        return { data, error: null };
      } catch (e) {
        return { data: null, error: e };
      }
    },
    update: async (channelId, spaceId, updates) => {
      const { data, error } = await supabase
        .from('channels')
        .update({
          name: updates.name?.toLowerCase().replace(/\s+/g, '-'),
          description: updates.description,
          type: updates.type
        })
        .eq('id', channelId)
        .select()
        .single();

      if (data) {
        cache.channels.set(channelId, data);
        const existing = cache.spaceChannels.get(spaceId) || [];
        cache.spaceChannels.set(spaceId, existing.map(c => c.id === channelId ? data : c));
      }
      return { data, error };
    },
    delete: async (channelId, spaceId) => {
      const { error } = await supabase.from('channels').delete().eq('id', channelId);
      if (!error) {
        cache.channels.delete(channelId);
        const existing = cache.spaceChannels.get(spaceId) || [];
        cache.spaceChannels.set(spaceId, existing.filter(c => c.id !== channelId));
      }
      return !error;
    },
    typeIcon: (type) => ({ discussion: '# ', announcement: '📢', task: '✅', qa: '❓', voice: '🔊', video: '📹' }[type] || '# '),
  };

  // ── Messages ──────────────────────────────────────────
  const messages = {
    forChannel: async (channelId) => {
      const { data } = await supabase.from('messages').select('*, profiles(id, display_name, username, color, avatar_url)').eq('channel_id', channelId).order('created_at', { ascending: true });
      return data || [];
    },
    create: async ({ channelId, authorId, content }) => {
      const { data, error } = await supabase
        .from('messages')
        .insert([{ channel_id: channelId, author_id: authorId, content }])
        .select('*, profiles(id, display_name, username, color, avatar_url)')
        .single();
      return data;
    },
    search: async (channelId, query) => {
      const { data } = await supabase.from('messages').select('*, profiles(id, display_name, username, color, avatar_url)').eq('channel_id', channelId).ilike('content', `%${query}%`);
      return data || [];
    },
    delete: async (id) => {
      const { error } = await supabase
        .from('messages')
        .update({
          content: '',
          metadata: { is_deleted: true }
        })
        .eq('id', id);
      if (error) console.error('Store: Error soft-deleting message:', error);
      return !error;
    },
  };

  // ── Tasks ─────────────────────────────────────────────
  const tasks = {
    find: async (id) => {
      const { data } = await supabase.from('tasks').select('*, profiles!assignee_id(id, display_name, username, color, avatar_url)').eq('id', id).single();
      return data;
    },
    forSpace: async (spaceId) => {
      const { data } = await supabase.from('tasks').select(`
        *,
        profiles:assignee_id (
          id, display_name, username, color, avatar_url
        )
      `).eq('space_id', spaceId);
      return data || [];
    },
    byStatus: async (spaceId, status) => {
      const { data } = await supabase.from('tasks').select(`
        *,
        profiles:assignee_id (
          id, display_name, username, color, avatar_url
        )
      `).eq('space_id', spaceId).eq('status', status);
      return data || [];
    },
    create: async (taskData) => {
      const { data, error } = await supabase
        .from('tasks')
        .insert([{
          space_id: taskData.spaceId,
          channel_id: taskData.channelId || null,
          title: taskData.title,
          description: taskData.description || '',
          assignee_id: taskData.assigneeId || null,
          priority: taskData.priority || 'medium',
          status: taskData.status || 'todo',
          due_date: taskData.dueDate && taskData.dueDate !== '' ? taskData.dueDate : null,
          created_by: taskData.createdBy
        }])
        .select(`
          *,
          profiles:assignee_id (
            id, display_name, username, color, avatar_url
          )
        `)
        .single();

      if (error) console.error('Store: Error creating task:', error);
      return { data, error };
    },
    updateStatus: async (id, status) => {
      const { data, error } = await supabase.from('tasks').update({ status }).eq('id', id).select().single();
      return data;
    },
    delete: async (id) => {
      const { error } = await supabase.from('tasks').delete().eq('id', id);
      if (error) console.error('Store: Error deleting task:', error);
      return !error;
    },
    dueBadgeClass: (dueDate) => {
      if (!dueDate) return '';
      const diff = (new Date(dueDate) - new Date()) / (1000 * 3600 * 24);
      if (diff < 0) return 'overdue';
      if (diff < 3) return 'soon';
      return 'ok';
    },
  };

  // ── Notifications ─────────────────────────────────────
  const notifications = {
    forUser: async (userId) => {
      const { data } = await supabase.from('notifications').select('*').eq('user_id', userId).order('created_at', { ascending: false });
      return data || [];
    },
    unreadCount: async (userId) => {
      const { count } = await supabase.from('notifications').select('*', { count: 'exact', head: true }).eq('user_id', userId).eq('read', false);
      return count || 0;
    },
    create: async ({ userId, type, title, body, spaceId, channelId }) => {
      const { data } = await supabase
        .from('notifications')
        .insert([{ user_id: userId, type, title, body, space_id: spaceId || null, channel_id: channelId || null, read: false }])
        .select()
        .single();
      return data;
    },
    markRead: async (id) => {
      await supabase.from('notifications').update({ read: true }).eq('id', id);
    },
    markAllRead: async (userId) => {
      await supabase.from('notifications').update({ read: true }).eq('user_id', userId).eq('read', false);
    },
    typeIcon: (type) => ({ mention: '@', task: '✅', announcement: '📢', system: '⚙️', message: '💬' }[type] || '🔔'),
    typeBg: (type) => ({ mention: 'var(--accent-glow)', task: '#4ade8022', announcement: '#fbbf2422', system: '#94a3b822', message: '#60a5fa22' }[type] || 'var(--bg-active)'),
    typeColor: (type) => ({ mention: 'var(--accent)', task: '#4ade80', announcement: '#fbbf24', system: '#94a3b8', message: '#60a5fa' }[type] || 'var(--text-primary)'),
  };

  // ── Presence (Real-time Voice/Video) ──────────────────
  const presence = {
    channels: new Map(), // channelId -> Supabase Realtime Channel

    joinVoice: async (channelId, userMetadata, onUpdate) => {
      // Cleanup any existing connection to this channel
      if (presence.channels.has(channelId)) {
        await presence.leaveVoice(channelId);
      }

      const room = supabase.channel(`voice:${channelId}`, {
        config: { presence: { key: userMetadata.id } }
      });

      // CRITICAL: Setup signaling listeners BEFORE subscribe to avoid missing initial offers
      webrtc.setupSignaling(room, channelId);

      room
        .on('presence', { event: 'sync' }, () => {
          const state = room.presenceState();
          const users = Object.values(state).map(matches => matches[0]);
          onUpdate(users);
        })
        .subscribe(async (status) => {
          if (status === 'SUBSCRIBED') {
            await room.track({
              id: userMetadata.id,
              name: userMetadata.display_name || userMetadata.username,
              avatar: userMetadata.avatar_url,
              color: userMetadata.color,
              muted: false,
              camera: false,
              joinedAt: new Date().toISOString()
            });
          }
        });

      presence.channels.set(channelId, room);
      return room;
    },

    updateState: async (channelId, newState) => {
      const room = presence.channels.get(channelId);
      if (room && Auth.current()) {
        const userId = Auth.current().id;
        const currentState = room.presenceState()[userId]?.[0] || {};
        await room.track({
          ...currentState,
          ...newState
        });
      }
    },

    leaveVoice: async (channelId) => {
      const room = presence.channels.get(channelId);
      if (room) {
        await room.unsubscribe();
        presence.channels.delete(channelId);
      }
      webrtc.cleanup();
    }
  };

  // ── WebRTC (Real-time Media) ──────────────────────────
  const webrtc = {
    localStream: null,
    peers: new Map(), // userId -> RTCPeerConnection
    onRemoteStream: null,

    init: async (streamType = 'voice') => {
      try {
        console.log('WebRTC: Capturing media...', streamType);
        const constraints = {
          audio: true,
          video: streamType === 'video'
        };
        webrtc.localStream = await navigator.mediaDevices.getUserMedia(constraints);
        console.log('WebRTC: Local stream captured');
        return webrtc.localStream;
      } catch (e) {
        console.error('WebRTC: Media capture failed:', e);
        throw e;
      }
    },

    setupSignaling: (room, channelId) => {
      console.log('WebRTC: Setting up signaling for channel', channelId);
      room.on('broadcast', { event: 'webrtc-signal' }, async ({ payload }) => {
        const { from, to, signal } = payload;
        if (to !== Auth.current()?.id) return;

        console.log(`WebRTC: Signal from ${from}: ${signal.type}`);

        if (signal.type === 'offer') {
          await webrtc.handleOffer(channelId, from, signal);
        } else if (signal.type === 'answer') {
          await webrtc.handleAnswer(from, signal);
        } else if (signal.type === 'candidate') {
          await webrtc.handleCandidate(from, signal);
        }
      });
    },

    createPeer: (channelId, userId) => {
      if (webrtc.peers.has(userId)) return webrtc.peers.get(userId);

      console.log('WebRTC: Creating peer for', userId);
      const pc = new RTCPeerConnection({
        iceServers: [{ urls: 'stun:stun.l.google.com:19302' }, { urls: 'stun:stun1.l.google.com:19302' }]
      });

      webrtc.peers.set(userId, pc);

      // Add local tracks
      if (webrtc.localStream) {
        webrtc.localStream.getTracks().forEach(track => pc.addTrack(track, webrtc.localStream));
      }

      pc.onicecandidate = (event) => {
        if (event.candidate) {
          webrtc.sendSignal(channelId, userId, { type: 'candidate', candidate: event.candidate });
        }
      };

      pc.ontrack = (event) => {
        console.log('WebRTC: Remote track from', userId, event.track.kind);
        if (webrtc.onRemoteStream) {
          webrtc.onRemoteStream(userId, event.streams[0]);
        }
      };

      pc.onconnectionstatechange = () => {
        console.log(`WebRTC: Peer ${userId} state: ${pc.connectionState}`);
        if (pc.connectionState === 'disconnected' || pc.connectionState === 'failed' || pc.connectionState === 'closed') {
          // Don't immediately delete, might be temporary
          // but if it's failed, we should cleanup
          if (pc.connectionState === 'failed') webrtc.closePeer(userId);
        }
      };

      return pc;
    },

    sendSignal: (channelId, to, signal) => {
      const room = presence.channels.get(channelId);
      if (room) {
        room.send({
          type: 'broadcast',
          event: 'webrtc-signal',
          payload: { from: Auth.current().id, to, signal }
        });
      }
    },

    startCall: async (channelId, userId) => {
      // Deterministic caller: Lower ID string is the caller
      if (Auth.current().id > userId) {
        console.log('WebRTC: Waiting for lower ID peer to initiate call', userId);
        return;
      }

      console.log('WebRTC: Initiating call to', userId);
      const pc = webrtc.createPeer(channelId, userId);
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      webrtc.sendSignal(channelId, userId, offer);
    },

    handleOffer: async (channelId, from, offer) => {
      const pc = webrtc.createPeer(channelId, from);
      await pc.setRemoteDescription(new RTCSessionDescription(offer));
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      webrtc.sendSignal(channelId, from, answer);
    },

    handleAnswer: async (from, answer) => {
      const pc = webrtc.peers.get(from);
      if (pc) {
        await pc.setRemoteDescription(new RTCSessionDescription(answer));
      }
    },

    handleCandidate: async (from, data) => {
      const pc = webrtc.peers.get(from);
      if (pc && data.candidate) {
        await pc.addIceCandidate(new RTCIceCandidate(data.candidate));
      }
    },

    closePeer: (userId) => {
      const pc = webrtc.peers.get(userId);
      if (pc) {
        pc.close();
        webrtc.peers.delete(userId);
      }
    },

    cleanup: () => {
      console.log('WebRTC: Cleaning up...');
      if (webrtc.localStream) {
        webrtc.localStream.getTracks().forEach(t => t.stop());
        webrtc.localStream = null;
      }
      webrtc.peers.forEach(pc => pc.close());
      webrtc.peers.clear();
    }
  };

  // ── Time formatting ───────────────────────────────────
  const timeAgo = (iso) => {
    const diff = Date.now() - new Date(iso).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'just now';
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    const days = Math.floor(hrs / 24);
    return `${days}d ago`;
  };

  const formatTime = (iso) => new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const formatDate = (iso) => new Date(iso).toLocaleDateString([], { month: 'short', day: 'numeric' });

  return { uid, now, session, users, spaces, channels, messages, tasks, notifications, presence, webrtc, timeAgo, formatTime, formatDate };
})();
