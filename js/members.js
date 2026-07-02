document.addEventListener('DOMContentLoaded', async () => {
    console.log('Members page loading...');
    await loadMembersList();
    setupMemberModal();
    setupDeleteModal();
});

let currentMembers = [];
let memberToDeleteId = null;

async function loadMembersList() {
    currentMembers = await fetchMembers();
    populateRoleFilter(currentMembers);
    setupFilters();
    renderMembers(currentMembers);
}

function renderMembers(members) {
    const tableBody = document.querySelector('tbody');
    if (!tableBody) return;
    tableBody.innerHTML = '';

    // Update count
    const countSpan = document.querySelector('.text-2xl + p');
    if (countSpan) countSpan.textContent = `${members.length} membros na sua organização`;

    const showingStart = document.getElementById('showingStart');
    const showingEnd = document.getElementById('showingEnd');
    const showingTotal = document.getElementById('totalResults');

    if (showingStart) showingStart.textContent = members.length > 0 ? 1 : 0;
    if (showingEnd) showingEnd.textContent = members.length;
    if (showingTotal) showingTotal.textContent = members.length;


    if (members.length === 0) {
        tableBody.innerHTML = `
            <tr>
                <td colspan="6" class="px-6 py-4 text-center text-gray-500 dark:text-gray-400 text-sm">
                    Nenhum membro encontrado.
                </td>
            </tr>
        `;
        return;
    }

    members.forEach(member => {
        const row = document.createElement('tr');
        row.className = "hover:bg-gray-50 dark:hover:bg-gray-800/50";
        row.innerHTML = `
            <td class="h-[72px] px-4 py-2 w-12 text-center text-sm font-normal leading-normal">
                <input class="form-checkbox h-5 w-5 rounded border-gray-300 dark:border-gray-600 bg-transparent text-primary checked:bg-primary checked:border-primary focus:ring-2 focus:ring-offset-0 focus:ring-offset-white dark:focus:ring-offset-gray-900 focus:ring-primary/50" type="checkbox"/>
            </td>
            <td class="px-4 py-2 text-sm font-medium text-gray-900 dark:text-gray-50 whitespace-nowrap">
                <div class="flex items-center gap-3">
                    <div class="bg-center bg-no-repeat aspect-square bg-cover rounded-full w-10 h-10" style='background-image: url("${escapeHtml(member.avatar_url || 'https://via.placeholder.com/40')}");'></div>
                    ${escapeHtml(member.name)}
                </div>
            </td>
            <td class="px-4 py-2 text-gray-500 dark:text-gray-400 text-sm font-normal leading-normal whitespace-nowrap">${escapeHtml(member.email || '-')}</td>
            <td class="px-4 py-2 text-gray-500 dark:text-gray-400 text-sm font-normal leading-normal whitespace-nowrap">${escapeHtml(member.role || 'Membro')}</td>
            <td class="px-4 py-2 text-sm font-normal leading-normal">
               ${member.status === 'Active' ?
                '<span class="inline-flex items-center gap-1.5 rounded-full bg-green-100 dark:bg-green-900/50 px-2 py-1 text-sm font-medium text-green-700 dark:text-green-300"><span class="size-2 rounded-full bg-green-500"></span>Ativo</span>' :
                '<span class="inline-flex items-center gap-1.5 rounded-full bg-gray-100 dark:bg-gray-800 px-2 py-1 text-sm font-medium text-gray-700 dark:text-gray-300"><span class="size-2 rounded-full bg-gray-500"></span>Inativo</span>'
            }
            </td>
            <td class="px-4 py-2 text-sm font-bold leading-normal tracking-[0.015em] whitespace-nowrap">
                <div class="flex items-center gap-2">
                    <button class="p-2 text-gray-500 hover:text-red-500 dark:text-gray-400 dark:hover:text-red-500 rounded-md hover:bg-gray-100 dark:hover:bg-gray-800" onclick="openDeleteModal('${member.id}')"><span class="material-symbols-outlined text-xl">delete</span></button>
                </div>
            </td>
        `;
        tableBody.appendChild(row);
    });
}

