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

// Hook for shared modal
window.getProjectById = (id) => {
    return currentProjects.find(p => p.id === id);
};

window.addEventListener('project-saved', async () => {
    await loadProjectsList();
});

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

// Modal logic is now handled by js/project_modal_shared.js
