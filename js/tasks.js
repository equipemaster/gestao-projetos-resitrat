
let currentTasks = [];
let projects = [];
let members = [];
let editingTaskId = null;
let taskToDeleteId = null;

let searchQuery = '';
let statusFilter = 'all'; // 'all' | 'To Do' | 'In Progress' | 'Done'
const collapsedProjects = new Set();

const STATUS_LABELS = { 'To Do': 'A Fazer', 'In Progress': 'Em Andamento', 'Done': 'Concluído' };
const AVATAR_PALETTE = ['#135bec', '#0c4a6e', '#14532d', '#92400e', '#7f1d1d', '#1e3a8a'];

document.addEventListener('DOMContentLoaded', async () => {
    console.log('Tasks board loading...');
    await loadTasksBoard();
    setupTaskModal();
    setupDeleteModal();
    setupSearchAndFilters();
});

async function loadTasksBoard() {
    try {
        currentTasks = await fetchTasks();
        projects = await fetchProjects(); // Global projects list for modal
        members = await fetchMembers(); // Global members list for modal

        renderTeamAvatars();
        renderBoard();
    } catch (error) {
        console.error("Failed to load tasks board:", error);
    }
}

// ─── Search & Filters ───────────────────────────────────────────────────────

function setupSearchAndFilters() {
    const input = document.getElementById('task-search');
    const clearBtn = document.getElementById('task-search-clear');

    if (input) {
        input.addEventListener('input', () => {
            searchQuery = input.value;
            if (clearBtn) clearBtn.classList.toggle('hidden', !searchQuery);
            renderBoard();
        });
    }

    if (clearBtn) {
        clearBtn.addEventListener('click', () => {
            if (input) input.value = '';
            searchQuery = '';
            clearBtn.classList.add('hidden');
            renderBoard();
            if (input) input.focus();
        });
    }

    document.querySelectorAll('#status-filter-chips .filter-chip').forEach(chip => {
        chip.addEventListener('click', () => {
            statusFilter = chip.dataset.status;
            document.querySelectorAll('#status-filter-chips .filter-chip').forEach(c => c.classList.toggle('active', c === chip));
            renderBoard();
        });
    });
}

function taskMatchesQuery(task, project, query) {
    if (!query) return true;
    const haystacks = [task.title, project ? project.name : '', task.asignee ? task.asignee.name : ''];
    return haystacks.some(v => (v || '').toLowerCase().includes(query));
}

// ─── Board Rendering ─────────────────────────────────────────────────────────

function renderBoard() {
    const container = document.getElementById('tasks-container');
    if (!container) return;

    const query = searchQuery.trim().toLowerCase();
    const isFiltering = query !== '' || statusFilter !== 'all';

    let totalAll = 0;
    let totalVisible = 0;
    let renderedProjects = 0;

    container.innerHTML = '';

    projects.forEach(project => {
        const projectTasks = currentTasks.filter(t => t.project_id === project.id);
        totalAll += projectTasks.length;
        if (projectTasks.length === 0) return; // nothing to show for this project at all

        const filteredTasks = projectTasks.filter(t =>
            (statusFilter === 'all' || t.status === statusFilter) && taskMatchesQuery(t, project, query)
        );
        totalVisible += filteredTasks.length;

        if (isFiltering && filteredTasks.length === 0) return; // section has no matches, skip it entirely

        renderedProjects++;
        container.appendChild(buildProjectSection(project, projectTasks, isFiltering ? filteredTasks : projectTasks, query));
    });

    updateSubtitle(totalAll, projects.filter(p => currentTasks.some(t => t.project_id === p.id)).length);
    updateResultsCounter(isFiltering, totalVisible, totalAll);

    if (renderedProjects === 0) {
        container.innerHTML = noResultsHtml(isFiltering, query);
    }
}

function updateSubtitle(totalTasks, projectCount) {
    const el = document.getElementById('board-subtitle');
    if (!el) return;
    if (totalTasks === 0) {
        el.textContent = 'Nenhuma tarefa cadastrada ainda.';
        return;
    }
    el.textContent = `${totalTasks} tarefa${totalTasks !== 1 ? 's' : ''} em ${projectCount} projeto${projectCount !== 1 ? 's' : ''}`;
}

