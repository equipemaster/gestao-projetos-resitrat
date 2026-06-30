let currentRole = 'operator';
let currentAdminTab = 'pending';
let currentUser = null;
let userProfile = null;
let allProjects = [];
let allClients = [];
let allRequests = [];
let duplicateCheckTimeout = null;

document.addEventListener('DOMContentLoaded', async () => {
    await initAuthAndProfile();
    await loadInitialDropdowns();
    setupFormHandlers();
    setupModalHandlers();
    await refreshRequests();
});

// ─── Toast Notification ─────────────────────────────────────────────────────

function showToast(message, type = 'success', duration = 4000) {
    const container = document.getElementById('toast-container');
    if (!container) return;

    const icons = { success: 'check_circle', error: 'error', warning: 'warning', info: 'info' };
    const colors = { success: 'bg-emerald-600', error: 'bg-red-600', warning: 'bg-amber-500', info: 'bg-blue-600' };

    const toast = document.createElement('div');
    toast.className = `toast pointer-events-auto flex items-center gap-3 px-4 py-3 rounded-lg shadow-xl text-white text-xs font-medium max-w-sm ${colors[type] || colors.info}`;
    toast.innerHTML = `
        <span class="material-symbols-outlined flex-shrink-0" style="font-size:18px">${icons[type] || 'info'}</span>
        <span class="flex-1">${message}</span>
        <button onclick="this.parentElement.remove()" class="ml-1 opacity-70 hover:opacity-100 transition-opacity flex-shrink-0">
            <span class="material-symbols-outlined" style="font-size:16px">close</span>
        </button>
    `;
    container.appendChild(toast);

    setTimeout(() => {
        if (toast.parentElement) {
            toast.style.opacity = '0';
            toast.style.transform = 'translateX(100%)';
            toast.style.transition = 'all 0.3s ease-in';
            setTimeout(() => toast.remove(), 300);
        }
    }, duration);
}

// ─── Duplicate Detection ─────────────────────────────────────────────────────

function checkForDuplicates() {
    const operatorName = (document.getElementById('req-operator-name')?.value || '').trim().toUpperCase();
    const editingId = document.getElementById('editing-req-id')?.value || '';

    if (!operatorName || allRequests.length === 0) {
        hideDuplicateWarning();
        return false;
    }

    const itemRows = document.querySelectorAll('.item-row');
    const foundDups = [];

    itemRows.forEach(row => {
        const itemName = (row.querySelector('[name="item_name"]')?.value || '').trim().toUpperCase();
        if (!itemName) return;

        const pendingDups = allRequests.filter(r => {
            if (editingId && r.id === editingId) return false;
            return r.status === 'PENDENTE' &&
                (r.item_name || '').toUpperCase().trim() === itemName &&
                (r.requested_by || '').toUpperCase().trim() === operatorName;
        });

        if (pendingDups.length > 0) foundDups.push({ itemName, requests: pendingDups });
    });

    if (foundDups.length > 0) {
        showDuplicateWarning(foundDups);
        return true;
    }
    hideDuplicateWarning();
    return false;
}

