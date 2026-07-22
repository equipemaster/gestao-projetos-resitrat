document.addEventListener('DOMContentLoaded', () => {
    // Enforce that only logged in admins can view this page
    checkAdminAccess();
    renderPermissionsGrid('signup-permissions-grid');
    renderPermissionsGrid('edit-permissions-grid');
    setupSignupForm();
    loadUsersList();
    setupEditForm();
});

async function checkAdminAccess() {
    try {
        const urlParams = new URLSearchParams(window.location.search);
        if (urlParams.has('dev')) {
            console.log('Admin check bypassed via dev mode.');
            return;
        }

        const { data: { session }, error } = await _supabase.auth.getSession();
        if (error) throw error;

        if (!session) {
            window.location.href = 'login.html';
            return;
        }

        // Fetch user profile from database (by id — see auth.js checkSession()
        // for why matching by email breaks if it's ever duplicated)
        const { data: profile, error: profileError } = await _supabase
            .from('users')
            .select('role')
            .eq('id', session.user.id)
            .maybeSingle();

        if (profileError) throw profileError;

        let isAdmin = false;
        const email = (session.user.email || '').toUpperCase();
        if (email.startsWith('ADM') || email.includes('ADMIN')) {
            isAdmin = true;
        } else if (profile) {
            const roleStr = (profile.role || '').toUpperCase();
            isAdmin = roleStr.includes('GERENTE') ||
                      roleStr.includes('COORDENADOR') ||
                      roleStr.includes('GESTOR') ||
                      roleStr.includes('ADMIN') ||
                      roleStr.includes('DIRETOR') ||
                      roleStr.includes('FINANCEIRO');
        }

        if (!isAdmin) {
            console.warn('Access denied for non-admin user.');
            alert('Acesso negado: Apenas administradores podem cadastrar novos usuários.');
            window.location.href = 'gerenciamentodeprojetos.html';
        }
    } catch (e) {
        console.error('Error verifying admin access:', e);
        window.location.href = 'gerenciamentodeprojetos.html';
    }
}

// ─── Page Access Permissions ─────────────────────────────────────────────────
// Grants an operator-tier account (Operador, Projetista, Terceiro) access to
// specific sidebar pages beyond their default home (requisicao_estoque.html).
// Admin-tier roles (Gerente/Coordenador/Gestor/Financeiro/ADM*) always have
// full access regardless of this list — see auth.js checkSession(). Pages
// that are role-gated independently of auth.js (cadastro_usuario.html itself,
// which does its own checkAdminAccess() check) and the exclusive kiosk
// account (gestao_avista.html) are deliberately left out of this grid.
const PAGE_OPTIONS = [
    { href: 'requisicao_estoque.html', label: 'Requisições de Estoque', alwaysOn: true },
    { href: 'gerenciamentodeprojetos.html', label: 'Dashboard' },
    { href: 'listaprojetos.html', label: 'Projetos' },
    { href: 'itens_projeto.html', label: 'Itens do Projeto' },
    { href: 'controle_producao.html', label: 'Controle de Produção' },
    { href: 'saida_estoque.html', label: 'Saída de Estoque' },
    { href: 'ordem_compra.html', label: 'Ordem de Compra' },
    { href: 'conferencia_recebimento.html', label: 'Conferência de Recebimento' },
    { href: 'clientes.html', label: 'Clientes' },
    { href: 'dashboard_custos.html', label: 'Custos por Cliente' },
    { href: 'tarefas.html', label: 'Tarefas' },
    { href: 'membros.html', label: 'Equipe' },
    { href: 'relatorios.html', label: 'Relatórios' },
    { href: 'previsao_projeto.html', label: 'Previsão de Projeto' },
    { href: 'ajuda.html', label: 'Ajuda e Suporte' },
    { href: 'configuracoes.html', label: 'Configurações' }
];

