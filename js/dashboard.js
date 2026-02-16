

document.addEventListener('DOMContentLoaded', async () => {
    console.log('Dashboard loading...');

    // Fetch data optimized - using View for projects
    const [projects, tasks, allItems] = await Promise.all([
        fetchProjectSummaries(),
        fetchTasks(),
        _supabase.from('project_forecast_items').select('project_id, quantity, value, is_paid').then(res => res.data)
    ]);

    // Map forecast costs
    const itemsMap = {};
    if (allItems) {
        allItems.forEach(item => {
            if (!itemsMap[item.project_id]) itemsMap[item.project_id] = 0;
            // Only add if NOT paid
            if (!item.is_paid) {
                itemsMap[item.project_id] += (parseFloat(item.quantity) || 0) * (parseFloat(item.value) || 0);
            }
        });
    }

    // Pass data to rendering functions
    // Attach forecast to projects
    projects.forEach(p => p.forecast_total = itemsMap[p.id] || 0);

    allProjects = projects; // Store globally

    // Calculate stats client-side
    const stats = calculateLocalStats(projects, tasks);

    loadDashboardStats(stats, tasks);
    loadProjectsTable(projects.slice(0, 5));
    loadUpcomingDeadlines(tasks, projects);
    setupNotifications(projects);
    setupActionMenu();

    // Setup listeners
    const searchInput = document.getElementById('dashboardSearch');
    const headerSearch = document.getElementById('headerSearch');
    const statusSelect = document.getElementById('dashboardStatusFilter');


    if (searchInput) searchInput.addEventListener('input', () => filterDashboard());
    if (headerSearch) headerSearch.addEventListener('input', () => filterDashboard());
    if (statusSelect) statusSelect.addEventListener('change', () => filterDashboard());

    // Listen for shared modal updates
    window.addEventListener('project-saved', async () => {
        // Reload everything
        const [projects, tasks] = await Promise.all([
            fetchProjectSummaries(),
            fetchTasks()
        ]);
        allProjects = projects;
        const stats = calculateLocalStats(projects, tasks);
        loadDashboardStats(stats, tasks);
        loadProjectsTable(projects.slice(0, 5));
        loadUpcomingDeadlines(tasks, projects);
        setupNotifications(projects);
    });
});

function calculateLocalStats(projects, tasks) {
    const activeProjects = projects.filter(p => p.status === 'In Progress' || p.status === 'Em Andamento').length;
    const today = new Date().toISOString().split('T')[0];
    const tasksDueToday = tasks.filter(t => t.due_date === today).length;
    const overdueTasks = tasks.filter(t => t.due_date < today && t.status !== 'Done' && t.status !== 'Concluída').length;

    return {
        activeProjects,
        tasksDueToday,
        overdueTasks
    };
}

// Hook for shared modal
window.getProjectById = (id) => {
    return allProjects.find(p => p.id === id);
};

let allProjects = [];
let currentRenderId = 0;


function filterDashboard() {
    const searchValLower = document.getElementById('dashboardSearch') ? document.getElementById('dashboardSearch').value.toLowerCase() : '';
    const headerSearchVal = document.getElementById('headerSearch') ? document.getElementById('headerSearch').value.toLowerCase() : '';
    const searchVal = searchValLower || headerSearchVal;

    const statusEl = document.getElementById('dashboardStatusFilter');
    const statusVal = statusEl ? statusEl.value : 'All';

    let filtered = allProjects.filter(p => {
        const matchesStatus = statusVal === 'All' || p.status === statusVal;
        const matchesSearch = p.name.toLowerCase().includes(searchVal);
        return matchesStatus && matchesSearch;
    });

    // If no filter is active, show only top 5, else show all matches
    if (searchVal === '' && statusVal === 'All') {
        filtered = filtered.slice(0, 5);
    }

    loadProjectsTable(filtered);
}

