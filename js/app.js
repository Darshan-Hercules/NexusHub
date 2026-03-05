/**
 * app.js – SPA Router and View Renderer (Supabase Version)
 */
const App = (() => {
  let state = { view: 'login', params: {} };

  const init = () => {
    // Hide overlay just in case
    const overlay = document.getElementById('modal-overlay');
    if (overlay) overlay.classList.add('hidden');

    // Initialize Auth listeners
    Auth.init();

    // Handle hash change
    window.addEventListener('hashchange', () => {
      const hash = location.hash.slice(2); // remove #/
      const [view, ...parts] = hash.split('/');
      const params = {};
      if (view === 'workspace') {
        params.spaceId = parts[0];
        if (parts[1] === 'channel') params.channelId = parts[2];
      }

      state = { view: view || 'login', params };
      render();
    });

    // Reactive session updates
    window.addEventListener('nexus_user_updated', () => {
      console.log('App: Session updated, re-rendering...');
      render();
    });

    // Initial route
    window.dispatchEvent(new HashChangeEvent('hashchange'));
  };

  const navigate = (view, params = {}) => {
    console.log('App: Navigating to', view, params);

    let hash = `#/${view}`;
    if (view === 'workspace' && params.spaceId) {
      hash += `/${params.spaceId}`;
      if (params.channelId) hash += `/channel/${params.channelId}`;
    }

    // Always update state to ensure render() has latest params
    state = { view, params };

    if (location.hash !== hash) {
      console.log('App: Updating hash to', hash);
      location.hash = hash;
    } else {
      console.log('App: Hash identical, manual render');
      render();
    }
  };

  const render = async () => {
    console.log('App: Rendering...', state.view);
    const user = Auth.current();

    // Auth guards
    if (!user && state.view !== 'login' && state.view !== 'register') {
      location.hash = '#/login';
      return;
    }
    if (user && (state.view === 'login' || state.view === 'register')) {
      location.hash = '#/home';
      return;
    }

    try {
      const app = document.getElementById('app');

      let html = null;
      if (state.view === 'login') html = renderLogin();
      else if (state.view === 'register') html = renderRegister();
      else if (state.view === 'home') html = await renderHome(user);
      else if (state.view === 'workspace') html = await renderWorkspace(user, state.params);

      if (html !== null) {
        app.innerHTML = html;
      }

      bindEvents();
      if (user) {

      }
      console.log('App: Render finished.');
    } catch (e) {
      console.error('App: Render error:', e);
      const app = document.getElementById('app');
      if (app) {
        app.innerHTML = `
          <div class="empty-state" style="padding:var(--space-8)">
            <h2>Oops! Something went wrong.</h2>
            <p style="margin-bottom:var(--space-4)">We encountered an error while rendering this view.</p>
            <div style="display:flex;gap:var(--space-3);justify-content:center">
              <button class="btn btn-secondary" onclick="location.reload()">Retry</button>
              <button class="btn btn-primary" onclick="Auth.logout()">Reset Session</button>
            </div>
          </div>`;
      }
    }
  };

  // ── View Renderers ────────────────────────────────────
  const renderAvatar = (user, cls = 'user-avatar-sm') => {
    const initials = Store.users.initials(user?.display_name || '?');
    const color = user?.color || '#7c6ff7';
    if (user?.avatar_url) {
      return `
        <div class="${cls}" style="background:${color}">
          <img src="${user.avatar_url}" alt="Avatar" class="avatar-img" 
               onerror="this.style.display='none'; this.nextElementSibling.style.display='flex'">
          <span class="avatar-initials" style="display:none">${initials}</span>
        </div>`;
    }
    return `
      <div class="${cls}" style="background:${color}">
        <span class="avatar-initials">${initials}</span>
      </div>`;
  };

  const renderLogin = () => `
    <div class="auth-page">
      <div class="auth-card">
        <div class="auth-logo">NexusHub</div>
        <h1>Welcome Back</h1>
        <p>Login to your account to continue</p>
        <form id="login-form" onsubmit="event.preventDefault(); App.handleLogin()">
          <div class="input-group">
            <label>Email Address</label>
            <input type="email" id="login-email" class="input-field" placeholder="alex@example.com" required />
            <div id="login-email-err" class="form-error"></div>
          </div>
          <div class="input-group">
            <label>Password</label>
            <input type="password" id="login-password" class="input-field" placeholder="••••••••" required />
            <div id="login-pass-err" class="form-error"></div>
          </div>
          <button type="submit" class="btn btn-primary btn-block">Sign In</button>
        </form>
        <div class="auth-footer">
          Don't have an account? <a href="#/register">Register</a>
        </div>
      </div>
    </div>`;

  const renderRegister = () => `
    <div class="auth-page">
      <div class="auth-card">
        <div class="auth-logo">NexusHub</div>
        <h1>Create Account</h1>
        <p>Join NexusHub and start collaborating</p>
        <form id="register-form" onsubmit="event.preventDefault(); App.handleRegister()">
          <div class="input-group">
            <label>Display Name</label>
            <input type="text" id="reg-name" class="input-field" placeholder="Alex River" required />
          </div>
          <div class="input-group">
            <label>Username</label>
            <input type="text" id="reg-user" class="input-field" placeholder="alex_r" required />
          </div>
          <div class="input-group">
            <label>Email Address</label>
            <input type="email" id="reg-email" class="input-field" placeholder="alex@example.com" required />
            <div id="reg-email-err" class="form-error"></div>
          </div>
          <div class="input-group">
            <label>Password</label>
            <input type="password" id="reg-password" class="input-field" placeholder="••••••••" required />
          </div>
          <button type="submit" class="btn btn-primary btn-block">Create Account</button>
        </form>
        <div class="auth-footer">
          Already have an account? <a href="#/login">Login</a>
        </div>
      </div>
    </div>`;

  const renderHome = async (user) => {
    const userSpaces = await Store.spaces.forUser(user.id);
    const firstName = (user?.display_name || 'User').split(' ')[0];
    return `
      <div class="app-shell">
        <nav class="spaces-bar">
          <button class="header-profile-btn" onclick="Profile.toggle()">
            ${renderAvatar(user)}
          </button>
          <div class="sidebar-divider"></div>
          ${await Spaces.renderSpaceIcons()}
        </nav>
        <div class="app-main-layout">
          <div class="main-container flex-1 flex flex-col">
            <header class="app-header">
              <div class="header-left">
                <div class="app-logo">NexusHub</div>
              </div>
            </header>
            ${Profile.renderPanel(user)}
            <main class="home-content scrollable">
              <div class="home-hero">
                <h1>Welcome back, ${firstName}!</h1>
                <p>Select a server to start collaborating or create a new one.</p>
              </div>
              <div class="spaces-grid scale-up">
                ${userSpaces.map(s => `
                  <div class="space-card glass" onclick="App.navigate('workspace',{spaceId:'${s.id}'})">
                    <div class="space-card-icon" style="background:${s.color}22;color:${s.color}">${s.icon || '🚀'}</div>
                    <h3 class="space-card-name">${s.name}</h3>
                    <p class="space-card-desc">${s.description || 'No description'}</p>
                    <div class="space-card-meta">
                      <span>${s.member_count || 1} Members</span>
                    </div>
                  </div>
                `).join('')}
                <div class="create-space-card glass-dashed" onclick="Spaces.showAddModal()">
                  <div class="icon">+</div>
                  <span>Create Server</span>
                </div>
              </div>
            </main>
          </div>
        </div>
      </div>`;
  };

  const renderWorkspace = async (user, params) => {
    const space = await Store.spaces.find(params.spaceId);
    if (!space) { navigate('home'); return ''; }

    const spaceChannels = await Store.channels.forSpace(params.spaceId);
    let activeChannelId = params.channelId;
    if (!activeChannelId && spaceChannels.length > 0) {
      activeChannelId = spaceChannels[0].id;
      // Sync state.params so subsequent actions (like sending messages) have the ID
      state.params.channelId = activeChannelId;
    }

    const channel = spaceChannels.find(ch => ch.id === activeChannelId);
    const isTaskView = channel?.type === 'task';

    // OPTIMIZATION: If we are already in the same space, just update the channel area
    const currentWorkspaceSpaceId = document.body.dataset.currentSpaceId;
    if (currentWorkspaceSpaceId === params.spaceId) {
      console.log('App: Partial re-render (same space)');

      // Update sidebar active state & channel list
      const channelSections = document.querySelector('.channel-sections');
      if (channelSections) {
        channelSections.innerHTML = await Channels.renderList(params.spaceId, activeChannelId);
      } else {
        document.querySelectorAll('.channel-item, .voice-video-item').forEach(el => {
          el.classList.toggle('active', el.id === `ch-item-${activeChannelId}`);
        });
      }

      // Update header
      const titleEl = document.querySelector('.channel-topbar-title');
      if (titleEl) titleEl.textContent = channel?.name || 'select-channel';
      const iconEl = document.querySelector('.channel-type-icon');
      if (iconEl) iconEl.innerHTML = Store.channels.typeIcon(channel?.type);
      const descEl = document.querySelector('.channel-topbar-desc');
      if (descEl) {
        if (channel?.description) {
          descEl.textContent = channel.description;
          descEl.classList.remove('hidden');
        } else {
          descEl.classList.add('hidden');
        }
      }

      // Re-render main area
      const mainArea = document.getElementById('main-content');
      if (mainArea) {
        if (isTaskView) {
          mainArea.innerHTML = await Tasks.renderBoard(params.spaceId);
        } else {
          mainArea.innerHTML = `
            <div class="messages-area" id="messages-area">${await Messages.renderFeed(activeChannelId)}</div>
            <div class="message-composer">
              <div class="composer-box">
                <textarea id="msg-input" class="composer-textarea" placeholder="Message #${channel?.name || ''}" onkeydown="App.handleMessageKey(event)"></textarea>
                <div class="composer-actions-bar">
                  <div class="composer-tools">
                    <button class="composer-tool-btn">📎</button>
                    <button class="composer-tool-btn" onclick="Messages.toggleEmojiPicker(this)">😊</button>
                  </div>
                  <button class="composer-send-btn" onclick="App.handleSendMessage()">➤</button>
                </div>
              </div>
            </div>`;
        }
      }

      // Update chat background glow theme
      const chatBg = document.querySelector('.chat-bg-glow');
      if (chatBg) chatBg.className = `chat-bg-glow chat-theme-${channel?.type || 'discussion'}`;

      if (activeChannelId) await Messages.setChannel(activeChannelId);
      if (isTaskView) await Tasks.setSpace(params.spaceId);

      // Sync state params so other components (like Messages) know where we are
      state.params = { ...params, channelId: activeChannelId };

      bindEvents();
      return null; // Don't return HTML, we already updated the DOM
    }

    document.body.dataset.currentSpaceId = params.spaceId;

    if (activeChannelId) {
      await Messages.setChannel(activeChannelId);
    }
    if (isTaskView) {
      await Tasks.setSpace(params.spaceId);
    }

    return `
      <div class="app-shell">
        <nav class="spaces-bar">
          <button class="header-profile-btn" onclick="Profile.toggle()">
            ${renderAvatar(user)}
          </button>
          <div class="sidebar-divider"></div>
          ${await Spaces.renderSpaceIcons(params.spaceId)}
        </nav>
        <div class="app-main-layout">
          <aside class="channel-sidebar">
            <div class="channel-sidebar-header" onclick="Spaces.showSettings('${space.id}')">
              <h2 class="space-name">
                ${space.name} <span class="space-role-badge">Server</span>
              </h2>
            </div>
            <div class="channel-sections">
              ${await Channels.renderList(space.id, activeChannelId)}
            </div>
          </aside>
          <main class="main-content">
            <!-- Abstract Glow Shape Background -->
            <div class="chat-bg-glow chat-theme-${channel?.type || 'discussion'}">
              <div class="chat-glow-shape"></div>
              <div class="chat-glow-shape"></div>
              <div class="chat-glow-shape"></div>
              <div class="chat-glow-shape"></div>
            </div>
            <header class="channel-topbar">
              <div class="channel-topbar-left">
                <span class="channel-type-icon">${Store.channels.typeIcon(channel?.type)}</span>
                <h1 class="channel-topbar-title">${channel?.name || 'select-channel'}</h1>
                ${channel?.description ? `<div class="channel-topbar-desc">${channel.description}</div>` : ''}
              </div>
              <div class="topbar-actions">
                <div class="topbar-search">
                  <span class="topbar-search-icon">🔍</span>
                  <input type="text" id="msg-search" placeholder="Search..." oninput="Messages.search(this.value)" />
                </div>
              </div>
            </header>
            ${Profile.renderPanel(user)}
            
            <div class="flex-1 flex flex-col overflow-hidden" id="main-content">
              ${isTaskView
        ? await Tasks.renderBoard(params.spaceId)
        : `<div class="messages-area" id="messages-area">${await Messages.renderFeed(activeChannelId)}</div>
                     <div class="message-composer">
                       <div class="composer-box">
                         <textarea id="msg-input" class="composer-textarea" placeholder="Message #${channel?.name || ''}" onkeydown="App.handleMessageKey(event)"></textarea>
                         <div class="composer-actions-bar">
                           <div class="composer-tools">
                             <button class="composer-tool-btn">📎</button>
                             <button class="composer-tool-btn" onclick="Messages.toggleEmojiPicker(this)">😊</button>
                           </div>
                           <button class="composer-send-btn" onclick="App.handleSendMessage()">➤</button>
                         </div>
                       </div>
                     </div>`
      }
            </div>
          </main>
        </div>
      </div>`;
  };

  // ── Event Handlers ────────────────────────────────────

  const bindEvents = () => {
    const input = document.getElementById('msg-input');
    if (input) {
      input.focus();
      // Auto-resize
      input.addEventListener('input', () => {
        input.style.height = 'auto';
        input.style.height = (input.scrollHeight) + 'px';
      });
    }
    Messages.scrollToBottom();
  };

  const handleLogin = async () => {
    const email = document.getElementById('login-email').value;
    const password = document.getElementById('login-password').value;
    const btn = document.querySelector('#login-form button');

    try {
      btn.disabled = true;
      btn.textContent = 'Signing in...';

      const timeout = new Promise((_, reject) => setTimeout(() => reject('Login timed out'), 10000));
      const res = await Promise.race([Auth.login({ email, password }), timeout]);

      if (res.success) navigate('home');
      else {
        if (res.errors.email) document.getElementById('login-email-err').textContent = res.errors.email;
      }
    } catch (e) {
      console.error('App: Login error:', e);
      document.getElementById('login-email-err').textContent = 'Server busy. Please try again.';
    } finally {
      btn.disabled = false;
      btn.textContent = 'Sign In';
    }
  };

  const handleRegister = async () => {
    const displayName = document.getElementById('reg-name').value;
    const username = document.getElementById('reg-user').value;
    const email = document.getElementById('reg-email').value;
    const password = document.getElementById('reg-password').value;
    const btn = document.querySelector('#register-form button');

    try {
      btn.disabled = true;
      btn.textContent = 'Creating...';

      const timeout = new Promise((_, reject) => setTimeout(() => reject('Register timed out'), 10000));
      const res = await Promise.race([Auth.register({ displayName, username, email, password }), timeout]);

      if (res.success) {
        navigate('login');
      } else {
        if (res.errors.email) document.getElementById('reg-email-err').textContent = res.errors.email;
      }
    } catch (e) {
      console.error('App: Register error:', e);
      document.getElementById('reg-email-err').textContent = 'Registration failed. Try again.';
    } finally {
      btn.disabled = false;
      btn.textContent = 'Create Account';
    }
  };

  const handleSendMessage = async () => {
    const input = document.getElementById('msg-input');
    if (!input || !input.value.trim()) return;
    const content = input.value;
    input.value = '';
    input.style.height = 'auto';
    await Messages.send(state.params.channelId, content);
  };

  const handleMessageKey = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const syncUser = async () => {
    const user = Auth.current();
    if (!user) return;
    try {
      const { data: profile } = await supabase.from('profiles').select('*').eq('id', user.id).single();
      if (profile) {
        // DEFENSIVE: Don't overwrite a good local avatar_url with null/undefined from DB
        const finalAvatar = profile.avatar_url || user.avatar_url;
        const updatedUser = { ...user, ...profile, avatar_url: finalAvatar };
        Store.session.set(updatedUser);
        window.dispatchEvent(new CustomEvent('nexus_user_updated'));
      }
    } catch (e) {
      console.error('App: syncUser failed', e);
    }
  };

  return {
    init, navigate, handleLogin, handleRegister, handleSendMessage, handleMessageKey, syncUser, getState: () => state
  };
})();

// Bootstrap
App.init();
