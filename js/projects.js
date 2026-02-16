document.addEventListener('DOMContentLoaded', async () => {
    console.log('Projects list loading...');
    await loadProjectsList();

    // Setup search and filter listeners
    const searchInput = document.getElementById('projectSearch');
    if (searchInput) {
        searchInput.addEventListener('input', filterProjects);
    }

    // Initial sort/filter application if elements exist
    if (document.getElementById('projectSearch')) {
        filterProjects();
    }
});

let currentProjects = [];
let allProjects = []; // Store original full list
let currentPage = 1;
const itemsPerPage = 10;

async function loadProjectsList() {
    try {
        const { data: projects, error } = await _supabase
            .from('projects')
            .select(`
                *,
                lead:users!projects_lead_id_fkey(avatar_url, name)
            `)
            .order('created_at', { ascending: false });

        if (error) throw error;

        // Fetch Clients Lookup
        const { data: clientsData } = await _supabase.from('clients').select('id, name');
        const clientsMap = {};
        if (clientsData) {
            clientsData.forEach(c => clientsMap[c.id] = c.name);
        }

        // Fetch all project items for forecast calculation
        const { data: allItems } = await _supabase.from('project_forecast_items').select('project_id, quantity, value');
        const itemsMap = {};
        if (allItems) {
            allItems.forEach(item => {
                if (!itemsMap[item.project_id]) itemsMap[item.project_id] = 0;
                itemsMap[item.project_id] += (parseFloat(item.quantity) || 0) * (parseFloat(item.value) || 0);
            });
        }

        // Calculate progress and attach client name
        allProjects = await Promise.all(projects.map(async (p) => {
            const { data: tasks } = await _supabase.from('tasks').select('status').eq('project_id', p.id);
            let progress = 0;
            if (tasks && tasks.length > 0) {
                const completed = tasks.filter(t => t.status === 'Done' || t.status === 'Completed').length;
                progress = Math.round((completed / tasks.length) * 100);
            }

            // Map Client Name
            const resolvedClientName = p.client_id && clientsMap[p.client_id] ? clientsMap[p.client_id] : null;

            return {
                ...p,
                computedProgress: progress,
                client_name: resolvedClientName, // Override/Set client_name for display
                forecast_total: itemsMap[p.id] || 0
            };
        }));

        currentProjects = [...allProjects];
        filterProjects();

    } catch (error) {
        console.error('Error loading projects:', error);
        // alert('Erro ao carregar projetos: ' + error.message);
    }
}

window.filterProjects = () => {
    const searchTerm = document.getElementById('projectSearch')?.value.toLowerCase() || '';
    const statusFilter = document.getElementById('projectStatusFilter')?.value || 'All';
    const sortBy = document.getElementById('projectSort')?.value || 'created_desc';

    let filtered = allProjects.filter(project => {
        // Status Filter
        // Map database status to filter values if necessary, or ensure they match
        // DB statuses: 'In Progress', 'Completed', 'On Hold', 'Cancelled'
        // Filter values: 'Em Andamento', 'Concluído', 'Atrasado', 'Cancelado'

        let statusMatch = true;
        if (statusFilter !== 'All') {
            const statusMap = {
                'Em Andamento': 'In Progress',
                'Concluído': 'Completed',
                'Atrasado': 'On Hold', // Assuming 'On Hold' maps to 'Atrasado' concept or 'Late'
                'Cancelado': 'Cancelled'
            };
            // Check if project status matches the mapped filter value
            statusMatch = project.status === statusMap[statusFilter];
        }

        // Search Filter (Name or Client)
        const matchesSearch = (project.name && project.name.toLowerCase().includes(searchTerm)) ||
            (project.client_name && project.client_name.toLowerCase().includes(searchTerm));

        return statusMatch && matchesSearch;
    });

    // Sort logic
    filtered.sort((a, b) => {
        switch (sortBy) {
            case 'deadline':
                if (!a.due_date) return 1;
                if (!b.due_date) return -1;
                return new Date(a.due_date) - new Date(b.due_date);
            case 'created_desc':
                return new Date(b.created_at) - new Date(a.created_at);
            case 'created_asc':
                return new Date(a.created_at) - new Date(b.created_at);
            case 'name':
                return (a.name || '').localeCompare(b.name || '');
            default:
                return 0;
        }
    });

    currentPage = 1; // Reset to first page on filter
    renderProjectsTable(filtered);
}

window.sortProjects = () => {
    filterProjects();
}

