// Authentication Logic

async function signUp(email, password) {
    try {
        const { data, error } = await _supabase.auth.signUp({
            email: email,
            password: password,
        });
        if (error) throw error;
        alert('Cadastro realizado com sucesso! Verifique seu e-mail para confirmação.');
        return data;
    } catch (error) {
        console.error('Error signing up:', error.message);
        alert('Erro ao cadastrar: ' + error.message);
    }
}

async function signIn(email, password) {
    try {
        const { data, error } = await _supabase.auth.signInWithPassword({
            email: email,
            password: password,
        });
        if (error) throw error;

        // Fetch profile to verify role dynamically
        const { data: profile } = await _supabase
            .from('users')
            .select('role')
            .eq('email', email)
            .maybeSingle();

        let isAdmin = false;
        const emailUpper = email.toUpperCase();
        if (emailUpper.startsWith('ADM') || emailUpper.includes('ADMIN')) {
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

        if (isAdmin) {
            window.location.href = 'gerenciamentodeprojetos.html';
        } else {
            window.location.href = 'requisicao_estoque.html';
        }
        return data;
    } catch (error) {
        console.error('Error signing in:', error.message);
        alert('Credenciais inválidas: ' + error.message);
    }
}

async function signOut() {
    try {
        const { error } = await _supabase.auth.signOut();
        if (error) throw error;
        window.location.href = 'login.html';
    } catch (error) {
        console.error('Error signing out:', error.message);
    }
}

async function checkSession() {
    try {
        const urlParams = new URLSearchParams(window.location.search);
        
        if (urlParams.has('dev')) {
            console.log('Session check bypassed via dev mode.');
            const devVal = urlParams.get('dev');
            const navCad = document.getElementById('nav-cad-user');
            if (navCad) {
                if (devVal === 'admin' || devVal === 'adm') {
                    navCad.classList.remove('hidden');
                    navCad.classList.add('flex');
                } else {
                    navCad.classList.add('hidden');
                    navCad.classList.remove('flex');
                }
            }
            return;
        }

        const { data: { session }, error } = await _supabase.auth.getSession();
        if (error) throw error;

        const isLoginPage = window.location.pathname.endsWith('login.html');

        if (!session && !isLoginPage) {
            // Not logged in and trying to access a protected page
            window.location.href = 'login.html';
        } else if (session) {
            // Fetch profile to verify role dynamically
            const { data: profile } = await _supabase
                .from('users')
                .select('role')
                .eq('email', session.user.email)
                .maybeSingle();

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

            if (isLoginPage) {
                // Logged in and trying to access login page
                if (isAdmin) {
                    window.location.href = 'gerenciamentodeprojetos.html';
                } else {
                    window.location.href = 'requisicao_estoque.html';
                }
                return;
            }

            const isRequisicaoPage = window.location.pathname.endsWith('requisicao_estoque.html');

            if (!isAdmin) {
                // Block direct operator access to any page except requisicao_estoque.html
                if (!isRequisicaoPage) {
                    window.location.href = 'requisicao_estoque.html';
                    return;
                }

                // Dynamically hide non-allowed menu links in sidebar for operators
                const menuLinks = document.querySelectorAll('aside nav a, aside div a');
                menuLinks.forEach(link => {
                    const href = link.getAttribute('href') || '';
                    const onclickStr = link.getAttribute('onclick') || '';
                    const isAllowed = href.includes('requisicao_estoque.html') || 
                                      href.includes('logout') || 
                                      onclickStr.includes('signOut');
                    if (!isAllowed) {
                        link.classList.add('hidden');
                        link.classList.remove('flex');
                    }
                });
            } else {
                // Admin specific sidebar adjustments
                const navCad = document.getElementById('nav-cad-user');
                if (navCad) {
                    navCad.classList.remove('hidden');
                    navCad.classList.add('flex');
                }
            }
        }
    } catch (error) {
        console.error('Error checking session:', error.message);
    }
}

// Check session on load
document.addEventListener('DOMContentLoaded', () => {
    // Keep dev query parameters on local links for easy testing
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.has('dev')) {
        const devVal = urlParams.get('dev');
        const localLinks = document.querySelectorAll('a[href$=".html"], a[href*="cadastro_usuario"]');
        localLinks.forEach(link => {
            const hrefAttr = link.getAttribute('href');
            if (hrefAttr && !hrefAttr.startsWith('#')) {
                const url = new URL(link.href, window.location.origin);
                url.searchParams.set('dev', devVal);
                link.href = url.pathname + url.search;
            }
        });
    }

    // We need to wait for supabase client to be initialized
    if (typeof _supabase !== 'undefined') {
        checkSession();
    } else {
        // Retry/wait if script load order is an issue, but defer should handle it
        setTimeout(checkSession, 100);
    }

    // Bind logout button if exists
    // Translation safe heuristic: href contains 'logout' or text contains 'Log out'/'Sair'
    // Bind logout button if exists
    // Translation safe heuristic: href contains 'logout' or text contains 'Log out'/'Sair'
    const logoutBtns = document.querySelectorAll('a[href*="logout"]');
    if (logoutBtns.length > 0) {
        logoutBtns.forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.preventDefault();
                signOut();
            });
        });
    }
});