function renderPermissionsGrid(containerId, checkedPages) {
    const container = document.getElementById(containerId);
    if (!container) return;
    const checked = new Set(checkedPages || []);

    container.innerHTML = PAGE_OPTIONS.map(page => `
        <label class="flex items-center gap-1.5 text-xs text-gray-700 dark:text-gray-300 ${page.alwaysOn ? 'opacity-70' : 'cursor-pointer'}">
            <input type="checkbox" class="permission-checkbox rounded border-gray-300 dark:border-gray-600 text-primary focus:ring-primary/50"
                value="${page.href}" ${(page.alwaysOn || checked.has(page.href)) ? 'checked' : ''} ${page.alwaysOn ? 'disabled' : ''}>
            ${escapeHtml(page.label)}${page.alwaysOn ? ' <span class="text-[10px] text-gray-400">(padrão)</span>' : ''}
        </label>
    `).join('');
}

function collectCheckedPages(containerId) {
    const container = document.getElementById(containerId);
    if (!container) return [];
    return Array.from(container.querySelectorAll('.permission-checkbox'))
        .filter(cb => cb.checked)
        .map(cb => cb.value);
}

function setupSignupForm() {
    const form = document.getElementById('signup-user-form');
    if (!form) return;

    form.addEventListener('submit', async (e) => {
        e.preventDefault();

        const submitBtn = document.getElementById('submit-signup-btn');
        const fullName = document.getElementById('user-fullname').value;
        const email = document.getElementById('user-email').value;
        const password = document.getElementById('user-password').value;
        const role = document.getElementById('user-role').value;
        const allowedPages = collectCheckedPages('signup-permissions-grid');

        if (!fullName || fullName.trim() === '') {
            alert('Por favor, digite o nome completo.');
            return;
        }
        if (password.length < 6) {
            alert('A senha deve ter no mínimo 6 caracteres.');
            return;
        }

        try {
            submitBtn.disabled = true;
            submitBtn.textContent = 'Processando...';

            // 1. Call Supabase Auth REST API directly for signup
            // This prevents sign-up from logging out the current admin user session
            const signupUrl = `${SUPABASE_URL}/auth/v1/signup`;
            const res = await fetch(signupUrl, {
                method: 'POST',
                headers: {
                    'apikey': SUPABASE_ANON_KEY,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    email: email.trim().toLowerCase(),
                    password: password
                })
            });

            const data = await res.json();

            if (!res.ok) {
                throw new Error(data.msg || data.message || 'Falha ao registrar credenciais no Supabase.');
            }

            // Extract User ID from the response payload
            const userId = data.id || (data.user && data.user.id);
            if (!userId) {
                throw new Error('ID do novo usuário não foi retornado pelo Supabase.');
            }

            // 2. Insert profile record into public.users table
            const { error: profileError } = await _supabase
                .from('users')
                .insert([{
                    id: userId,
                    name: fullName.toUpperCase().trim(),
                    email: email.trim().toLowerCase(),
                    role: role,
                    status: 'Active',
                    allowed_pages: allowedPages
                }]);

            if (profileError) {
                throw profileError;
            }

            alert('Usuário cadastrado com sucesso!');
            form.reset();
            renderPermissionsGrid('signup-permissions-grid');
            loadUsersList();

        } catch (error) {
            console.error('Error creating user:', error);
            alert('Erro ao cadastrar usuário: ' + (error.message || 'Erro desconhecido.'));
        } finally {
            submitBtn.disabled = false;
            submitBtn.textContent = 'Cadastrar Usuário';
        }
    });
}

// ─── User List (merges public.users profiles with every auth.users account) ─

let currentUsers = []; // profiles only, keyed by id — used by openEditModal for the "update" path
let currentAccounts = []; // merged view: every auth account, profile data if it has one

