
document.addEventListener('DOMContentLoaded', () => {

    // --- STATE VARIABLES ---
    let coordinates = { lat: parseFloat(localStorage.getItem('savedLat')) || 18.5204, lng: parseFloat(localStorage.getItem('savedLng')) || 73.8567 }; // Default: Pune
    let prayerTimesRaw = {};
    let nextPrayerName = '';
    let isAzaanPlaying = false;
    let allHadiths = []; // For search
    let countdownInterval = null;
    let lastTriggeredPrayerTime = '';
    // Ramadan State
    let ramadanUseCoords = false;
    let ramadanLat = 0;
    let ramadanLng = 0;
    let globalCity = localStorage.getItem('savedCity') || "Hyderabad";
    let globalCountry = localStorage.getItem('savedCountry') || "India";

    // Quran State
    let currentReciter = localStorage.getItem('quranReciter') || 'ar.alafasy';
    let currentAudioMode = localStorage.getItem('quranAudioMode') || 'ar-only';
    let currentViewMode = localStorage.getItem('quranViewMode') || 'verse';
    let quranFontSize = parseInt(localStorage.getItem('quranFontSize') || '28');

    // Helper: Convert number to Arabic Numeral
    function toArabicNumeral(n) {
        return n.toString().replace(/\d/g, d => '٠١٢٣٤٥٦٧٨٩'[d]);
    }
    let togglesState = {
        arabic: localStorage.getItem('quranShowArabic') !== 'false',
        transliteration: localStorage.getItem('quranShowTransliteration') !== 'false',
        english: localStorage.getItem('quranShowEnglish') !== 'false',
        urdu: localStorage.getItem('quranShowUrdu') !== 'false',
        hinglish: localStorage.getItem('quranShowHinglish') !== 'false'
    };

    // --- DOM ELEMENTS ---
    const navLinks = document.querySelectorAll('.nav-link');
    const sections = document.querySelectorAll('.view-section');
    const cityInput = document.getElementById('prayer-city-input');
    const searchBtn = document.getElementById('portal-search-btn');
    const autoLocBtn = document.getElementById('update-location-btn');
    const searchInput = document.getElementById('hadith-search');
    const themeBtn = document.getElementById('theme-toggle');
    const quranModal = document.getElementById('quran-modal');
    const audioPlayer = document.getElementById('quran-audio');
    window.updateMasterDates = function() {};
    
    // Init Theme
    if (localStorage.getItem('portal_theme') === 'dark' || localStorage.getItem('theme') === 'dark') {
        document.body.classList.add('dark');
        if (themeBtn) themeBtn.innerHTML = '<i class="fas fa-sun text-xs text-yellow-400"></i>';
    }


    // --- NAVIGATION & MODAL LOGIC ---
    let currentView = 'view-dashboard';

    function navigateToView(targetId, updateHistory = true) {
        if (!targetId) return;
        currentView = targetId;

        // Target Section logic
        sections.forEach(sec => sec.classList.add('hidden'));
        const targetSec = document.getElementById(targetId);
        if (targetSec) targetSec.classList.remove('hidden');

        // Scroll to top of main area
        const mainScroll = document.getElementById('main-scroll-area');
        if (mainScroll) mainScroll.scrollTop = 0;

        // Close any lingering modals when navigating views
        closeAllModals(false);

        // Update nav links styling
        navLinks.forEach(l => {
            const linkTarget = l.getAttribute('data-target');
            const icon = l.querySelector('i');
            const isMatch = linkTarget === targetId;

            if (isMatch) {
                l.classList.add('active', 'bg-[var(--pearl-card)]/10', 'border-[var(--gold)]');
                l.classList.remove('border-transparent');
                if (icon) {
                    icon.classList.add('text-[var(--gold)]');
                    icon.classList.remove('text-[var(--gold)]/80');
                }
            } else {
                l.classList.remove('active', 'bg-[var(--pearl-card)]/10', 'border-[var(--gold)]');
                l.classList.add('border-transparent');
                if (icon) {
                    icon.classList.remove('text-[var(--gold)]');
                    icon.classList.add('text-[var(--gold)]/80');
                }
            }
        });

        // Specific view callbacks
        if (targetId === 'view-names') loadNames();

        // Manage Browser History
        if (updateHistory) {
            history.pushState({ targetId, modalId: null }, "", `#${targetId}`);
        }
    }

    function closeAllModals(updateHistory = true) {
        const modals = ['fazilat-modal', 'quran-modal'];
        modals.forEach(id => {
            const m = document.getElementById(id);
            if (m) {
                m.classList.add('hidden');
                m.classList.remove('flex');
                if (id === 'quran-modal') m.style.display = 'none';
            }
        });
        if (updateHistory && history.state && history.state.modalId) {
            history.back();
        }
    }

    // Exported for use in inline HTML
    window.closePortalModal = closeAllModals;

    // CLICK HANDLERS
    navLinks.forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            const targetId = link.getAttribute('data-target');
            navigateToView(targetId);
        });
    });

    // BACK/FORWARD NAVIGATION HANDLER
    window.addEventListener('popstate', (e) => {
        if (e.state) {
            if (e.state.modalId) {
                // Should show modal
                if (e.state.modalId === 'fazilat-modal') {
                    // Note: opening without state push to avoid loops
                    const m = document.getElementById('fazilat-modal');
                    if (m) { m.classList.remove('hidden'); m.classList.add('flex'); }
                } else if (e.state.modalId === 'quran-modal') {
                    if (quranModal) quranModal.style.display = 'flex';
                }
            } else {
                // No modal in this state, close all
                closeAllModals(false);
            }

            if (e.state.targetId) {
                navigateToView(e.state.targetId, false);
            }
        } else {
            // Default to dashboard if no state (e.g. back to start)
            navigateToView('view-dashboard', false);
        }
    });

    // INITIAL STATE HANDLING
    const hash = window.location.hash.replace('#', '');
    if (hash && document.getElementById(hash)) {
        navigateToView(hash, false);
    } else {
        // Record initial state for back button to work correctly
        history.replaceState({ targetId: 'view-dashboard', modalId: null }, "", "#view-dashboard");
    }

    // --- ATMOSPHERIC WEATHER ---

    // --- ATMOSPHERIC WEATHER ---
    async function fetchAtmosphere(lat, lng) {
        try {
            console.log(`Fetching weather: ${lat}, ${lng}`);
            const res = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&current_weather=true`);
            const data = await res.json();
            const code = data.current_weather.weathercode;
            console.log(`Weather Code: ${code}`);

            document.body.classList.remove('weather-clear', 'weather-clouds', 'weather-rain', 'weather-snow');

            let theme = 'weather-clear'; // Default
            let icon = '☀️';

            if (code <= 3) { theme = 'weather-clear'; icon = '☀️'; }
            else if (code <= 48) { theme = 'weather-clouds'; icon = '☁️'; }
            else if (code <= 67 || code >= 80) { theme = 'weather-rain'; icon = '🌧️'; }
            else if (code >= 71) { theme = 'weather-snow'; icon = '❄️'; }

            document.body.classList.add(theme);

            // Visual Confirmation in UI
            const locLabel = document.getElementById('portal-location-label');
            if (locLabel) {
                const currentText = locLabel.textContent.split(' • ')[0]; // Keep city
                locLabel.innerHTML = `${currentText} • <span class="text-sm font-normal">${icon} ${theme.replace('weather-', '').toUpperCase()}</span>`;
            }

        } catch (e) {
            console.warn("Atmosphere update failed", e);
            // Fallback
            document.body.classList.add('weather-clear');
        }
    }

    // --- REVERSE GEOCODE: Convert lat/lng to city/country ---
    async function reverseGeocode(lat, lng) {
        try {
            const res = await fetch(`https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${lat}&longitude=${lng}&localityLanguage=en`);
            const data = await res.json();
            const city = data.city || data.locality || data.principalSubdivision || 'Unknown';
            const country = data.countryName || 'Unknown';
            return { city, country };
        } catch (e) {
            console.warn('Reverse geocode failed:', e);
            return null;
        }
    }

    // --- UPDATE DROPDOWNS TO MATCH DETECTED LOCATION ---
    function updateDropdownsToMatch(city, country) {
        const countrySelect = document.getElementById('prayer-country-select');
        const citySelect = document.getElementById('prayer-city-select');
        if (countrySelect) {
            // Try to match country in dropdown
            const countryOption = Array.from(countrySelect.options).find(opt => opt.value.toLowerCase() === country.toLowerCase());
            if (countryOption) {
                countrySelect.value = countryOption.value;
                populateCities(countryOption.value, city);
            }
        }
    }

    async function fetchPrayers(lat = null, lng = null, city = null, country = null) {
        const method = localStorage.getItem('prayerCalculationMethod') || '1';
        const school = localStorage.getItem('prayerJuristicSchool') || '0';
        
        let url = '';
        if (lat && lng) {
            url = `https://api.aladhan.com/v1/timings?latitude=${lat}&longitude=${lng}&method=${method}&school=${school}`;
            coordinates = { lat, lng };
            fetchAtmosphere(lat, lng);
            
            // Reverse geocode to get city/country name
            const geo = await reverseGeocode(lat, lng);
            if (geo) {
                document.getElementById('portal-location-label').textContent = `${geo.city}, ${geo.country}`;
                globalCity = geo.city;
                globalCountry = geo.country;
                localStorage.setItem('savedCity', geo.city);
                localStorage.setItem('savedCountry', geo.country);
                updateDropdownsToMatch(geo.city, geo.country);
            } else {
                document.getElementById('portal-location-label').textContent = `${lat.toFixed(2)}, ${lng.toFixed(2)}`;
            }
            
            localStorage.setItem('savedLat', lat);
            localStorage.setItem('savedLng', lng);
        } else {
            const c = city || localStorage.getItem('savedCity') || "Delhi";
            const co = country || localStorage.getItem('savedCountry') || "India";
            url = `https://api.aladhan.com/v1/timingsByCity?city=${c}&country=${co}&method=${method}&school=${school}`;
            document.getElementById('portal-location-label').textContent = `${c}, ${co}`;
            if (city) {
                localStorage.setItem('savedCity', c);
                localStorage.setItem('savedCountry', co);
                localStorage.removeItem('savedLat');
                localStorage.removeItem('savedLng');
            }
        }

        try {
            const res = await fetch(url);
            const data = await res.json();

            // Coordinate Update for Qibla
            if (!lat && data.data && data.data.meta) {
                coordinates = { lat: data.data.meta.latitude, lng: data.data.meta.longitude };
                fetchAtmosphere(data.data.meta.latitude, data.data.meta.longitude);
                if (typeof initQibla === 'function') initQibla();
            }

            if (data.code === 200) {
                const rawTimings = data.data.timings;
                
                // Get Offsets
                const offsetFajr = parseInt(localStorage.getItem('offset-fajr') || 0);
                const offsetSunrise = parseInt(localStorage.getItem('offset-sunrise') || 0);
                const offsetDhuhr = parseInt(localStorage.getItem('offset-dhuhr') || 0);
                const offsetAsr = parseInt(localStorage.getItem('offset-asr') || 0);
                const offsetMaghrib = parseInt(localStorage.getItem('offset-maghrib') || 0);
                const offsetIsha = parseInt(localStorage.getItem('offset-isha') || 0);
                
                const applyOffset = (timeStr, offsetMins) => {
                    if (!timeStr || !offsetMins) return timeStr;
                    const [hh, mm] = timeStr.split(':').map(Number);
                    const d = new Date();
                    d.setHours(hh, mm + offsetMins);
                    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
                };

                prayerTimesRaw = {
                    Fajr: applyOffset(rawTimings.Fajr, offsetFajr),
                    Sunrise: applyOffset(rawTimings.Sunrise, offsetSunrise),
                    Dhuhr: applyOffset(rawTimings.Dhuhr, offsetDhuhr),
                    Asr: applyOffset(rawTimings.Asr, offsetAsr),
                    Maghrib: applyOffset(rawTimings.Maghrib, offsetMaghrib),
                    Isha: applyOffset(rawTimings.Isha, offsetIsha)
                };

                renderPrayerGrid(prayerTimesRaw);
                renderPrayerGuide(prayerTimesRaw);
                updateNextPrayer();
                
                if (typeof initQibla === 'function') initQibla();
            }
        } catch (e) { console.error("Prayer fetch failed", e); }
    }

    // Nafil Data & Virtue Logic
    // Prayer Data & Virtue Logic
    window.PRAYER_INFO = {
        // Farz
        'Fajr': {
            hadith: "Whoever prays the dawn prayer (Fajr) is under the protection of Allah.",
            ref: "Sahih Muslim",
            icon: "fa-cloud-sun"
        },
        'Dhuhr': {
            hadith: "This is an hour when the gates of heaven are opened, and I love that a righteous deed should rise up for me in it.",
            ref: "Jami At-Tirmidhi",
            icon: "fa-sun"
        },
        'Asr': {
            hadith: "Whoever prays the two cool prayers (Asr and Fajr) will enter Paradise.",
            ref: "Sahih Al-Bukhari",
            icon: "fa-cloud-sun-rain"
        },
        'Maghrib': {
            hadith: "My Ummah will continue to be upon good (Fitrah) as long as they hasten the Maghrib prayer.",
            ref: "Sunan Abu Dawud",
            icon: "fa-moon"
        },
        'Isha': {
            hadith: "Whoever prays Isha in congregation, it is as if he has spent half the night in prayer.",
            ref: "Sahih Muslim",
            icon: "fa-star"
        },
        // Nafil
        'Tahajjud': {
            hadith: "The best prayer after the obligatory prayers is the night prayer.",
            ref: "Sahih Muslim",
            icon: "fa-cloud-moon"
        },
        'Ishraq': {
            hadith: "Whoever prays Fajr in congregation, then sits remembering Allah until sunrise, then prays two rak'ahs, will get the reward of a complete Hajj and Umrah.",
            ref: "Jami At-Tirmidhi",
            icon: "fa-sun"
        },
        'Chasht (Duha)': {
            hadith: "Charity is due upon every joint of the people for every day upon which the sun rises... and two rak'ahs which one prays in the Duha suffices for that.",
            ref: "Sahih Muslim",
            icon: "fa-sun"
        },
        'Awwabin': {
            hadith: "Whoever prays six rak'ahs after Maghrib without speaking ill between them, it is equivalent to the worship of twelve years.",
            ref: "Jami At-Tirmidhi",
            icon: "fa-moon"
        }
    };

    window.openFazilat = function (name) {
        const info = window.PRAYER_INFO[name];
        if (!info) return;
        document.getElementById('fazilat-title').textContent = name;
        document.getElementById('fazilat-text').textContent = `"${info.hadith}"`;
        document.getElementById('fazilat-ref').textContent = `— ${info.ref}`;

        const iconEl = document.getElementById('fazilat-icon');
        iconEl.className = `fas ${info.icon}`;

        const modal = document.getElementById('fazilat-modal');
        modal.classList.remove('hidden');
        modal.classList.add('flex');

        // History API
        history.pushState({ targetId: currentView, modalId: 'fazilat-modal' }, "", "#fazilat");
    };

    function renderPrayerGuide(timings) {
        const farzGrid = document.getElementById('farz-guide-grid');
        const nafilGrid = document.getElementById('nafil-guide-grid');
        if (!farzGrid) return;

        // Helpers
        const addMins = (t, m) => {
            if (!t) return '--:--';
            const [hh, mm] = t.split(':').map(Number);
            const d = new Date(); d.setHours(hh, mm + m);
            return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
        };
        const getMidpoint = (t1, t2) => {
            if (!t1 || !t2) return '--:--';
            const [h1, m1] = t1.split(':').map(Number);
            const [h2, m2] = t2.split(':').map(Number);
            const min1 = h1 * 60 + m1;
            const min2 = h2 * 60 + m2;
            const mid = Math.floor((min1 + min2) / 2);
            const h = Math.floor(mid / 60);
            const m = mid % 60;
            return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
        };
        const fmt = (t) => t ? formatTo12Hour(t) : '--:--';

        // -- CALCULATIONS --
        // Farz
        const farzData = [
            { name: 'Fajr', time: `${fmt(timings.Fajr)} - ${fmt(timings.Sunrise)}`, rakat: '2 Sunnah, 2 Farz', icon: 'fa-cloud-sun' },
            { name: 'Dhuhr', time: `${fmt(timings.Dhuhr)} - ${fmt(timings.Asr)}`, rakat: '4 Sunnah, 4 Farz, 2 Sunnah, 2 Nafl', icon: 'fa-sun' },
            { name: 'Asr', time: `${fmt(timings.Asr)} - ${fmt(timings.Maghrib)}`, rakat: '4 Sunnah (Ghair Muakkada), 4 Farz', icon: 'fa-cloud-sun-rain' },
            { name: 'Maghrib', time: `${fmt(timings.Maghrib)} - ${addMins(timings.Maghrib, 80)}`, rakat: '3 Farz, 2 Sunnah, 2 Nafl', icon: 'fa-moon' },
            { name: 'Isha', time: `${fmt(timings.Isha)} - ${fmt(timings.Fajr)}`, rakat: '4 Sunnah, 4 Farz, 2 Sunnah, 2 Nafl, 3 Witr, 2 Nafl', icon: 'fa-star' }
        ];

        // Nafil
        const ishraqStart = addMins(timings.Sunrise, 15);
        const chashtStart = addMins(timings.Sunrise, 20);
        const chashtEnd = addMins(timings.Dhuhr, -15);
        const chashtMid = getMidpoint(chashtStart, chashtEnd);

        const awwabinStart = addMins(timings.Maghrib, 20);
        const tahajjudStart = timings.Lastthird || timings.Midnight;
        const tahajjudEnd = timings.Fajr;

        const nafilData = [
            {
                name: 'Tahajjud',
                time: `${fmt(tahajjudStart)} - ${fmt(tahajjudEnd)}`,
                rakat: '2 - 12 (Sets of 2)',
                desc: 'The most virtuous Nafil prayer. Recite Quran extensively.',
                icon: 'fa-cloud-moon',
                badge: 'Best Time'
            },
            {
                name: 'Ishraq',
                time: `Starts ${fmt(ishraqStart)}`,
                rakat: '2 or 4',
                desc: 'Approx 15 mins after Sunrise.',
                icon: 'fa-sun',
                badge: 'Sunrise + 15m'
            },
            {
                name: 'Chasht (Duha)',
                time: `${fmt(chashtStart)} - ${fmt(chashtEnd)}`,
                rakat: '2 - 8 (Sets of 2)',
                desc: `Best time: ~${fmt(chashtMid)} (Midpoint).`,
                icon: 'fa-sun',
                badge: 'Recommended'
            },
            {
                name: 'Awwabin',
                time: `${fmt(awwabinStart)} - ${fmt(timings.Isha)}`,
                rakat: '6 - 20 (Sets of 2)',
                desc: 'After Maghrib Sunnah.',
                icon: 'fa-moon'
            }
        ];

        // RENDER FARZ
        farzGrid.innerHTML = farzData.map(d => `
            <div class="glass p-6 rounded-[40px] border-l-4 border-emerald-500 relative overflow-hidden group hover:-translate-y-1 transition-transform dark:bg-gray-800 cursor-pointer hover:shadow-lg transition-all" onclick="openFazilat('${d.name}')">
                <div class="absolute -right-4 -top-4 opacity-10 text-8xl text-emerald-500"><i class="fas ${d.icon}"></i></div>
                <h3 class="text-2xl font-bold text-[var(--emerald)] mb-1 font-[Cormorant_Garamond] dark:text-white group-hover:underline decoration-emerald-500/50 underline-offset-4 decoration-2">${d.name} <i class="fas fa-info-circle text-xs text-emerald-500 opacity-0 group-hover:opacity-100 transition-opacity ml-2 align-middle"></i></h3>
                <p class="text-sm text-gray-500 font-mono mb-3 dark:text-gray-400">${d.time}</p>
                <div class="p-3 bg-emerald-500/10 rounded-lg border border-emerald-500/20">
                     <p class="text-xs font-bold text-emerald-700 uppercase mb-1 dark:text-emerald-400">Rakats</p>
                     <p class="text-sm font-medium text-gray-800 dark:text-gray-200">${d.rakat}</p>
                </div>
            </div>
        `).join('');

        // RENDER NAFIL
        nafilGrid.innerHTML = nafilData.map(d => `
            <div class="glass p-6 rounded-[40px] border-t-4 border-[var(--gold)] bg-[var(--gold)]/5 relative overflow-hidden group hover:-translate-y-1 transition-transform dark:bg-gray-800 cursor-pointer hover:shadow-lg transition-all" onclick="openFazilat('${d.name}')">
                ${d.badge ? `<div class="absolute top-0 right-0 bg-[var(--gold)] text-white text-[10px] font-bold px-2 py-1 rounded-bl-lg uppercase tracking-wider shadow-sm">${d.badge}</div>` : ''}
                <div class="absolute -right-4 -top-4 opacity-10 text-8xl text-[var(--gold)]"><i class="fas ${d.icon}"></i></div>
                <h3 class="text-2xl font-bold text-[var(--emerald)] mb-1 font-[Cormorant_Garamond] dark:text-[var(--gold)] group-hover:underline decoration-[var(--gold)]/50 underline-offset-4 decoration-2">${d.name} <i class="fas fa-info-circle text-xs text-[var(--gold)] opacity-0 group-hover:opacity-100 transition-opacity ml-2 align-middle"></i></h3>
                <p class="text-xs text-[var(--gold)] uppercase tracking-widest font-bold mb-3">Window</p>
                <div class="text-2xl font-mono font-bold text-gray-800 mb-3 dark:text-gray-200">${d.time}</div>
                <div class="mb-3 p-2 bg-[var(--pearl-card)]/50 rounded border border-[var(--gold)]/20 w-fit backdrop-blur-sm dark:bg-black/20">
                    <span class="text-xs font-bold text-[var(--gold)] uppercase">Rakat:</span> <span class="text-sm font-bold dark:text-white">${d.rakat}</span>
                </div>
                <p class="text-sm text-gray-600 italic leading-relaxed dark:text-gray-400">${d.desc}</p>
            </div>
        `).join('');
    }

    // Auto Location Logic (Detect Location button)
    autoLocBtn?.addEventListener('click', () => {
        if (navigator.geolocation) {
            autoLocBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Detecting...';
            const locLabel = document.getElementById('portal-location-label');
            if (locLabel) locLabel.textContent = 'Detecting location...';
            
            navigator.geolocation.getCurrentPosition(async (pos) => {
                await fetchPrayers(pos.coords.latitude, pos.coords.longitude);
                autoLocBtn.innerHTML = '<i class="fas fa-location-arrow"></i> Detect Location';
                // Also refresh calendar for new location
                setTimeout(() => {
                    if (window.fetchHijriCalendar) window.fetchHijriCalendar();
                }, 300);
            }, async () => {
                // Try IP-based fallback
                try {
                    const res = await fetch('https://api.bigdatacloud.net/data/reverse-geocode-client?localityLanguage=en');
                    const data = await res.json();
                    if (data.latitude && data.longitude) {
                        await fetchPrayers(data.latitude, data.longitude);
                    } else {
                        fetchPrayers(null, null, "Hyderabad", "India");
                    }
                } catch (e) {
                    fetchPrayers(null, null, "Hyderabad", "India");
                }
                autoLocBtn.innerHTML = '<i class="fas fa-location-arrow"></i> Detect Location';
                setTimeout(() => {
                    if (window.fetchHijriCalendar) window.fetchHijriCalendar();
                }, 300);
            }, { enableHighAccuracy: true, timeout: 10000, maximumAge: 300000 });
        }
    });

    // Location API
    let allCountriesData = [];

    async function loadCountriesAndCities() {
        try {
            const res = await fetch('https://countriesnow.space/api/v0.1/countries');
            const data = await res.json();
            if(!data.error) {
                allCountriesData = data.data;
                const countrySelect = document.getElementById('prayer-country-select');
                
                // Populate Countries
                let countryHtml = '<option value="" disabled>Select Country</option>';
                allCountriesData.forEach(c => {
                    const selected = (c.country === "India") ? "selected" : "";
                    countryHtml += `<option value="${c.country}" ${selected}>${c.country}</option>`;
                });
                if (countrySelect) {
                    countrySelect.innerHTML = countryHtml;
                    countrySelect.addEventListener('change', (e) => populateCities(e.target.value));
                }
                
                populateCities("India", "Hyderabad");
            }
        } catch(e) { console.error("Countries API failed", e); }
    }

    function populateCities(countryName, defaultCity = "") {
        const citySelect = document.getElementById('prayer-city-select');
        if (!citySelect) return;
        
        const countryData = allCountriesData.find(c => c.country === countryName);
        if (!countryData) {
            citySelect.innerHTML = '<option value="" disabled selected>Select City</option>';
            return;
        }
        
        let cityHtml = '<option value="" disabled>Select City</option>';
        countryData.cities.forEach(city => {
            const selected = (city === defaultCity) ? "selected" : "";
            cityHtml += `<option value="${city}" ${selected}>${city}</option>`;
        });
        citySelect.innerHTML = cityHtml;
    }

    loadCountriesAndCities();

    // Manual Search
    searchBtn?.addEventListener('click', () => {
        const city = document.getElementById('prayer-city-select')?.value;
        const country = document.getElementById('prayer-country-select')?.value;
        if (city && country) {
            fetchPrayers(null, null, city, country);
            if(window.fetchHijriCalendar) window.fetchHijriCalendar();
        }
    });


    function renderPrayerGrid(timings) {
        const grid = document.getElementById('prayer-times-grid');
        if (!grid) return;

        const isFriday = new Date().getDay() === 5;
        if (isFriday) document.body.classList.add('friday-mode');
        else document.body.classList.remove('friday-mode');

        // Friday Banner Logic
        if (isFriday && !document.getElementById('friday-banner')) {
            const banner = document.createElement('div');
            banner.id = 'friday-banner';
            banner.className = 'col-span-full bg-gradient-to-r from-[var(--emerald)] to-[var(--emerald-deep)] p-6 rounded-[40px] shadow-xl border border-[var(--gold)]/30 mb-6 text-white relative overflow-hidden animate-fade-in-up';
            banner.innerHTML = `
                <div class="absolute top-0 right-0 w-64 h-64 bg-[var(--gold)] opacity-10 rounded-full blur-3xl -mr-20 -mt-20 pointer-events-none"></div>
                <div class="flex flex-col md:flex-row items-center justify-between gap-6 relative z-10">
                    <div class="text-center md:text-left">
                        <h2 class="text-3xl font-[Cormorant_Garamond] font-bold text-[var(--gold)] mb-2">Jumu'ah Mubarak!</h2>
                        <p class="text-sm opacity-90 mb-4 font-light">Don't forget the Sunnah acts of this blessed day.</p>
                        <div class="flex flex-wrap gap-3 justify-center md:justify-start">
                            <span class="px-3 py-1 bg-[var(--pearl-card)]/10 rounded-full text-xs border border-[var(--gold)]/30 flex items-center gap-2 backdrop-blur-md"><i class="fas fa-book-open text-[var(--gold)]"></i> Surah Al-Kahf</span>
                            <span class="px-3 py-1 bg-[var(--pearl-card)]/10 rounded-full text-xs border border-[var(--gold)]/30 flex items-center gap-2 backdrop-blur-md"><i class="fas fa-comment-dots text-[var(--gold)]"></i> Durood</span>
                            <span class="px-3 py-1 bg-[var(--pearl-card)]/10 rounded-full text-xs border border-[var(--gold)]/30 flex items-center gap-2 backdrop-blur-md"><i class="fas fa-hands-praying text-[var(--gold)]"></i> Dua (Hour of Acceptance)</span>
                        </div>
                    </div>
                    <div class="text-center shrink-0">
                         <a href="#" onclick="document.querySelector('[data-target=view-quran]').click(); setTimeout(() => openReader(18, 'Al-Kahf', 'surah'), 500);" class="inline-flex items-center px-6 py-2 bg-[var(--gold)] text-[var(--emerald-deep)] font-bold rounded-full hover:bg-[var(--pearl-card)] transition-all shadow-lg shadow-[var(--gold)]/20 transform hover:-translate-y-1">
                             <i class="fas fa-quran mr-2"></i> Read Kahf
                         </a>
                    </div>
                </div>
            `;
            // Insert before grid. Grid might be in a wrapper. 
            // In index.html, grid is inside a div.
            // I'll prepend to the parent of grid?
            // Actually, inserting it simply BEFORE the grid element is safest.
            grid.parentNode.insertBefore(banner, grid);
        }

        const prayers = [
            { id: 'Fajr', icon: 'fa-cloud-sun' },
            { id: 'Sunrise', icon: 'fa-sun' },
            { id: 'Dhuhr', icon: 'fa-sun', label: isFriday ? "Jumu'ah" : "Dhuhr" },
            { id: 'Asr', icon: 'fa-cloud-sun-rain' },
            { id: 'Maghrib', icon: 'fa-moon' },
            { id: 'Isha', icon: 'fa-star' }
        ];

        grid.innerHTML = prayers.map(p => `
            <div id="card-${p.id}" onclick="openFazilat('${p.id}')" class="glass cursor-pointer p-4 rounded-[40px] text-center border border-white/20 relative group transition-all duration-500 hover:-translate-y-2 dark:bg-gray-800/40 ${p.label === "Jumu'ah" ? 'border-[var(--gold)] shadow-[0_0_20px_rgba(197,160,89,0.15)]' : ''}">
                <div class="absolute -right-6 -top-6 opacity-10 text-7xl text-[var(--gold)] group-hover:rotate-12 transition-transform"><i class="fas ${p.icon}"></i></div>
                <div class="w-10 h-10 mx-auto bg-[var(--gold)]/10 rounded-full flex items-center justify-center text-[var(--gold)] mb-3 group-hover:scale-110 transition-transform shadow-[0_0_15px_rgba(197,160,89,0.2)]">
                    <i class="fas ${p.icon}"></i>
                </div>
                <p class="text-xs font-bold text-gray-500 uppercase tracking-widest mb-1 dark:text-gray-400 ${p.label === "Jumu'ah" ? 'text-[var(--gold)]' : ''}">${p.label || p.id}</p>
                <p class="text-2xl font-[Amiri] font-bold text-gray-800 dark:text-white group-hover:text-[var(--gold)] transition-colors">${formatTo12Hour(timings[p.id])}</p>
            </div>
        `).join('');
    }

    function formatTo12Hour(time24) {
        const [hours, minutes] = time24.split(':');
        const h = parseInt(hours);
        const suffix = h >= 12 ? 'PM' : 'AM';
        const h12 = ((h + 11) % 12 + 1);
        return `${h12}:${minutes} ${suffix}`;
    }

    function updateNextPrayer() {
        const timings = prayerTimesRaw;
        const prayers = ['Fajr', 'Sunrise', 'Dhuhr', 'Asr', 'Maghrib', 'Isha'];

        if (countdownInterval) clearInterval(countdownInterval);
        countdownInterval = setInterval(() => {
            const now = new Date();
            let next = 'Fajr';
            let nextTimeStr = timings.Fajr;
            let minDiff = Infinity;
            const curMins = now.getHours() * 60 + now.getMinutes();
            let found = false;

            for (let p of prayers) {
                const [h, m] = timings[p].split(':');
                const pMins = parseInt(h) * 60 + parseInt(m);
                if (pMins > curMins) {
                    next = p;
                    nextTimeStr = timings[p];
                    found = true;
                    break;
                }
            }
            if (!found) {
                next = 'Fajr';
                nextTimeStr = timings.Fajr;
            }

            // Highlight Logic
            document.querySelectorAll('[id^="card-"]').forEach(el => {
                el.classList.remove('ring-2', 'ring-[var(--gold)]', 'neon-glow');
                if (el.id === `card-${next}`) {
                    el.classList.add('ring-2', 'ring-[var(--gold)]', 'neon-glow');
                }
            });

            document.getElementById('next-prayer-name').textContent = next;

            const [th, tm] = nextTimeStr.split(':');
            const target = new Date();
            target.setHours(th, tm, 0);
            if (!found) target.setDate(target.getDate() + 1);
            const diff = target - now;

            // --- ADHAN ALARM TRIGGER CHECK ---
            const curTimeStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
            const activePrayers = ['Fajr', 'Dhuhr', 'Asr', 'Maghrib', 'Isha'];
            for (let prayer of activePrayers) {
                if (timings[prayer] === curTimeStr) {
                    const lastTriggerKey = `last-triggered-${prayer}-${now.toDateString()}`;
                    if (localStorage.getItem(lastTriggerKey) !== 'true') {
                        localStorage.setItem(lastTriggerKey, 'true');
                        triggerAdhanAlarm(prayer);
                    }
                }
            }

            if (diff > 0) {
                const hrs = Math.floor(diff / 3600000);
                const mins = Math.floor((diff % 3600000) / 60000);
                const secs = Math.floor((diff % 60000) / 1000);
                document.getElementById('countdown').textContent = `${String(hrs).padStart(2, '0')}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
            }
        }, 1000);
    }








    // --- LIBRARY & SEARCH ---
    async function loadLibrary() {
        const view = document.getElementById('library-content');
        if (allHadiths.length > 0) return; // Already loaded

        view.innerHTML = '<div class="text-center py-20"><i class="fas fa-circle-notch fa-spin text-4xl text-[var(--gold)]"></i> <p class="mt-4">Loading Knowledge Base...</p></div>';

        // Mock Large Data for Searchability
        // In production, fetch this from the JSON endpoint provided
        const mockData = Array.from({ length: 50 }, (_, i) => ({
            id: i + 1,
            text: `Hadith text sample ${i + 1}. Whoever does good is like the one who guides to it. Example text for search functionality.`,
            ref: `Bukhari ${1000 + i}`
        }));
        // Add some real ones
        mockData.unshift(
            { id: 999, text: "The reward of deeds depends upon the intentions and every person will get the reward according to what he has intended.", ref: "Bukhari 1" },
            { id: 998, text: "A Muslim is the one who avoids harming Muslims with his tongue and hands.", ref: "Bukhari 10" },
            { id: 997, text: "None of you will have faith till he wishes for his (Muslim) brother what he likes for himself.", ref: "Bukhari 13" }
        );
        allHadiths = mockData;
        renderHadiths(allHadiths);

        // Init Search Listener
        searchInput?.addEventListener('input', (e) => {
            const term = e.target.value.toLowerCase();
            const filtered = allHadiths.filter(h => h.text.toLowerCase().includes(term) || h.ref.toLowerCase().includes(term));
            renderHadiths(filtered);
        });
    }

    function renderHadiths(list) {
        const view = document.getElementById('library-content');
        if (list.length === 0) {
            view.innerHTML = '<div class="text-center py-10 opacity-50">No Hadiths found matching your search.</div>';
            return;
        }
        view.innerHTML = `
            <div class="grid grid-cols-1 md:grid-cols-2 gap-6 pb-20">
                ${list.map(h => `
                    <div class="bg-[var(--pearl-card)] p-8 rounded-tr-3xl rounded-bl-3xl shadow-md border border-[var(--gold)]/20 hover:shadow-lg transition-all relative dark:bg-gray-800 dark:border-gray-700">
                        <i class="fas fa-quote-right absolute top-4 right-4 text-[var(--gold)]/20 text-4xl"></i>
                        <h4 class="font-bold text-[var(--emerald)] mb-4 uppercase tracking-widest text-xs dark:text-[var(--gold)]">Hadith #${h.id}</h4>
                        <p class="text-xl font-serif text-gray-800 leading-relaxed mb-4 dark:text-gray-200">"${h.text}"</p>
                        <div class="text-sm font-bold text-[var(--gold)] border-t border-[var(--gold)]/20 pt-4 flex justify-between items-center">
                            <span>Reference: ${h.ref}</span>
                            <button class="text-gray-400 hover:text-[var(--emerald)]"><i class="fas fa-share-alt"></i></button>
                        </div>
                    </div>
                `).join('')}
            </div>
        `;
    }

    // --- DAILY VERSE MODAL ---
    const dailyVerses = [
        { t: "Indeed, with hardship [will be] ease.", r: "Surah Ash-Sharh 94:6" },
        { t: "So remember Me; I will remember you.", r: "Surah Al-Baqarah 2:152" },
        { t: "And He is with you wherever you are.", r: "Surah Al-Hadid 57:4" }
    ];
    function showDailyVerse() {
        const verse = dailyVerses[Math.floor(Math.random() * dailyVerses.length)];
        const modal = document.createElement('div');
        modal.className = 'fixed inset-0 z-[60] flex items-center justify-center bg-black/80 backdrop-blur-sm opacity-0 transition-opacity duration-700';
        modal.innerHTML = `
            <div class="bg-[var(--pearl-card)] rounded-[40px] max-w-lg w-full p-10 text-center relative transform scale-90 transition-transform duration-500 shadow-2xl border-4 border-[var(--gold)]/30 dark:bg-gray-900 border-gray-700">
                <button onclick="this.closest('.fixed').remove()" class="absolute top-4 right-4 text-gray-400 hover:text-red-500"><i class="fas fa-times text-xl"></i></button>
                <div class="w-16 h-1 bg-[var(--gold)] mx-auto mb-6 rounded-full"></div>
                <h3 class="text-gray-500 uppercase tracking-widest text-xs font-bold mb-4 dark:text-gray-400">Verse of the Moment</h3>
                <p class="text-3xl font-[Cormorant_Garamond] font-bold text-[var(--emerald)] mb-6 leading-tight dark:text-white">"${verse.t}"</p>
                <p class="text-[var(--gold)] font-semibold font-serif italic">— ${verse.r}</p>
                <button onclick="this.closest('.fixed').remove()" class="mt-8 px-8 py-3 bg-[var(--emerald)] text-white rounded-full font-bold hover:bg-[var(--emerald)] transition-colors shadow-lg">Bismillah</button>
            </div>
        `;
        document.body.appendChild(modal);
        requestAnimationFrame(() => {
            modal.classList.remove('opacity-0');
            modal.querySelector('div').classList.remove('scale-90');
            modal.querySelector('div').classList.add('scale-100');
        });
    }

    // --- OTHER LOGIC (QURAN, NAMES, DUAS) ---
    // (Preserved from previous, just re-rendering to ensure scope)
    let currentPlaylist = [];
    let currentAudioIndex = 0;

    // Quran Directory Logic
    let currentDirType = 'surah';

    window.switchQuranTab = function (type) {
        currentDirType = type;
        const btnSurah = document.getElementById('tab-surah-btn');
        const btnPara = document.getElementById('tab-para-btn');
        if (btnSurah) btnSurah.className = type === 'surah' ? "text-lg font-bold px-6 py-2 text-[var(--emerald)] border-b-2 border-[var(--emerald)] transition-all" : "text-lg font-bold px-6 py-2 text-gray-400 hover:text-[var(--emerald)] border-b-2 border-transparent hover:border-[var(--emerald)]/30 transition-all";
        if (btnPara) btnPara.className = type === 'para' ? "text-lg font-bold px-6 py-2 text-[var(--emerald)] border-b-2 border-[var(--emerald)] transition-all" : "text-lg font-bold px-6 py-2 text-gray-400 hover:text-[var(--emerald)] border-b-2 border-transparent hover:border-[var(--emerald)]/30 transition-all";
        loadDirectory(type);
    }

    async function loadDirectory(type = 'surah') {
        const grid = document.getElementById('surah-index-grid');
        if (!grid) return;

        grid.innerHTML = '<div class="col-span-full text-center py-10"><i class="fas fa-circle-notch fa-spin text-[var(--gold)] text-2xl"></i></div>';

        if (type === 'surah') {
            try {
                const res = await fetch('https://api.alquran.cloud/v1/surah');
                const data = await res.json();
                grid.innerHTML = data.data.map(s => `
                    <div class="glass-container p-6 rounded-[40px] cursor-pointer hover:bg-[var(--pearl-card)]/50 transition-all hover-card-3d border border-transparent hover:border-[var(--gold)]/30 dark:bg-gray-800 dark:border-gray-700" onclick="openReader(${s.number}, '${s.englishName}', 'surah')">
                         <div class="flex justify-between items-start">
                            <div class="w-10 h-10 rounded-full bg-gradient-to-br from-[var(--emerald)] to-[var(--emerald)] text-white flex items-center justify-center font-bold text-sm mb-3 shadow-lg">${s.number}</div>
                            <div class="text-right text-[var(--emerald)] font-serif text-2xl drop-shadow-sm dark:text-[var(--gold)]">${s.name.replace('سُورَةُ ', '')}</div>
                         </div>
                         <h3 class="font-bold text-xl text-gray-800 dark:text-white">${s.englishName}</h3>
                         <p class="text-sm text-gray-500 dark:text-gray-400">${s.englishNameTranslation}</p>
                    </div>
                `).join('');
                // Sidebar List Update
                const list = document.getElementById('surah-list');
                if (list) list.innerHTML = data.data.map(s => `<div class="cursor-pointer p-2 hover:bg-[var(--pearl-card)]/10 text-xs text-gray-300 hover:text-white" onclick="openReader(${s.number}, '${s.englishName}', 'surah')">${s.number}. ${s.englishName}</div>`).join('');
            } catch (e) { grid.innerHTML = 'Error loading.'; }
        } else {
            // PARA / JUZ (1-30)
            const paras = Array.from({ length: 30 }, (_, i) => i + 1);
            grid.innerHTML = paras.map(p => `
                 <div class="glass-container p-6 rounded-[40px] cursor-pointer hover:bg-[var(--pearl-card)]/50 transition-all hover-card-3d border border-transparent hover:border-[var(--gold)]/30 dark:bg-gray-800 dark:border-gray-700" onclick="openReader(${p}, 'Juz ${p}', 'juz')">
                      <div class="flex justify-between items-start">
                         <div class="w-10 h-10 rounded-full bg-gradient-to-br from-[var(--emerald)] to-[var(--emerald)] text-white flex items-center justify-center font-bold text-sm mb-3 shadow-lg">${p}</div>
                         <div class="text-right text-[var(--emerald)] font-serif text-2xl drop-shadow-sm dark:text-[var(--gold)]">جزء ${p}</div>
                      </div>
                      <h3 class="font-bold text-xl text-gray-800 dark:text-white">Juz ${p}</h3>
                      <p class="text-sm text-gray-500 dark:text-gray-400">Para ${p}</p>
                 </div>
             `).join('');
            // Sidebar List Update for Para? Maybe skip or update.
            const list = document.getElementById('surah-list');
            if (list) list.innerHTML = paras.map(p => `<div class="cursor-pointer p-2 hover:bg-[var(--pearl-card)]/10 text-xs text-gray-300 hover:text-white" onclick="openReader(${p}, 'Juz ${p}', 'juz')">Para ${p}</div>`).join('');
        }
    }

    window.openReader = function (num, name, type = 'surah') {
        if (quranModal) quranModal.style.display = 'flex';
        document.getElementById('reader-title').textContent = type === 'surah' ? `Surah ${name}` : `${name}`;
        fetchQuranContent(num, type);
        // History API
        history.pushState({ targetId: currentView, modalId: 'quran-modal' }, "", "#reader");
    }

    async function fetchQuranContent(num, type = 'surah') {
        const quranContentEl = document.getElementById('quran-content');
        quranContentEl.innerHTML = '<div class="text-center mt-20"><i class="fas fa-circle-notch fa-spin text-4xl text-[var(--gold)]"></i></div>';
        try {
            const endpoint = type === 'juz' ? `juz/${num}` : `surah/${num}`;
            const fetchHinglish = type === 'surah'
                ? fetch(`https://cdn.jsdelivr.net/gh/fawazahmed0/quran-api@1/editions/urd-abulaalamaududi-la/${num}.json`)
                : Promise.resolve({ json: () => ({ chapter: [] }) });

            const [arRes, enRes, trRes, urRes, hiRes] = await Promise.all([
                fetch(`https://api.alquran.cloud/v1/${endpoint}`),
                fetch(`https://api.alquran.cloud/v1/${endpoint}/en.sahih`),
                fetch(`https://api.alquran.cloud/v1/${endpoint}/en.transliteration`),
                fetch(`https://api.alquran.cloud/v1/${endpoint}/ur.jalandhry`),
                fetchHinglish
            ]);

            const arData = await arRes.json();
            const enData = await enRes.json();
            const trData = await trRes.json();
            const urData = await urRes.json();
            const hiData = await hiRes.json();

            window.currentSurahData = arData; // Global Store

            const showArabic = togglesState.arabic ? '' : 'hidden';
            const showTrans = togglesState.transliteration ? '' : 'hidden';
            const showEng = togglesState.english ? '' : 'hidden';
            const showUrdu = togglesState.urdu ? '' : 'hidden';
            const showHinglish = togglesState.hinglish ? '' : 'hidden';

            let bismillahHtml = '';
            // Note: Surah 9 (At-Tawbah) traditionally does not start with Bismillah
            if (type === 'surah' && parseInt(num) !== 9) {
                bismillahHtml = `
                    <div class="text-center py-8 mb-6 border-b border-white/10">
                        <div class="font-[Amiri] text-4xl text-[var(--gold)] drop-shadow-md" style="line-height: 1.5;">بِسْمِ اللَّهِ الرَّحْمَٰنِ الرَّحِيمِ</div>
                        <div class="text-xs text-gray-400 mt-3 font-serif italic tracking-wide">In the name of Allah, the Entirely Merciful, the Especially Merciful.</div>
                    </div>
                `;
            }

            // Sync view mode select
            const viewModeSelect = document.getElementById('quran-view-mode');
            if (viewModeSelect) viewModeSelect.value = currentViewMode;

            // Set up pagination state on window to allow chunked rendering
            window.quranDataState = {
                arData, trData, enData, hiData, urData,
                showArabic, showTrans, showEng, showUrdu, showHinglish,
                currentIndex: 0,
                total: arData.data.ayahs.length,
                quranFontSize
            };

            quranContentEl.innerHTML = bismillahHtml;
            
            const versesContainer = document.createElement('div');
            versesContainer.id = 'quran-verses-container';
            quranContentEl.appendChild(versesContainer);

            const sentinel = document.createElement('div');
            sentinel.id = 'quran-sentinel';
            sentinel.className = 'w-full py-6 text-center';
            sentinel.innerHTML = '<i class="fas fa-circle-notch fa-spin text-2xl text-[var(--gold)] hidden"></i>';
            quranContentEl.appendChild(sentinel);

            // Chunk rendering function
            window.renderQuranBatch = function(batchSize = 20) {
                const state = window.quranDataState;
                if (!state || state.currentIndex >= state.total) return;
                
                const endIndex = Math.min(state.currentIndex + batchSize, state.total);
                let chunkHtml = '';
                
                const isBookMode = currentViewMode === 'book';
                
                const container = document.getElementById('quran-verses-container');
                if (isBookMode) {
                    container.classList.add('text-right', 'font-[Amiri]', 'leading-relaxed', 'text-white', 'drop-shadow-md', 'p-4');
                    container.style.direction = 'rtl';
                    container.style.fontSize = `${state.quranFontSize}px`;
                    container.style.lineHeight = '2.4';
                } else {
                    container.className = '';
                    container.style = '';
                }

                for (let i = state.currentIndex; i < endIndex; i++) {
                    const a = state.arData.data.ayahs[i];
                    
                    if (isBookMode) {
                        // Book Mode Rendering (Continuous Arabic Text)
                        chunkHtml += `
                            <span class="inline hover:bg-[var(--gold)]/20 cursor-pointer rounded px-1 transition-colors" id="ayah-row-${i}" data-index="${i}" onclick="playVerse(${i})">
                                ${a.text} 
                                <span class="text-[var(--gold)] font-mono mx-1 select-none">﴿${toArabicNumeral(a.numberInSurah)}﴾</span>
                            </span>
                        `;
                    } else {
                        // Verse by Verse Rendering
                        chunkHtml += `
                            <div class="ayah-row mb-8 border-b border-white/5 pb-8 group hover:bg-[var(--pearl-card)]/5 p-4 rounded-lg transition-colors cursor-pointer" id="ayah-row-${i}" data-index="${i}" onclick="playVerse(${i})">
                                <div class="flex justify-between items-center mb-4 ${state.showArabic}" data-type="arabic">
                                    <span class="w-8 h-8 rounded-full border border-[var(--gold)] text-[var(--gold)] group-hover:bg-[var(--gold)] group-hover:text-white flex items-center justify-center text-xs ml-4 font-mono transition-colors shrink-0">${a.numberInSurah}</span>
                                    <div class="quran-arabic-text text-right font-[Amiri] leading-relaxed text-white drop-shadow-md" style="direction:rtl; font-size: ${state.quranFontSize}px;">${a.text}</div>
                                </div>
                                
                                <!-- Roman English (Transliteration) -->
                                <div class="quran-transliteration text-[var(--gold)] text-sm mb-2 italic font-serif opacity-90 tracking-wide ${state.showTrans}" data-type="transliteration">${state.trData.data.ayahs[i].text}</div>
                                
                                <!-- English Translation -->
                                <div class="quran-translation text-gray-300 text-lg leading-relaxed mb-3 ${state.showEng}" data-type="english">${state.enData.data.ayahs[i].text}</div>

                                <!-- Hinglish Tarjuma (Roman Urdu) -->
                                <div class="quran-hinglish text-emerald-300 text-lg mb-2 italic font-medium leading-relaxed ${state.showHinglish}" data-type="hinglish" style="font-family: 'Inter', sans-serif;">"${state.hiData.chapter[i]?.text || ''}"</div>
                                
                                <!-- Urdu Script Tarjuma -->
                                <div class="quran-urdu text-emerald-100/90 text-xl font-[Amiri] leading-loose text-right dir-rtl border-t border-white/5 pt-2 mt-2 ${state.showUrdu}" data-type="urdu" style="direction:rtl;">${state.urData.data.ayahs[i].text}</div>
                            </div>
                        `;
                    }
                }
                
                container.insertAdjacentHTML('beforeend', chunkHtml);
                state.currentIndex = endIndex;
                
                if (state.currentIndex >= state.total && window.quranObserver) {
                    window.quranObserver.disconnect();
                    sentinel.remove();
                }
            };

            // Render first batch
            window.renderQuranBatch(20);

            // Set up Infinite Scroll Observer
            if (window.quranObserver) window.quranObserver.disconnect();
            window.quranObserver = new IntersectionObserver((entries) => {
                if (entries[0].isIntersecting) {
                    sentinel.querySelector('i').classList.remove('hidden');
                    // setTimeout to unblock main thread slightly
                    setTimeout(() => {
                        window.renderQuranBatch(20);
                        if(sentinel.parentNode) sentinel.querySelector('i').classList.add('hidden');
                    }, 50);
                }
            }, { rootMargin: '300px' });
            
            window.quranObserver.observe(sentinel);

            // Set up playlist
            regenerateAudioPlaylist();

            // Set details in player bar
            const totalProgressEl = document.getElementById('player-progress-total');
            if (totalProgressEl) totalProgressEl.textContent = arData.data.ayahs.length;
            
            const currentProgressEl = document.getElementById('player-progress-current');
            if (currentProgressEl) currentProgressEl.textContent = 1;
            
            const progressBar = document.getElementById('player-progress-bar');
            if (progressBar) progressBar.style.width = '0%';
            
            const barSurah = document.getElementById('player-bar-surah');
            if (barSurah) barSurah.textContent = `Surah ${arData.data.englishName || 'Al-Quran'} • Ayah 1`;

            if (audioPlayer) {
                audioPlayer.src = currentPlaylist[0].url;
                audioPlayer.onended = () => {
                    currentAudioIndex++;
                    if (currentAudioIndex < currentPlaylist.length) {
                        const nextItem = currentPlaylist[currentAudioIndex];
                        audioPlayer.src = nextItem.url;
                        audioPlayer.play().catch(e => console.warn(e));
                        
                        const currentAyahIndex = nextItem.index;
                        highlightVerse(currentAyahIndex);
                        updatePlayerBarProgress(currentAyahIndex);
                    } else {
                        currentAudioIndex = 0;
                        audioPlayer.src = currentPlaylist[0].url;
                        updatePlayIcon(false);
                    }
                };
            }
        } catch (e) { console.error(e); }
    }

    // Playback Helpers
    window.playVerse = function (index) {
        if (!window.currentSurahData) return;
        if (!currentPlaylist || currentPlaylist.length === 0) {
            regenerateAudioPlaylist();
        }
        
        const playlistIndex = currentPlaylist.findIndex(item => item.index === index);
        if (playlistIndex !== -1) {
            currentAudioIndex = playlistIndex;
        } else {
            currentAudioIndex = 0;
        }

        const player = document.getElementById('quran-audio');
        if (player && currentPlaylist[currentAudioIndex]) {
            player.src = currentPlaylist[currentAudioIndex].url;
            player.play().catch(e => {
                console.warn("Audio play error:", e);
                // Fallback to Web Speech Synthesis if audio fails
                if ('speechSynthesis' in window) {
                    window.speechSynthesis.cancel();
                    const verseData = window.currentSurahData.data.ayahs[index];
                    if (verseData) {
                        const utterance = new SpeechSynthesisUtterance(verseData.text);
                        utterance.lang = 'ar-SA';
                        window.speechSynthesis.speak(utterance);
                    }
                }
            });
            updatePlayIcon(true);
            highlightVerse(index);
            updatePlayerBarProgress(index);
        }
    };

    window.highlightVerse = function (index) {
        const verses = document.querySelectorAll('.ayah-row');
        verses.forEach(d => d.classList.remove('bg-[var(--pearl-card)]/10', 'border-l-4', 'border-[var(--gold)]'));

        if (verses[index]) {
            verses[index].classList.add('bg-[var(--pearl-card)]/10', 'border-l-4', 'border-[var(--gold)]');
            verses[index].scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
    }

    window.playSurahAudio = function (lang) {
        if (!window.currentSurahData) return;
        
        // Temporarily override mode for quick play
        const oldMode = currentAudioMode;
        if (lang === 'ur') currentAudioMode = 'dual-ur';
        else if (lang === 'en') currentAudioMode = 'dual-en';
        
        regenerateAudioPlaylist();
        currentAudioIndex = 0;
        
        const player = document.getElementById('quran-audio');
        if (player) {
            player.src = currentPlaylist[0].url;
            player.play().catch(e => console.warn(e));
            updatePlayIcon(true);
            highlightVerse(0);
            updatePlayerBarProgress(0);
        }
        
        // Restore mode state
        currentAudioMode = oldMode;
    };

    function updatePlayIcon(isPlaying) {
        const headerIcon = document.getElementById('play-icon');
        if (headerIcon) headerIcon.className = isPlaying ? 'fas fa-pause' : 'fas fa-play ml-1';
        
        const barIcon = document.getElementById('player-play-icon');
        if (barIcon) barIcon.className = isPlaying ? 'fas fa-pause' : 'fas fa-play ml-0.5';
    }

    // Playlist generator helper
    function regenerateAudioPlaylist() {
        if (!window.currentSurahData) return;
        
        const arData = window.currentSurahData;
        currentPlaylist = [];
        
        const mode = currentAudioMode;
        const arVoice = currentReciter;
        const urVoice = 'ur.khan';
        const enVoice = 'en.walk';
        
        arData.data.ayahs.forEach((a, index) => {
            const ayahNum = a.number;
            if (mode === 'ar-only') {
                currentPlaylist.push({ type: 'ar', url: `https://cdn.islamic.network/quran/audio/128/${arVoice}/${ayahNum}.mp3`, index });
            } else if (mode === 'ur-only') {
                currentPlaylist.push({ type: 'ur', url: `https://cdn.islamic.network/quran/audio/64/${urVoice}/${ayahNum}.mp3`, index });
            } else if (mode === 'en-only') {
                currentPlaylist.push({ type: 'en', url: `https://cdn.islamic.network/quran/audio/192/${enVoice}/${ayahNum}.mp3`, index });
            } else if (mode === 'dual-ur') {
                currentPlaylist.push({ type: 'ar', url: `https://cdn.islamic.network/quran/audio/128/${arVoice}/${ayahNum}.mp3`, index });
                currentPlaylist.push({ type: 'ur', url: `https://cdn.islamic.network/quran/audio/64/${urVoice}/${ayahNum}.mp3`, index });
            } else if (mode === 'dual-en') {
                currentPlaylist.push({ type: 'ar', url: `https://cdn.islamic.network/quran/audio/128/${arVoice}/${ayahNum}.mp3`, index });
                currentPlaylist.push({ type: 'en', url: `https://cdn.islamic.network/quran/audio/192/${enVoice}/${ayahNum}.mp3`, index });
            }
        });
        
        const barReciter = document.getElementById('player-bar-reciter');
        if (barReciter) {
            const reciterNames = {
                'ar.alafasy': 'Mishary Rashid Alafasy',
                'ar.sudais': 'Abdul Rahman Al-Sudais',
                'ar.mahermuaiqly': 'Maher Al-Muaiqly',
                'ar.saadghamidi': 'Saad Al-Ghamdi',
                'ar.abdulsamad': 'Abdul Basit'
            };
            barReciter.textContent = reciterNames[currentReciter] || 'Mishary Alafasy';
        }
    }

    function updatePlayerBarProgress(ayahIndex) {
        if (!window.currentSurahData) return;
        const total = window.currentSurahData.data.ayahs.length;
        const current = ayahIndex + 1;
        
        const currentProgressEl = document.getElementById('player-progress-current');
        if (currentProgressEl) currentProgressEl.textContent = current;
        
        const progressBar = document.getElementById('player-progress-bar');
        if (progressBar) progressBar.style.width = `${(current / total) * 100}%`;
        
        const barSurah = document.getElementById('player-bar-surah');
        if (barSurah) barSurah.textContent = `Surah ${window.currentSurahData.data.englishName} • Ayah ${current}`;
    }

    // Standard listeners
    document.getElementById('close-quran-btn')?.addEventListener('click', () => {
        if (quranModal) quranModal.style.display = 'none';
        if (audioPlayer) { audioPlayer.pause(); updatePlayIcon(false); }
    });

    // Wire up header dropdowns
    document.getElementById('quran-reciter-select')?.addEventListener('change', (e) => {
        currentReciter = e.target.value;
        localStorage.setItem('quranReciter', currentReciter);
        
        if (window.currentSurahData) {
            const currentItem = currentPlaylist[currentAudioIndex];
            const currentAyah = currentItem ? currentItem.index : 0;
            const wasPlaying = audioPlayer && !audioPlayer.paused;
            
            regenerateAudioPlaylist();
            
            if (wasPlaying) {
                playVerse(currentAyah);
            } else {
                const playlistIndex = currentPlaylist.findIndex(item => item.index === currentAyah);
                if (playlistIndex !== -1) {
                    currentAudioIndex = playlistIndex;
                    audioPlayer.src = currentPlaylist[currentAudioIndex].url;
                }
            }
        }
    });

    document.getElementById('quran-view-mode')?.addEventListener('change', (e) => {
        currentViewMode = e.target.value;
        localStorage.setItem('quranViewMode', currentViewMode);
        
        if (window.currentSurahData && window.quranDataState) {
            // Re-render completely by clearing verses and resetting index
            const versesContainer = document.getElementById('quran-verses-container');
            if (versesContainer) versesContainer.innerHTML = '';
            window.quranDataState.currentIndex = 0;
            
            // Need to recreate observer if it was disconnected
            if (window.quranObserver) window.quranObserver.disconnect();
            
            // Remove old sentinel and add a new one
            let sentinel = document.getElementById('quran-sentinel');
            if (sentinel) sentinel.remove();
            
            sentinel = document.createElement('div');
            sentinel.id = 'quran-sentinel';
            sentinel.className = 'w-full py-6 text-center';
            sentinel.innerHTML = '<i class="fas fa-circle-notch fa-spin text-2xl text-[var(--gold)] hidden"></i>';
            document.getElementById('quran-content').appendChild(sentinel);
            
            window.quranObserver = new IntersectionObserver((entries) => {
                if (entries[0].isIntersecting) {
                    sentinel.querySelector('i').classList.remove('hidden');
                    setTimeout(() => {
                        window.renderQuranBatch(20);
                        if (window.quranDataState.currentIndex >= window.quranDataState.total) {
                            sentinel.querySelector('i').classList.add('hidden');
                        }
                    }, 100); // small delay for smoothness
                }
            });
            window.quranObserver.observe(sentinel);

            window.renderQuranBatch(20);
        }
    });

    document.getElementById('quran-audio-mode')?.addEventListener('change', (e) => {
        currentAudioMode = e.target.value;
        localStorage.setItem('quranAudioMode', currentAudioMode);
        
        if (window.currentSurahData) {
            const currentItem = currentPlaylist[currentAudioIndex];
            const currentAyah = currentItem ? currentItem.index : 0;
            const wasPlaying = audioPlayer && !audioPlayer.paused;
            
            regenerateAudioPlaylist();
            
            if (wasPlaying) {
                playVerse(currentAyah);
            } else {
                const playlistIndex = currentPlaylist.findIndex(item => item.index === currentAyah);
                if (playlistIndex !== -1) {
                    currentAudioIndex = playlistIndex;
                    audioPlayer.src = currentPlaylist[currentAudioIndex].url;
                }
            }
        }
    });

    // Playback bar controls
    document.getElementById('player-play-btn')?.addEventListener('click', () => {
        if (!audioPlayer) return;
        if (audioPlayer.paused) {
            audioPlayer.play().catch(e => console.warn(e));
            updatePlayIcon(true);
        } else {
            audioPlayer.pause();
            updatePlayIcon(false);
        }
    });

    document.getElementById('player-next-btn')?.addEventListener('click', () => {
        if (!currentPlaylist || currentPlaylist.length === 0 || !window.currentSurahData) return;
        const currentItem = currentPlaylist[currentAudioIndex];
        const currentAyah = currentItem ? currentItem.index : 0;
        if (currentAyah < window.currentSurahData.data.ayahs.length - 1) {
            playVerse(currentAyah + 1);
        }
    });

    document.getElementById('player-prev-btn')?.addEventListener('click', () => {
        if (!currentPlaylist || currentPlaylist.length === 0) return;
        const currentItem = currentPlaylist[currentAudioIndex];
        const currentAyah = currentItem ? currentItem.index : 0;
        if (currentAyah > 0) {
            playVerse(currentAyah - 1);
        }
    });

    document.getElementById('quran-volume-slider')?.addEventListener('input', (e) => {
        const vol = parseFloat(e.target.value);
        if (audioPlayer) audioPlayer.volume = vol;
    });

    // Quran display sidebar controls
    document.getElementById('quran-sidebar-toggle-btn')?.addEventListener('click', () => {
        const sidebar = document.getElementById('quran-settings-sidebar');
        if (sidebar) {
            sidebar.classList.toggle('hidden');
        }
    });

    // Font size controls
    const sizeSlider = document.getElementById('quran-font-size');
    const sizeLabel = document.getElementById('font-size-label');
    if (sizeSlider) {
        sizeSlider.value = quranFontSize;
        if (sizeLabel) sizeLabel.textContent = `${quranFontSize}px`;
    }
    sizeSlider?.addEventListener('input', (e) => {
        const size = parseInt(e.target.value);
        quranFontSize = size;
        localStorage.setItem('quranFontSize', size);
        if (sizeLabel) sizeLabel.textContent = `${size}px`;
        document.querySelectorAll('.quran-arabic-text').forEach(el => {
            el.style.fontSize = `${size}px`;
        });
    });

    // Translation toggle checkboxes
    const toggleTypes = ['arabic', 'transliteration', 'english', 'urdu', 'hinglish'];
    toggleTypes.forEach(type => {
        const checkbox = document.getElementById(`toggle-${type}`);
        if (checkbox) {
            checkbox.checked = togglesState[type];
        }
        checkbox?.addEventListener('change', (e) => {
            const isChecked = e.target.checked;
            togglesState[type] = isChecked;
            localStorage.setItem(`quranShow${type.charAt(0).toUpperCase() + type.slice(1)}`, isChecked ? 'true' : 'false');
            
            document.querySelectorAll(`[data-type="${type}"]`).forEach(el => {
                if (isChecked) {
                    el.classList.remove('hidden');
                } else {
                    el.classList.add('hidden');
                }
            });
        });
    });

    // Search in Surah
    document.getElementById('quran-search-input')?.addEventListener('input', (e) => {
        const term = e.target.value.toLowerCase().trim();
        const rows = document.querySelectorAll('#quran-content .ayah-row');
        
        rows.forEach(row => {
            if (!term) {
                row.classList.remove('hidden');
                row.querySelectorAll('.search-highlight').forEach(span => {
                    const parent = span.parentNode;
                    parent.replaceChild(document.createTextNode(span.textContent), span);
                    parent.normalize();
                });
                return;
            }
            
            const textContent = row.textContent.toLowerCase();
            const isMatch = textContent.includes(term);
            
            if (isMatch) {
                row.classList.remove('hidden');
                row.querySelectorAll('.quran-translation, .quran-transliteration, .quran-hinglish, .quran-urdu').forEach(el => {
                    highlightTerm(el, term);
                });
            } else {
                row.classList.add('hidden');
            }
        });
    });

    function highlightTerm(element, term) {
        element.querySelectorAll('.search-highlight').forEach(span => {
            const parent = span.parentNode;
            parent.replaceChild(document.createTextNode(span.textContent), span);
            parent.normalize();
        });
        
        const innerHTML = element.innerHTML;
        const text = element.textContent;
        const index = text.toLowerCase().indexOf(term);
        
        if (index >= 0) {
            const regex = new RegExp(`(${escapeRegExp(term)})`, 'gi');
            element.innerHTML = innerHTML.replace(regex, '<span class="search-highlight bg-[var(--gold)]/30 text-white px-0.5 rounded">$1</span>');
        }
    }
    
    function escapeRegExp(string) {
        return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }

    // --- PRAYER SETTINGS & ADHAN SYSTEM ---
    let adhanAudioInstance = null;
    let testAdhanAudio = null;

    function triggerAdhanAlarm(prayerName) {
        console.log(`Triggering Adhan Alarm for ${prayerName}`);
        
        const shouldPlay = localStorage.getItem('setting-play-adhan') === 'true';
        if (shouldPlay) {
            if (adhanAudioInstance) {
                adhanAudioInstance.pause();
            }
            adhanAudioInstance = new Audio('https://download.quranicaudio.com/adhan/makkah.mp3');
            adhanAudioInstance.volume = parseFloat(localStorage.getItem('setting-adhan-volume') || '0.5');
            adhanAudioInstance.play().catch(e => console.warn("Audio autoplay blocked", e));
        }
        
        const shouldNotify = localStorage.getItem('setting-notify-desktop') === 'true';
        if (shouldNotify && Notification.permission === 'granted') {
            new Notification(`Time for ${prayerName} 🕌`, {
                body: `It is now time for the ${prayerName} prayer. Hayya 'alas-Salah!`,
                icon: 'profile.png'
            });
        }
    }

    document.getElementById('btn-test-adhan')?.addEventListener('click', () => {
        const btn = document.getElementById('btn-test-adhan');
        if (testAdhanAudio && !testAdhanAudio.paused) {
            testAdhanAudio.pause();
            btn.innerHTML = '<i class="fas fa-play"></i> Test Adhan Sound';
        } else {
            if (!testAdhanAudio) {
                testAdhanAudio = new Audio('https://download.quranicaudio.com/adhan/makkah.mp3');
            }
            const volSlider = document.getElementById('setting-adhan-volume');
            testAdhanAudio.volume = volSlider ? parseFloat(volSlider.value) : 0.5;
            btn.innerHTML = '<i class="fas fa-stop"></i> Stop Adhan';
            testAdhanAudio.play().catch(e => {
                window.showToast("Playback failed. Please interact with the page first.", "error");
                btn.innerHTML = '<i class="fas fa-play"></i> Test Adhan Sound';
            });
            testAdhanAudio.onended = () => {
                btn.innerHTML = '<i class="fas fa-play"></i> Test Adhan Sound';
            };
        }
    });
    
    document.getElementById('setting-adhan-volume')?.addEventListener('input', (e) => {
        const vol = parseFloat(e.target.value);
        localStorage.setItem('setting-adhan-volume', vol);
        if (testAdhanAudio) testAdhanAudio.volume = vol;
        if (adhanAudioInstance) adhanAudioInstance.volume = vol;
    });

    document.getElementById('prayer-settings-btn')?.addEventListener('click', () => {
        const modal = document.getElementById('settings-modal');
        if (!modal) return;
        
        document.getElementById('setting-calc-method').value = localStorage.getItem('prayerCalculationMethod') || '1';
        
        const savedSchool = localStorage.getItem('prayerJuristicSchool') || '0';
        document.querySelectorAll('input[name="setting-asr-school"]').forEach(radio => {
            radio.checked = radio.value === savedSchool;
        });
        
        document.getElementById('offset-fajr').value = localStorage.getItem('offset-fajr') || '0';
        document.getElementById('offset-sunrise').value = localStorage.getItem('offset-sunrise') || '0';
        document.getElementById('offset-dhuhr').value = localStorage.getItem('offset-dhuhr') || '0';
        document.getElementById('offset-asr').value = localStorage.getItem('offset-asr') || '0';
        document.getElementById('offset-maghrib').value = localStorage.getItem('offset-maghrib') || '0';
        document.getElementById('offset-isha').value = localStorage.getItem('offset-isha') || '0';
        
        document.getElementById('setting-play-adhan').checked = localStorage.getItem('setting-play-adhan') === 'true';
        document.getElementById('setting-notify-desktop').checked = localStorage.getItem('setting-notify-desktop') === 'true';
        document.getElementById('setting-adhan-volume').value = localStorage.getItem('setting-adhan-volume') || '0.5';
        
        modal.classList.remove('hidden');
        modal.classList.add('flex');
    });
    
    document.getElementById('setting-notify-desktop')?.addEventListener('change', (e) => {
        if (e.target.checked && Notification.permission !== 'granted') {
            Notification.requestPermission().then(permission => {
                if (permission !== 'granted') {
                    e.target.checked = false;
                    window.showToast("Notification permission denied.", "error");
                }
            });
        }
    });

    document.getElementById('btn-save-settings')?.addEventListener('click', () => {
        const calcMethod = document.getElementById('setting-calc-method').value;
        localStorage.setItem('prayerCalculationMethod', calcMethod);
        
        let school = '0';
        document.querySelectorAll('input[name="setting-asr-school"]').forEach(radio => {
            if (radio.checked) school = radio.value;
        });
        localStorage.setItem('prayerJuristicSchool', school);
        
        localStorage.setItem('offset-fajr', document.getElementById('offset-fajr').value || '0');
        localStorage.setItem('offset-sunrise', document.getElementById('offset-sunrise').value || '0');
        localStorage.setItem('offset-dhuhr', document.getElementById('offset-dhuhr').value || '0');
        localStorage.setItem('offset-asr', document.getElementById('offset-asr').value || '0');
        localStorage.setItem('offset-maghrib', document.getElementById('offset-maghrib').value || '0');
        localStorage.setItem('offset-isha', document.getElementById('offset-isha').value || '0');
        
        localStorage.setItem('setting-play-adhan', document.getElementById('setting-play-adhan').checked ? 'true' : 'false');
        localStorage.setItem('setting-notify-desktop', document.getElementById('setting-notify-desktop').checked ? 'true' : 'false');
        localStorage.setItem('setting-adhan-volume', document.getElementById('setting-adhan-volume').value || '0.5');
        
        const modal = document.getElementById('settings-modal');
        modal.classList.add('hidden');
        modal.classList.remove('flex');
        
        if (testAdhanAudio && !testAdhanAudio.paused) {
            testAdhanAudio.pause();
            document.getElementById('btn-test-adhan').innerHTML = '<i class="fas fa-play"></i> Test Adhan Sound';
        }
        
        const savedLat = localStorage.getItem('savedLat');
        const savedLng = localStorage.getItem('savedLng');
        if (savedLat && savedLng) {
            fetchPrayers(parseFloat(savedLat), parseFloat(savedLng));
        } else {
            fetchPrayers();
        }
    });

    // --- QIBLA SYSTEM ---
    window.initQibla = function() {
        const dirValEl = document.getElementById('qibla-direction-val');
        const distValEl = document.getElementById('qibla-distance-val');
        const compassDial = document.getElementById('qibla-compass-dial');
        const statusText = document.getElementById('qibla-status-text');
        const marker = document.getElementById('qibla-kaaba-marker');
        
        if (!dirValEl || !distValEl || !compassDial) return;
        
        const lat = coordinates.lat;
        const lng = coordinates.lng;
        
        const kLat = 21.4225;
        const kLng = 39.8262;
        
        const degToRad = deg => deg * Math.PI / 180;
        const radToDeg = rad => rad * 180 / Math.PI;
        
        const lat1 = degToRad(lat);
        const lng1 = degToRad(lng);
        const lat2 = degToRad(kLat);
        const lng2 = degToRad(kLng);
        
        const dLng = lng2 - lng1;
        const y = Math.sin(dLng);
        const x = Math.cos(lat1) * Math.tan(lat2) - Math.sin(lat1) * Math.cos(dLng);
        let qiblaAngle = radToDeg(Math.atan2(y, x));
        qiblaAngle = (qiblaAngle + 360) % 360;
        
        const R = 6371;
        const dLat = lat2 - lat1;
        const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
                  Math.cos(lat1) * Math.cos(lat2) *
                  Math.sin(dLng/2) * Math.sin(dLng/2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
        const distance = R * c;
        
        dirValEl.textContent = `${qiblaAngle.toFixed(1)}° N`;
        distValEl.textContent = `${Math.round(distance).toLocaleString()} km`;
        
        let cardinal = '';
        if (qiblaAngle >= 337.5 || qiblaAngle < 22.5) cardinal = 'North (N)';
        else if (qiblaAngle >= 22.5 && qiblaAngle < 67.5) cardinal = 'North-East (NE)';
        else if (qiblaAngle >= 67.5 && qiblaAngle < 112.5) cardinal = 'East (E)';
        else if (qiblaAngle >= 112.5 && qiblaAngle < 157.5) cardinal = 'South-East (SE)';
        else if (qiblaAngle >= 157.5 && qiblaAngle < 202.5) cardinal = 'South (S)';
        else if (qiblaAngle >= 202.5 && qiblaAngle < 247.5) cardinal = 'South-West (SW)';
        else if (qiblaAngle >= 247.5 && qiblaAngle < 292.5) cardinal = 'West-South-West (WSW)';
        else cardinal = 'North-West (NW)';
        
        statusText.innerHTML = `Kaaba is at <span class="font-bold text-[var(--gold)]">${qiblaAngle.toFixed(1)}°</span> from North (${cardinal}).`;
        
        if (marker) {
            marker.style.opacity = '1';
            marker.style.transform = `rotate(${qiblaAngle}deg) translateY(-112px) rotate(${-qiblaAngle}deg)`;
        }
        
        let absoluteOrientationHandler = function(e) {
            let heading = e.webkitCompassHeading || e.alpha;
            if (heading !== null && heading !== undefined) {
                const rotation = -heading;
                compassDial.style.transform = `rotate(${rotation}deg)`;
                statusText.innerHTML = `Kaaba is at <span class="font-bold text-[var(--gold)]">${qiblaAngle.toFixed(1)}°</span>. Phone oriented.`;
            }
        };
        
        if (window.DeviceOrientationEvent && typeof DeviceOrientationEvent.requestPermission === 'function') {
            document.getElementById('btn-qibla-calibrate')?.addEventListener('click', () => {
                DeviceOrientationEvent.requestPermission()
                    .then(state => {
                        if (state === 'granted') {
                            window.addEventListener('deviceorientation', absoluteOrientationHandler, true);
                        } else {
                            window.showToast("Device orientation permission denied. Using static compass.", "error");
                        }
                    })
                    .catch(console.error);
            });
        } else {
            window.removeEventListener('deviceorientation', absoluteOrientationHandler);
            window.addEventListener('deviceorientation', absoluteOrientationHandler, true);
        }
    };

    document.getElementById('btn-qibla-calibrate')?.addEventListener('click', () => {
        if (navigator.geolocation) {
            navigator.geolocation.getCurrentPosition(pos => {
                coordinates = { lat: pos.coords.latitude, lng: pos.coords.longitude };
                initQibla();
            }, () => {
                window.showToast("Could not update geolocation.", "error");
            });
        }
    });

    // Names
    async function loadNames() {
        const grid = document.getElementById('asma-grid');
        if (!grid) return;
        try {
            const res = await fetch('https://api.aladhan.com/v1/asmaAlHusna');
            const data = await res.json();
            grid.innerHTML = data.data.map((n, i) => {
                const hue = (i * 15) % 360;
                return `
                <div class="bg-[var(--pearl-card)] p-6 rounded-[40px] shadow-sm text-center border-t-4 hover:-translate-y-1 transition-transform relative overflow-hidden group dark:bg-gray-800 dark:border-gray-700" style="border-color:hsl(${hue}, 60%, 40%)">
                    <div class="text-xs text-gray-400 mb-2">#${n.number}</div>
                    <h3 class="name-3d text-4xl font-[Amiri] mb-2" style="color:hsl(${hue}, 70%, 30%)">${n.name}</h3>
                    <div class="font-bold text-gray-800 text-lg dark:text-white">${n.transliteration}</div>
                    <div class="text-sm text-gray-500 mt-1 dark:text-gray-400">${n.en.meaning}</div>
                </div>
            `}).join('');
        } catch (e) { }
    }

    // Duas
    const duas = [
        // Comprehensive Duas Database - 120+ Authentic Supplications
        // Categories: morning, salah, family, health, studies, food, rabbana


        // ========== MORNING & EVENING (20 Duas) ==========
        {
            cat: 'morning-evening',
            title: 'Morning Protection - Ayatul Kursi',
            ar: 'اللَّهُ لَا إِلَٰهَ إِلَّا هُوَ الْحَيُّ الْقَيُّومُ ۚ لَا تَأْخُذُهُ سِنَةٌ وَلَا نَوْمٌ ۚ لَّهُ مَا فِي السَّمَاوَاتِ وَمَا فِي الْأَرْضِ',
            tr: "Allahu la ilaha illa Huwa, Al-Hayyul-Qayyum...",
            en: 'Allah! There is no deity except Him, the Ever-Living, the Sustainer of existence...',
            ref: 'Al-Baqarah 2:255'
        },
        {
            cat: 'morning-evening',
            title: 'Upon Waking Up',
            ar: 'الْحَمْدُ لِلَّهِ الَّذِي أَحْيَانَا بَعْدَ مَا أَمَاتَنَا وَإِلَيْهِ النُّشُورُ',
            tr: "Alhamdu lillahil-ladhi ahyana ba'da ma amatana wa ilaihin-nushur",
            en: 'All praise is for Allah who gave us life after having taken it from us and unto Him is the resurrection.',
            ref: 'Sahih Al-Bukhari'
        },
        {
            cat: 'morning-evening',
            title: 'Morning Gratitude',
            ar: 'أَصْبَحْنَا وَأَصْبَحَ الْمُلْكُ لِلَّهِ وَالْحَمْدُ لِلَّهِ',
            tr: "Asbahna wa asbahal-mulku lillah, walhamdu lillah",
            en: 'We have entered the morning and the dominion belongs to Allah, and all praise is for Allah.',
            ref: 'Sahih Muslim'
        },
        {
            cat: 'morning-evening',
            title: 'Morning Tasbih',
            ar: 'سُبْحَانَ اللَّهِ وَبِحَمْدِهِ عَدَدَ خَلْقِهِ وَرِضَا نَفْسِهِ وَزِنَةَ عَرْشِهِ وَمِدَادَ كَلِمَاتِهِ',
            tr: "Subhan-Allahi wa bihamdihi, 'adada khalqihi, wa rida nafsihi, wa zinata 'arshihi, wa midada kalimatihi",
            en: 'Glory is to Allah and praise is to Him, by the multitude of His creation, by His Pleasure, by the weight of His Throne, and by the extent of His Words.',
            ref: 'Sahih Muslim'
        },
        {
            cat: 'morning-evening',
            title: 'Seeking Allah\'s Pleasure',
            ar: 'رَضِيتُ بِاللَّهِ رَبًّا، وَبِالْإِسْلَامِ دِينًا، وَبِمُحَمَّدٍ نَبِيًّا',
            tr: "Raditu billahi Rabban, wa bil-Islami dinan, wa bi-Muhammadin nabiyyan",
            en: 'I am pleased with Allah as my Lord, Islam as my religion, and Muhammad as my Prophet.',
            ref: 'Sunan Abu Dawud'
        },
        {
            cat: 'morning-evening',
            title: 'Protection from Evil',
            ar: 'بِسْمِ اللَّهِ الَّذِي لَا يَضُرُّ مَعَ اسْمِهِ شَيْءٌ فِي الْأَرْضِ وَلَا فِي السَّمَاءِ وَهُوَ السَّمِيعُ الْعَلِيمُ',
            tr: "Bismillahil-ladhi la yadurru ma'asmihi shay'un fil-ardi wa la fis-sama'i, wa Huwas-Sami'ul-'Alim",
            en: 'In the name of Allah with whose name nothing is harmed on earth nor in the heavens, and He is the All-Hearing, the All-Knowing.',
            ref: 'Sunan Abu Dawud'
        },
        {
            cat: 'morning-evening',
            title: 'Seeking Forgiveness',
            ar: 'أَسْتَغْفِرُ اللَّهَ الَّذِي لَا إِلَهَ إِلَّا هُوَ الْحَيُّ الْقَيُّومُ وَأَتُوبُ إِلَيْهِ',
            tr: "Astaghfirullaha-lladhi la ilaha illa Huwal-Hayyul-Qayyumu wa atubu ilayh",
            en: 'I seek forgiveness from Allah, there is no deity except Him, the Ever-Living, the Sustainer, and I repent to Him.',
            ref: 'Sunan Abu Dawud'
        },
        {
            cat: 'morning-evening',
            title: 'Seeking Knowledge',
            ar: 'اللَّهُمَّ انْفَعْنِي بِمَا عَلَّمْتَنِي وَعَلِّمْنِي مَا يَنْفَعُنِي',
            tr: "Allahumma anfa'ni bima 'allamtani wa 'allimni ma yanfa'uni",
            en: 'O Allah, benefit me with what You have taught me, and teach me what will benefit me.',
            ref: 'Sunan Ibn Majah'
        },
        {
            cat: 'morning-evening',
            title: 'Seeking Barakah',
            ar: 'اللَّهُمَّ إِنِّي أَسْأَلُكَ خَيْرَ هَذَا الْيَوْمِ فَتْحَهُ وَنَصْرَهُ وَنُورَهُ وَبَرَكَتَهُ وَهُدَاهُ',
            tr: "Allahumma inni as'aluka khayra hadhal-yawmi fat-hahu wa nasrahu wa nurahu wa barakatahu wa hudahu",
            en: 'O Allah, I ask You for the good of this day, its triumph, its victory, its light, its blessings and its guidance.',
            ref: 'Sunan Abu Dawud'
        },
        {
            cat: 'morning-evening',
            title: 'Protection from Shaytan',
            ar: 'أَعُوذُ بِكَلِمَاتِ اللَّهِ التَّامَّاتِ مِنْ شَرِّ مَا خَلَقَ',
            tr: "A'udhu bikalimatillahit-tammati min sharri ma khalaq",
            en: 'I seek refuge in the perfect words of Allah from the evil of what He has created.',
            ref: 'Sahih Muslim'
        },
        {
            cat: 'morning-evening',
            title: 'Evening Protection',
            ar: 'أَمْسَيْنَا وَأَمْسَى الْمُلْكُ لِلَّهِ وَالْحَمْدُ لِلَّهِ',
            tr: "Amsayna wa amsal-mulku lillah, walhamdu lillah",
            en: 'We have entered the evening and the dominion belongs to Allah, and all praise is for Allah.',
            ref: 'Sahih Muslim'
        },
        {
            cat: 'morning-evening',
            title: 'Evening Refuge',
            ar: 'اللَّهُمَّ بِكَ أَمْسَيْنَا وَبِكَ أَصْبَحْنَا وَبِكَ نَحْيَا وَبِكَ نَمُوتُ وَإِلَيْكَ الْمَصِيرُ',
            tr: "Allahumma bika amsayna, wa bika asbahna, wa bika nahya, wa bika namutu, wa ilaykal-masir",
            en: 'O Allah, by You we enter the evening, by You we enter the morning, by You we live, by You we die, and to You is the final return.',
            ref: 'Jami At-Tirmidhi'
        },
        {
            cat: 'morning-evening',
            title: 'Before Sleeping',
            ar: 'بِاسْمِكَ اللَّهُمَّ أَمُوتُ وَأَحْيَا',
            tr: "Bismika Allahumma amutu wa ahya",
            en: 'In Your name, O Allah, I die and I live.',
            ref: 'Sahih Al-Bukhari'
        },
        {
            cat: 'morning-evening',
            title: 'Gratitude for New Day',
            ar: 'الْحَمْدُ لِلَّهِ الَّذِي عَافَانِي فِي جَسَدِي وَرَدَّ عَلَيَّ رُوحِي',
            tr: "Alhamdu lillahil-ladhi 'afani fi jasadi wa radda 'alayya ruhi",
            en: 'All praise is for Allah who has restored my health and returned my soul to me.',
            ref: 'Jami At-Tirmidhi'
        },
        {
            cat: 'morning-evening',
            title: 'Seeking Good Character',
            ar: 'اللَّهُمَّ اهْدِنِي لِأَحْسَنِ الْأَخْلَاقِ لَا يَهْدِي لِأَحْسَنِهَا إِلَّا أَنْتَ',
            tr: "Allahummah-dini li-ahsanil-akhlaqi la yahdi li-ahsaniha illa Anta",
            en: 'O Allah, guide me to the best of characters, for none can guide to the best of them except You.',
            ref: 'Sahih Muslim'
        },
        {
            cat: 'morning-evening',
            title: 'Seeking Provision',
            ar: 'اللَّهُمَّ إِنِّي أَسْأَلُكَ عِلْمًا نَافِعًا وَرِزْقًا طَيِّبًا وَعَمَلًا مُتَقَبَّلًا',
            tr: "Allahumma inni as'aluka 'ilman nafi'an, wa rizqan tayyiban, wa 'amalan mutaqabbalan",
            en: 'O Allah, I ask You for beneficial knowledge, good provision, and accepted deeds.',
            ref: 'Sunan Ibn Majah'
        },
        {
            cat: 'morning-evening',
            title: 'Protection from Anxiety',
            ar: 'اللَّهُمَّ إِنِّي أَعُوذُ بِكَ مِنَ الْهَمِّ وَالْحَزَنِ',
            tr: "Allahumma inni a'udhu bika minal-hammi wal-hazan",
            en: 'O Allah, I seek refuge in You from worry and grief.',
            ref: 'Sahih Al-Bukhari'
        },
        {
            cat: 'morning-evening',
            title: 'Seeking Steadfastness',
            ar: 'يَا مُقَلِّبَ الْقُلُوبِ ثَبِّتْ قَلْبِي عَلَى دِينِكَ',
            tr: "Ya Muqallibal-qulubi thabbit qalbi 'ala dinik",
            en: 'O Turner of hearts, make my heart firm upon Your religion.',
            ref: 'Jami At-Tirmidhi'
        },
        {
            cat: 'morning-evening',
            title: 'Entering the Morning with Faith',
            ar: 'أَصْبَحْنَا عَلَى فِطْرَةِ الْإِسْلَامِ وَعَلَى كَلِمَةِ الْإِخْلَاصِ',
            tr: "Asbahna 'ala fitratil-Islam, wa 'ala kalimatil-ikhlas",
            en: 'We have entered the morning upon the natural religion of Islam and upon the word of sincerity.',
            ref: 'Musnad Ahmad'
        },
        {
            cat: 'morning-evening',
            title: 'Seeking Allah\'s Protection',
            ar: 'اللَّهُمَّ عَافِنِي فِي بَدَنِي اللَّهُمَّ عَافِنِي فِي سَمْعِي اللَّهُمَّ عَافِنِي فِي بَصَرِي',
            tr: "Allahumma 'afini fi badani, Allahumma 'afini fi sam'i, Allahumma 'afini fi basari",
            en: 'O Allah, grant me wellness in my body. O Allah, grant me wellness in my hearing. O Allah, grant me wellness in my sight.',
            ref: 'Sunan Abu Dawud'
        },

        // ========== PRAYER/SALAH (15 Duas) ==========
        {
            cat: 'salah',
            title: 'Opening Dua (Istiftah)',
            ar: 'سُبْحَانَكَ اللَّهُمَّ وَبِحَمْدِكَ وَتَبَارَكَ اسْمُكَ وَتَعَالَى جَدُّكَ وَلَا إِلَهَ غَيْرُكَ',
            tr: "Subhanaka Allahumma wa bihamdika, wa tabarakasmuka, wa ta'ala jadduka, wa la ilaha ghayruk",
            en: 'Glory be to You, O Allah, and praise be to You. Blessed is Your name and exalted is Your majesty. There is no deity except You.',
            ref: 'Sunan Abu Dawud'
        },
        {
            cat: 'salah',
            title: 'Dua in Ruku',
            ar: 'سُبْحَانَ رَبِّيَ الْعَظِيمِ',
            tr: "Subhana Rabbiyal-'Adhim",
            en: 'Glory be to my Lord, the Most Great.',
            ref: 'Sahih Muslim'
        },
        {
            cat: 'salah',
            title: 'Rising from Ruku',
            ar: 'سَمِعَ اللَّهُ لِمَنْ حَمِدَهُ رَبَّنَا وَلَكَ الْحَمْدُ',
            tr: "Sami'Allahu liman hamidah, Rabbana wa lakal-hamd",
            en: 'Allah hears those who praise Him. Our Lord, to You belongs all praise.',
            ref: 'Sahih Al-Bukhari'
        },
        {
            cat: 'salah',
            title: 'Dua in Sujud',
            ar: 'سُبْحَانَ رَبِّيَ الْأَعْلَى',
            tr: "Subhana Rabbiyal-A'la",
            en: 'Glory be to my Lord, the Most High.',
            ref: 'Sahih Muslim'
        },
        {
            cat: 'salah',
            title: 'Extended Sujud Dua',
            ar: 'سُبْحَانَكَ اللَّهُمَّ رَبَّنَا وَبِحَمْدِكَ اللَّهُمَّ اغْفِرْ لِي',
            tr: "Subhanaka Allahumma Rabbana wa bihamdika Allahummaghfir li",
            en: 'Glory be to You, O Allah, our Lord, and praise be to You. O Allah, forgive me.',
            ref: 'Sahih Al-Bukhari'
        },
        {
            cat: 'salah',
            title: 'Between Two Sajdahs',
            ar: 'رَبِّ اغْفِرْ لِي رَبِّ اغْفِرْ لِي',
            tr: "Rabbighfir li, Rabbighfir li",
            en: 'My Lord, forgive me. My Lord, forgive me.',
            ref: 'Sunan Abu Dawud'
        },
        {
            cat: 'salah',
            title: 'Tashahhud (At-Tahiyyat)',
            ar: 'التَّحِيَّاتُ لِلَّهِ وَالصَّلَوَاتُ وَالطَّيِّبَاتُ السَّلَامُ عَلَيْكَ أَيُّهَا النَّبِيُّ وَرَحْمَةُ اللَّهِ وَبَرَكَاتُهُ',
            tr: "At-tahiyyatu lillahi was-salawatu wat-tayyibat, as-salamu 'alayka ayyuhan-Nabiyyu wa rahmatullahi wa barakatuh",
            en: 'All greetings, prayers and pure words are due to Allah. Peace be upon you, O Prophet, and the mercy of Allah and His blessings.',
            ref: 'Sahih Al-Bukhari'
        },
        {
            cat: 'salah',
            title: 'Salawat on the Prophet',
            ar: 'اللَّهُمَّ صَلِّ عَلَى مُحَمَّدٍ وَعَلَى آلِ مُحَمَّدٍ كَمَا صَلَّيْتَ عَلَى إِبْرَاهِيمَ وَعَلَى آلِ إِبْرَاهِيمَ إِنَّكَ حَمِيدٌ مَجِيدٌ',
            tr: "Allahumma salli 'ala Muhammadin wa 'ala ali Muhammad, kama sallayta 'ala Ibrahima wa 'ala ali Ibrahim, innaka Hamidun Majid",
            en: 'O Allah, send prayers upon Muhammad and upon the family of Muhammad, as You sent prayers upon Ibrahim and upon the family of Ibrahim. Indeed, You are Praiseworthy and Glorious.',
            ref: 'Sahih Al-Bukhari'
        },
        {
            cat: 'salah',
            title: 'Dua Before Tasleem',
            ar: 'اللَّهُمَّ إِنِّي أَعُوذُ بِكَ مِنْ عَذَابِ جَهَنَّمَ وَمِنْ عَذَابِ الْقَبْرِ وَمِنْ فِتْنَةِ الْمَحْيَا وَالْمَمَاتِ وَمِنْ شَرِّ فِتْنَةِ الْمَسِيحِ الدَّجَّالِ',
            tr: "Allahumma inni a'udhu bika min 'adhabi Jahannam, wa min 'adhabil-qabr, wa min fitnatil-mahya wal-mamat, wa min sharri fitnatil-Masihid-Dajjal",
            en: 'O Allah, I seek refuge in You from the punishment of Hell, from the punishment of the grave, from the trials of life and death, and from the evil of the trial of the False Messiah.',
            ref: 'Sahih Al-Bukhari'
        },
        {
            cat: 'salah',
            title: 'After Tasleem - Istighfar',
            ar: 'أَسْتَغْفِرُ اللَّهَ أَسْتَغْفِرُ اللَّهَ أَسْتَغْفِرُ اللَّهَ',
            tr: "Astaghfirullah, Astaghfirullah, Astaghfirullah",
            en: 'I seek forgiveness from Allah (3 times).',
            ref: 'Sahih Muslim'
        },
        {
            cat: 'salah',
            title: 'After Salah - Tasbih',
            ar: 'سُبْحَانَ اللَّهِ وَالْحَمْدُ لِلَّهِ وَاللَّهُ أَكْبَرُ',
            tr: "SubhanAllah, Alhamdulillah, Allahu Akbar (33 times each)",
            en: 'Glory be to Allah, All praise is for Allah, Allah is the Greatest.',
            ref: 'Sahih Muslim'
        },
        {
            cat: 'salah',
            title: 'Completing 100 Tasbih',
            ar: 'لَا إِلَهَ إِلَّا اللَّهُ وَحْدَهُ لَا شَرِيكَ لَهُ لَهُ الْمُلْكُ وَلَهُ الْحَمْدُ وَهُوَ عَلَى كُلِّ شَيْءٍ قَدِيرٌ',
            tr: "La ilaha illallahu wahdahu la sharika lah, lahul-mulku wa lahul-hamd, wa Huwa 'ala kulli shay'in Qadir",
            en: 'There is no deity except Allah alone, with no partner. To Him belongs the dominion and to Him belongs all praise, and He has power over all things.',
            ref: 'Sahih Muslim'
        },
        {
            cat: 'salah',
            title: 'Dua for Acceptance',
            ar: 'اللَّهُمَّ أَعِنِّي عَلَى ذِكْرِكَ وَشُكْرِكَ وَحُسْنِ عِبَادَتِكَ',
            tr: "Allahumma a'inni 'ala dhikrika wa shukrika wa husni 'ibadatik",
            en: 'O Allah, help me to remember You, to thank You, and to worship You in the best manner.',
            ref: 'Sunan Abu Dawud'
        },
        {
            cat: 'salah',
            title: 'Seeking Jannah',
            ar: 'اللَّهُمَّ إِنِّي أَسْأَلُكَ الْجَنَّةَ وَأَعُوذُ بِكَ مِنَ النَّارِ',
            tr: "Allahumma inni as'alukal-Jannah wa a'udhu bika minan-Nar",
            en: 'O Allah, I ask You for Paradise and I seek refuge in You from the Fire.',
            ref: 'Sunan Abu Dawud'
        },
        {
            cat: 'salah',
            title: 'Qunut in Witr',
            ar: 'اللَّهُمَّ اهْدِنِي فِيمَنْ هَدَيْتَ وَعَافِنِي فِيمَنْ عَافَيْتَ',
            tr: "Allahummah-dini fiman hadayt, wa 'afini fiman 'afayt",
            en: 'O Allah, guide me among those You have guided, and grant me wellness among those You have granted wellness.',
            ref: 'Sunan Abu Dawud'
        },

        // ========== FAMILY & PARENTS (10 Duas) ==========
        {
            cat: 'family',
            title: 'For Parents - Mercy',
            ar: 'رَبِّ ارْحَمْهُمَا كَمَا رَبَّيَانِي صَغِيرًا',
            tr: "Rabbir-hamhuma kama rabbayani saghira",
            en: 'My Lord, have mercy upon them as they brought me up when I was small.',
            ref: 'Al-Isra 17:24'
        },
        {
            cat: 'family',
            title: 'For Righteous Spouse',
            ar: 'رَبَّنَا هَبْ لَنَا مِنْ أَزْوَاجِنَا وَذُرِّيَّاتِنَا قُرَّةَ أَعْيُنٍ',
            tr: "Rabbana hab lana min azwajina wa dhurriyyatina qurrata a'yun",
            en: 'Our Lord, grant us from among our spouses and offspring comfort to our eyes.',
            ref: 'Al-Furqan 25:74'
        },
        {
            cat: 'family',
            title: 'For Righteous Children',
            ar: 'رَبِّ هَبْ لِي مِنَ الصَّالِحِينَ',
            tr: "Rabbi hab li minas-salihin",
            en: 'My Lord, grant me righteous offspring.',
            ref: 'As-Saffat 37:100'
        },
        {
            cat: 'family',
            title: 'Protection for Family',
            ar: 'رَبَّنَا آتِنَا فِي الدُّنْيَا حَسَنَةً وَفِي الْآخِرَةِ حَسَنَةً وَقِنَا عَذَابَ النَّارِ',
            tr: "Rabbana atina fid-dunya hasanatan wa fil-akhirati hasanatan waqina 'adhaban-nar",
            en: 'Our Lord, give us good in this world and good in the Hereafter and protect us from the punishment of the Fire.',
            ref: 'Al-Baqarah 2:201'
        },
        {
            cat: 'family',
            title: 'For Parents\' Forgiveness',
            ar: 'رَبِّ اغْفِرْ لِي وَلِوَالِدَيَّ وَلِلْمُؤْمِنِينَ يَوْمَ يَقُومُ الْحِسَابُ',
            tr: "Rabbighfir li wa liwalidayya wa lilmu'minina yawma yaqumal-hisab",
            en: 'My Lord, forgive me and my parents and the believers the Day the account is established.',
            ref: 'Ibrahim 14:41'
        },
        {
            cat: 'family',
            title: 'For Family Unity',
            ar: 'رَبَّنَا اغْفِرْ لَنَا وَلِإِخْوَانِنَا الَّذِينَ سَبَقُونَا بِالْإِيمَانِ',
            tr: "Rabbanagh-fir lana wa li-ikhwaninal-ladhina sabaquna bil-iman",
            en: 'Our Lord, forgive us and our brothers who preceded us in faith.',
            ref: 'Al-Hashr 59:10'
        },
        {
            cat: 'family',
            title: 'For Grateful Heart',
            ar: 'رَبِّ أَوْزِعْنِي أَنْ أَشْكُرَ نِعْمَتَكَ الَّتِي أَنْعَمْتَ عَلَيَّ وَعَلَىٰ وَالِدَيَّ',
            tr: "Rabbi awzi'ni an ashkura ni'matakal-lati an'amta 'alayya wa 'ala walidayya",
            en: 'My Lord, enable me to be grateful for Your favor which You have bestowed upon me and upon my parents.',
            ref: 'Al-Ahqaf 46:15'
        },
        {
            cat: 'family',
            title: 'For Spouse\'s Love',
            ar: 'رَبَّنَا هَبْ لَنَا مِنْ أَزْوَاجِنَا وَذُرِّيَّاتِنَا قُرَّةَ أَعْيُنٍ وَاجْعَلْنَا لِلْمُتَّقِينَ إِمَامًا',
            tr: "Rabbana hab lana min azwajina wa dhurriyyatina qurrata a'yun waj'alna lil-muttaqina imama",
            en: 'Our Lord, grant us from among our spouses and offspring comfort to our eyes and make us an example for the righteous.',
            ref: 'Al-Furqan 25:74'
        },
        {
            cat: 'family',
            title: 'For Children\'s Guidance',
            ar: 'رَبِّ اجْعَلْنِي مُقِيمَ الصَّلَاةِ وَمِنْ ذُرِّيَّتِي',
            tr: "Rabbij-'alni muqimas-salati wa min dhurriyyati",
            en: 'My Lord, make me an establisher of prayer, and from my descendants.',
            ref: 'Ibrahim 14:40'
        },
        {
            cat: 'family',
            title: 'For Family\'s Well-being',
            ar: 'اللَّهُمَّ إِنِّي أَسْأَلُكَ الْعَافِيَةَ فِي الدُّنْيَا وَالْآخِرَةِ',
            tr: "Allahumma inni as'alukal-'afiyata fid-dunya wal-akhirah",
            en: 'O Allah, I ask You for well-being in this world and the Hereafter.',
            ref: 'Sunan Ibn Majah'
        },

        // ========== DIFFICULTIES & HEALTH (15 Duas) ==========
        {
            cat: 'health',
            title: 'Relief from Anxiety',
            ar: 'اللَّهُمَّ إِنِّي عَبْدُكَ ابْنُ عَبْدِكَ ابْنُ أَمَتِكَ نَاصِيَتِي بِيَدِكَ مَاضٍ فِيَّ حُكْمُكَ عَدْلٌ فِيَّ قَضَاؤُكَ',
            tr: "Allahumma inni 'abduka ibnu 'abdika ibnu amatika, nasiyati biyadika, madin fiyya hukmuka, 'adlun fiyya qada'uka",
            en: 'O Allah, I am Your servant, son of Your servant, son of Your maidservant. My forelock is in Your hand, Your command over me is forever executed and Your decree over me is just.',
            ref: 'Musnad Ahmad'
        },
        {
            cat: 'health',
            title: 'For Healing',
            ar: 'اللَّهُمَّ رَبَّ النَّاسِ أَذْهِبِ الْبَأْسَ اشْفِ أَنْتَ الشَّافِي لَا شِفَاءَ إِلَّا شِفَاؤُكَ',
            tr: "Allahumma Rabban-nas, adhhibil-ba's, ishfi Antash-Shafi, la shifa'a illa shifa'uk",
            en: 'O Allah, Lord of mankind, remove the harm and heal, You are the Healer. There is no healing except Your healing.',
            ref: 'Sahih Al-Bukhari'
        },
        {
            cat: 'health',
            title: 'Relief from Debt',
            ar: 'اللَّهُمَّ اكْفِنِي بِحَلَالِكَ عَنْ حَرَامِكَ وَأَغْنِنِي بِفَضْلِكَ عَمَّنْ سِوَاكَ',
            tr: "Allahummak-fini bihalalika 'an haramika wa aghnini bifadlika 'amman siwak",
            en: 'O Allah, suffice me with what You have allowed instead of what You have forbidden, and make me independent of all others besides You.',
            ref: 'Jami At-Tirmidhi'
        },
        {
            cat: 'health',
            title: 'In Times of Distress',
            ar: 'لَا إِلَهَ إِلَّا اللَّهُ الْعَظِيمُ الْحَلِيمُ لَا إِلَهَ إِلَّا اللَّهُ رَبُّ الْعَرْشِ الْعَظِيمِ',
            tr: "La ilaha illallahul-'Adhimul-Halim, la ilaha illallahu Rabbul-'Arshil-'Adhim",
            en: 'There is no deity except Allah, the Magnificent, the Forbearing. There is no deity except Allah, Lord of the Magnificent Throne.',
            ref: 'Sahih Al-Bukhari'
        },
        {
            cat: 'health',
            title: 'For Patience',
            ar: 'رَبَّنَا أَفْرِغْ عَلَيْنَا صَبْرًا وَثَبِّتْ أَقْدَامَنَا',
            tr: "Rabbana afrigh 'alayna sabran wa thabbit aqdamana",
            en: 'Our Lord, pour upon us patience and plant firmly our feet.',
            ref: 'Al-Baqarah 2:250'
        },
        {
            cat: 'health',
            title: 'Protection from Harm',
            ar: 'اللَّهُمَّ إِنِّي أَعُوذُ بِكَ مِنَ الْبَرَصِ وَالْجُنُونِ وَالْجُذَامِ وَمِنْ سَيِّئِ الْأَسْقَامِ',
            tr: "Allahumma inni a'udhu bika minal-barasi wal-jununi wal-judhami wa min sayyi'il-asqam",
            en: 'O Allah, I seek refuge in You from leprosy, madness, elephantiasis, and evil diseases.',
            ref: 'Sunan Abu Dawud'
        },
        {
            cat: 'health',
            title: 'For Ease',
            ar: 'اللَّهُمَّ لَا سَهْلَ إِلَّا مَا جَعَلْتَهُ سَهْلًا وَأَنْتَ تَجْعَلُ الْحَزْنَ إِذَا شِئْتَ سَهْلًا',
            tr: "Allahumma la sahla illa ma ja'altahu sahla, wa Anta taj'alul-hazna idha shi'ta sahla",
            en: 'O Allah, there is no ease except what You make easy, and You make the difficult easy if You wish.',
            ref: 'Sahih Ibn Hibban'
        },
        {
            cat: 'health',
            title: 'For Strength',
            ar: 'اللَّهُمَّ إِنِّي أَعُوذُ بِكَ مِنَ الْعَجْزِ وَالْكَسَلِ',
            tr: "Allahumma inni a'udhu bika minal-'ajzi wal-kasal",
            en: 'O Allah, I seek refuge in You from incapacity and laziness.',
            ref: 'Sahih Al-Bukhari'
        },
        {
            cat: 'health',
            title: 'Relief from Worry',
            ar: 'اللَّهُمَّ إِنِّي أَعُوذُ بِكَ مِنَ الْهَمِّ وَالْحَزَنِ وَالْعَجْزِ وَالْكَسَلِ',
            tr: "Allahumma inni a'udhu bika minal-hammi wal-hazani wal-'ajzi wal-kasal",
            en: 'O Allah, I seek refuge in You from worry, grief, incapacity, and laziness.',
            ref: 'Sahih Al-Bukhari'
        },
        {
            cat: 'health',
            title: 'For Recovery',
            ar: 'أَسْأَلُ اللَّهَ الْعَظِيمَ رَبَّ الْعَرْشِ الْعَظِيمِ أَنْ يَشْفِيَكَ',
            tr: "As'alullaha-l'Adhima Rabbal-'Arshil-'Adhimi an yashfiyak (7 times)",
            en: 'I ask Allah the Magnificent, Lord of the Magnificent Throne, to cure you.',
            ref: 'Jami At-Tirmidhi'
        },
        {
            cat: 'health',
            title: 'For Contentment',
            ar: 'اللَّهُمَّ إِنِّي أَسْأَلُكَ الرِّضَا بَعْدَ الْقَضَاءِ',
            tr: "Allahumma inni as'alukar-rida ba'dal-qada'",
            en: 'O Allah, I ask You for contentment after Your decree.',
            ref: 'Musnad Ahmad'
        },
        {
            cat: 'health',
            title: 'Protection from Evil',
            ar: 'اللَّهُمَّ إِنِّي أَعُوذُ بِكَ مِنْ شَرِّ مَا عَمِلْتُ وَمِنْ شَرِّ مَا لَمْ أَعْمَلْ',
            tr: "Allahumma inni a'udhu bika min sharri ma 'amiltu wa min sharri ma lam a'mal",
            en: 'O Allah, I seek refuge in You from the evil of what I have done and from the evil of what I have not done.',
            ref: 'Sahih Muslim'
        },
        {
            cat: 'health',
            title: 'For Relief',
            ar: 'يَا حَيُّ يَا قَيُّومُ بِرَحْمَتِكَ أَسْتَغِيثُ',
            tr: "Ya Hayyu Ya Qayyumu birahmatika astagheeth",
            en: 'O Ever-Living, O Sustainer, by Your mercy I seek help.',
            ref: 'Jami At-Tirmidhi'
        },
        {
            cat: 'health',
            title: 'For Cure from Illness',
            ar: 'بِسْمِ اللَّهِ أَرْقِيكَ مِنْ كُلِّ شَيْءٍ يُؤْذِيكَ',
            tr: "Bismillahi arqika min kulli shay'in yu'dhika",
            en: 'In the name of Allah I perform ruqyah for you, from everything that harms you.',
            ref: 'Sahih Muslim'
        },
        {
            cat: 'health',
            title: 'For Steadfastness in Trial',
            ar: 'إِنَّا لِلَّهِ وَإِنَّا إِلَيْهِ رَاجِعُونَ اللَّهُمَّ أْجُرْنِي فِي مُصِيبَتِي وَأَخْلِفْ لِي خَيْرًا مِنْهَا',
            tr: "Inna lillahi wa inna ilayhi raji'un, Allahumma'jurni fi musibati wa akhlif li khayran minha",
            en: 'To Allah we belong and to Him we shall return. O Allah, reward me in my affliction and replace it with something better.',
            ref: 'Sahih Muslim'
        },
        {
            cat: 'academic',
            title: 'For Knowledge',
            ar: 'رَبِّ زِدْنِي عِلْمًا',
            tr: "Rabbi zidni 'ilma",
            en: 'My Lord, increase me in knowledge.',
            ref: 'Ta-Ha 20:114'
        },
        {
            cat: 'academic',
            title: 'Before Studying',
            ar: 'اللَّهُمَّ انْفَعْنِي بِمَا عَلَّمْتَنِي وَعَلِّمْنِي مَا يَنْفَعُنِي وَزِدْنِي عِلْمًا',
            tr: "Allahumma anfa'ni bima 'allamtani wa 'allimni ma yanfa'uni wa zidni 'ilma",
            en: 'O Allah, benefit me with what You have taught me, teach me what will benefit me, and increase me in knowledge.',
            ref: 'Sunan Ibn Majah'
        },
        {
            cat: 'academic',
            title: 'For Understanding',
            ar: 'اللَّهُمَّ افْتَحْ عَلَيَّ فُتُوحَ الْعَارِفِينَ',
            tr: "Allahumma-ftah 'alayya futuhal-'arifin",
            en: 'O Allah, open for me the openings of those who know.',
            ref: 'Traditional Islamic Dua'
        },
        {
            cat: 'academic',
            title: 'For Memory',
            ar: 'اللَّهُمَّ إِنِّي أَسْأَلُكَ فَهْمَ النَّبِيِّينَ وَحِفْظَ الْمُرْسَلِينَ',
            tr: "Allahumma inni as'aluka fahman-nabiyyin wa hifzhal-mursalin",
            en: 'O Allah, I ask You for the understanding of the prophets and the memory of the messengers.',
            ref: 'Traditional Islamic Dua'
        },
        {
            cat: 'academic',
            title: 'For Focus',
            ar: 'اللَّهُمَّ لَا سَهْلَ إِلَّا مَا جَعَلْتَهُ سَهْلًا',
            tr: "Allahumma la sahla illa ma ja'altahu sahla",
            en: 'O Allah, there is nothing easy except what You make easy.',
            ref: 'Sahih Ibn Hibban'
        },
        {
            cat: 'academic',
            title: 'Before Exam',
            ar: 'اللَّهُمَّ لَا سَهْلَ إِلَّا مَا جَعَلْتَهُ سَهْلًا وَأَنْتَ تَجْعَلُ الْحَزْنَ إِذَا شِئْتَ سَهْلًا',
            tr: "Allahumma la sahla illa ma ja'altahu sahla, wa Anta taj'alul-hazna idha shi'ta sahla",
            en: 'O Allah, nothing is easy except what You make easy, and You make the difficult easy if You wish.',
            ref: 'Sahih Ibn Hibban'
        },
        {
            cat: 'academic',
            title: 'For Wisdom',
            ar: 'رَبِّ هَبْ لِي حُكْمًا وَأَلْحِقْنِي بِالصَّالِحِينَ',
            tr: "Rabbi hab li hukman wa alhiqni bis-salihin",
            en: 'My Lord, grant me wisdom and join me with the righteous.',
            ref: 'Ash-Shu\'ara 26:83'
        },
        {
            cat: 'academic',
            title: 'For Clear Speech',
            ar: 'رَبِّ اشْرَحْ لِي صَدْرِي وَيَسِّرْ لِي أَمْرِي وَاحْلُلْ عُقْدَةً مِنْ لِسَانِي يَفْقَهُوا قَوْلِي',
            tr: "Rabbish-rah li sadri wa yassir li amri wahlul 'uqdatan min lisani yafqahu qawli",
            en: 'My Lord, expand for me my breast and ease for me my task, and untie the knot from my tongue that they may understand my speech.',
            ref: 'Ta-Ha 20:25-28'
        },
        {
            cat: 'academic',
            title: 'For Beneficial Knowledge',
            ar: 'اللَّهُمَّ إِنِّي أَعُوذُ بِكَ مِنْ عِلْمٍ لَا يَنْفَعُ',
            tr: "Allahumma inni a'udhu bika min 'ilmin la yanfa'",
            en: 'O Allah, I seek refuge in You from knowledge that does not benefit.',
            ref: 'Sahih Muslim'
        },
        {
            cat: 'academic',
            title: 'For Success',
            ar: 'رَبَّنَا آتِنَا فِي الدُّنْيَا حَسَنَةً وَفِي الْآخِرَةِ حَسَنَةً',
            tr: "Rabbana atina fid-dunya hasanatan wa fil-akhirati hasanatan",
            en: 'Our Lord, give us good in this world and good in the Hereafter.',
            ref: 'Al-Baqarah 2:201'
        },

        // ========== FOOD & TRAVEL (10 Duas) ==========
        {
            cat: 'food-travel',
            title: 'Before Eating',
            ar: 'بِسْمِ اللَّهِ',
            tr: "Bismillah",
            en: 'In the name of Allah.',
            ref: 'Sunan Abu Dawud'
        },
        {
            cat: 'food-travel',
            title: 'After Eating',
            ar: 'الْحَمْدُ لِلَّهِ الَّذِي أَطْعَمَنِي هَذَا وَرَزَقَنِيهِ مِنْ غَيْرِ حَوْلٍ مِنِّي وَلَا قُوَّةٍ',
            tr: "Alhamdu lillahil-ladhi at'amani hadha wa razaqanihi min ghayri hawlin minni wa la quwwah",
            en: 'All praise is for Allah who fed me this and provided it for me without any might nor power from myself.',
            ref: 'Sunan Abu Dawud'
        },
        {
            cat: 'food-travel',
            title: 'Before Drinking',
            ar: 'بِسْمِ اللَّهِ',
            tr: "Bismillah",
            en: 'In the name of Allah.',
            ref: 'Sahih Al-Bukhari'
        },
        {
            cat: 'food-travel',
            title: 'After Drinking',
            ar: 'الْحَمْدُ لِلَّهِ',
            tr: "Alhamdulillah",
            en: 'All praise is for Allah.',
            ref: 'Sahih Al-Bukhari'
        },
        {
            cat: 'food-travel',
            title: 'Starting a Journey',
            ar: 'سُبْحَانَ الَّذِي سَخَّرَ لَنَا هَذَا وَمَا كُنَّا لَهُ مُقْرِنِينَ وَإِنَّا إِلَى رَبِّنَا لَمُنْقَلِبُونَ',
            tr: "Subhanal-ladhi sakh-khara lana hadha wa ma kunna lahu muqrinin, wa inna ila Rabbina lamunqalibun",
            en: 'Glory to Him who has subjected this to us, and we could never have it by our efforts. Surely, to our Lord we are returning.',
            ref: 'Az-Zukhruf 43:13-14'
        },
        {
            cat: 'food-travel',
            title: 'Entering a City',
            ar: 'اللَّهُمَّ رَبَّ السَّمَاوَاتِ السَّبْعِ وَمَا أَظْلَلْنَ وَرَبَّ الْأَرَضِينَ السَّبْعِ وَمَا أَقْلَلْنَ',
            tr: "Allahumma Rabbas-samawatis-sab'i wa ma adhlalna, wa Rabbal-aradinas-sab'i wa ma aqlalna",
            en: 'O Allah, Lord of the seven heavens and all that they cover, Lord of the seven earths and all that they carry.',
            ref: 'Al-Hakim'
        },
        {
            cat: 'food-travel',
            title: 'Entering Home',
            ar: 'بِسْمِ اللَّهِ وَلَجْنَا وَبِسْمِ اللَّهِ خَرَجْنَا وَعَلَى اللَّهِ رَبِّنَا تَوَكَّلْنَا',
            tr: "Bismillahi walajna, wa bismillahi kharajna, wa 'alallahi Rabbina tawakkalna",
            en: 'In the name of Allah we enter, in the name of Allah we leave, and upon Allah our Lord we depend.',
            ref: 'Sunan Abu Dawud'
        },
        {
            cat: 'food-travel',
            title: 'Leaving Home',
            ar: 'بِسْمِ اللَّهِ تَوَكَّلْتُ عَلَى اللَّهِ لَا حَوْلَ وَلَا قُوَّةَ إِلَّا بِاللَّهِ',
            tr: "Bismillahi, tawakkaltu 'alallahi, la hawla wa la quwwata illa billah",
            en: 'In the name of Allah, I place my trust in Allah, there is no might and no power except with Allah.',
            ref: 'Sunan Abu Dawud'
        },
        {
            cat: 'food-travel',
            title: 'Entering Masjid',
            ar: 'اللَّهُمَّ افْتَحْ لِي أَبْوَابَ رَحْمَتِكَ',
            tr: "Allahumma-ftah li abwaba rahmatik",
            en: 'O Allah, open for me the doors of Your mercy.',
            ref: 'Sahih Muslim'
        },
        {
            cat: 'food-travel',
            title: 'Leaving Masjid',
            ar: 'اللَّهُمَّ إِنِّي أَسْأَلُكَ مِنْ فَضْلِكَ',
            tr: "Allahumma inni as'aluka min fadlik",
            en: 'O Allah, I ask You from Your bounty.',
            ref: 'Sahih Muslim'
        },

        // ========== RABBANA DUAS (40 Quranic Supplications) ==========
        {
            cat: 'rabbana',
            title: 'Rabbana 1 - For Acceptance',
            ar: 'رَبَّنَا تَقَبَّلْ مِنَّا إِنَّكَ أَنْتَ السَّمِيعُ الْعَلِيمُ',
            tr: "Rabbana taqabbal minna innaka Antas-Sami'ul-'Alim",
            en: 'Our Lord, accept this from us. Indeed, You are the Hearing, the Knowing.',
            ref: 'Al-Baqarah 2:127'
        },
        {
            cat: 'rabbana',
            title: 'Rabbana 2 - For Submission',
            ar: 'رَبَّنَا وَاجْعَلْنَا مُسْلِمَيْنِ لَكَ وَمِنْ ذُرِّيَّتِنَا أُمَّةً مُسْلِمَةً لَكَ',
            tr: "Rabbana waj'alna muslimayni laka wa min dhurriyyatina ummatan muslimatan lak",
            en: 'Our Lord, and make us Muslims in submission to You and from our descendants a Muslim nation in submission to You.',
            ref: 'Al-Baqarah 2:128'
        },
        {
            cat: 'rabbana',
            title: 'Rabbana 3 - For Guidance',
            ar: 'رَبَّنَا وَابْعَثْ فِيهِمْ رَسُولًا مِنْهُمْ',
            tr: "Rabbana wab'ath fihim rasulan minhum",
            en: 'Our Lord, and send among them a messenger from themselves.',
            ref: 'Al-Baqarah 2:129'
        },
        {
            cat: 'rabbana',
            title: 'Rabbana 4 - For This World and Hereafter',
            ar: 'رَبَّنَا آتِنَا فِي الدُّنْيَا حَسَنَةً وَفِي الْآخِرَةِ حَسَنَةً وَقِنَا عَذَابَ النَّارِ',
            tr: "Rabbana atina fid-dunya hasanatan wa fil-akhirati hasanatan waqina 'adhaban-nar",
            en: 'Our Lord, give us good in this world and good in the Hereafter and protect us from the punishment of the Fire.',
            ref: 'Al-Baqarah 2:201'
        },
        {
            cat: 'rabbana',
            title: 'Rabbana 5 - For Patience',
            ar: 'رَبَّنَا أَفْرِغْ عَلَيْنَا صَبْرًا وَثَبِّتْ أَقْدَامَنَا وَانْصُرْنَا عَلَى الْقَوْمِ الْكَافِرِينَ',
            tr: "Rabbana afrigh 'alayna sabran wa thabbit aqdamana wansurna 'alal-qawmil-kafirin",
            en: 'Our Lord, pour upon us patience and plant firmly our feet and give us victory over the disbelieving people.',
            ref: 'Al-Baqarah 2:250'
        },
        {
            cat: 'rabbana',
            title: 'Rabbana 6 - Against Burden',
            ar: 'رَبَّنَا لَا تُؤَاخِذْنَا إِنْ نَسِينَا أَوْ أَخْطَأْنَا',
            tr: "Rabbana la tu'akhidhna in nasina aw akhta'na",
            en: 'Our Lord, do not impose blame upon us if we forget or make a mistake.',
            ref: 'Al-Baqarah 2:286'
        },
        {
            cat: 'rabbana',
            title: 'Rabbana 7 - Against Heavy Burden',
            ar: 'رَبَّنَا وَلَا تَحْمِلْ عَلَيْنَا إِصْرًا كَمَا حَمَلْتَهُ عَلَى الَّذِينَ مِنْ قَبْلِنَا',
            tr: "Rabbana wa la tahmil 'alayna isran kama hamaltahu 'alal-ladhina min qablina",
            en: 'Our Lord, and lay not upon us a burden like that which You laid upon those before us.',
            ref: 'Al-Baqarah 2:286'
        },
        {
            cat: 'rabbana',
            title: 'Rabbana 8 - For Strength',
            ar: 'رَبَّنَا وَلَا تُحَمِّلْنَا مَا لَا طَاقَةَ لَنَا بِهِ',
            tr: "Rabbana wa la tuhammilna ma la taqata lana bih",
            en: 'Our Lord, and burden us not with that which we have no ability to bear.',
            ref: 'Al-Baqarah 2:286'
        },
        {
            cat: 'rabbana',
            title: 'Rabbana 9 - For Pardon',
            ar: 'رَبَّنَا وَاعْفُ عَنَّا وَاغْفِرْ لَنَا وَارْحَمْنَا',
            tr: "Rabbana wa'fu 'anna waghfir lana warhamna",
            en: 'Our Lord, and pardon us, and forgive us, and have mercy upon us.',
            ref: 'Al-Baqarah 2:286'
        },
        {
            cat: 'rabbana',
            title: 'Rabbana 10 - For Victory',
            ar: 'رَبَّنَا أَنْتَ مَوْلَانَا فَانْصُرْنَا عَلَى الْقَوْمِ الْكَافِرِينَ',
            tr: "Rabbana Anta mawlana fansurna 'alal-qawmil-kafirin",
            en: 'Our Lord, You are our protector, so give us victory over the disbelieving people.',
            ref: 'Al-Baqarah 2:286'
        },
        {
            cat: 'rabbana',
            title: 'Rabbana 11 - Against Deviation',
            ar: 'رَبَّنَا لَا تُزِغْ قُلُوبَنَا بَعْدَ إِذْ هَدَيْتَنَا وَهَبْ لَنَا مِنْ لَدُنْكَ رَحْمَةً',
            tr: "Rabbana la tuzigh qulubana ba'da idh hadaytana wa hab lana mil-ladunka rahmah",
            en: 'Our Lord, let not our hearts deviate after You have guided us and grant us from Yourself mercy.',
            ref: 'Ali \'Imran 3:8'
        },
        {
            cat: 'rabbana',
            title: 'Rabbana 12 - For Gathering',
            ar: 'رَبَّنَا إِنَّكَ جَامِعُ النَّاسِ لِيَوْمٍ لَا رَيْبَ فِيهِ',
            tr: "Rabbana innaka jami'un-nasi li-yawmin la rayba fih",
            en: 'Our Lord, surely You will gather the people for a Day about which there is no doubt.',
            ref: 'Ali \'Imran 3:9'
        },
        {
            cat: 'rabbana',
            title: 'Rabbana 13 - For Faith',
            ar: 'رَبَّنَا إِنَّنَا آمَنَّا فَاغْفِرْ لَنَا ذُنُوبَنَا وَقِنَا عَذَابَ النَّارِ',
            tr: "Rabbana innana amanna faghfir lana dhunubana wa qina 'adhaban-nar",
            en: 'Our Lord, indeed we have believed, so forgive us our sins and protect us from the punishment of the Fire.',
            ref: 'Ali \'Imran 3:16'
        },
        {
            cat: 'rabbana',
            title: 'Rabbana 14 - For Belief',
            ar: 'رَبَّنَا آمَنَّا بِمَا أَنْزَلْتَ وَاتَّبَعْنَا الرَّسُولَ فَاكْتُبْنَا مَعَ الشَّاهِدِينَ',
            tr: "Rabbana amanna bima anzalta wattaba'nar-rasula faktubna ma'ash-shahidin",
            en: 'Our Lord, we have believed in what You revealed and have followed the messenger, so register us among the witnesses.',
            ref: 'Ali \'Imran 3:53'
        },
        {
            cat: 'rabbana',
            title: 'Rabbana 15 - For Forgiveness of Sins',
            ar: 'رَبَّنَا اغْفِرْ لَنَا ذُنُوبَنَا وَإِسْرَافَنَا فِي أَمْرِنَا',
            tr: "Rabbanagh-fir lana dhunubana wa israfana fi amrina",
            en: 'Our Lord, forgive us our sins and the excess committed in our affairs.',
            ref: 'Ali \'Imran 3:147'
        },
        {
            cat: 'rabbana',
            title: 'Rabbana 16 - For Steadfastness',
            ar: 'رَبَّنَا وَثَبِّتْ أَقْدَامَنَا وَانْصُرْنَا عَلَى الْقَوْمِ الْكَافِرِينَ',
            tr: "Rabbana wa thabbit aqdamana wansurna 'alal-qawmil-kafirin",
            en: 'Our Lord, and make firm our feet and give us victory over the disbelieving people.',
            ref: 'Ali \'Imran 3:147'
        },
        {
            cat: 'rabbana',
            title: 'Rabbana 17 - Against Punishment',
            ar: 'رَبَّنَا مَا خَلَقْتَ هَذَا بَاطِلًا سُبْحَانَكَ فَقِنَا عَذَابَ النَّارِ',
            tr: "Rabbana ma khalaqta hadha batilan subhanaka faqina 'adhaban-nar",
            en: 'Our Lord, You did not create this aimlessly; exalted are You, so protect us from the punishment of the Fire.',
            ref: 'Ali \'Imran 3:191'
        },
        {
            cat: 'rabbana',
            title: 'Rabbana 18 - For Entry to Fire',
            ar: 'رَبَّنَا إِنَّكَ مَنْ تُدْخِلِ النَّارَ فَقَدْ أَخْزَيْتَهُ',
            tr: "Rabbana innaka man tudkhilin-nara faqad akhzaytah",
            en: 'Our Lord, indeed whoever You admit to the Fire - You have disgraced him.',
            ref: 'Ali \'Imran 3:192'
        },
        {
            cat: 'rabbana',
            title: 'Rabbana 19 - For Hearing the Call',
            ar: 'رَبَّنَا إِنَّنَا سَمِعْنَا مُنَادِيًا يُنَادِي لِلْإِيمَانِ',
            tr: "Rabbana innana sami'na munadiyan yunadi lil-iman",
            en: 'Our Lord, indeed we have heard a caller calling to faith.',
            ref: 'Ali \'Imran 3:193'
        },
        {
            cat: 'rabbana',
            title: 'Rabbana 20 - For Sins Covered',
            ar: 'رَبَّنَا فَاغْفِرْ لَنَا ذُنُوبَنَا وَكَفِّرْ عَنَّا سَيِّئَاتِنَا',
            tr: "Rabbana faghfir lana dhunubana wa kaffir 'anna sayyi'atina",
            en: 'Our Lord, so forgive us our sins and remove from us our misdeeds.',
            ref: 'Ali \'Imran 3:193'
        },
        {
            cat: 'rabbana',
            title: 'Rabbana 21 - For Righteous Death',
            ar: 'رَبَّنَا وَتَوَفَّنَا مَعَ الْأَبْرَارِ',
            tr: "Rabbana wa tawaffana ma'al-abrar",
            en: 'Our Lord, and cause us to die with the righteous.',
            ref: 'Ali \'Imran 3:193'
        },
        {
            cat: 'rabbana',
            title: 'Rabbana 22 - For Promise Fulfillment',
            ar: 'رَبَّنَا وَآتِنَا مَا وَعَدْتَنَا عَلَى رُسُلِكَ',
            tr: "Rabbana wa atina ma wa'adtana 'ala rusulika",
            en: 'Our Lord, and grant us what You promised us through Your messengers.',
            ref: 'Ali \'Imran 3:194'
        },
        {
            cat: 'rabbana',
            title: 'Rabbana 23 - Against Disgrace',
            ar: 'رَبَّنَا وَلَا تُخْزِنَا يَوْمَ الْقِيَامَةِ إِنَّكَ لَا تُخْلِفُ الْمِيعَادَ',
            tr: "Rabbana wa la tukhzina yawmal-qiyamah innaka la tukhliful-mi'ad",
            en: 'Our Lord, and do not disgrace us on the Day of Resurrection. Indeed, You do not fail in Your promise.',
            ref: 'Ali \'Imran 3:194'
        },
        {
            cat: 'rabbana',
            title: 'Rabbana 24 - For Mercy',
            ar: 'رَبَّنَا آمَنَّا فَاغْفِرْ لَنَا وَارْحَمْنَا وَأَنْتَ خَيْرُ الرَّاحِمِينَ',
            tr: "Rabbana amanna faghfir lana warhamna wa Anta khayru-rahimin",
            en: 'Our Lord, we have believed, so forgive us and have mercy upon us, and You are the best of the merciful.',
            ref: 'Al-Mu\'minun 23:109'
        },
        {
            cat: 'rabbana',
            title: 'Rabbana 25 - Against Evil Companions',
            ar: 'رَبَّنَا اصْرِفْ عَنَّا عَذَابَ جَهَنَّمَ إِنَّ عَذَابَهَا كَانَ غَرَامًا',
            tr: "Rabbanasrif 'anna 'adhaba Jahannama inna 'adhabaha kana gharama",
            en: 'Our Lord, avert from us the punishment of Hell. Indeed, its punishment is ever adhering.',
            ref: 'Al-Furqan 25:65'
        },
        {
            cat: 'rabbana',
            title: 'Rabbana 26 - For Righteous Offspring',
            ar: 'رَبَّنَا هَبْ لَنَا مِنْ أَزْوَاجِنَا وَذُرِّيَّاتِنَا قُرَّةَ أَعْيُنٍ',
            tr: "Rabbana hab lana min azwajina wa dhurriyyatina qurrata a'yun",
            en: 'Our Lord, grant us from among our wives and offspring comfort to our eyes.',
            ref: 'Al-Furqan 25:74'
        },
        {
            cat: 'rabbana',
            title: 'Rabbana 27 - For Leadership',
            ar: 'رَبَّنَا وَاجْعَلْنَا لِلْمُتَّقِينَ إِمَامًا',
            tr: "Rabbana waj'alna lil-muttaqina imama",
            en: 'Our Lord, and make us an example for the righteous.',
            ref: 'Al-Furqan 25:74'
        },
        {
            cat: 'rabbana',
            title: 'Rabbana 28 - For Mercy from Lord',
            ar: 'رَبَّنَا آتِنَا مِنْ لَدُنْكَ رَحْمَةً وَهَيِّئْ لَنَا مِنْ أَمْرِنَا رَشَدًا',
            tr: "Rabbana atina mil-ladunka rahmatan wa hayyi' lana min amrina rashada",
            en: 'Our Lord, grant us from Yourself mercy and prepare for us from our affair right guidance.',
            ref: 'Al-Kahf 18:10'
        },
        {
            cat: 'rabbana',
            title: 'Rabbana 29 - For Forgiveness',
            ar: 'رَبَّنَا اغْفِرْ لَنَا وَلِإِخْوَانِنَا الَّذِينَ سَبَقُونَا بِالْإِيمَانِ',
            tr: "Rabbanagh-fir lana wa li-ikhwaninal-ladhina sabaquna bil-iman",
            en: 'Our Lord, forgive us and our brothers who preceded us in faith.',
            ref: 'Al-Hashr 59:10'
        },
        {
            cat: 'rabbana',
            title: 'Rabbana 30 - Against Hatred',
            ar: 'رَبَّنَا وَلَا تَجْعَلْ فِي قُلُوبِنَا غِلًّا لِلَّذِينَ آمَنُوا',
            tr: "Rabbana wa la taj'al fi qulubina ghillan lil-ladhina amanu",
            en: 'Our Lord, and put not in our hearts resentment toward those who have believed.',
            ref: 'Al-Hashr 59:10'
        },
        {
            cat: 'rabbana',
            title: 'Rabbana 31 - For Kindness',
            ar: 'رَبَّنَا إِنَّكَ رَءُوفٌ رَحِيمٌ',
            tr: "Rabbana innaka Ra'ufur-Rahim",
            en: 'Our Lord, indeed You are Kind and Merciful.',
            ref: 'Al-Hashr 59:10'
        },
        {
            cat: 'rabbana',
            title: 'Rabbana 32 - Against Disbelievers',
            ar: 'رَبَّنَا عَلَيْكَ تَوَكَّلْنَا وَإِلَيْكَ أَنَبْنَا وَإِلَيْكَ الْمَصِيرُ',
            tr: "Rabbana 'alayka tawakkalna wa ilayka anabna wa ilaykal-masir",
            en: 'Our Lord, upon You we have relied, and to You we have returned, and to You is the destination.',
            ref: 'Al-Mumtahanah 60:4'
        },
        {
            cat: 'rabbana',
            title: 'Rabbana 33 - Against Trial',
            ar: 'رَبَّنَا لَا تَجْعَلْنَا فِتْنَةً لِلَّذِينَ كَفَرُوا',
            tr: "Rabbana la taj'alna fitnatan lil-ladhina kafaru",
            en: 'Our Lord, make us not a trial for those who disbelieve.',
            ref: 'Al-Mumtahanah 60:5'
        },
        {
            cat: 'rabbana',
            title: 'Rabbana 34 - For Forgiveness',
            ar: 'رَبَّنَا وَاغْفِرْ لَنَا إِنَّكَ أَنْتَ الْعَزِيزُ الْحَكِيمُ',
            tr: "Rabbana waghfir lana innaka Antal-'Azizul-Hakim",
            en: 'Our Lord, and forgive us. Indeed, it is You who is the Exalted in Might, the Wise.',
            ref: 'Al-Mumtahanah 60:5'
        },
        {
            cat: 'rabbana',
            title: 'Rabbana 35 - For Completion of Light',
            ar: 'رَبَّنَا أَتْمِمْ لَنَا نُورَنَا وَاغْفِرْ لَنَا',
            tr: "Rabbana atmim lana nurana waghfir lana",
            en: 'Our Lord, perfect for us our light and forgive us.',
            ref: 'At-Tahrim 66:8'
        },
        {
            cat: 'rabbana',
            title: 'Rabbana 36 - For Power',
            ar: 'رَبَّنَا إِنَّكَ عَلَى كُلِّ شَيْءٍ قَدِيرٌ',
            tr: "Rabbana innaka 'ala kulli shay'in Qadir",
            en: 'Our Lord, indeed You are over all things competent.',
            ref: 'At-Tahrim 66:8'
        },
        {
            cat: 'rabbana',
            title: 'Rabbana 37 - For Salvation',
            ar: 'رَبَّنَا قِنَا عَذَابَ النَّارِ',
            tr: "Rabbana qina 'adhaban-nar",
            en: 'Our Lord, protect us from the punishment of the Fire.',
            ref: 'Ali \'Imran 3:16'
        },
        {
            cat: 'rabbana',
            title: 'Rabbana 38 - For Gratitude',
            ar: 'رَبِّ أَوْزِعْنِي أَنْ أَشْكُرَ نِعْمَتَكَ',
            tr: "Rabbi awzi'ni an ashkura ni'matak",
            en: 'My Lord, enable me to be grateful for Your favor.',
            ref: 'An-Naml 27:19'
        },
        {
            cat: 'rabbana',
            title: 'Rabbana 39 - For Righteous Deeds',
            ar: 'رَبِّ وَأَنْ أَعْمَلَ صَالِحًا تَرْضَاهُ',
            tr: "Rabbi wa an a'mala salihan tardah",
            en: 'My Lord, and enable me to do righteousness of which You approve.',
            ref: 'An-Naml 27:19'
        },
        {
            cat: 'rabbana',
            title: 'Rabbana 40 - For Righteous Offspring',
            ar: 'رَبِّ وَأَدْخِلْنِي فِي عِبَادِكَ الصَّالِحِينَ',
            tr: "Rabbi wa adkhilni fi 'ibadika-ssalihin",
            en: 'My Lord, and admit me among Your righteous servants.',
            ref: 'An-Naml 27:19'
        }, {
            cat: 'rabbana',
            title: 'Good of Both Worlds',
            ar: 'رَبَّنَا آتِنَا فِي الدُّنْيَا حَسَنَةً وَفِي الْآخِرَةِ حَسَنَةً وَقِنَا عَذَابَ النَّارِ',
            tr: "Rabbana atina fid-dunya hasanatan wa fil 'akhirati hasanatan waqina 'adhaban-nar",
            en: 'Our Lord, give us in this world [that which is] good and in the Hereafter [that which is] good and protect us from the punishment of the Fire.',
            ref: 'Al-Baqarah 2:201'
        },
        {
            cat: 'health',
            title: 'Best Dua for Forgiveness (Sayyidul Istighfar)',
            ar: 'اللَّهُمَّ أَنْتَ رَبِّي لا إِلَهَ إِلا أَنْتَ خَلَقْتَنِي وَأَنَا عَبْدُكَ وَأَنَا عَلَى عَهْدِكَ وَوَعْدِكَ مَا اسْتَطَعْتُ أَعُوذُ بِكَ مِنْ شَرِّ مَا صَنَعْتُ أَبُوءُ لَكَ بِنِعْمَتِكَ عَلَيَّ وَأَبُوءُ لَكَ بِذَنْبِي فَاغْفِرْ لِي فَإِنَّهُ لا يَغْفِرُ الذُّنُوبَ إِلا أَنْتَ',
            tr: "Allahumma anta Rabbi la ilaha illa anta, Khalaqtani wa ana 'abduka, wa ana 'ala 'ahdika wa wa'dika mastata'tu, A'udhu bika min sharri ma sana'tu, Abu'u laka bini'matika 'alayya, wa abu'u laka bidhanbi faghfir li fa-innahu la yaghfiru al-dhunuba illa anta",
            en: 'O Allah, You are my Lord. There is no god but You. You created me and I am Your slave. I am abiding to Your covenant and promise as best as I can. I seek refuge in You from the evil I have committed. I acknowledge Your blessings upon me and I acknowledge my sin. So forgive me, for verily no one forgives sins except You.',
            ref: 'Sahih Al-Bukhari'
        },
        {
            cat: 'morning-evening',
            title: 'Upon Waking Up',
            ar: 'الْحَمْدُ لِلَّهِ الَّذِي أَحْيَانَا بَعْدَ مَا أَمَاتَنَا وَإِلَيْهِ النُّشُورُ',
            tr: "Alhamdu lillahil-ladhi ahyana ba'da ma amatana wa ilaihin-nushur",
            en: 'All praise is for Allah who gave us life after having taken it from us and unto Him is the resurrection.',
            ref: 'Sahih Al-Bukhari'
        },
        {
            cat: 'morning-evening',
            title: 'Evening Protection',
            ar: 'أَعُوذُ بِكَلِمَاتِ اللهِ التَّامَّاتِ مِنْ شَرِّ مَا خَلَقَ',
            tr: "A'udhu bikalimatillahi at-tammati min sharri ma khalaq",
            en: 'I seek protection in the perfect words of Allah from every evil that He has created.',
            ref: 'Sahih Muslim'
        },
        {
            cat: 'food-travel',
            title: 'Travel Dua',
            ar: 'سُبْحَانَ الَّذِي سَخَّرَ لَنَا هَذَا وَمَا كُنَّا لَهُ مُقْرِنِينَ وَإِنَّا إِلَى رَبِّنَا لَمُنْقَلِبُونَ',
            tr: "Subhanal-ladhi sakh-khara lana hadha wa ma kunna lahu muqrinin. Wa inna ila Rabbina lamunqalibun",
            en: 'Glory to Him who has brought this [vehicle] under our control, though we were unable to control it ourselves, and indeed, to our Lord we will surely return.',
            ref: 'Az-Zukhruf 43:13-14'
        },
        {
            cat: 'food-travel',
            title: 'Before Eating',
            ar: 'بِسْمِ اللَّهِ وَعَلَى بَرَكَةِ اللَّهِ',
            tr: "Bismillahi wa 'ala barakatillah",
            en: 'In the name of Allah and with the blessings of Allah.',
            ref: 'Sunan Abu Dawud'
        },
        {
            cat: 'food-travel',
            title: 'Leaving Home',
            ar: 'بِسْمِ اللَّهِ تَوَكَّلْتُ عَلَى اللَّهِ، لاَ حَوْلَ وَلاَ قُوَّةَ إِلاَّ بِاللَّهِ',
            tr: "Bismillahi tawakkaltu 'alallahi la hawla wala quwwata illa billah",
            en: 'In the name of Allah, I place my trust in Allah; there is no might and no power except by Allah.',
            ref: 'Sunan Abi Dawud'
        }
    ];

    function renderDuas(cat = 'all') {
        const grid = document.getElementById('duas-grid');
        if (!grid) return;
        const filtered = cat === 'all' ? duas : duas.filter(d => d.cat === cat);
        grid.innerHTML = filtered.map(d => `
            <div class="bg-[var(--pearl-card)] p-6 rounded-[40px] shadow-sm relative overflow-hidden group hover:shadow-lg transition-shadow border-l-4 dark:bg-gray-800 dark:border-gray-700" style="border-left-color:var(--emerald)">
                 <div class="absolute top-0 right-0 p-2 bg-gray-500 rounded-bl-xl text-xs font-bold text-white uppercase shadow-sm">${d.cat}</div>
                 <h3 class="font-bold text-lg mb-2 text-[var(--emerald)] dark:text-[var(--gold)]">${d.title}</h3>
                 <div class="text-right font-[Amiri] text-2xl mb-3 text-gray-700 leading-loose dark:text-gray-200" style="direction:rtl;">${d.ar}</div>
                 <div class="font-medium text-[var(--gold)] mb-2 italic text-sm font-serif opacity-90">${d.tr}</div>
                 <div class="text-gray-500 text-sm italic border-t border-gray-100 pt-3 dark:border-gray-700 dark:text-gray-400">"${d.en}"</div>
                 <div class="text-xs text-gray-400 mt-2 text-right opacity-70">— ${d.ref}</div>
            </div>
        `).join('');
    }
    document.querySelectorAll('.dua-cat-btn').forEach(btn => btn.addEventListener('click', () => { renderDuas(btn.dataset.cat); }));

    // 3D & Mouse
    function initThree() {
        const cont = document.getElementById('canvas-container');
        if (!cont) return;
        const scene = new THREE.Scene();
        const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 100);
        camera.position.z = 6;
        const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
        renderer.setSize(400, 400);
        cont.appendChild(renderer.domElement);
        const geo = new THREE.BoxGeometry(2, 2.2, 2);
        const mat = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.2, metalness: 0.1 }); // Premium matte black base
        const cube = new THREE.Mesh(geo, mat);
        const goldGeo = new THREE.BoxGeometry(2.05, 0.4, 2.05);
        const goldMat = new THREE.MeshStandardMaterial({ color: 0xdddddd, metalness: 0.8, roughness: 0.2 }); // Elegant silver band
        const band = new THREE.Mesh(goldGeo, goldMat);
        band.position.y = 0.5;
        const group = new THREE.Group(); group.add(cube); group.add(band); scene.add(group);
        const light = new THREE.DirectionalLight(0xffffff, 0.8); light.position.set(5, 5, 5); scene.add(light); scene.add(new THREE.AmbientLight(0xffffff, 0.6));
        function animate() { requestAnimationFrame(animate); group.rotation.y += 0.003; group.rotation.x = Math.sin(Date.now() * 0.001) * 0.05; renderer.render(scene, camera); }
        animate();
    }
    function initEffects() {
        // Soft Matte interactions - remove glowing cursor
        document.addEventListener('mousemove', (e) => {
            document.querySelectorAll('.hover-card-3d').forEach(card => {
                const rect = card.getBoundingClientRect();
                const x = e.clientX - rect.left;
                const y = e.clientY - rect.top;
                if (x > 0 && x < rect.width && y > 0 && y < rect.height) {
                    card.style.transform = `perspective(1000px) rotateX(${((y - rect.height / 2) / (rect.height / 2)) * -2}deg) rotateY(${((x - rect.width / 2) / (rect.width / 2)) * 2}deg) scale(1.01)`;
                } else card.style.transform = 'perspective(1000px) scale(1)';
            });
        });
    }

    // --- AUTO GPS CAPTURE ---
    function autoCaptureLocation() {
        // Show loading state on location label
        const locLabel = document.getElementById('portal-location-label');
        if (locLabel) locLabel.textContent = 'Detecting location...';

        if (navigator.geolocation) {
            navigator.geolocation.getCurrentPosition(
                (pos) => {
                    const lat = pos.coords.latitude;
                    const lng = pos.coords.longitude;
                    console.log(`📍 GPS acquired: ${lat.toFixed(4)}, ${lng.toFixed(4)}`);
                    fetchPrayers(lat, lng);
                    // Also trigger calendar update after prayer fetch
                    setTimeout(() => {
                        if (window.fetchHijriCalendar) window.fetchHijriCalendar();
                    }, 500);
                },
                (error) => {
                    console.warn("Auto GPS location acquisition failed:", error.message);
                    // Try IP-based geolocation as secondary fallback
                    ipBasedLocationFallback();
                },
                { enableHighAccuracy: true, timeout: 8000, maximumAge: 300000 }
            );
        } else {
            console.warn("Geolocation is not supported by this browser.");
            ipBasedLocationFallback();
        }
    }

    // --- IP-BASED GEOLOCATION FALLBACK ---
    async function ipBasedLocationFallback() {
        try {
            const res = await fetch('https://api.bigdatacloud.net/data/reverse-geocode-client?localityLanguage=en');
            const data = await res.json();
            if (data.latitude && data.longitude) {
                console.log(`📍 IP-based location: ${data.city || data.locality}, ${data.countryName}`);
                fetchPrayers(data.latitude, data.longitude);
                setTimeout(() => {
                    if (window.fetchHijriCalendar) window.fetchHijriCalendar();
                }, 500);
                return;
            }
        } catch (e) {
            console.warn('IP-based geolocation failed:', e);
        }
        // Final fallback to saved/default
        loadFallbackLocation();
    }

    function loadFallbackLocation() {
        const savedLat = localStorage.getItem('savedLat');
        const savedLng = localStorage.getItem('savedLng');
        if (savedLat && savedLng) {
            fetchPrayers(parseFloat(savedLat), parseFloat(savedLng));
        } else {
            const savedCity = localStorage.getItem('savedCity');
            const savedCountry = localStorage.getItem('savedCountry');
            fetchPrayers(null, null, savedCity || "Hyderabad", savedCountry || "India");
        }
        setTimeout(() => {
            if (window.fetchHijriCalendar) window.fetchHijriCalendar();
        }, 500);
    }

    // --- BOOTSTRAP ---
    autoCaptureLocation();
    updateMasterDates();
    loadDirectory();
    loadNames();
    renderDuas();
    if (window.THREE) initThree();
    initEffects();
    setTimeout(showDailyVerse, 1000);



});

