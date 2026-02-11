/**
 * Hortas Comunitarias de Teresina - Script Optimizado
 * Versión: 2.0 - Optimización de rendimiento
 * Cambios: Debounce, caching, índice de plantas, eventos mejorados
 */

// ==================== ESTADO GLOBAL ====================
let map;
let markers = [];
let allHortas = [];
let currentPhotoIndex = 1;
let currentHortaId = null;
const teresinaCoords = [-5.0892, -42.8016];

// Cache y configuración
let weatherCache = null;
let weatherCacheTime = 0;
const WEATHER_CACHE_TTL = 1800000; // 30 minutos
let plantIndex = new Map();

// ==================== UTILIDADES ====================

/**
 * Debounce - Reduce ejecuciones frecuentes de funciones
 * @param {Function} func - Función a ejecutar
 * @param {number} wait - Milisegundos de espera
 * @returns {Function}
 */
const debounce = (func, wait) => {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
};

/**
 * Throttle - Ejecuta función máximo cada X milisegundos
 * @param {Function} func - Función a ejecutar
 * @param {number} limit - Milisegundos mínimo entre ejecuciones
 * @returns {Function}
 */
const throttle = (func, limit) => {
    let inThrottle;
    return function (...args) {
        if (!inThrottle) {
            func.apply(this, args);
            inThrottle = true;
            setTimeout(() => inThrottle = false, limit);
        }
    };
};

// ==================== EXPOSICIÓN GLOBAL ====================

window.openModal = function (id) {
    const el = document.getElementById(id);
    if (el) {
        el.classList.remove('hidden');
        el.classList.add('flex', 'active');
    }
};

window.closeModal = function (id) {
    const el = document.getElementById(id);
    if (el) {
        el.classList.add('hidden');
        el.classList.remove('flex', 'active');
    }
};

window.changePhoto = function (step) {
    currentPhotoIndex += step;
    if (currentPhotoIndex > 3) currentPhotoIndex = 1;
    if (currentPhotoIndex < 1) currentPhotoIndex = 3;
    updateCarouselDisplay();
};

// ==================== CARRUSEL DE FOTOS ====================

function updateCarouselDisplay() {
    const headerImg = document.getElementById('modal-header-img');
    const photoLabel = document.getElementById('photo-counter');
    if (!headerImg || !currentHortaId) return;

    const photoUrl = `photos/${currentHortaId}/${currentPhotoIndex}.jpg`;
    const fallbackUrl = `https://images.unsplash.com/photo-1585320806297-9794b3e4eeae?auto=format&fit=crop&w=800&q=80`;

    // Usar CSS para transición en lugar de manipular opacity
    headerImg.style.backgroundImage = `url('${photoUrl}')`;

    if (photoLabel) {
        photoLabel.innerText = `${currentPhotoIndex} / 3`;
    }
}

// ==================== INICIALIZACIÓN DEL MAPA ====================

function initMap() {
    map = L.map('map', {
        zoomControl: false,
        preferCanvas: true // Mejor rendimiento en dispositivos con muchos marcadores
    }).setView(teresinaCoords, 13);

    const osm = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; OpenStreetMap contributors'
    });
    const cartoLight = L.tileLayer(
        'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png',
        {
            attribution: '© OpenStreetMap © CARTO',
            subdomains: 'abcd',
            maxZoom: 20
        }
    );
    cartoLight.addTo(map);
    // Agregar selector de capas
    L.control.layers(
        {
            '🌟': cartoLight,
            'Osm': osm,
        },
        {},
        { position: 'topleft', collapsed: true }
    ).addTo(map);
    L.control.zoom({ position: 'bottomright' }).addTo(map);
}

// ==================== CARGA Y RENDERIZADO DE HORTAS ====================

function loadHortas() {
    const cacheBuster = `?t=${Date.now()}`;
    Papa.parse("dados/hortas.csv" + cacheBuster, {
        download: true,
        header: true,
        delimiter: ";",
        skipEmptyLines: true,
        dynamicTyping: false,
        complete: (results) => {
            allHortas = results.data
                .map((h, index) => {
                    const lat = parseFloat(String(h.latitude).replace(',', '.'));
                    const lng = parseFloat(String(h.longitude).replace(',', '.'));
                    return { ...h, id_internal: index, lat, lng };
                })
                .filter(h => !isNaN(h.lat) && h.lat && h.lng);

            buildPlantIndex();
            renderHortas(allHortas);
        },
        error: (error) => {
            console.error("Error al cargar CSV:", error);
            document.getElementById('hortas-list').innerHTML =
                '<div class="p-4 text-red-600">Error al cargar hortas</div>';
        }
    });
}

/**
 * Construye un índice de plantas para búsqueda O(1)
 */
