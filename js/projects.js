document.addEventListener('DOMContentLoaded', async () => {
    console.log('Projects list loading...');
    await loadProjectsList();
    setupProjectModal();
    setupDeleteModal();
});

let currentProjects = [];
let editingProjectId = null;
let projectToDeleteId = null;

async function loadProjectsList() {
    const projects = await fetchProjects();

    // Enrich projects with progress calculated from tasks
    // Ideally do this in a smarter query, but loop is fine for restricted scope
    currentProjects = await Promise.all(projects.map(async (p) => {
        // Using _supabase global to fetch tasks for progress calc
        const { data: tasks } = await _supabase.from('tasks').select('status').eq('project_id', p.id);
        let progress = 0;
        if (tasks && tasks.length > 0) {
            const completed = tasks.filter(t => t.status === 'Done' || t.status === 'Completed').length;
            progress = Math.round((completed / tasks.length) * 100);
        }
        return { ...p, computedProgress: progress };
    }));

    renderProjectsTable(currentProjects);
}

function renderProjectsTable(projects) {
    const tableBody = document.querySelector('tbody');
    if (!tableBody) return;
    tableBody.innerHTML = '';

    projects.forEach(project => {
        const leadAvatar = project.lead ? `<div class="bg-center bg-no-repeat aspect-square bg-cover rounded-full size-8 ring-2 ring-white dark:ring-gray-900/50" style='background-image: url("${project.lead.avatar_url}");'></div>` : '';

        // Translate Status for Display
        let displayStatus = project.status;
        let statusBadgeClass = '';
        switch (project.status) {
            case 'In Progress':
                displayStatus = 'Em Andamento';
                statusBadgeClass = 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200';
                break;
            case 'Completed':
                displayStatus = 'Concluído';
                statusBadgeClass = 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200';
                break;
            case 'On Hold':
                displayStatus = 'Em Espera';
                statusBadgeClass = 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200';
                break;
            default:
                statusBadgeClass = 'bg-gray-100 text-gray-800';
        }

        // Use computed progress
        const progressVal = project.computedProgress !== undefined ? project.computedProgress : 0;

        const row = document.createElement('tr');
        row.className = "hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors";
        row.innerHTML = `
            <td class="px-6 py-4 whitespace-nowrap text-[#0d121b] dark:text-white text-sm font-medium font-mono">${project.code || '-'}</td>
            <td class="px-6 py-4 whitespace-nowrap text-[#0d121b] dark:text-white text-sm font-medium">${project.name}</td>
            <td class="px-6 py-4 whitespace-nowrap">
                <span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${statusBadgeClass}">${displayStatus}</span>
            </td>
            <td class="px-6 py-4 whitespace-nowrap">
                <div class="flex -space-x-2">
                    ${leadAvatar}
                </div>
            </td>
            <td class="px-6 py-4 whitespace-nowrap">
                <div class="flex items-center gap-3">
                    <div class="w-24 overflow-hidden rounded-full bg-gray-200 dark:bg-gray-700 h-2"><div class="h-2 rounded-full bg-primary" style="width: ${progressVal}%;"></div></div>
                    <p class="text-[#0d121b] dark:text-gray-300 text-sm font-medium leading-normal">${progressVal}%</p>
                </div>
            </td>
            <td class="px-6 py-4 whitespace-nowrap text-[#4c669a] dark:text-gray-400 text-sm">${formatDate(project.due_date)}</td>
            <td class="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                <div class="flex items-center justify-end gap-2">
                    <button class="text-blue-600 hover:text-blue-900 dark:text-blue-400 dark:hover:text-blue-300" onclick="editProject('${project.id}')"><span class="material-symbols-outlined">edit</span></button>
                    <button class="text-red-600 hover:text-red-900 dark:text-red-400 dark:hover:text-red-300" onclick="openDeleteModal('${project.id}')"><span class="material-symbols-outlined">delete</span></button>
                </div>
            </td>
        `;
        tableBody.appendChild(row);
    });
}