function setupFilters() {
    const searchInput = document.getElementById('searchInput');
    const roleFilter = document.getElementById('roleFilter');
    const statusFilter = document.getElementById('statusFilter');

    const filterHandler = () => {
        const searchTerm = searchInput.value.toLowerCase();
        const roleValue = roleFilter.value;
        const statusValue = statusFilter.value;

        const filtered = currentMembers.filter(member => {
            const matchesSearch = (member.name && member.name.toLowerCase().includes(searchTerm)) ||
                (member.email && member.email.toLowerCase().includes(searchTerm));
            const matchesRole = roleValue === '' || member.role === roleValue;
            // Handle possibility of status being undefined or null in DB
            const memberStatus = member.status || 'Active'; // Default to active if missing, or adjust based on logic
            const matchesStatus = statusValue === '' || memberStatus === statusValue;

            return matchesSearch && matchesRole && matchesStatus;
        });

        renderMembers(filtered);
    };

    if (searchInput) searchInput.addEventListener('input', filterHandler);
    if (roleFilter) roleFilter.addEventListener('change', filterHandler);
    if (statusFilter) statusFilter.addEventListener('change', filterHandler);
}

function populateRoleFilter(members) {
    const roleFilter = document.getElementById('roleFilter');
    if (!roleFilter) return;

    // Get unique roles
    const roles = [...new Set(members.map(m => m.role).filter(r => r))];

    // Clear existing options except first
    while (roleFilter.options.length > 1) {
        roleFilter.remove(1);
    }

    roles.forEach(role => {
        const option = document.createElement('option');
        option.value = role;
        option.textContent = role;
        roleFilter.appendChild(option);
    });
}

function setupMemberModal() {
    const modalHtml = `
        <div id="member-modal" class="fixed inset-0 z-50 hidden overflow-y-auto" aria-labelledby="modal-title" role="dialog" aria-modal="true">
            <div class="flex items-center justify-center min-h-screen pt-4 px-4 pb-20 text-center sm:block sm:p-0">
                <div class="fixed inset-0 bg-gray-500 bg-opacity-75 transition-opacity" aria-hidden="true" onclick="closeMemberModal()"></div>
                <span class="hidden sm:inline-block sm:align-middle sm:h-screen" aria-hidden="true">&#8203;</span>
                <div class="inline-block align-bottom bg-white dark:bg-gray-800 rounded-lg text-left overflow-hidden shadow-xl transform transition-all sm:my-8 sm:align-middle sm:max-w-lg sm:w-full">
                    <div class="bg-white dark:bg-gray-800 px-4 pt-5 pb-4 sm:p-6 sm:pb-4">
                        <h3 class="text-lg leading-6 font-medium text-gray-900 dark:text-white" id="modal-title">Novo Membro</h3>
                        <div class="mt-4 space-y-4">
                            <div>
                                <label for="m-name" class="block text-sm font-medium text-gray-700 dark:text-gray-300">Nome</label>
                                <input type="text" id="m-name" class="mt-1 block w-full rounded-md border-gray-300 dark:border-gray-600 shadow-sm focus:border-primary focus:ring focus:ring-primary/50 dark:bg-gray-700 dark:text-white sm:text-sm">
                            </div>
                            <div>
                                <label for="m-email" class="block text-sm font-medium text-gray-700 dark:text-gray-300">E-mail</label>
                                <input type="email" id="m-email" class="mt-1 block w-full rounded-md border-gray-300 dark:border-gray-600 shadow-sm focus:border-primary focus:ring focus:ring-primary/50 dark:bg-gray-700 dark:text-white sm:text-sm">
                            </div>
                            <div>
                                <label for="m-role" class="block text-sm font-medium text-gray-700 dark:text-gray-300">Função</label>
                                <input type="text" id="m-role" class="mt-1 block w-full rounded-md border-gray-300 dark:border-gray-600 shadow-sm focus:border-primary focus:ring focus:ring-primary/50 dark:bg-gray-700 dark:text-white sm:text-sm" placeholder="ex: Desenvolvedor">
                            </div>
                        </div>
                    </div>
                    <div class="bg-gray-50 dark:bg-gray-700 px-4 py-3 sm:px-6 sm:flex sm:flex-row-reverse">
                        <button type="button" onclick="saveMember()" class="w-full inline-flex justify-center rounded-md border border-transparent shadow-sm px-4 py-2 bg-primary text-base font-medium text-white hover:bg-primary/90 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary sm:ml-3 sm:w-auto sm:text-sm">
                            Adicionar
                        </button>
                        <button type="button" onclick="closeMemberModal()" class="mt-3 w-full inline-flex justify-center rounded-md border border-gray-300 dark:border-gray-600 shadow-sm px-4 py-2 bg-white dark:bg-gray-800 text-base font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 sm:mt-0 sm:ml-3 sm:w-auto sm:text-sm">
                            Cancelar
                        </button>
                    </div>
                </div>
            </div>
        </div>
        `;
    document.body.insertAdjacentHTML('beforeend', modalHtml);

    const addBtn = document.querySelector('button span.truncate').parentElement;
    if (addBtn) {
        addBtn.onclick = openNewMemberModal;
    }
}

