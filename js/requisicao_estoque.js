let currentRole = 'operator'; // 'operator' or 'admin'
let currentAdminTab = 'pending'; // 'pending' or 'history'
let currentUser = null;
let userProfile = null;
let allProjects = [];
let allClients = [];
let allRequests = [];

document.addEventListener('DOMContentLoaded', async () => {
    console.log('Stock Requisitions page loading...');
    
    // 1. Initial Load of Dropdowns & Auth
    await initAuthAndProfile();
    await loadInitialDropdowns();
    
    // 2. Setup Forms and Modals
    setupFormHandlers();
    setupModalHandlers();
    
    // 3. Load Data
    await refreshRequests();
});

// --- Authentication and Profile Role Detection ---
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
                banner.innerHTML = `
                    <span class="material-symbols-outlined text-lg">construction</span>
                    <span><strong>Modo de Desenvolvimento Ativo</strong>. Logado como: <strong>${userProfile.name}</strong> (${userProfile.role}). Perfil: <strong>${currentRole === 'admin' ? 'Administrador' : 'Operador'}</strong>.</span>
                `;
            }
            switchRole(currentRole);
            return;
        }

        if (session && session.user) {
            currentUser = session.user;
            
            // Fetch profile from users table
            const { data: profile, error: profileError } = await _supabase
                .from('users')
                .select('*')
                .eq('email', currentUser.email)
                .maybeSingle();
                
            const emailStr = (currentUser.email || '').toUpperCase();
            const emailIsAdmin = emailStr.startsWith('ADM') || emailStr.includes('ADMIN');

            if (profile) {
                userProfile = profile;
                console.log('User Profile:', profile);
                
                // Heuristic: If role contains coord, geren, gest, adm, dir -> Admin
                const roleStr = (profile.role || '').toUpperCase();
                const isAdminRole = roleStr.includes('GERENTE') || 
                                    roleStr.includes('COORDENADOR') || 
                                    roleStr.includes('GESTOR') || 
                                    roleStr.includes('ADMIN') || 
                                    roleStr.includes('DIRETOR') ||
                                    roleStr.includes('FINANCEIRO') ||
                                    emailIsAdmin;
                                    
                if (isAdminRole) {
                    currentRole = 'admin';
                } else {
                    currentRole = 'operator';
                }
                
                if (banner) {
                    banner.innerHTML = `
                        <span class="material-symbols-outlined text-lg">info</span>
                        <span>Logado como <strong>${profile.name}</strong> (${profile.role || 'Membro'}). Perfil atribuído: <strong>${currentRole === 'admin' ? 'Administrador' : 'Operador'}</strong>.</span>
                    `;
                }
            } else {
                // User has session but no matching entry in 'users' table
                if (emailIsAdmin) {
                    currentRole = 'admin';
                    userProfile = {
                        name: currentUser.email.split('@')[0].toUpperCase(),
                        role: 'Administrador (Fallback)'
                    };
                } else {
                    currentRole = 'operator';
                }

                if (banner) {
                    if (emailIsAdmin) {
                        banner.innerHTML = `
                            <span class="material-symbols-outlined text-lg">info</span>
                            <span>Sessão ativa (${currentUser.email}), logado como administrador de emergência (e-mail adm). Perfil: <strong>Administrador</strong>.</span>
                        `;
                    } else {
                        banner.innerHTML = `
                            <span class="material-symbols-outlined text-lg">info</span>
                            <span>Sessão ativa (${currentUser.email}), mas perfil de membro não encontrado. Perfil padrão: <strong>Operador</strong>.</span>
                        `;
                    }
                }
            }
        } else {
            // No session
            console.warn('No active session found.');
            if (banner) {
                banner.innerHTML = `
                    <span class="material-symbols-outlined text-lg">warning</span>
                    <span>Nenhuma sessão ativa. Redirecionando para login...</span>
                `;
            }
            setTimeout(() => {
                window.location.href = 'login.html';
            }, 1500);
            return;
        }
        
        // Apply active role view
        switchRole(currentRole);
        
        // Hide role switcher and banner if the user is not an admin
        const switcherContainer = document.getElementById('role-switcher-container');
        if (switcherContainer) {
            if (!isDev && currentRole !== 'admin') {
                switcherContainer.classList.add('hidden');
                switcherContainer.classList.remove('flex');
            } else {
                switcherContainer.classList.remove('hidden');
                switcherContainer.classList.add('flex');
            }
        }
        if (banner) {
            if (!isDev && currentRole !== 'admin') {
                banner.classList.add('hidden');
            } else {
                banner.classList.remove('hidden');
            }
        }
        
    } catch (e) {
        console.error('Error initializing auth/profile:', e);
    }
}

