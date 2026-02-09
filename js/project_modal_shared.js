// Shared Project Modal Logic
// Depends on: api.js (createProject, updateProject, deleteProject)
// Depends on: window.getProjectById(id) -> returns project object
// Dispatches: 'projectChanged' event on window when changes occur

let editingProjectId = null;
let projectToDeleteId = null;

// Ensure this runs after DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    setupProjectModal();
    setupDeleteModal();
});

function setupProjectModal() {
    // Avoid double injection
    if (document.getElementById('project-modal')) return;

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
                                <label for="p-client" class="block text-sm font-medium text-gray-700 dark:text-gray-300">Cliente</label>
                                <select id="p-client" class="mt-1 block w-full rounded-md border-gray-300 dark:border-gray-600 shadow-sm focus:border-primary focus:ring focus:ring-primary/50 dark:bg-gray-700 dark:text-white sm:text-sm">
                                    <option value="">Selecione um cliente...</option>
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
}


function calculateTotalBudget() {
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
window.calculateTotalBudget = calculateTotalBudget;

function setupDeleteModal() {
    if (document.getElementById('delete-modal')) return;

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

// Global exposure
window.openNewProjectModal = () => {
    editingProjectId = null;
    document.getElementById('modal-title').textContent = 'Novo Projeto';
    document.getElementById('p-code').value = '';
    document.getElementById('p-name').value = '';
    document.getElementById('p-status').value = 'In Progress';
    document.getElementById('p-client').value = ''; // Reset client
    document.getElementById('p-budget').value = '';

    // Reset detailed budgets
    ['reservatorios', 'filtros', 'bombas', 'hidraulicos', 'eletricos', 'dosadoras', 'terceiros', 'frete', 'eletrolise'].forEach(key => {
        const el = document.getElementById(`p-budget-${key}`);
        if (el) el.value = '';
    });

    const dueInput = document.getElementById('p-due');
    dueInput.value = '';
    dueInput.disabled = false;

    document.getElementById('project-modal').classList.remove('hidden');
    loadClientsForModal();
}

window.closeModal = () => {
    document.getElementById('project-modal').classList.add('hidden');
}

window.editProject = async (id) => {
    editingProjectId = id;

    // Abstract retrieval to support different page contexts
    let project = null;
    if (window.getProjectById) {
        project = window.getProjectById(id);
    }

    // If not found, try to fetch it if API available (fallback) or error
    if (!project && typeof _supabase !== 'undefined') {
        try {
            const { data } = await _supabase.from('projects').select('*').eq('id', id).single();
            project = data;
        } catch (e) { console.error(e); }
    }


    if (!project) {
        console.error('Project not found for editing:', id);
        return;
    }

    await loadClientsForModal();

    document.getElementById('modal-title').textContent = 'Editar Projeto';
    document.getElementById('p-code').value = project.code || '';
    document.getElementById('p-name').value = project.name;
    document.getElementById('p-status').value = project.status;
    document.getElementById('p-client').value = project.client_id || '';
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
    dueInput.value = project.due_date ? project.due_date.split('T')[0] : '';
    dueInput.disabled = true;

    document.getElementById('project-modal').classList.remove('hidden');
}

async function loadClientsForModal() {
    const select = document.getElementById('p-client');
    if (select.options.length > 1) return; // Already loaded

    try {
        const clients = await fetchClients(); // Assumes api.js is available
        clients.forEach(client => {
            const option = document.createElement('option');
            option.value = client.id;
            option.textContent = client.name;
            select.appendChild(option);
        });
    } catch (error) {
        console.error('Error loading clients for modal:', error);
    }
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
    const clientId = document.getElementById('p-client').value || null;

    if (!name) {
        alert('O Nome do Projeto é obrigatório');
        return;
    }

    const projectData = {
        code,
        name,
        status,
        client_id: clientId,
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

        // Dispatch event for updating UI
        window.dispatchEvent(new CustomEvent('project-saved'));

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
        try {
            await deleteProject(projectToDeleteId);
            closeDeleteModal();
            // Dispatch event
            window.dispatchEvent(new CustomEvent('project-saved'));
        } catch (e) {
            alert('Falha ao excluir: ' + e.message);
        }
    }
}
