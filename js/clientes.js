document.addEventListener('DOMContentLoaded', () => {
    // checkSession handles auth redirection automatically via auth.js
    loadClients();

    // Search listener
    document.getElementById('search-client').addEventListener('input', (e) => {
        filterClients(e.target.value);
    });
});

let allClients = [];

async function loadClients() {
    allClients = await fetchClients();
    renderClients(allClients);
}

function renderClients(clients) {
    const tbody = document.getElementById('clients-table-body');
    tbody.innerHTML = '';

    clients.forEach(client => {
        const tr = document.createElement('tr');
        tr.className = 'hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors';
        tr.innerHTML = `
            <td class="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900 dark:text-white">${client.name || '-'}</td>
            <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">${client.cnpj || '-'}</td>
            <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">${client.email || '-'}</td>
            <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">${client.phone || '-'}</td>
            <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">${client.metas || '-'}</td>
            <td class="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                <button onclick="editClient('${client.id}')" class="text-primary hover:text-primary/80 mr-3">Editar</button>
                <button onclick="removeClient('${client.id}')" class="text-red-600 hover:text-red-900">Excluir</button>
            </td>
        `;
        tbody.appendChild(tr);
    });
}

function filterClients(query) {
    const lower = query.toLowerCase();
    const filtered = allClients.filter(c =>
        (c.name && c.name.toLowerCase().includes(lower)) ||
        (c.cnpj && c.cnpj.includes(lower)) ||
        (c.email && c.email.toLowerCase().includes(lower)) ||
        (c.metas && c.metas.toLowerCase().includes(lower))
    );
    renderClients(filtered);
}

// Modal Functions
function openClientModal(id = null) {
    const modal = document.getElementById('client-modal');
    modal.classList.remove('hidden');

    // Clear or Populate
    if (id) {
        // Edit mode (will be handled by editClient finding the object)
    } else {
        document.getElementById('c-id').value = '';
        document.getElementById('c-name').value = '';
        document.getElementById('c-cnpj').value = '';
        document.getElementById('c-email').value = '';
        document.getElementById('c-phone').value = '';
        document.getElementById('c-address').value = '';
        document.getElementById('c-metas').value = '';
        document.getElementById('modal-title').textContent = 'Novo Cliente';
    }
}

function closeClientModal() {
    document.getElementById('client-modal').classList.add('hidden');
}

function editClient(id) {
    const client = allClients.find(c => c.id === id);
    if (!client) return;

    document.getElementById('c-id').value = client.id;
    document.getElementById('c-name').value = client.name || '';
    document.getElementById('c-cnpj').value = client.cnpj || '';
    document.getElementById('c-email').value = client.email || '';
    document.getElementById('c-phone').value = client.phone || '';
    document.getElementById('c-address').value = client.address || '';
    document.getElementById('c-metas').value = client.metas || '';
    document.getElementById('modal-title').textContent = 'Editar Cliente';

    openClientModal('edit');
}

async function removeClient(id) {
    if (!confirm('Tem certeza que deseja excluir este cliente?')) return;

    try {
        await deleteClient(id);
        await loadClients();
    } catch (error) {
        alert('Erro ao excluir cliente: ' + error.message);
    }
}

async function saveClient() {
    const id = document.getElementById('c-id').value;
    const clientData = {
        name: document.getElementById('c-name').value,
        cnpj: document.getElementById('c-cnpj').value,
        email: document.getElementById('c-email').value,
        phone: document.getElementById('c-phone').value,
        address: document.getElementById('c-address').value,
        metas: document.getElementById('c-metas').value.replace(/,/g, '.')
    };

    if (!clientData.name) {
        alert('Nome é obrigatório');
        return;
    }

    try {
        if (id) {
            await updateClient(id, clientData);
        } else {
            await createClient(clientData);
        }
        closeClientModal();
        loadClients();
    } catch (error) {
        alert('Erro ao salvar cliente: ' + error.message);
    }
}