function updateResultsCounter(isFiltering, visible, total) {
    const el = document.getElementById('results-counter');
    if (!el) return;
    if (!isFiltering) {
        el.classList.add('hidden');
        return;
    }
    el.textContent = `${visible} de ${total} tarefa${total !== 1 ? 's' : ''}`;
    el.classList.remove('hidden');
}

function noResultsHtml(isFiltering, query) {
    if (!isFiltering) {
        return `
            <div class="flex flex-col items-center justify-center py-24 text-center gap-3">
                <div class="w-16 h-16 rounded-2xl bg-gray-100 dark:bg-gray-800 flex items-center justify-center">
                    <span class="material-symbols-outlined text-gray-400" style="font-size:32px">checklist</span>
                </div>
                <p class="text-sm font-semibold text-gray-600 dark:text-gray-300">Nenhuma tarefa cadastrada ainda</p>
                <p class="text-xs text-gray-400">Clique em "Nova Tarefa" para começar.</p>
            </div>
        `;
    }
    return `
        <div class="flex flex-col items-center justify-center py-24 text-center gap-3">
            <div class="w-16 h-16 rounded-2xl bg-gray-100 dark:bg-gray-800 flex items-center justify-center">
                <span class="material-symbols-outlined text-gray-400" style="font-size:32px">search_off</span>
            </div>
            <p class="text-sm font-semibold text-gray-600 dark:text-gray-300">Nenhuma tarefa encontrada${query ? ` para "${escapeHtml(query)}"` : ''}</p>
            <p class="text-xs text-gray-400">Tente outra palavra-chave ou limpe os filtros.</p>
        </div>
    `;
}

function buildProjectSection(project, allProjectTasks, tasksToShow, query) {
    const toDoTasks = tasksToShow.filter(t => t.status === 'To Do');
    const inProgressTasks = tasksToShow.filter(t => t.status === 'In Progress');
    const doneTasks = tasksToShow.filter(t => t.status === 'Done');

    const totalCount = allProjectTasks.length;
    const doneCount = allProjectTasks.filter(t => t.status === 'Done').length;
    const pct = totalCount === 0 ? 0 : Math.round((doneCount / totalCount) * 100);
    const isCollapsed = collapsedProjects.has(project.id);

    const section = document.createElement('div');
    section.className = "project-section bg-white dark:bg-gray-900/50 rounded-2xl border border-gray-200 dark:border-gray-800 shadow-sm overflow-hidden";
    section.dataset.collapsed = isCollapsed ? 'true' : 'false';
    section.innerHTML = `
        <button type="button" class="project-toggle w-full flex items-center justify-between gap-4 px-5 py-4 text-left hover:bg-gray-50/70 dark:hover:bg-gray-800/40 transition-colors">
            <div class="flex items-center gap-2.5 min-w-0">
                <span class="material-symbols-outlined chevron-icon text-gray-400 flex-shrink-0" style="font-size:20px">expand_more</span>
                <h2 class="text-base font-bold text-gray-800 dark:text-white truncate">${escapeHtml(project.name)}</h2>
                <span class="px-2 py-0.5 text-[11px] font-bold rounded-full bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 flex-shrink-0">${totalCount} tarefa${totalCount !== 1 ? 's' : ''}</span>
            </div>
            <div class="hidden sm:flex items-center gap-2 w-32 flex-shrink-0">
                <div class="flex-1 h-1.5 bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden">
                    <div class="h-full rounded-full bg-gradient-to-r from-emerald-500 to-emerald-400 transition-all duration-500" style="width:${pct}%"></div>
                </div>
                <span class="text-[11px] font-bold text-gray-500 dark:text-gray-400 w-8 text-right">${pct}%</span>
            </div>
        </button>
        <div class="project-body px-5 pb-5">
            <div class="flex gap-5 overflow-x-auto pb-1">
                ${columnHtml(project.id, 'todo', 'A Fazer', 'radio_button_unchecked', 'linear-gradient(135deg,#334155 0%,#64748b 100%)', toDoTasks.length)}
                ${columnHtml(project.id, 'inprogress', 'Em Andamento', 'bolt', 'linear-gradient(135deg,#0c4a6e 0%,#0ea5e9 100%)', inProgressTasks.length)}
                ${columnHtml(project.id, 'done', 'Concluído', 'check', 'linear-gradient(135deg,#14532d 0%,#16a34a 100%)', doneTasks.length)}
            </div>
        </div>
    `;

    section.querySelector('.project-toggle').addEventListener('click', () => {
        const collapsed = section.dataset.collapsed === 'true';
        section.dataset.collapsed = collapsed ? 'false' : 'true';
        if (collapsed) collapsedProjects.delete(project.id);
        else collapsedProjects.add(project.id);
    });

    const todoContainer = section.querySelector(`#p-${project.id}-todo`);
    const inProgressContainer = section.querySelector(`#p-${project.id}-inprogress`);
    const doneContainer = section.querySelector(`#p-${project.id}-done`);

    fillColumn(todoContainer, toDoTasks, query);
    fillColumn(inProgressContainer, inProgressTasks, query);
    fillColumn(doneContainer, doneTasks, query);

    // "Adicionar" only makes sense on the To Do column
    const addBtn = document.createElement('button');
    addBtn.type = 'button';
    addBtn.className = "mt-2.5 flex items-center justify-center gap-1.5 text-gray-400 hover:text-primary dark:text-gray-500 dark:hover:text-primary w-full py-2 rounded-lg hover:bg-white dark:hover:bg-gray-700/50 transition-colors text-xs font-semibold border border-dashed border-gray-300 dark:border-gray-700";
    addBtn.innerHTML = `<span class="material-symbols-outlined" style="font-size:16px">add</span> Adicionar`;
    addBtn.addEventListener('click', () => openNewTaskModal(project.id));
    todoContainer.parentElement.appendChild(addBtn);

    return section;
}

