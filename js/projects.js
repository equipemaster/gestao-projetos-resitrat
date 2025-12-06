document.addEventListener('DOMContentLoaded', async () => {
    console.log('Projects list loading...');
    await loadProjectsList();
    setupProjectModal();
    setupDeleteModal();

    // Setup search listener
    const searchInput = document.getElementById('searchInput');
    if (searchInput) {
        searchInput.addEventListener('input', filterProjects);
    }

    // Initial sort state
    updateSortButton();
});

let sortDateAsc = true; // Default sort: Ascending (Earliest first)


function filterProjects() {
    const statusFilter = document.getElementById('statusFilter').value;
    const searchInput = document.getElementById('searchInput');
    const searchTerm = searchInput ? searchInput.value.toLowerCase() : '';

    let filtered = currentProjects.filter(project => {
        // Status Filter
        const matchesStatus = statusFilter === 'All' || project.status === statusFilter;

        // Search Filter (Code or Name)
        const matchesSearch = (project.name && project.name.toLowerCase().includes(searchTerm)) ||
            (project.code && project.code.toLowerCase().includes(searchTerm));

        return matchesStatus && matchesSearch;
    });

    // Sort logic
    filtered.sort((a, b) => {
        const dateA = new Date(a.due_date || '9999-12-31'); // Push no-date to end if ASC
        const dateB = new Date(b.due_date || '9999-12-31');

        if (sortDateAsc) {
            return dateA - dateB;
        } else {
            return dateB - dateA;
        }
    });

    renderProjectsTable(filtered);
}

window.toggleSortDate = () => {
    sortDateAsc = !sortDateAsc;
    updateSortButton();
    filterProjects();
}

function updateSortButton() {
    const btn = document.getElementById('sortDateBtn');
    if (btn) {
        // Keep icon, update text
        btn.innerHTML = `
            <span class="material-symbols-outlined text-lg">sort</span>
            Ordenar por: Prazo (${sortDateAsc ? '↑' : '↓'})
        `;
    }
}

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
                                <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Detalhamento Financeiro</label>
                                <div class="grid grid-cols-2 gap-4 bg-gray-50 dark:bg-gray-700/50 p-4 rounded-lg border border-gray-200 dark:border-gray-600">
                                    <div>
                                        <label for="p-budget-reservatorios" class="block text-xs font-medium text-gray-500 dark:text-gray-400">Reservatórios</label>
                                        <input type="number" step="0.01" id="p-budget-reservatorios" oninput="calculateTotalBudget()" class="mt-1 block w-full rounded-md border-gray-300 dark:border-gray-600 shadow-sm focus:border-primary focus:ring focus:ring-primary/50 dark:bg-gray-700 dark:text-white sm:text-sm h-8" placeholder="0,00">
                                    </div>
                                    <div>
                                        <label for="p-budget-filtros" class="block text-xs font-medium text-gray-500 dark:text-gray-400">Filtros PRFV</label>
                                        <input type="number" step="0.01" id="p-budget-filtros" oninput="calculateTotalBudget()" class="mt-1 block w-full rounded-md border-gray-300 dark:border-gray-600 shadow-sm focus:border-primary focus:ring focus:ring-primary/50 dark:bg-gray-700 dark:text-white sm:text-sm h-8" placeholder="0,00">
                                    </div>
                                    <div>
                                        <label for="p-budget-bombas" class="block text-xs font-medium text-gray-500 dark:text-gray-400">Bombas</label>
                                        <input type="number" step="0.01" id="p-budget-bombas" oninput="calculateTotalBudget()" class="mt-1 block w-full rounded-md border-gray-300 dark:border-gray-600 shadow-sm focus:border-primary focus:ring focus:ring-primary/50 dark:bg-gray-700 dark:text-white sm:text-sm h-8" placeholder="0,00">
                                    </div>
                                    <div>
                                        <label for="p-budget-hidraulicos" class="block text-xs font-medium text-gray-500 dark:text-gray-400">Hidráulicos</label>
                                        <input type="number" step="0.01" id="p-budget-hidraulicos" oninput="calculateTotalBudget()" class="mt-1 block w-full rounded-md border-gray-300 dark:border-gray-600 shadow-sm focus:border-primary focus:ring focus:ring-primary/50 dark:bg-gray-700 dark:text-white sm:text-sm h-8" placeholder="0,00">
                                    </div>
                                    <div>
                                        <label for="p-budget-eletricos" class="block text-xs font-medium text-gray-500 dark:text-gray-400">Elétricos</label>
                                        <input type="number" step="0.01" id="p-budget-eletricos" oninput="calculateTotalBudget()" class="mt-1 block w-full rounded-md border-gray-300 dark:border-gray-600 shadow-sm focus:border-primary focus:ring focus:ring-primary/50 dark:bg-gray-700 dark:text-white sm:text-sm h-8" placeholder="0,00">
                                    </div>
                                    <div>
                                        <label for="p-budget-dosadoras" class="block text-xs font-medium text-gray-500 dark:text-gray-400">Dosadoras</label>
                                        <input type="number" step="0.01" id="p-budget-dosadoras" oninput="calculateTotalBudget()" class="mt-1 block w-full rounded-md border-gray-300 dark:border-gray-600 shadow-sm focus:border-primary focus:ring focus:ring-primary/50 dark:bg-gray-700 dark:text-white sm:text-sm h-8" placeholder="0,00">
                                    </div>
                                    <div>
                                        <label for="p-budget-terceiros" class="block text-xs font-medium text-gray-500 dark:text-gray-400">Terceiros</label>
                                        <input type="number" step="0.01" id="p-budget-terceiros" oninput="calculateTotalBudget()" class="mt-1 block w-full rounded-md border-gray-300 dark:border-gray-600 shadow-sm focus:border-primary focus:ring focus:ring-primary/50 dark:bg-gray-700 dark:text-white sm:text-sm h-8" placeholder="0,00">
                                    </div>
                                    <div>
                                        <label for="p-budget-frete" class="block text-xs font-medium text-gray-500 dark:text-gray-400">Frete</label>
                                        <input type="number" step="0.01" id="p-budget-frete" oninput="calculateTotalBudget()" class="mt-1 block w-full rounded-md border-gray-300 dark:border-gray-600 shadow-sm focus:border-primary focus:ring focus:ring-primary/50 dark:bg-gray-700 dark:text-white sm:text-sm h-8" placeholder="0,00">
                                    </div>
                                    <div>
                                        <label for="p-budget-eletrolise" class="block text-xs font-medium text-gray-500 dark:text-gray-400">Eletrólise</label>
                                        <input type="number" step="0.01" id="p-budget-eletrolise" oninput="calculateTotalBudget()" class="mt-1 block w-full rounded-md border-gray-300 dark:border-gray-600 shadow-sm focus:border-primary focus:ring focus:ring-primary/50 dark:bg-gray-700 dark:text-white sm:text-sm h-8" placeholder="0,00">
                                    </div>
                                </div>
                            </div>
                            <div>
                                <label for="p-budget" class="block text-sm font-medium text-gray-700 dark:text-gray-300">Meta Total (R$)</label>
                                <input type="number" step="0.01" id="p-budget" readonly class="mt-1 block w-full rounded-md border-gray-300 dark:border-gray-600 bg-gray-100 dark:bg-gray-600 shadow-sm focus:border-primary focus:ring focus:ring-primary/50 dark:text-white sm:text-sm font-bold text-gray-700" placeholder="0,00">
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