function buildPlantIndex() {
    plantIndex.clear();

    allHortas.forEach(h => {
        const plants = new Set();

        // Agregar plantas alimenticias
        if (h.plantas_alimenticias) {
            h.plantas_alimenticias.split(',').forEach(p => {
                plants.add(p.trim().toLowerCase());
            });
        }

        // Agregar plantas medicinales
        if (h.plantas_medicinais) {
            h.plantas_medicinais.split(',').forEach(p => {
                plants.add(p.trim().toLowerCase());
            });
        }

        // Agregar al índice
        plants.forEach(plant => {
            if (!plantIndex.has(plant)) {
                plantIndex.set(plant, []);
            }
            plantIndex.get(plant).push(h.id_internal);
        });
    });
}

function renderHortas(data) {
    const list = document.getElementById('hortas-list');
    if (!list) return;

    list.innerHTML = "";

    // Limpiar marcadores antiguos de forma eficiente
    markers.forEach(m => {
        if (m.marker && map.hasLayer(m.marker)) {
            map.removeLayer(m.marker);
        }
    });
    markers = [];

    // Renderizar nuevos elementos
    data.forEach((horta) => {
        // Crear marcador con SVG más ligero
        const svgIcon = L.divIcon({
            html: `<svg width="28" height="28" viewBox="0 0 28 28" style="filter: drop-shadow(0 2px 4px rgba(0,0,0,0.2));">
                     <circle cx="14" cy="14" r="12" fill="#2d5a27" stroke="white" stroke-width="2"/>
                     <text x="14" y="18" text-anchor="middle" font-size="11" font-weight="bold" fill="white">${horta.id}</text>
                   </svg>`,
            className: '',
            iconSize: [28, 28],
            iconAnchor: [14, 14]
        });

        const marker = L.marker([horta.lat, horta.lng], { icon: svgIcon }).addTo(map);

        marker.on('click', () => {
            focusHorta(horta.id_internal, false);
        });

        markers.push({ id: horta.id_internal, marker, visible: true });

        // Crear elemento en sidebar
        const item = document.createElement('div');
        item.id = `item-${horta.id_internal}`;
        item.className = "horta-item flex items-center gap-4 p-4 border-b border-gray-100 cursor-pointer transition-all bg-white m-2 rounded-xl hover:shadow-md";
        item.dataset.horta = horta.id_internal;

        const photoUrl = `photos/${horta.id}/1.jpg`;
        const fallback = "https://images.unsplash.com/photo-1585320806297-9794b3e4eeae?auto=format&fit=crop&q=80&w=100&h=100";

        item.innerHTML = `
            <div class="relative flex-shrink-0">
                <img src="${photoUrl}" class="horta-thumb w-16 h-16 rounded-xl object-cover" 
                     onerror="this.src='${fallback}'" alt="${horta.horta}" loading="lazy">
                <span class="absolute -top-2 -left-2 bg-[#2d5a27] text-white text-[10px] font-bold w-6 h-6 flex items-center justify-center rounded-full border-2 border-white">
                    ${horta.id}
                </span>
            </div>
            <div class="overflow-hidden flex-1 min-w-0">
                <span class="font-sidebar-title text-sm font-bold block truncate text-[#2d5a27]">${horta.horta}</span>
                <span class="text-[11px] text-gray-500 block">${horta.bairro} • Zona ${horta.zona}</span>
                <button class="text-[10px] text-green-700 font-bold mt-1 hover:underline uppercase tracking-wider ver-detalhes">VER DETALHES</button>
            </div>
        `;

        item.addEventListener('click', (e) => focusHorta(horta.id_internal, true));
        item.querySelector('.ver-detalhes').addEventListener('click', (e) => {
            e.stopPropagation();
            showDetails(horta.id_internal);
        });

        list.appendChild(item);
    });
}

function focusHorta(id, updateMap = true) {
    const horta = allHortas.find(h => h.id_internal === id);
    if (!horta) return;

    // Remover clase activa de items anteriores
    document.querySelectorAll('.horta-item').forEach(el => el.classList.remove('active-card'));

    const activeEl = document.getElementById(`item-${id}`);
    if (activeEl) {
        activeEl.classList.add('active-card');
        activeEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }

    // Mostrar tooltip del marcador
    const mObj = markers.find(m => m.id === id);
    if (mObj && mObj.marker) {
        mObj.marker.bindTooltip(`<b>#${horta.id}</b> - ${horta.horta}`, {
            direction: 'top',
            offset: [0, -10],
            permanent: false
        }).openTooltip();

        setTimeout(() => mObj.marker.closeTooltip(), 2000);
    }

    if (updateMap) {
        map.flyTo([horta.lat, horta.lng], 16, { duration: 0.8 });
    }
}