function showDuplicateWarning(duplicates) {
    const warnDiv = document.getElementById('duplicate-warning');
    if (!warnDiv) return;

    const list = duplicates.map(d => {
        const req = d.requests[0];
        const dateStr = formatDate((req.created_at || '').split('T')[0]);
        const timeStr = req.created_at
            ? new Date(req.created_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
            : '';
        return `<li class="flex items-start gap-1.5"><span class="material-symbols-outlined text-amber-500 flex-shrink-0 mt-px" style="font-size:13px">fiber_manual_record</span><span><strong>${d.itemName}</strong> — solicitado em ${dateStr} às ${timeStr}, aguardando aprovação</span></li>`;
    }).join('');

    warnDiv.innerHTML = `
        <div class="flex gap-3">
            <span class="material-symbols-outlined text-amber-600 flex-shrink-0 mt-0.5" style="font-size:20px">warning</span>
            <div class="flex-1">
                <p class="font-bold text-amber-800 dark:text-amber-300 text-xs mb-1.5">Possível lançamento duplicado detectado!</p>
                <ul class="text-xs text-amber-700 dark:text-amber-400 space-y-0.5 mb-2.5">${list}</ul>
                <p class="text-xs text-amber-600 dark:text-amber-500 mb-2.5">Este item já possui uma requisição <strong>PENDENTE</strong>. Verifique antes de enviar novamente.</p>
                <label class="flex items-center gap-2 cursor-pointer select-none">
                    <input type="checkbox" id="confirm-duplicate" class="w-4 h-4 rounded border-amber-400 text-amber-600 focus:ring-amber-500">
                    <span class="text-xs font-semibold text-amber-800 dark:text-amber-200">Confirmo que é uma nova e diferente solicitação</span>
                </label>
            </div>
        </div>
    `;
    warnDiv.classList.remove('hidden');
}

function hideDuplicateWarning() {
    const warnDiv = document.getElementById('duplicate-warning');
    if (warnDiv) {
        warnDiv.classList.add('hidden');
        warnDiv.innerHTML = '';
    }
}

// ─── Auth & Profile ───────────────────────────────────────────────────────────

async function initAuthAndProfile() {
    try {
        const { data: { session }, error } = await _supabase.auth.getSession();
        if (error) throw error;

        const banner = document.getElementById('role-banner');
        const urlParams = new URLSearchParams(window.location.search);
        const isDev = urlParams.has('dev');

        if (isDev && (!session || !session.user)) {
            const devVal = urlParams.get('dev');
            currentRole = (devVal === 'admin' || devVal === 'adm') ? 'admin' : 'operator';
            currentUser = {
                email: currentRole === 'admin' ? 'financeiro.resitrat@gmail.com' : 'vinicios@resitrat.com.br',
                id: 'dev-mock-id'
            };
            userProfile = {
                name: currentRole === 'admin' ? 'Juliana (Dev Mock)' : 'Vinicios (Dev Mock)',
                role: currentRole === 'admin' ? 'Gestora Financeiro' : 'OPERADOR-INSTALADOR'
            };
            if (banner) {
                banner.classList.remove('hidden');
                banner.innerHTML = `<span class="material-symbols-outlined flex-shrink-0" style="font-size:16px">construction</span><span><strong>Modo Dev</strong> — ${userProfile.name} (${userProfile.role}) — Perfil: <strong>${currentRole === 'admin' ? 'Administrador' : 'Operador'}</strong></span>`;
            }
            applyRoleUI(currentRole, isDev);
            switchRole(currentRole);
            return;
        }

        if (session && session.user) {
            currentUser = session.user;

            const { data: profile } = await _supabase
                .from('users').select('*').eq('email', currentUser.email).maybeSingle();

            const emailStr = (currentUser.email || '').toUpperCase();
            const emailIsAdmin = emailStr.startsWith('ADM') || emailStr.includes('ADMIN');

            if (profile) {
                userProfile = profile;
                const roleStr = (profile.role || '').toUpperCase();
                const isAdminRole = roleStr.includes('GERENTE') || roleStr.includes('COORDENADOR') ||
                    roleStr.includes('GESTOR') || roleStr.includes('ADMIN') ||
                    roleStr.includes('DIRETOR') || roleStr.includes('FINANCEIRO') || emailIsAdmin;

                currentRole = isAdminRole ? 'admin' : 'operator';

                if (banner) {
                    if (isAdminRole) {
                        banner.classList.remove('hidden');
                        banner.innerHTML = `<span class="material-symbols-outlined flex-shrink-0" style="font-size:16px">info</span><span>Logado como <strong>${profile.name}</strong> (${profile.role || 'Membro'}) — Perfil: <strong>Administrador</strong></span>`;
                    } else {
                        banner.classList.add('hidden');
                    }
                }
            } else {
                currentRole = emailIsAdmin ? 'admin' : 'operator';
                userProfile = { name: currentUser.email.split('@')[0].toUpperCase(), role: emailIsAdmin ? 'Admin' : 'Operador' };

                if (banner && emailIsAdmin) {
                    banner.classList.remove('hidden');
                    banner.innerHTML = `<span class="material-symbols-outlined flex-shrink-0" style="font-size:16px">info</span><span>Sessão ativa (${currentUser.email}) — Perfil: <strong>Administrador</strong></span>`;
                }
            }
        } else {
            if (banner) {
                banner.classList.remove('hidden');
                banner.innerHTML = `<span class="material-symbols-outlined flex-shrink-0" style="font-size:16px">warning</span><span>Nenhuma sessão ativa. Redirecionando para login...</span>`;
            }
            setTimeout(() => { window.location.href = 'login.html'; }, 1500);
            return;
        }

        applyRoleUI(currentRole, isDev);
        switchRole(currentRole);

    } catch (e) {
        console.error('Error initializing auth/profile:', e);
    }
}

function applyRoleUI(role, isDev) {
    const switcherContainer = document.getElementById('role-switcher-container');
    if (switcherContainer) {
        if (!isDev && role !== 'admin') {
            switcherContainer.classList.add('hidden');
            switcherContainer.classList.remove('flex');
        } else {
            switcherContainer.classList.remove('hidden');
            switcherContainer.classList.add('flex');
        }
    }

    const navCadUser = document.getElementById('nav-cad-user');
    if (navCadUser) {
        if (role === 'admin') {
            navCadUser.classList.remove('hidden');
            navCadUser.classList.add('flex');
        } else {
            navCadUser.classList.add('hidden');
            navCadUser.classList.remove('flex');
        }
    }
}

// ─── Role / Tab Switching ─────────────────────────────────────────────────────

window.switchRole = (role) => {
    currentRole = role;

    const opView = document.getElementById('operator-view');
    const admView = document.getElementById('admin-view');
    const opBtn = document.getElementById('role-op-btn');
    const admBtn = document.getElementById('role-adm-btn');

    const activeClass = 'px-3 py-1.5 rounded-md text-xs font-semibold transition-all bg-primary text-white shadow-sm';
    const inactiveClass = 'px-3 py-1.5 rounded-md text-xs font-semibold transition-all text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200';

    const navCadUser = document.getElementById('nav-cad-user');

    if (role === 'admin') {
        opView?.classList.add('hidden');
        admView?.classList.remove('hidden');
        if (admBtn) admBtn.className = activeClass;
        if (opBtn) opBtn.className = inactiveClass;
        if (navCadUser) { navCadUser.classList.remove('hidden'); navCadUser.classList.add('flex'); }
        renderAdminStats();
        switchAdminTab(currentAdminTab);
    } else {
        admView?.classList.add('hidden');
        opView?.classList.remove('hidden');
        if (opBtn) opBtn.className = activeClass;
        if (admBtn) admBtn.className = inactiveClass;
        if (navCadUser) { navCadUser.classList.add('hidden'); navCadUser.classList.remove('flex'); }
        renderOperatorStats();
        renderOperatorHistory();
    }
};

window.switchAdminTab = (tab) => {
    currentAdminTab = tab;

    const pendingTab = document.getElementById('tab-pending');
    const historyTab = document.getElementById('tab-history');
    const pendingBtn = document.getElementById('tab-pending-btn');
    const historyBtn = document.getElementById('tab-history-btn');

    const activeTab = 'flex items-center gap-2 py-3.5 px-3 border-b-2 border-primary text-primary text-xs font-semibold mr-2 transition-colors';
    const inactiveTab = 'flex items-center gap-2 py-3.5 px-3 border-b-2 border-transparent text-gray-500 dark:text-gray-400 text-xs font-semibold hover:text-gray-700 transition-colors';

    if (tab === 'history') {
        pendingTab?.classList.add('hidden');
        historyTab?.classList.remove('hidden');
        if (historyBtn) historyBtn.className = activeTab;
        if (pendingBtn) pendingBtn.className = inactiveTab;
        loadAdminHistory();
    } else {
        historyTab?.classList.add('hidden');
        pendingTab?.classList.remove('hidden');
        if (pendingBtn) pendingBtn.className = activeTab;
        if (historyBtn) historyBtn.className = inactiveTab;
        loadAdminPending();
    }
};

// ─── Dropdowns ────────────────────────────────────────────────────────────────

async function loadInitialDropdowns() {
    try {
        allProjects = await fetchProjects();
        const reqProjectSelect = document.getElementById('req-project-select');
        allProjects
            .filter(p => p.status !== 'Completed' && p.status !== 'Done')
            .forEach(p => {
                const opt = document.createElement('option');
                opt.value = p.id;
                opt.textContent = p.name;
                reqProjectSelect?.appendChild(opt);
            });

        allClients = await fetchClients();
        const reqClientSelect = document.getElementById('req-client-select');
        const filterClient = document.getElementById('filter-client');

        allClients.forEach(c => {
            const label = c.company ? `${c.name} (${c.company})` : c.name;
            const opt1 = document.createElement('option');
            opt1.value = c.id; opt1.textContent = label;
            reqClientSelect?.appendChild(opt1);

            const opt2 = document.createElement('option');
            opt2.value = c.id; opt2.textContent = label;
            filterClient?.appendChild(opt2);
        });
    } catch (e) {
        console.error('Error loading dropdowns:', e);
    }
}

// ─── Data Refresh ─────────────────────────────────────────────────────────────

async function refreshRequests() {
    allRequests = await fetchStockRequests();

    const pendingCount = allRequests.filter(r => r.status === 'PENDENTE').length;
    const badge = document.getElementById('pending-badge-count');
    if (badge) {
        badge.textContent = pendingCount;
        badge.classList.toggle('hidden', pendingCount === 0);
    }

    renderOperatorStats();
    renderAdminStats();

    if (currentRole === 'admin') {
        currentAdminTab === 'pending' ? loadAdminPending() : loadAdminHistory();
    } else {
        renderOperatorHistory();
    }
}

// ─── Stats Cards ──────────────────────────────────────────────────────────────

function renderOperatorStats() {
    const container = document.getElementById('op-stats');
    if (!container) return;

    const now = new Date();
    const thisMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

    const pending = allRequests.filter(r => r.status === 'PENDENTE').length;
    const approvedThisMonth = allRequests.filter(r => r.status === 'DEFERIDO' && (r.created_at || '').startsWith(thisMonth)).length;
    const rejectedThisMonth = allRequests.filter(r => r.status === 'INDEFERIDO' && (r.created_at || '').startsWith(thisMonth)).length;

    container.innerHTML = `
        <div class="bg-white dark:bg-background-dark rounded-xl border border-gray-200 dark:border-gray-800 shadow-sm p-4 flex items-center gap-4">
            <div class="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0" style="background:linear-gradient(135deg,#92400e 0%,#d97706 100%)">
                <span class="material-symbols-outlined text-white" style="font-size:18px">pending</span>
            </div>
            <div>
                <p class="text-2xl font-extrabold ${pending > 0 ? 'text-amber-600 dark:text-amber-400' : 'text-gray-600 dark:text-gray-300'}">${pending}</p>
                <p class="text-xs text-gray-500 dark:text-gray-400 font-medium">Pendentes de Aprovação</p>
            </div>
        </div>
        <div class="bg-white dark:bg-background-dark rounded-xl border border-gray-200 dark:border-gray-800 shadow-sm p-4 flex items-center gap-4">
            <div class="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0" style="background:linear-gradient(135deg,#14532d 0%,#16a34a 100%)">
                <span class="material-symbols-outlined text-white" style="font-size:18px">check_circle</span>
            </div>
            <div>
                <p class="text-2xl font-extrabold text-emerald-600 dark:text-emerald-400">${approvedThisMonth}</p>
                <p class="text-xs text-gray-500 dark:text-gray-400 font-medium">Aprovadas este Mês</p>
            </div>
        </div>
        <div class="bg-white dark:bg-background-dark rounded-xl border border-gray-200 dark:border-gray-800 shadow-sm p-4 flex items-center gap-4">
            <div class="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0" style="background:linear-gradient(135deg,#7f1d1d 0%,#dc2626 100%)">
                <span class="material-symbols-outlined text-white" style="font-size:18px">cancel</span>
            </div>
            <div>
                <p class="text-2xl font-extrabold text-red-600 dark:text-red-400">${rejectedThisMonth}</p>
                <p class="text-xs text-gray-500 dark:text-gray-400 font-medium">Indeferidas este Mês</p>
            </div>
        </div>
    `;
}

function renderAdminStats() {
    const container = document.getElementById('adm-stats');
    if (!container) return;

    const now = new Date();
    const today = now.toISOString().split('T')[0];
    const thisMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

    const pending = allRequests.filter(r => r.status === 'PENDENTE').length;
    const approvedToday = allRequests.filter(r => r.status === 'DEFERIDO' && (r.approved_at || '').startsWith(today)).length;
    const approvedThisMonth = allRequests.filter(r => r.status === 'DEFERIDO' && (r.created_at || '').startsWith(thisMonth));
    const totalValueMonth = approvedThisMonth.reduce((sum, r) => sum + ((parseFloat(r.unit_price) || 0) * (r.quantity || 0)), 0);

    container.innerHTML = `
        <div class="bg-white dark:bg-background-dark rounded-xl border border-gray-200 dark:border-gray-800 shadow-sm p-4 flex items-center gap-4">
            <div class="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0" style="background:linear-gradient(135deg,#92400e 0%,#d97706 100%)">
                <span class="material-symbols-outlined text-white" style="font-size:18px">pending_actions</span>
            </div>
            <div>
                <p class="text-2xl font-extrabold ${pending > 0 ? 'text-amber-600 dark:text-amber-400' : 'text-gray-600 dark:text-gray-300'}">${pending}</p>
                <p class="text-xs text-gray-500 dark:text-gray-400 font-medium">Aguardando Aprovação</p>
            </div>
        </div>
        <div class="bg-white dark:bg-background-dark rounded-xl border border-gray-200 dark:border-gray-800 shadow-sm p-4 flex items-center gap-4">
            <div class="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0" style="background:linear-gradient(135deg,#14532d 0%,#16a34a 100%)">
                <span class="material-symbols-outlined text-white" style="font-size:18px">today</span>
            </div>
            <div>
                <p class="text-2xl font-extrabold text-emerald-600 dark:text-emerald-400">${approvedToday}</p>
                <p class="text-xs text-gray-500 dark:text-gray-400 font-medium">Aprovadas Hoje</p>
            </div>
        </div>
        <div class="bg-white dark:bg-background-dark rounded-xl border border-gray-200 dark:border-gray-800 shadow-sm p-4 flex items-center gap-4">
            <div class="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0" style="background:linear-gradient(135deg,#1e3a8a 0%,#2563eb 100%)">
                <span class="material-symbols-outlined text-white" style="font-size:18px">payments</span>
            </div>
            <div>
                <p class="text-xl font-extrabold text-blue-600 dark:text-blue-400">R$ ${totalValueMonth.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
                <p class="text-xs text-gray-500 dark:text-gray-400 font-medium">Valor Aprovado (mês)</p>
            </div>
        </div>
    `;
}

// ─── Form Handlers ────────────────────────────────────────────────────────────

function buildItemRowHTML(isFirst = false) {
    return `
        <div class="col-span-12 md:col-span-6">
            <label class="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Material / Serviço <span class="text-red-500">*</span></label>
            <input type="text" name="item_name" required placeholder="Ex: Cabo Flexível 6mm, Conector..." class="input-field">
        </div>
        <div class="col-span-5 md:col-span-2">
            <label class="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Unidade</label>
            <select name="item_unit" class="input-field">
                <option value="UN">UN</option>
                <option value="KG">KG</option>
                <option value="MT">MT</option>
                <option value="M2">M2</option>
                <option value="M3">M3</option>
                <option value="L">L</option>
                <option value="CX">CX</option>
                <option value="SC">SC</option>
                <option value="PCT">PCT</option>
            </select>
        </div>
        <div class="col-span-6 md:col-span-3">
            <label class="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Quantidade <span class="text-red-500">*</span></label>
            <input type="number" name="item_qty" step="any" min="0.01" required placeholder="0.00" class="input-field">
        </div>
        <div class="col-span-1 flex justify-center items-end pb-1">
            <button type="button" class="remove-item-btn ${isFirst ? 'hidden' : ''} p-1.5 text-red-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-md transition-colors" title="Remover item">
                <span class="material-symbols-outlined" style="font-size:18px">delete</span>
            </button>
        </div>
    `;
}

function setupFormHandlers() {
    const form = document.getElementById('req-form');
    const addItemBtn = document.getElementById('add-item-btn');
    const container = document.getElementById('items-container');

    // Initialize first row
    const firstRow = container?.querySelector('.item-row');
    if (firstRow) {
        firstRow.querySelector('[name="item_name"]')?.addEventListener('input', () => {
            clearTimeout(duplicateCheckTimeout);
            duplicateCheckTimeout = setTimeout(checkForDuplicates, 500);
        });
    }

    // Operator name triggers duplicate check
    document.getElementById('req-operator-name')?.addEventListener('input', () => {
        clearTimeout(duplicateCheckTimeout);
        duplicateCheckTimeout = setTimeout(checkForDuplicates, 500);
    });

    // Remove item via event delegation
    container?.addEventListener('click', (e) => {
        if (e.target.closest('.remove-item-btn')) {
            e.target.closest('.item-row').remove();
            const rows = container.querySelectorAll('.item-row');
            if (rows.length === 1) {
                rows[0].querySelector('.remove-item-btn')?.classList.add('hidden');
            }
            checkForDuplicates();
        }
    });

    // Add item row
    addItemBtn?.addEventListener('click', () => {
        const newRow = document.createElement('div');
        newRow.className = 'item-row item-row-enter grid grid-cols-12 gap-3 items-end p-4 bg-gray-50 dark:bg-gray-800/40 border border-gray-200 dark:border-gray-700 rounded-lg';
        newRow.innerHTML = buildItemRowHTML(false);
        container.appendChild(newRow);

        // Show delete on all rows
        container.querySelectorAll('.item-row').forEach(row => {
            row.querySelector('.remove-item-btn')?.classList.remove('hidden');
        });

        // Attach duplicate check to new name input
        newRow.querySelector('[name="item_name"]')?.addEventListener('input', () => {
            clearTimeout(duplicateCheckTimeout);
            duplicateCheckTimeout = setTimeout(checkForDuplicates, 500);
        });

        newRow.querySelector('[name="item_name"]')?.focus();
    });

    // Form submit
    form?.addEventListener('submit', async (e) => {
        e.preventDefault();

        const submitBtn = document.getElementById('req-submit-btn');
        const editingId = document.getElementById('editing-req-id').value;
        const operatorName = document.getElementById('req-operator-name').value?.trim();

        if (!operatorName) {
            showToast('Informe o nome do solicitante antes de enviar.', 'warning');
            document.getElementById('req-operator-name').focus();
            return;
        }

        const itemRows = document.querySelectorAll('.item-row');
        const requestsData = [];

        for (const row of itemRows) {
            const itemName = row.querySelector('[name="item_name"]').value?.trim();
            const itemUnit = row.querySelector('[name="item_unit"]').value;
            const qty = parseFloat(row.querySelector('[name="item_qty"]').value);

            if (!itemName) {
                showToast('Informe o nome de todos os materiais.', 'warning');
                row.querySelector('[name="item_name"]').focus();
                return;
            }
            if (isNaN(qty) || qty <= 0) {
                showToast('Informe uma quantidade válida para todos os itens.', 'warning');
                row.querySelector('[name="item_qty"]').focus();
                return;
            }

            requestsData.push({
                item_name: itemName.toUpperCase(),
                unit: itemUnit,
                quantity: qty,
                project_id: document.getElementById('req-project-select').value || null,
                client_id: document.getElementById('req-client-select').value || null,
                reason: document.getElementById('req-reason').value,
                observation: document.getElementById('req-obs').value || null,
                status: 'PENDENTE',
                requested_by: operatorName.toUpperCase()
            });
        }

        // Duplicate check (only on new submissions)
        if (!editingId) {
            const hasDups = checkForDuplicates();
            if (hasDups) {
                const confirmed = document.getElementById('confirm-duplicate')?.checked;
                if (!confirmed) {
                    showToast('Requisição duplicada detectada. Confirme que é uma nova solicitação antes de enviar.', 'warning');
                    document.getElementById('duplicate-warning')?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
                    return;
                }
            }
        }

        try {
            submitBtn.disabled = true;
            submitBtn.innerHTML = '<span class="material-symbols-outlined" style="font-size:17px">hourglass_empty</span> Enviando...';

            if (editingId) {
                if (requestsData.length > 0) {
                    await updateStockRequest(editingId, requestsData[0]);
                    showToast('Solicitação atualizada com sucesso!', 'success');
                }
                cancelReqEdit();
            } else {
                await createStockRequest(requestsData);
                showToast(`${requestsData.length} solicitação(ões) enviada(s) com sucesso!`, 'success');
                form.reset();
                resetItemRows();
                hideDuplicateWarning();
            }

            await refreshRequests();

        } catch (error) {
            console.error('Error submitting request:', error);
            showToast('Erro ao enviar solicitação: ' + (error.message || 'Erro desconhecido.'), 'error');
        } finally {
            submitBtn.disabled = false;
            submitBtn.innerHTML = editingId
                ? '<span class="material-symbols-outlined" style="font-size:17px">save</span> Salvar Alterações'
                : '<span class="material-symbols-outlined" style="font-size:17px">send</span> Enviar Solicitação';
        }
    });
}

function resetItemRows() {
    const container = document.getElementById('items-container');
    const rows = container?.querySelectorAll('.item-row');
    if (!rows) return;
    for (let i = 1; i < rows.length; i++) rows[i].remove();
    // Re-hide first row delete button
    const firstDelete = rows[0]?.querySelector('.remove-item-btn');
    if (firstDelete) firstDelete.classList.add('hidden');
    // Clear first row inputs
    rows[0]?.querySelectorAll('input').forEach(inp => { inp.value = ''; });
}

window.cancelReqEdit = () => {
    document.getElementById('editing-req-id').value = '';
    document.getElementById('req-form').reset();
    resetItemRows();
    hideDuplicateWarning();

    const submitBtn = document.getElementById('req-submit-btn');
    if (submitBtn) submitBtn.innerHTML = '<span class="material-symbols-outlined" style="font-size:17px">send</span> Enviar Solicitação';
    document.getElementById('cancel-req-edit-btn')?.classList.add('hidden');
    document.getElementById('add-item-btn')?.classList.remove('hidden');
};

window.editRequest = (req) => {
    const formCard = document.getElementById('req-form')?.closest('.rounded-xl');
    formCard?.scrollIntoView({ behavior: 'smooth' });

    document.getElementById('editing-req-id').value = req.id;
    resetItemRows();

    const firstRow = document.querySelector('.item-row');
    if (firstRow) {
        firstRow.querySelector('[name="item_name"]').value = req.item_name;
        firstRow.querySelector('[name="item_unit"]').value = req.unit;
        firstRow.querySelector('[name="item_qty"]').value = req.quantity;
    }

    document.getElementById('req-project-select').value = req.project_id || '';
    document.getElementById('req-client-select').value = req.client_id || '';
    document.getElementById('req-reason').value = req.reason;
    document.getElementById('req-obs').value = req.observation || '';
    document.getElementById('req-operator-name').value = req.requested_by || '';

    const submitBtn = document.getElementById('req-submit-btn');
    if (submitBtn) submitBtn.innerHTML = '<span class="material-symbols-outlined" style="font-size:17px">save</span> Salvar Alterações';
    document.getElementById('cancel-req-edit-btn')?.classList.remove('hidden');
    document.getElementById('add-item-btn')?.classList.add('hidden');
    hideDuplicateWarning();
};

window.deleteRequest = async (id) => {
    if (!confirm('Tem certeza que deseja excluir esta requisição?')) return;
    try {
        await deleteStockRequest(id);
        showToast('Requisição excluída.', 'info');
        await refreshRequests();
    } catch (error) {
        console.error('Error deleting request:', error);
        showToast('Erro ao excluir: ' + error.message, 'error');
    }
};

// ─── Modal Handlers ───────────────────────────────────────────────────────────

function setupModalHandlers() {
    // Approve
    document.getElementById('approve-form')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const reqId = document.getElementById('app-request-id').value;
        const unitVal = parseFloat(document.getElementById('app-unit-value').value);
        const confirmBtn = document.getElementById('btn-confirm-approve');
        const req = allRequests.find(r => r.id === reqId);

        if (isNaN(unitVal) || unitVal < 0) {
            showToast('Digite um valor unitário válido.', 'warning');
            return;
        }
        if (!req) { showToast('Requisição não encontrada.', 'error'); return; }

        try {
            confirmBtn.disabled = true;
            confirmBtn.innerHTML = '<span class="material-symbols-outlined" style="font-size:16px">hourglass_empty</span> Processando...';

            if (req.project_id) {
                await createProjectItem({
                    project_id: req.project_id,
                    name: req.item_name,
                    category: req.reason || 'Outros',
                    quantity: req.quantity,
                    unit: req.unit,
                    value: unitVal,
                    nota_fiscal: null
                });
            } else {
                const itemId = await ensureStockItem(req.item_name, unitVal, req.quantity, req.unit);
                await processStockExit(itemId, req.quantity, req.reason, null, req.observation, req.client_id);
            }
            await updateStockRequest(reqId, {
                status: 'DEFERIDO',
                unit_price: unitVal,
                approved_by: currentUser ? currentUser.email : 'ADMINISTRADOR',
                approved_at: new Date().toISOString()
            });

            showToast(req.project_id ? 'Item adicionado ao projeto e requisição aprovada!' : 'Saída confirmada e requisição aprovada!', 'success');
            closeApproveModal();
            await refreshRequests();

        } catch (error) {
            console.error('Error approving request:', error);
            if (error.code === '42501' || (error.message && error.message.includes('row-level security'))) {
                showToast('Erro de permissão (RLS). Faça login com uma conta de Administrador real.', 'error', 6000);
            } else {
                showToast('Erro ao aprovar: ' + (error.message || 'Desconhecido'), 'error');
            }
        } finally {
            confirmBtn.disabled = false;
            const r = allRequests.find(x => x.id === reqId);
            confirmBtn.innerHTML = r && r.project_id
                ? '<span class="material-symbols-outlined" style="font-size:16px">inventory_2</span> Adicionar ao Projeto'
                : '<span class="material-symbols-outlined" style="font-size:16px">check</span> Confirmar Saída';
        }
    });

    // Reject
    document.getElementById('reject-form')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const reqId = document.getElementById('rej-request-id').value;
        const reasonText = document.getElementById('rej-reason-text').value?.trim();
        const confirmBtn = document.getElementById('btn-confirm-reject');

        if (!reasonText) { showToast('Informe o motivo do indeferimento.', 'warning'); return; }

        try {
            confirmBtn.disabled = true;
            confirmBtn.innerHTML = '<span class="material-symbols-outlined" style="font-size:16px">hourglass_empty</span> Gravando...';

            await updateStockRequest(reqId, {
                status: 'INDEFERIDO',
                rejection_reason: reasonText,
                approved_by: currentUser ? currentUser.email : 'ADMINISTRADOR',
                approved_at: new Date().toISOString()
            });

            showToast('Requisição indeferida com sucesso.', 'info');
            closeRejectModal();
            await refreshRequests();

        } catch (error) {
            console.error('Error rejecting request:', error);
            if (error.code === '42501' || (error.message && error.message.includes('row-level security'))) {
                showToast('Erro de permissão (RLS). Faça login com uma conta de Administrador real.', 'error', 6000);
            } else {
                showToast('Erro ao indeferir: ' + error.message, 'error');
            }
        } finally {
            confirmBtn.disabled = false;
            confirmBtn.innerHTML = '<span class="material-symbols-outlined" style="font-size:16px">block</span> Confirmar Indeferimento';
        }
    });
}

