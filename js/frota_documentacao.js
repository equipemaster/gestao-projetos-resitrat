// ─── Controle de Documentação da Frota ─────────────────────────────────────

function showToast(message, type = 'success', duration = 4000) {
    const container = document.getElementById('toast-container');
    if (!container) { alert(message); return; }
    const icons = { success: 'check_circle', error: 'error', warning: 'warning', info: 'info' };
    const colors = { success: 'bg-emerald-600', error: 'bg-red-600', warning: 'bg-amber-500', info: 'bg-blue-600' };
    const toast = document.createElement('div');
    toast.className = `toast pointer-events-auto flex items-center gap-3 px-4 py-3 rounded-xl shadow-xl text-white text-xs font-medium max-w-sm ${colors[type]}`;
    toast.innerHTML = `<span class="material-symbols-outlined flex-shrink-0" style="font-size:18px">${icons[type]}</span><span>${escapeHtml(message)}</span>`;
    container.appendChild(toast);
    const remove = () => {
        toast.classList.add('hiding');
        toast.addEventListener('animationend', () => toast.remove(), { once: true });
    };
    const timer = setTimeout(remove, duration);
    toast.addEventListener('click', () => { clearTimeout(timer); remove(); });
}

// ─── Anexos em PDF (Supabase Storage) ───────────────────────────────────────
// Mesmo padrão do bucket `project-3d-pdfs` em js/project_modal_shared.js:
// bucket privado, acesso só por signed URL, path = "<uuid>.pdf".
const FROTA_PDF_BUCKET = 'frota-documentos-pdfs';

async function uploadFrotaPdf(file) {
    const path = `${crypto.randomUUID()}.pdf`;
    const { error } = await _supabase.storage.from(FROTA_PDF_BUCKET).upload(path, file, { contentType: 'application/pdf' });
    if (error) {
        if (/bucket not found/i.test(error.message || '')) {
            throw new Error(`Bucket de storage "${FROTA_PDF_BUCKET}" não existe no Supabase. Rode o script sql/frota_documentacao.sql inteiro no SQL Editor para criá-lo.`);
        }
        throw error;
    }
    return path;
}

async function getFrotaPdfSignedUrl(path) {
    try {
        const { data, error } = await _supabase.storage.from(FROTA_PDF_BUCKET).createSignedUrl(path, 3600);
        if (error) throw error;
        return data.signedUrl;
    } catch (error) {
        console.error('Error creating signed URL for frota PDF:', error);
        return null;
    }
}

async function deleteFrotaPdf(path) {
    if (!path) return;
    try {
        await _supabase.storage.from(FROTA_PDF_BUCKET).remove([path]);
    } catch (error) {
        console.error('Error deleting frota PDF:', error);
    }
}

// ─── Referência de manutenção preventiva por marca ─────────────────────────
// Intervalos de referência de mercado (troca de óleo/filtros e revisão geral).
// Servem como recomendação padrão quando não há um plano de manutenção do
// fabricante cadastrado — sempre confira o manual do veículo.
const MAINTENANCE_PROFILES = {
    LEVE:   { categoria: 'Leve (utilitário/passeio)', oleo_km: 10000, oleo_meses: 6,  revisao_km: 10000,
              itens: ['Troca de óleo e filtro de óleo', 'Filtro de ar', 'Filtro de combustível', 'Filtro de cabine',
                       'Pastilhas/discos de freio', 'Rodízio de pneus', 'Correia dentada/acessórios', 'Fluido de arrefecimento'] },
    PESADO: { categoria: 'Pesado (caminhão/utilitário grande)', oleo_km: 15000, oleo_meses: 12, revisao_km: 15000,
              itens: ['Troca de óleo e filtro de óleo', 'Filtro de ar', 'Filtro de combustível', 'Filtro separador de água',
                       'Lonas/pastilhas de freio', 'Rodízio de pneus', 'Correia do motor', 'Sistema de arrefecimento', 'Embreagem'] },
};

const MAINTENANCE_BY_BRAND = {
    'VOLKSWAGEN': 'LEVE', 'VW': 'LEVE', 'FIAT': 'LEVE', 'CHEVROLET': 'LEVE', 'GM': 'LEVE',
    'FORD': 'LEVE', 'HYUNDAI': 'LEVE', 'TOYOTA': 'LEVE', 'RENAULT': 'LEVE', 'NISSAN': 'LEVE',
    'PEUGEOT': 'LEVE', 'CITROEN': 'LEVE', 'CITROËN': 'LEVE', 'HONDA': 'LEVE', 'MITSUBISHI': 'LEVE',
    'JAC': 'LEVE', 'JEEP': 'LEVE', 'RAM': 'LEVE', 'KIA': 'LEVE', 'BYD': 'LEVE', 'CAOA': 'LEVE',
    'MERCEDES-BENZ': 'PESADO', 'MERCEDES BENZ': 'PESADO', 'MB': 'PESADO', 'VOLVO': 'PESADO',
    'SCANIA': 'PESADO', 'IVECO': 'PESADO', 'DAF': 'PESADO', 'MAN': 'PESADO', 'AGRALE': 'PESADO',
};

function normalizeBrand(marca) {
    return (marca || '').toUpperCase().trim();
}

function getMaintenanceProfile(marca) {
    const key = MAINTENANCE_BY_BRAND[normalizeBrand(marca)] || 'LEVE';
    return MAINTENANCE_PROFILES[key];
}

// ─── Estado global ──────────────────────────────────────────────────────────
let state = {
    veiculos: [],
    documentos: [],
    manutencoes: [],
    calendario: [],
    pagamentos: [],
    parametros: { ano_vigente: '2026', dias_alerta: '30', taxa_licenciamento: '274.61', taxa_licenciamento_atraso: '347.12' },
};
let donutChart = null;
let barChart = null;

// Estado dos anexos em edição nos modais (arquivo novo x arquivo já salvo)
let existingDocPdfPath = null;
let removeDocPdfRequested = false;
let existingPagPdfPath = null;
let removePagPdfRequested = false;
let existingVeiculoPdfPath = null;
let removeVeiculoPdfRequested = false;

// ─── Utilitários de data ────────────────────────────────────────────────────
function todayISO() {
    return new Date().toISOString().split('T')[0];
}

function diffDaysFromToday(dateISO) {
    if (!dateISO) return null;
    const today = new Date(todayISO() + 'T00:00:00');
    const target = new Date(dateISO + 'T00:00:00');
    return Math.round((target - today) / 86400000);
}

function finalPlaca(placa) {
    const digits = (placa || '').replace(/[^0-9]/g, '');
    return digits ? digits.slice(-1) : null;
}