function showDetails(id) {
    const h = allHortas.find(item => item.id_internal === id);
    if (!h) return;

    currentHortaId = h.id;
    currentPhotoIndex = 1;

    // Actualizar elementos del modal
    const updates = {
        'modal-title': h.horta,
        'modal-zona': h.zona ? `ZONA ${h.zona}` : "TERESINA",
        'modal-desc': h.apresentação || "Informação não disponível.",
        'modal-ali': h.plantas_alimenticias || "Não catalogado",
        'modal-med': h.plantas_medicinais || "Não catalogado",
        'modal-addr': h.endereço || "Não disponível"
    };

    Object.entries(updates).forEach(([id, text]) => {
        const el = document.getElementById(id);
        if (el) el.textContent = text;
    });

    updateCarouselDisplay();
    window.openModal('detail-modal');
}

// ==================== CALENDARIO LUNAR ====================

function initLunarCalendar() {
    const date = new Date();
    const lp = 2551443;
    const now = new Date(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), 20, 35, 0);
    const new_moon = new Date(1970, 0, 7, 20, 35, 0);
    const phase = ((now.getTime() - new_moon.getTime()) / 1000) % lp;
    const res = Math.floor(phase / (24 * 3600));

    const lunarPhases = [
        { max: 2, icon: "🌑", name: "Nova", desc: "Ideal para o plantio de raízes e para fazer podas que fortalecem a planta." },
        { max: 7, icon: "🌒", name: "Crescente", desc: "A seiva sobe para os ramos. Ideal para plantar hortaliças de folhas e frutos." },
        { max: 10, icon: "🌓", name: "Quarto Crescente", desc: "Período favorável para o crescimento rápido de hortaliças." },
        { max: 17, icon: "🌕", name: "Cheia", desc: "Energia máxima! Melhor momento para colher plantas medicinais." },
        { max: 24, icon: "🌗", name: "Quarto Minguante", desc: "A energia desce para as raízes. Período de controle de pragas." },
        { max: 30, icon: "🌘", name: "Minguante", desc: "Fase de descanso e combate a insetos. Bom para colher sementes." }
    ];

    const phase_data = lunarPhases.find(p => res < p.max) || lunarPhases[0];

    const widget = document.getElementById('lunar-widget');
    if (widget) widget.textContent = phase_data.icon;

    const lunarBtn = document.getElementById('lunar-btn');
    if (lunarBtn) {
        lunarBtn.addEventListener('click', () => {
            const details = document.getElementById('lunar-details');
            if (details) {
                details.innerHTML = `
                    <div class="text-center p-4">
                        <div class="text-6xl mb-4">${phase_data.icon}</div>
                        <h4 class="font-bold text-green-800 text-xl">Lua ${phase_data.name}</h4>
                        <p class="text-gray-600 mt-2 text-sm">${phase_data.desc}</p>
                        <div class="mt-4 p-3 bg-green-50 rounded-lg text-[10px] text-green-700 uppercase font-bold">
                            Guia de Plantio - Teresina
                        </div>
                    </div>
                `;
            }
            window.openModal('lunar-modal');
        }, { once: false });
    }
}

// ==================== CLIMA (CON CACHÉ Y FALLBACK) ====================

async function getWeatherWithCache() {
    const now = Date.now();

    if (weatherCache && (now - weatherCacheTime) < WEATHER_CACHE_TTL) {
        return weatherCache;
    }

    try {
        const response = await fetch(
            `https://api.open-meteo.com/v1/forecast?latitude=-5.0892&longitude=-42.8016&current=temperature_2m,relative_humidity_2m&daily=temperature_2m_max,temperature_2m_min,precipitation_probability_max&timezone=auto`,
            { signal: AbortSignal.timeout(5000) }
        );

        if (!response.ok) throw new Error(`HTTP ${response.status}`);

        const data = await response.json();
        weatherCache = data;
        weatherCacheTime = now;
        return data;
    } catch (error) {
        console.warn("Error ao carregar clima:", error);
        return null;
    }
}