function columnHtml(projectId, key, label, icon, gradient, count) {
    return `
        <div class="flex-1 min-w-[280px] bg-gray-50/70 dark:bg-gray-800/30 rounded-xl p-4">
            <div class="flex items-center gap-2 mb-3.5">
                <div style="background:${gradient}" class="w-6 h-6 rounded-lg flex items-center justify-center flex-shrink-0">
                    <span class="material-symbols-outlined text-white" style="font-size:13px">${icon}</span>
                </div>
                <h3 class="font-bold text-gray-700 dark:text-gray-200 text-[11px] uppercase tracking-wide">${label}</h3>
                <span class="bg-white dark:bg-gray-700 text-gray-600 dark:text-gray-300 text-[11px] font-bold px-1.5 py-0.5 rounded-full border border-gray-200 dark:border-gray-600">${count}</span>
            </div>
            <div class="space-y-2.5" id="p-${projectId}-${key}"></div>
        </div>
    `;
}

function fillColumn(containerEl, tasks, query) {
    if (tasks.length === 0) {
        const empty = document.createElement('p');
        empty.className = "text-[11px] text-gray-400 dark:text-gray-500 italic text-center py-2";
        empty.textContent = 'Nenhuma tarefa aqui';
        containerEl.appendChild(empty);
        return;
    }
    tasks.forEach(t => containerEl.appendChild(createTaskCard(t, query)));
}

// ─── Task Card ────────────────────────────────────────────────────────────────

function priorityMeta(priority) {
    if (priority === 'High') return { label: 'Alta', icon: 'text-red-500' };
    if (priority === 'Medium') return { label: 'Média', icon: 'text-amber-500' };
    return { label: 'Baixa', icon: 'text-primary' };
}

function highlightMatch(rawText, query) {
    const text = rawText || '';
    if (!query) return escapeHtml(text);
    const idx = text.toLowerCase().indexOf(query.toLowerCase());
    if (idx === -1) return escapeHtml(text);
    const before = escapeHtml(text.slice(0, idx));
    const match = escapeHtml(text.slice(idx, idx + query.length));
    const after = escapeHtml(text.slice(idx + query.length));
    return `${before}<mark>${match}</mark>${after}`;
}

function avatarColor(name) {
    const str = name || '?';
    let hash = 0;
    for (let i = 0; i < str.length; i++) hash = str.charCodeAt(i) + ((hash << 5) - hash);
    return AVATAR_PALETTE[Math.abs(hash) % AVATAR_PALETTE.length];
}

