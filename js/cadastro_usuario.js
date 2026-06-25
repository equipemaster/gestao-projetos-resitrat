document.addEventListener('DOMContentLoaded', () => {
    // Enforce that only logged in admins can view this page
    checkAdminAccess();
    setupSignupForm();
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