// --- ZAKAT CALCULATOR ---
window.calculateZakat = function () {
    const currency = document.getElementById('zakat-currency')?.value || 'INR';
    const cash = parseFloat(document.getElementById('zakat-cash').value) || 0;
    const gold = parseFloat(document.getElementById('zakat-gold').value) || 0;
    const assets = parseFloat(document.getElementById('zakat-assets').value) || 0;

    const totalWealth = cash + gold + assets;
    const zakatDue = totalWealth * 0.025;

    // Format to 2 decimal places with currency
    const totalEl = document.getElementById('zakat-total');
    if (totalEl) {
        totalEl.innerText = new Intl.NumberFormat('en-US', { style: 'currency', currency: currency }).format(zakatDue);
    }
}



// --- RAMADAN 2026 FEATURE ---
let ramadanInterval;

// --- CALENDAR STATE ---
let calendarCurrentDate = new Date();

window.changeCalPage = function (delta) {
    calendarCurrentDate.setMonth(calendarCurrentDate.getMonth() + delta);
    fetchHijriCalendar();
}

window.fetchHijriCalendar = async function () {
    const month = calendarCurrentDate.getMonth() + 1;
    const year = calendarCurrentDate.getFullYear();
    const city = document.getElementById('prayer-city-select')?.value || globalCity || "Hyderabad";
    const country = document.getElementById('prayer-country-select')?.value || globalCountry || "India";
    const url = `https://api.aladhan.com/v1/calendarByCity/${year}/${month}?city=${city}&country=${country}&method=1`;

    try {
        const res = await fetch(url);
        const data = await res.json();
        
        if (data.code === 200) {
            const results = data.data;
            const firstDay = results[0];
            const hijriMonthEn = firstDay.date.hijri.month.en;
            const hijriYear = firstDay.date.hijri.year;
            
            // Header labels
            document.getElementById('cal-hijri-month-label').innerText = hijriMonthEn;
            document.getElementById('cal-hijri-year-label').innerText = hijriYear + " AH";
            document.getElementById('cal-greg-label').innerText = calendarCurrentDate.toLocaleString('default', { month: 'long', year: 'numeric' });
            
            // Populate grid
            const grid = document.getElementById('cal-grid');
            if (grid) {
                grid.innerHTML = '';
                
                // Padding for first day of month (0 = Sunday)
                const firstDateObj = new Date(year, month - 1, 1);
                const startDay = firstDateObj.getDay();
                for (let i = 0; i < startDay; i++) {
                    grid.innerHTML += `<div class="p-2 opacity-0"></div>`;
                }
                
                let eventsHtml = '';
                const today = new Date();
                let todayHijriStr = "";
                let todayGregStr = "";
                let todayEventStr = "";

                results.forEach(day => {
                    const gDay = parseInt(day.date.gregorian.day, 10);
                    const hDay = parseInt(day.date.hijri.day, 10);
                    const holidays = day.date.hijri.holidays || [];
                    
                    const isToday = (gDay === today.getDate() && month === (today.getMonth()+1) && year === today.getFullYear());
                    const hasEvent = holidays.length > 0;
                    
                    if (isToday) {
                        todayHijriStr = `${hDay} ${day.date.hijri.month.en} ${day.date.hijri.year}`;
                        todayGregStr = day.date.readable;
                        if (hasEvent) todayEventStr = holidays.join(', ');
                    }
                    
                    if (hasEvent) {
                        eventsHtml += `
                            <div class="flex items-center gap-3 p-3 rounded-xl bg-gray-50 dark:bg-gray-700/30 border border-gray-100 dark:border-gray-700">
                                <div class="w-10 h-10 rounded-full bg-[var(--gold)]/10 flex flex-col items-center justify-center shrink-0">
                                    <span class="text-xs font-bold text-[var(--gold)]">${hDay}</span>
                                </div>
                                <div>
                                    <h4 class="text-sm font-bold text-gray-800 dark:text-white">${holidays.join(', ')}</h4>
                                    <p class="text-xs text-gray-500">${day.date.readable}</p>
                                </div>
                            </div>
                        `;
                    }
                    
                    let dotHtml = '';
                    if (hasEvent) dotHtml = `<div class="w-1 h-1 rounded-full bg-[var(--gold)] absolute top-1 right-1"></div>`;
                    
                    let baseClasses = "relative p-2 h-14 border border-transparent rounded-xl flex flex-col items-center justify-center cursor-pointer hover:bg-black/5 dark:hover:bg-white/5 transition-all";
                    let todayClasses = isToday ? "bg-[var(--pearl-card)] ring-2 ring-[var(--gold)] ring-offset-2 ring-offset-[var(--pearl)] text-[var(--text-dark)] shadow-md border-transparent" : "text-gray-800 dark:text-gray-200";
                    let eventClasses = hasEvent ? "ring-2 ring-[var(--gold)] ring-offset-2 ring-offset-[var(--pearl-card)] dark:ring-offset-[var(--pearl-card)]" : "";
                    
                    grid.innerHTML += `
                        <div class="${baseClasses} ${todayClasses} ${eventClasses}">
                            <span class="text-lg md:text-xl font-bold font-mono leading-none ${isToday ? 'text-white' : ''}">${hDay}</span>
                            <span class="text-[9px] md:text-[10px] mt-0.5 ${isToday ? 'text-white/80' : 'text-gray-400 dark:text-gray-500'}">${gDay}</span>
                            ${dotHtml}
                        </div>
                    `;
                });
                
                const eventsList = document.getElementById('cal-events-list');
                if (eventsList) eventsList.innerHTML = eventsHtml || '<p class="text-xs text-gray-500 italic p-2">No special events this month.</p>';
                
                if (todayHijriStr) {
                    const todayHijriEl = document.getElementById('cal-today-hijri');
                    const todayGregEl = document.getElementById('cal-today-greg');
                    const headerDateEl = document.getElementById('portal-current-date');
                    if (todayHijriEl) todayHijriEl.innerText = todayHijriStr;
                    if (todayGregEl) todayGregEl.innerText = todayGregStr;
                    if (headerDateEl) headerDateEl.innerText = todayHijriStr;
                    const eventEl = document.getElementById('cal-today-event');
                    if (eventEl) {
                        if (todayEventStr) {
                            eventEl.classList.remove('hidden');
                            const eventNameEl = document.getElementById('cal-today-event-name');
                            if (eventNameEl) eventNameEl.innerText = todayEventStr;
                        } else {
                            eventEl.classList.add('hidden');
                        }
                    }
                }
                
                // Populate Hijri months ref statically if empty
                const ref = document.getElementById('hijri-months-ref');
                if (ref && ref.children.length === 0) {
                    const monthsList = ["Muharram","Safar","Rabi al-Awwal","Rabi al-Thani","Jumada al-Ula","Jumada al-Akhirah","Rajab","Sha'ban","Ramadan","Shawwal","Dhu al-Qi'dah","Dhu al-Hijjah"];
                    ref.innerHTML = monthsList.map((m, i) => `<div class="flex justify-between text-xs py-1"><span class="text-gray-500">${i+1}.</span><span class="font-semibold dark:text-gray-300">${m}</span></div>`).join('');
                }
            }
        }
    } catch (e) {
        console.error("Calendar Fetch Error", e);
    }
}