// Modal open/close
window.openApproveModal = (reqId) => {
    const req = allRequests.find(r => r.id === reqId);
    if (!req) return;

    document.getElementById('app-request-id').value = reqId;
    document.getElementById('app-unit-value').value = '';
    document.getElementById('app-summary-item').textContent = req.item_name;
    document.getElementById('app-summary-qty').textContent = `Quantidade: ${req.quantity} ${req.unit}`;

    let dest = '-';
    if (req.projects) dest = `Projeto: ${req.projects.name}`;
    else if (req.clients) dest = `Cliente: ${req.clients.name}`;
    document.getElementById('app-summary-dest').textContent = dest;
    document.getElementById('app-summary-obs').textContent = req.observation ? `Obs: "${req.observation}"` : '';

    const hintEl = document.querySelector('#approve-form .text-\\[10px\\]');
    const confirmBtn = document.getElementById('btn-confirm-approve');
    if (req.project_id) {
        if (hintEl) hintEl.textContent = 'Este valor será lançado nos Itens do Projeto — não na Saída de Estoque.';
        if (confirmBtn) confirmBtn.innerHTML = '<span class="material-symbols-outlined" style="font-size:16px">inventory_2</span> Adicionar ao Projeto';
    } else {
        if (hintEl) hintEl.textContent = 'Este valor será registrado no histórico de custos e associado ao item no estoque.';
        if (confirmBtn) confirmBtn.innerHTML = '<span class="material-symbols-outlined" style="font-size:16px">check</span> Confirmar Saída';
    }

    document.getElementById('approve-modal').classList.remove('hidden');
    setTimeout(() => document.getElementById('app-unit-value').focus(), 100);
};