function setupNotifications(projects) {
    const btn = document.getElementById('notification-btn');
    const badge = document.getElementById('notification-badge');
    const dropdown = document.getElementById('notification-dropdown');
    const list = document.getElementById('notification-list');

    if (!btn || !dropdown || !list) return;

    // Filter projects created in last 24 hours
    const oneDayAgo = new Date();
    oneDayAgo.setDate(oneDayAgo.getDate() - 1);

    const recentProjects = projects.filter(p => new Date(p.created_at) > oneDayAgo);

    // Check local storage for last read timestamp
    const lastReadTime = localStorage.getItem('lastNotificationReadTime');
    const lastReadDate = lastReadTime ? new Date(lastReadTime) : new Date(0);

    // Unread are recent ones created AFTER the last read time
    const unreadCount = recentProjects.filter(p => new Date(p.created_at) > lastReadDate).length;

    if (unreadCount > 0) {
        badge.classList.remove('hidden');
    } else {
        badge.classList.add('hidden');
    }

    if (recentProjects.length > 0) {
        list.innerHTML = '';
        recentProjects.forEach(p => {
            const item = document.createElement('div');
            item.className = 'px-4 py-3 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors border-b border-gray-100 dark:border-gray-700 last:border-0';
            item.innerHTML = `
                <p class="text-sm font-medium text-gray-900 dark:text-white">Novo Projeto Criado</p>
                <p class="text-xs text-gray-500 dark:text-gray-400 mt-1">"${p.name}" foi criado recentemente.</p>
                <p class="text-xs text-gray-400 mt-1">${new Date(p.created_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</p>
            `;
            list.appendChild(item);
        });
    } else {
        list.innerHTML = '<div class="px-4 py-3 text-sm text-gray-500 dark:text-gray-400 text-center">Nenhuma notificação nova</div>';
    }

    // Toggle Dropdown
    btn.onclick = (e) => {
        e.stopPropagation();
        const isHidden = dropdown.classList.contains('hidden');

        if (isHidden) {
            dropdown.classList.remove('hidden');
            // Dismiss notifications (mark as read)
            badge.classList.add('hidden');
            localStorage.setItem('lastNotificationReadTime', new Date().toISOString());
        } else {
            dropdown.classList.add('hidden');
        }
    };

    // Close on click outside
    document.addEventListener('click', (e) => {
        if (!dropdown.contains(e.target) && !btn.contains(e.target)) {
            dropdown.classList.add('hidden');
        }
    });
}

function loadDashboardStats(stats, tasks) {
    document.getElementById('stats-active-projects').textContent = stats.activeProjects;
    document.getElementById('stats-tasks-due').textContent = stats.tasksDueToday;
    document.getElementById('stats-overdue-tasks').textContent = stats.overdueTasks;

    // Calculate Global Completion Rate
    if (tasks && tasks.length > 0) {
        const completedTasks = tasks.filter(t => t.status === 'Done' || t.status === 'Concluída').length;
        const totalTasks = tasks.length;
        const percentage = Math.round((completedTasks / totalTasks) * 100);

        document.getElementById('stats-completed-text').textContent = `${percentage}%`;
        document.getElementById('stats-completed-bar').style.width = `${percentage}%`;
    } else {
        document.getElementById('stats-completed-text').textContent = `0%`;
        document.getElementById('stats-completed-bar').style.width = `0%`;
    }
}


function loadProjectsTable(projects) {
    // Generate a new ID for this render cycle
    currentRenderId++;
    const thisRenderId = currentRenderId;

    const tableBody = document.getElementById('dashboard-projects-table');
    tableBody.innerHTML = '';

    // projects is already the list we want to render (filtered or sliced)
    for (const project of projects) {
        // If a new render has started, abort this one
        if (thisRenderId !== currentRenderId) return;

        // Optimized: Data comes pre-calculated from View
        const totalTasks = project.total_tasks || 0;
        const completedTasks = project.completed_tasks || 0;

        let progress = totalTasks === 0 ? 0 : Math.round((completedTasks / totalTasks) * 100);

        // Optimized: Cost comes from View
        const totalCost = parseFloat(project.total_cost || 0);

        const budget = parseFloat(project.budget_goal || 0);
        const balance = budget - totalCost;
        const balanceClass = balance < 0 ? 'text-red-600 font-bold' : 'text-green-600 font-bold';

        // Adapt Lead Name (View returns lead_name directly)
        const leadName = project.lead_name || (project.lead ? project.lead.name : '-');

        const row = document.createElement('tr');
        row.className = "hover:bg-gray-50 dark:hover:bg-gray-800/50";
        row.innerHTML = `
             <td class="px-6 py-4 whitespace-nowrap text-[#0d121b] dark:text-white text-sm font-medium">${project.name}</td>
             <td class="px-6 py-4 whitespace-nowrap text-gray-500 dark:text-gray-400 text-sm">${leadName}</td>
             <td class="px-6 py-4 whitespace-nowrap text-gray-500 dark:text-gray-400 text-sm">${formatCurrency(budget)}</td>
             <td class="px-6 py-4 whitespace-nowrap ${balanceClass} text-sm">${formatCurrency(balance)}</td>
             <td class="px-6 py-4 whitespace-nowrap text-gray-500 dark:text-gray-400 text-sm">${formatDate(project.due_date)}</td>
             <td class="px-6 py-4 whitespace-nowrap text-gray-500 dark:text-gray-400 text-sm">
               <div class="flex items-center gap-2">
                 <div class="flex-1 h-2 bg-gray-200 dark:bg-gray-700 rounded-full w-24">
                   <div class="h-2 bg-primary rounded-full" style="width: ${progress}%"></div>
                 </div>
                 <span class="text-xs">${progress}%</span>
               </div>
             </td>
             <td class="px-6 py-4 whitespace-nowrap text-gray-500 dark:text-gray-400 text-sm">${formatCurrency(project.forecast_total || 0)}</td>
             <td class="px-6 py-4 whitespace-nowrap text-right text-sm">
                <button onclick="openProjectActionMenu(event, '${project.id}')" class="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 p-1 rounded-full hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"><span class="material-symbols-outlined">more_vert</span></button>
             </td>
        `;
        tableBody.appendChild(row);
    }
}