window.calculateTotalBudget = () => {
    const ids = [
        'p-budget-reservatorios', 'p-budget-filtros', 'p-budget-bombas',
        'p-budget-hidraulicos', 'p-budget-eletricos', 'p-budget-dosadoras',
        'p-budget-terceiros', 'p-budget-frete', 'p-budget-eletrolise'
    ];

    let total = 0;
    ids.forEach(id => {
        const val = parseFloat(document.getElementById(id).value) || 0;
        total += val;
    });

    document.getElementById('p-budget').value = total > 0 ? total.toFixed(2) : '';
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
    document.getElementById('p-budget').value = '';

    // Reset detailed budgets
    ['reservatorios', 'filtros', 'bombas', 'hidraulicos', 'eletricos', 'dosadoras', 'terceiros', 'frete', 'eletrolise'].forEach(key => {
        document.getElementById(`p-budget-${key}`).value = '';
    });

    const dueInput = document.getElementById('p-due');
    dueInput.value = '';
    dueInput.disabled = false;

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
    document.getElementById('p-budget').value = project.budget_goal || '';

    // Load detailed budgets
    document.getElementById('p-budget-reservatorios').value = project.budget_reservatorios || '';
    document.getElementById('p-budget-filtros').value = project.budget_filtros || '';
    document.getElementById('p-budget-bombas').value = project.budget_bombas || '';
    document.getElementById('p-budget-hidraulicos').value = project.budget_hidraulicos || '';
    document.getElementById('p-budget-eletricos').value = project.budget_eletricos || '';
    document.getElementById('p-budget-dosadoras').value = project.budget_dosadoras || '';
    document.getElementById('p-budget-terceiros').value = project.budget_terceiros || '';
    document.getElementById('p-budget-frete').value = project.budget_frete || '';
    document.getElementById('p-budget-eletrolise').value = project.budget_eletrolise || '';

    const dueInput = document.getElementById('p-due');
    dueInput.value = project.due_date;
    dueInput.disabled = true;

    document.getElementById('project-modal').classList.remove('hidden');
}

window.saveProject = async () => {
    const code = document.getElementById('p-code').value;
    const name = document.getElementById('p-name').value;
    const status = document.getElementById('p-status').value;
    const dueDate = document.getElementById('p-due').value;
    const budget = document.getElementById('p-budget').value;

    // Get detailed budgets
    const budget_reservatorios = document.getElementById('p-budget-reservatorios').value || null;
    const budget_filtros = document.getElementById('p-budget-filtros').value || null;
    const budget_bombas = document.getElementById('p-budget-bombas').value || null;
    const budget_hidraulicos = document.getElementById('p-budget-hidraulicos').value || null;
    const budget_eletricos = document.getElementById('p-budget-eletricos').value || null;
    const budget_dosadoras = document.getElementById('p-budget-dosadoras').value || null;
    const budget_terceiros = document.getElementById('p-budget-terceiros').value || null;
    const budget_frete = document.getElementById('p-budget-frete').value || null;
    const budget_eletrolise = document.getElementById('p-budget-eletrolise').value || null;

    if (!name) {
        alert('O Nome do Projeto é obrigatório');
        return;
    }

    const projectData = {
        code,
        name,
        status,
        due_date: dueDate || null,
        budget_goal: budget || null,
        budget_reservatorios,
        budget_filtros,
        budget_bombas,
        budget_hidraulicos,
        budget_eletricos,
        budget_dosadoras,
        budget_terceiros,
        budget_frete,
        budget_eletrolise
    };

    try {
        if (editingProjectId) {
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
