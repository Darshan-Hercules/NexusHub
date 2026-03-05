/**
 * messages.js – Messaging logic with Supabase Realtime
 */
const Messages = (() => {
    let currentChannelId = null;
    let searchQuery = '';
    let subscription = null;

    const getActiveChannel = () => currentChannelId;

    const setChannel = async (channelId) => {
        // Subscribe to new messages for this channel
        if (subscription) {
            supabase.removeChannel(subscription);
        }

        currentChannelId = channelId;
        searchQuery = '';

        subscription = supabase.channel(`channel-${channelId}`)
            .on('postgres_changes', {
                event: '*',
                schema: 'public',
                table: 'messages',
                filter: `channel_id=eq.${channelId}`
            }, async (payload) => {
                const user = Auth.current();

                if (payload.eventType === 'INSERT') {
                    const msg = payload.new;
                    if (document.getElementById(`msg-${msg.id}`)) return;

                    try {
                        const { data: profile, error } = await supabase.from('profiles').select('*').eq('id', msg.author_id).single();
                        if (error) throw error;

                        const profileData = Array.isArray(profile) ? profile[0] : profile;
                        const msgWithProfile = { ...msg, profiles: profileData };

                        const feed = document.getElementById('msg-feed');
                        if (feed) {
                            const lastMsgs = await Store.messages.forChannel(channelId);
                            const lastMsg = lastMsgs[lastMsgs.length - 2];

                            let showHeader = !lastMsg || lastMsg.author_id !== msg.author_id;
                            if (!showHeader && lastMsg) {
                                const timeGap = new Date(msg.created_at) - new Date(lastMsg.created_at);
                                if (timeGap > 5 * 60 * 1000) showHeader = true;
                            }

                            feed.insertAdjacentHTML('beforeend', renderMessage(msgWithProfile, profileData, showHeader, user?.id));
                            scrollToBottom();
                        }
                    } catch (err) {
                        console.error('Messages: Error processing real-time message:', err);
                    }
                }
                else if (payload.eventType === 'UPDATE') {
                    const msg = payload.new;
                    const el = document.getElementById(`msg-${msg.id}`);
                    if (el && msg.metadata?.is_deleted) {
                        const textEl = el.querySelector('.message-text');
                        const actionsEl = el.querySelector('.message-actions');
                        if (textEl) textEl.innerHTML = '<i style="color:var(--text-muted);opacity:0.7">This message was deleted</i>';
                        if (actionsEl) actionsEl.remove();
                        el.classList.add('deleted-message');
                    }
                }
                else if (payload.eventType === 'DELETE') {
                    const msgId = payload.old.id;
                    const el = document.getElementById(`msg-${msgId}`);
                    if (el) {
                        el.style.opacity = '0';
                        el.style.transform = 'translateY(10px) scale(0.95)';
                        setTimeout(() => el.remove(), 300);
                    }
                }
            })
            .subscribe();
    };

    const avatarHtml = (user, size = 36) => {
        const color = user ? user.color : '#7c6ff7';
        const initials = user ? Store.users.initials(user.display_name) : '?';
        return `
            <div class="message-avatar" style="width:${size}px;height:${size}px;background:${color}">
                ${user?.avatar_url
                ? `<img src="${user.avatar_url}" alt="Avatar" class="avatar-img" 
                        onerror="this.style.display='none'; this.nextElementSibling.style.display='flex'">
                   <span class="avatar-initials" style="display:none">${initials}</span>`
                : `<span class="avatar-initials">${initials}</span>`}
            </div>
        `;
    };

    const renderMessage = (msg, user, showHeader, currentUserId) => {
        const isDeleted = msg.metadata?.is_deleted;
        const content = isDeleted
            ? '<i style="color:var(--text-muted);opacity:0.7">This message was deleted</i>'
            : (msg.content || '').replace(/@([A-Za-z0-9 _]+)/g, (match, name) => `<span class="mention">${match}</span>`);

        const isAuthor = msg.author_id === currentUserId;

        return `
      <div class="message-item ${isDeleted ? 'deleted-message' : ''}" id="msg-${msg.id}">
        ${showHeader ? avatarHtml(user) : `<div style="width:36px;flex-shrink:0"></div>`}
        <div class="message-content">
          ${showHeader ? `<div class="message-header">
            <span class="message-author" style="color:${user?.color || '#7c6ff7'}">${user?.display_name || 'Unknown'}</span>
            <span class="message-time">${Store.formatTime(msg.created_at)}</span>
          </div>` : ''}
          <div class="message-text">${content}</div>
        </div>
        ${!isDeleted ? `
        <div class="message-actions">
          ${isAuthor ? `<button class="btn btn-ghost btn-icon" title="Delete Message" onclick="Messages.deleteMessage('${msg.id}')">🗑️</button>` : ''}
          <button class="btn btn-ghost btn-icon" title="React" style="font-size:0.85rem">😊</button>
        </div>` : ''}
      </div>`;
    };

    const renderFeed = async (channelId) => {
        const user = Auth.current();
        const msgs = searchQuery
            ? await Store.messages.search(channelId, searchQuery)
            : await Store.messages.forChannel(channelId);

        if (msgs.length === 0) {
            const ch = await Store.channels.find(channelId);
            return `
        <div class="channel-welcome">
          <div class="channel-welcome-icon">${ch?.type === 'discussion' ? '💬' : ch?.type === 'announcement' ? '📢' : ch?.type === 'task' ? '✅' : '❓'}</div>
          <h2># ${ch?.name || 'channel'}</h2>
          <p>${ch?.description || 'This is the beginning of this channel.'}</p>
        </div>
        <div id="msg-feed"></div>`;
        }

        const ch = await Store.channels.find(channelId);
        let html = '';
        let lastDate = '';
        let lastAuthorId = '';
        let lastMsgTime = 0;

        msgs.forEach((msg, i) => {
            const msgTime = new Date(msg.created_at).getTime();
            const date = new Date(msgTime).toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' });

            if (date !== lastDate) {
                html += `<div class="messages-day-label">${date}</div>`;
                lastDate = date;
                lastAuthorId = '';
                lastMsgTime = 0;
            }

            // SHOW HEADER IF:
            // 1. Different author
            // 2. Same author but > 5 mins gap
            let showHeader = msg.author_id !== lastAuthorId;
            if (!showHeader && lastMsgTime > 0) {
                if (msgTime - lastMsgTime > 5 * 60 * 1000) showHeader = true;
            }

            const profile = Array.isArray(msg.profiles) ? msg.profiles[0] : msg.profiles;
            html += renderMessage(msg, profile, showHeader, user?.id);

            lastAuthorId = msg.author_id;
            lastMsgTime = msgTime;
        });
        return `<div class="channel-welcome" style="padding-bottom:var(--space-4)">
      <h2 style="font-size:var(--text-xl)">
        ${Store.channels.typeIcon(ch?.type)} ${ch?.name}
      </h2>
      <p style="font-size:var(--text-sm);color:var(--text-muted)">${ch?.description || ''}</p>
    </div>
    <div id="msg-feed">${html}</div>`;
    };

    const send = async (channelId, content) => {
        const user = Auth.current();
        if (!user || !content.trim()) return;

        const msg = await Store.messages.create({
            channelId,
            authorId: user.id,
            content: content.trim()
        });

        if (msg) {
            scrollToBottom();
            return msg;
        }
    };

    const scrollToBottom = () => {
        const area = document.getElementById('messages-area');
        if (area) {
            // Use requestAnimationFrame or setTimeout to ensure DOM is updated
            requestAnimationFrame(() => {
                area.scrollTop = area.scrollHeight;
            });
        }
    };

    const search = async (query) => {
        searchQuery = query;
        const area = document.getElementById('messages-area');
        if (area && currentChannelId) {
            area.innerHTML = await renderFeed(currentChannelId);
            if (!query) scrollToBottom();
        }
    };

    const EMOJIS = [
        '😊', '😂', '🤣', '❤️', '👍', '🙏', '🔥', '✨', '🚀', '⭐',
        '💡', '🎉', '✅', '❌', '👀', '💯', '🤔', '🙌', '😎', '🍕',
        '💻', '🌈', '⚡', '🌊', '🎨', '🍕', '☕', '🍔', '🍟', '🍦',
        '🎈', '🎁', '🎂', '🎊', '🔔', '🚩', '🏠', '🌆', '🌍', '👽'
    ];

    const toggleEmojiPicker = (btn) => {
        let picker = btn.parentElement.querySelector('.emoji-picker');
        if (!picker) {
            picker = document.createElement('div');
            picker.className = 'emoji-picker';
            picker.innerHTML = `
                <div class="emoji-picker-header">Select an Emoji</div>
                <div class="emoji-grid">
                    ${EMOJIS.map(e => `<button type="button" class="emoji-item" onclick="Messages.insertEmoji('${e}', this)">${e}</button>`).join('')}
                </div>
            `;
            btn.parentElement.appendChild(picker);

            // Handle closing when clicking outside
            const closeHandler = (e) => {
                if (!picker.contains(e.target) && e.target !== btn) {
                    picker.classList.remove('active');
                    document.removeEventListener('click', closeHandler);
                }
            };
            document.addEventListener('click', closeHandler);
        }
        picker.classList.toggle('active');
    };

    const insertEmoji = (emoji, btn) => {
        const input = document.getElementById('msg-input');
        if (input) {
            const start = input.selectionStart;
            const end = input.selectionEnd;
            const text = input.value;
            input.value = text.substring(0, start) + emoji + text.substring(end);
            input.focus();
            const newPos = start + emoji.length;
            input.setSelectionRange(newPos, newPos);

            // Auto-resize input
            input.style.height = 'auto';
            input.style.height = (input.scrollHeight) + 'px';
        }
        // Optional: close picker after select
        const picker = btn.closest('.emoji-picker');
        if (picker) picker.classList.remove('active');
    };

    const deleteMessage = async (msgId) => {
        // Create a simple custom menu/modal instead of standard confirm
        const overlay = document.getElementById('modal-overlay');
        if (!overlay) return;

        overlay.innerHTML = `
            <div class="modal" style="max-width:320px; text-align:center">
                <div class="modal-header">
                    <h2 style="font-size:var(--text-lg)">Delete Message?</h2>
                </div>
                <div class="modal-body" style="gap:var(--space-2)">
                    <button class="btn btn-secondary btn-block" id="del-me">Delete for me</button>
                    <button class="btn btn-danger btn-block" id="del-everyone">Delete for everyone</button>
                    <button class="btn btn-ghost btn-block" onclick="Messages.closeDeleteModal()">Cancel</button>
                </div>
            </div>
        `;
        overlay.classList.remove('hidden');

        document.getElementById('del-me').onclick = () => {
            const el = document.getElementById(`msg-${msgId}`);
            if (el) {
                el.style.opacity = '0';
                el.style.height = '0';
                el.style.margin = '0';
                el.style.padding = '0';
                setTimeout(() => el.remove(), 300);
            }
            Notifications.showToast('Message hidden for you', 'success');
            closeDeleteModal();
        };

        document.getElementById('del-everyone').onclick = async () => {
            const success = await Store.messages.delete(msgId);
            if (success) {
                // Deleted for everyone
            } else {
                console.error('Messages: Failed to delete message');
            }
            closeDeleteModal();
        };
    };

    const closeDeleteModal = () => {
        const overlay = document.getElementById('modal-overlay');
        if (overlay) {
            overlay.classList.add('hidden');
            overlay.innerHTML = '';
        }
    };

    return { setChannel, renderFeed, send, search, scrollToBottom, avatarHtml, toggleEmojiPicker, insertEmoji, deleteMessage, closeDeleteModal, getActiveChannel };
})();