function renderAvatar(person, sizeClass, ringClass) {
    if (!person) return '';
    const name = person.name || '?';
    if (person.avatar_url) {
        return `<div class="bg-center bg-no-repeat bg-cover rounded-full ${sizeClass} ${ringClass}" style='background-image:url("${escapeHtml(person.avatar_url)}")' title="${escapeHtml(name)}"></div>`;
    }
    const initials = name.trim().split(/\s+/).map(w => w[0]).slice(0, 2).join('').toUpperCase();
    return `<div class="flex items-center justify-center rounded-full ${sizeClass} ${ringClass} text-white font-bold flex-shrink-0" style="background:${avatarColor(name)};font-size:10px" title="${escapeHtml(name)}">${escapeHtml(initials)}</div>`;
}

function renderTeamAvatars() {
    const container = document.getElementById('team-avatars');
    if (!container) return;

    const seen = new Set();
    const active = [];
    currentTasks.forEach(t => {
        if (t.status === 'Done' || !t.asignee || !t.assigned_to || seen.has(t.assigned_to)) return;
        seen.add(t.assigned_to);
        active.push(t.asignee);
    });

    if (active.length === 0) {
        container.innerHTML = '';
        return;
    }

    const shown = active.slice(0, 4);
    const extra = active.length - shown.length;
    container.innerHTML = shown.map(p => renderAvatar(p, 'size-8', 'ring-2 ring-white dark:ring-gray-900')).join('') +
        (extra > 0 ? `<div class="size-8 rounded-full ring-2 ring-white dark:ring-gray-900 bg-gray-400 dark:bg-gray-600 flex items-center justify-center text-[11px] font-bold text-white flex-shrink-0">+${extra}</div>` : '');
}

function createTaskCard(task, query) {
    const priority = priorityMeta(task.priority);
    const today = new Date().toISOString().split('T')[0];
    const isOverdue = task.due_date && task.due_date < today && task.status !== 'Done';
    const assigneeAvatar = renderAvatar(task.asignee, 'size-6', 'ring-2 ring-white dark:ring-gray-800');

    const card = document.createElement('div');
    card.className = "task-card p-3 bg-white dark:bg-background-dark rounded-lg shadow-sm border border-gray-100 dark:border-gray-700 cursor-pointer hover:shadow-md group relative";
    card.innerHTML = `
        <div class="flex flex-col gap-2">
            <div class="flex justify-between items-start">
                <p class="text-gray-800 dark:text-gray-100 text-sm font-semibold leading-tight line-clamp-2 pr-16">${highlightMatch(task.title, query)}</p>
                <div class="hidden group-hover:flex gap-1 bg-white dark:bg-background-dark p-1 rounded shadow-sm border border-gray-100 dark:border-gray-800 absolute top-2 right-2">
                    <button type="button" data-action="edit" class="text-blue-500 hover:text-blue-700 p-1 hover:bg-blue-50 rounded"><span class="material-symbols-outlined text-xs">edit</span></button>
                    <button type="button" data-action="delete" class="text-red-500 hover:text-red-700 p-1 hover:bg-red-50 rounded"><span class="material-symbols-outlined text-xs">delete</span></button>
                </div>
            </div>
            <p class="text-xs text-gray-400 font-mono">${escapeHtml(task.ticket_id || '')}</p>
            <div class="flex justify-between items-center mt-1">
                <div class="flex items-center gap-2">
                    <span class="material-symbols-outlined ${priority.icon} text-sm" title="Prioridade: ${priority.label}">flag</span>
                    <span class="text-xs ${isOverdue ? 'text-red-500 font-semibold' : 'text-gray-500 dark:text-gray-400'}">${formatDate(task.due_date)}</span>
                </div>
                ${assigneeAvatar}
            </div>
        </div>
    `;

    card.addEventListener('click', () => editTask(task.id));
    card.querySelector('[data-action="edit"]').addEventListener('click', (e) => { e.stopPropagation(); editTask(task.id); });
    card.querySelector('[data-action="delete"]').addEventListener('click', (e) => { e.stopPropagation(); openDeleteModal(task.id); });

    return card;
}

// ─── Task Modal ───────────────────────────────────────────────────────────────