// Switch between Operator and Admin views manually (Role Switcher widget)
window.switchRole = (role) => {
    currentRole = role;
    
    const opView = document.getElementById('operator-view');
    const admView = document.getElementById('admin-view');
    const opBtn = document.getElementById('role-op-btn');
    const admBtn = document.getElementById('role-adm-btn');
    
    if (role === 'admin') {
        opView.classList.add('hidden');
        admView.classList.remove('hidden');
        
        admBtn.className = "px-4 py-1.5 rounded-md text-xs font-semibold transition-all duration-200 focus:outline-none bg-primary text-white shadow-sm";
        opBtn.className = "px-4 py-1.5 rounded-md text-xs font-semibold transition-all duration-200 focus:outline-none text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200";
        
        switchAdminTab(currentAdminTab);
    } else {
        admView.classList.add('hidden');
        opView.classList.remove('hidden');
        
        opBtn.className = "px-4 py-1.5 rounded-md text-xs font-semibold transition-all duration-200 focus:outline-none bg-primary text-white shadow-sm";
        admBtn.className = "px-4 py-1.5 rounded-md text-xs font-semibold transition-all duration-200 focus:outline-none text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200";
        
        renderOperatorHistory();
    }
};

// Switch tabs inside Admin View
window.switchAdminTab = (tab) => {
    currentAdminTab = tab;
    
    const pendingTab = document.getElementById('tab-pending');
    const historyTab = document.getElementById('tab-history');
    const pendingBtn = document.getElementById('tab-pending-btn');
    const historyBtn = document.getElementById('tab-history-btn');
    
    if (tab === 'history') {
        pendingTab.classList.add('hidden');
        historyTab.classList.remove('hidden');
        
        historyBtn.className = "border-primary text-primary whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm flex items-center gap-2";
        pendingBtn.className = "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300 dark:text-gray-400 dark:hover:text-gray-300 whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm flex items-center gap-2";
        
        loadAdminHistory();
    } else {
        historyTab.classList.add('hidden');
        pendingTab.classList.remove('hidden');
        
        pendingBtn.className = "border-primary text-primary whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm flex items-center gap-2";
        historyBtn.className = "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300 dark:text-gray-400 dark:hover:text-gray-300 whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm flex items-center gap-2";
        
        loadAdminPending();
    }
};

// --- Dropdowns Loading ---
async function loadInitialDropdowns() {
    try {
        // Load Projects
        allProjects = await fetchProjects();
        const reqProjectSelect = document.getElementById('req-project-select');
        
        allProjects
            .filter(p => p.status !== 'Completed' && p.status !== 'Done')
            .forEach(p => {
                const opt = document.createElement('option');
                opt.value = p.id;
                opt.textContent = p.name;
                reqProjectSelect.appendChild(opt);
            });
            
        // Load Clients
        allClients = await fetchClients();
        const reqClientSelect = document.getElementById('req-client-select');
        const filterClient = document.getElementById('filter-client');
        
        allClients.forEach(c => {
            let label = c.name;
            if (c.company) label += ` (${c.company})`;
            
            // Form select
            const opt1 = document.createElement('option');
            opt1.value = c.id;
            opt1.textContent = label;
            reqClientSelect.appendChild(opt1);
            
            // Filter select
            const opt2 = document.createElement('option');
            opt2.value = c.id;
            opt2.textContent = label;
            filterClient.appendChild(opt2);
        });
        
    } catch (e) {
        console.error('Error loading dropdowns:', e);
    }
}