window.closeApproveModal = () => document.getElementById('approve-modal').classList.add('hidden');

window.openRejectModal = (reqId) => {
    document.getElementById('rej-request-id').value = reqId;
    document.getElementById('rej-reason-text').value = '';
    document.getElementById('reject-modal').classList.remove('hidden');
    setTimeout(() => document.getElementById('rej-reason-text').focus(), 100);
};

window.closeRejectModal = () => document.getElementById('reject-modal').classList.add('hidden');

let currentReturnRequest = null;

window.openReturnModal = (req) => {
    currentReturnRequest = req;
    const input = document.getElementById('return-qty');
    document.getElementById('return-modal-desc').textContent = `${req.item_name} — Qtd Requisitada: ${req.quantity} ${req.unit}`;
    document.getElementById('return-max-qty').textContent = `${req.quantity} ${req.unit}`;
    input.value = '';
    input.max = req.quantity;
    input.min = 0.01;
    input.step = 'any';
    document.getElementById('return-modal').classList.remove('hidden');
    setTimeout(() => input.focus(), 100);
};

window.closeReturnModal = () => {
    document.getElementById('return-modal').classList.add('hidden');
    currentReturnRequest = null;
};

document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('confirm-return-btn')?.addEventListener('click', confirmReturnRequest);
});