// Initialize Calendar
setTimeout(fetchHijriCalendar, 1500);

// --- DUA OF THE DAY ---
const ramadanDuas = [
    {
        arabic: "اللَّهُمَّ إِنَّكَ عَفُوٌّ تُحِبُّ الْعَفْوَ فَاعْفُ عَنِّي",
        translation: "O Allah, You are Forgiving and love forgiveness, so forgive me.",
        ref: "Sunan Tirmidhi"
    },
    {
        arabic: "ذَهَبَ الظَّمَأُ وَابْتَلَّتِ الْعُرُوقُ وَثَبَتَ الأَجْرُ إِنْ شَاءَ اللَّهُ",
        translation: "The thirst is gone, the veins are moistened, and the reward is confirmed, if Allah wills.",
        ref: "Dua for breaking fast (Abu Dawud)"
    },
    {
        arabic: "رَبَّنَا آتِنَا فِي الدُّنْيَا حَسَنَةً وَفِي الْآخِرَةِ حَسَنَةً وَقِنَا عَذَابَ النَّارِ",
        translation: "Our Lord, give us in this world that which is good and in the Hereafter that which is good and protect us from the punishment of the Fire.",
        ref: "Surah Al-Baqarah 2:201"
    },
    {
        arabic: "اللَّهُمَّ إِنِّي أَسْأَلُكَ عِلْمًا نَافِعًا وَرِزْقًا طَيِّبًا وَعَمَلاً مُتَقَبَّلاً",
        translation: "O Allah, I ask You for knowledge that is of benefit, a good provision, and deeds that will be accepted.",
        ref: "Ibn Majah"
    }
];

