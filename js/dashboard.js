
document.addEventListener('DOMContentLoaded', async () => {
    console.log('Dashboard loading...');

    // Fetch data centrally to avoid redundant calls and ensure consistency
    const [stats, projects, tasks] = await Promise.all([
        fetchDashboardStats(),
        fetchProjects(),
        fetchTasks()
    ]);

    // Pass data to rendering functions
    loadDashboardStats(stats, tasks);
    loadProjectsTable(projects, tasks);
    loadUpcomingDeadlines(tasks, projects);
    setupNotifications(projects);
});

function setupNotifications(projects) {
    const btn = document.getElementById('notification-btn');
    const badge = document.getElementById('notification-badge');
    const dropdown = document.getElementById('notification-dropdown');
    const list = document.getElementById('notification-list');

    if (!btn || !dropdown || !list) return;

    // Filter projects created in last 24 hours
    const oneDayAgo = new Date();
    oneDayAgo.setDate(oneDayAgo.getDate() - 1);

    const newProjects = projects.filter(p => new Date(p.created_at) > oneDayAgo);

    if (newProjects.length > 0) {
        badge.classList.remove('hidden');
        list.innerHTML = '';
        newProjects.forEach(p => {
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
        badge.classList.add('hidden');
        list.innerHTML = '<div class="px-4 py-3 text-sm text-gray-500 dark:text-gray-400 text-center">Nenhuma notificação nova</div>';
    }

    // Toggle Dropdown
    btn.onclick = (e) => {
        e.stopPropagation();
        dropdown.classList.toggle('hidden');
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

function loadProjectsTable(projects, tasks) {
    const tableBody = document.getElementById('dashboard-projects-table');
    tableBody.innerHTML = '';

    projects.slice(0, 5).forEach(project => {
        // Calculate progress dynamically based on tasks
        const projectTasks = tasks.filter(t => t.project_id === project.id);
        const totalTasks = projectTasks.length;
        const completedTasks = projectTasks.filter(t => t.status === 'Done').length;

        let progress = totalTasks === 0 ? 0 : Math.round((completedTasks / totalTasks) * 100);

        const row = document.createElement('tr');
        row.className = "hover:bg-gray-50 dark:hover:bg-gray-800/50";
        row.innerHTML = `
             <td class="px-6 py-4 whitespace-nowrap text-[#0d121b] dark:text-white text-sm font-medium">${project.name}</td>
             <td class="px-6 py-4 whitespace-nowrap text-gray-500 dark:text-gray-400 text-sm">${project.lead ? project.lead.name : '-'}</td>
             <td class="px-6 py-4 whitespace-nowrap text-gray-500 dark:text-gray-400 text-sm">${formatDate(project.due_date)}</td>
             <td class="px-6 py-4 whitespace-nowrap text-gray-500 dark:text-gray-400 text-sm">
               <div class="flex items-center gap-2">
                 <div class="flex-1 h-2 bg-gray-200 dark:bg-gray-700 rounded-full w-24">
                   <div class="h-2 bg-primary rounded-full" style="width: ${progress}%"></div>
                 </div>
                 <span class="text-xs">${progress}%</span>
               </div>
             </td>
             <td class="px-6 py-4 whitespace-nowrap text-right text-sm">
                <button class="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"><span class="material-symbols-outlined">more_vert</span></button>
             </td>
        `;
        tableBody.appendChild(row);
    });
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
                <p class="text-sm font-bold text-[#0d121b] dark:text-white line-clamp-1">${task.title}</p>
                <p class="text-xs text-gray-500 dark:text-gray-400 mt-1">${projectName}</p>
            </div>
        `;
        container.appendChild(div);
    });
}