async function confirmReturnRequest() {
    if (!currentReturnRequest) return;
    const input = document.getElementById('return-qty');
    const qtyToReturn = parseFloat(input.value);

    if (!qtyToReturn || qtyToReturn <= 0) {
        showToast('Insira uma quantidade válida.', 'warning');
        return;
    }
    if (qtyToReturn > currentReturnRequest.quantity) {
        showToast(`Quantidade não pode ser maior que a original (${currentReturnRequest.quantity}).`, 'warning');
        return;
    }

    const btn = document.getElementById('confirm-return-btn');
    try {
        btn.disabled = true;
        btn.innerHTML = '<span class="material-symbols-outlined" style="font-size:16px">hourglass_empty</span> Processando...';

        const remainingQty = Math.round((currentReturnRequest.quantity - qtyToReturn) * 1000) / 1000;

        if (remainingQty <= 0) {
            await updateStockRequest(currentReturnRequest.id, {
                quantity: 0, status: 'CANCELADO', rejection_reason: 'Totalmente Devolvido'
            });
        } else {
            await updateStockRequest(currentReturnRequest.id, { quantity: remainingQty });
        }

        if (currentReturnRequest.project_id) {
            const { data: projectItems } = await _supabase
                .from('project_items')
                .select('*')
                .eq('project_id', currentReturnRequest.project_id)
                .eq('name', currentReturnRequest.item_name.toUpperCase().trim())
                .order('created_at', { ascending: false })
                .limit(1);
            if (projectItems && projectItems.length > 0) {
                const newQty = Math.round((projectItems[0].quantity - qtyToReturn) * 1000) / 1000;
                if (newQty <= 0) await deleteProjectItem(projectItems[0].id);
                else await updateProjectItem(projectItems[0].id, { quantity: newQty });
            }
        } else {
            const { data: items } = await _supabase.from('stock_items').select('id').eq('name', currentReturnRequest.item_name.toUpperCase().trim());
            if (items && items.length > 0) {
                let query = _supabase.from('stock_exits').select('*').eq('item_id', items[0].id).eq('reason', currentReturnRequest.reason);
                if (currentReturnRequest.client_id) query = query.eq('client_id', currentReturnRequest.client_id);
                const { data: exits } = await query.order('created_at', { ascending: false }).limit(1);
                if (exits && exits.length > 0) {
                    const newExitQty = Math.round((exits[0].quantity - qtyToReturn) * 1000) / 1000;
                    if (newExitQty <= 0) await deleteStockExit(exits[0].id);
                    else await updateStockExit(exits[0].id, { quantity: newExitQty });
                }
            }
        }

        showToast(currentReturnRequest.project_id ? 'Devolução registrada e item do projeto atualizado!' : 'Devolução registrada e saída de estoque abatida!', 'success');
        closeReturnModal();
        await refreshRequests();

    } catch (error) {
        console.error('Error executing return:', error);
        showToast('Erro ao realizar devolução: ' + error.message, 'error');
    } finally {
        btn.disabled = false;
        btn.innerHTML = '<span class="material-symbols-outlined" style="font-size:16px">undo</span> Confirmar Devolução';
    }
}

// ─── Status Badge Helper ──────────────────────────────────────────────────────

function statusBadge(status, rejectionReason = '') {
    if (status === 'PENDENTE') {
        return `<span class="inline-flex items-center gap-1.5 rounded-full bg-amber-100 dark:bg-amber-900/40 px-2.5 py-1 text-xs font-semibold text-amber-700 dark:text-amber-300"><span class="size-1.5 rounded-full bg-amber-500 animate-pulse"></span>Pendente</span>`;
    } else if (status === 'DEFERIDO') {
        return `<span class="inline-flex items-center gap-1.5 rounded-full bg-emerald-100 dark:bg-emerald-900/40 px-2.5 py-1 text-xs font-semibold text-emerald-700 dark:text-emerald-300"><span class="size-1.5 rounded-full bg-emerald-500"></span>Deferido</span>`;
    } else if (status === 'INDEFERIDO') {
        return `<span class="inline-flex items-center gap-1.5 rounded-full bg-red-100 dark:bg-red-900/40 px-2.5 py-1 text-xs font-semibold text-red-700 dark:text-red-300" title="${rejectionReason || ''}"><span class="size-1.5 rounded-full bg-red-500"></span>Indeferido</span>`;
    } else if (status === 'CANCELADO') {
        return `<span class="inline-flex items-center gap-1.5 rounded-full bg-gray-100 dark:bg-gray-700 px-2.5 py-1 text-xs font-semibold text-gray-600 dark:text-gray-400"><span class="size-1.5 rounded-full bg-gray-400"></span>Devolvido</span>`;
    }
    return `<span class="text-xs text-gray-400">${status}</span>`;
}