function displayRandomDua() {
    const randomIndex = Math.floor(Math.random() * ramadanDuas.length);
    const selectedDua = ramadanDuas[randomIndex];

    const arEl = document.getElementById('duaArabic');
    const trEl = document.getElementById('duaTranslation');
    const refEl = document.getElementById('duaReference');

    if (arEl) arEl.innerText = selectedDua.arabic;
    if (trEl) trEl.innerText = `"${selectedDua.translation}"`;
    if (refEl) refEl.innerText = `— ${selectedDua.ref}`;
}

// Initialize Dua on Load
setTimeout(displayRandomDua, 1000);
// Sparkles disabled for Matte UI
// initGlobalSparkles();

// --- GLOBAL SPARKLE BACKGROUND (Disabled) ---
function initGlobalSparkles() {
    // Purposefully left empty for soft paper aesthetic
}

// --- HEADER LIVE CLOCK ---
setInterval(() => {
    const timeEl = document.getElementById('local-time');
    if (timeEl) {
        const now = new Date();
        timeEl.innerText = now.toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
    }
}, 1000);

// --- UX IMPROVEMENTS (Toasts & Welcome Modal) ---
window.showToast = function(message, type = 'success') {
    const container = document.getElementById('toast-container');
    if (!container) return;
    
    const toast = document.createElement('div');
    toast.className = 'toast-notification';
    
    const icon = type === 'success' ? '<i class="fas fa-check-circle"></i>' : 
                 type === 'error' ? '<i class="fas fa-exclamation-circle text-red-500"></i>' : 
                 '<i class="fas fa-info-circle"></i>';
                 
    toast.innerHTML = `${icon} <span>${message}</span>`;
    container.appendChild(toast);
    
    // Animate in
    setTimeout(() => toast.classList.add('toast-show'), 10);
    
    // Remove after 3s
    setTimeout(() => {
        toast.classList.remove('toast-show');
        setTimeout(() => toast.remove(), 300);
    }, 3000);
};