// --- Data Refresh ---
async function refreshRequests() {
    allRequests = await fetchStockRequests();
    
    // Update pending count badge
    const pendingCount = allRequests.filter(r => r.status === 'PENDENTE').length;
    const badge = document.getElementById('pending-badge-count');
    if (badge) {
        if (pendingCount > 0) {
            badge.textContent = pendingCount;
            badge.classList.remove('hidden');
        } else {
            badge.classList.add('hidden');
        }
    }
    
    // Render current active view
    if (currentRole === 'admin') {
        if (currentAdminTab === 'pending') {
            loadAdminPending();
        } else {
            loadAdminHistory();
        }
    } else {
        renderOperatorHistory();
    }
}

// --- Form & Action Setup ---
function setupFormHandlers() {
    const form = document.getElementById('req-form');
    
    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const submitBtn = document.getElementById('req-submit-btn');
        const editingId = document.getElementById('editing-req-id').value;
        
        const itemName = document.getElementById('req-item-name').value;
        const itemUnit = document.getElementById('req-item-unit').value;
        const qty = parseFloat(document.getElementById('req-qty').value);
        const projectId = document.getElementById('req-project-select').value;
        const clientId = document.getElementById('req-client-select').value;
        const reason = document.getElementById('req-reason').value;
        const obs = document.getElementById('req-obs').value;
        const operatorName = document.getElementById('req-operator-name').value;
        
        if (!itemName || itemName.trim() === '') {
            alert('Por favor, informe o nome do material.');
            return;
        }
        if (isNaN(qty) || qty <= 0) {
            alert('Por favor, insira uma quantidade válida.');
            return;
        }
        if (!operatorName || operatorName.trim() === '') {
            alert('Por favor, informe o nome do operador/solicitante.');
            return;
        }
        
        const requestData = {
            item_name: itemName.toUpperCase().trim(),
            unit: itemUnit,
            quantity: qty,
            project_id: projectId || null,
            client_id: clientId || null,
            reason: reason,
            observation: obs || null,
            status: 'PENDENTE',
            requested_by: operatorName.toUpperCase().trim()
        };
        
        try {
            submitBtn.disabled = true;
            submitBtn.textContent = 'Enviando...';
            
            if (editingId) {
                // Update
                await updateStockRequest(editingId, requestData);
                alert('Solicitação atualizada com sucesso!');
                cancelReqEdit();
            } else {
                // Create
                await createStockRequest(requestData);
                alert('Solicitação de saída enviada com sucesso!');
                form.reset();
            }
            
            await refreshRequests();
            
        } catch (error) {
            console.error('Error submitting request:', error);
            alert('Erro ao enviar solicitação: ' + (error.message || 'Erro desconhecido.'));
        } finally {
            submitBtn.disabled = false;
            submitBtn.textContent = editingId ? 'Salvar Alterações' : 'Enviar Solicitação';
        }
    });
}

window.cancelReqEdit = () => {
    document.getElementById('editing-req-id').value = '';
    document.getElementById('req-form').reset();
    
    document.getElementById('req-submit-btn').textContent = 'Enviar Solicitação';
    document.getElementById('cancel-req-edit-btn').classList.add('hidden');
};

window.editRequest = (req) => {
    document.getElementById('req-form').scrollIntoView({ behavior: 'smooth' });
    
    document.getElementById('editing-req-id').value = req.id;
    document.getElementById('req-item-name').value = req.item_name;
    document.getElementById('req-item-unit').value = req.unit;
    document.getElementById('req-qty').value = req.quantity;
    document.getElementById('req-project-select').value = req.project_id || '';
    document.getElementById('req-client-select').value = req.client_id || '';
    document.getElementById('req-reason').value = req.reason;
    document.getElementById('req-obs').value = req.observation || '';
    document.getElementById('req-operator-name').value = req.requested_by || '';
    
    document.getElementById('req-submit-btn').textContent = 'Salvar Alterações';
    document.getElementById('cancel-req-edit-btn').classList.remove('hidden');
};

window.deleteRequest = async (id) => {
    if (confirm('Tem certeza que deseja excluir esta requisição?')) {
        try {
            await deleteStockRequest(id);
            alert('Requisição excluída!');
            await refreshRequests();
        } catch (error) {
            console.error('Error deleting request:', error);
            alert('Erro ao excluir: ' + error.message);
        }
    }
};

