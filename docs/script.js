/**
 * Lógica da Aplicação - Hortas Comunitárias de Teresina
 * Versão Estável: Marcadores Circulares + Clima & Lua Corrigidos
 */

// Estado Global
let map;
let markers = [];
let allHortas = [];
let currentPhotoIndex = 1;
let currentHortaId = null;
const teresinaCoords = [-5.0892, -42.8016];

// EXPOSIÇÃO GLOBAL
window.openModal = function(id) {
    const el = document.getElementById(id);
    if (el) {
        el.classList.remove('hidden');
        el.classList.add('flex');
        el.classList.add('active'); // Garante que a classe de visibilidade do CSS seja aplicada
    }
};

window.closeModal = function(id) {
    const el = document.getElementById(id);
    if (el) {
        el.classList.add('hidden');
        el.classList.remove('flex');
        el.classList.remove('active'); // Remove a classe active para fechar corretamente
    }
};

// Funções do Carrossel
window.changePhoto = function(step) {
    currentPhotoIndex += step;
    // Ajustado para 3 fotos (1, 2 e 3)
    if (currentPhotoIndex > 3) currentPhotoIndex = 1;
    if (currentPhotoIndex < 1) currentPhotoIndex = 3;
    updateCarouselDisplay();
};

function updateCarouselDisplay() {
    const headerImg = document.getElementById('modal-header-img');
    const photoLabel = document.getElementById('photo-counter');
    if (!headerImg || !currentHortaId) return;

    const photoUrl = `photos/${currentHortaId}/${currentPhotoIndex}.jpg`;
    const fallbackUrl = `https://images.unsplash.com/photo-1585320806297-9794b3e4eeae?auto=format&fit=crop&w=800&q=80`;

    headerImg.style.opacity = '0.7';
    const img = new Image();
    img.src = photoUrl;
    img.onload = () => {
        headerImg.style.backgroundImage = `url('${photoUrl}')`;
        headerImg.style.opacity = '1';
    };
    img.onerror = () => {
        // Se a foto 2 ou 3 não existir, volta para a 1 ou usa o fallback
        if (currentPhotoIndex !== 1) {
            headerImg.style.backgroundImage = `url('photos/${currentHortaId}/1.jpg')`;
        } else {
            headerImg.style.backgroundImage = `url('${fallbackUrl}')`;
        }
        headerImg.style.opacity = '1';
    };

    if (photoLabel) photoLabel.innerText = `${currentPhotoIndex} / 3`;
}

window.onload = function() {
    initMap();
    loadHortas();
    initLunarCalendar();
    getWeather();
    setupFilters();
};

function initMap() {
    map = L.map('map', { zoomControl: false }).setView(teresinaCoords, 13);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; OpenStreetMap contributors'
    }).addTo(map);
    L.control.zoom({ position: 'bottomright' }).addTo(map);
}

function loadHortas() {
    Papa.parse("dados/hortas.csv", {
        download: true,
        header: true,
        delimiter: ";",
        skipEmptyLines: true,
        complete: (results) => {
            allHortas = results.data.map((h, index) => {
                const lat = parseFloat(String(h.latitude).replace(',', '.'));
                const lng = parseFloat(String(h.longitude).replace(',', '.'));
                return { ...h, id_internal: index, lat, lng };
            }).filter(h => !isNaN(h.lat));
            renderHortas(allHortas);            
        }
    });
}