document.addEventListener('DOMContentLoaded', () => {
    // Auto-detect location on first load if default
    if (localStorage.getItem('savedCity') === 'Pune' || !localStorage.getItem('savedCity')) {
        if (navigator.geolocation) {
            navigator.geolocation.getCurrentPosition(
                pos => {
                    const lat = pos.coords.latitude;
                    const lng = pos.coords.longitude;
                    fetch(`https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${lat}&longitude=${lng}&localityLanguage=en`)
                    .then(res => res.json())
                    .then(data => {
                        localStorage.setItem('savedLat', lat);
                        localStorage.setItem('savedLng', lng);
                        localStorage.setItem('savedCity', data.city || data.locality || "Unknown");
                        localStorage.setItem('savedCountry', data.countryName || "Unknown");
                        window.showToast("Location detected automatically!");
                        // Slight delay to allow UI to settle before reload, or just update state directly
                        setTimeout(() => location.reload(), 500);
                    }).catch(() => {
                        console.log("Reverse geocoding failed.");
                    });
                },
                err => {
                    console.log("Geolocation permission denied or failed.");
                },
                { timeout: 5000 }
            );
        }
    } else {
        // Just show a subtle welcome back toast if desired, or nothing for speed
        if (!sessionStorage.getItem('sessionStarted')) {
            sessionStorage.setItem('sessionStarted', 'true');
            // window.showToast("Bismillah. Welcome back!");
        }
    }
});

