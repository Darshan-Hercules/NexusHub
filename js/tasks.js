/**
 * tasks.js – Task management & Kanban board with Supabase
 */
const Tasks = (() => {
  let draggedTaskId = null;
  let currentSpaceId = null;

  const COLUMNS = [
    { status: 'todo', label: 'To Do', color: '#60a5fa' },
    { status: 'in-progress', label: 'In Progress', color: '#fbbf24' },
    { status: 'done', label: 'Done', color: '#4ade80' },
  ];

  const setSpace = (spaceId) => { currentSpaceId = spaceId; };

  const avatarFor = (userId, profiles) => {
    const user = profiles?.find(u => u.id === userId);
    if (!user) return `<div class="task-card-assignee-avatar" style="background:#5c5c7a">?</div>`;
    return `
            <div class="task-card-assignee-avatar" style="background:${user.color}">
                ${user.avatar_url
        ? `<img src="${user.avatar_url}" alt="Avatar" class="avatar-img" 
                        onerror="this.style.display='none'; this.nextElementSibling.style.display='flex'">
                   <span class="avatar-initials" style="display:none">${Store.users.initials(user.display_name)}</span>`
        : `<span class="avatar-initials">${Store.users.initials(user.display_name)}</span>`}
            </div>
        `;
  };

  const taskCardHtml = (task) => {
    // Handle potential array or object for joined profiles
    const assignee = Array.isArray(task.profiles) ? task.profiles[0] : task.profiles;
    const dueCls = Store.tasks.dueBadgeClass(task.due_date);

    let dueLabel = '';
    if (task.due_date) {
      const d = new Date(task.due_date);
      if (!isNaN(d.getTime())) {
        dueLabel = d.toLocaleDateString([], { month: 'short', day: 'numeric' });
      }
    }

    return `
      <div class="task-card" draggable="true" id="task-${task.id}"
           ondragstart="Tasks.onDragStart(event,'${task.id}')"
           ondragend="Tasks.onDragEnd(event)"
           onclick="Tasks.openDetail('${task.id}')">
        <span class="task-priority-tag ${task.priority}">${task.priority}</span>
        <div class="task-card-title">${task.title}</div>
        ${task.description ? `<div class="task-card-desc">${task.description}</div>` : ''}
        <div class="task-card-meta">
          <div class="task-card-assignee">
            ${assignee ? `${avatarFor(assignee.id, [assignee])}<span>${assignee.display_name}</span>` : '<span style="color:var(--text-muted)">Unassigned</span>'}
          </div>
          ${dueLabel ? `<span class="task-due-badge ${dueCls}">📅 ${dueLabel}</span>` : ''}
        </div>
      </div>`;
  };

  const columnHtml = (col, tasks) => `
    <div class="task-column" id="col-${col.status}"
         ondragover="Tasks.onDragOver(event)"
         ondragleave="Tasks.onDragLeave(event)"
         ondrop="Tasks.onDrop(event,'${col.status}')">
      <div class="task-column-header">
        <div class="task-column-title">
          <span class="task-column-dot" style="background:${col.color}"></span>
          ${col.label}
        </div>
        <span class="task-column-count">${tasks.length}</span>
      </div>
      <div class="task-list" id="tasklist-${col.status}">
        ${tasks.map(t => taskCardHtml(t)).join('')}
      </div>
      <button class="add-task-btn" onclick="Tasks.showCreateModal('${col.status}')">+ Add task</button>
    </div>`;

  const renderBoard = async (spaceId) => {
    currentSpaceId = spaceId;
    const allTasks = await Store.tasks.forSpace(spaceId);

    const getByStatus = (s) => allTasks.filter(t => t.status === s);

    return `
      <div class="task-board-view">
        <div class="task-board-header">
          <h2 style="font-size:var(--text-xl);font-weight:700">📋 Task Board</h2>
          <button class="btn btn-primary btn-sm" onclick="Tasks.showCreateModal('todo')">+ New Task</button>
        </div>
        <div class="task-board">
          ${COLUMNS.map(col => columnHtml(col, getByStatus(col.status))).join('')}
        </div>
      </div>`;
  };

  const onDragStart = (e, taskId) => {
    draggedTaskId = taskId;
    setTimeout(() => { const el = document.getElementById(`task-${taskId}`); if (el) el.classList.add('dragging'); }, 0);
  };
  const onDragEnd = (e) => {
    document.querySelectorAll('.task-card.dragging').forEach(el => el.classList.remove('dragging'));
    document.querySelectorAll('.task-column.drag-over').forEach(el => el.classList.remove('drag-over'));
  };
  const onDragOver = (e) => {
    e.preventDefault();
    const col = e.currentTarget;
    if (col) col.classList.add('drag-over');
  };
  const onDragLeave = (e) => {
    const col = e.currentTarget;
    if (col) col.classList.remove('drag-over');
  };
  const onDrop = async (e, status) => {
    e.preventDefault();
    const col = e.currentTarget;
    if (col) col.classList.remove('drag-over');
    if (!draggedTaskId) return;
    const task = await Store.tasks.updateStatus(draggedTaskId, status);
    if (!task) return;
    draggedTaskId = null;

    // Refresh board (re-render current view or just the columns)
    // For simplicity, we'll re-navigate/re-render the whole workspace panel from app.js if possible, 
    // or just trigger re-re-render of columns.
    const container = document.getElementById('main-content');
    if (container) {
      container.innerHTML = await renderBoard(currentSpaceId);
    }
    Notifications.showToast(`Task moved to "${status}"`, 'success');
  };

  const showCreateModal = async (defaultStatus = 'todo') => {
    const user = Auth.current();
    if (!user) return;
    const spaceMembers = await Store.spaces.members(currentSpaceId);
    const memberOptions = spaceMembers.map(m => {
      const u = m.profiles;
      return u ? `<option value="${u.id}">${u.display_name}</option>` : '';
    }).join('');

    const overlay = document.getElementById('modal-overlay');
    overlay.innerHTML = `
      <div class="modal">
        <div class="modal-header">
          <h2>Create New Task</h2>
          <button class="modal-close" onclick="Tasks.closeModal()">✕</button>
        </div>
        <div class="modal-body">
          <div class="input-group">
            <label>Task Title *</label>
            <input id="task-title" class="input-field" placeholder="Enter task title..." />
            <div id="task-title-err" class="form-error"></div>
          </div>
          <div class="input-group">
            <label>Description</label>
            <textarea id="task-desc" class="input-field" placeholder="What needs to be done?"></textarea>
          </div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:var(--space-4)">
            <div class="input-group">
              <label>Assignee</label>
              <select id="task-assignee" class="input-field">
                <option value="">Unassigned</option>
                ${memberOptions}
              </select>
            </div>
            <div class="input-group">
              <label>Priority</label>
              <select id="task-priority" class="input-field">
                <option value="low">Low</option>
                <option value="medium" selected>Medium</option>
                <option value="high">High</option>
              </select>
            </div>
          </div>
          <div class="input-group">
            <label>Due Date</label>
            <input id="task-due" type="date" class="input-field" />
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn btn-secondary" onclick="Tasks.closeModal()">Cancel</button>
          <button class="btn btn-primary" onclick="Tasks.createTask('${defaultStatus}')">Create Task</button>
        </div>
      </div>`;
    overlay.classList.remove('hidden');
  };

  const closeModal = () => {
    const overlay = document.getElementById('modal-overlay');
    overlay.classList.add('hidden');
    overlay.innerHTML = '';
  };

  const createTask = async (status) => {
    const user = Auth.current();
    const title = document.getElementById('task-title')?.value.trim();
    const errEl = document.getElementById('task-title-err');
    if (!title) { if (errEl) errEl.textContent = 'Task title is required.'; return; }

    try {
      const { data: task, error } = await Store.tasks.create({
        spaceId: currentSpaceId,
        channelId: null,
        title,
        description: document.getElementById('task-desc')?.value.trim(),
        assigneeId: document.getElementById('task-assignee')?.value || null,
        priority: document.getElementById('task-priority')?.value || 'medium',
        status: status,
        dueDate: document.getElementById('task-due')?.value || '',
        createdBy: user.id,
      });

      if (task) {
        // Task created successfully
      } else {
        console.error('Tasks: Server error creating task:', error);
      }
    } catch (err) {
      console.error('Tasks: Exception in createTask:', err);
      Notifications.showToast('Something went wrong.', 'error');
    }

    closeModal();
    const container = document.getElementById('main-content');
    if (container) {
      container.innerHTML = await renderBoard(currentSpaceId);
    }
    Notifications.showToast('Task created!', 'success');
  };

  const openDetail = async (taskId) => {
    const task = await Store.tasks.find(taskId);
    if (!task) return;
    const assignee = task.assignee_id ? await Store.users.find(task.assignee_id) : null;
    const creator = await Store.users.find(task.created_by);
    const overlay = document.getElementById('modal-overlay');
    overlay.innerHTML = `
      <div class="modal" style="max-width:520px">
        <div class="modal-header">
          <h2 style="font-size:var(--text-lg)">${task.title}</h2>
          <button class="modal-close" onclick="Tasks.closeModal()">✕</button>
        </div>
        <div class="modal-body" style="gap:var(--space-3)">
          <div style="display:flex;gap:var(--space-3);flex-wrap:wrap">
            <span class="task-priority-tag ${task.priority}">${task.priority} priority</span>
            <span class="badge ${task.status === 'done' ? 'badge-green' : task.status === 'in-progress' ? 'badge-blue' : 'badge-purple'}">${task.status}</span>
          </div>
          ${task.description ? `<p style="color:var(--text-secondary);font-size:var(--text-sm);line-height:1.6">${task.description}</p>` : ''}
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:var(--space-4);font-size:var(--text-sm)">
            <div><div style="color:var(--text-muted);font-size:var(--text-xs);margin-bottom:4px">ASSIGNEE</div>
              ${assignee ? `<span style="color:${assignee.color};font-weight:600">${assignee.display_name}</span>` : '<span style="color:var(--text-muted)">Unassigned</span>'}
            </div>
            <div><div style="color:var(--text-muted);font-size:var(--text-xs);margin-bottom:4px">DUE DATE</div>
              ${task.due_date ? `<span>${new Date(task.due_date).toLocaleDateString([], { month: 'long', day: 'numeric', year: 'numeric' })}</span>` : '<span style="color:var(--text-muted)">No due date</span>'}
            </div>
            <div><div style="color:var(--text-muted);font-size:var(--text-xs);margin-bottom:4px">CREATED BY</div>
              <span>${creator?.display_name || 'Unknown'}</span>
            </div>
            <div><div style="color:var(--text-muted);font-size:var(--text-xs);margin-bottom:4px">CREATED</div>
              <span>${Store.timeAgo(task.created_at)}</span>
            </div>
          </div>
          <div>
            <div style="color:var(--text-muted);font-size:var(--text-xs);margin-bottom:var(--space-2)">MOVE TO</div>
            <div style="display:flex;gap:var(--space-2)">
              ${COLUMNS.filter(c => c.status !== task.status).map(c => `
                <button class="btn btn-secondary btn-sm" onclick="Tasks.moveTask('${task.id}','${c.status}')">${c.label}</button>
              `).join('')}
            </div>
          </div>
        </div>
        <div class="modal-footer" style="justify-content: space-between">
          <button class="btn btn-danger btn-sm" onclick="Tasks.deleteTask('${task.id}')">Delete Task</button>
          <button class="btn btn-secondary" onclick="Tasks.closeModal()">Close</button>
        </div>
      </div>`;
    overlay.classList.remove('hidden');
  };

  const moveTask = async (taskId, status) => {
    await Store.tasks.updateStatus(taskId, status);
    closeModal();
    const container = document.getElementById('main-content');
    if (container) {
      container.innerHTML = await renderBoard(currentSpaceId);
    }
    Notifications.showToast(`Task moved to "${status}"`, 'success');
  };

  const deleteTask = async (taskId) => {
    if (!confirm('Are you sure you want to delete this task?')) return;

    const success = await Store.tasks.delete(taskId);
    if (success) {
      const container = document.getElementById('main-content');
      if (container) container.innerHTML = await renderBoard(currentSpaceId);
    } else {
      console.error('Tasks: Failed to delete task');
    }
  };

  return { setSpace, renderBoard, onDragStart, onDragEnd, onDragOver, onDragLeave, onDrop, showCreateModal, closeModal, createTask, openDetail, moveTask, deleteTask };
})();
