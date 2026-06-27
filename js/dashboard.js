let allProjects = [];
let currentRenderId = 0;

document.addEventListener('DOMContentLoaded', async () => {
    const [projects, tasks, allItems] = await Promise.all([
        fetchProjectSummaries(),
        fetchTasks(),
        _supabase.from('project_forecast_items').select('project_id, quantity, value, is_paid').then(r => r.data)
    ]);

    // Map forecast costs (unpaid only)
    const itemsMap = {};
    if (allItems) {
        allItems.forEach(item => {
            if (!itemsMap[item.project_id]) itemsMap[item.project_id] = 0;
            if (!item.is_paid) itemsMap[item.project_id] += (parseFloat(item.quantity) || 0) * (parseFloat(item.value) || 0);
        });
    }
    projects.forEach(p => p.forecast_total = itemsMap[p.id] || 0);

    allProjects = projects;
    const stats = calculateLocalStats(projects, tasks);

    loadDashboardStats(stats, tasks);
    loadProjectsTable(projects.slice(0, 8));
    loadUpcomingDeadlines(tasks, projects);
    loadProjectsByStatus(projects);
    setupNotifications(projects);
    setupActionMenu();

    // Event listeners
    document.getElementById('dashboardSearch')?.addEventListener('input', filterDashboard);
    document.getElementById('dashboardStatusFilter')?.addEventListener('change', filterDashboard);

    window.addEventListener('project-saved', async () => {
        const [projects, tasks] = await Promise.all([fetchProjectSummaries(), fetchTasks()]);
        const allIt = await _supabase.from('project_forecast_items').select('project_id, quantity, value, is_paid').then(r => r.data);
        const iMap = {};
        if (allIt) allIt.forEach(item => {
            if (!iMap[item.project_id]) iMap[item.project_id] = 0;
            if (!item.is_paid) iMap[item.project_id] += (parseFloat(item.quantity) || 0) * (parseFloat(item.value) || 0);
        });
        projects.forEach(p => p.forecast_total = iMap[p.id] || 0);
        allProjects = projects;
        const stats = calculateLocalStats(projects, tasks);
        loadDashboardStats(stats, tasks);
        loadProjectsTable(projects.slice(0, 8));
        loadUpcomingDeadlines(tasks, projects);
        loadProjectsByStatus(projects);
        setupNotifications(projects);
    });
});

// ─── Hook for shared modal ────────────────────────────────────────────────────
window.getProjectById = (id) => allProjects.find(p => p.id === id);

// ─── Stats ────────────────────────────────────────────────────────────────────

function calculateLocalStats(projects, tasks) {
    const activeProjects = projects.filter(p => p.status === 'In Progress' || p.status === 'Em Andamento').length;
    const today = new Date().toISOString().split('T')[0];
    const tasksDueToday = tasks.filter(t => t.due_date === today).length;
    const overdueTasks = tasks.filter(t => t.due_date < today && t.status !== 'Done' && t.status !== 'Concluída').length;
    return { activeProjects, tasksDueToday, overdueTasks };
}

function loadDashboardStats(stats, tasks) {
    document.getElementById('stats-active-projects').textContent = stats.activeProjects;
    document.getElementById('stats-tasks-due').textContent = stats.tasksDueToday;
    document.getElementById('stats-overdue-tasks').textContent = stats.overdueTasks;

    if (tasks && tasks.length > 0) {
        const completed = tasks.filter(t => t.status === 'Done' || t.status === 'Concluída').length;
        const pct = Math.round((completed / tasks.length) * 100);
        document.getElementById('stats-completed-text').textContent = `${pct}%`;
        document.getElementById('stats-completed-bar').style.width = `${pct}%`;
    } else {
        document.getElementById('stats-completed-text').textContent = '0%';
        document.getElementById('stats-completed-bar').style.width = '0%';
    }
}

// ─── Filters ──────────────────────────────────────────────────────────────────

function filterDashboard() {
    const searchVal = (document.getElementById('dashboardSearch')?.value || '').toLowerCase();
    const statusVal = document.getElementById('dashboardStatusFilter')?.value || 'All';

    let filtered = allProjects.filter(p => {
        const matchesStatus = statusVal === 'All' || p.status === statusVal;
        const matchesSearch = p.name.toLowerCase().includes(searchVal);
        return matchesStatus && matchesSearch;
    });

    if (searchVal === '' && statusVal === 'All') filtered = filtered.slice(0, 8);
    loadProjectsTable(filtered);
}