function renderHortas(data) {
    const list = document.getElementById('hortas-list');
    if (!list) return;
    
    list.innerHTML = "";
    markers.forEach(m => map.removeLayer(m.marker));
    markers = [];

    data.forEach((horta) => {
        const marker = L.marker([horta.lat, horta.lng], {
            icon: L.divIcon({ 
                html: `<div class="bg-[#2d5a27] text-white text-[11px] font-bold w-7 h-7 flex items-center justify-center rounded-full border-2 border-white shadow-md">${horta.id}</div>`, 
                className: '', 
                iconSize: [28, 28], 
                iconAnchor: [14, 14]
            })
        }).addTo(map);

        marker.on('click', () => {
            focusHorta(horta.id_internal, false);
        });
        
        markers.push({ id: horta.id_internal, marker });

        const photoUrl = `photos/${horta.id}/1.jpg`;
        const fallback = "https://images.unsplash.com/photo-1585320806297-9794b3e4eeae?auto=format&fit=crop&q=80&w=100&h=100";

        const item = document.createElement('div');
        item.id = `item-${horta.id_internal}`;
        item.className = "horta-item flex items-center gap-4 p-4 border-b border-gray-100 cursor-pointer transition-all";
        
        item.onclick = () => focusHorta(horta.id_internal, true);
        
        item.innerHTML = `
            <div class="relative">
                <img src="${photoUrl}" class="horta-thumb w-16 h-16 rounded-xl object-cover" onerror="this.src='${fallback}'">
                <span class="absolute -top-2 -left-2 bg-[#2d5a27] text-white text-[10px] font-bold w-6 h-6 flex items-center justify-center rounded-full border-2 border-white shadow-sm">
                    ${horta.id}
                </span>
            </div>
            <div class="overflow-hidden flex-1">
                <span class="font-sidebar-title text-sm font-bold block truncate">${horta.horta}</span>
                <span class="font-sidebar-sub text-[11px] text-gray-500 block">${horta.bairro} • Zona ${horta.zona}</span>
                <button onclick="event.stopPropagation(); showDetails(${horta.id_internal})" class="text-[10px] text-green-700 font-bold mt-1 hover:underline uppercase tracking-wider">VER DETALHES</button>
            </div>
        `;
        list.appendChild(item);
    });
}

function focusHorta(id, updateMap = true) {
    const horta = allHortas.find(h => h.id_internal === id);
    if (!horta) return;

    document.querySelectorAll('.horta-item').forEach(el => el.classList.remove('active-card'));
    const activeEl = document.getElementById(`item-${id}`);
    if (activeEl) {
        activeEl.classList.add('active-card');
        activeEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }

    const mObj = markers.find(m => m.id === id);
    if (mObj) {
        mObj.marker.bindTooltip(`<b>#${horta.id}</b> - ${horta.horta}`, { direction: 'top', offset: [0, -10] }).openTooltip();
        setTimeout(() => mObj.marker.closeTooltip(), 3000);
    }

    if (updateMap) {
        map.flyTo([horta.lat, horta.lng], 16);
    }
}

function showDetails(id) {
    const h = allHortas.find(item => item.id_internal === id);
    if(!h) return;

    currentHortaId = h.id;
    currentPhotoIndex = 1;

    document.getElementById('modal-title').innerText = h.horta;
    document.getElementById('modal-zona').innerText = h.zona ? `ZONA ${h.zona}` : "TERESINA";
    document.getElementById('modal-desc').innerText = h.apresentação || "Informação não disponível.";
    document.getElementById('modal-ali').innerText = h.plantas_alimenticias || "Não catalogado";
    document.getElementById('modal-med').innerText = h.plantas_medicinais || "Não catalogado";
    document.getElementById('modal-addr').innerText = h.endereço || "Não disponible";
    
    updateCarouselDisplay();
    window.openModal('detail-modal');
}

function initLunarCalendar() {
    const date = new Date();
    const lp = 2551443; 
    const now = new Date(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), 20, 35, 0);
    const new_moon = new Date(1970, 0, 7, 20, 35, 0);
    const phase = ((now.getTime() - new_moon.getTime()) / 1000) % lp;
    const res = Math.floor(phase / (24 * 3600));
    
    let icon = "🌑";
    let name = "Nova";
    let desc = "Época de podar e preparar a terra.";

    if (res < 2) { 
        icon = "🌑"; name = "Nova"; 
        desc = "Ideal para o plantio de raízes e para fazer podas que fortalecem a planta.";
    }
    else if (res < 7) { 
        icon = "🌒"; name = "Crescente"; 
        desc = "A seiva sobe para os ramos. Ideal para plantar hortaliças de folhas e frutos.";
    }
    else if (res < 10) { 
        icon = "🌓"; name = "Quarto Crescente"; 
        desc = "Período favorável para o crescimento rápido de hortaliças.";
    }
    else if (res < 17) { 
        icon = "🌕"; name = "Cheia"; 
        desc = "Energia máxima! Melhor momento para colher plantas medicinais.";
    }
    else if (res < 24) { 
        icon = "🌗"; name = "Quarto Minguante"; 
        desc = "A energia desce para as raízes. Período de controle de pragas.";
    }
    else { 
        icon = "🌘"; name = "Minguante"; 
        desc = "Fase de descanso e combate a insetos. Bom para colher sementes.";
    }

    const widget = document.getElementById('lunar-widget');
    if (widget) widget.innerText = icon;
    
    document.getElementById('lunar-btn').onclick = () => {
        const details = document.getElementById('lunar-details');
        if (details) {
            details.innerHTML = `
                <div class="text-center p-4">
                    <div class="text-6xl mb-4">${icon}</div>
                    <h4 class="font-bold text-green-800 text-xl">Lua ${name}</h4>
                    <p class="text-gray-600 mt-2 text-sm">${desc}</p>
                    <div class="mt-4 p-3 bg-green-50 rounded-lg text-[10px] text-green-700 uppercase font-bold">
                        Guia de Plantio - Teresina
                    </div>
                </div>
            `;
        }
        window.openModal('lunar-modal'); // Corrigido para usar a função global com suporte a classe active
    };
}

