
let currentTasks = [];
let projects = [];
let members = [];
let editingTaskId = null;
let taskToDeleteId = null;

document.addEventListener('DOMContentLoaded', async () => {
    console.log('Tasks board loading...');
    await loadTasksBoard();
    setupTaskModal();
    setupDeleteModal();
});

async function loadTasksBoard() {
    try {
        currentTasks = await fetchTasks();
        projects = await fetchProjects(); // Global projects list for modal
        members = await fetchMembers(); // Global members list for modal

        const container = document.getElementById('tasks-container');
        if (container) container.innerHTML = '';

        projects.forEach(project => {
            const projectTasks = currentTasks.filter(t => t.project_id === project.id);

            // Group by status
            const toDoTasks = projectTasks.filter(t => t.status === 'To Do');
            const inProgressTasks = projectTasks.filter(t => t.status === 'In Progress');
            const doneTasks = projectTasks.filter(t => t.status === 'Done');

            // Create Project Section
            const projectSection = document.createElement('div');
            projectSection.className = "mb-8 bg-white dark:bg-gray-900/50 rounded-xl p-6 border border-gray-200 dark:border-gray-800 shadow-sm";
            projectSection.innerHTML = `
                <div class="flex items-center gap-3 mb-6">
                    <h2 class="text-xl font-bold text-gray-800 dark:text-white">${escapeHtml(project.name)}</h2>
                    <span class="px-2 py-1 text-xs font-semibold rounded-full bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400">${projectTasks.length} tarefas</span>
                </div>
                
                <div class="flex gap-6 overflow-x-auto pb-4">
                    <!-- To Do Column -->
                    <div class="flex-1 min-w-[300px] bg-gray-50 dark:bg-gray-800/30 rounded-lg p-4">
                        <div class="flex items-center justify-between mb-4">
                            <div class="flex items-center gap-2">
                                <span class="w-2 h-2 rounded-full bg-slate-400"></span>
                                <h3 class="font-semibold text-gray-700 dark:text-gray-200 text-sm uppercase">A Fazer</h3>
                                <span class="bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-300 text-xs px-2 py-0.5 rounded-full">${toDoTasks.length}</span>
                            </div>
                        </div>
                        <div class="space-y-3" id="p-${project.id}-todo"></div>
                        <button onclick="openNewTaskModal('${project.id}')"
                            class="mt-3 flex items-center justify-center gap-2 text-gray-500 hover:text-primary dark:text-gray-400 dark:hover:text-primary w-full py-2 rounded-md hover:bg-gray-100 dark:hover:bg-gray-700/50 transition-colors text-sm font-medium border border-dashed border-gray-300 dark:border-gray-700">
                            <span class="material-symbols-outlined text-lg">add</span>
                            Adicionar
                        </button>
                    </div>

                    <!-- In Progress Column -->
                    <div class="flex-1 min-w-[300px] bg-gray-50 dark:bg-gray-800/30 rounded-lg p-4">
                        <div class="flex items-center justify-between mb-4">
                            <div class="flex items-center gap-2">
                                <span class="w-2 h-2 rounded-full bg-blue-500"></span>
                                <h3 class="font-semibold text-gray-700 dark:text-gray-200 text-sm uppercase">Em Andamento</h3>
                                <span class="bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-300 text-xs px-2 py-0.5 rounded-full">${inProgressTasks.length}</span>
                            </div>
                        </div>
                        <div class="space-y-3" id="p-${project.id}-inprogress"></div>
                    </div>

                    <!-- Done Column -->
                    <div class="flex-1 min-w-[300px] bg-gray-50 dark:bg-gray-800/30 rounded-lg p-4">
                        <div class="flex items-center justify-between mb-4">
                            <div class="flex items-center gap-2">
                                <span class="w-2 h-2 rounded-full bg-green-500"></span>
                                <h3 class="font-semibold text-gray-700 dark:text-gray-200 text-sm uppercase">Concluído</h3>
                                <span class="bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-300 text-xs px-2 py-0.5 rounded-full">${doneTasks.length}</span>
                            </div>
                        </div>
                        <div class="space-y-3" id="p-${project.id}-done"></div>
                    </div>
                </div>
            `;

            container.appendChild(projectSection);

            // Render Tasks into columns
            const todoContainer = document.getElementById(`p-${project.id}-todo`);
            const inProgressContainer = document.getElementById(`p-${project.id}-inprogress`);
            const doneContainer = document.getElementById(`p-${project.id}-done`);

            toDoTasks.forEach(t => todoContainer.appendChild(createTaskCard(t)));
            inProgressTasks.forEach(t => inProgressContainer.appendChild(createTaskCard(t)));
            doneTasks.forEach(t => doneContainer.appendChild(createTaskCard(t)));
        });
    } catch (error) {
        console.error("Failed to load tasks board:", error);
    }
}