// ─── Projects Table ───────────────────────────────────────────────────────────

function getStatusBadge(status) {
    const s = (status || '').trim();
    if (s === 'In Progress' || s === 'Em Andamento') {
        return `<span class="inline-flex items-center gap-1 rounded-full bg-blue-100 dark:bg-blue-900/30 px-2 py-0.5 text-xs font-semibold text-blue-700 dark:text-blue-300"><span class="size-1.5 rounded-full bg-blue-500 animate-pulse"></span>Em Andamento</span>`;
    }
    if (s === 'Completed' || s === 'Concluído') {
        return `<span class="inline-flex items-center gap-1 rounded-full bg-emerald-100 dark:bg-emerald-900/30 px-2 py-0.5 text-xs font-semibold text-emerald-700 dark:text-emerald-300"><span class="size-1.5 rounded-full bg-emerald-500"></span>Concluído</span>`;
    }
    if (s === 'On Hold' || s === 'Em Espera') {
        return `<span class="inline-flex items-center gap-1 rounded-full bg-amber-100 dark:bg-amber-900/30 px-2 py-0.5 text-xs font-semibold text-amber-700 dark:text-amber-300"><span class="size-1.5 rounded-full bg-amber-400"></span>Em Espera</span>`;
    }
    return `<span class="text-xs text-gray-400">${s || '-'}</span>`;
}

function getProgressColor(progress) {
    if (progress >= 80) return '#16a34a';
    if (progress >= 50) return '#2563eb';
    if (progress >= 20) return '#d97706';
    return '#9ca3af';
}

function formatCurrency(value) {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value || 0);
}