function destLabel(req) {
    if (req.projects) return `<span class="font-medium text-blue-600 dark:text-blue-400">Proj:</span> ${req.projects.name}`;
    if (req.clients) return req.clients.name;
    return '-';
}

// ─── Render Operator History ──────────────────────────────────────────────────

function renderOperatorHistory() {
    const tbody = document.getElementById('op-history-table-body');
    const countLabel = document.getElementById('op-history-count');
    if (!tbody) return;

    const statusFilter = document.getElementById('op-filter-status')?.value || '';
    let filtered = [...allRequests].sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

    if (statusFilter) {
        if (statusFilter === 'CANCELADO') {
            filtered = filtered.filter(r => r.status === 'CANCELADO' || r.status === 'DEVOLVIDO');
        } else {
            filtered = filtered.filter(r => r.status === statusFilter);
        }
    }

    if (countLabel) {
        countLabel.textContent = `${filtered.length} registro${filtered.length !== 1 ? 's' : ''}${statusFilter ? ' filtrados' : ''}`;
    }

    if (filtered.length === 0) {
        tbody.innerHTML = `<tr><td colspan="8" class="px-6 py-10 text-center">
            <div class="flex flex-col items-center gap-2">
                <span class="material-symbols-outlined text-gray-300 dark:text-gray-600" style="font-size:36px">inventory_2</span>
                <p class="text-sm text-gray-400">Nenhuma requisição encontrada.</p>
            </div>
        </td></tr>`;
        return;
    }

    tbody.innerHTML = '';
    filtered.forEach(req => {
        const tr = document.createElement('tr');
        tr.className = 'hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors';

        const dateStr = formatDate((req.created_at || '').split('T')[0]);

        tr.innerHTML = `
            <td class="px-5 py-3.5 whitespace-nowrap text-xs text-gray-500 dark:text-gray-400">${dateStr}</td>
            <td class="px-5 py-3.5 whitespace-nowrap text-xs font-semibold text-gray-800 dark:text-gray-200">${req.requested_by || '-'}</td>
            <td class="px-5 py-3.5 whitespace-nowrap text-xs font-bold text-gray-900 dark:text-white">${req.item_name}</td>
            <td class="px-5 py-3.5 whitespace-nowrap text-xs text-gray-600 dark:text-gray-400">${req.quantity} <span class="text-gray-400">${req.unit}</span></td>
            <td class="px-5 py-3.5 whitespace-nowrap text-xs text-gray-600 dark:text-gray-400">${destLabel(req)}</td>
            <td class="px-5 py-3.5 whitespace-nowrap text-xs text-gray-600 dark:text-gray-400">${req.reason}</td>
            <td class="px-5 py-3.5 whitespace-nowrap text-xs">${statusBadge(req.status, req.rejection_reason)}</td>
            <td class="px-5 py-3.5 whitespace-nowrap text-right"></td>
        `;

        const actionsTd = tr.lastElementChild;
        if (req.status === 'PENDENTE') {
            const div = document.createElement('div');
            div.className = 'flex items-center justify-end gap-1.5';

            const editBtn = document.createElement('button');
            editBtn.className = 'flex items-center gap-1 px-2 py-1 rounded-md text-xs text-amber-600 dark:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-900/30 transition-colors font-medium';
            editBtn.innerHTML = '<span class="material-symbols-outlined" style="font-size:14px">edit</span>Editar';
            editBtn.onclick = () => editRequest(req);
            div.appendChild(editBtn);

            const delBtn = document.createElement('button');
            delBtn.className = 'flex items-center gap-1 px-2 py-1 rounded-md text-xs text-red-500 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/30 transition-colors font-medium';
            delBtn.innerHTML = '<span class="material-symbols-outlined" style="font-size:14px">delete</span>Excluir';
            delBtn.onclick = () => deleteRequest(req.id);
            div.appendChild(delBtn);

            actionsTd.appendChild(div);
        } else if (req.status === 'DEFERIDO') {
            const retBtn = document.createElement('button');
            retBtn.className = 'flex items-center justify-end gap-1 px-2 py-1 rounded-md text-xs text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/30 transition-colors font-medium ml-auto';
            retBtn.innerHTML = '<span class="material-symbols-outlined" style="font-size:14px">undo</span>Devolver';
            retBtn.onclick = () => openReturnModal(req);
            actionsTd.appendChild(retBtn);
        } else if (req.status === 'INDEFERIDO') {
            actionsTd.innerHTML = `<span class="text-xs text-gray-400 italic" title="${req.rejection_reason || ''}">Motivo: ${(req.rejection_reason || 'N/A').substring(0, 30)}${(req.rejection_reason || '').length > 30 ? '...' : ''}</span>`;
        } else {
            actionsTd.innerHTML = '<span class="text-xs text-gray-400 italic">Encerrado</span>';
        }

        tbody.appendChild(tr);
    });
}

// ─── Admin: Pending Tab ───────────────────────────────────────────────────────

function loadAdminPending() {
    const tbody = document.getElementById('adm-pending-table-body');
    if (!tbody) return;

    const pendings = allRequests.filter(r => r.status === 'PENDENTE');

    if (pendings.length === 0) {
        tbody.innerHTML = `<tr><td colspan="8" class="px-6 py-10 text-center">
            <div class="flex flex-col items-center gap-2">
                <span class="material-symbols-outlined text-gray-300 dark:text-gray-600" style="font-size:36px">done_all</span>
                <p class="text-sm text-gray-400">Nenhuma requisição pendente. Tudo em dia!</p>
            </div>
        </td></tr>`;
        return;
    }

    tbody.innerHTML = '';
    pendings.forEach(req => {
        const tr = document.createElement('tr');
        tr.className = 'hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors';

        const dateStr = formatDate((req.created_at || '').split('T')[0]);
        const opName = (req.requested_by || 'DESCONHECIDO').split('@')[0].toUpperCase();

        tr.innerHTML = `
            <td class="px-5 py-3.5 whitespace-nowrap text-xs text-gray-500 dark:text-gray-400">${dateStr}</td>
            <td class="px-5 py-3.5 whitespace-nowrap text-xs font-semibold text-gray-800 dark:text-gray-200" title="${req.requested_by || ''}">${opName}</td>
            <td class="px-5 py-3.5 whitespace-nowrap text-xs font-bold text-gray-900 dark:text-white">${req.item_name}</td>
            <td class="px-5 py-3.5 whitespace-nowrap text-xs text-gray-600 dark:text-gray-400">${req.quantity} <span class="text-gray-400">${req.unit}</span></td>
            <td class="px-5 py-3.5 whitespace-nowrap text-xs text-gray-600 dark:text-gray-400">${destLabel(req)}</td>
            <td class="px-5 py-3.5 whitespace-nowrap text-xs text-gray-600 dark:text-gray-400">${req.reason}</td>
            <td class="px-5 py-3.5 text-xs text-gray-500 dark:text-gray-400 max-w-[160px] truncate" title="${req.observation || ''}">${req.observation || '-'}</td>
            <td class="px-5 py-3.5 whitespace-nowrap text-right"></td>
        `;

        const actionTd = tr.lastElementChild;
        const div = document.createElement('div');
        div.className = 'flex items-center justify-end gap-1';

        const addBtn = (icon, label, cls, handler) => {
            const btn = document.createElement('button');
            btn.className = `flex items-center gap-1 px-2 py-1 rounded-md text-xs font-semibold ${cls} transition-colors`;
            btn.innerHTML = `<span class="material-symbols-outlined" style="font-size:14px">${icon}</span>${label}`;
            btn.onclick = handler;
            div.appendChild(btn);
        };

        addBtn('edit', 'Editar', 'text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/30', () => {
            switchRole('operator');
            setTimeout(() => editRequest(req), 100);
        });
        addBtn('delete', 'Excluir', 'text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700', () => deleteRequest(req.id));
        addBtn('check_circle', 'Deferir', 'text-emerald-600 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-900/30', () => openApproveModal(req.id));
        addBtn('cancel', 'Indeferir', 'text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/30', () => openRejectModal(req.id));

        actionTd.appendChild(div);
        tbody.appendChild(tr);
    });
}