async function getWeather() {
    try {
        const response = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=-5.0892&longitude=-42.8016&current=temperature_2m,relative_humidity_2m&daily=temperature_2m_max,temperature_2m_min,precipitation_probability_max&timezone=auto`);
        const data = await response.json();
        
        const widget = document.getElementById('rain-widget');
        if (widget && data.current) {
            widget.innerText = `${Math.round(data.current.temperature_2m)}°C`;
        }

        // Adiciona evento de clique para abrir o modal do clima
        const rainBtn = document.getElementById('rain-btn');
        if (rainBtn) {
            rainBtn.onclick = () => window.openModal('rain-modal');
        }

        const rainDetails = document.getElementById('rain-details');
        if (rainDetails && data.daily) {
            let html = "";
            for(let i=0; i<5; i++) {
                const day = new Date(data.daily.time[i] + 'T00:00').toLocaleDateString('pt-BR', {weekday: 'short', day: 'numeric'});
                html += `
                    <div class="flex justify-between items-center p-3 border-b border-gray-50">
                        <span class="text-xs font-bold text-gray-600 w-20">${day}</span>
                        <span class="text-xs text-blue-500 font-semibold"><i class="fa-solid fa-droplet mr-1"></i>${data.daily.precipitation_probability_max[i]}%</span>
                        <span class="text-xs font-bold text-gray-800">${Math.round(data.daily.temperature_2m_min[i])}° / ${Math.round(data.daily.temperature_2m_max[i])}°</span>
                    </div>
                `;
            }
            rainDetails.innerHTML = html;
        }
    } catch (error) {
        console.error("Erro ao carregar clima:", error);
    }
}

function setupFilters() {
    // Filtro de Hortas (Bairro/Nome)
    const filter = document.getElementById('horta-filter');
    if (filter) {
        filter.addEventListener('input', (e) => {
            const term = e.target.value.toLowerCase();
            const filtered = allHortas.filter(h => 
                h.horta.toLowerCase().includes(term) || h.bairro.toLowerCase().includes(term) || h.id.toString().includes(term)
            );
            renderHortas(filtered);
        });
    }

    // Buscador de Plantas com Autocomplete
    const plantSearch = document.getElementById('plant-search');
    const searchResults = document.getElementById('search-results');

    if (plantSearch && searchResults) {
        plantSearch.addEventListener('input', (e) => {
            const term = e.target.value.toLowerCase();
            
            if (term.length < 2) {
                searchResults.innerHTML = "";
                searchResults.classList.add('hidden');
                return;
            }

            const matches = allHortas.filter(h => {
                const ali = (h.plantas_alimenticias || "").toLowerCase();
                const med = (h.plantas_medicinais || "").toLowerCase();
                return ali.includes(term) || med.includes(term);
            });

            if (matches.length > 0) {
                searchResults.innerHTML = "";
                matches.forEach(match => {
                    const div = document.createElement('div');
                    div.className = "search-item";
                    div.innerHTML = `
                        <div class="text-xs font-bold text-green-800">${match.horta}</div>
                        <div class="text-[10px] text-gray-500 uppercase">${match.bairro}</div>
                    `;
                    div.onclick = () => {
                        focusHorta(match.id_internal, true);
                        plantSearch.value = "";
                        searchResults.innerHTML = "";
                        searchResults.classList.add('hidden');
                    };
                    searchResults.appendChild(div);
                });
                searchResults.classList.remove('hidden');
            } else {
                searchResults.innerHTML = `<div class="p-3 text-[10px] text-gray-400">Nenhuma horta encontrada com esta planta</div>`;
                searchResults.classList.remove('hidden');
            }
        });

        // Fechar resultados ao clicar fora
        document.addEventListener('click', (e) => {
            if (!plantSearch.contains(e.target) && !searchResults.contains(e.target)) {
                searchResults.classList.add('hidden');
            }
        });
    }
}