function setupTaskModal() {
    const modalHtml = `
        <div id="task-modal" class="fixed inset-0 z-50 hidden overflow-y-auto" aria-labelledby="modal-title" role="dialog" aria-modal="true">
            <div class="flex items-center justify-center min-h-screen pt-4 px-4 pb-20 text-center sm:block sm:p-0">
                <div class="fixed inset-0 bg-gray-900/60 backdrop-blur-sm transition-opacity" aria-hidden="true" onclick="closeTaskModal()"></div>
                <span class="hidden sm:inline-block sm:align-middle sm:h-screen" aria-hidden="true">&#8203;</span>
                <div class="inline-block align-bottom bg-white dark:bg-gray-800 rounded-2xl text-left overflow-hidden shadow-2xl transform transition-all sm:my-8 sm:align-middle sm:max-w-lg sm:w-full">
                    <div class="px-5 pt-5 pb-1 sm:px-6">
                        <div class="flex items-center gap-2.5">
                            <div class="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0">
                                <span class="material-symbols-outlined text-primary" style="font-size:19px">task_alt</span>
                            </div>
                            <h3 class="text-base font-bold text-gray-900 dark:text-white" id="task-modal-title">Nova Tarefa</h3>
                        </div>
                    </div>
                    <div class="px-5 pt-4 pb-4 sm:px-6">
                        <div class="space-y-4">
                             <div>
                                <label for="t-project" class="block text-xs font-semibold text-gray-500 dark:text-gray-400 mb-1">Projeto</label>
                                <select id="t-project" class="block w-full rounded-lg border-gray-300 dark:border-gray-600 shadow-sm focus:border-primary focus:ring focus:ring-primary/50 dark:bg-gray-700 dark:text-white sm:text-sm">
                                    <!-- Populated by JS -->
                                </select>
                            </div>
                            <div>
                                <label for="t-title" class="block text-xs font-semibold text-gray-500 dark:text-gray-400 mb-1">Título</label>
                                <input type="text" id="t-title" class="block w-full rounded-lg border-gray-300 dark:border-gray-600 shadow-sm focus:border-primary focus:ring focus:ring-primary/50 dark:bg-gray-700 dark:text-white sm:text-sm">
                            </div>
                             <div>
                                <label for="t-assignee" class="block text-xs font-semibold text-gray-500 dark:text-gray-400 mb-1">Responsável</label>
                                <select id="t-assignee" class="block w-full rounded-lg border-gray-300 dark:border-gray-600 shadow-sm focus:border-primary focus:ring focus:ring-primary/50 dark:bg-gray-700 dark:text-white sm:text-sm">
                                    <!-- Populated by JS -->
                                </select>
                            </div>
                            <div class="grid grid-cols-2 gap-3">
                                <div>
                                    <label for="t-status" class="block text-xs font-semibold text-gray-500 dark:text-gray-400 mb-1">Status</label>
                                    <select id="t-status" class="block w-full rounded-lg border-gray-300 dark:border-gray-600 shadow-sm focus:border-primary focus:ring focus:ring-primary/50 dark:bg-gray-700 dark:text-white sm:text-sm">
                                        <option value="To Do">A Fazer</option>
                                        <option value="In Progress">Em Andamento</option>
                                        <option value="Done">Concluído</option>
                                    </select>
                                </div>
                                <div>
                                    <label for="t-priority" class="block text-xs font-semibold text-gray-500 dark:text-gray-400 mb-1">Prioridade</label>
                                    <select id="t-priority" class="block w-full rounded-lg border-gray-300 dark:border-gray-600 shadow-sm focus:border-primary focus:ring focus:ring-primary/50 dark:bg-gray-700 dark:text-white sm:text-sm">
                                        <option value="Low">Baixa</option>
                                        <option value="Medium">Média</option>
                                        <option value="High">Alta</option>
                                    </select>
                                </div>
                            </div>
                             <div>
                                <label for="t-due" class="block text-xs font-semibold text-gray-500 dark:text-gray-400 mb-1">Prazo</label>
                                <input type="date" id="t-due" class="block w-full rounded-lg border-gray-300 dark:border-gray-600 shadow-sm focus:border-primary focus:ring focus:ring-primary/50 dark:bg-gray-700 dark:text-white sm:text-sm">
                            </div>
                        </div>
                    </div>
                    <div class="bg-gray-50 dark:bg-gray-700/50 px-5 py-3 sm:px-6 sm:flex sm:flex-row-reverse gap-2">
                        <button type="button" onclick="saveTask()" class="w-full inline-flex justify-center rounded-lg border border-transparent shadow-sm px-4 py-2 bg-primary text-sm font-semibold text-white hover:bg-primary/90 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary sm:w-auto transition-colors">
                            Salvar
                        </button>
                        <button type="button" onclick="closeTaskModal()" class="mt-2 sm:mt-0 w-full inline-flex justify-center rounded-lg border border-gray-300 dark:border-gray-600 shadow-sm px-4 py-2 bg-white dark:bg-gray-800 text-sm font-semibold text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 sm:w-auto transition-colors">
                            Cancelar
                        </button>
                    </div>
                </div>
            </div>
        </div>
    `;
    document.body.insertAdjacentHTML('beforeend', modalHtml);

    const mainAddBtn = document.getElementById('btn-new-task');
    if (mainAddBtn) {
        mainAddBtn.onclick = () => openNewTaskModal();
    }
}