// --- Modal Handlers ---
function setupModalHandlers() {
    // Approve Requisition Submission
    const approveForm = document.getElementById('approve-form');
    approveForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const reqId = document.getElementById('app-request-id').value;
        const unitVal = parseFloat(document.getElementById('app-unit-value').value);
        const confirmBtn = document.getElementById('btn-confirm-approve');
        
        if (isNaN(unitVal) || unitVal < 0) {
            alert('Por favor, digite um valor unitário válido.');
            return;
        }
        
        // Find Requisition details
        const req = allRequests.find(r => r.id === reqId);
        if (!req) {
            alert('Erro: Requisição não encontrada.');
            return;
        }
        
        try {
            confirmBtn.disabled = true;
            confirmBtn.textContent = 'Processando...';
            
            // 1. Ensure Stock Item exists (Creates catalogue if new)
            // It will also freeze the unit price in the catalog
            const itemId = await ensureStockItem(req.item_name, unitVal, req.quantity, req.unit);
            
            // 2. Process stock exit (Insert to stock_exits)
            await processStockExit(itemId, req.quantity, req.reason, req.project_id, req.observation, req.client_id);
            
            // 3. Update stock_requests as APPROVED (DEFERIDO)
            await updateStockRequest(reqId, {
                status: 'DEFERIDO',
                unit_price: unitVal,
                approved_by: currentUser ? currentUser.email : 'ADMINISTRADOR',
                approved_at: new Date().toISOString()
            });
            
            alert('Saída de estoque confirmada e requisição aprovada com sucesso!');
            closeApproveModal();
            await refreshRequests();
            
        } catch (error) {
            console.error('Error approving request:', error);
            if (error.code === '42501' || (error.message && error.message.includes('row-level security'))) {
                alert('Erro de Permissão (RLS): O banco de dados recusou a gravação do item ou da saída.\n\nSe você estiver acessando pelo link de teste (?dev=admin), as alterações no banco são bloqueadas por falta de autenticação real. Faça login com uma conta de Administrador real para confirmar a saída de materiais.');
            } else {
                alert('Erro ao aprovar requisição: ' + (error.message || 'Desconhecido'));
            }
        } finally {
            confirmBtn.disabled = false;
            confirmBtn.textContent = 'Confirmar Saída';
        }
    });
    
    // Reject Requisition Submission
    const rejectForm = document.getElementById('reject-form');
    rejectForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const reqId = document.getElementById('rej-request-id').value;
        const reasonText = document.getElementById('rej-reason-text').value;
        const confirmBtn = document.getElementById('btn-confirm-reject');
        
        if (!reasonText || reasonText.trim() === '') {
            alert('Por favor, informe o motivo do indeferimento.');
            return;
        }
        
        try {
            confirmBtn.disabled = true;
            confirmBtn.textContent = 'Gravando...';
            
            // Update request
            await updateStockRequest(reqId, {
                status: 'INDEFERIDO',
                rejection_reason: reasonText.trim(),
                approved_by: currentUser ? currentUser.email : 'ADMINISTRADOR',
                approved_at: new Date().toISOString()
            });
            
            alert('Requisição indeferida com sucesso!');
            closeRejectModal();
            await refreshRequests();
            
        } catch (error) {
            console.error('Error rejecting request:', error);
            if (error.code === '42501' || (error.message && error.message.includes('row-level security'))) {
                alert('Erro de Permissão (RLS): O banco de dados recusou a alteração do status da requisição.\n\nSe você estiver acessando pelo link de teste (?dev=admin), faça login com uma conta de Administrador real.');
            } else {
                alert('Erro ao rejeitar: ' + error.message);
            }
        } finally {
            confirmBtn.disabled = false;
            confirmBtn.textContent = 'Confirmar Indeferimento';
        }
    });
}

// Modal open/close actions
window.openApproveModal = (reqId) => {
    const req = allRequests.find(r => r.id === reqId);
    if (!req) return;
    
    document.getElementById('app-request-id').value = reqId;
    document.getElementById('app-unit-value').value = '';
    
    // Setup summary fields
    document.getElementById('app-summary-item').textContent = req.item_name;
    document.getElementById('app-summary-qty').textContent = `Quantidade: ${req.quantity} ${req.unit}`;
    
    let dest = '-';
    if (req.projects) dest = `Projeto: ${req.projects.name}`;
    else if (req.clients) dest = `Cliente: ${req.clients.name}`;
    document.getElementById('app-summary-dest').textContent = dest;
    
    document.getElementById('app-summary-obs').textContent = req.observation ? `Obs: "${req.observation}"` : '';
    
    document.getElementById('approve-modal').classList.remove('hidden');
    document.getElementById('app-unit-value').focus();
};