// ================================================================
// ISLAMIC BOOKS (HADITH) LOGIC
// ================================================================
let currentBookData = null; 
let bookViewMode = localStorage.getItem('bookViewMode') || 'dual';


const ayatulKursiData = {
    metadata: {
        name: "Ayatul Kursi",
        sections: {
            "1": "Surah Al-Baqarah (2:255)"
        }
    },
    hadiths: [
        {
            hadithnumber: 1,
            arabicnumber: 1,
            text_en: "Allah! There is no deity except Him, the Ever-Living, the Sustainer of [all] existence. Neither drowsiness overtakes Him nor sleep. To Him belongs whatever is in the heavens and whatever is on the earth. Who is it that can intercede with Him except by His permission? He knows what is [presently] before them and what will be after them, and they encompass not a thing of His knowledge except for what He wills. His Kursi extends over the heavens and the earth, and their preservation tires Him not. And He is the Most High, the Most Great.",
            text_ar: "اللَّهُ لَا إِلَٰهَ إِلَّا هُوَ الْحَيُّ الْقَيُّومُ ۚ لَا تَأْخُذُهُ سِنَةٌ وَلَا نَوْمٌ ۚ لَّهُ مَا فِي السَّمَاوَاتِ وَمَا فِي الْأَرْضِ ۗ مَن ذَا الَّذِي يَشْفَعُ عِندَهُ إِلَّا بِإِذْنِهِ ۚ يَعْلَمُ مَا بَيْنَ أَيْدِيهِمْ وَمَا خَلْفَهُمْ ۖ وَلَا يُحِيطُونَ بِشَيْءٍ مِّنْ عِلْمِهِ إِلَّا بِمَا شَاءَ ۚ وَسِعَ كُرْسِيُّهُ السَّمَاوَاتِ وَالْأَرْضَ ۖ وَلَا يَئُودُهُ حِفْظُهُمَا ۚ وَهُوَ الْعَلِيُّ الْعَظِيمُ",
            text_trans: "Allahu laaa ilaaha illaa Huwal Hayyul Qayyuum. Laa ta'khuzuhuu sinatunw-wa laa nawm. Lahuu maa fis-samaawaati wa maa fil-ard. Man zallazee yashfa'u 'indahuuu illaa bi-iznih. Ya'lamu maa bayna aydeehim wa maa khalfahum. Wa laa yuheetoona bishai'im-min 'ilmiheee illaa bimaa shaaa'. Wasi'a Kursiyyuhus-samaawaati wal-ard; wa laa ya'ooduhuu hifzuhumaa; wa Huwal 'Aliyyul 'Azeem.",
            text_ur: "اللہ، اس کے سوا کوئی عبادت کے لائق نہیں، وہ زندہ ہے اور سب کو تھامنے والا ہے، اسے نہ اونگھ آتی ہے نہ نیند، اسی کا ہے جو کچھ آسمانوں اور زمین میں ہے، کون ہے جو اس کی اجازت کے بغیر اس کے پاس سفارش کر سکے، وہ جانتا ہے جو ان کے آگے ہے اور جو ان کے پیچھے ہے، اور وہ اس کے علم میں سے کسی چیز کا احاطہ نہیں کر سکتے مگر جتنا وہ چاہے، اس کی کرسی آسمانوں اور زمین کو گھیرے ہوئے ہے، اور ان کی حفاظت اسے تھکاتی نہیں، اور وہ سب سے بلند، سب سے بڑا ہے۔",
            reference: { book: 1, hadith: 1 },
            grades: []
        }
    ]
};