function setupDeleteModal() {
    const modalHtml = `
        <div id="delete-modal" class="fixed inset-0 z-50 hidden overflow-y-auto" aria-labelledby="modal-title" role="dialog" aria-modal="true">
            <div class="flex items-center justify-center min-h-screen pt-4 px-4 pb-20 text-center sm:block sm:p-0">
                <div class="fixed inset-0 bg-gray-900/60 backdrop-blur-sm transition-opacity" aria-hidden="true" onclick="closeDeleteModal()"></div>
                <span class="hidden sm:inline-block sm:align-middle sm:h-screen" aria-hidden="true">&#8203;</span>
                <div class="inline-block align-bottom bg-white dark:bg-gray-800 rounded-2xl text-left overflow-hidden shadow-2xl transform transition-all sm:my-8 sm:align-middle sm:max-w-lg sm:w-full">
                    <div class="bg-white dark:bg-gray-800 px-4 pt-5 pb-4 sm:p-6 sm:pb-4">
                        <div class="sm:flex sm:items-start">
                            <div class="mx-auto flex-shrink-0 flex items-center justify-center h-12 w-12 rounded-full bg-red-100 dark:bg-red-500/10 sm:mx-0 sm:h-10 sm:w-10">
                                <span class="material-symbols-outlined text-red-600">warning</span>
                            </div>
                            <div class="mt-3 text-center sm:mt-0 sm:ml-4 sm:text-left">
                                <h3 class="text-lg leading-6 font-medium text-gray-900 dark:text-white" id="delete-modal-title">Excluir Tarefa</h3>
                                <div class="mt-2">
                                    <p class="text-sm text-gray-500 dark:text-gray-400">Tem certeza de que deseja excluir esta tarefa? Esta ação não pode ser desfeita.</p>
                                </div>
                            </div>
                        </div>
                    </div>
                    <div class="bg-gray-50 dark:bg-gray-700/50 px-4 py-3 sm:px-6 sm:flex sm:flex-row-reverse">
                        <button type="button" onclick="confirmDeleteTask()" class="w-full inline-flex justify-center rounded-lg border border-transparent shadow-sm px-4 py-2 bg-red-600 text-sm font-semibold text-white hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500 sm:ml-3 sm:w-auto transition-colors">
                            Excluir
                        </button>
                        <button type="button" onclick="closeDeleteModal()" class="mt-3 w-full inline-flex justify-center rounded-lg border border-gray-300 dark:border-gray-600 shadow-sm px-4 py-2 bg-white dark:bg-gray-800 text-sm font-semibold text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 sm:mt-0 sm:ml-3 sm:w-auto transition-colors">
                            Cancelar
                        </button>
                    </div>
                </div>
            </div>
        </div>
    `;
    document.body.insertAdjacentHTML('beforeend', modalHtml);
}

window.openNewTaskModal = (preselectedProjectId = null) => {
    editingTaskId = null;
    document.getElementById('task-modal-title').textContent = 'Nova Tarefa';
    document.getElementById('t-title').value = '';
    document.getElementById('t-status').value = 'To Do';
    document.getElementById('t-priority').value = 'Medium';
    document.getElementById('t-due').value = '';

    const projectSelect = document.getElementById('t-project');
    if (projectSelect) {
        projectSelect.innerHTML = '';
        projects.forEach(p => {
            const option = document.createElement('option');
            option.value = p.id;
            option.textContent = p.name;
            projectSelect.appendChild(option);
        });
        if (preselectedProjectId) {
            projectSelect.value = preselectedProjectId;
        }
    }

    const assigneeSelect = document.getElementById('t-assignee');
    if (assigneeSelect) {
        assigneeSelect.innerHTML = '<option value="">Sem Responsável</option>';
        members.forEach(m => {
            const option = document.createElement('option');
            option.value = m.id;
            option.textContent = m.name;
            assigneeSelect.appendChild(option);
        });
    }

    const modal = document.getElementById('task-modal');
    if (modal) modal.classList.remove('hidden');
}