function createTaskCard(task) {
    const priorityColor = task.priority === 'High' ? 'text-red-500' : (task.priority === 'Medium' ? 'text-orange-500' : 'text-blue-500');
    // assignee logic: using 'asignee' alias from api.js join
    const assigneeAvatar = task.asignee ? `<div class="bg-center bg-no-repeat aspect-square bg-cover rounded-full size-6 ring-2 ring-white dark:ring-gray-800" style='background-image: url("${escapeHtml(task.asignee.avatar_url)}");' title="${escapeHtml(task.asignee.name)}"></div>` : '';

    const card = document.createElement('div');
    card.className = "p-3 bg-white dark:bg-background-dark rounded-lg shadow-sm border border-gray-100 dark:border-gray-700 cursor-pointer hover:shadow-md transition-all group relative";
    card.innerHTML = `
        <div class="flex flex-col gap-2">
            <div class="flex justify-between items-start">
                <p class="text-gray-800 dark:text-gray-100 text-sm font-semibold leading-tight line-clamp-2 pr-16">${escapeHtml(task.title)}</p>
                <div class="hidden group-hover:flex gap-1 bg-white dark:bg-background-dark p-1 rounded shadow-sm border border-gray-100 dark:border-gray-800 absolute top-2 right-2">
                    <button onclick="editTask('${task.id}')" class="text-blue-500 hover:text-blue-700 p-1 hover:bg-blue-50 rounded"><span class="material-symbols-outlined text-xs">edit</span></button>
                    <button onclick="openDeleteModal('${task.id}')" class="text-red-500 hover:text-red-700 p-1 hover:bg-red-50 rounded"><span class="material-symbols-outlined text-xs">delete</span></button>
                </div>
            </div>
            <p class="text-xs text-gray-400 font-mono">${escapeHtml(task.ticket_id || '')}</p>
            <div class="flex justify-between items-center mt-1">
                <div class="flex items-center gap-2">
                    <span class="material-symbols-outlined ${priorityColor} text-sm" title="Prioridade">flag</span>
                    <span class="text-xs text-gray-500 dark:text-gray-400">${formatDate(task.due_date)}</span>
                </div>
                ${assigneeAvatar}
            </div>
        </div>
    `;
    return card;
}