function renderProjectsTable(projects) {
    const tableBody = document.querySelector('tbody');
    if (!tableBody) return;
    tableBody.innerHTML = '';

    // Pagination Logic
    const totalItems = projects.length;
    const totalPages = Math.ceil(totalItems / itemsPerPage);
    const startIndex = (currentPage - 1) * itemsPerPage;
    const endIndex = Math.min(startIndex + itemsPerPage, totalItems);
    const paginatedProjects = projects.slice(startIndex, endIndex);

    updatePaginationControls(totalItems, startIndex, endIndex, totalPages, projects);

    paginatedProjects.forEach(project => {
        // Translate Status for Display
        let displayStatus = project.status;
        let statusBadgeClass = '';

        // Ensure strictly matched cases
        if (project.status === 'In Progress') {
            displayStatus = 'Em Andamento';
            statusBadgeClass = 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300';
        } else if (project.status === 'Completed') {
            displayStatus = 'Concluído';
            statusBadgeClass = 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300';
        } else if (project.status === 'On Hold') {
            displayStatus = 'Em Espera';
            statusBadgeClass = 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-300';
        } else if (project.status === 'Cancelled') {
            displayStatus = 'Cancelado';
            statusBadgeClass = 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300';
        } else {
            statusBadgeClass = 'bg-gray-100 text-gray-700';
        }

        const progressVal = project.computedProgress !== undefined ? project.computedProgress : 0;

        const row = document.createElement('tr');
        row.className = "hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors";
        row.innerHTML = `
            <td class="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900 dark:text-white">#${(project.code || project.id).slice(0, 6)}</td>
            <td class="px-6 py-4 whitespace-nowrap">
                <div class="flex flex-col">
                    <span class="text-sm font-medium text-gray-900 dark:text-white">${project.name}</span>
                    <span class="text-xs text-gray-500 dark:text-gray-400">${project.client_name || 'Sem cliente'}</span>
                </div>
            </td>
            <td class="px-6 py-4 whitespace-nowrap">
                <span class="px-2 py-1 inline-flex text-xs leading-5 font-semibold rounded-full ${statusBadgeClass}">
                    ${displayStatus}
                </span>
            </td>
            <td class="px-6 py-4 whitespace-nowrap">
                ${project.due_date ? new Date(project.due_date).toLocaleDateString('pt-BR') : '-'}
            </td>
            <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                ${new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(project.forecast_total || 0)}
            </td>
            <td class="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                <div class="flex items-center justify-end gap-2">
                    <a href="previsao_projeto.html?project=${project.id}" class="text-blue-600 hover:text-blue-900 dark:text-blue-400 dark:hover:text-blue-300" title="Previsão de Materiais"><span class="material-symbols-outlined">analytics</span></a>
                    <button class="text-blue-600 hover:text-blue-900 dark:text-blue-400 dark:hover:text-blue-300" onclick="editProject('${project.id}')"><span class="material-symbols-outlined">edit</span></button>
                    <button class="text-red-600 hover:text-red-900 dark:text-red-400 dark:hover:text-red-300" onclick="openDeleteModal('${project.id}')"><span class="material-symbols-outlined">delete</span></button>
                </div>
            </td>
        `;
        tableBody.appendChild(row);
    });
}

// Ensure global access for listeners if needed
window.loadProjectsList = loadProjectsList;

// Provide helper for shared modal
window.getProjectById = (id) => {
    return allProjects.find(p => p.id === id);
};

function updatePaginationControls(totalItems, startIndex, endIndex, totalPages, currentFilteredList) {
    const infoEl = document.getElementById('paginationInfo');
    const prevBtn = document.getElementById('prevPage');
    const nextBtn = document.getElementById('nextPage');

    if (infoEl) {
        infoEl.textContent = `Mostrando ${totalItems > 0 ? startIndex + 1 : 0} a ${endIndex} de ${totalItems} resultados`;
    }

    if (prevBtn) {
        prevBtn.disabled = currentPage === 1;
        prevBtn.onclick = () => {
            if (currentPage > 1) {
                currentPage--;
                renderProjectsTable(currentFilteredList);
            }
        };
    }

    if (nextBtn) {
        nextBtn.disabled = currentPage >= totalPages || totalPages === 0;
        nextBtn.onclick = () => {
            if (currentPage < totalPages) {
                currentPage++;
                renderProjectsTable(currentFilteredList);
            }
        };
    }
}