window.closeTaskModal = () => {
    const modal = document.getElementById('task-modal');
    if (modal) modal.classList.add('hidden');
}

window.editTask = (id) => {
    editingTaskId = id;
    const task = currentTasks.find(t => t.id === id);
    if (!task) return;

    document.getElementById('task-modal-title').textContent = 'Editar Tarefa';
    document.getElementById('t-title').value = task.title;
    document.getElementById('t-status').value = task.status;
    document.getElementById('t-priority').value = task.priority;
    document.getElementById('t-due').value = task.due_date || '';

    const projectSelect = document.getElementById('t-project');
    if (projectSelect) {
        projectSelect.innerHTML = '';
        projects.forEach(p => {
            const option = document.createElement('option');
            option.value = p.id;
            option.textContent = p.name;
            projectSelect.appendChild(option);
        });
        projectSelect.value = task.project_id;
    }

    const assigneeSelect = document.getElementById('t-assignee');
    if (assigneeSelect) {
        assigneeSelect.innerHTML = '<option value="">Sem Responsável</option>';
        members.forEach(m => {
            const option = document.createElement('option');
            option.value = m.id;
            option.textContent = m.name;
            assigneeSelect.appendChild(option);
        });
        assigneeSelect.value = task.assigned_to || '';
    }

    const modal = document.getElementById('task-modal');
    if (modal) modal.classList.remove('hidden');
}

window.saveTask = async () => {
    const projectId = document.getElementById('t-project').value;
    const title = document.getElementById('t-title').value;
    const assigneeId = document.getElementById('t-assignee').value;
    const status = document.getElementById('t-status').value;
    const priority = document.getElementById('t-priority').value;
    let dueDate = document.getElementById('t-due').value;

    if (!title) {
        alert('O título é obrigatório');
        return;
    }

    if (!projectId) {
        alert('Selecione um projeto');
        return;
    }

    // Validation: Check if marking as Done and date matches today
    if (status === 'Done') {
        const today = new Date().toISOString().split('T')[0];
        if (dueDate && dueDate !== today) {
            const confirmUpdate = confirm("A data de conclusão é diferente da data de prazo cadastrada. Deseja atualizar o prazo para hoje?");
            if (confirmUpdate) {
                dueDate = today;
            }
        } else if (!dueDate) {
            // If no date set, maybe set it to today?
            const confirmUpdate = confirm("A tarefa está sendo concluída sem prazo. Deseja definir a data de conclusão para hoje?");
            if (confirmUpdate) {
                dueDate = today;
            }
        }
    }

    const taskData = {
        project_id: projectId,
        assigned_to: assigneeId || null,
        title,
        status,
        priority,
        due_date: dueDate || null
    };

    try {
        if (editingTaskId) {
            await updateTask(editingTaskId, taskData);
        } else {
            await createTask(taskData);
        }
        closeTaskModal();
        await loadTasksBoard();

        // Check for Project Auto-Completion
        if (status === 'Done' || status === 'Concluída') {
            const completed = await checkProjectCompletion(projectId);
            if (completed) {
                alert('🎉 Todas as tarefas concluídas! O projeto foi marcado como CONCLUÍDO automaticamente.');
                // Optionally reload tasks board again if we want to reflect project status visually anywhere,
                // though tasks board is usually just tasks.
            }
        }

    } catch (e) {
        console.error("Failed to save task:", e);
        alert('Falha ao salvar tarefa: ' + e.message);
    }
}

window.openDeleteModal = (id) => {
    taskToDeleteId = id;
    const modal = document.getElementById('delete-modal');
    if (modal) modal.classList.remove('hidden');
}

window.closeDeleteModal = () => {
    taskToDeleteId = null;
    const modal = document.getElementById('delete-modal');
    if (modal) modal.classList.add('hidden');
}

window.confirmDeleteTask = async () => {
    if (taskToDeleteId) {
        try {
            await deleteTask(taskToDeleteId);
            closeDeleteModal();
            await loadTasksBoard();
        } catch (error) {
            console.error("Failed to delete task:", error);
            alert('Falha ao excluir tarefa. Verifique se existem registros dependentes.');
        }
    }
}
