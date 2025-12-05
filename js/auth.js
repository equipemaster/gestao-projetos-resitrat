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
        window.location.href = 'gerenciamentodeprojetos.html';
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
        const { data: { session }, error } = await _supabase.auth.getSession();
        if (error) throw error;

        const isLoginPage = window.location.pathname.endsWith('login.html');

        if (!session && !isLoginPage) {
            // Not logged in and trying to access a protected page
            window.location.href = 'login.html';
        } else if (session && isLoginPage) {
            // Logged in and trying to access login page
            window.location.href = 'gerenciamentodeprojetos.html';
        }
    } catch (error) {
        console.error('Error checking session:', error.message);
    }
}

// Check session on load
document.addEventListener('DOMContentLoaded', () => {
    // We need to wait for supabase client to be initialized
    if (typeof _supabase !== 'undefined') {
        checkSession();
    } else {
        // Retry/wait if script load order is an issue, but defer should handle it
        setTimeout(checkSession, 100);
    }

    // Bind logout button if exists
    // Translation safe heuristic: href contains 'logout' or text contains 'Log out'/'Sair'
    const logoutBtn = document.querySelector('a[href*="logout"]');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', (e) => {
            e.preventDefault();
            signOut();
        });
    }
});