async function getWeather() {
    try {
        const data = await getWeatherWithCache();

        if (!data?.current) {
            showWeatherError();
            return;
        }

        const widget = document.getElementById('rain-widget');
        if (widget) {
            widget.textContent = `${Math.round(data.current.temperature_2m)}°C`;
        }

        const rainDetails = document.getElementById('rain-details');
        if (rainDetails && data.daily) {
            let html = "";
            for (let i = 0; i < 5; i++) {
                const day = new Date(data.daily.time[i] + 'T00:00').toLocaleDateString('pt-BR', {
                    weekday: 'short',
                    day: 'numeric'
                });
                html += `
                    <div class="flex justify-between items-center p-3 border-b border-gray-50">
                        <span class="text-xs font-bold text-gray-600 w-20">${day}</span>
                        <span class="text-xs text-blue-500 font-semibold">
                            <i class="fa-solid fa-droplet mr-1"></i>${data.daily.precipitation_probability_max[i]}%
                        </span>
                        <span class="text-xs font-bold text-gray-800">
                            ${Math.round(data.daily.temperature_2m_min[i])}° / ${Math.round(data.daily.temperature_2m_max[i])}°
                        </span>
                    </div>
                `;
            }
            rainDetails.innerHTML = html;
        }
    } catch (error) {
        console.error("Erro ao processar clima:", error);
        showWeatherError();
    }
}

function showWeatherError() {
    const widget = document.getElementById('rain-widget');
    if (widget) widget.textContent = "--°C";
}

// ==================== FILTROS Y BÚSQUEDA ====================

/**
 * Filtra hortas por nombre o barrio
 */
function filterHortasByTerm(term) {
    if (!term) {
        renderHortas(allHortas);
        return;
    }

    const termLower = term.toLowerCase();
    const filtered = allHortas.filter(h =>
        h.horta.toLowerCase().includes(termLower) ||
        h.bairro.toLowerCase().includes(termLower) ||
        h.id.toString().includes(termLower)
    );

    renderHortas(filtered);
}

/**
 * Busca hortas por plantas
 */
function searchByPlant(term) {
    const searchResults = document.getElementById('search-results');
    if (!searchResults) return;

    term = term.toLowerCase();

    if (term.length < 2) {
        searchResults.innerHTML = "";
        searchResults.classList.add('hidden');
        return;
    }

    // Usar índice de plantas para búsqueda rápida
    const matchingHortaIds = new Set();

    // Iterar sobre plantas que comienzan con el término
    for (const [plant, hortaIds] of plantIndex.entries()) {
        if (plant.includes(term)) {
            hortaIds.forEach(id => matchingHortaIds.add(id));
        }
    }

    const matches = Array.from(matchingHortaIds)
        .map(id => allHortas.find(h => h.id_internal === id))
        .filter(Boolean)
        .slice(0, 8); // Limitar a 8 resultados

    if (matches.length > 0) {
        searchResults.innerHTML = "";
        matches.forEach(match => {
            const div = document.createElement('div');
            div.className = "search-item p-3 hover:bg-green-50 rounded-xl cursor-pointer transition-all border-b border-gray-50 last:border-none";
            div.innerHTML = `
                <div class="text-xs font-bold text-green-800">${match.horta}</div>
                <div class="text-[10px] text-gray-500 uppercase">${match.bairro}</div>
            `;
            div.addEventListener('click', () => {
                focusHorta(match.id_internal, true);
                document.getElementById('plant-search').value = "";
                searchResults.classList.add('hidden');
            });
            searchResults.appendChild(div);
        });
        searchResults.classList.remove('hidden');
    } else {
        searchResults.innerHTML = `<div class="p-3 text-[10px] text-gray-400">Nenhuma horta encontrada</div>`;
        searchResults.classList.remove('hidden');
    }
}

function setupFilters() {
    // Filtro de hortas con debounce
    const horta_filter = document.getElementById('horta-filter');
    if (horta_filter) {
        const debouncedFilter = debounce((e) => {
            filterHortasByTerm(e.target.value);
        }, 250);

        horta_filter.addEventListener('input', debouncedFilter);
    }

    // Búsqueda de plantas con debounce
    const plantSearch = document.getElementById('plant-search');
    if (plantSearch) {
        const debouncedSearch = debounce((e) => {
            searchByPlant(e.target.value);
        }, 250);

        plantSearch.addEventListener('input', debouncedSearch);

        // Cerrar resultados al hacer click fuera
        document.addEventListener('click', (e) => {
            const searchResults = document.getElementById('search-results');
            if (searchResults && !plantSearch.contains(e.target) && !searchResults.contains(e.target)) {
                searchResults.classList.add('hidden');
            }
        });
    }

    // Event listeners para modales
    const rainBtn = document.getElementById('rain-btn');
    if (rainBtn) {
        rainBtn.addEventListener('click', () => window.openModal('rain-modal'));
    }
}

// ==================== INICIALIZACIÓN ====================

window.addEventListener('load', () => {
    initMap();
    loadHortas();
    initLunarCalendar();
    getWeather();
    setupFilters();

    // Re-cargar clima cada 30 minutos
    setInterval(getWeather, 1800000);
});

// Cleanup en beforeunload
window.addEventListener('beforeunload', () => {
    if (map) {
        map.remove();
    }
});