const fourQulsData = {
    metadata: {
        name: "The 4 Quls",
        sections: {
            "1": "Surah Al-Kafirun (109)",
            "2": "Surah Al-Ikhlas (112)",
            "3": "Surah Al-Falaq (113)",
            "4": "Surah An-Nas (114)"
        }
    },
    hadiths: [
        {
            hadithnumber: 1, arabicnumber: 1,
            text_en: "Say, O disbelievers. I do not worship what you worship. Nor are you worshippers of what I worship. Nor will I be a worshipper of what you worship. Nor will you be worshippers of what I worship. For you is your religion, and for me is my religion.",
            text_ar: "قُلْ يَا أَيُّهَا الْكَافِرُونَ ۝ لَا أَعْبُدُ مَا تَعْبُدُونَ ۝ وَلَا أَنتُمْ عَابِدُونَ مَا أَعْبُدُ ۝ وَلَا أَنَا عَابِدٌ مَّا عَبَدتُّمْ ۝ وَلَا أَنتُمْ عَابِدُونَ مَا أَعْبُدُ ۝ لَكُمْ دِينُكُمْ وَلِيَ دِينِ",
            text_trans: "Qul yaaa-ayyuhal kaafiroon. Laaa a'budu maa ta'budoon. Wa laaa antum 'aabidoona maaa a'bud. Wa laaa ana 'aabidum-maa 'abattum. Wa laaa antum 'aabidoona maaa a'bud. Lakum deenukum wa liya deen.",
            text_ur: "کہہ دو اے کافرو! میں ان کی عبادت نہیں کرتا جن کی تم عبادت کرتے ہو۔ اور نہ تم اس کی عبادت کرنے والے ہو جس کی میں عبادت کرتا ہوں۔ اور نہ میں ان کی عبادت کرنے والا ہوں جن کی تم نے عبادت کی۔ اور نہ تم اس کی عبادت کرنے والے ہو جس کی میں عبادت کرتا ہوں۔ تمہارے لیے تمہارا دین ہے اور میرے لیے میرا دین۔",
            reference: { book: 1, hadith: 1 }, grades: []
        },
        {
            hadithnumber: 2, arabicnumber: 2,
            text_en: "Say, He is Allah, [who is] One. Allah, the Eternal Refuge. He neither begets nor is born. Nor is there to Him any equivalent.",
            text_ar: "قُلْ هُوَ اللَّهُ أَحَدٌ ۝ اللَّهُ الصَّمَدُ ۝ لَمْ يَلِدْ وَلَمْ يُولَدْ ۝ وَلَمْ يَكُن لَّهُ كُفُوًا أَحَدٌ",
            text_trans: "Qul Huwal-laahu Ahad. Allahus-Samad. Lam yalid wa lam yoolad. Wa lam yakul-lahuu kufuwan ahad.",
            text_ur: "کہہ دو وہ اللہ ایک ہے۔ اللہ بے نیاز ہے۔ نہ اس کی کوئی اولاد ہے اور نہ وہ کسی کی اولاد ہے۔ اور اس کے برابر کا کوئی نہیں ہے۔",
            reference: { book: 2, hadith: 1 }, grades: []
        },
        {
            hadithnumber: 3, arabicnumber: 3,
            text_en: "Say, I seek refuge in the Lord of daybreak. From the evil of that which He created. And from the evil of darkness when it settles. And from the evil of the blowers in knots. And from the evil of an envier when he envies.",
            text_ar: "قُلْ أَعُوذُ بِرَبِّ الْفَلَقِ ۝ مِن شَرِّ مَا خَلَقَ ۝ وَمِن شَرِّ غَاسِقٍ إِذَا وَقَبَ ۝ وَمِن شَرِّ النَّفَّاثَاتِ فِي الْعُقَدِ ۝ وَمِن شَرِّ حَاسِدٍ إِذَا حَسَدَ",
            text_trans: "Qul a'oozu birabbil-falaq. Min sharri maa khalaq. Wa min sharri ghaasiqin izaa waqab. Wa min sharrin-naffaa-saati fil-'uqad. Wa min sharri haasidin izaa hasad.",
            text_ur: "کہہ دو میں صبح کے رب کی پناہ مانگتا ہوں۔ ہر اس چیز کے شر سے جو اس نے پیدا کی۔ اور اندھیرے کے شر سے جب وہ چھا جائے۔ اور گرہوں میں پھونکنے والیوں کے شر سے۔ اور حسد کرنے والے کے شر سے جب وہ حسد کرے۔",
            reference: { book: 3, hadith: 1 }, grades: []
        },
        {
            hadithnumber: 4, arabicnumber: 4,
            text_en: "Say, I seek refuge in the Lord of mankind. The Sovereign of mankind. The God of mankind. From the evil of the retreating whisperer. Who whispers [evil] into the breasts of mankind. From among the jinn and mankind.",
            text_ar: "قُلْ أَعُوذُ بِرَبِّ النَّاسِ ۝ مَلِكِ النَّاسِ ۝ إِلَٰهِ النَّاسِ ۝ مِن شَرِّ الْوَسْوَاسِ الْخَنَّاسِ ۝ الَّذِي يُوَسْوِسُ فِي صُدُورِ النَّاسِ ۝ مِنَ الْجِنَّةِ وَالنَّاسِ",
            text_trans: "Qul a'oozu birabbin-naas. Malikin-naas. Ilaahin-naas. Min sharril-waswaasil-khannaas. Allazee yuwaswisu fee sudoorin-naas. Minal-jinnati wan-naas.",
            text_ur: "کہہ دو میں لوگوں کے رب کی پناہ مانگتا ہوں۔ لوگوں کے بادشاہ کی۔ لوگوں کے معبود کی۔ وسوسہ ڈالنے والے، پیچھے ہٹ جانے والے کے شر سے۔ جو لوگوں کے سینوں میں وسوسہ ڈالتا ہے۔ جنوں میں سے ہو یا انسانوں میں سے۔",
            reference: { book: 4, hadith: 1 }, grades: []
        }
    ]
};