function loadProjectsTable(projects) {
    currentRenderId++;
    const thisRenderId = currentRenderId;
    const tbody = document.getElementById('dashboard-projects-table');
    tbody.innerHTML = '';

    if (projects.length === 0) {
        tbody.innerHTML = `<tr><td colspan="9" class="px-6 py-10 text-center">
            <div class="flex flex-col items-center gap-2">
                <span class="material-symbols-outlined text-gray-300 dark:text-gray-600" style="font-size:36px">search_off</span>
                <p class="text-sm text-gray-400">Nenhum projeto encontrado para os filtros aplicados.</p>
            </div>
        </td></tr>`;
        return;
    }

    const today = new Date().toISOString().split('T')[0];

    for (const project of projects) {
        if (thisRenderId !== currentRenderId) return;

        const totalTasks = project.total_tasks || 0;
        const completedTasks = project.completed_tasks || 0;
        const progress = totalTasks === 0 ? 0 : Math.round((completedTasks / totalTasks) * 100);
        const progressColor = getProgressColor(progress);

        const totalCost = parseFloat(project.total_cost || 0);
        const budget = parseFloat(project.budget_goal || 0);
        const balance = budget - totalCost;

        // Balance chip with contextual color
        let balanceHtml;
        if (budget === 0) {
            balanceHtml = `<span class="text-xs text-gray-400">-</span>`;
        } else if (balance < 0) {
            balanceHtml = `<span class="inline-flex px-2 py-0.5 rounded-md bg-red-50 dark:bg-red-900/20 text-xs font-bold text-red-700 dark:text-red-400">${formatCurrency(balance)}</span>`;
        } else if (balance < budget * 0.2) {
            balanceHtml = `<span class="inline-flex px-2 py-0.5 rounded-md bg-amber-50 dark:bg-amber-900/20 text-xs font-bold text-amber-700 dark:text-amber-400">${formatCurrency(balance)}</span>`;
        } else {
            balanceHtml = `<span class="inline-flex px-2 py-0.5 rounded-md bg-emerald-50 dark:bg-emerald-900/20 text-xs font-bold text-emerald-700 dark:text-emerald-400">${formatCurrency(balance)}</span>`;
        }

        const leadName = project.lead_name || (project.lead ? project.lead.name : '-');
        const isOverdue = project.due_date && project.due_date < today && project.status !== 'Completed' && project.status !== 'Concluído';
        const dueDateHtml = project.due_date
            ? `<span class="${isOverdue ? 'text-red-600 dark:text-red-400 font-semibold' : 'text-gray-600 dark:text-gray-400'} text-xs">${formatDate(project.due_date)}${isOverdue ? ' ⚠' : ''}</span>`
            : '<span class="text-xs text-gray-400">-</span>';

        const row = document.createElement('tr');
        row.className = 'hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors';
        row.innerHTML = `
            <td class="px-5 py-3.5 whitespace-nowrap">
                <div>
                    <p class="text-sm font-semibold text-gray-900 dark:text-white">${project.name}</p>
                    ${project.code ? `<p class="text-[10px] text-gray-400 mt-0.5">#${project.code}</p>` : ''}
                </div>
            </td>
            <td class="px-5 py-3.5 whitespace-nowrap">${getStatusBadge(project.status)}</td>
            <td class="px-5 py-3.5 whitespace-nowrap text-xs text-gray-600 dark:text-gray-400">${leadName}</td>
            <td class="px-5 py-3.5 whitespace-nowrap text-xs text-gray-600 dark:text-gray-400">${budget > 0 ? formatCurrency(budget) : '<span class="text-gray-400">-</span>'}</td>
            <td class="px-5 py-3.5 whitespace-nowrap">${balanceHtml}</td>
            <td class="px-5 py-3.5 whitespace-nowrap">${dueDateHtml}</td>
            <td class="px-5 py-3.5 whitespace-nowrap">
                <div class="flex items-center gap-2">
                    <div class="flex-1 h-1.5 bg-gray-200 dark:bg-gray-700 rounded-full w-20 overflow-hidden">
                        <div class="h-1.5 rounded-full transition-all duration-500" style="width:${progress}%;background:${progressColor}"></div>
                    </div>
                    <span class="text-xs font-semibold text-gray-700 dark:text-gray-300 w-8 text-right">${progress}%</span>
                </div>
                <p class="text-[10px] text-gray-400 mt-0.5">${completedTasks}/${totalTasks} tarefas</p>
            </td>
            <td class="px-5 py-3.5 whitespace-nowrap text-xs ${project.forecast_total > 0 ? 'font-semibold text-gray-700 dark:text-gray-300' : 'text-gray-400'}">${formatCurrency(project.forecast_total || 0)}</td>
            <td class="px-5 py-3.5 whitespace-nowrap text-right">
                <button onclick="openProjectActionMenu(event, '${project.id}')"
                    class="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 p-1 rounded-full hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors">
                    <span class="material-symbols-outlined" style="font-size:20px">more_vert</span>
                </button>
            </td>
        `;
        tbody.appendChild(row);
    }
}

// ─── Upcoming Deadlines (with task name + urgency) ────────────────────────────

function loadUpcomingDeadlines(tasks, projects) {
    const container = document.getElementById('upcoming-deadlines-container');
    if (!container) return;
    container.innerHTML = '';

    const projectMap = {};
    projects.forEach(p => projectMap[p.id] = p.name);

    const now = new Date();
    now.setHours(0, 0, 0, 0);

    const pendingTasks = tasks
        .filter(t => t.status !== 'Done' && t.status !== 'Concluída' && t.due_date)
        .sort((a, b) => new Date(a.due_date) - new Date(b.due_date))
        .slice(0, 5);

    if (pendingTasks.length === 0) {
        container.innerHTML = `
            <div class="flex flex-col items-center gap-2 py-6">
                <span class="material-symbols-outlined text-gray-300 dark:text-gray-600" style="font-size:32px">event_available</span>
                <p class="text-xs text-gray-400">Nenhum prazo próximo.</p>
            </div>
        `;
        return;
    }

    pendingTasks.forEach(task => {
        const projectName = projectMap[task.project_id] || 'Sem Projeto';
        const taskTitle = task.title || task.name || task.description || 'Sem título';
        const dueDate = new Date(task.due_date);
        dueDate.setHours(0, 0, 0, 0);

        const diffDays = Math.round((dueDate - now) / (1000 * 60 * 60 * 24));

        let urgencyText, urgencyClass, rowBg;
        if (diffDays < 0) {
            urgencyText = `${Math.abs(diffDays)}d atrasado`;
            urgencyClass = 'text-red-600 dark:text-red-400';
            rowBg = 'bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800';
        } else if (diffDays === 0) {
            urgencyText = 'Vence hoje!';
            urgencyClass = 'text-amber-600 dark:text-amber-400';
            rowBg = 'bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800';
        } else if (diffDays <= 3) {
            urgencyText = `${diffDays}d restantes`;
            urgencyClass = 'text-amber-600 dark:text-amber-400';
            rowBg = 'bg-amber-50/50 dark:bg-amber-900/10 border border-amber-100 dark:border-amber-900';
        } else {
            urgencyText = `${diffDays}d restantes`;
            urgencyClass = 'text-blue-600 dark:text-blue-400';
            rowBg = 'bg-blue-50/30 dark:bg-blue-900/10 border border-blue-100 dark:border-blue-900/50';
        }

        const monthStr = dueDate.toLocaleString('pt-BR', { month: 'short' }).replace('.', '');

        const div = document.createElement('div');
        div.className = `flex items-center gap-3 p-2.5 rounded-lg ${rowBg}`;
        div.innerHTML = `
            <div class="flex flex-col items-center justify-center w-10 h-10 rounded-lg bg-white dark:bg-gray-800 shadow-sm border border-gray-200 dark:border-gray-700 flex-shrink-0">
                <span class="text-sm font-extrabold text-gray-800 dark:text-white leading-none">${dueDate.getDate()}</span>
                <span class="text-[9px] text-gray-400 leading-tight uppercase">${monthStr}</span>
            </div>
            <div class="flex-1 min-w-0">
                <p class="text-xs font-semibold text-gray-800 dark:text-white truncate">${taskTitle}</p>
                <p class="text-[10px] text-gray-500 dark:text-gray-400 truncate">${projectName}</p>
                <span class="text-[10px] font-bold ${urgencyClass}">${urgencyText}</span>
            </div>
        `;
        container.appendChild(div);
    });
}

// ─── Portfolio by Status Widget ───────────────────────────────────────────────

function loadProjectsByStatus(projects) {
    const container = document.getElementById('projects-by-status-container');
    if (!container) return;

    const total = projects.length;
    if (total === 0) {
        container.innerHTML = '<p class="text-xs text-gray-400 text-center py-4">Nenhum projeto cadastrado.</p>';
        return;
    }

    const inProgress = projects.filter(p => p.status === 'In Progress' || p.status === 'Em Andamento').length;
    const completed = projects.filter(p => p.status === 'Completed' || p.status === 'Concluído').length;
    const onHold = projects.filter(p => p.status === 'On Hold' || p.status === 'Em Espera').length;

    const totalBudget = projects.reduce((s, p) => s + parseFloat(p.budget_goal || 0), 0);
    const totalCost = projects.reduce((s, p) => s + parseFloat(p.total_cost || 0), 0);
    const budgetUsedPct = totalBudget > 0 ? Math.round((totalCost / totalBudget) * 100) : 0;
    const budgetColor = budgetUsedPct > 100 ? '#dc2626' : budgetUsedPct > 80 ? '#d97706' : '#16a34a';

    const bars = [
        { label: 'Em Andamento', count: inProgress, color: '#2563eb' },
        { label: 'Concluídos', count: completed, color: '#16a34a' },
        { label: 'Em Espera', count: onHold, color: '#d97706' },
    ];

    container.innerHTML = bars.map(({ label, count, color }) => {
        const pct = total > 0 ? Math.round((count / total) * 100) : 0;
        return `
            <div>
                <div class="flex items-center justify-between mb-1">
                    <span class="text-xs font-medium text-gray-600 dark:text-gray-400">${label}</span>
                    <span class="text-xs font-bold text-gray-900 dark:text-white">${count} <span class="font-normal text-gray-400 text-[10px]">(${pct}%)</span></span>
                </div>
                <div class="w-full h-2 rounded-full bg-gray-100 dark:bg-gray-800 overflow-hidden">
                    <div class="h-2 rounded-full transition-all duration-700" style="width:${pct}%;background:${color}"></div>
                </div>
            </div>
        `;
    }).join('') + `
        <div class="mt-4 pt-3 border-t border-gray-200 dark:border-gray-700 space-y-2">
            <div class="flex items-center justify-between text-xs">
                <span class="text-gray-500 dark:text-gray-400">Total de Projetos</span>
                <span class="font-bold text-gray-900 dark:text-white">${total}</span>
            </div>
            <div class="flex items-center justify-between text-xs">
                <span class="text-gray-500 dark:text-gray-400">Orçamento Utilizado</span>
                <span class="font-bold" style="color:${budgetColor}">${budgetUsedPct}%</span>
            </div>
            <div class="w-full h-1.5 rounded-full bg-gray-100 dark:bg-gray-800 overflow-hidden">
                <div class="h-1.5 rounded-full transition-all duration-700" style="width:${Math.min(budgetUsedPct,100)}%;background:${budgetColor}"></div>
            </div>
        </div>
        <a href="listaprojetos.html" class="mt-3 flex items-center justify-center gap-1.5 w-full py-2 rounded-lg text-xs font-semibold text-primary hover:bg-primary/10 dark:hover:bg-primary/20 transition-colors border border-primary/20">
            <span class="material-symbols-outlined" style="font-size:13px">open_in_new</span>
            Ver todos os projetos
        </a>
    `;
}

// ─── Notifications ────────────────────────────────────────────────────────────

function setupNotifications(projects) {
    const btn = document.getElementById('notification-btn');
    const badge = document.getElementById('notification-badge');
    const dropdown = document.getElementById('notification-dropdown');
    const list = document.getElementById('notification-list');
    if (!btn || !dropdown || !list) return;

    const oneDayAgo = new Date();
    oneDayAgo.setDate(oneDayAgo.getDate() - 1);
    const recentProjects = projects.filter(p => new Date(p.created_at) > oneDayAgo);

    const lastReadTime = localStorage.getItem('lastNotificationReadTime');
    const lastReadDate = lastReadTime ? new Date(lastReadTime) : new Date(0);
    const unreadCount = recentProjects.filter(p => new Date(p.created_at) > lastReadDate).length;

    badge.classList.toggle('hidden', unreadCount === 0);

    list.innerHTML = recentProjects.length > 0
        ? recentProjects.map(p => `
            <div class="px-4 py-3 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors border-b border-gray-100 dark:border-gray-700 last:border-0">
                <p class="text-xs font-semibold text-gray-900 dark:text-white">Novo Projeto Criado</p>
                <p class="text-[10px] text-gray-500 dark:text-gray-400 mt-0.5">"${p.name}" foi criado recentemente.</p>
                <p class="text-[10px] text-gray-400 mt-0.5">${new Date(p.created_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</p>
            </div>
        `).join('')
        : '<div class="px-4 py-6 text-xs text-gray-500 dark:text-gray-400 text-center">Nenhuma notificação nova</div>';

    btn.onclick = (e) => {
        e.stopPropagation();
        const isHidden = dropdown.classList.contains('hidden');
        if (isHidden) {
            dropdown.classList.remove('hidden');
            badge.classList.add('hidden');
            localStorage.setItem('lastNotificationReadTime', new Date().toISOString());
        } else {
            dropdown.classList.add('hidden');
        }
    };

    document.addEventListener('click', (e) => {
        if (!dropdown.contains(e.target) && !btn.contains(e.target)) dropdown.classList.add('hidden');
    });
}

// ─── Action Menu ──────────────────────────────────────────────────────────────

window.openProjectActionMenu = (event, projectId) => {
    event.stopPropagation();
    const menu = document.getElementById('project-action-menu');
    if (!menu) return;

    const buttonRect = event.currentTarget.getBoundingClientRect();
    const menuWidth = 192;
    menu.style.left = `${buttonRect.left - menuWidth + buttonRect.width}px`;
    menu.style.top = `${buttonRect.bottom + window.scrollY + 5}px`;

    document.getElementById('menu-item-forecast').href = `previsao_projeto.html?project=${projectId}`;
    document.getElementById('menu-item-edit').onclick = () => {
        menu.classList.add('hidden');
        window.editProject?.(projectId);
    };
    document.getElementById('menu-item-delete').onclick = () => {
        menu.classList.add('hidden');
        window.openDeleteModal?.(projectId);
    };

    menu.classList.remove('hidden');
};

function setupActionMenu() {
    const menu = document.getElementById('project-action-menu');
    if (!menu) return;
    document.addEventListener('click', (e) => { if (!menu.contains(e.target)) menu.classList.add('hidden'); });
    document.addEventListener('scroll', () => menu.classList.add('hidden'), true);
}
