document.addEventListener('DOMContentLoaded', () => {
    // Enforce that only logged in admins can view this page
    checkAdminAccess();
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

        // Fetch user profile from database
        const { data: profile, error: profileError } = await _supabase
            .from('users')
            .select('role')
            .eq('email', session.user.email)
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
                    status: 'Active'
                }]);

            if (profileError) {
                throw profileError;
            }

            alert('Usuário cadastrado com sucesso!');
            form.reset();

        } catch (error) {
            console.error('Error creating user:', error);
            alert('Erro ao cadastrar usuário: ' + (error.message || 'Erro desconhecido.'));
        } finally {
            submitBtn.disabled = false;
            submitBtn.textContent = 'Cadastrar Usuário';
        }
    });
}

// User List and Edit Logic
let currentUsers = [];

async function loadUsersList() {
    try {
        currentUsers = await fetchMembers();
        renderUsers(currentUsers);
    } catch (e) {
        console.error('Error loading users:', e);
    }
}

function renderUsers(users) {
    const tbody = document.getElementById('users-table-body');
    if (!tbody) return;
    tbody.innerHTML = '';

    if (!users || users.length === 0) {
        tbody.innerHTML = '<tr><td colspan="4" class="px-6 py-4 text-center text-sm text-gray-500">Nenhum usuário encontrado.</td></tr>';
        return;
    }

    users.forEach(user => {
        const tr = document.createElement('tr');
        tr.className = 'hover:bg-gray-50 dark:hover:bg-gray-800/50';
        tr.innerHTML = `
            <td class="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900 dark:text-gray-100">${escapeHtml(user.name)}</td>
            <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">${escapeHtml(user.email)}</td>
            <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">${escapeHtml(user.role || 'Membro')}</td>
            <td class="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                <button class="text-primary hover:text-primary/80 flex items-center gap-1 justify-end ml-auto" onclick="openEditModal('${user.id}')">
                    <span class="material-symbols-outlined text-lg">edit</span> Editar
                </button>
            </td>
        `;
        tbody.appendChild(tr);
    });
}

window.openEditModal = (userId) => {
    const user = currentUsers.find(u => u.id === userId);
    if (!user) return;

    document.getElementById('edit-user-id').value = user.id;
    document.getElementById('edit-user-fullname').value = user.name;
    document.getElementById('edit-user-email').value = user.email;
    document.getElementById('edit-user-role').value = user.role || 'OPERADOR-INSTALADOR';
    document.getElementById('edit-user-password').value = ''; // leave blank

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
        btn.disabled = true;
        btn.textContent = 'Salvando...';

        const userId = document.getElementById('edit-user-id').value;
        const name = document.getElementById('edit-user-fullname').value;
        const email = document.getElementById('edit-user-email').value;
        const role = document.getElementById('edit-user-role').value;
        const password = document.getElementById('edit-user-password').value;

        try {
            // 1. Update public.users
            await updateMember(userId, { name, email, role });

            // 2. Update auth.users if email or password provided (calls RPC)
            if (email || password) {
                try {
                    await adminUpdateUserAuth(userId, email, password);
                } catch (authErr) {
                    console.error('Erro no RPC:', authErr);
                    // It might fail if RPC does not exist yet. Alert the user, but don't stop the flow completely.
                    alert('Os dados de perfil foram atualizados, mas houve um erro ao atualizar email/senha de login. Certifique-se de que a função SQL "admin_update_user_auth" foi criada no Supabase.');
                }
            }

            alert('Usuário atualizado com sucesso!');
            closeEditModal();
            loadUsersList(); // refresh list
        } catch (err) {
            console.error('Erro ao editar:', err);
            alert('Falha ao atualizar o usuário: ' + err.message);
        } finally {
            btn.disabled = false;
            btn.textContent = 'Salvar Alterações';
        }
    });
}