function formatMoney(value) {
    const n = Number(value);
    if (isNaN(n)) return 'R$ 0,00';
    return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

// ─── Resolução de vencimento e status de documentos ────────────────────────
function resolveVencimentoDoc(veiculo, doc, tipo, ano) {
    if (doc && doc.vencimento_manual) return doc.vencimento_manual;
    if (tipo === 'SEGURO') return doc && doc.vigencia_fim ? doc.vigencia_fim : null;
    // IPVA / LICENCIAMENTO: calendário por final de placa (só vale para UF = GO)
    if ((veiculo.uf || 'GO').toUpperCase() !== 'GO') return null;
    const fp = finalPlaca(veiculo.placa);
    if (!fp) return null;
    const row = state.calendario.find(c => c.ano === ano && c.tipo === tipo && c.final_placa === fp);
    return row ? row.vencimento : null;
}

function getDocStatus(veiculo, doc, tipo, ano) {
    const vencimento = resolveVencimentoDoc(veiculo, doc, tipo, ano);
    const diasAlerta = Number(state.parametros.dias_alerta) || 30;

    const dadosCompletos = tipo === 'SEGURO'
        ? !!(doc && doc.seguradora && doc.apolice && doc.vigencia_fim)
        : !!(vencimento && doc && doc.valor !== null && doc.valor !== undefined && doc.valor !== '');

    if (!dadosCompletos) return { status: 'PREENCHER', vencimento };

    const pago = !!(doc && doc.pago);
    if (pago) return { status: 'PAGO', vencimento };

    const diff = diffDaysFromToday(vencimento);
    if (diff === null) return { status: 'PREENCHER', vencimento };
    if (diff < 0) return { status: 'VENCIDO', vencimento };
    if (diff <= diasAlerta) return { status: 'AVENCER', vencimento };
    return { status: 'EMDIA', vencimento };
}

const STATUS_LABEL = { VENCIDO: 'Vencido', AVENCER: 'A Vencer', EMDIA: 'Em Dia', PAGO: 'Pago/Vigente', PREENCHER: 'Preencher/Conferir' };
const STATUS_BADGE_CLASS = {
    VENCIDO: 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300',
    AVENCER: 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300',
    EMDIA: 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300',
    PAGO: 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300',
    PREENCHER: 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300',
};
const STATUS_DOT_CLASS = {
    VENCIDO: 'bg-red-500', AVENCER: 'bg-amber-400', EMDIA: 'bg-blue-500', PAGO: 'bg-emerald-500', PREENCHER: 'bg-gray-400',
};

function statusBadge(status) {
    return `<span class="inline-flex items-center gap-1 rounded-full ${STATUS_BADGE_CLASS[status]} px-2 py-0.5 text-xs font-semibold">
        <span class="size-1.5 rounded-full ${STATUS_DOT_CLASS[status]}"></span>${STATUS_LABEL[status]}</span>`;
}

// ─── Resolução de status de manutenção ──────────────────────────────────────
function getManutencaoInfo(veiculo) {
    const profile = getMaintenanceProfile(veiculo.marca);
    const historico = state.manutencoes
        .filter(m => m.veiculo_id === veiculo.id)
        .sort((a, b) => (b.data_realizada || '').localeCompare(a.data_realizada || ''));
    const ultima = historico[0] || null;

    if (!ultima) {
        return { profile, ultima: null, proximaData: null, proximoKm: null, status: 'PREENCHER' };
    }

    const proximaData = ultima.proxima_data || addMonths(ultima.data_realizada, profile.oleo_meses);
    const proximoKm = ultima.proximo_km || (ultima.km_realizada ? Number(ultima.km_realizada) + profile.oleo_km : null);
    const diasAlerta = Number(state.parametros.dias_alerta) || 30;

    let status = 'EMDIA';
    const diff = diffDaysFromToday(proximaData);
    if (diff !== null && diff < 0) status = 'VENCIDO';
    else if (diff !== null && diff <= diasAlerta) status = 'AVENCER';

    if (proximoKm && veiculo.km_atual) {
        const kmRestante = Number(proximoKm) - Number(veiculo.km_atual);
        if (kmRestante < 0) status = 'VENCIDO';
        else if (kmRestante <= 1000 && status === 'EMDIA') status = 'AVENCER';
    }

    return { profile, ultima, proximaData, proximoKm, status };
}

function addMonths(dateISO, months) {
    if (!dateISO) return null;
    const [y, m, d] = dateISO.split('-').map(Number);
    const date = new Date(y, m - 1 + Number(months), d);
    return date.toISOString().split('T')[0];
}

// ─── Carregamento inicial ───────────────────────────────────────────────────
async function initFrota() {
    try {
        const [veiculos, documentos, manutencoes, calendario, pagamentos, parametros] = await Promise.all([
            fetchFrotaVeiculos(), fetchFrotaDocumentos(), fetchFrotaManutencoes(), fetchFrotaCalendario(), fetchFrotaPagamentos(), fetchFrotaParametros(),
        ]);
        state.veiculos = veiculos;
        state.documentos = documentos;
        state.manutencoes = manutencoes;
        state.calendario = calendario;
        state.pagamentos = pagamentos;
        if (parametros && Object.keys(parametros).length) state.parametros = { ...state.parametros, ...parametros };

        populateBrandDatalist();
        populateMaintenanceTypeDatalist();
        populateAnoFilters();
        populateVeiculoSelects();
        renderAll();
    } catch (error) {
        console.error('Erro ao carregar dados da frota:', error);
        showToast('Erro ao carregar dados da frota. As tabelas do banco foram criadas? Veja sql/frota_documentacao.sql', 'error', 7000);
    }
}

function populateBrandDatalist() {
    const datalist = document.getElementById('marcas-list');
    if (!datalist) return;
    datalist.innerHTML = Object.keys(MAINTENANCE_BY_BRAND).map(b => `<option value="${escapeHtml(b)}"></option>`).join('');
}

function populateMaintenanceTypeDatalist() {
    const datalist = document.getElementById('manut-tipo-list');
    if (!datalist) return;
    const all = new Set([...MAINTENANCE_PROFILES.LEVE.itens, ...MAINTENANCE_PROFILES.PESADO.itens]);
    datalist.innerHTML = [...all].map(t => `<option value="${escapeHtml(t)}"></option>`).join('');
}

function populateAnoFilters() {
    const anoAtual = Number(state.parametros.ano_vigente) || new Date().getFullYear();
    const anos = [anoAtual - 1, anoAtual, anoAtual + 1];

    const docFilter = document.getElementById('doc-filter-ano');
    if (docFilter) {
        docFilter.innerHTML = anos.map(a => `<option value="${a}" ${a === anoAtual ? 'selected' : ''}>${a}</option>`).join('');
    }
    const calSelect = document.getElementById('calendario-ano-select');
    if (calSelect) {
        calSelect.innerHTML = anos.map(a => `<option value="${a}" ${a === anoAtual ? 'selected' : ''}>${a}</option>`).join('');
        calSelect.addEventListener('change', renderCalendarioTable);
    }
    document.getElementById('doc-filter-ano')?.addEventListener('change', renderDocumentosTable);
    document.getElementById('doc-filter-tipo')?.addEventListener('change', renderDocumentosTable);
    document.getElementById('doc-filter-status')?.addEventListener('change', renderDocumentosTable);
    document.getElementById('doc-filter-busca')?.addEventListener('input', renderDocumentosTable);
    document.getElementById('manut-filter-busca')?.addEventListener('input', renderManutencoesTable);
    document.getElementById('veiculo-filter-busca')?.addEventListener('input', renderVeiculosTable);
    document.getElementById('pag-filter-veiculo')?.addEventListener('change', renderPagamentosTable);
    document.getElementById('pag-filter-tipo')?.addEventListener('change', renderPagamentosTable);
    document.getElementById('pag-filter-busca')?.addEventListener('input', renderPagamentosTable);
}

function populateVeiculoSelects() {
    const options = state.veiculos
        .slice()
        .sort((a, b) => a.placa.localeCompare(b.placa))
        .map(v => `<option value="${v.id}">${escapeHtml(v.placa)} — ${escapeHtml(v.marca)} ${escapeHtml(v.modelo)}</option>`)
        .join('');

    const pagFilter = document.getElementById('pag-filter-veiculo');
    if (pagFilter) pagFilter.innerHTML = '<option value="">Todos os Veículos</option>' + options;

    const pagSelect = document.getElementById('pag-veiculo-id');
    if (pagSelect) pagSelect.innerHTML = options;
}

// ─── Renderização geral ─────────────────────────────────────────────────────
function renderAll() {
    renderKPIs();
    renderCharts();
    renderPainel();
    renderDocumentosTable();
    renderManutencoesTable();
    renderVeiculosTable();
    renderPagamentosTable();
    renderParametrosForm();
    renderCalendarioTable();
}

function buildDocEntries() {
    const anoAtual = Number(state.parametros.ano_vigente) || new Date().getFullYear();
    const entries = [];
    state.veiculos.forEach(v => {
        ['IPVA', 'LICENCIAMENTO', 'SEGURO'].forEach(tipo => {
            const doc = state.documentos.find(d => d.veiculo_id === v.id && d.tipo === tipo && d.ano === anoAtual);
            const { status, vencimento } = getDocStatus(v, doc, tipo, anoAtual);
            entries.push({ veiculo: v, doc, tipo, ano: anoAtual, status, vencimento });
        });
    });
    return entries;
}

// Encolhe a fonte de um valor de KPI até caber numa linha só dentro do card,
// em vez de deixar o texto vazar (scrollWidth > clientWidth) ou cortar dígitos.
function fitKpiValue(el, maxPx = 24, minPx = 11) {
    el.style.fontSize = maxPx + 'px';
    let fs = maxPx;
    while (el.scrollWidth > el.clientWidth && fs > minPx) {
        fs -= 1;
        el.style.fontSize = fs + 'px';
    }
}

function renderKPIs() {
    const entries = buildDocEntries();
    const vencidos = entries.filter(e => e.status === 'VENCIDO').length;
    const avencer = entries.filter(e => e.status === 'AVENCER').length;
    const emdia = entries.filter(e => e.status === 'EMDIA' || e.status === 'PAGO').length;
    const valorPendente = entries
        .filter(e => (e.status === 'VENCIDO' || e.status === 'AVENCER') && e.doc && e.doc.valor)
        .reduce((sum, e) => sum + Number(e.doc.valor), 0);

    const manutInfos = state.veiculos.map(v => getManutencaoInfo(v));
    const manutPendentes = manutInfos.filter(m => m.status === 'VENCIDO' || m.status === 'AVENCER').length;

    document.getElementById('kpi-vencidos').textContent = vencidos;
    document.getElementById('kpi-avencer').textContent = avencer;
    document.getElementById('kpi-emdia').textContent = emdia;
    document.getElementById('kpi-valor-pendente').textContent = formatMoney(valorPendente);
    document.getElementById('kpi-manut-pendentes').textContent = manutPendentes;

    ['kpi-vencidos', 'kpi-avencer', 'kpi-emdia', 'kpi-valor-pendente', 'kpi-manut-pendentes']
        .forEach(id => fitKpiValue(document.getElementById(id)));
}

function renderCharts() {
    const entries = buildDocEntries();
    const counts = { VENCIDO: 0, AVENCER: 0, EMDIA: 0, PAGO: 0, PREENCHER: 0 };
    entries.forEach(e => counts[e.status]++);

    const donutCtx = document.getElementById('chart-status-donut');
    if (donutCtx) {
        if (donutChart) donutChart.destroy();
        donutChart = new Chart(donutCtx, {
            type: 'doughnut',
            data: {
                labels: ['Vencido', 'A Vencer', 'Em Dia', 'Pago/Vigente', 'Preencher'],
                datasets: [{
                    data: [counts.VENCIDO, counts.AVENCER, counts.EMDIA, counts.PAGO, counts.PREENCHER],
                    backgroundColor: ['#dc2626', '#d97706', '#2563eb', '#16a34a', '#9ca3af'],
                    borderWidth: 2, borderColor: '#ffffff', hoverBorderWidth: 3,
                }],
            },
            options: {
                responsive: true, maintainAspectRatio: false, cutout: '68%',
                plugins: { legend: { position: 'bottom', labels: { usePointStyle: true, pointStyleWidth: 8, font: { size: 10 } } } },
            },
        });
    }

    const barCtx = document.getElementById('chart-valor-bar');
    if (barCtx) {
        const pendentes = entries
            .filter(e => (e.status === 'VENCIDO' || e.status === 'AVENCER') && e.doc && e.doc.valor)
            .reduce((acc, e) => {
                const key = e.veiculo.placa;
                acc[key] = (acc[key] || 0) + Number(e.doc.valor);
                return acc;
            }, {});
        const sorted = Object.entries(pendentes).sort((a, b) => b[1] - a[1]).slice(0, 8);
        if (barChart) barChart.destroy();
        barChart = new Chart(barCtx, {
            type: 'bar',
            data: {
                labels: sorted.map(s => s[0]),
                datasets: [{ label: 'Valor Pendente', data: sorted.map(s => s[1]), backgroundColor: 'rgba(37,99,235,0.85)', borderRadius: 6 }],
            },
            options: {
                responsive: true, maintainAspectRatio: false,
                plugins: { legend: { display: false }, tooltip: { callbacks: { label: ctx => formatMoney(ctx.raw) } } },
                scales: { y: { ticks: { callback: v => formatMoney(v) } } },
            },
        });
    }
}

function renderPainel() {
    const entries = buildDocEntries();
    const vencidos = entries.filter(e => e.status === 'VENCIDO').sort((a, b) => (a.vencimento || '').localeCompare(b.vencimento || ''));
    const avencer = entries.filter(e => e.status === 'AVENCER').sort((a, b) => (a.vencimento || '').localeCompare(b.vencimento || ''));

    const renderList = (list, containerId, emptyMsg) => {
        const container = document.getElementById(containerId);
        if (!container) return;
        if (!list.length) {
            container.innerHTML = `<div class="px-5 py-8 text-center text-xs text-gray-400">${emptyMsg}</div>`;
            return;
        }
        container.innerHTML = list.map(e => `
            <div class="px-5 py-3 flex items-center justify-between gap-3">
                <div class="min-w-0">
                    <p class="text-xs font-bold text-gray-800 dark:text-gray-200">${escapeHtml(e.veiculo.placa)} · ${escapeHtml(e.tipo)}</p>
                    <p class="text-xs text-gray-400 truncate">${escapeHtml(e.veiculo.marca)} ${escapeHtml(e.veiculo.modelo)} — ${escapeHtml(e.veiculo.motorista || 'sem motorista')}</p>
                </div>
                <div class="text-right flex-shrink-0">
                    <p class="text-xs font-semibold text-gray-700 dark:text-gray-300">${formatDate(e.vencimento)}</p>
                    <p class="text-xs text-gray-400">${e.doc && e.doc.valor ? formatMoney(e.doc.valor) : '—'}</p>
                </div>
            </div>`).join('');
    };
    renderList(vencidos, 'painel-vencidos-list', 'Nenhum documento vencido. Bom trabalho!');
    renderList(avencer, 'painel-avencer-list', 'Nenhum vencimento nos próximos dias.');
}

function renderDocumentosTable() {
    const anoFilter = Number(document.getElementById('doc-filter-ano')?.value) || Number(state.parametros.ano_vigente);
    const tipoFilter = document.getElementById('doc-filter-tipo')?.value || '';
    const statusFilter = document.getElementById('doc-filter-status')?.value || '';
    const busca = (document.getElementById('doc-filter-busca')?.value || '').toUpperCase();

    let entries = [];
    state.veiculos.forEach(v => {
        ['IPVA', 'LICENCIAMENTO', 'SEGURO'].forEach(tipo => {
            const doc = state.documentos.find(d => d.veiculo_id === v.id && d.tipo === tipo && d.ano === anoFilter);
            const { status, vencimento } = getDocStatus(v, doc, tipo, anoFilter);
            entries.push({ veiculo: v, doc, tipo, ano: anoFilter, status, vencimento });
        });
    });

    entries = entries.filter(e => {
        if (tipoFilter && e.tipo !== tipoFilter) return false;
        if (statusFilter && e.status !== statusFilter) return false;
        if (busca && !(`${e.veiculo.placa} ${e.veiculo.motorista || ''}`).toUpperCase().includes(busca)) return false;
        return true;
    });

    entries.sort((a, b) => (a.vencimento || '9999').localeCompare(b.vencimento || '9999'));

    const tbody = document.getElementById('documentos-table-body');
    if (!tbody) return;
    if (!entries.length) {
        tbody.innerHTML = `<tr><td colspan="7" class="px-6 py-10 text-center text-sm text-gray-400">Nenhum registro encontrado.</td></tr>`;
        return;
    }
    tbody.innerHTML = entries.map(e => `
        <tr class="hover:bg-gray-50 dark:hover:bg-gray-800/30">
            <td class="px-5 py-3">
                <p class="text-xs font-bold text-gray-800 dark:text-gray-200">${escapeHtml(e.veiculo.placa)}</p>
                <p class="text-xs text-gray-400">${escapeHtml(e.veiculo.marca)} ${escapeHtml(e.veiculo.modelo)}</p>
            </td>
            <td class="px-5 py-3 text-xs text-gray-600 dark:text-gray-300">${escapeHtml(e.veiculo.motorista || '—')}</td>
            <td class="px-5 py-3 text-xs font-semibold text-gray-700 dark:text-gray-300">${escapeHtml(e.tipo)}</td>
            <td class="px-5 py-3 text-xs text-gray-600 dark:text-gray-300">${formatDate(e.vencimento)}</td>
            <td class="px-5 py-3 text-xs text-gray-600 dark:text-gray-300">${e.doc && e.doc.valor ? formatMoney(e.doc.valor) : '—'}</td>
            <td class="px-5 py-3">${statusBadge(e.status)}</td>
            <td class="px-5 py-3 text-right whitespace-nowrap">
                ${e.doc && e.doc.pdf_path
                    ? `<button onclick="viewFrotaPdf('${e.doc.pdf_path}')" title="Ver PDF anexado"
                        class="inline-flex items-center justify-center w-8 h-8 rounded-lg text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors">
                        <span class="material-symbols-outlined" style="font-size:16px">picture_as_pdf</span>
                       </button>`
                    : ''}
                <button onclick="openDocumentoModal(${e.veiculo.id}, '${e.tipo}', ${e.ano})"
                    class="inline-flex items-center gap-1 rounded-lg border border-gray-200 dark:border-gray-700 px-2.5 py-1.5 text-xs font-semibold text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
                    <span class="material-symbols-outlined" style="font-size:14px">edit</span> Preencher
                </button>
            </td>
        </tr>`).join('');
}

async function viewFrotaPdf(path) {
    const url = await getFrotaPdfSignedUrl(path);
    if (url) window.open(url, '_blank', 'noopener');
    else showToast('Não foi possível abrir o PDF.', 'error');
}

function renderPagamentosTable() {
    const veiculoFilter = document.getElementById('pag-filter-veiculo')?.value || '';
    const tipoFilter = document.getElementById('pag-filter-tipo')?.value || '';
    const busca = (document.getElementById('pag-filter-busca')?.value || '').toUpperCase();

    let pagamentos = state.pagamentos.filter(p => {
        if (veiculoFilter && String(p.veiculo_id) !== veiculoFilter) return false;
        if (tipoFilter && p.tipo !== tipoFilter) return false;
        const veiculo = state.veiculos.find(v => v.id === p.veiculo_id);
        if (busca && !(`${veiculo?.placa || ''} ${p.descricao || ''}`).toUpperCase().includes(busca)) return false;
        return true;
    });

    const tbody = document.getElementById('pagamentos-table-body');
    if (!tbody) return;
    if (!pagamentos.length) {
        tbody.innerHTML = `<tr><td colspan="7" class="px-6 py-10 text-center text-sm text-gray-400">Nenhum pagamento registrado. Clique em "Novo Registro" para começar.</td></tr>`;
        return;
    }
    tbody.innerHTML = pagamentos.map(p => {
        const veiculo = state.veiculos.find(v => v.id === p.veiculo_id);
        return `
        <tr class="hover:bg-gray-50 dark:hover:bg-gray-800/30">
            <td class="px-5 py-3 text-xs text-gray-600 dark:text-gray-300">${formatDate(p.data_pagamento)}</td>
            <td class="px-5 py-3">
                <p class="text-xs font-bold text-gray-800 dark:text-gray-200">${escapeHtml(veiculo?.placa || '—')}</p>
                <p class="text-xs text-gray-400">${escapeHtml(veiculo?.marca || '')} ${escapeHtml(veiculo?.modelo || '')}</p>
            </td>
            <td class="px-5 py-3 text-xs font-semibold text-gray-700 dark:text-gray-300">${escapeHtml(p.tipo)}</td>
            <td class="px-5 py-3 text-xs text-gray-600 dark:text-gray-300">${escapeHtml(p.descricao || '—')}</td>
            <td class="px-5 py-3 text-xs text-gray-600 dark:text-gray-300">${p.valor ? formatMoney(p.valor) : '—'}</td>
            <td class="px-5 py-3">
                ${p.pdf_path
                    ? `<button onclick="viewFrotaPdf('${p.pdf_path}')" title="Ver comprovante"
                        class="inline-flex items-center gap-1 text-xs font-semibold text-red-600 hover:underline">
                        <span class="material-symbols-outlined" style="font-size:16px">picture_as_pdf</span> Ver PDF
                       </button>`
                    : '<span class="text-xs text-gray-400">—</span>'}
            </td>
            <td class="px-5 py-3 text-right whitespace-nowrap">
                <button onclick="openPagamentoModal(${p.id})" class="inline-flex items-center justify-center w-8 h-8 rounded-lg text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors" title="Editar">
                    <span class="material-symbols-outlined" style="font-size:16px">edit</span>
                </button>
                <button onclick="removePagamento(${p.id})" class="inline-flex items-center justify-center w-8 h-8 rounded-lg text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors" title="Excluir">
                    <span class="material-symbols-outlined" style="font-size:16px">delete</span>
                </button>
            </td>
        </tr>`;
    }).join('');
}

function renderManutencoesTable() {
    const busca = (document.getElementById('manut-filter-busca')?.value || '').toUpperCase();
    let veiculos = state.veiculos.filter(v => `${v.placa} ${v.marca}`.toUpperCase().includes(busca));

    const tbody = document.getElementById('manutencoes-table-body');
    if (!tbody) return;
    if (!veiculos.length) {
        tbody.innerHTML = `<tr><td colspan="6" class="px-6 py-10 text-center text-sm text-gray-400">Nenhum veículo encontrado.</td></tr>`;
        return;
    }

    tbody.innerHTML = veiculos.map(v => {
        const info = getManutencaoInfo(v);
        const ultimaTxt = info.ultima ? `${escapeHtml(info.ultima.tipo)} — ${formatDate(info.ultima.data_realizada)}${info.ultima.km_realizada ? ' (' + Number(info.ultima.km_realizada).toLocaleString('pt-BR') + ' km)' : ''}` : 'Sem histórico';
        return `
        <tr class="hover:bg-gray-50 dark:hover:bg-gray-800/30">
            <td class="px-5 py-3">
                <p class="text-xs font-bold text-gray-800 dark:text-gray-200">${escapeHtml(v.placa)}</p>
                <p class="text-xs text-gray-400">${escapeHtml(v.marca)} ${escapeHtml(v.modelo)}</p>
            </td>
            <td class="px-5 py-3 text-xs text-gray-600 dark:text-gray-300">${ultimaTxt}</td>
            <td class="px-5 py-3 text-xs text-gray-500 dark:text-gray-400">
                <p>${info.profile.categoria}</p>
                <p>Óleo a cada ${info.profile.oleo_km.toLocaleString('pt-BR')} km / ${info.profile.oleo_meses} meses</p>
            </td>
            <td class="px-5 py-3 text-xs text-gray-600 dark:text-gray-300">
                ${info.proximaData ? formatDate(info.proximaData) : '—'}
                ${info.proximoKm ? `<br><span class="text-gray-400">${Number(info.proximoKm).toLocaleString('pt-BR')} km</span>` : ''}
            </td>
            <td class="px-5 py-3">${statusBadge(info.status === 'PREENCHER' ? 'PREENCHER' : info.status)}</td>
            <td class="px-5 py-3 text-right">
                <button onclick="openManutencaoModal(${v.id})"
                    class="inline-flex items-center gap-1 rounded-lg border border-gray-200 dark:border-gray-700 px-2.5 py-1.5 text-xs font-semibold text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
                    <span class="material-symbols-outlined" style="font-size:14px">add</span> Registrar
                </button>
            </td>
        </tr>`;
    }).join('');
}

function renderVeiculosTable() {
    const busca = (document.getElementById('veiculo-filter-busca')?.value || '').toUpperCase();
    const veiculos = state.veiculos.filter(v => `${v.placa} ${v.marca} ${v.motorista || ''}`.toUpperCase().includes(busca));

    const tbody = document.getElementById('veiculos-table-body');
    if (!tbody) return;
    if (!veiculos.length) {
        tbody.innerHTML = `<tr><td colspan="7" class="px-6 py-10 text-center text-sm text-gray-400">Nenhum veículo cadastrado. Clique em "Novo Veículo" para começar.</td></tr>`;
        return;
    }
    tbody.innerHTML = veiculos.map(v => `
        <tr class="hover:bg-gray-50 dark:hover:bg-gray-800/30">
            <td class="px-5 py-3 text-xs font-bold text-gray-800 dark:text-gray-200">${escapeHtml(v.placa)}</td>
            <td class="px-5 py-3 text-xs text-gray-600 dark:text-gray-300">${escapeHtml(v.marca)} ${escapeHtml(v.modelo)}</td>
            <td class="px-5 py-3 text-xs text-gray-600 dark:text-gray-300">${escapeHtml(v.motorista || '—')}</td>
            <td class="px-5 py-3 text-xs text-gray-600 dark:text-gray-300">${escapeHtml(v.uf || 'GO')}</td>
            <td class="px-5 py-3 text-xs text-gray-600 dark:text-gray-300">${escapeHtml(finalPlaca(v.placa) || '—')}</td>
            <td class="px-5 py-3">
                ${v.ativo
                    ? '<span class="inline-flex items-center gap-1 rounded-full bg-emerald-100 dark:bg-emerald-900/30 px-2 py-0.5 text-xs font-semibold text-emerald-700 dark:text-emerald-300">Ativo</span>'
                    : '<span class="inline-flex items-center gap-1 rounded-full bg-gray-100 dark:bg-gray-800 px-2 py-0.5 text-xs font-semibold text-gray-500">Inativo</span>'}
            </td>
            <td class="px-5 py-3 text-right whitespace-nowrap">
                ${v.documento_pdf_path
                    ? `<button onclick="viewFrotaPdf('${v.documento_pdf_path}')" title="Ver PDF do veículo"
                        class="inline-flex items-center justify-center w-8 h-8 rounded-lg text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors">
                        <span class="material-symbols-outlined" style="font-size:16px">picture_as_pdf</span>
                       </button>`
                    : ''}
                <button onclick="openVeiculoModal(${v.id})" class="inline-flex items-center justify-center w-8 h-8 rounded-lg text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors" title="Editar">
                    <span class="material-symbols-outlined" style="font-size:16px">edit</span>
                </button>
                <button onclick="removeVeiculo(${v.id})" class="inline-flex items-center justify-center w-8 h-8 rounded-lg text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors" title="Excluir">
                    <span class="material-symbols-outlined" style="font-size:16px">delete</span>
                </button>
            </td>
        </tr>`).join('');
}

function renderParametrosForm() {
    document.getElementById('param-ano-vigente').value = state.parametros.ano_vigente || '';
    document.getElementById('param-dias-alerta').value = state.parametros.dias_alerta || '';
    document.getElementById('param-taxa-licenciamento').value = state.parametros.taxa_licenciamento || '';
    document.getElementById('param-taxa-atraso').value = state.parametros.taxa_licenciamento_atraso || '';
}

function renderCalendarioTable() {
    const ano = Number(document.getElementById('calendario-ano-select')?.value) || Number(state.parametros.ano_vigente);
    const tbody = document.getElementById('calendario-table-body');
    if (!tbody) return;
    const finais = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0'];
    tbody.innerHTML = finais.map(fp => {
        const ipva = state.calendario.find(c => c.ano === ano && c.tipo === 'IPVA' && c.final_placa === fp);
        const lic = state.calendario.find(c => c.ano === ano && c.tipo === 'LICENCIAMENTO' && c.final_placa === fp);
        return `
        <tr>
            <td class="px-5 py-2 text-xs font-bold text-gray-700 dark:text-gray-300">${fp}</td>
            <td class="px-5 py-2"><input type="date" data-ano="${ano}" data-tipo="IPVA" data-final="${fp}" class="calendario-input input-field" style="text-transform:none" value="${ipva ? ipva.vencimento : ''}"></td>
            <td class="px-5 py-2"><input type="date" data-ano="${ano}" data-tipo="LICENCIAMENTO" data-final="${fp}" class="calendario-input input-field" style="text-transform:none" value="${lic ? lic.vencimento : ''}"></td>
        </tr>`;
    }).join('');
}

// ─── Abas ───────────────────────────────────────────────────────────────────
function switchTab(tab) {
    document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.getElementById(`tab-${tab}`)?.classList.add('active');
    document.querySelector(`.tab-btn[data-tab="${tab}"]`)?.classList.add('active');
}

// ─── Modal: Veículo ─────────────────────────────────────────────────────────
function openVeiculoModal(id) {
    const modal = document.getElementById('veiculo-modal');
    const form = document.getElementById('veiculo-form');
    form.reset();
    document.getElementById('veiculo-id').value = '';
    document.getElementById('veiculo-uf').value = 'GO';
    document.getElementById('veiculo-ativo').checked = true;

    existingVeiculoPdfPath = null;
    removeVeiculoPdfRequested = false;
    document.getElementById('veiculo-pdf-file').value = '';
    document.getElementById('veiculo-pdf-current').classList.add('hidden');

    if (id) {
        const v = state.veiculos.find(x => x.id === id);
        if (v) {
            document.getElementById('veiculo-modal-title').textContent = 'Editar Veículo';
            document.getElementById('veiculo-id').value = v.id;
            document.getElementById('veiculo-placa').value = v.placa || '';
            document.getElementById('veiculo-marca').value = v.marca || '';
            document.getElementById('veiculo-modelo').value = v.modelo || '';
            document.getElementById('veiculo-ano').value = v.ano_modelo || '';
            document.getElementById('veiculo-cor').value = v.cor || '';
            document.getElementById('veiculo-uf').value = v.uf || 'GO';
            document.getElementById('veiculo-km').value = v.km_atual || '';
            document.getElementById('veiculo-motorista').value = v.motorista || '';
            document.getElementById('veiculo-renavam').value = v.renavam || '';
            document.getElementById('veiculo-obs').value = v.observacao || '';
            document.getElementById('veiculo-ativo').checked = v.ativo !== false;

            if (v.documento_pdf_path) {
                existingVeiculoPdfPath = v.documento_pdf_path;
                document.getElementById('veiculo-pdf-current').classList.remove('hidden');
                getFrotaPdfSignedUrl(v.documento_pdf_path).then(url => {
                    document.getElementById('veiculo-pdf-current-link').href = url || '#';
                });
            }
        }
    } else {
        document.getElementById('veiculo-modal-title').textContent = 'Novo Veículo';
    }
    modal.classList.remove('hidden');
    modal.classList.add('flex');
}

function closeVeiculoModal() {
    const modal = document.getElementById('veiculo-modal');
    modal.classList.add('hidden');
    modal.classList.remove('flex');
}

function removeVeiculoPdf() {
    removeVeiculoPdfRequested = true;
    document.getElementById('veiculo-pdf-file').value = '';
    document.getElementById('veiculo-pdf-current').classList.add('hidden');
}

async function submitVeiculo() {
    const id = document.getElementById('veiculo-id').value;
    const placa = document.getElementById('veiculo-placa').value.trim().toUpperCase();
    const marca = document.getElementById('veiculo-marca').value.trim();
    const modelo = document.getElementById('veiculo-modelo').value.trim();
    if (!placa || !marca || !modelo) {
        showToast('Preencha placa, marca e modelo.', 'warning');
        return;
    }
    const payload = {
        placa, marca, modelo,
        ano_modelo: document.getElementById('veiculo-ano').value.trim() || null,
        cor: document.getElementById('veiculo-cor').value.trim() || null,
        uf: (document.getElementById('veiculo-uf').value.trim() || 'GO').toUpperCase(),
        km_atual: document.getElementById('veiculo-km').value ? Number(document.getElementById('veiculo-km').value) : null,
        motorista: document.getElementById('veiculo-motorista').value.trim() || null,
        renavam: document.getElementById('veiculo-renavam').value.trim() || null,
        observacao: document.getElementById('veiculo-obs').value.trim() || null,
        ativo: document.getElementById('veiculo-ativo').checked,
        updated_at: new Date().toISOString(),
    };
    let pdfPath = existingVeiculoPdfPath;
    const newPdfFile = document.getElementById('veiculo-pdf-file').files[0] || null;

    try {
        if (newPdfFile) {
            pdfPath = await uploadFrotaPdf(newPdfFile);
            if (existingVeiculoPdfPath) await deleteFrotaPdf(existingVeiculoPdfPath);
        } else if (removeVeiculoPdfRequested) {
            await deleteFrotaPdf(existingVeiculoPdfPath);
            pdfPath = null;
        }
        payload.documento_pdf_path = pdfPath;

        if (id) {
            await updateFrotaVeiculo(Number(id), payload);
            showToast('Veículo atualizado com sucesso.', 'success');
        } else {
            await createFrotaVeiculo(payload);
            showToast('Veículo cadastrado com sucesso.', 'success');
        }

        closeVeiculoModal();
        state.veiculos = await fetchFrotaVeiculos();
        populateVeiculoSelects();
        renderAll();
    } catch (error) {
        console.error(error);
        showToast('Erro ao salvar veículo: ' + error.message, 'error');
    }
}

async function removeVeiculo(id) {
    if (!confirm('Excluir este veículo? Documentos, manutenções e pagamentos vinculados também serão removidos.')) return;
    try {
        const v = state.veiculos.find(x => x.id === id);
        await deleteFrotaVeiculo(id);
        if (v && v.documento_pdf_path) await deleteFrotaPdf(v.documento_pdf_path);
        showToast('Veículo excluído.', 'success');
        state.veiculos = await fetchFrotaVeiculos();
        state.documentos = await fetchFrotaDocumentos();
        state.manutencoes = await fetchFrotaManutencoes();
        state.pagamentos = await fetchFrotaPagamentos();
        populateVeiculoSelects();
        renderAll();
    } catch (error) {
        console.error(error);
        showToast('Erro ao excluir veículo: ' + error.message, 'error');
    }
}

// ─── Modal: Documento ───────────────────────────────────────────────────────
function openDocumentoModal(veiculoId, tipo, ano) {
    const veiculo = state.veiculos.find(v => v.id === veiculoId);
    if (!veiculo) return;
    const doc = state.documentos.find(d => d.veiculo_id === veiculoId && d.tipo === tipo && d.ano === ano);

    document.getElementById('documento-form').reset();
    document.getElementById('doc-veiculo-id').value = veiculoId;
    document.getElementById('doc-tipo').value = tipo;
    document.getElementById('doc-ano').value = ano;
    document.getElementById('documento-modal-title').textContent = `${tipo} — ${ano}`;
    document.getElementById('documento-modal-subtitle').textContent = `${veiculo.placa} · ${veiculo.marca} ${veiculo.modelo}`;

    const isSeguro = tipo === 'SEGURO';
    document.getElementById('doc-fields-valor').classList.toggle('hidden', false);
    document.getElementById('doc-fields-seguro').classList.toggle('hidden', !isSeguro);
    document.getElementById('doc-pago-label').lastChild.textContent = isSeguro ? ' Apólice vigente' : ' Pago';

    const showManual = isSeguro ? false : (veiculo.uf || 'GO').toUpperCase() !== 'GO';
    document.getElementById('doc-fields-manual').classList.toggle('hidden', isSeguro);
    document.getElementById('doc-fields-manual').querySelector('.field-label').innerHTML =
        showManual
            ? 'Vencimento Manual <span class="text-red-500">*</span> (placa fora de GO)'
            : 'Vencimento Manual <span class="font-normal text-gray-400">(sobrepõe o calendário — ex: parcelamento)</span>';

    existingDocPdfPath = null;
    removeDocPdfRequested = false;
    document.getElementById('doc-pdf-file').value = '';
    document.getElementById('doc-pdf-current').classList.add('hidden');

    if (doc) {
        document.getElementById('doc-valor').value = doc.valor ?? '';
        document.getElementById('doc-data-pagamento').value = doc.data_pagamento || '';
        document.getElementById('doc-vencimento-manual').value = doc.vencimento_manual || '';
        document.getElementById('doc-seguradora').value = doc.seguradora || '';
        document.getElementById('doc-apolice').value = doc.apolice || '';
        document.getElementById('doc-vigencia-inicio').value = doc.vigencia_inicio || '';
        document.getElementById('doc-vigencia-fim').value = doc.vigencia_fim || '';
        document.getElementById('doc-pago').checked = !!doc.pago;
        document.getElementById('doc-obs').value = doc.observacao || '';

        if (doc.pdf_path) {
            existingDocPdfPath = doc.pdf_path;
            document.getElementById('doc-pdf-current').classList.remove('hidden');
            getFrotaPdfSignedUrl(doc.pdf_path).then(url => {
                document.getElementById('doc-pdf-current-link').href = url || '#';
            });
        }
    }

    const modal = document.getElementById('documento-modal');
    modal.classList.remove('hidden');
    modal.classList.add('flex');
}

function closeDocumentoModal() {
    const modal = document.getElementById('documento-modal');
    modal.classList.add('hidden');
    modal.classList.remove('flex');
}

function removeDocPdf() {
    removeDocPdfRequested = true;
    document.getElementById('doc-pdf-file').value = '';
    document.getElementById('doc-pdf-current').classList.add('hidden');
}

async function submitDocumento() {
    const veiculoId = Number(document.getElementById('doc-veiculo-id').value);
    const tipo = document.getElementById('doc-tipo').value;
    const ano = Number(document.getElementById('doc-ano').value);
    const veiculo = state.veiculos.find(v => v.id === veiculoId);

    const isSeguro = tipo === 'SEGURO';
    if (isSeguro && (!document.getElementById('doc-seguradora').value.trim() || !document.getElementById('doc-apolice').value.trim() || !document.getElementById('doc-vigencia-fim').value)) {
        showToast('Preencha seguradora, apólice e fim de vigência.', 'warning');
        return;
    }
    if (!isSeguro && (veiculo.uf || 'GO').toUpperCase() !== 'GO' && !document.getElementById('doc-vencimento-manual').value) {
        showToast('Veículo fora de GO: informe o vencimento manual.', 'warning');
        return;
    }

    let pdfPath = existingDocPdfPath;
    const newPdfFile = document.getElementById('doc-pdf-file').files[0] || null;

    const payload = {
        veiculo_id: veiculoId, tipo, ano,
        valor: document.getElementById('doc-valor').value ? Number(document.getElementById('doc-valor').value) : null,
        pago: document.getElementById('doc-pago').checked,
        data_pagamento: document.getElementById('doc-data-pagamento').value || null,
        vencimento_manual: document.getElementById('doc-vencimento-manual').value || null,
        seguradora: isSeguro ? (document.getElementById('doc-seguradora').value.trim() || null) : null,
        apolice: isSeguro ? (document.getElementById('doc-apolice').value.trim() || null) : null,
        vigencia_inicio: isSeguro ? (document.getElementById('doc-vigencia-inicio').value || null) : null,
        vigencia_fim: isSeguro ? (document.getElementById('doc-vigencia-fim').value || null) : null,
        observacao: document.getElementById('doc-obs').value.trim() || null,
        updated_at: new Date().toISOString(),
    };

    try {
        if (newPdfFile) {
            pdfPath = await uploadFrotaPdf(newPdfFile);
            if (existingDocPdfPath) await deleteFrotaPdf(existingDocPdfPath);
        } else if (removeDocPdfRequested) {
            await deleteFrotaPdf(existingDocPdfPath);
            pdfPath = null;
        }
        payload.pdf_path = pdfPath;

        await upsertFrotaDocumento(payload);
        showToast('Documento salvo com sucesso.', 'success');
        closeDocumentoModal();
        state.documentos = await fetchFrotaDocumentos();
        renderAll();
    } catch (error) {
        console.error(error);
        showToast('Erro ao salvar documento: ' + error.message, 'error');
    }
}

// ─── Modal: Manutenção ──────────────────────────────────────────────────────
function openManutencaoModal(veiculoId) {
    const veiculo = state.veiculos.find(v => v.id === veiculoId);
    if (!veiculo) return;
    document.getElementById('manutencao-form').reset();
    document.getElementById('manut-veiculo-id').value = veiculoId;
    document.getElementById('manutencao-modal-subtitle').textContent = `${veiculo.placa} · ${veiculo.marca} ${veiculo.modelo}`;
    document.getElementById('manut-data').value = todayISO();

    const modal = document.getElementById('manutencao-modal');
    modal.classList.remove('hidden');
    modal.classList.add('flex');
}

function closeManutencaoModal() {
    const modal = document.getElementById('manutencao-modal');
    modal.classList.add('hidden');
    modal.classList.remove('flex');
}

async function submitManutencao() {
    const veiculoId = Number(document.getElementById('manut-veiculo-id').value);
    const tipo = document.getElementById('manut-tipo').value.trim();
    const data = document.getElementById('manut-data').value;
    if (!tipo || !data) {
        showToast('Preencha o tipo e a data da manutenção.', 'warning');
        return;
    }
    const payload = {
        veiculo_id: veiculoId, tipo,
        data_realizada: data,
        km_realizada: document.getElementById('manut-km').value ? Number(document.getElementById('manut-km').value) : null,
        proxima_data: document.getElementById('manut-proxima-data').value || null,
        proximo_km: document.getElementById('manut-proximo-km').value ? Number(document.getElementById('manut-proximo-km').value) : null,
        observacao: document.getElementById('manut-obs').value.trim() || null,
    };
    try {
        await createFrotaManutencao(payload);
        showToast('Manutenção registrada com sucesso.', 'success');
        closeManutencaoModal();
        state.manutencoes = await fetchFrotaManutencoes();
        renderAll();
    } catch (error) {
        console.error(error);
        showToast('Erro ao registrar manutenção: ' + error.message, 'error');
    }
}

// ─── Modal: Pagamento (Histórico) ───────────────────────────────────────────
function openPagamentoModal(id) {
    const modal = document.getElementById('pagamento-modal');
    const form = document.getElementById('pagamento-form');
    form.reset();
    document.getElementById('pag-id').value = '';
    document.getElementById('pag-data').value = todayISO();

    existingPagPdfPath = null;
    removePagPdfRequested = false;
    document.getElementById('pag-pdf-file').value = '';
    document.getElementById('pag-pdf-current').classList.add('hidden');

    if (id) {
        const p = state.pagamentos.find(x => x.id === id);
        if (p) {
            document.getElementById('pagamento-modal-title').textContent = 'Editar Registro de Pagamento';
            document.getElementById('pag-id').value = p.id;
            document.getElementById('pag-veiculo-id').value = p.veiculo_id;
            document.getElementById('pag-tipo').value = p.tipo;
            document.getElementById('pag-data').value = p.data_pagamento || todayISO();
            document.getElementById('pag-descricao').value = p.descricao || '';
            document.getElementById('pag-valor').value = p.valor ?? '';
            document.getElementById('pag-obs').value = p.observacao || '';

            if (p.pdf_path) {
                existingPagPdfPath = p.pdf_path;
                document.getElementById('pag-pdf-current').classList.remove('hidden');
                getFrotaPdfSignedUrl(p.pdf_path).then(url => {
                    document.getElementById('pag-pdf-current-link').href = url || '#';
                });
            }
        }
    } else {
        document.getElementById('pagamento-modal-title').textContent = 'Novo Registro de Pagamento';
    }

    modal.classList.remove('hidden');
    modal.classList.add('flex');
}

function closePagamentoModal() {
    const modal = document.getElementById('pagamento-modal');
    modal.classList.add('hidden');
    modal.classList.remove('flex');
}

function removePagPdf() {
    removePagPdfRequested = true;
    document.getElementById('pag-pdf-file').value = '';
    document.getElementById('pag-pdf-current').classList.add('hidden');
}

async function submitPagamento() {
    const id = document.getElementById('pag-id').value;
    const veiculoId = Number(document.getElementById('pag-veiculo-id').value);
    const tipo = document.getElementById('pag-tipo').value;
    const dataPagamento = document.getElementById('pag-data').value;
    if (!veiculoId || !tipo || !dataPagamento) {
        showToast('Selecione o veículo, o tipo e a data de pagamento.', 'warning');
        return;
    }

    let pdfPath = existingPagPdfPath;
    const newPdfFile = document.getElementById('pag-pdf-file').files[0] || null;

    const payload = {
        veiculo_id: veiculoId, tipo,
        data_pagamento: dataPagamento,
        descricao: document.getElementById('pag-descricao').value.trim() || null,
        valor: document.getElementById('pag-valor').value ? Number(document.getElementById('pag-valor').value) : null,
        observacao: document.getElementById('pag-obs').value.trim() || null,
    };

    try {
        if (newPdfFile) {
            pdfPath = await uploadFrotaPdf(newPdfFile);
            if (existingPagPdfPath) await deleteFrotaPdf(existingPagPdfPath);
        } else if (removePagPdfRequested) {
            await deleteFrotaPdf(existingPagPdfPath);
            pdfPath = null;
        }
        payload.pdf_path = pdfPath;

        if (id) {
            await updateFrotaPagamento(Number(id), payload);
            showToast('Registro de pagamento atualizado.', 'success');
        } else {
            await createFrotaPagamento(payload);
            showToast('Pagamento registrado com sucesso.', 'success');
        }
        closePagamentoModal();
        state.pagamentos = await fetchFrotaPagamentos();
        renderAll();
    } catch (error) {
        console.error(error);
        showToast('Erro ao salvar registro de pagamento: ' + error.message, 'error');
    }
}

async function removePagamento(id) {
    if (!confirm('Excluir este registro de pagamento? O comprovante em PDF também será removido.')) return;
    try {
        const p = state.pagamentos.find(x => x.id === id);
        await deleteFrotaPagamento(id);
        if (p && p.pdf_path) await deleteFrotaPdf(p.pdf_path);
        showToast('Registro excluído.', 'success');
        state.pagamentos = await fetchFrotaPagamentos();
        renderAll();
    } catch (error) {
        console.error(error);
        showToast('Erro ao excluir registro: ' + error.message, 'error');
    }
}

// ─── Parâmetros e Calendário ────────────────────────────────────────────────
async function saveParametros() {
    const updates = {
        ano_vigente: document.getElementById('param-ano-vigente').value,
        dias_alerta: document.getElementById('param-dias-alerta').value,
        taxa_licenciamento: document.getElementById('param-taxa-licenciamento').value,
        taxa_licenciamento_atraso: document.getElementById('param-taxa-atraso').value,
    };
    try {
        await Promise.all(Object.entries(updates).map(([chave, valor]) => updateFrotaParametro(chave, valor)));
        state.parametros = { ...state.parametros, ...updates };
        showToast('Parâmetros salvos com sucesso.', 'success');
        populateAnoFilters();
        renderAll();
    } catch (error) {
        console.error(error);
        showToast('Erro ao salvar parâmetros: ' + error.message, 'error');
    }
}

async function saveCalendario() {
    const inputs = document.querySelectorAll('.calendario-input');
    const writes = [];
    inputs.forEach(input => {
        if (!input.value) return;
        writes.push({
            ano: Number(input.dataset.ano),
            tipo: input.dataset.tipo,
            final_placa: input.dataset.final,
            vencimento: input.value,
        });
    });
    if (!writes.length) {
        showToast('Nenhuma data preenchida para salvar.', 'warning');
        return;
    }
    try {
        await Promise.all(writes.map(w => upsertFrotaCalendario(w)));
        showToast('Calendário salvo com sucesso.', 'success');
        state.calendario = await fetchFrotaCalendario();
        renderAll();
    } catch (error) {
        console.error(error);
        showToast('Erro ao salvar calendário: ' + error.message, 'error');
    }
}

// ─── Exportação ─────────────────────────────────────────────────────────────
function exportFrotaXLS() {
    try {
        const entries = buildDocEntries();
        const rows = entries.map(e => ({
            Placa: e.veiculo.placa, Marca: e.veiculo.marca, Modelo: e.veiculo.modelo,
            Motorista: e.veiculo.motorista || '', Tipo: e.tipo, Ano: e.ano,
            Vencimento: e.vencimento ? formatDate(e.vencimento) : '', Valor: e.doc?.valor || '',
            Pago: e.doc?.pago ? 'SIM' : 'NÃO', Status: STATUS_LABEL[e.status],
        }));
        const ws = XLSX.utils.json_to_sheet(rows);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'Controle de Frota');
        XLSX.writeFile(wb, `controle_frota_${todayISO()}.xlsx`);
    } catch (error) {
        console.error(error);
        showToast('Erro ao exportar XLS: ' + error.message, 'error');
    }
}

