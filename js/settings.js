
document.addEventListener('DOMContentLoaded', async () => {
    await loadUserProfile();
});

async function loadUserProfile() {
    try {
        const { data: { user } } = await _supabase.auth.getUser();

        if (user) {
            // Populate Email (Read-only)
            const emailInput = document.getElementById('userEmail');
            if (emailInput) {
                emailInput.value = user.email;
            }

            // Populate Name (if exists in metadata)
            const nameInput = document.getElementById('userName');
            if (nameInput && user.user_metadata && user.user_metadata.full_name) {
                nameInput.value = user.user_metadata.full_name;
            }
        }
    } catch (error) {
        console.error('Error loading user profile:', error);
    }
}

// Handle Form Submit (Update Name)
async function saveProfile() {
    const nameInput = document.getElementById('userName');
    const newName = nameInput ? nameInput.value : '';

    if (!newName) {
        alert('Por favor, insira um nome.');
        return;
    }

    try {
        const { error } = await _supabase.auth.updateUser({
            data: { full_name: newName }
        });

        if (error) throw error;

        alert('Perfil atualizado com sucesso!');
    } catch (error) {
        console.error('Error updating profile:', error);
        alert('Erro ao atualizar perfil.');
    }
}