window.closeApproveModal = () => {
    document.getElementById('approve-modal').classList.add('hidden');
};

window.openRejectModal = (reqId) => {
    document.getElementById('rej-request-id').value = reqId;
    document.getElementById('rej-reason-text').value = '';
    
    document.getElementById('reject-modal').classList.remove('hidden');
    document.getElementById('rej-reason-text').focus();
};

window.closeRejectModal = () => {
    document.getElementById('reject-modal').classList.add('hidden');
};

// --- Render Operations ---

// Render Operator history (their requests)
function renderOperatorHistory() {
    const tbody = document.getElementById('op-history-table-body');
    if (!tbody) return;
    
    tbody.innerHTML = '';
    
    // Sort allRequests by created_at desc
    const sorted = [...allRequests].sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    
    // Show all recent requests in the terminal
    const filtered = sorted;
        
    if (filtered.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="8" class="px-6 py-4 text-center text-gray-500 dark:text-gray-400 text-sm">
                    Nenhuma requisição realizada ainda.
                </td>
            </tr>
        `;
        return;
    }
    
    filtered.forEach(req => {
        const tr = document.createElement('tr');
        tr.className = "hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors";
        
        const dateStr = formatDate(req.created_at.split('T')[0]);
        let dest = '-';
        if (req.projects) dest = `Proj: ${req.projects.name}`;
        else if (req.clients) dest = `Cli: ${req.clients.name}`;
        
        // Status Badge
        let badgeHtml = '';
        if (req.status === 'PENDENTE') {
            badgeHtml = `<span class="inline-flex items-center gap-1.5 rounded-full bg-yellow-100 dark:bg-yellow-900/50 px-2.5 py-1 text-xs font-semibold text-yellow-700 dark:text-yellow-300"><span class="size-1.5 rounded-full bg-yellow-500 animate-pulse"></span>Pendente</span>`;
        } else if (req.status === 'DEFERIDO') {
            badgeHtml = `<span class="inline-flex items-center gap-1.5 rounded-full bg-green-100 dark:bg-green-900/50 px-2.5 py-1 text-xs font-semibold text-green-700 dark:text-green-300"><span class="size-1.5 rounded-full bg-green-500"></span>Deferido</span>`;
        } else {
            badgeHtml = `<span class="inline-flex items-center gap-1.5 rounded-full bg-red-100 dark:bg-red-900/50 px-2.5 py-1 text-xs font-semibold text-red-700 dark:text-red-300" title="Motivo: ${req.rejection_reason || 'Não informado'}"><span class="size-1.5 rounded-full bg-red-500"></span>Indeferido</span>`;
        }
        
        tr.innerHTML = `
            <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-700 dark:text-gray-300">${dateStr}</td>
            <td class="px-6 py-4 whitespace-nowrap text-sm font-semibold text-gray-900 dark:text-white">${req.requested_by || '-'}</td>
            <td class="px-6 py-4 whitespace-nowrap text-sm font-semibold text-gray-900 dark:text-white">${req.item_name}</td>
            <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-700 dark:text-gray-300">${req.quantity} ${req.unit}</td>
            <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-700 dark:text-gray-300">${dest}</td>
            <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-700 dark:text-gray-300">${req.reason}</td>
            <td class="px-6 py-4 whitespace-nowrap text-sm">${badgeHtml}</td>
            <td class="px-6 py-4 whitespace-nowrap text-right text-sm font-medium"></td>
        `;
        
        // Actions
        const actionsTd = tr.lastElementChild;
        if (req.status === 'PENDENTE') {
            const container = document.createElement('div');
            container.className = "flex items-center justify-end gap-2";
            
            // Edit
            const editBtn = document.createElement('button');
            editBtn.className = "text-yellow-600 hover:text-yellow-900 dark:text-yellow-400 dark:hover:text-yellow-300 flex items-center";
            editBtn.innerHTML = '<span class="material-symbols-outlined text-lg">edit</span>';
            editBtn.title = 'Editar';
            editBtn.onclick = () => editRequest(req);
            container.appendChild(editBtn);
            
            // Delete
            const delBtn = document.createElement('button');
            delBtn.className = "text-red-600 hover:text-red-900 dark:text-red-400 dark:hover:text-red-300 flex items-center";
            delBtn.innerHTML = '<span class="material-symbols-outlined text-lg">delete</span>';
            delBtn.title = 'Excluir';
            delBtn.onclick = () => deleteRequest(req.id);
            container.appendChild(delBtn);
            
            actionsTd.appendChild(container);
        } else {
            actionsTd.innerHTML = '<span class="text-xs text-gray-400 italic">Trancado</span>';
        }
        
        tbody.appendChild(tr);
    });
}

// Render Admin Pending Tab
function loadAdminPending() {
    const tbody = document.getElementById('adm-pending-table-body');
    if (!tbody) return;
    
    tbody.innerHTML = '';
    
    const pendings = allRequests.filter(r => r.status === 'PENDENTE');
    
    if (pendings.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="8" class="px-6 py-4 text-center text-gray-500 dark:text-gray-400 text-sm">
                    Nenhuma requisição pendente de aprovação.
                </td>
            </tr>
        `;
        return;
    }
    
    pendings.forEach(req => {
        const tr = document.createElement('tr');
        tr.className = "hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors";
        
        const dateStr = formatDate(req.created_at.split('T')[0]);
        let dest = '-';
        if (req.projects) dest = `Proj: ${req.projects.name}`;
        else if (req.clients) dest = `Cli: ${req.clients.name}`;
        
        const operatorName = req.requested_by ? req.requested_by.split('@')[0].toUpperCase() : 'DESCONHECIDO';
        
        tr.innerHTML = `
            <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-700 dark:text-gray-300">${dateStr}</td>
            <td class="px-6 py-4 whitespace-nowrap text-sm font-semibold text-gray-900 dark:text-white" title="${req.requested_by}">${operatorName}</td>
            <td class="px-6 py-4 whitespace-nowrap text-sm font-semibold text-gray-900 dark:text-white">${req.item_name}</td>
            <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-700 dark:text-gray-300">${req.quantity} ${req.unit}</td>
            <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-700 dark:text-gray-300">${dest}</td>
            <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-700 dark:text-gray-300">${req.reason}</td>
            <td class="px-6 py-4 text-sm text-gray-500 dark:text-gray-400 max-w-xs truncate" title="${req.observation || ''}">${req.observation || '-'}</td>
            <td class="px-6 py-4 whitespace-nowrap text-right text-sm font-medium"></td>
        `;
        
        // Actions: Approve & Reject
        const actionTd = tr.lastElementChild;
        const container = document.createElement('div');
        container.className = "flex items-center justify-end gap-3";
        
        // Editar
        const editBtn = document.createElement('button');
        editBtn.className = "text-blue-600 hover:text-blue-900 dark:text-blue-400 dark:hover:text-blue-300 flex items-center gap-0.5 hover:underline";
        editBtn.innerHTML = '<span class="material-symbols-outlined text-lg">edit</span> <span class="text-xs font-semibold">Editar</span>';
        editBtn.onclick = () => {
            switchRole('operator');
            setTimeout(() => editRequest(req), 100);
        };
        container.appendChild(editBtn);

        // Excluir
        const delBtn = document.createElement('button');
        delBtn.className = "text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-300 flex items-center gap-0.5 hover:underline";
        delBtn.innerHTML = '<span class="material-symbols-outlined text-lg">delete</span> <span class="text-xs font-semibold">Excluir</span>';
        delBtn.onclick = () => deleteRequest(req.id);
        container.appendChild(delBtn);
        
        // Deferir (Approve)
        const appBtn = document.createElement('button');
        appBtn.className = "text-green-600 hover:text-green-900 dark:text-green-400 dark:hover:text-green-300 flex items-center gap-0.5 hover:underline";
        appBtn.innerHTML = '<span class="material-symbols-outlined text-lg">check_circle</span> <span class="text-xs font-semibold">Deferir</span>';
        appBtn.onclick = () => openApproveModal(req.id);
        container.appendChild(appBtn);
        
        // Indeferir (Reject)
        const rejBtn = document.createElement('button');
        rejBtn.className = "text-red-600 hover:text-red-900 dark:text-red-400 dark:hover:text-red-300 flex items-center gap-0.5 hover:underline";
        rejBtn.innerHTML = '<span class="material-symbols-outlined text-lg">cancel</span> <span class="text-xs font-semibold">Indeferir</span>';
        rejBtn.onclick = () => openRejectModal(req.id);
        container.appendChild(rejBtn);
        
        actionTd.appendChild(container);
        tbody.appendChild(tr);
    });
}