function formatCurrency(value) {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value || 0);
}

function loadUpcomingDeadlines(tasks, projects) {
    const container = document.getElementById('upcoming-deadlines-container');
    container.innerHTML = '';

    const projectMap = {};
    projects.forEach(p => projectMap[p.id] = p.name);

    const pendingTasks = tasks
        .filter(t => t.status !== 'Done' && t.due_date)
        .sort((a, b) => new Date(a.due_date) - new Date(b.due_date))
        .slice(0, 4);

    pendingTasks.forEach(task => {
        const projectName = projectMap[task.project_id] || 'Geral';
        const dueDate = new Date(task.due_date);

        const div = document.createElement('div');
        div.className = "flex items-start gap-4";
        div.innerHTML = `
            <div class="flex flex-col items-center justify-center w-12 h-12 rounded-lg bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400 font-medium text-xs">
                <span>${dueDate.getDate()}</span>
                <span>${dueDate.toLocaleString('pt-BR', { month: 'short' }).replace('.', '')}</span>
            </div>
            <div>
                <p class="text-xs text-gray-500 dark:text-gray-400 mt-1">${projectName}</p>
            </div>
        `;
        container.appendChild(div);
    });
}


window.openProjectActionMenu = (event, projectId) => {
    event.stopPropagation();
    const menu = document.getElementById('project-action-menu');
    if (!menu) return;

    // Position menu
    const buttonRect = event.currentTarget.getBoundingClientRect();
    const menuWidth = 192; // w-48 = 12rem = 192px roughly

    // Check if it fits on the right, else align left
    let left = buttonRect.left - menuWidth + buttonRect.width;
    let top = buttonRect.bottom + window.scrollY + 5;

    menu.style.left = `${left}px`;
    menu.style.top = `${top}px`;

    // Update Links/Actions
    const forecastLink = document.getElementById('menu-item-forecast');
    const editBtn = document.getElementById('menu-item-edit');
    const deleteBtn = document.getElementById('menu-item-delete');

    if (forecastLink) forecastLink.href = `previsao_projeto.html?project=${projectId}`;

    if (editBtn) {
        editBtn.onclick = () => {
            menu.classList.add('hidden');
            if (window.editProject) window.editProject(projectId); // Assuming shared modal is loaded
        };
    }

    if (deleteBtn) {
        deleteBtn.onclick = () => {
            menu.classList.add('hidden');
            if (window.openDeleteModal) window.openDeleteModal(projectId); // Assuming shared modal
        };
    }

    // Toggle Visibility
    // Close other menus if any (not implemented, but good practice)
    menu.classList.remove('hidden');
}

function setupActionMenu() {
    const menu = document.getElementById('project-action-menu');
    if (!menu) return;

    document.addEventListener('click', (e) => {
        if (!menu.contains(e.target)) {
            menu.classList.add('hidden');
        }
    });

    // Close on scroll to avoid floating menu detachment
    document.addEventListener('scroll', () => {
        menu.classList.add('hidden');
    }, true);
}