window.openHadithBook = async function(bookId, title) {
    const modal = document.getElementById('book-reader-modal');
    const contentArea = document.getElementById('book-reader-content');
    const titleEl = document.getElementById('book-reader-title');
    const subtitleEl = document.getElementById('book-reader-subtitle');
    const selectEl = document.getElementById('book-chapter-select');
    const loadingEl = document.getElementById('book-loading');
    
    // Set UI to loading state
    titleEl.textContent = title;
    subtitleEl.textContent = "Fetching Book Data...";
    contentArea.innerHTML = "";
    selectEl.innerHTML = '<option value="">Loading...</option>';
    document.getElementById('book-view-mode').value = bookViewMode;
    
    modal.classList.remove('hidden');
    modal.classList.add('flex');
    loadingEl.classList.remove('hidden');
    
    try {
        if (bookId === 'ayatul-kursi') {
            currentBookData = ayatulKursiData;
        } else if (bookId === '4-quls') {
            currentBookData = fourQulsData;
        } else {
            // Fetch Arabic, English and Urdu simultaneously
            const [engRes, araRes, urdRes] = await Promise.all([
                fetch(`https://cdn.jsdelivr.net/gh/fawazahmed0/hadith-api@1/editions/eng-${bookId}.min.json`),
                fetch(`https://cdn.jsdelivr.net/gh/fawazahmed0/hadith-api@1/editions/ara-${bookId}.min.json`),
                fetch(`https://cdn.jsdelivr.net/gh/fawazahmed0/hadith-api@1/editions/urd-${bookId}.min.json`).catch(() => null)
            ]);
            
            const engData = await engRes.json();
            const araData = await araRes.json();
            let urdData = null;
            if (urdRes && urdRes.ok) urdData = await urdRes.json();
            
            // Merge data
            const sections = engData.metadata.sections;
            currentBookData = {
                metadata: engData.metadata,
                hadiths: []
            };
            
            // Combine text by hadith number
            const araHadiths = {};
            araData.hadiths.forEach(h => {
                araHadiths[h.hadithnumber] = h.text;
            });

            const urdHadiths = {};
            if (urdData) {
                urdData.hadiths.forEach(h => {
                    urdHadiths[h.hadithnumber] = h.text;
                });
            }
            
            engData.hadiths.forEach(h => {
                currentBookData.hadiths.push({
                    hadithnumber: h.hadithnumber,
                    arabicnumber: h.arabicnumber,
                    text_en: h.text,
                    text_ar: araHadiths[h.hadithnumber] || "",
                    text_ur: urdHadiths[h.hadithnumber] || "",
                    text_trans: h.text_trans || "",
                    reference: h.reference || { book: 1, hadith: h.hadithnumber },
                    grades: h.grades || []
                });
            });
        }
        
        const sections = currentBookData.metadata.sections;

        
        // Populate chapters
        selectEl.innerHTML = "";
        let firstValidChapter = null;
        Object.keys(sections).sort((a,b)=>parseInt(a)-parseInt(b)).forEach(key => {
            if (sections[key] && sections[key].trim() !== "") {
                if(firstValidChapter === null) firstValidChapter = key;
                const opt = document.createElement('option');
                opt.value = key;
                opt.className = "bg-[var(--emerald-deep)] text-white";
                opt.textContent = `Chapter ${key}: ${sections[key].substring(0, 40)}${sections[key].length > 40 ? '...' : ''}`;
                selectEl.appendChild(opt);
            }
        });
        
        subtitleEl.textContent = `${currentBookData.hadiths.length} Hadiths Total`;
        loadingEl.classList.add('hidden');
        
        if (firstValidChapter) {
            selectEl.value = firstValidChapter;
            renderHadithChapter(firstValidChapter);
        } else {
            contentArea.innerHTML = `<p class="text-center text-white/50">No chapters found.</p>`;
        }
        
    } catch (err) {
        console.error("Error loading Hadith book:", err);
        loadingEl.classList.add('hidden');
        contentArea.innerHTML = `<div class="text-center text-red-400 py-10"><i class="fas fa-exclamation-triangle text-4xl mb-4"></i><br/>Failed to load book data. Please try again.</div>`;
    }
};

window.closeBookReader = function() {
    const modal = document.getElementById('book-reader-modal');
    modal.classList.add('hidden');
    modal.classList.remove('flex');
    currentBookData = null; // Free up memory
};

window.changeBookChapter = function(chapterId) {
    if (!currentBookData) return;
    renderHadithChapter(chapterId);
};

window.changeBookViewMode = function(mode) {
    bookViewMode = mode;
    localStorage.setItem('bookViewMode', mode);
    const select = document.getElementById('book-chapter-select');
    if (select.value) {
        renderHadithChapter(select.value);
    }
};

function renderHadithChapter(chapterId) {
    const contentArea = document.getElementById('book-reader-content');
    contentArea.innerHTML = "";
    
    // Filter hadiths by chapter (book)
    const chapterHadiths = currentBookData.hadiths.filter(h => h.reference && h.reference.book.toString() === chapterId.toString());
    
    if (chapterHadiths.length === 0) {
        contentArea.innerHTML = `<p class="text-center text-white/50 py-10">No hadiths found in this chapter.</p>`;
        return;
    }
    
    let html = '';
    
    chapterHadiths.forEach(h => {
        let arabicHtml = '';
        let englishHtml = '';
        let urduHtml = '';
        let transHtml = '';
        
        if (bookViewMode === 'dual' || bookViewMode === 'tri' || bookViewMode === 'ara-urd' || bookViewMode === 'ara') {
            arabicHtml = `<div class="text-2xl md:text-3xl leading-[2.2] font-[Amiri] text-right text-white mb-4" dir="rtl">${h.text_ar}</div>`;
        }
        
        // Transliteration shows below Arabic if available
        if (h.text_trans && (bookViewMode !== 'eng' && bookViewMode !== 'urd')) {
            transHtml = `<div class="text-sm md:text-base font-medium italic text-[var(--gold)]/80 mb-6 leading-relaxed tracking-wide">${h.text_trans}</div>`;
        }

        if (bookViewMode === 'tri' || bookViewMode === 'ara-urd' || bookViewMode === 'urd') {
            if (h.text_ur) {
                urduHtml = `<div class="text-xl md:text-2xl leading-[2.0] font-[Amiri] text-right text-[var(--gold)] mb-6" dir="rtl">${h.text_ur}</div>`;
            } else {
                urduHtml = `<div class="text-sm text-right text-[var(--gold)]/50 mb-6 italic" dir="rtl">(Urdu translation not available)</div>`;
            }
        }
        
        if (bookViewMode === 'dual' || bookViewMode === 'tri' || bookViewMode === 'eng') {
            englishHtml = `<div class="text-lg md:text-xl font-[Cormorant_Garamond] leading-relaxed text-[var(--pearl-card)]">${h.text_en}</div>`;
        }
        
        html += `
            <div class="hadith-card bg-[var(--emerald-deep)]/40 border border-white/5 rounded-2xl p-6 md:p-8 mb-6 hover:border-[var(--gold)]/30 transition-all">
                <div class="flex items-center justify-between mb-6 pb-4 border-b border-white/5">
                    <div class="flex items-center gap-3">
                        <div class="w-8 h-8 rounded-full bg-[var(--gold)]/20 text-[var(--gold)] flex items-center justify-center text-sm font-bold border border-[var(--gold)]/30">
                            ${h.hadithnumber}
                        </div>
                        <span class="text-xs uppercase tracking-wider text-white/40">${currentBookData.metadata.name === 'Ayatul Kursi' ? 'Verse' : (currentBookData.metadata.name === 'The 4 Quls' ? 'Surah' : 'Hadith')}</span>
                    </div>
                </div>
                
                ${arabicHtml}
                ${transHtml}
                ${urduHtml}
                ${englishHtml}
            </div>
        `;
    });
    
    contentArea.innerHTML = html;
    document.getElementById('book-reader-scroll').scrollTop = 0;
}

// Fetch Daily Ayah
async function fetchDailyAyah() {
    try {
        // Fetch a random ayah between 1 and 6236
        const randomAyahNumber = Math.floor(Math.random() * 6236) + 1;
        
        // Fetch Arabic text
        const arRes = await fetch(`http://api.alquran.cloud/v1/ayah/${randomAyahNumber}/quran-uthmani`);
        const arData = await arRes.json();
        
        // Fetch English translation
        const enRes = await fetch(`http://api.alquran.cloud/v1/ayah/${randomAyahNumber}/en.asad`);
        const enData = await enRes.json();
        
        if (arData.code === 200 && enData.code === 200) {
            document.getElementById('daily-ayah-arabic').innerText = arData.data.text;
            document.getElementById('daily-ayah-translation').innerText = `"${enData.data.text}"`;
            document.getElementById('daily-ayah-reference').innerText = `${arData.data.surah.englishName} (${arData.data.surah.number}:${arData.data.numberInSurah})`;
        }
    } catch (error) {
        console.error("Failed to fetch daily ayah:", error);
    }
}
fetchDailyAyah();

// Day / Night Mode Toggle Logic
document.addEventListener('DOMContentLoaded', () => {
    const themeBtn = document.getElementById('theme-toggle');
    const themeIcon = document.getElementById('theme-toggle-icon');
    
    // Check saved theme preference or default to dark
    const savedTheme = localStorage.getItem('portal_theme') || 'dark';
    if (savedTheme === 'dark') {
        document.body.classList.add('dark');
        if (themeIcon) themeIcon.className = 'fas fa-sun text-xs text-yellow-400';
    } else {
        document.body.classList.remove('dark');
        if (themeIcon) themeIcon.className = 'fas fa-moon text-xs text-gray-600';
    }

    if (themeBtn) {
        themeBtn.addEventListener('click', () => {
            document.body.classList.toggle('dark');
            const isDark = document.body.classList.contains('dark');
            localStorage.setItem('portal_theme', isDark ? 'dark' : 'light');
            if (themeIcon) {
                themeIcon.className = isDark ? 'fas fa-sun text-xs text-yellow-400' : 'fas fa-moon text-xs text-gray-600';
            }
        });
    }
});