function exportPainelPDF() {
    try {
        const { jsPDF } = window.jspdf;
        const doc = new jsPDF();
        const entries = buildDocEntries();
        const vencidos = entries.filter(e => e.status === 'VENCIDO').sort((a, b) => (a.vencimento || '').localeCompare(b.vencimento || ''));
        const avencer = entries.filter(e => e.status === 'AVENCER').sort((a, b) => (a.vencimento || '').localeCompare(b.vencimento || ''));

        doc.setFontSize(14);
        doc.text('Controle de Documentação da Frota — Painel DDS/Planejamento', 14, 16);
        doc.setFontSize(9);
        doc.text(`Gerado em ${formatDate(todayISO())}`, 14, 22);

        doc.setFontSize(11);
        doc.text('Vencidos — Ação Imediata', 14, 32);
        doc.autoTable({
            startY: 35,
            head: [['Placa', 'Tipo', 'Vencimento', 'Valor', 'Motorista']],
            body: vencidos.map(e => [e.veiculo.placa, e.tipo, formatDate(e.vencimento), e.doc?.valor ? formatMoney(e.doc.valor) : '-', e.veiculo.motorista || '-']),
            styles: { fontSize: 8 }, headStyles: { fillColor: [220, 38, 38] },
        });

        const nextY = doc.lastAutoTable.finalY + 10;
        doc.setFontSize(11);
        doc.text('A Vencer — Planejamento', 14, nextY);
        doc.autoTable({
            startY: nextY + 3,
            head: [['Placa', 'Tipo', 'Vencimento', 'Valor', 'Motorista']],
            body: avencer.map(e => [e.veiculo.placa, e.tipo, formatDate(e.vencimento), e.doc?.valor ? formatMoney(e.doc.valor) : '-', e.veiculo.motorista || '-']),
            styles: { fontSize: 8 }, headStyles: { fillColor: [217, 119, 6] },
        });

        doc.save(`painel_frota_${todayISO()}.pdf`);
    } catch (error) {
        console.error(error);
        showToast('Erro ao exportar PDF: ' + error.message, 'error');
    }
}

// ─── Inicialização ──────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
    if (typeof _supabase !== 'undefined') {
        initFrota();
    } else {
        setTimeout(initFrota, 200);
    }
});