async function loadUsersList() {
    try {
        const [profiles, authAccounts] = await Promise.all([
            fetchMembers(),
            fetchAuthAccounts().catch(err => {
                // Non-admin dev-mode sessions or a missing RPC shouldn't break the
                // whole page — fall back to profiles-only if this fails.
                console.error('Error fetching auth accounts (falling back to profiles only):', err);
                return null;
            })
        ]);

        currentUsers = profiles || [];
        const profileById = new Map(currentUsers.map(u => [u.id, u]));

        if (authAccounts) {
            currentAccounts = authAccounts.map(acc => ({
                authId: acc.id,
                authEmail: acc.email,
                authCreatedAt: acc.created_at,
                lastSignInAt: acc.last_sign_in_at,
                profile: profileById.get(acc.id) || null
            }));
            // Profiles whose id doesn't match any current auth account are rare/stale
            // (e.g. manual DB edits) but still worth showing rather than hiding.
            const seenIds = new Set(authAccounts.map(a => a.id));
            currentUsers.forEach(u => {
                if (!seenIds.has(u.id)) {
                    currentAccounts.push({ authId: u.id, authEmail: u.email, authCreatedAt: u.created_at, lastSignInAt: null, profile: u });
                }
            });
        } else {
            // Fallback: only what we can see in public.users.
            currentAccounts = currentUsers.map(u => ({ authId: u.id, authEmail: u.email, authCreatedAt: u.created_at, lastSignInAt: null, profile: u }));
        }

        renderUsers(currentAccounts);
    } catch (e) {
        console.error('Error loading users:', e);
    }
}

function permissionsSummary(profile) {
    if (!profile) return '<span class="italic text-gray-400">—</span>';
    const roleStr = (profile.role || '').toUpperCase();
    const isAdminRole = roleStr.includes('GERENTE') || roleStr.includes('COORDENADOR') ||
        roleStr.includes('GESTOR') || roleStr.includes('ADMIN') ||
        roleStr.includes('DIRETOR') || roleStr.includes('FINANCEIRO');

    if (isAdminRole) {
        return '<span class="text-emerald-600 dark:text-emerald-400 font-medium">Acesso total (Admin)</span>';
    }

    const pages = Array.isArray(profile.allowed_pages) ? profile.allowed_pages : [];
    if (pages.length === 0) {
        return '<span class="italic text-gray-400">Somente Requisições (padrão)</span>';
    }

    const labels = pages
        .map(href => PAGE_OPTIONS.find(p => p.href === href)?.label || href)
        .filter(Boolean);
    const preview = labels.slice(0, 2).join(', ');
    const extra = labels.length > 2 ? ` +${labels.length - 2}` : '';
    return `<span title="${escapeHtml(labels.join(', '))}">Requisições${labels.length ? ', ' : ''}${escapeHtml(preview)}${escapeHtml(extra)}</span>`;
}

function renderUsers(accounts) {
    const tbody = document.getElementById('users-table-body');
    if (!tbody) return;
    tbody.innerHTML = '';

    if (!accounts || accounts.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" class="px-6 py-4 text-center text-sm text-gray-500">Nenhum usuário encontrado.</td></tr>';
        return;
    }

    accounts.forEach(acc => {
        const profile = acc.profile;
        const tr = document.createElement('tr');
        tr.className = 'hover:bg-gray-50 dark:hover:bg-gray-800/50';

        if (profile) {
            tr.innerHTML = `
                <td class="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900 dark:text-gray-100">${escapeHtml(profile.name)}</td>
                <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">${escapeHtml(profile.email)}</td>
                <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">${escapeHtml(profile.role || 'Membro')}</td>
                <td class="px-6 py-4 text-sm text-gray-500 dark:text-gray-400">${permissionsSummary(profile)}</td>
                <td class="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                    <button class="text-primary hover:text-primary/80 flex items-center gap-1 justify-end ml-auto" onclick="openEditModal('${acc.authId}')">
                        <span class="material-symbols-outlined text-lg">edit</span> Editar
                    </button>
                </td>
            `;
        } else {
            tr.innerHTML = `
                <td class="px-6 py-4 whitespace-nowrap text-sm italic text-gray-400">Sem perfil</td>
                <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">${escapeHtml(acc.authEmail)}</td>
                <td class="px-6 py-4 whitespace-nowrap text-sm">
                    <span class="px-2 py-0.5 rounded-full text-xs font-bold bg-amber-50 text-amber-700 border border-amber-200 dark:bg-amber-900/20 dark:text-amber-400 dark:border-amber-800">SEM PERFIL</span>
                </td>
                <td class="px-6 py-4 text-sm text-gray-400 italic">—</td>
                <td class="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                    <button class="text-amber-600 hover:text-amber-700 flex items-center gap-1 justify-end ml-auto" onclick="openEditModal('${acc.authId}')">
                        <span class="material-symbols-outlined text-lg">person_add</span> Criar Perfil
                    </button>
                </td>
            `;
        }
        tbody.appendChild(tr);
    });
}