function setupTaskModal() {
    const modalHtml = `
        <div id="task-modal" class="fixed inset-0 z-50 hidden overflow-y-auto" aria-labelledby="modal-title" role="dialog" aria-modal="true">
            <div class="flex items-center justify-center min-h-screen pt-4 px-4 pb-20 text-center sm:block sm:p-0">
                <div class="fixed inset-0 bg-gray-500 bg-opacity-75 transition-opacity" aria-hidden="true" onclick="closeTaskModal()"></div>
                <span class="hidden sm:inline-block sm:align-middle sm:h-screen" aria-hidden="true">&#8203;</span>
                <div class="inline-block align-bottom bg-white dark:bg-gray-800 rounded-lg text-left overflow-hidden shadow-xl transform transition-all sm:my-8 sm:align-middle sm:max-w-lg sm:w-full">
                    <div class="bg-white dark:bg-gray-800 px-4 pt-5 pb-4 sm:p-6 sm:pb-4">
                        <h3 class="text-lg leading-6 font-medium text-gray-900 dark:text-white" id="task-modal-title">Nova Tarefa</h3>
                        <div class="mt-4 space-y-4">
                             <div>
                                <label for="t-project" class="block text-sm font-medium text-gray-700 dark:text-gray-300">Projeto</label>
                                <select id="t-project" class="mt-1 block w-full rounded-md border-gray-300 dark:border-gray-600 shadow-sm focus:border-primary focus:ring focus:ring-primary/50 dark:bg-gray-700 dark:text-white sm:text-sm">
                                    <!-- Populated by JS -->
                                </select>
                            </div>
                            <div>
                                <label for="t-title" class="block text-sm font-medium text-gray-700 dark:text-gray-300">Título</label>
                                <input type="text" id="t-title" class="mt-1 block w-full rounded-md border-gray-300 dark:border-gray-600 shadow-sm focus:border-primary focus:ring focus:ring-primary/50 dark:bg-gray-700 dark:text-white sm:text-sm">
                            </div>
                             <div>
                                <label for="t-assignee" class="block text-sm font-medium text-gray-700 dark:text-gray-300">Responsável</label>
                                <select id="t-assignee" class="mt-1 block w-full rounded-md border-gray-300 dark:border-gray-600 shadow-sm focus:border-primary focus:ring focus:ring-primary/50 dark:bg-gray-700 dark:text-white sm:text-sm">
                                    <!-- Populated by JS -->
                                </select>
                            </div>
                            <div>
                                <label for="t-status" class="block text-sm font-medium text-gray-700 dark:text-gray-300">Status</label>
                                <select id="t-status" class="mt-1 block w-full rounded-md border-gray-300 dark:border-gray-600 shadow-sm focus:border-primary focus:ring focus:ring-primary/50 dark:bg-gray-700 dark:text-white sm:text-sm">
                                    <option value="To Do">A Fazer</option>
                                    <option value="In Progress">Em Andamento</option>
                                    <option value="Done">Concluído</option>
                                </select>
                            </div>
                            <div>
                                <label for="t-priority" class="block text-sm font-medium text-gray-700 dark:text-gray-300">Prioridade</label>
                                <select id="t-priority" class="mt-1 block w-full rounded-md border-gray-300 dark:border-gray-600 shadow-sm focus:border-primary focus:ring focus:ring-primary/50 dark:bg-gray-700 dark:text-white sm:text-sm">
                                    <option value="Low">Baixa</option>
                                    <option value="Medium">Média</option>
                                    <option value="High">Alta</option>
                                </select>
                            </div>
                             <div>
                                <label for="t-due" class="block text-sm font-medium text-gray-700 dark:text-gray-300">Prazo</label>
                                <input type="date" id="t-due" class="mt-1 block w-full rounded-md border-gray-300 dark:border-gray-600 shadow-sm focus:border-primary focus:ring focus:ring-primary/50 dark:bg-gray-700 dark:text-white sm:text-sm">
                            </div>
                        </div>
                    </div>
                    <div class="bg-gray-50 dark:bg-gray-700 px-4 py-3 sm:px-6 sm:flex sm:flex-row-reverse">
                        <button type="button" onclick="saveTask()" class="w-full inline-flex justify-center rounded-md border border-transparent shadow-sm px-4 py-2 bg-primary text-base font-medium text-white hover:bg-primary/90 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary sm:ml-3 sm:w-auto sm:text-sm">
                            Salvar
                        </button>
                        <button type="button" onclick="closeTaskModal()" class="mt-3 w-full inline-flex justify-center rounded-md border border-gray-300 dark:border-gray-600 shadow-sm px-4 py-2 bg-white dark:bg-gray-800 text-base font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 sm:mt-0 sm:ml-3 sm:w-auto sm:text-sm">
                            Cancelar
                        </button>
                    </div>
                </div>
            </div>
        </div>
    `;
    document.body.insertAdjacentHTML('beforeend', modalHtml);

    const mainAddBtn = document.querySelector('button.bg-primary span.material-symbols-outlined + span');
    if (mainAddBtn && mainAddBtn.parentElement) {
        mainAddBtn.parentElement.onclick = () => openNewTaskModal();
    }
}

function setupDeleteModal() {
    const modalHtml = `
        <div id="delete-modal" class="fixed inset-0 z-50 hidden overflow-y-auto" aria-labelledby="modal-title" role="dialog" aria-modal="true">
            <div class="flex items-center justify-center min-h-screen pt-4 px-4 pb-20 text-center sm:block sm:p-0">
                <div class="fixed inset-0 bg-gray-500 bg-opacity-75 transition-opacity" aria-hidden="true" onclick="closeDeleteModal()"></div>
                <span class="hidden sm:inline-block sm:align-middle sm:h-screen" aria-hidden="true">&#8203;</span>
                <div class="inline-block align-bottom bg-white dark:bg-gray-800 rounded-lg text-left overflow-hidden shadow-xl transform transition-all sm:my-8 sm:align-middle sm:max-w-lg sm:w-full">
                    <div class="bg-white dark:bg-gray-800 px-4 pt-5 pb-4 sm:p-6 sm:pb-4">
                        <div class="sm:flex sm:items-start">
                            <div class="mx-auto flex-shrink-0 flex items-center justify-center h-12 w-12 rounded-full bg-red-100 sm:mx-0 sm:h-10 sm:w-10">
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
                    <div class="bg-gray-50 dark:bg-gray-700 px-4 py-3 sm:px-6 sm:flex sm:flex-row-reverse">
                        <button type="button" onclick="confirmDeleteTask()" class="w-full inline-flex justify-center rounded-md border border-transparent shadow-sm px-4 py-2 bg-red-600 text-base font-medium text-white hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500 sm:ml-3 sm:w-auto sm:text-sm">
                            Excluir
                        </button>
                        <button type="button" onclick="closeDeleteModal()" class="mt-3 w-full inline-flex justify-center rounded-md border border-gray-300 dark:border-gray-600 shadow-sm px-4 py-2 bg-white dark:bg-gray-800 text-base font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 sm:mt-0 sm:ml-3 sm:w-auto sm:text-sm">
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