function setupProjectModal() {
    const modalHtml = `
        <div id="project-modal" class="fixed inset-0 z-50 hidden overflow-y-auto" aria-labelledby="modal-title" role="dialog" aria-modal="true">
            <div class="flex items-center justify-center min-h-screen pt-4 px-4 pb-20 text-center sm:block sm:p-0">
                <div class="fixed inset-0 bg-gray-500 bg-opacity-75 transition-opacity" aria-hidden="true" onclick="closeModal()"></div>
                <span class="hidden sm:inline-block sm:align-middle sm:h-screen" aria-hidden="true">&#8203;</span>
                <div class="inline-block align-bottom bg-white dark:bg-gray-800 rounded-lg text-left overflow-hidden shadow-xl transform transition-all sm:my-8 sm:align-middle sm:max-w-lg sm:w-full">
                    <div class="bg-white dark:bg-gray-800 px-4 pt-5 pb-4 sm:p-6 sm:pb-4">
                        <h3 class="text-lg leading-6 font-medium text-gray-900 dark:text-white" id="modal-title">Novo Projeto</h3>
                        <div class="mt-4 space-y-4">
                            <div>
                                <label for="p-code" class="block text-sm font-medium text-gray-700 dark:text-gray-300">Código</label>
                                <input type="text" id="p-code" class="mt-1 block w-full rounded-md border-gray-300 dark:border-gray-600 shadow-sm focus:border-primary focus:ring focus:ring-primary/50 dark:bg-gray-700 dark:text-white sm:text-sm">
                            </div>
                            <div>
                                <label for="p-name" class="block text-sm font-medium text-gray-700 dark:text-gray-300">Nome do Projeto</label>
                                <input type="text" id="p-name" class="mt-1 block w-full rounded-md border-gray-300 dark:border-gray-600 shadow-sm focus:border-primary focus:ring focus:ring-primary/50 dark:bg-gray-700 dark:text-white sm:text-sm">
                            </div>
                            <div>
                                <label for="p-status" class="block text-sm font-medium text-gray-700 dark:text-gray-300">Status</label>
                                <select id="p-status" class="mt-1 block w-full rounded-md border-gray-300 dark:border-gray-600 shadow-sm focus:border-primary focus:ring focus:ring-primary/50 dark:bg-gray-700 dark:text-white sm:text-sm">
                                    <option value="In Progress">Em Andamento</option>
                                    <option value="Completed">Concluído</option>
                                    <option value="On Hold">Em Espera</option>
                                </select>
                            </div>
                            <div>
                                <label for="p-due" class="block text-sm font-medium text-gray-700 dark:text-gray-300">Prazo</label>
                                <input type="date" id="p-due" class="mt-1 block w-full rounded-md border-gray-300 dark:border-gray-600 shadow-sm focus:border-primary focus:ring focus:ring-primary/50 dark:bg-gray-700 dark:text-white sm:text-sm">
                            </div>
                        </div>
                    </div>
                    <div class="bg-gray-50 dark:bg-gray-700 px-4 py-3 sm:px-6 sm:flex sm:flex-row-reverse">
                        <button type="button" onclick="saveProject()" class="w-full inline-flex justify-center rounded-md border border-transparent shadow-sm px-4 py-2 bg-primary text-base font-medium text-white hover:bg-primary/90 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary sm:ml-3 sm:w-auto sm:text-sm">
                            Salvar
                        </button>
                        <button type="button" onclick="closeModal()" class="mt-3 w-full inline-flex justify-center rounded-md border border-gray-300 dark:border-gray-600 shadow-sm px-4 py-2 bg-white dark:bg-gray-800 text-base font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 sm:mt-0 sm:ml-3 sm:w-auto sm:text-sm">
                            Cancelar
                        </button>
                    </div>
                </div>
            </div>
        </div>
    `;
    document.body.insertAdjacentHTML('beforeend', modalHtml);

    const newBtn = document.querySelector('button span.truncate').parentElement;
    if (newBtn) {
        newBtn.onclick = openNewProjectModal;
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
                                <h3 class="text-lg leading-6 font-medium text-gray-900 dark:text-white" id="delete-modal-title">Excluir Projeto</h3>
                                <div class="mt-2">
                                    <p class="text-sm text-gray-500 dark:text-gray-400">Tem certeza de que deseja excluir este projeto? Esta ação não pode ser desfeita.</p>
                                </div>
                            </div>
                        </div>
                    </div>
                    <div class="bg-gray-50 dark:bg-gray-700 px-4 py-3 sm:px-6 sm:flex sm:flex-row-reverse">
                        <button type="button" onclick="confirmDeleteProject()" class="w-full inline-flex justify-center rounded-md border border-transparent shadow-sm px-4 py-2 bg-red-600 text-base font-medium text-white hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500 sm:ml-3 sm:w-auto sm:text-sm">
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

window.openNewProjectModal = () => {
    editingProjectId = null;
    document.getElementById('modal-title').textContent = 'Novo Projeto';
    document.getElementById('p-code').value = '';
    document.getElementById('p-name').value = '';
    document.getElementById('p-status').value = 'In Progress';

    const dueInput = document.getElementById('p-due');
    dueInput.value = '';
    dueInput.disabled = false; // Enable for new projects

    document.getElementById('project-modal').classList.remove('hidden');
}

window.closeModal = () => {
    document.getElementById('project-modal').classList.add('hidden');
}

window.editProject = (id) => {
    editingProjectId = id;
    const project = currentProjects.find(p => p.id === id);
    if (!project) return;

    document.getElementById('modal-title').textContent = 'Editar Projeto';
    document.getElementById('p-code').value = project.code || '';
    document.getElementById('p-name').value = project.name;
    document.getElementById('p-status').value = project.status;

    const dueInput = document.getElementById('p-due');
    dueInput.value = project.due_date;
    dueInput.disabled = true; // Disable for editing

    document.getElementById('project-modal').classList.remove('hidden');
}

window.saveProject = async () => {
    const code = document.getElementById('p-code').value;
    const name = document.getElementById('p-name').value;
    const status = document.getElementById('p-status').value;
    const dueDate = document.getElementById('p-due').value;

    if (!name) {
        alert('O Nome do Projeto é obrigatório');
        return;
    }

    const projectData = {
        code,
        name,
        status,
        due_date: dueDate || null
    };

    try {
        if (editingProjectId) {
            // If disabled, we might want to exclude it from the update payload to be safe, 
            // but effectively the value won't change in the UI.
            await updateProject(editingProjectId, projectData);
        } else {
            await createProject(projectData);
        }
        closeModal();
        await loadProjectsList();
    } catch (e) {
        alert('Falha ao salvar projeto: ' + e.message);
    }
}

window.openDeleteModal = (id) => {
    projectToDeleteId = id;
    document.getElementById('delete-modal').classList.remove('hidden');
}

window.closeDeleteModal = () => {
    projectToDeleteId = null;
    document.getElementById('delete-modal').classList.add('hidden');
}

window.confirmDeleteProject = async () => {
    if (projectToDeleteId) {
        await deleteProject(projectToDeleteId);
        closeDeleteModal();
        await loadProjectsList();
    }
}