// ─── Admin: History Tab ───────────────────────────────────────────────────────

function getFilteredHistory() {
    let history = allRequests.filter(r => r.status !== 'PENDENTE');
    const filterStatus = document.getElementById('filter-status')?.value;
    const filterClientId = document.getElementById('filter-client')?.value;
    const filterMonth = document.getElementById('filter-month')?.value;

    if (filterStatus) history = history.filter(r => r.status === filterStatus);
    if (filterClientId) history = history.filter(r => r.client_id == filterClientId);
    if (filterMonth) history = history.filter(r => (r.created_at || '').startsWith(filterMonth));

    return history.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
}

function loadAdminHistory() {
    const tbody = document.getElementById('adm-history-table-body');
    if (!tbody) return;

    const filtered = getFilteredHistory();

    if (filtered.length === 0) {
        tbody.innerHTML = `<tr><td colspan="10" class="px-6 py-10 text-center">
            <div class="flex flex-col items-center gap-2">
                <span class="material-symbols-outlined text-gray-300 dark:text-gray-600" style="font-size:36px">history</span>
                <p class="text-sm text-gray-400">Nenhum registro no histórico com os filtros atuais.</p>
            </div>
        </td></tr>`;
        return;
    }

    tbody.innerHTML = '';
    filtered.forEach(req => {
        const tr = document.createElement('tr');
        tr.className = 'hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors';

        const dateStr = formatDate((req.created_at || '').split('T')[0]);
        const opName = (req.requested_by || '-').split('@')[0].toUpperCase();
        const priceUnit = req.unit_price ? `R$ ${parseFloat(req.unit_price).toFixed(2)}` : '-';
        const priceTotal = req.unit_price ? `R$ ${(parseFloat(req.unit_price) * req.quantity).toFixed(2)}` : '-';
        const extraInfo = req.status === 'DEFERIDO'
            ? `Aprov: ${(req.approved_by || '').split('@')[0]}`
            : `Motivo: ${req.rejection_reason || 'N/A'}`;

        tr.innerHTML = `
            <td class="px-5 py-3.5 whitespace-nowrap text-xs text-gray-500 dark:text-gray-400">${dateStr}</td>
            <td class="px-5 py-3.5 whitespace-nowrap text-xs text-gray-700 dark:text-gray-300" title="${req.requested_by || ''}">${opName}</td>
            <td class="px-5 py-3.5 whitespace-nowrap text-xs font-bold text-gray-900 dark:text-white">${req.item_name}</td>
            <td class="px-5 py-3.5 whitespace-nowrap text-xs font-semibold text-gray-700 dark:text-gray-300">${req.quantity} <span class="font-normal text-gray-400">${req.unit}</span></td>
            <td class="px-5 py-3.5 whitespace-nowrap text-xs text-gray-600 dark:text-gray-400">${priceUnit}</td>
            <td class="px-5 py-3.5 whitespace-nowrap text-xs font-bold text-gray-900 dark:text-white">${priceTotal}</td>
            <td class="px-5 py-3.5 whitespace-nowrap text-xs text-gray-600 dark:text-gray-400">${destLabel(req)}</td>
            <td class="px-5 py-3.5 whitespace-nowrap text-xs">${statusBadge(req.status, req.rejection_reason)}</td>
            <td class="px-5 py-3.5 text-xs text-gray-400 italic max-w-[180px] truncate" title="${extraInfo}">${extraInfo}</td>
            <td class="px-5 py-3.5 whitespace-nowrap text-right"></td>
        `;

        const actionTd = tr.lastElementChild;
        const div = document.createElement('div');
        div.className = 'flex items-center justify-end gap-1';

        const editBtn = document.createElement('button');
        editBtn.className = 'flex items-center gap-1 px-2 py-1 rounded-md text-xs text-amber-600 dark:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-900/30 transition-colors font-medium';
        editBtn.innerHTML = '<span class="material-symbols-outlined" style="font-size:14px">edit</span>Editar';
        editBtn.onclick = () => openHistoryEditModal(req);
        div.appendChild(editBtn);

        const delBtn = document.createElement('button');
        delBtn.className = 'flex items-center gap-1 px-2 py-1 rounded-md text-xs text-red-500 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/30 transition-colors font-medium';
        delBtn.innerHTML = '<span class="material-symbols-outlined" style="font-size:14px">delete</span>Apagar';
        delBtn.onclick = () => deleteHistoryRecord(req);
        div.appendChild(delBtn);

        if (req.status === 'DEFERIDO') {
            const retBtn = document.createElement('button');
            retBtn.className = 'flex items-center gap-1 px-2 py-1 rounded-md text-xs text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/30 transition-colors font-medium';
            retBtn.innerHTML = '<span class="material-symbols-outlined" style="font-size:14px">undo</span>Devolver';
            retBtn.onclick = () => openReturnModal(req);
            div.appendChild(retBtn);
        }

        actionTd.appendChild(div);

        tbody.appendChild(tr);
    });
}

// ─── Exports ──────────────────────────────────────────────────────────────────

// ─── History Edit / Delete ────────────────────────────────────────────────────

window.openHistoryEditModal = (req) => {
    document.getElementById('hist-edit-id').value = req.id;
    document.getElementById('hist-edit-status').value = req.status;
    document.getElementById('hist-edit-project-id').value = req.project_id || '';
    document.getElementById('hist-edit-client-id').value = req.client_id || '';
    document.getElementById('hist-edit-orig-name').value = req.item_name || '';
    document.getElementById('hist-edit-reason').value = req.reason || '';
    document.getElementById('hist-edit-name').value = req.item_name || '';
    document.getElementById('hist-edit-qty').value = req.quantity;
    document.getElementById('hist-edit-unit').value = req.unit;
    document.getElementById('hist-edit-obs').value = req.observation || '';

    const priceRow = document.getElementById('hist-edit-price-row');
    if (req.status === 'DEFERIDO') {
        document.getElementById('hist-edit-price').value = req.unit_price || 0;
        priceRow.classList.remove('hidden');
    } else {
        priceRow.classList.add('hidden');
    }

    document.getElementById('history-edit-modal').classList.remove('hidden');
    setTimeout(() => document.getElementById('hist-edit-name').focus(), 100);
};

window.closeHistoryEditModal = () => {
    document.getElementById('history-edit-modal').classList.add('hidden');
};