function setupDeleteModal() {
    const modalHtml = `
        <div id="delete-modal" class="fixed inset-0 z-50 hidden overflow-y-auto" aria-labelledby="modal-title" role="dialog" aria-modal="true">
            <div class="flex items-center justify-center min-h-screen pt-4 px-4 pb-20 text-center sm:block sm:p-0">
                <div class="fixed inset-0 bg-gray-500 bg-opacity-75 transition-opacity" aria-hidden="true" onclick="closeDeleteModal()"></div>
                <span class="hidden sm:inline-block sm:align-middle sm:h-screen" aria-hidden="true">&#8203;</span>
                <div class="inline-block align-bottom bg-white dark:bg-gray-800 rounded-lg text-left overflow-hidden shadow-xl transform transition-all sm:my-8 sm:align-middle sm:max-w-lg sm:w-full">
                    <div class="bg-white dark:bg-gray-800 px-4 pt-5 pb-4 sm:p-6 sm:pb-4">
                        <div class="sm:flex sm:items-start">
                            <div class="mx-auto flex-shrink-0 flex items-center justify-center h-12 w-12 rounded-full bg-red-100 sm:mx-0 sm:h-10 sm:w-10">
                                <span class="material-symbols-outlined text-red-600">warning</span>
                            </div>
                            <div class="mt-3 text-center sm:mt-0 sm:ml-4 sm:text-left">
                                <h3 class="text-lg leading-6 font-medium text-gray-900 dark:text-white" id="delete-modal-title">Excluir Membro</h3>
                                <div class="mt-2">
                                    <p class="text-sm text-gray-500 dark:text-gray-400">Tem certeza de que deseja excluir este membro? Esta ação não pode ser desfeita.</p>
                                </div>
                            </div>
                        </div>
                    </div>
                    <div class="bg-gray-50 dark:bg-gray-700 px-4 py-3 sm:px-6 sm:flex sm:flex-row-reverse">
                        <button type="button" onclick="confirmDeleteMember()" class="w-full inline-flex justify-center rounded-md border border-transparent shadow-sm px-4 py-2 bg-red-600 text-base font-medium text-white hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500 sm:ml-3 sm:w-auto sm:text-sm">
                            Excluir
                        </button>
                        <button type="button" onclick="closeDeleteModal()" class="mt-3 w-full inline-flex justify-center rounded-md border border-gray-300 dark:border-gray-600 shadow-sm px-4 py-2 bg-white dark:bg-gray-800 text-base font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 sm:mt-0 sm:ml-3 sm:w-auto sm:text-sm">
                            Cancelar
                        </button>
                    </div>
                </div>
            </div>
        </div>
        `;
    document.body.insertAdjacentHTML('beforeend', modalHtml);
}

window.openNewMemberModal = () => {
    document.getElementById('m-name').value = '';
    document.getElementById('m-email').value = '';
    document.getElementById('m-role').value = '';
    document.getElementById('member-modal').classList.remove('hidden');
}

window.closeMemberModal = () => {
    document.getElementById('member-modal').classList.add('hidden');
}

window.saveMember = async () => {
    const name = document.getElementById('m-name').value;
    const email = document.getElementById('m-email').value;
    const role = document.getElementById('m-role').value;

    if (!name) {
        alert('Nome é obrigatório');
        return;
    }

    const memberData = {
        name,
        email,
        role,
        status: 'Active'
    };

    try {
        await addMember(memberData);
        closeMemberModal();
        await loadMembersList();
    } catch (e) {
        alert('Falha ao adicionar membro: ' + e.message);
    }
}

window.openDeleteModal = (id) => {
    memberToDeleteId = id;
    document.getElementById('delete-modal').classList.remove('hidden');
}

window.closeDeleteModal = () => {
    memberToDeleteId = null;
    document.getElementById('delete-modal').classList.add('hidden');
}

window.confirmDeleteMember = async () => {
    if (memberToDeleteId) {
        await deleteMember(memberToDeleteId);
        closeDeleteModal();
        await loadMembersList();
    }
}
