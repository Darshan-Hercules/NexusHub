/**
 * spaces.js – Server management with Supabase (Discord-style)
 */
const Spaces = (() => {
  const SPACE_COLORS = ['#7c6ff7', '#f472b6', '#60a5fa', '#4ade80', '#fbbf24', '#f87171', '#a78bfa', '#34d399'];
  const SPACE_ICONS = ['🚀', '💡', '🔬', '📚', '🎯', '💎', '⚡', '🌊', '🔥', '🏗️'];

  const ROLE_BADGE = {
    admin: { cls: 'badge-purple', label: 'Admin' },
    moderator: { cls: 'badge-gold', label: 'Moderator' },
    member: { cls: 'badge-blue', label: 'Member' },
  };

  const renderSpaceIcons = async (activeSpaceId) => {
    const user = Auth.current();
    if (!user) return '';
    const userSpaces = await Store.spaces.forUser(user.id);
    return `
      <div class="space-icon-btn home-btn ${!activeSpaceId ? 'active' : ''}"
           title="All Servers"
           onclick="App.navigate('home')">
        <span class="space-initial" style="font-size:1.2rem">🏠</span>
      </div>
      <div class="sidebar-divider"></div>
    ` + userSpaces.map(s => `
      <div class="space-icon-btn ${s.id === activeSpaceId ? 'active' : ''}"
           id="space-btn-${s.id}"
           title="${s.name}"
           onclick="App.navigate('workspace',{spaceId:'${s.id}'})">
        <span class="space-initial">${s.icon || s.name[0].toUpperCase()}</span>
      </div>
    `).join('') + `
      <div class="sidebar-divider"></div>
      <div class="add-space-btn" title="Add or join server" onclick="Spaces.showAddModal()">+</div>
    `;
  };

  const showCreateModal = () => {
    const iconOptions = SPACE_ICONS.map(i => `<button type="button" class="icon-pick-btn btn btn-ghost" style="font-size:1.4rem;padding:4px 8px;border-radius:var(--radius-sm);transition:all 0.2s" onclick="document.querySelectorAll('.icon-pick-btn').forEach(b=>b.style.background='');this.style.background='var(--bg-active)';document.getElementById('space-icon-val').value='${i}'">${i}</button>`).join('');
    const colorOptions = SPACE_COLORS.map(c => `<button type="button" class="color-pick-btn btn" style="width:28px;height:28px;padding:0;border-radius:50%;background:${c};border:3px solid transparent;transition:all 0.2s" onclick="document.querySelectorAll('.color-pick-btn').forEach(b=>b.style.borderColor='transparent');this.style.borderColor='white';document.getElementById('space-color-val').value='${c}'"></button>`).join('');

    const overlay = document.getElementById('modal-overlay');
    overlay.innerHTML = `
      <div class="modal">
        <div class="modal-header">
          <h2>Create a Server</h2>
          <button class="modal-close" onclick="Spaces.closeModal()">✕</button>
        </div>
        <div class="modal-body">
          <div class="input-group">
            <label>Server Name *</label>
            <input id="space-name" class="input-field" placeholder="e.g. My Community, Study Group..." />
            <div id="space-name-err" class="form-error"></div>
          </div>
          <div class="input-group">
            <label>Description</label>
            <textarea id="space-desc" class="input-field" placeholder="What is this server for?"></textarea>
          </div>
          <div class="input-group">
            <label>Choose an Icon</label>
            <input type="hidden" id="space-icon-val" value="🚀" />
            <div style="display:flex;flex-wrap:wrap;gap:4px">${iconOptions}</div>
          </div>
          <div class="input-group">
            <label>Color</label>
            <input type="hidden" id="space-color-val" value="#7c6ff7" />
            <div style="display:flex;gap:var(--space-2)">${colorOptions}</div>
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn btn-secondary" onclick="Spaces.closeModal()">Cancel</button>
          <button class="btn btn-primary" onclick="Spaces.create()">Create Server</button>
        </div>
      </div>`;
    overlay.classList.remove('hidden');
    document.getElementById('space-name')?.focus();
  };

  const showJoinModal = () => {
    const overlay = document.getElementById('modal-overlay');
    overlay.innerHTML = `
      <div class="modal">
        <div class="modal-header">
          <h2>Join a Server</h2>
          <button class="modal-close" onclick="Spaces.closeModal()">✕</button>
        </div>
        <div class="modal-body">
          <p style="color:var(--text-secondary);font-size:var(--text-sm)">Enter an invite code shared by a server admin.</p>
          <div class="input-group">
            <label>Invite Code *</label>
            <input id="invite-code" class="input-field" placeholder="e.g. ALPHA-2025" style="text-transform:uppercase;font-family:monospace;font-size:1.1rem;letter-spacing:0.1em" />
            <div id="invite-err" class="form-error"></div>
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn btn-secondary" onclick="Spaces.closeModal()">Cancel</button>
          <button class="btn btn-primary" onclick="Spaces.join()">Join Server</button>
        </div>
      </div>`;
    overlay.classList.remove('hidden');
    document.getElementById('invite-code')?.focus();
  };

  const showAddModal = () => {
    const overlay = document.getElementById('modal-overlay');
    overlay.innerHTML = `
      <div class="modal">
        <div class="modal-header">
          <h2>Add a Server</h2>
          <button class="modal-close" onclick="Spaces.closeModal()">✕</button>
        </div>
        <div class="modal-body" style="gap:var(--space-3)">
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:var(--space-4)">
            <button onclick="Spaces.showCreateModal()" style="background:var(--bg-hover);border:1px solid var(--border);border-radius:var(--radius-lg);padding:var(--space-5);cursor:pointer;transition:all 0.2s;text-align:left;color:var(--text-primary)"
              onmouseover="this.style.borderColor='var(--accent)'" onmouseout="this.style.borderColor='var(--border)'">
              <div style="font-size:2rem;margin-bottom:var(--space-2)">🏗️</div>
              <div style="font-weight:700;margin-bottom:4px">Create new</div>
              <div style="font-size:var(--text-xs);color:var(--text-secondary)">Start a fresh server for your community</div>
            </button>
            <button onclick="Spaces.showJoinModal()" style="background:var(--bg-hover);border:1px solid var(--border);border-radius:var(--radius-lg);padding:var(--space-5);cursor:pointer;transition:all 0.2s;text-align:left;color:var(--text-primary)"
              onmouseover="this.style.borderColor='var(--accent)'" onmouseout="this.style.borderColor='var(--border)'">
              <div style="font-size:2rem;margin-bottom:var(--space-2)">🔗</div>
              <div style="font-weight:700;margin-bottom:4px">Join with code</div>
              <div style="font-size:var(--text-xs);color:var(--text-secondary)">Enter an invite code</div>
            </button>
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn btn-secondary" onclick="Spaces.closeModal()">Cancel</button>
        </div>
      </div>`;
    overlay.classList.remove('hidden');
  };

  const closeModal = () => {
    const overlay = document.getElementById('modal-overlay');
    overlay.classList.add('hidden');
    overlay.innerHTML = '';
  };

  const create = async () => {
    const user = Auth.current();
    const name = document.getElementById('space-name')?.value.trim();
    const errEl = document.getElementById('space-name-err');
    const btn = document.querySelector('.modal-footer .btn-primary');

    if (!name) { if (errEl) errEl.textContent = 'Server name is required.'; return; }
    if (!user) { if (errEl) errEl.textContent = 'Session lost. Please login again.'; return; }

    try {
      if (btn) {
        btn.disabled = true;
        btn.textContent = 'Creating...';
      }

      const desc = document.getElementById('space-desc')?.value.trim() || '';
      const icon = document.getElementById('space-icon-val')?.value || '🚀';
      const color = document.getElementById('space-color-val')?.value || '#7c6ff7';

      console.log('Spaces: Starting creation flow for', name);
      const space = await Store.spaces.create({
        name,
        description: desc,
        icon,
        color,
        ownerId: user.id,
      });

      if (!space) {
        throw new Error('Database rejected server creation. Check profile or connection.');
      }

      console.log('Spaces: Server created successfully:', space.id);

      // Create 'general' channel FIRST (blocking) so the user lands on a ready server
      try {
        await Store.channels.create({
          spaceId: space.id,
          name: 'general',
          type: 'discussion',
          description: 'General discussion',
          createdBy: user.id
        });
      } catch (genErr) {
        console.warn('Spaces: Failed to create general channel', genErr);
      }

      // Close modal and navigate
      closeModal();
      delete document.body.dataset.currentSpaceId;
      App.navigate('workspace', { spaceId: space.id });

      // Create remaining channels in the background
      const otherChannels = [
        { name: 'announcements', type: 'announcement' },
        { name: 'task-updates', type: 'task' },
        { name: 'q-and-a', type: 'qa' },
        { name: 'voice-chat', type: 'voice' },
      ];

      (async () => {
        for (const ch of otherChannels) {
          try {
            await Store.channels.create({
              spaceId: space.id,
              name: ch.name,
              type: ch.type,
              description: '',
              createdBy: user.id
            });
          } catch (chErr) {
            console.warn('Spaces: Failed to create default channel', ch.name, chErr);
          }
        }
        // Re-render to show all channels once they're all created
        console.log('Spaces: Background channels created, refreshing view');
        delete document.body.dataset.currentSpaceId;
        window.dispatchEvent(new HashChangeEvent('hashchange'));
      })();

    } catch (e) {
      console.error('Spaces: Create error:', e);
      if (errEl) errEl.textContent = e.message || 'An error occurred. Please try again.';
      if (btn) {
        btn.disabled = false;
        btn.textContent = 'Create Server';
      }
    }
  };

  const join = async () => {
    const user = Auth.current();
    const code = document.getElementById('invite-code')?.value.trim().toUpperCase();
    const errEl = document.getElementById('invite-err');
    if (!code) { if (errEl) errEl.textContent = 'Please enter an invite code.'; return; }

    const space = await Store.spaces.findByCode(code);
    if (!space) { if (errEl) errEl.textContent = 'Invalid invite code. Please check and try again.'; return; }

    const spaceMembers = await Store.spaces.members(space.id);
    if (spaceMembers.some(m => m.user_id === user.id)) {
      if (errEl) errEl.textContent = 'You are already a member of this server.'; return;
    }

    try {
      const btn = document.querySelector('.modal-footer .btn-primary');
      if (btn) {
        btn.disabled = true;
        btn.textContent = 'Joining...';
      }

      const success = await Store.spaces.join(space.id, user.id);
      if (!success) throw new Error('Failed to join server. Please try again.');

      closeModal();
      App.navigate('workspace', { spaceId: space.id });
    } catch (e) {
      console.error('Spaces: Join error:', e);
      if (errEl) errEl.textContent = e.message || 'Failed to join server.';
    } finally {
      const btn = document.querySelector('.modal-footer .btn-primary');
      if (btn) {
        btn.disabled = false;
        btn.textContent = 'Join Server';
      }
    }
  };

  const renderMemberWithRole = (m, isAdmin, currentUserId, spaceId) => {
    const u = m.profiles;
    if (!u) return '';
    const isCurrentUser = u.id === currentUserId;
    const isOwner = m.role === 'admin'; // can't change owner
    const badge = ROLE_BADGE[m.role] || ROLE_BADGE.member;

    let roleControl = '';
    if (isAdmin && !isCurrentUser) {
      roleControl = `
        <select class="role-dropdown" onchange="Spaces.changeRole('${spaceId}','${u.id}',this.value)" ${isOwner ? 'disabled' : ''}>
          <option value="member" ${m.role === 'member' ? 'selected' : ''}>Member</option>
          <option value="moderator" ${m.role === 'moderator' ? 'selected' : ''}>Moderator</option>
          <option value="admin" ${m.role === 'admin' ? 'selected' : ''}>Admin</option>
        </select>`;
    } else {
      roleControl = `<span class="badge ${badge.cls}">${badge.label}</span>`;
    }

    return `
      <div class="member-item" style="padding:var(--space-2) 0;border-bottom:1px solid var(--border);display:flex;align-items:center;gap:var(--space-3)">
        <div class="user-avatar-sm" style="width:32px;height:32px;background:${u.color}">
          ${u.avatar_url
        ? `<img src="${u.avatar_url}" alt="Avatar" class="avatar-img" onerror="this.style.display='none'; this.nextElementSibling.style.display='flex'">
               <span class="avatar-initials" style="display:none">${Store.users.initials(u.display_name)}</span>`
        : `<span class="avatar-initials">${Store.users.initials(u.display_name)}</span>`}
        </div>
        <div style="flex:1"><div style="font-size:var(--text-sm);font-weight:500">${u.display_name}</div><div style="font-size:var(--text-xs);color:var(--text-muted)">@${u.username}</div></div>
        ${roleControl}
        ${isAdmin && !isCurrentUser && !isOwner ? `<button class="btn btn-ghost btn-icon" title="Remove member" onclick="Spaces.kickMember('${spaceId}','${u.id}','${u.display_name}')" style="color:var(--danger);font-size:0.8rem">✕</button>` : ''}
      </div>`;
  };

  const showSettings = async (spaceId) => {
    const space = await Store.spaces.find(spaceId);
    if (!space) return;
    const members = await Store.spaces.members(spaceId);
    const currentUser = Auth.current();
    const currentMember = members.find(m => m.user_id === currentUser.id);
    const isAdmin = (currentMember && currentMember.role === 'admin') || space.owner_id === currentUser.id;
    const isMod = currentMember && currentMember.role === 'moderator';

    const overlay = document.getElementById('modal-overlay');
    overlay.innerHTML = `
      <div class="modal" style="max-width:520px">
        <div class="modal-header">
          <h2 id="settings-title">${space.icon} ${space.name}</h2>
          <button class="modal-close" onclick="Spaces.closeModal()">✕</button>
        </div>
        <div id="settings-content" class="modal-body">
          <div>
            <div style="font-size:var(--text-xs);color:var(--text-muted);margin-bottom:var(--space-2);text-transform:uppercase;letter-spacing:0.05em">Invite Code</div>
            <div class="invite-code-box">
              <span class="invite-code">${space.invite_code}</span>
              <button class="btn btn-secondary btn-sm" onclick="navigator.clipboard.writeText('${space.invite_code}')">Copy</button>
            </div>
          </div>

          <div>
            <div style="font-size:var(--text-xs);color:var(--text-muted);margin-bottom:var(--space-2);text-transform:uppercase;letter-spacing:0.05em">
              Members (${members.length}) ${isAdmin ? '· Role Management' : ''}
            </div>
            <div style="max-height:260px;overflow-y:auto;padding-right:4px">
              ${members.map(m => renderMemberWithRole(m, isAdmin, currentUser.id, spaceId)).join('')}
            </div>
          </div>

          ${isAdmin || isMod ? `
          <div style="margin-top:var(--space-2)">
            <div style="font-size:var(--text-xs);color:var(--text-muted);margin-bottom:var(--space-2);text-transform:uppercase;letter-spacing:0.05em">Server Info</div>
            <div style="font-size:var(--text-sm);color:var(--text-secondary)">
              Created ${Store.timeAgo(space.created_at)} · Code: <code style="background:var(--bg-active);padding:2px 6px;border-radius:4px;font-family:monospace">${space.invite_code}</code>
            </div>
          </div>` : ''}
        </div>
        <div class="modal-footer" id="settings-footer">
          ${isAdmin ? `<button class="btn btn-danger" onclick="Spaces.deleteServer('${spaceId}','${space.name.replace(/'/g, "\\'")}')">Delete Server</button>` : ''}
          ${isAdmin ? `<button class="btn btn-primary" onclick="Spaces.showEditForm('${spaceId}')">Edit Server</button>` : ''}
          <button class="btn btn-secondary" onclick="Spaces.closeModal()">Close</button>
        </div>
      </div>`;
    overlay.classList.remove('hidden');
  };

  const changeRole = async (spaceId, userId, newRole) => {
    try {
      await Store.spaces.updateMemberRole(spaceId, userId, newRole);
      // Re-render settings modal to reflect changes
      await showSettings(spaceId);
    } catch (e) {
      console.error('Spaces: Error changing role:', e);
    }
  };

  const kickMember = async (spaceId, userId, displayName) => {
    const overlay = document.getElementById('modal-overlay');
    overlay.innerHTML = `
      <div class="modal" style="max-width:360px;text-align:center">
        <div class="modal-header">
          <h2 style="font-size:var(--text-lg)">Remove Member</h2>
        </div>
        <div class="modal-body">
          <p style="color:var(--text-secondary)">Are you sure you want to remove <strong>${displayName}</strong> from this server?</p>
        </div>
        <div class="modal-footer" style="justify-content:center">
          <button class="btn btn-secondary" onclick="Spaces.showSettings('${spaceId}')">Cancel</button>
          <button class="btn btn-danger" onclick="Spaces.confirmKick('${spaceId}','${userId}')">Remove</button>
        </div>
      </div>`;
  };

  const confirmKick = async (spaceId, userId) => {
    await Store.spaces.removeMember(spaceId, userId);
    await showSettings(spaceId);
  };

  const showEditForm = async (spaceId) => {
    const space = await Store.spaces.find(spaceId);
    if (!space) return;

    const iconOptions = SPACE_ICONS.map(i => `
      <button type="button" class="icon-pick-btn btn btn-ghost ${space.icon === i ? 'active-icon' : ''}" 
              style="font-size:1.4rem;padding:4px 8px;border-radius:var(--radius-sm);transition:all 0.2s;${space.icon === i ? 'background:var(--bg-active)' : ''}" 
              onclick="document.querySelectorAll('.icon-pick-btn').forEach(b=>b.style.background='');this.style.background='var(--bg-active)';document.getElementById('edit-space-icon-val').value='${i}'">${i}</button>`).join('');

    const colorOptions = SPACE_COLORS.map(c => `
      <button type="button" class="color-pick-btn btn ${space.color === c ? 'active-color' : ''}" 
              style="width:28px;height:28px;padding:0;border-radius:50%;background:${c};border:3px solid ${space.color === c ? 'white' : 'transparent'};transition:all 0.2s" 
              onclick="document.querySelectorAll('.color-pick-btn').forEach(b=>b.style.borderColor='transparent');this.style.borderColor='white';document.getElementById('edit-space-color-val').value='${c}'"></button>`).join('');

    document.getElementById('settings-title').textContent = 'Edit Server Settings';
    document.getElementById('settings-content').innerHTML = `
      <div class="input-group">
        <label>Server Name</label>
        <input id="edit-space-name" class="input-field" value="${space.name}" />
      </div>
      <div class="input-group">
        <label>Description</label>
        <textarea id="edit-space-desc" class="input-field">${space.description || ''}</textarea>
      </div>
      <div class="input-group">
        <label>Choose an Icon</label>
        <input type="hidden" id="edit-space-icon-val" value="${space.icon}" />
        <div style="display:flex;flex-wrap:wrap;gap:4px">${iconOptions}</div>
      </div>
      <div class="input-group">
        <label>Color Theme</label>
        <input type="hidden" id="edit-space-color-val" value="${space.color}" />
        <div style="display:flex;gap:var(--space-2)">${colorOptions}</div>
      </div>
    `;

    document.getElementById('settings-footer').innerHTML = `
      <button class="btn btn-primary" onclick="Spaces.update('${spaceId}')">Save Changes</button>
      <button class="btn btn-secondary" onclick="Spaces.showSettings('${spaceId}')">Cancel</button>
    `;
  };

  const update = async (spaceId) => {
    const name = document.getElementById('edit-space-name').value.trim();
    const description = document.getElementById('edit-space-desc').value.trim();
    const icon = document.getElementById('edit-space-icon-val').value;
    const color = document.getElementById('edit-space-color-val').value;

    if (!name) {
      return;
    }

    try {
      const btn = document.querySelector('#settings-footer .btn-primary');
      btn.disabled = true;
      btn.textContent = 'Saving...';

      await Store.spaces.update(spaceId, { name, description, icon, color });

      closeModal();
      // Re-fetch and re-render current view to show changes
      window.dispatchEvent(new HashChangeEvent('hashchange'));
    } catch (e) {
      console.error('Spaces: Update error:', e);
      const btn = document.querySelector('#settings-footer .btn-primary');
      btn.disabled = false;
      btn.textContent = 'Save Changes';
    }
  };

  const deleteServer = async (spaceId, spaceName) => {
    const overlay = document.getElementById('modal-overlay');
    overlay.innerHTML = `
      <div class="modal" style="max-width:400px">
        <div class="modal-header">
          <h2 style="color:var(--accent-red)">⚠️ Delete Server</h2>
          <button class="modal-close" onclick="Spaces.closeModal()">✕</button>
        </div>
        <div class="modal-body">
          <p style="color:var(--text-secondary)">This will <strong>permanently delete</strong> the server <strong>${spaceName}</strong>, all its channels, messages, and tasks. This cannot be undone.</p>
          <div class="input-group">
            <label>Type the server name to confirm</label>
            <input id="delete-confirm-input" class="input-field" placeholder="${spaceName}" />
            <div id="delete-confirm-err" class="form-error"></div>
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn btn-secondary" onclick="Spaces.showSettings('${spaceId}')">Cancel</button>
          <button class="btn btn-danger" onclick="Spaces.confirmDelete('${spaceId}','${spaceName.replace(/'/g, "\\'")}')">Delete Forever</button>
        </div>
      </div>`;
  };

  const confirmDelete = async (spaceId, spaceName) => {
    const input = document.getElementById('delete-confirm-input')?.value.trim();
    const errEl = document.getElementById('delete-confirm-err');
    if (input !== spaceName) {
      if (errEl) errEl.textContent = 'Server name does not match. Please type it exactly.';
      return;
    }

    const btn = document.querySelector('.modal-footer .btn-danger');
    if (btn) { btn.disabled = true; btn.textContent = 'Deleting...'; }

    const user = Auth.current();
    const success = await Store.spaces.delete(spaceId, user?.id);
    if (success) {
      closeModal();
      delete document.body.dataset.currentSpaceId;
      App.navigate('home');
    } else {
      if (errEl) errEl.textContent = 'Failed to delete server. Try again.';
      if (btn) { btn.disabled = false; btn.textContent = 'Delete Forever'; }
    }
  };

  return { renderSpaceIcons, showAddModal, showCreateModal, showJoinModal, closeModal, create, join, showSettings, showEditForm, update, changeRole, kickMember, confirmKick, deleteServer, confirmDelete };
})();