window.saveHistoryEdit = async () => {
    const id = document.getElementById('hist-edit-id').value;
    const status = document.getElementById('hist-edit-status').value;
    const projectId = document.getElementById('hist-edit-project-id').value || null;
    const clientId = document.getElementById('hist-edit-client-id').value || null;
    const origName = document.getElementById('hist-edit-orig-name').value;
    const reason = document.getElementById('hist-edit-reason').value;
    const newName = document.getElementById('hist-edit-name').value.trim().toUpperCase();
    const newQty = parseFloat(document.getElementById('hist-edit-qty').value);
    const newUnit = document.getElementById('hist-edit-unit').value;
    const newPrice = status === 'DEFERIDO' ? (parseFloat(document.getElementById('hist-edit-price').value) || 0) : null;
    const newObs = document.getElementById('hist-edit-obs').value.trim() || null;

    if (!newName || isNaN(newQty) || newQty <= 0) {
        showToast('Preencha nome e quantidade corretamente.', 'warning');
        return;
    }

    const saveBtn = document.getElementById('hist-edit-save-btn');
    try {
        saveBtn.disabled = true;
        saveBtn.innerHTML = '<span class="material-symbols-outlined" style="font-size:16px">hourglass_empty</span> Salvando...';

        const updates = { item_name: newName, quantity: newQty, unit: newUnit, observation: newObs };
        if (newPrice !== null) updates.unit_price = newPrice;
        await updateStockRequest(id, updates);

        if (status === 'DEFERIDO') {
            if (projectId) {
                const { data: projectItems } = await _supabase
                    .from('project_items').select('*')
                    .eq('project_id', projectId)
                    .eq('name', origName.toUpperCase().trim())
                    .order('created_at', { ascending: false }).limit(1);
                if (projectItems && projectItems.length > 0) {
                    const itemUpdates = { quantity: newQty, unit: newUnit, name: newName };
                    if (newPrice !== null) itemUpdates.value = newPrice;
                    await updateProjectItem(projectItems[0].id, itemUpdates);
                }
            } else {
                const { data: stockItems } = await _supabase.from('stock_items').select('id').eq('name', origName.toUpperCase().trim());
                if (stockItems && stockItems.length > 0) {
                    let query = _supabase.from('stock_exits').select('*').eq('item_id', stockItems[0].id).eq('reason', reason);
                    if (clientId) query = query.eq('client_id', clientId);
                    const { data: exits } = await query.order('created_at', { ascending: false }).limit(1);
                    if (exits && exits.length > 0) {
                        const exitUpdates = { quantity: newQty };
                        if (newPrice !== null) exitUpdates.unit_price = newPrice;
                        await updateStockExit(exits[0].id, exitUpdates);
                    }
                }
            }
        }

        showToast('Registro atualizado com sucesso!', 'success');
        closeHistoryEditModal();
        await refreshRequests();

    } catch (error) {
        console.error('Error saving history edit:', error);
        if (error.code === '42501' || (error.message && error.message.includes('row-level security'))) {
            showToast('Erro de permissão (RLS). Faça login com uma conta de Administrador real.', 'error', 6000);
        } else {
            showToast('Erro ao salvar: ' + (error.message || 'Desconhecido'), 'error');
        }
    } finally {
        saveBtn.disabled = false;
        saveBtn.innerHTML = '<span class="material-symbols-outlined" style="font-size:16px">save</span> Salvar Alterações';
    }
};

window.deleteHistoryRecord = async (req) => {
    const destMsg = req.status === 'DEFERIDO'
        ? (req.project_id ? ' O item também será removido dos Itens do Projeto.' : ' A saída de estoque correspondente também será removida.')
        : '';
    if (!confirm(`Excluir este registro permanentemente?${destMsg}`)) return;

    try {
        if (req.status === 'DEFERIDO') {
            if (req.project_id) {
                const { data: projectItems } = await _supabase
                    .from('project_items').select('id')
                    .eq('project_id', req.project_id)
                    .eq('name', (req.item_name || '').toUpperCase().trim())
                    .order('created_at', { ascending: false }).limit(1);
                if (projectItems && projectItems.length > 0) {
                    await deleteProjectItem(projectItems[0].id);
                }
            } else {
                const { data: stockItems } = await _supabase.from('stock_items').select('id').eq('name', (req.item_name || '').toUpperCase().trim());
                if (stockItems && stockItems.length > 0) {
                    let query = _supabase.from('stock_exits').select('*').eq('item_id', stockItems[0].id).eq('reason', req.reason);
                    if (req.client_id) query = query.eq('client_id', req.client_id);
                    const { data: exits } = await query.order('created_at', { ascending: false }).limit(1);
                    if (exits && exits.length > 0) {
                        await deleteStockExit(exits[0].id);
                    }
                }
            }
        }

        await deleteStockRequest(req.id);
        showToast('Registro excluído com sucesso.', 'info');
        await refreshRequests();

    } catch (error) {
        console.error('Error deleting history record:', error);
        if (error.code === '42501' || (error.message && error.message.includes('row-level security'))) {
            showToast('Erro de permissão (RLS). Faça login com uma conta de Administrador real.', 'error', 6000);
        } else {
            showToast('Erro ao excluir: ' + (error.message || 'Desconhecido'), 'error');
        }
    }
};

window.exportHistoryExcel = () => {
    try {
        const history = getFilteredHistory();
        if (history.length === 0) { showToast('Nenhum dado para exportar.', 'warning'); return; }

        const dataToExport = history.map(req => ({
            'Data': formatDate((req.created_at || '').split('T')[0]),
            'Operador': req.requested_by || '',
            'Material': req.item_name,
            'Quantidade': req.quantity,
            'Unidade': req.unit,
            'Valor Unitário': req.unit_price ? parseFloat(req.unit_price).toFixed(2) : '',
            'Valor Total': req.unit_price ? (parseFloat(req.unit_price) * req.quantity).toFixed(2) : '',
            'Destino': req.projects ? `Projeto: ${req.projects.name}` : (req.clients ? req.clients.name : '-'),
            'Motivo': req.reason,
            'Status': req.status,
            'Info': req.status === 'DEFERIDO' ? `Aprovado por: ${req.approved_by || ''}` : `Motivo Rejeição: ${req.rejection_reason || ''}`
        }));

        const ws = XLSX.utils.json_to_sheet(dataToExport);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'Histórico');
        XLSX.writeFile(wb, 'Historico_Requisicoes_Estoque.xlsx');
        showToast('Excel exportado com sucesso!', 'success');
    } catch (e) {
        console.error('Excel Export Error:', e);
        showToast('Erro ao exportar Excel: ' + e.message, 'error');
    }
};

window.exportHistoryPDF = () => {
    try {
        const history = getFilteredHistory();
        if (history.length === 0) { showToast('Nenhum dado para exportar.', 'warning'); return; }

        const { jsPDF } = window.jspdf;
        const doc = new jsPDF('landscape');

        doc.setFontSize(16);
        doc.text('Histórico de Requisições de Estoque — Resitrat', 14, 20);
        doc.setFontSize(9);
        doc.setTextColor(120);
        doc.text(`Exportado em: ${new Date().toLocaleDateString('pt-BR')}  |  Total: ${history.length} registros`, 14, 27);

        const cols = ['Data', 'Operador', 'Material', 'Qtd', 'Val. Unit', 'Val. Total', 'Destino', 'Status', 'Info'];
        const rows = history.map(req => {
            const opName = (req.requested_by || '-').split('@')[0].toUpperCase();
            const priceUnit = req.unit_price ? `R$ ${parseFloat(req.unit_price).toFixed(2)}` : '-';
            const priceTotal = req.unit_price ? `R$ ${(parseFloat(req.unit_price) * req.quantity).toFixed(2)}` : '-';
            let dest = '-';
            if (req.projects) dest = `Proj: ${req.projects.name}`;
            else if (req.clients) dest = req.clients.name;
            const info = req.status === 'DEFERIDO'
                ? `Aprov: ${(req.approved_by || '').split('@')[0]}`
                : `Rej: ${(req.rejection_reason || '').substring(0, 30)}`;

            return [formatDate((req.created_at || '').split('T')[0]), opName, req.item_name, `${req.quantity} ${req.unit}`, priceUnit, priceTotal, dest, req.status, info];
        });

        doc.autoTable({
            startY: 32,
            head: [cols],
            body: rows,
            theme: 'striped',
            headStyles: { fillColor: [30, 58, 138] },
            styles: { fontSize: 7.5 },
            alternateRowStyles: { fillColor: [248, 250, 252] }
        });

        doc.save('Historico_Requisicoes_Estoque.pdf');
        showToast('PDF exportado com sucesso!', 'success');
    } catch (e) {
        console.error('PDF Export Error:', e);
        showToast('Erro ao exportar PDF: ' + e.message, 'error');
    }
};
