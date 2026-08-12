// ================================================================
// SETTINGS & DASHBOARD WEB INTERFACE LOGIC
// ================================================================

document.addEventListener('DOMContentLoaded', () => {

    // --- 1. THEMING & PERSISTENCE ---
    const themeToggleBtn = document.getElementById('theme-toggle-btn');
    const themeIcon = document.getElementById('theme-icon');
    
    // Check saved theme or default to dark
    const savedTheme = localStorage.getItem('omniroute_theme') || 'dark';
    setTheme(savedTheme);

    themeToggleBtn.addEventListener('click', () => {
        const currentTheme = document.documentElement.getAttribute('data-theme');
        const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
        setTheme(newTheme);
    });

    function setTheme(theme) {
        document.documentElement.setAttribute('data-theme', theme);
        localStorage.setItem('omniroute_theme', theme);
        if (theme === 'dark') {
            themeIcon.className = 'fas fa-sun';
            themeToggleBtn.title = 'Switch to Light Theme';
        } else {
            themeIcon.className = 'fas fa-moon';
            themeToggleBtn.title = 'Switch to Dark Theme';
        }
    }

    // --- 2. SIDEBAR COLLAPSE TOGGLE ---
    const sidebar = document.getElementById('sidebar');
    const sidebarToggleBtn = document.getElementById('sidebar-toggle-btn');

    sidebarToggleBtn.addEventListener('click', () => {
        sidebar.classList.toggle('collapsed');
    });

    // Sidebar search filter
    const sidebarSearchInput = document.getElementById('sidebar-search-input');
    const navItems = document.querySelectorAll('.nav-item');

    sidebarSearchInput.addEventListener('input', (e) => {
        const query = e.target.value.toLowerCase();
        navItems.forEach(item => {
            const title = item.querySelector('.nav-title')?.innerText.toLowerCase() || '';
            const subtitle = item.querySelector('.nav-subtitle')?.innerText.toLowerCase() || '';
            if (title.includes(query) || subtitle.includes(query)) {
                item.style.display = 'flex';
            } else {
                item.style.display = 'none';
            }
        });
    });

    // Navigation item active state & Breadcrumb update
    navItems.forEach(item => {
        item.addEventListener('click', () => {
            navItems.forEach(i => i.classList.remove('active'));
            item.classList.add('active');
            const title = item.querySelector('.nav-title').innerText;
            document.getElementById('breadcrumb-current').innerText = title;
        });
    });

    // --- 3. PILL FILTER TABS ---
    const pillTabs = document.querySelectorAll('.pill-tab');
    const cards = document.querySelectorAll('.card');

    pillTabs.forEach(tab => {
        tab.addEventListener('click', () => {
            pillTabs.forEach(t => t.classList.remove('active'));
            tab.classList.add('active');

            const filter = tab.getAttribute('data-filter');
            cards.forEach(card => {
                const category = card.getAttribute('data-category');
                if (filter === 'all' || category === filter) {
                    card.style.display = 'block';
                } else {
                    card.style.display = 'none';
                }
            });
        });
    });

    // --- 4. ACCORDION EXPAND/COLLAPSE CARDS ---
    cards.forEach(card => {
        const header = card.querySelector('.card-header');
        header.addEventListener('click', () => {
            card.classList.toggle('expanded');
        });
    });

    // --- 5. INPUT FIELD CLEAR (X) BUTTONS ---
    const clearBtns = document.querySelectorAll('.clear-btn');

    clearBtns.forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const input = btn.previousElementSibling;
            if (input && input.tagName === 'INPUT') {
                input.value = '';
                input.focus();
            }
        });
    });

    // --- 6. CODE BLOCK COPY TO CLIPBOARD ---
    const copyBtns = document.querySelectorAll('.copy-btn');

    copyBtns.forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const targetId = btn.getAttribute('data-copy-target');
            const codeContent = document.getElementById(targetId)?.innerText;
            if (codeContent) {
                navigator.clipboard.writeText(codeContent).then(() => {
                    const originalHTML = btn.innerHTML;
                    btn.innerHTML = '<i class="fas fa-check"></i> Copied!';
                    btn.style.backgroundColor = 'rgba(16, 185, 129, 0.3)';
                    showToast('Code snippet copied to clipboard!');
                    setTimeout(() => {
                        btn.innerHTML = originalHTML;
                        btn.style.backgroundColor = '';
                    }, 2000);
                });
            }
        });
    });

    // --- 7. QUICK NAV (⌘K) MODAL ---
    const quickNavBtn = document.getElementById('quick-nav-btn');
    const quickNavModal = document.getElementById('quick-nav-modal');
    const modalSearchInput = document.getElementById('modal-search-input');
    const commandItems = document.querySelectorAll('.command-item');

    function openModal() {
        quickNavModal.classList.add('active');
        modalSearchInput.focus();
        modalSearchInput.value = '';
        filterCommands('');
    }

    function closeModal() {
        quickNavModal.classList.remove('active');
    }

    quickNavBtn.addEventListener('click', openModal);

    quickNavModal.addEventListener('click', (e) => {
        if (e.target === quickNavModal) {
            closeModal();
        }
    });

    // Keyboard shortcut listener (Cmd+K / Ctrl+K & ESC)
    document.addEventListener('keydown', (e) => {
        if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
            e.preventDefault();
            if (quickNavModal.classList.contains('active')) {
                closeModal();
            } else {
                openModal();
            }
        }
        if (e.key === 'Escape' && quickNavModal.classList.contains('active')) {
            closeModal();
        }
    });

    // Modal Search Filtering
    modalSearchInput.addEventListener('input', (e) => {
        filterCommands(e.target.value.toLowerCase());
    });

    function filterCommands(query) {
        commandItems.forEach(item => {
            const text = item.innerText.toLowerCase();
            if (text.includes(query)) {
                item.style.display = 'flex';
            } else {
                item.style.display = 'none';
            }
        });
    }

    commandItems.forEach(item => {
        item.addEventListener('click', () => {
            const action = item.getAttribute('data-action');
            closeModal();
            if (action === 'theme') {
                themeToggleBtn.click();
            } else if (action === 'restart') {
                document.getElementById('restart-btn').click();
            } else {
                // Filter pill tab
                const targetTab = document.querySelector(`.pill-tab[data-filter="${action}"]`);
                if (targetTab) {
                    targetTab.click();
                } else {
                    showToast(`Navigated to ${item.innerText}`);
                }
            }
        });
    });

    // --- 8. ACTION BUTTON HANDLERS & TOAST ---
    const applyBtn = document.getElementById('apply-btn');
    const resetBtn = document.getElementById('reset-btn');
    const manualConfigBtn = document.getElementById('manual-config-btn');
    const restartBtn = document.getElementById('restart-btn');
    const shutdownBtn = document.getElementById('shutdown-btn');
    const backupsLink = document.getElementById('backups-link');

    applyBtn.addEventListener('click', () => {
        showToast('Configuration applied & deployed to gateway!');
    });

    resetBtn.addEventListener('click', () => {
        showToast('All fields reset to default values.');
    });

    manualConfigBtn.addEventListener('click', () => {
        showToast('Opening raw JSON config editor...');
    });

    restartBtn.addEventListener('click', () => {
        if (confirm('Are you sure you want to restart the OmniRoute Gateway service?')) {
            showToast('Restarting OmniRoute Gateway service...');
        }
    });

    shutdownBtn.addEventListener('click', () => {
        if (confirm('Are you sure you want to shutdown the gateway service?')) {
            showToast('Shutdown signal sent to gateway process.');
        }
    });

    backupsLink.addEventListener('click', (e) => {
        e.preventDefault();
        showToast('Loading configuration backups & snapshots...');
    });

    // Toast helper
    const toast = document.getElementById('toast');
    const toastMessage = document.getElementById('toast-message');
    let toastTimeout;

    function showToast(msg) {
        toastMessage.innerText = msg;
        toast.classList.add('show');
        clearTimeout(toastTimeout);
        toastTimeout = setTimeout(() => {
            toast.classList.remove('show');
        }, 3000);
    }

});