window.openEditModal = (accountId) => {
    const account = currentAccounts.find(a => a.authId === accountId);
    if (!account) return;

    const profile = account.profile;
    const isCreate = !profile;

    document.getElementById('edit-user-id').value = accountId;
    document.getElementById('edit-user-mode').value = isCreate ? 'create' : 'update';
    document.getElementById('edit-user-fullname').value = profile?.name || '';
    document.getElementById('edit-user-email').value = profile?.email || account.authEmail || '';
    document.getElementById('edit-user-role').value = profile?.role || 'OPERADOR-INSTALADOR';
    document.getElementById('edit-user-password').value = ''; // leave blank
    renderPermissionsGrid('edit-permissions-grid', profile?.allowed_pages || []);

    document.getElementById('modal-title').textContent = isCreate ? 'Criar Perfil de Usuário' : 'Editar Usuário';
    document.getElementById('edit-modal-subtitle').classList.toggle('hidden', !isCreate);
    document.getElementById('submit-edit-btn').textContent = isCreate ? 'Criar Perfil' : 'Salvar Alterações';

    document.getElementById('edit-user-modal').classList.remove('hidden');
};

window.closeEditModal = () => {
    document.getElementById('edit-user-modal').classList.add('hidden');
};

function setupEditForm() {
    const form = document.getElementById('edit-user-form');
    if (!form) return;

    form.addEventListener('submit', async (e) => {
        e.preventDefault();

        const btn = document.getElementById('submit-edit-btn');
        const mode = document.getElementById('edit-user-mode').value;
        btn.disabled = true;
        btn.textContent = mode === 'create' ? 'Criando...' : 'Salvando...';

        const userId = document.getElementById('edit-user-id').value;
        const name = document.getElementById('edit-user-fullname').value;
        const email = document.getElementById('edit-user-email').value;
        const role = document.getElementById('edit-user-role').value;
        const password = document.getElementById('edit-user-password').value;
        const allowedPages = collectCheckedPages('edit-permissions-grid');

        try {
            if (mode === 'create') {
                const { error: insertError } = await _supabase
                    .from('users')
                    .insert([{
                        id: userId,
                        name: name.toUpperCase().trim(),
                        email: email.trim().toLowerCase(),
                        role: role,
                        status: 'Active',
                        allowed_pages: allowedPages
                    }]);
                if (insertError) throw insertError;
            } else {
                await updateMember(userId, { name, email, role, allowed_pages: allowedPages });
            }

            // Update auth.users if email or password provided (calls RPC)
            if (password) {
                try {
                    await adminUpdateUserAuth(userId, email, password);
                } catch (authErr) {
                    console.error('Erro no RPC:', authErr);
                    alert('Os dados de perfil foram salvos, mas houve um erro ao atualizar email/senha de login. Certifique-se de que a função SQL "admin_update_user_auth" foi criada no Supabase.');
                }
            }

            alert(mode === 'create' ? 'Perfil criado com sucesso!' : 'Usuário atualizado com sucesso!');
            closeEditModal();
            loadUsersList(); // refresh list
        } catch (err) {
            console.error('Erro ao salvar:', err);
            alert('Falha ao salvar o usuário: ' + err.message);
        } finally {
            btn.disabled = false;
            btn.textContent = mode === 'create' ? 'Criar Perfil' : 'Salvar Alterações';
        }
    });
}