// Get filtered consolidated history
function getFilteredHistory() {
    let history = allRequests.filter(r => r.status !== 'PENDENTE');
    
    // Status Filter
    const filterStatus = document.getElementById('filter-status').value;
    if (filterStatus) {
        history = history.filter(r => r.status === filterStatus);
    }
    
    // Client Filter
    const filterClientId = document.getElementById('filter-client').value;
    if (filterClientId) {
        history = history.filter(r => r.client_id == filterClientId);
    }
    
    // Month Filter (YYYY-MM)
    const filterMonth = document.getElementById('filter-month').value;
    if (filterMonth) {
        history = history.filter(r => r.created_at.startsWith(filterMonth));
    }
    
    // Sort desc
    history.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    
    return history;
}

// Render Admin History Tab
function loadAdminHistory() {
    const tbody = document.getElementById('adm-history-table-body');
    if (!tbody) return;
    
    tbody.innerHTML = '';
    
    const filtered = getFilteredHistory();
    
    if (filtered.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="9" class="px-6 py-4 text-center text-gray-500 dark:text-gray-400 text-sm">
                    Nenhuma requisição no histórico com os filtros atuais.
                </td>
            </tr>
        `;
        return;
    }
    
    filtered.forEach(req => {
        const tr = document.createElement('tr');
        tr.className = "hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors";
        
        const dateStr = formatDate(req.created_at.split('T')[0]);
        let dest = '-';
        if (req.projects) dest = `Proj: ${req.projects.name}`;
        else if (req.clients) dest = `Cli: ${req.clients.name}`;
        
        const operatorName = req.requested_by ? req.requested_by.split('@')[0].toUpperCase() : 'DESCONHECIDO';
        
        // Status Badge
        let badgeHtml = '';
        let extraInfo = '';
        if (req.status === 'DEFERIDO') {
            badgeHtml = `<span class="inline-flex items-center gap-1.5 rounded-full bg-green-100 dark:bg-green-900/50 px-2.5 py-1 text-xs font-semibold text-green-700 dark:text-green-300">Deferido</span>`;
            
            const totalVal = (req.unit_price || 0) * req.quantity;
            extraInfo = `Preço: R$ ${parseFloat(req.unit_price).toFixed(2)} (Aprovado por: ${req.approved_by || 'Admin'})`;
        } else {
            badgeHtml = `<span class="inline-flex items-center gap-1.5 rounded-full bg-red-100 dark:bg-red-900/50 px-2.5 py-1 text-xs font-semibold text-red-700 dark:text-red-300">Indeferido</span>`;
            
            extraInfo = `Motivo rejeição: "${req.rejection_reason || 'Não informado'}" (Rejeitado por: ${req.approved_by || 'Admin'})`;
        }
        
        const priceUnit = req.unit_price ? `R$ ${parseFloat(req.unit_price).toFixed(2)}` : '-';
        const priceTotal = req.unit_price ? `R$ ${(parseFloat(req.unit_price) * req.quantity).toFixed(2)}` : '-';
        
        tr.innerHTML = `
            <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-700 dark:text-gray-300">${dateStr}</td>
            <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-white" title="${req.requested_by}">${operatorName}</td>
            <td class="px-6 py-4 whitespace-nowrap text-sm font-semibold text-gray-900 dark:text-white">${req.item_name}</td>
            <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-700 dark:text-gray-300 font-bold">${req.quantity} ${req.unit}</td>
            <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-700 dark:text-gray-300">${priceUnit}</td>
            <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-white font-bold">${priceTotal}</td>
            <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-700 dark:text-gray-300">${dest}</td>
            <td class="px-6 py-4 whitespace-nowrap text-sm">${badgeHtml}</td>
            <td class="px-6 py-4 text-xs text-gray-500 dark:text-gray-400 italic max-w-xs truncate" title="${extraInfo}">${extraInfo}</td>
        `;
        
        tbody.appendChild(tr);
    });
}

// --- Exports Logic ---
window.exportHistoryExcel = () => {
    try {
        const history = getFilteredHistory();
        if (history.length === 0) {
            alert('Não há dados de histórico para exportar.');
            return;
        }
        
        const dataToExport = history.map(req => ({
            'Data': formatDate(req.created_at.split('T')[0]),
            'Operador': req.requested_by || '',
            'Material': req.item_name,
            'Quantidade': req.quantity,
            'Unidade': req.unit,
            'Valor Unitário': req.unit_price ? parseFloat(req.unit_price).toFixed(2) : '',
            'Valor Total': req.unit_price ? (parseFloat(req.unit_price) * req.quantity).toFixed(2) : '',
            'Destino': req.projects ? `Projeto: ${req.projects.name}` : (req.clients ? `Cliente: ${req.clients.name}` : '-'),
            'Motivo/Aplicação': req.reason,
            'Status': req.status,
            'Info Adicional / Motivo Rejeição': req.status === 'DEFERIDO' 
                ? `Aprovado por: ${req.approved_by || ''}` 
                : `Motivo: ${req.rejection_reason || ''}`
        }));
        
        const ws = XLSX.utils.json_to_sheet(dataToExport);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "Histórico de Requisições");
        
        XLSX.writeFile(wb, "Historico_Requisicoes_Estoque.xlsx");
        
    } catch (e) {
        console.error('Excel Export Error:', e);
        alert('Erro ao exportar XLS: ' + e.message);
    }
};

window.exportHistoryPDF = () => {
    try {
        const history = getFilteredHistory();
        if (history.length === 0) {
            alert('Não há dados de histórico para exportar.');
            return;
        }
        
        const { jsPDF } = window.jspdf;
        const doc = new jsPDF('landscape');
        
        doc.setFontSize(18);
        doc.text('Histórico Consolidado de Requisições de Estoque', 14, 22);
        
        doc.setFontSize(11);
        doc.setTextColor(100);
        doc.text(`Exportado em: ${new Date().toLocaleDateString('pt-BR')}`, 14, 30);
        
        const tableColumn = ["Data", "Operador", "Material", "Qtd", "Val. Unit", "Val. Total", "Destino", "Status", "Info"];
        const tableRows = [];
        
        history.forEach(req => {
            const dateStr = formatDate(req.created_at.split('T')[0]);
            const opName = req.requested_by ? req.requested_by.split('@')[0].toUpperCase() : '-';
            const priceUnit = req.unit_price ? `R$ ${parseFloat(req.unit_price).toFixed(2)}` : '-';
            const priceTotal = req.unit_price ? `R$ ${(parseFloat(req.unit_price) * req.quantity).toFixed(2)}` : '-';
            
            let dest = '-';
            if (req.projects) dest = `Proj: ${req.projects.name}`;
            else if (req.clients) dest = `Cli: ${req.clients.name}`;
            
            const info = req.status === 'DEFERIDO' 
                ? `Aprov: ${req.approved_by ? req.approved_by.split('@')[0] : ''}`
                : `Rej: ${req.rejection_reason || ''}`;
                
            tableRows.push([
                dateStr,
                opName,
                req.item_name,
                `${req.quantity} ${req.unit}`,
                priceUnit,
                priceTotal,
                dest,
                req.status,
                info
            ]);
        });
        
        doc.autoTable({
            startY: 36,
            head: [tableColumn],
            body: tableRows,
            theme: 'striped',
            headStyles: { fillColor: [19, 91, 236] }, // Primary color
            styles: { fontSize: 8 },
            margin: { top: 30 }
        });
        
        doc.save('Historico_Requisicoes_Estoque.pdf');
        
    } catch (e) {
        console.error('PDF Export Error:', e);
        alert('Erro ao exportar PDF: ' + e.message);
    }
};
