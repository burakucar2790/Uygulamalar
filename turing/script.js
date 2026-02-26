let db = JSON.parse(localStorage.getItem('turing_v14'));
if (!db) { db = { folders: [{id: 1, name: 'Turing Belgeleri', parentId: null}], words: [], notes: [] }; }
if(!db.notes) db.notes = [];
if(!db.games) db.games = [];

let currentPath = null; let historyStack = [null]; let historyIndex = 0;
let selectedItems = new Set(); let ctxTarget = null; let clipboard = { items: new Set() };
let uiIsHidden = false;
let undoStack = [];
let redoStack = [];
let creationContext = null; // Yeni öğe oluşturulurken hedef konumu tutar
let dragOffset = { x: 0, y: 0 }; // Sürükleme sırasında fare ofseti
let contentAreaEventsInitialized = false; // Gezgin seçim kutusu olaylarının bir kez bağlanması için bayrak

const svgFolder = `<svg class="folder-icon" viewBox="0 0 100 100"><path d="M10 25 Q 10 15 20 15 L 40 15 Q 45 15 50 20 L 60 30 L 85 30 Q 95 30 95 40 L 95 85 Q 95 95 85 95 L 15 95 Q 5 95 5 85 Z"/></svg>`;
const svgTreeFolder = `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="#64748b" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path></svg>`;
const svgNote = `<svg class="note-icon" viewBox="0 0 100 100"><rect x="20" y="10" width="60" height="80" rx="6" fill="#fff" stroke="#94a3b8" stroke-width="4"/><line x1="35" y1="35" x2="65" y2="35" stroke="#cbd5e1" stroke-width="4" stroke-linecap="round"/><line x1="35" y1="50" x2="65" y2="50" stroke="#cbd5e1" stroke-width="4" stroke-linecap="round"/><line x1="35" y1="65" x2="50" y2="65" stroke="#cbd5e1" stroke-width="4" stroke-linecap="round"/></svg>`;
const svgGame = `<svg class="game-icon" viewBox="0 0 24 24" fill="none" stroke="#8b5cf6" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="6" width="20" height="12" rx="2"/><path d="M6 12h4m-2-2v4"/><path d="M15 11h.01"/><path d="M18 13h.01"/></svg>`;
let availableVoices = [];

function saveDB() { localStorage.setItem('turing_v14', JSON.stringify(db)); renderAll(); }
function speakText(text, lang) {
    if (!text || typeof window.speechSynthesis === 'undefined') return;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);

    const savedVoiceURI = localStorage.getItem('turing_speech_voice');
    const savedRate = localStorage.getItem('turing_speech_rate');

    if (savedVoiceURI && savedVoiceURI !== 'default' && availableVoices.length > 0) {
        const selectedVoice = availableVoices.find(v => v.voiceURI === savedVoiceURI);
        if (selectedVoice) {
            utterance.voice = selectedVoice;
        }
    } else {
        // Fallback to lang if no specific voice is set
        utterance.lang = lang;
    }

    utterance.rate = savedRate ? parseFloat(savedRate) : 0.9;

    window.speechSynthesis.speak(utterance);
}
function speakHtmlContent(elementId, lang) { const el = document.getElementById(elementId); if(!el) return; speakText(el.innerText || el.textContent, lang); }
function execCmd(command) { document.execCommand(command, false, null); document.getElementById('nContent').focus(); }
function searchGoogleImage() { const word = document.getElementById('wEn').value.trim(); if(!word) { alert("Önce İngilizce kelimeyi girin."); return; } window.open("https://www.google.com/search?tbm=isch&q=" + encodeURIComponent(word), '_blank'); }

function navigateTo(folderId, recordHistory = true) {
    currentPath = folderId;
    if(recordHistory) { historyStack = historyStack.slice(0, historyIndex + 1); if(historyStack[historyStack.length-1] !== folderId) { historyStack.push(folderId); historyIndex++; } }
    selectedItems.clear(); document.getElementById('searchBox').value = ''; document.getElementById('contentArea').classList.remove('show-checkboxes');

    // Mobil görünümde, bir klasöre tıklandığında yan menüyü kapat
    if (document.body.classList.contains('mobile-view')) {
        toggleMobileSidebar(true);
    }

    renderAll(); updateNavButtons();
}

function goBack() { if(historyIndex > 0) { historyIndex--; navigateTo(historyStack[historyIndex], false); } }
function goForward() { if(historyIndex < historyStack.length - 1) { historyIndex++; navigateTo(historyStack[historyIndex], false); } }
function goUp() { 
    if (currentPath !== null) { const f = db.folders.find(x => x.id === currentPath); navigateTo(f ? f.parentId : null); } 
}
function updateNavButtons() { 
    const bBack = document.getElementById('btnBack');
    const bFwd = document.getElementById('btnForward');
    if(bBack) bBack.disabled = historyIndex === 0; 
    if(bFwd) bFwd.disabled = historyIndex === historyStack.length - 1; 
}

function toggleSelect(type, id, e) { e.stopPropagation(); const key = `${type}-${id}`; if(e.ctrlKey || e.shiftKey) { if(selectedItems.has(key)) selectedItems.delete(key); else selectedItems.add(key); } else { selectedItems.clear(); selectedItems.add(key); } renderContent(); }
function chkClick(e, type, id) { e.stopPropagation(); const key = `${type}-${id}`; if(e.target.checked) selectedItems.add(key); else selectedItems.delete(key); renderContent(); }
function clearSelection() { selectedItems.clear(); document.getElementById('contentArea').classList.remove('show-checkboxes'); renderContent(); }

function selectAll() {
    closeAllMenus(); // Menü kapansın
    selectedItems.clear(); const search = document.getElementById('searchBox').value.toLowerCase();
    
    let fList = search ? db.folders.filter(f => !f.isDeleted && f.name.toLowerCase().includes(search)) : db.folders.filter(f => !f.isDeleted && f.parentId === currentPath);
    let wList = search ? db.words.filter(w => !w.isDeleted && (w.en.toLowerCase().includes(search) || w.tr.toLowerCase().includes(search))) : db.words.filter(w => !w.isDeleted && w.fid === currentPath);
    let nList = search ? db.notes.filter(n => !n.isDeleted && n.title.toLowerCase().includes(search)) : db.notes.filter(n => !n.isDeleted && n.fid === currentPath);
    let gList = search ? db.games.filter(g => !g.isDeleted && g.title.toLowerCase().includes(search)) : db.games.filter(g => !g.isDeleted && g.fid === currentPath);
    
    if (currentPath === 'trash') {
        fList = db.folders.filter(f => f.isDeleted);
        wList = db.words.filter(w => w.isDeleted);
        nList = db.notes.filter(n => n.isDeleted);
        gList = db.games.filter(g => g.isDeleted);
    }

    fList.forEach(f => selectedItems.add(`folder-${f.id}`));
    wList.forEach(w => selectedItems.add(`word-${w.id}`));
    nList.forEach(n => selectedItems.add(`note-${n.id}`));
    gList.forEach(g => selectedItems.add(`game-${g.id}`));
    
    document.getElementById('contentArea').classList.add('show-checkboxes'); renderContent();
}

function buildTreeHTML(parentId) {
    let html = ''; const children = db.folders.filter(f => !f.isDeleted && f.parentId === parentId); if (children.length === 0) return '';
    html += `<div class="tree-children">`;
    children.forEach(f => { 
        let iconHtml = svgTreeFolder;
        if(f.color) { iconHtml = svgTreeFolder.replace('stroke="#64748b"', `stroke="${f.color}"`); }
        html += `<div class="tree-item ${currentPath === f.id ? 'active' : ''}" onclick="navigateTo(${f.id}); event.stopPropagation();" ondragover="allowDrop(event)" ondragleave="dragLeave(event)" ondrop="drop(event, ${f.id})">${iconHtml} <span>${f.name}</span></div>${buildTreeHTML(f.id)}`; 
    });
    html += `</div>`; return html;
}

function renderSidebar() { 
    const el = document.getElementById('sidebarTree');
    if(!el) return;
    el.innerHTML = `<div class="tree-item ${currentPath === null ? 'active' : ''}" onclick="navigateTo(null)" ondragover="allowDrop(event)" ondragleave="dragLeave(event)" ondrop="drop(event, null)">${svgTreeFolder} <span>Belgelerim</span></div>${buildTreeHTML(null)}<div class="ctx-divider"></div><div class="tree-item ${currentPath === 'trash' ? 'active' : ''}" onclick="navigateTo('trash')">🗑️ <span>Geri Dönüşüm Kutusu</span></div><div class="tree-item" onclick="openHelpWindow()">❓ <span>Yardım (F1)</span></div>`; 
}

/**
 * Retrieves and sorts all items for the current view based on the selected sort mode.
 * It groups folders at the top when sorting by name or date.
 * @returns {Array<Object>} A sorted array of items. Each item is decorated with an `itemType` property.
 */
function getSortedItems() {
    const sBox = document.getElementById('searchBox');
    const search = sBox ? sBox.value.toLowerCase() : '';

    let folders, notes, words, games;

    const filterFn = (item, parentField, searchFields) => {
        if (currentPath === 'trash') return item.isDeleted;
        if (search) {
            return !item.isDeleted && searchFields.some(field => item[field] && item[field].toLowerCase().includes(search));
        }
        return !item.isDeleted && item[parentField] === currentPath;
    };

    folders = db.folders.filter(f => filterFn(f, 'parentId', ['name']));
    notes = db.notes.filter(n => filterFn(n, 'fid', ['title']));
    words = db.words.filter(w => filterFn(w, 'fid', ['en', 'tr']));
    games = db.games.filter(g => filterFn(g, 'fid', ['title']));

    // Combine all items and add a type identifier
    const allItems = [
        ...folders.map(i => ({ ...i, itemType: 'folder' })),
        ...notes.map(i => ({ ...i, itemType: 'note' })),
        ...words.map(i => ({ ...i, itemType: 'word' })),
        ...games.map(i => ({ ...i, itemType: 'game' }))
    ];

    const modeEl = document.getElementById('sortMode');
    const mode = modeEl ? modeEl.value : 'name_asc';
    const [sortBy, direction] = mode.split('_');

    const typeOrder = { 'folder': 1, 'note': 2, 'word': 3, 'game': 4 };

    const getItemName = (item) => {
        switch (item.itemType) {
            case 'folder': return item.name;
            case 'note': return item.title;
            case 'word': return item.en;
            case 'game': return item.title;
            default: return '';
        }
    };

    allItems.sort((a, b) => {
        // Primary sort: folders are always grouped at the top, unless sorting by type.
        if (sortBy !== 'type') {
            if (a.itemType === 'folder' && b.itemType !== 'folder') return -1;
            if (a.itemType !== 'folder' && b.itemType === 'folder') return 1;
        }

        let comparison = 0;
        if (sortBy === 'name') comparison = getItemName(a).localeCompare(getItemName(b), undefined, { numeric: true });
        else if (sortBy === 'date') comparison = a.id - b.id;
        else if (sortBy === 'type') {
            comparison = typeOrder[a.itemType] - typeOrder[b.itemType];
            if (comparison === 0) comparison = getItemName(a).localeCompare(getItemName(b), undefined, { numeric: true });
        }

        return direction === 'asc' ? comparison : -comparison;
    });

    return allItems;
}

function changeSort(sortBy) {
    const sortModeEl = document.getElementById('sortMode');
    if (!sortModeEl) return;

    const currentMode = sortModeEl.value;
    const [currentSortBy, currentDirection] = currentMode.split('_');

    let newDirection;
    if (sortBy === currentSortBy) {
        newDirection = currentDirection === 'asc' ? 'desc' : 'asc';
    } else {
        newDirection = 'asc'; // Default to ascending for new column
    }

    sortModeEl.value = `${sortBy}_${newDirection}`;
    renderContent();
}

function renderContent() {
    const area = document.getElementById('contentArea'); if(!area) return;
    
    const view = localStorage.getItem('turing_view_mode') || 'grid';
    area.className = 'content-area'; // Reset classes
    area.classList.add(`view-mode-${view}`);

    // Add list view header if needed
    if (view === 'list') {
        const sortModeEl = document.getElementById('sortMode');
        const [currentSortBy, currentDirection] = (sortModeEl ? sortModeEl.value : 'name_asc').split('_');

        const headerNameClass = `list-header-name ${currentSortBy === 'name' ? 'sorted ' + currentDirection : ''}`;
        const headerTypeClass = `list-header-type ${currentSortBy === 'type' ? 'sorted ' + currentDirection : ''}`;
        const headerDateClass = `list-header-date ${currentSortBy === 'date' ? 'sorted ' + currentDirection : ''}`;
        area.innerHTML = `
            <div class="list-header">
                <div class="${headerNameClass}" onclick="changeSort('name')">Ad</div>
                <div class="${headerTypeClass}" onclick="changeSort('type')">Tür</div>
                <div class="${headerDateClass}" onclick="changeSort('date')">Oluşturma Tarihi</div>
            </div>
        `;
    } else {
        area.innerHTML = '';
    }

    const sortedItems = getSortedItems();

    const formatDate = (ts) => { if(!ts || ts < 100000) return "-"; return new Date(ts).toLocaleString('tr-TR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }); };
    const itemTypeNames = { folder: 'Klasör', note: 'Not Defteri', word: 'Kelime Kartı', game: 'Oyun/Video' };

    sortedItems.forEach(item => {
        const { itemType } = item;
        const isSel = selectedItems.has(`${itemType}-${item.id}`) ? 'selected' : '';
        const isChecked = isSel ? 'checked' : '';
        const div = document.createElement('div');
        div.className = `icon-item ${isSel}`;
        div.dataset.key = `${itemType}-${item.id}`;
        div.draggable = true;
        div.ondragstart = (e) => dragStart(e, itemType, item.id);

        let iconHtml = '';
        const emojiHtml = item.emoji ? `<div class="item-emoji-badge">${item.emoji}</div>` : '';

        // Common icon logic
        switch (itemType) {
            case 'folder':
                iconHtml = svgFolder;
                if (item.customIcon) iconHtml = `<img src="${item.customIcon}" class="custom-icon-img">`;
                else if (item.color) iconHtml = svgFolder.replace('<svg class="folder-icon"', `<svg class="folder-icon" style="fill:${item.color}; filter: drop-shadow(0 2px 4px ${item.color}66)"`);
                break;
            case 'note':
                iconHtml = item.customIcon ? `<img src="${item.customIcon}" class="custom-icon-img">` : svgNote;
                break;
            case 'word':
                const src = item.customIcon ? item.customIcon : (item.img || 'https://via.placeholder.com/200?text=Gorsel+Yok');
                const imgClass = item.customIcon ? 'custom-icon-img' : 'file-img';
                iconHtml = `<img src="${src}" class="${imgClass}">`;
                break;
            case 'game':
                iconHtml = item.customIcon ? `<img src="${item.customIcon}" class="custom-icon-img">` : svgGame;
                break;
        }

        // View-specific rendering
        if (view === 'list') {
            const vMode = document.getElementById('viewMode')?.value || 'all'; // For word cards
            let mainLabel = '', subLabel = '';
            switch (itemType) {
                case 'folder': mainLabel = item.name; break;
                case 'note': mainLabel = item.title; break;
                case 'game': mainLabel = item.title; break;
                case 'word':
                    if (vMode === 'all') { mainLabel = item.en; subLabel = item.tr; }
                    else if (vMode === 'tr') mainLabel = item.tr;
                    else if (vMode === 'en') mainLabel = item.en;
                    break;
            }

            const ipaText = (itemType === 'word' && item.ipa) ? `<span class="item-ipa-text">/${item.ipa}/</span>` : '';
            const labelHtml = `
                <div class="item-label-container">
                    <div class="item-label">${mainLabel} ${ipaText}</div>
                    ${subLabel ? `<div class="item-label-sub">${subLabel}</div>` : ''}
                </div>
            `;

            div.innerHTML = `
                <input type="checkbox" class="item-checkbox" ${isChecked} onclick="chkClick(event, '${itemType}', ${item.id})">
                <div style="position:relative;">${iconHtml}${emojiHtml}</div>
                ${labelHtml}
                <div class="item-detail type">${itemTypeNames[itemType] || ''}</div>
                <div class="item-detail date">${formatDate(item.id)}</div>
            `;

        } else { // Grid View
            const vMode = document.getElementById('viewMode')?.value || 'all'; // For word cards
            let mainLabel = '', subLabel = '';
            switch (itemType) {
                case 'folder': mainLabel = item.name; break;
                case 'note': mainLabel = item.title; break;
                case 'game': mainLabel = item.title; break;
                case 'word':
                    if (vMode === 'all') { mainLabel = item.en; subLabel = item.tr; }
                    else if (vMode === 'tr') mainLabel = item.tr;
                    else if (vMode === 'en') mainLabel = item.en;
                    break;
            }
            const ipaText = (itemType === 'word' && item.ipa) ? `<div class="item-label-ipa">/${item.ipa}/</div>` : '';
            const labelHtml = `
                <div class="item-label">${mainLabel}</div>
                ${ipaText}
                ${subLabel ? `<div class="item-label-sub">${subLabel}</div>` : ''}
            `;
            div.innerHTML = `<input type="checkbox" class="item-checkbox" ${isChecked} onclick="chkClick(event, '${itemType}', ${item.id})">${iconHtml}${emojiHtml}${labelHtml}`;
        }

        // Common event handlers
        div.onclick = (e) => toggleSelect(itemType, item.id, e);
        div.oncontextmenu = (e) => showContextMenu(e, itemType, item.id);

        // Mobil cihazlarda uzun basıldığında içerik menüsünü göstermek için
        let pressTimer;
        div.addEventListener('touchstart', (e) => {
            pressTimer = window.setTimeout(() => {
                showContextMenu(e, itemType, item.id);
            }, 500); // 500ms uzun basma süresi
        });
        div.addEventListener('touchend', () => {
            clearTimeout(pressTimer);
        });
        div.addEventListener('touchmove', () => {
            clearTimeout(pressTimer);
        });

        if (itemType === 'folder') {
            div.ondblclick = () => navigateTo(item.id);
            div.ondragover = allowDrop;
            div.ondragleave = dragLeave;
            div.ondrop = (e) => drop(e, item.id);
        } else if (itemType === 'note') {
            div.ondblclick = () => openNoteModal(item.id);
        } else if (itemType === 'word') {
            const wordViewMode = document.getElementById('viewMode')?.value || 'all';
            if (wordViewMode === 'en') {
                div.ondblclick = () => speakText(item.en, 'en-US');
            } else if (wordViewMode === 'tr') {
                div.ondblclick = () => speakText(item.tr, 'tr-TR');
            } else { // 'all' veya varsayılan
                div.ondblclick = () => openWordModal(item.id);
            }
        } else if (itemType === 'game') {
            div.ondblclick = () => playGame(item.id);
        }

        area.appendChild(div);
    });

    const st = document.getElementById('statusText');
    if(st) st.innerText = `${sortedItems.length} öğe | ${selectedItems.size} seçili`;
    const paste = document.getElementById('topMenuPaste');
    if(paste) paste.style.display = clipboard.items.size > 0 ? 'flex' : 'none';
}

function updateAddressBar() {
    const el = document.getElementById('addressPath');
    if(!el) return;
    if (currentPath === null) { el.value = "Gezgin"; return; }
    if (currentPath === 'trash') { el.value = "Geri Dönüşüm Kutusu"; return; }
    let path = []; let curr = db.folders.find(f => f.id === currentPath);
    while(curr) { path.unshift(curr.name); curr = db.folders.find(f => f.id === curr.parentId); }
    el.value = "Gezgin / " + path.join(' / ');
}

function renderAll() { 
    renderSidebar(); renderContent(); updateAddressBar(); updateNavButtons(); updateToolbar(); updateUndoRedoUI(); 
    const sBox = document.getElementById('searchBox');
    if(sBox) sBox.placeholder = "Ara... (Ctrl+F)";

    // Varsa eski floating butonu kaldır
    const oldBtn = document.getElementById('floatingHelpBtn');
    if (oldBtn) oldBtn.remove();

    // Gezgin içerik alanı için olayları bağla (sadece bir kez)
    if (document.getElementById('contentArea') && !contentAreaEventsInitialized) {
        initContentAreaSelection();
    }

    // Üst Menü Kısayol İsimlerini Güncelleme
    const addShortcut = (id, text, key) => {
        const el = document.getElementById(id);
        if (el && !el.innerHTML.includes(key)) el.innerHTML = `${text} <span style="opacity:0.6; font-size:11px; margin-left:5px;">${key}</span>`;
    };
    addShortcut('menuUndo', 'Geri Al', '(Ctrl+Z)');
    addShortcut('menuRedo', 'İleri Al', '(Ctrl+Y)');
    addShortcut('topMenuCopy', 'Kopyala', '(Ctrl+C)');
    addShortcut('topMenuPaste', 'Yapıştır', '(Ctrl+V)');
    addShortcut('topMenuDelete', 'Sil', '(Del)');

    // Mobil menü açıksa içeriğini güncelle
    const mobilePanel = document.getElementById('mobile-menu-panel');
    if (mobilePanel && mobilePanel.classList.contains('active')) {
        buildMobileMenu();
    }
}

// GÜNCELLENMİŞ MENÜ FONKSİYONLARI
function toggleMenu(id, e) { 
    if (e.target.closest('.drop-content')) return;
    e.stopPropagation(); 
    const menu = document.getElementById(id);
    const isActive = menu.classList.contains('active');
    
    closeAllMenus(); // Önce her şeyi kapat
    
    if (!isActive) { // Eğer zaten aktif değilse aç
        menu.classList.add('active'); 
        menu.querySelector('.drop-btn').classList.add('active'); 

        if (id === 'menuDuzenle') {
            const hasSel = selectedItems.size > 0;
            const singleSel = selectedItems.size === 1;
            const isTrash = currentPath === 'trash';

            const setEnable = (eid, enable) => {
                const el = document.getElementById(eid);
                if (el) {
                    if (enable) el.classList.remove('disabled');
                    else el.classList.add('disabled');
                }
            };
            const setDisp = (eid, show) => {
                const el = document.getElementById(eid);
                if (el) el.style.display = show ? 'flex' : 'none';
            };
            
            let selType = null;
            if (singleSel) {
                const key = selectedItems.values().next().value;
                const parts = key.split('-');
                selType = parts[0];
                // Tekli seçim varsa ctxTarget'ı güncelle ki aksiyonlar çalışsın
                ctxTarget = { type: selType, id: Number(parts[1]) };
            }

            // Enable/Disable logic for items that are generally visible
            setEnable('topMenuOpen', singleSel && selType === 'folder');
            setEnable('topMenuEdit', singleSel && !isTrash);
            setEnable('topMenuDetails', singleSel);
            setEnable('topMenuEmoji', singleSel && !isTrash);
            setEnable('topMenuIcon', singleSel && !isTrash && selType !== 'word');
            setEnable('topMenuCopy', hasSel && !isTrash);
            setEnable('topMenuMove', hasSel && !isTrash);
            setEnable('topMenuDelete', hasSel);
            setEnable('topMenuRestore', hasSel);

            // Show/Hide logic for contextual items
            setDisp('topMenuPaste', clipboard.items.size > 0 && !isTrash);
            setDisp('topMenuDelete', !isTrash);
            setDisp('topMenuRestore', isTrash);
            setDisp('topMenuEmptyTrash', isTrash);
        }
    }
}

function closeAllMenus() { 
    document.querySelectorAll('.dropdown').forEach(d => { 
        d.classList.remove('active'); 
        d.querySelector('.drop-btn').classList.remove('active'); 
    }); 
    document.getElementById('contextMenu').style.display = 'none'; 
}

function showContextMenu(e, type, id) {
    e.preventDefault(); e.stopPropagation(); closeAllMenus(); ctxTarget = {type, id};
    if(id !== null && !selectedItems.has(`${type}-${id}`)) { selectedItems.clear(); selectedItems.add(`${type}-${id}`); renderContent(); }
    
    // Tüm disabled sınıflarını temizle
    document.querySelectorAll('.ctx-item').forEach(el => el.classList.remove('disabled'));

    const menu = document.getElementById('contextMenu'); menu.style.display = 'block';

    const touch = e.touches ? e.touches[0] : null;
    let x = touch ? touch.pageX : e.pageX;
    let y = touch ? touch.pageY : e.pageY;
    if(x + 200 > window.innerWidth) x = window.innerWidth - 200; if(y + 300 > window.innerHeight) y = window.innerHeight - 300;
    menu.style.left = x + 'px'; menu.style.top = y + 'px';
    
    const isTrash = currentPath === 'trash';
    document.getElementById('ctxNewGroup').style.display = ((type === 'bg' || type === 'desktop-bg') && !isTrash) ? 'block' : 'none';
    document.getElementById('ctxOpen').style.display = type === 'folder' ? 'flex' : 'none';
    document.getElementById('ctxCopy').style.display = type === 'bg' ? 'none' : 'flex';
    document.getElementById('ctxCopy').innerHTML = `📄 Kopyala <span style="margin-left:auto; opacity:0.5; font-size:12px;">Ctrl+C</span>`;
    
    // Yapıştır Butonu Mantığı
    const pasteBtn = document.getElementById('ctxPaste');
    pasteBtn.style.display = (clipboard.items.size > 0 && !isTrash) ? 'flex' : 'none';

    document.getElementById('ctxPaste').innerHTML = `📋 Yapıştır <span style="margin-left:auto; opacity:0.5; font-size:12px;">Ctrl+V</span>`;
    document.getElementById('ctxEdit').style.display = (type === 'bg' || type === 'desktop-bg' || isTrash) ? 'none' : 'flex';
    document.getElementById('ctxDetails').style.display = type === 'bg' ? 'none' : 'flex';
    document.getElementById('ctxEmoji').style.display = (type === 'bg' || type === 'desktop-bg' || isTrash) ? 'none' : 'flex';
    document.getElementById('ctxIcon').style.display = (type === 'bg' || type === 'desktop-bg' || isTrash || type === 'word') ? 'none' : 'flex';
    document.getElementById('ctxMove').style.display = (type === 'bg' || isTrash) ? 'none' : 'flex';
    document.getElementById('ctxDelete').style.display = type === 'bg' ? 'none' : 'flex';
    document.getElementById('ctxRestore').style.display = isTrash && type !== 'bg' ? 'flex' : 'none';
    document.getElementById('ctxEmptyTrash').style.display = (isTrash && type === 'bg') ? 'flex' : 'none';
    document.getElementById('ctxDiv2').style.display = (type === 'bg' || type === 'desktop-bg') ? 'none' : 'block';
    
    if (isTrash) {
        document.getElementById('ctxDelete').innerHTML = "🗑️ Kalıcı Olarak Sil <span style='margin-left:auto; opacity:0.5; font-size:12px;'>Del</span>";
    } else {
        document.getElementById('ctxDelete').innerHTML = "🗑️ Çöpe At <span style='margin-left:auto; opacity:0.5; font-size:12px;'>Del</span>";
    }

    if(type === 'folder') document.getElementById('ctxEdit').innerHTML = "⚙️ Düzenle <span style='margin-left:auto; opacity:0.5; font-size:12px;'>F2</span>"; else document.getElementById('ctxEdit').innerHTML = "⚙️ Düzenle <span style='margin-left:auto; opacity:0.5; font-size:12px;'>F2</span>";
}

function toggleUI() { 
    closeAllMenus();
    uiIsHidden = !uiIsHidden; 
    document.getElementById('sidebarTree').style.display = uiIsHidden ? 'none' : 'block'; 
    document.getElementById('uiStatusBar').style.display = uiIsHidden ? 'none' : 'flex'; 
}

function focusSearch() { 
    closeAllMenus();
    const searchBox = document.getElementById('uiSearchBox');
    const searchInput = document.getElementById('searchBox');
    
    if (window.getComputedStyle(searchBox).display === 'none') {
        searchBox.style.display = 'flex';
        searchInput.focus();
        searchInput.select();
    } else {
        searchBox.style.display = 'none';
        searchInput.value = '';
        renderContent();
    }
}

function showDetailsModal(type, id) {
    let title = "", dateStr = "", extraHtml = "";
    const formatDate = (ts) => { if(!ts || ts < 100000) return "Bilinmiyor"; return new Date(ts).toLocaleString('tr-TR'); };
    if(type === 'folder') {
        const f = db.folders.find(x => x.id === id); title = f.name; dateStr = formatDate(f.id);
        let stats = { folders: 0, words: 0, notes: 0 };
        function traverse(fId) { const subF = db.folders.filter(sub => sub.parentId === fId); stats.folders += subF.length; stats.words += db.words.filter(w => w.fid === fId).length; stats.notes += db.notes.filter(n => n.fid === fId).length; subF.forEach(sub => traverse(sub.id)); }
        traverse(id);
        extraHtml = `<div class="details-grid"><div class="details-label">İçerik:</div><div>${stats.folders} Klasör, ${stats.words} Kelime, ${stats.notes} Not</div></div>`;
    } else if(type === 'word') {
        const w = db.words.find(x => x.id === id); title = w.en + " (" + w.tr + ")"; dateStr = formatDate(w.id);
        extraHtml = `<div class="details-grid"><div class="details-label">Tür:</div><div>Kelime Kartı</div></div>`;
    } else if(type === 'note') {
        const n = db.notes.find(x => x.id === id); title = n.title; dateStr = formatDate(n.id);
        extraHtml = `<div class="details-grid"><div class="details-label">Tür:</div><div>Gelişmiş Not</div></div>`;
    } else if(type === 'game') {
        const g = db.games.find(x => x.id === id); title = g.title; dateStr = formatDate(g.id);
        extraHtml = `<div class="details-grid"><div class="details-label">Tür:</div><div>Retro Oyun</div></div><div class="details-grid"><div class="details-label">URL:</div><div style="word-break:break-all; font-size:11px;">${g.url}</div></div>`;
    }
    document.getElementById('detailsBody').innerHTML = `<div class="details-grid"><div class="details-label">Ad:</div><div><b>${title}</b></div></div><div class="details-grid"><div class="details-label">Oluşturulma:</div><div>${dateStr}</div></div>${extraHtml}`;
    document.getElementById('detailsDialog').style.display = 'flex';
}

function ctxAction(action) {
    closeAllMenus();
    if(action === 'open' && ctxTarget.type === 'folder') navigateTo(ctxTarget.id);
    if(action === 'copy') { clipboard.items = new Set(selectedItems); if(clipboard.items.size === 0 && ctxTarget && ctxTarget.id) clipboard.items.add(`${ctxTarget.type}-${ctxTarget.id}`); }
    if(action === 'paste') executePaste();
    if(action === 'edit') {
        if(ctxTarget.type === 'folder') { openFolderModal(ctxTarget.id); } 
        else if(ctxTarget.type === 'word') openWordModal(ctxTarget.id); 
        else if(ctxTarget.type === 'note') openNoteModal(ctxTarget.id);
        else if(ctxTarget.type === 'game') openGameModal(ctxTarget.id);
    }
    if(action === 'details') showDetailsModal(ctxTarget.type, ctxTarget.id);
    if(action === 'delete') deleteSelected();
    if(action === 'move') moveSelected();
    if(action === 'restore') restoreSelected();
    if(action === 'emptyTrash') emptyTrash();
}

function executePaste() {
    if(clipboard.items.size === 0) return;
    
    // Hedef konumu belirle (Masaüstü mü, klasör mü?)
    let target = currentPath;

    clipboard.items.forEach(key => {
        const parts = key.split('-'); const type = parts[0]; const id = Number(parts[1]);
        if(type === 'word') { const w = db.words.find(x => x.id === id); if(w) db.words.push({...w, id: Date.now() + Math.floor(Math.random() * 1000000), fid: target, en: w.en + " (Kopya)"}); }
        if(type === 'note') { const n = db.notes.find(x => x.id === id); if(n) db.notes.push({...n, id: Date.now() + Math.floor(Math.random() * 1000000), fid: target, title: n.title + " (Kopya)"}); }
        if(type === 'game') { const g = db.games.find(x => x.id === id); if(g) db.games.push({...g, id: Date.now() + Math.floor(Math.random() * 1000000), fid: target, title: g.title + " (Kopya)"}); }
        if(type === 'folder') copyFolderRecursive(id, target);
    });
    saveDB();
}

function copyFolderRecursive(originalId, targetParentId) {
    const ogFolder = db.folders.find(f => f.id === originalId); if(!ogFolder) return;
    // Döngüsel kopyalamayı önle
    if (targetParentId !== null) {
        let curr = targetParentId ? db.folders.find(f => f.id === targetParentId) : null; 
        while(curr) { if(curr.id === originalId) return; curr = db.folders.find(f => f.id === curr.parentId); }
    }
    
    const newFolderId = Date.now() + Math.floor(Math.random() * 1000000); 
    db.folders.push({ id: newFolderId, name: ogFolder.name + (targetParentId === currentPath ? " (Kopya)" : ""), parentId: targetParentId, color: ogFolder.color });
    db.words.filter(w => w.fid === originalId).forEach(w => db.words.push({...w, id: Date.now() + Math.floor(Math.random() * 1000000), fid: newFolderId})); db.notes.filter(n => n.fid === originalId).forEach(n => db.notes.push({...n, id: Date.now() + Math.floor(Math.random() * 1000000), fid: newFolderId}));
    db.games.filter(g => g.fid === originalId).forEach(g => db.games.push({...g, id: Date.now() + Math.floor(Math.random() * 1000000), fid: newFolderId}));
    db.folders.filter(f => f.parentId === originalId).forEach(child => copyFolderRecursive(child.id, newFolderId));
}

function createItem(type, fromContextMenu = false) { 
    closeAllMenus();
    creationContext = currentPath;

    if(type === 'folder') { 
        openFolderModal(null);
    } else if (type === 'word') { openWordModal(null); } else if (type === 'note') { openNoteModal(null); } else if (type === 'game') { openGameModal(null); }
}

function deleteSelected() {
    closeAllMenus();
    if(selectedItems.size === 0) return; 
    
    const isTrash = currentPath === 'trash';
    const msg = isTrash ? "Kalıcı olarak silinecek. Emin misin?" : "Çöpe atılsın mı?";
    if(!confirm(msg)) return;

    let deletedBatch = [];
    selectedItems.forEach(key => {
        const parts = key.split('-'); const type = parts[0]; const id = Number(parts[1]);
        
        if (isTrash) {
            // Kalıcı Silme
            if(type === 'word') db.words = db.words.filter(w => w.id !== id); 
            if(type === 'note') db.notes = db.notes.filter(n => n.id !== id);
            if(type === 'game') db.games = db.games.filter(g => g.id !== id);
            if(type === 'folder') { deleteFolderRecursiveInternal(id); }
        } else {
            // Çöpe Atma (Soft Delete)
            if(type === 'word') { const w = db.words.find(x => x.id === id); if(w) { w.isDeleted = true; deletedBatch.push({action: 'DELETE', type, id}); } }
            if(type === 'note') { const n = db.notes.find(x => x.id === id); if(n) { n.isDeleted = true; deletedBatch.push({action: 'DELETE', type, id}); } }
            if(type === 'game') { const g = db.games.find(x => x.id === id); if(g) { g.isDeleted = true; deletedBatch.push({action: 'DELETE', type, id}); } }
            if(type === 'folder') { const f = db.folders.find(x => x.id === id); if(f) { f.isDeleted = true; deletedBatch.push({action: 'DELETE', type, id}); } }
        }
    });
    if (!isTrash && deletedBatch.length > 0) {
        pushUndo(deletedBatch);
    }
    selectedItems.clear(); saveDB();
}

function emptyTrash() {
    closeAllMenus();
    if(!confirm("Geri dönüşüm kutusundaki tüm öğeler kalıcı olarak silinecek. Emin misin?")) return;

    db.words = db.words.filter(w => !w.isDeleted);
    db.notes = db.notes.filter(n => !n.isDeleted);
    db.games = db.games.filter(g => !g.isDeleted);

    const foldersToDelete = db.folders.filter(f => f.isDeleted).map(f => f.id);
    foldersToDelete.forEach(id => {
        if(db.folders.find(f => f.id === id)) {
            deleteFolderRecursiveInternal(id);
        }
    });

    saveDB();
}

function restoreAll() {
    closeAllMenus();
    if(!confirm("Çöp kutusundaki tüm öğeler geri yüklenecek. Emin misin?")) return;
    
    db.folders.forEach(f => f.isDeleted = false);
    db.words.forEach(w => w.isDeleted = false);
    db.notes.forEach(n => n.isDeleted = false);
    db.games.forEach(g => g.isDeleted = false);
    
    saveDB();
}

function updateToolbar() {
    const isTrash = currentPath === 'trash';
    const el = document.getElementById('trashTools');
    if(el) el.style.display = isTrash ? 'flex' : 'none';
}

function deleteFolderRecursiveInternal(folderId) { db.folders.filter(f => f.parentId === folderId).forEach(c => deleteFolderRecursiveInternal(c.id)); db.words = db.words.filter(w => w.fid !== folderId); db.notes = db.notes.filter(n => n.fid !== folderId); db.games = db.games.filter(g => g.fid !== folderId); db.folders = db.folders.filter(f => f.id !== folderId); }

function restoreSelected() {
    closeAllMenus();
    selectedItems.forEach(key => {
        const parts = key.split('-'); const type = parts[0]; const id = Number(parts[1]);
        if(type === 'word') { const w = db.words.find(x => x.id === id); if(w) w.isDeleted = false; }
        if(type === 'note') { const n = db.notes.find(x => x.id === id); if(n) n.isDeleted = false; }
        if(type === 'game') { const g = db.games.find(x => x.id === id); if(g) g.isDeleted = false; }
        if(type === 'folder') { const f = db.folders.find(x => x.id === id); if(f) f.isDeleted = false; }
    });
    selectedItems.clear(); saveDB();
}

function moveSelected() {
    closeAllMenus();
    if(selectedItems.size === 0) { alert("Taşımak için öğe seç."); return; }
    document.getElementById('moveDialog').style.display = 'flex'; const select = document.getElementById('moveTargetSelect'); select.innerHTML = `<option value="root">Gezgin</option>`;
    function addOptions(parentId, prefix) { db.folders.filter(f => !f.isDeleted && f.parentId === parentId).forEach(f => { if(selectedItems.has(`folder-${f.id}`)) return; select.innerHTML += `<option value="${f.id}">${prefix} ${f.name}</option>`; addOptions(f.id, prefix + "--"); }); }
    addOptions(null, "└ ");
}

function executeMove() {
    const tVal = document.getElementById('moveTargetSelect').value; if(!tVal) return; 
    const tId = tVal === 'root' ? null : parseInt(tVal);
    
    let moveBatch = [];
    
    selectedItems.forEach(key => {
        const parts = key.split('-'); const type = parts[0]; const id = Number(parts[1]);
        const arr = getDbArray(type);
        const item = arr.find(x => x.id === id);
        if (item) {
            const field = type === 'folder' ? 'parentId' : 'fid';
            const oldParent = item[field];
            
            // Klasör döngüsü kontrolü
            if (type === 'folder') {
                let curr = tId ? db.folders.find(f => f.id === tId) : null; 
                let conflict = false; 
                while(curr) { if(curr.id === id) conflict = true; curr = db.folders.find(f => f.id === curr.parentId); }
                if (conflict) return;
            }

            item[field] = tId;
            moveBatch.push({ action: 'MOVE', type, id, data: { oldParent, newParent: tId } });
        }
    });
    if (moveBatch.length > 0) pushUndo(moveBatch);
    closeDialog('moveDialog'); selectedItems.clear(); saveDB();
}

async function startBulkImport() {
    const inputStr = document.getElementById('bulkInput').value; const lines = inputStr.split('\n').map(l => l.trim()).filter(l => l !== '');
    if(lines.length === 0) { alert("Kelime girmelisin."); return; }
    const langPair = document.getElementById('bulkLang').value; const btn = document.getElementById('bulkStartBtn'); const status = document.getElementById('bulkStatus'); btn.disabled = true;
    
    let sl = langPair === 'en|tr' ? 'en' : 'tr';
    let tl = langPair === 'en|tr' ? 'tr' : 'en';

    for(let i = 0; i < lines.length; i++) {
        const word = lines[i]; status.innerText = `İşleniyor: ${i + 1} / ${lines.length} (${word})`;
        try {
            const res = await fetch(`https://translate.googleapis.com/translate_a/single?client=gtx&sl=${sl}&tl=${tl}&dt=t&q=${encodeURIComponent(word)}`); 
            const data = await res.json();
            let translated = data[0].map(item => item[0]).join(''); 
            
            let enVal, trVal;
            if(langPair === 'en|tr') { enVal = word; trVal = translated; } else { trVal = word; enVal = translated; }
            const cleanKey = enVal.split('/')[0].split(',')[0].trim().toLowerCase(); const uniqueId = Date.now() + i; const imgUrl = `https://loremflickr.com/400/300/${cleanKey},object?lock=${uniqueId}`;
            db.words.push({ id: uniqueId, en: enVal, tr: trVal, img: imgUrl, fid: currentPath });
        } catch(e) {}
    }
    status.innerText = "İşlem Tamam!"; setTimeout(() => { closeDialog('bulkDialog'); saveDB(); btn.disabled = false; }, 1000);
}

function openBulkModal() {
    closeAllMenus();
    document.getElementById('bulkInput').value = '';
    document.getElementById('bulkStatus').innerText = '';
    document.getElementById('bulkDialog').style.display = 'flex';
}

function openWordModal(id) {
    document.getElementById('wordDialog').style.display = 'flex';
    const ipaInput = document.getElementById('wIpa');
    if(id) {
        const w = db.words.find(x => x.id === id);
        document.getElementById('wId').value = w.id;
        document.getElementById('wEn').value = w.en;
        document.getElementById('wTr').value = w.tr;
        document.getElementById('wImg').value = w.img;
        if (ipaInput) ipaInput.value = w.ipa || '';
        updatePrev(w.img || '');
        document.getElementById('wTitle').innerText = "Özellikler: " + w.en;
    } else {
        document.getElementById('wId').value = '';
        document.getElementById('wEn').value = '';
        document.getElementById('wTr').value = '';
        document.getElementById('wImg').value = '';
        if (ipaInput) ipaInput.value = '';
        document.getElementById('wPreview').src = '';
        document.getElementById('wTitle').innerText = "Yeni Kelime Kartı";
    }
}

function saveWord() {
    const enVal = document.getElementById('wEn').value.trim(); if(!enVal) return; const id = document.getElementById('wId').value; let imgUrl = document.getElementById('wImg').value;
    if (!imgUrl) { imgUrl = ''; }
    const ipaInput = document.getElementById('wIpa');
    const ipaVal = ipaInput ? ipaInput.value.trim() : '';
    const data = { id: id ? Number(id) : Date.now(), en: enVal, tr: document.getElementById('wTr').value, img: imgUrl, ipa: ipaVal, fid: id ? db.words.find(w => w.id == id).fid : creationContext };
    
    if(id) { 
        const idx = db.words.findIndex(x => x.id == id); 
        const oldData = {...db.words[idx]};
        db.words[idx] = data; 
        pushUndo([{ action: 'UPDATE', type: 'word', id: Number(id), data: { changes: { en: {old: oldData.en, new: data.en}, tr: {old: oldData.tr, new: data.tr}, img: {old: oldData.img, new: data.img}, ipa: {old: oldData.ipa, new: data.ipa} } } }]);
    } else { 
        db.words.push(data); 
        pushUndo([{ action: 'CREATE', type: 'word', id: data.id, data: data }]);
    }
    closeDialog('wordDialog'); saveDB();
}

function openNoteModal(id) {
    document.getElementById('noteDialog').style.display = 'flex';
    if(id) { const n = db.notes.find(x => x.id === id); document.getElementById('nId').value = n.id; document.getElementById('nTitleInp').value = n.title; document.getElementById('nContent').innerHTML = n.content || ''; document.getElementById('nTitle').innerText = "Not: " + n.title;
    } else { document.getElementById('nId').value = ''; document.getElementById('nTitleInp').value = ''; document.getElementById('nContent').innerHTML = ''; document.getElementById('nTitle').innerText = "Yeni Not Defteri"; }
    updateNoteStats();
}

function updateNoteStats() {
    const el = document.getElementById('nContent');
    const stats = document.getElementById('nStats');
    if(!el || !stats) return;
    const text = el.innerText || '';
    const chars = text.length;
    const words = text.trim() === '' ? 0 : text.trim().split(/\s+/).length;
    stats.innerText = `${words} kelime | ${chars} karakter`;
}

function saveNote() {
    let tVal = document.getElementById('nTitleInp').value.trim();
    const id = document.getElementById('nId').value; 
    const cVal = document.getElementById('nContent').innerHTML;
    
    let targetFid = creationContext;
    if (id) { const exist = db.notes.find(n => n.id == id); if(exist) targetFid = exist.fid; }

    if (!tVal) {
        const siblings = db.notes.filter(n => !n.isDeleted && n.fid === targetFid && n.id != id);
        let maxNum = 0;
        siblings.forEach(n => {
            const match = n.title.match(/^Adsız Not (\d+)$/);
            if (match) { const num = parseInt(match[1]); if (num > maxNum) maxNum = num; }
        });
        tVal = `Adsız Not ${maxNum + 1}`;
    }

    const data = { id: id ? Number(id) : Date.now(), title: tVal, content: cVal, fid: targetFid };
    
    if(id) { 
        const idx = db.notes.findIndex(x => x.id == id); 
        const oldData = {...db.notes[idx]};
        db.notes[idx] = data; 
        pushUndo([{ action: 'UPDATE', type: 'note', id: Number(id), data: { changes: { title: {old: oldData.title, new: data.title}, content: {old: oldData.content, new: data.content} } } }]);
    } else { 
        db.notes.push(data); 
        pushUndo([{ action: 'CREATE', type: 'note', id: data.id, data: data }]);
    }
    closeDialog('noteDialog'); saveDB();
}

function openGameModal(id) {
    document.getElementById('gameDialog').style.display = 'flex';
    if(id) { const g = db.games.find(x => x.id === id); document.getElementById('gId').value = g.id; document.getElementById('gTitle').value = g.title; document.getElementById('gUrl').value = g.url; document.getElementById('gDialogTitle').innerText = "Oyun Düzenle";
    } else { document.getElementById('gId').value = ''; document.getElementById('gTitle').value = ''; document.getElementById('gUrl').value = ''; document.getElementById('gDialogTitle').innerText = "Yeni Oyun Ekle"; }
}

function processGameUrl(url) {
    if (!url) return '';
    // 1. Iframe kodu yapıştırıldıysa src'yi çek
    const iframeMatch = url.match(/src=["'](.*?)["']/);
    if (iframeMatch && iframeMatch[1]) return iframeMatch[1];

    // 2. YouTube Linki Dönüştürme
    if (url.includes('youtube.com/watch?v=') || url.includes('youtu.be/')) {
        const vId = url.split('v=')[1]?.split('&')[0] || url.split('youtu.be/')[1]?.split('?')[0];
        if (vId) return `https://www.youtube.com/embed/${vId}`;
    }
    return url;
}

function saveGame() {
    const tVal = document.getElementById('gTitle').value.trim() || "Adsız Oyun"; const id = document.getElementById('gId').value; let uVal = document.getElementById('gUrl').value.trim();
    if(!uVal) { alert("Lütfen bir URL girin."); return; }
    uVal = processGameUrl(uVal);
    const data = { id: id ? Number(id) : Date.now(), title: tVal, url: uVal, fid: id ? db.games.find(g => g.id == id).fid : creationContext };
    
    if(id) { 
        const idx = db.games.findIndex(x => x.id == id); 
        const oldData = {...db.games[idx]};
        db.games[idx] = data; 
        pushUndo([{ action: 'UPDATE', type: 'game', id: Number(id), data: { changes: { title: {old: oldData.title, new: data.title}, url: {old: oldData.url, new: data.url} } } }]);
    } else { 
        db.games.push(data); 
        pushUndo([{ action: 'CREATE', type: 'game', id: data.id, data: data }]);
    }
    closeDialog('gameDialog'); saveDB();
}

function playGame(id) { 
    const g = db.games.find(x => x.id === id); if(!g) return; 
    const win = document.getElementById('playDialog');
    win.style.display = 'flex'; 
    document.getElementById('playFrame').src = g.url; 
    document.getElementById('playTitle').innerText = g.title;

    // "Yeni sekmede aç" butonu için URL'yi ayarla
    const openNewTabBtn = document.getElementById('playOpenNewTab');
    if (openNewTabBtn) {
        openNewTabBtn.onclick = () => window.open(g.url, '_blank');
    }

    // Mobil cihazlarda pencereyi tam ekran yap
    if (window.innerWidth <= 768) {
        win.classList.add('maximized');
    }
}

function closeGameDialog() {
    const win = document.getElementById('playDialog');
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    win.style.display = 'none';
    document.getElementById('playFrame').src = '';
    win.classList.remove('maximized');
    // Pozisyonu masaüstü için sıfırla, mobil için stilleri temizle
    if (window.innerWidth > 768) {
        win.style.top = '50%'; win.style.left = '50%'; win.style.transform = 'translate(-50%, -50%)'; win.style.width = '800px'; win.style.height = '600px';
    } else {
        // Mobil'de kapatıldığında, yeniden açıldığında CSS'in devralması için inline stilleri temizle
        win.style.top = ''; win.style.left = ''; win.style.transform = ''; win.style.width = ''; win.style.height = '';
    }
}

function toggleGameMaximize() {
    const win = document.getElementById('playDialog');
    win.classList.toggle('maximized');
}

function toggleGameNativeFullscreen() {
    const win = document.getElementById('playDialog');
    if(win.requestFullscreen) win.requestFullscreen();
    else if(win.webkitRequestFullscreen) win.webkitRequestFullscreen();
}

function refreshGame() {
    const frame = document.getElementById('playFrame');
    if (frame) frame.src = frame.src; // iframe'i yeniden yüklemenin en güvenli yolu
}

const emojiList = ["⭐", "❤️", "🔥", "✅", "⚠️", "❌", "📁", "🎵", "🎬", "🎮", "📚", "💡", "📌", "🎉", "🚀", "💻", "🔒", "👀", "🧠", "🌍", "🏠", "🎓", "💼", "💰", "🛒", "🎁", "🏆", "⚽", "🍔", "🍕"];

function openEmojiPicker() {
    closeAllMenus();
    const grid = document.getElementById('emojiGrid');
    grid.innerHTML = '';
    emojiList.forEach(emo => {
        const div = document.createElement('div');
        div.className = 'emoji-opt';
        div.innerText = emo;
        div.onclick = () => saveEmoji(emo);
        grid.appendChild(div);
    });
    document.getElementById('emojiDialog').style.display = 'flex';
}

function saveEmoji(emoji) {
    if (!ctxTarget) return;
    const { type, id } = ctxTarget;
    const arr = getDbArray(type);
    const item = arr.find(x => x.id === id);
    
    if (item) {
        const oldEmoji = item.emoji;
        item.emoji = emoji;
        pushUndo([{ action: 'UPDATE', type, id, data: { changes: { emoji: { old: oldEmoji, new: emoji } } } }]);
    }
    closeDialog('emojiDialog'); saveDB();
}

function openIconDialog() {
    closeAllMenus();
    
    if (!ctxTarget && selectedItems.size === 1) {
        const key = selectedItems.values().next().value;
        const parts = key.split('-');
        ctxTarget = { type: parts[0], id: Number(parts[1]) };
    }
    
    if (!ctxTarget) { alert("Lütfen bir öğe seçin."); return; }
    if (ctxTarget.type === 'word') { alert("Kelimeler için simge değiştirilemez."); return; }

    renderIconGallery();
    const urlInput = document.getElementById('iconUrlInput');
    const preview = document.getElementById('iconPreview');
    const placeholder = document.getElementById('iconPreviewPlaceholder');

    document.getElementById('iconFileInput').value = '';
    urlInput.value = '';
    
    if(preview) { preview.src = ''; preview.style.display = 'none'; }
    if(placeholder) placeholder.style.display = 'block';

    if (ctxTarget) {
        const { type, id } = ctxTarget;
        const arr = getDbArray(type);
        const item = arr.find(x => x.id === id);
        if (item && item.customIcon) {
            urlInput.value = item.customIcon;
            if(preview) { preview.src = item.customIcon; preview.style.display = 'block'; }
            if(placeholder) placeholder.style.display = 'none';
        }
    }

    document.getElementById('iconDialog').style.display = 'flex';
}

function getFolderIconDataUri(color) {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><path d="M10 25 Q 10 15 20 15 L 40 15 Q 45 15 50 20 L 60 30 L 85 30 Q 95 30 95 40 L 95 85 Q 95 95 85 95 L 15 95 Q 5 95 5 85 Z" fill="${color}" stroke="rgba(0,0,0,0.1)" stroke-width="2"/></svg>`;
    return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
}

function renderIconGallery() {
    const grid = document.getElementById('defaultIconGrid');
    if(!grid) return;
    grid.innerHTML = '';
    
    const colors = ['#fcd34d', '#60a5fa', '#f87171', '#4ade80', '#c084fc', '#fb923c', '#94a3b8', '#1e293b'];
    
    colors.forEach(c => {
        const src = getFolderIconDataUri(c);
        const div = document.createElement('div');
        div.style.cssText = 'cursor:pointer; padding:6px; border-radius:6px; display:flex; justify-content:center; align-items:center; border:1px solid transparent; transition:0.1s;';
        div.innerHTML = `<img src="${src}" style="width:32px; height:32px;">`;
        div.onclick = () => selectDefaultIcon(src);
        div.onmouseover = () => div.style.background = 'var(--hover-bg)';
        div.onmouseout = () => div.style.background = 'transparent';
        grid.appendChild(div);
    });

    const extras = [
        { svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect x="20" y="10" width="60" height="80" rx="6" fill="#fff" stroke="#94a3b8" stroke-width="4"/><line x1="35" y1="35" x2="65" y2="35" stroke="#cbd5e1" stroke-width="4" stroke-linecap="round"/><line x1="35" y1="50" x2="65" y2="50" stroke="#cbd5e1" stroke-width="4" stroke-linecap="round"/><line x1="35" y1="65" x2="50" y2="65" stroke="#cbd5e1" stroke-width="4" stroke-linecap="round"/></svg>` },
        { svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="#8b5cf6" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="6" width="20" height="12" rx="2"/><path d="M6 12h4m-2-2v4"/><path d="M15 11h.01"/><path d="M18 13h.01"/></svg>` }
    ];

    extras.forEach(item => {
        const src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(item.svg);
        const div = document.createElement('div');
        div.style.cssText = 'cursor:pointer; padding:6px; border-radius:6px; display:flex; justify-content:center; align-items:center; border:1px solid transparent; transition:0.1s;';
        div.innerHTML = `<img src="${src}" style="width:32px; height:32px;">`;
        div.onclick = () => selectDefaultIcon(src);
        div.onmouseover = () => div.style.background = 'var(--hover-bg)';
        div.onmouseout = () => div.style.background = 'transparent';
        grid.appendChild(div);
    });
}

function selectDefaultIcon(url) {
    const urlInput = document.getElementById('iconUrlInput');
    urlInput.value = url;
    previewIconUrl();
}

function previewIconUrl() {
    const url = document.getElementById('iconUrlInput').value.trim();
    const preview = document.getElementById('iconPreview');
    const placeholder = document.getElementById('iconPreviewPlaceholder');
    
    if (url) {
        preview.src = url;
        preview.style.display = 'block';
        placeholder.style.display = 'none';
    } else {
        preview.style.display = 'none';
        placeholder.style.display = 'block';
    }
}

function previewIconFile() {
    const fileInput = document.getElementById('iconFileInput');
    const preview = document.getElementById('iconPreview');
    const placeholder = document.getElementById('iconPreviewPlaceholder');
    
    if (fileInput.files && fileInput.files[0]) {
        const reader = new FileReader();
        reader.onload = (e) => {
            preview.src = e.target.result;
            preview.style.display = 'block';
            placeholder.style.display = 'none';
        };
        reader.readAsDataURL(fileInput.files[0]);
    }
}

function saveCustomIcon() {
    if (!ctxTarget) return;
    const { type, id } = ctxTarget;
    const urlInput = document.getElementById('iconUrlInput').value.trim();
    const fileInput = document.getElementById('iconFileInput').files[0];

    const updateIcon = (iconData) => {
        const arr = getDbArray(type);
        const item = arr.find(x => x.id === id);
        if (item) {
            const oldIcon = item.customIcon;
            item.customIcon = iconData;
            pushUndo([{ action: 'UPDATE', type, id, data: { changes: { customIcon: { old: oldIcon, new: iconData } } } }]);
        }
        closeDialog('iconDialog'); saveDB();
    };

    if (fileInput) {
        const reader = new FileReader();
        reader.onload = (e) => updateIcon(e.target.result);
        reader.readAsDataURL(fileInput);
    } else if (urlInput) {
        updateIcon(urlInput);
    } else {
        alert("Lütfen bir URL girin veya dosya seçin.");
    }
}

function removeCustomIcon() {
    if (!ctxTarget) return;
    const { type, id } = ctxTarget;
    const arr = getDbArray(type);
    const item = arr.find(x => x.id === id);
    if (item) {
        const oldIcon = item.customIcon;
        delete item.customIcon;
        pushUndo([{ action: 'UPDATE', type, id, data: { changes: { customIcon: { old: oldIcon, new: undefined } } } }]);
    }
    closeDialog('iconDialog'); saveDB();
}

function closeDialog(id) { document.getElementById(id).style.display = 'none'; window.speechSynthesis.cancel(); }
function updatePrev(url) { if(url) document.getElementById('wPreview').src = url; }
function getClean() { return (document.getElementById('wEn').value || 'object').split('/')[0].split(',')[0].trim().toLowerCase(); }
function autoFetchImage() { }
function randomOSImage() { searchGoogleImage(); }

function speakWord(side) {
    const id = side === 1 ? 'wEn' : 'wTr';
    const langId = side === 1 ? 'wLang1' : 'wLang2';
    speakText(document.getElementById(id).value, document.getElementById(langId).value);
}

async function translateWord(side) {
    const srcId = side === 1 ? 'wEn' : 'wTr';
    const tgtId = side === 1 ? 'wTr' : 'wEn';
    const srcLangId = side === 1 ? 'wLang1' : 'wLang2';
    const tgtLangId = side === 1 ? 'wLang2' : 'wLang1';
    
    const txt = document.getElementById(srcId).value; if(!txt) return;
    const ldr = document.getElementById('wLoader'); ldr.style.display = 'block';
    
    const sl = document.getElementById(srcLangId).value;
    const tl = document.getElementById(tgtLangId).value;

    try { 
        const res = await fetch(`https://translate.googleapis.com/translate_a/single?client=gtx&sl=${sl}&tl=${tl}&dt=t&q=${encodeURIComponent(txt)}`); 
        const data = await res.json();
        let translatedText = data[0].map(item => item[0]).join('');
        document.getElementById(tgtId).value = translatedText;
        if(side === 1) autoFetchImage();
    } catch(e) {} finally { ldr.style.display = 'none'; }
}

async function fetchIPA() {
    const word = document.getElementById('wEn').value.trim();
    const ipaInput = document.getElementById('wIpa');
    const loader = document.getElementById('wLoader');
    if (!word || !ipaInput) {
        alert('Lütfen önce İngilizce kelimeyi girin.');
        return;
    }

    loader.style.display = 'block';
    loader.innerText = 'Telaffuz aranıyor...';

    try {
        const response = await fetch(`https://api.dictionaryapi.dev/api/v2/entries/en/${word}`);
        if (!response.ok) {
            ipaInput.value = '';
            alert(`'${word}' için telaffuz bilgisi bulunamadı.`);
            return;
        }
        const data = await response.json();
        
        let ipaString = null;
        if (data && data.length > 0) {
            const entry = data[0];
            ipaString = entry.phonetic || entry.phonetics?.find(p => p.text)?.text;
        }

        if (ipaString) ipaInput.value = ipaString.replace(/\//g, '');
        else { ipaInput.value = ''; alert(`'${word}' için telaffuz bilgisi bulunamadı.`); }

    } catch (error) {
        console.error('IPA fetch error:', error);
        alert('Telaffuz alınırken bir hata oluştu.');
    } finally { loader.style.display = 'none'; loader.innerText = 'İşleniyor...'; }
}

function exportData() { closeAllMenus(); const blob = new Blob([JSON.stringify(db)], {type: "text/json;charset=utf-8"}); const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `turing_backup.json`; a.click(); }
function importData(e) { 
    closeAllMenus(); 
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader(); 
    reader.onload = (ev) => { 
        try { 
            const imp = JSON.parse(ev.target.result); 
            if(!imp.notes) imp.notes = []; if(!imp.games) imp.games = [];
            db = imp; 
            currentPath = null; 
            historyStack=[null]; 
            historyIndex=0; 
            saveDB(); 
            alert("Yüklendi."); 
        } catch(err) { alert("Hata! Dosya okunamadı."); console.error(err); } 
    }; 
    reader.readAsText(file); 
    e.target.value = ''; 
}

const selBox = document.getElementById('selectionBox');
let isSelecting = false;
let startX, startY;
let initialSelection = new Set();

function initContentAreaSelection() {
    const contentArea = document.getElementById('contentArea');
    if (!contentArea) return;

    contentArea.addEventListener('mousedown', (e) => {
        if(e.target !== e.currentTarget) return;
        if(e.button !== 0) return;

        isSelecting = true;
        startX = e.pageX;
        startY = e.pageY;
        
        selBox.style.display = 'block';
        selBox.style.width = '0px';
        selBox.style.height = '0px';
        selBox.style.left = startX + 'px';
        selBox.style.top = startY + 'px';

        if(!e.ctrlKey && !e.shiftKey) {
            selectedItems.clear();
            document.querySelectorAll('.icon-item').forEach(el => {
                el.classList.remove('selected');
                el.querySelector('.item-checkbox').checked = false;
            });
            document.getElementById('contentArea').classList.remove('show-checkboxes');
        }
        initialSelection = new Set(selectedItems);
    });

    // Mobil cihazlarda arka plana uzun basıldığında içerik menüsünü göstermek için
    let bgPressTimer;
    contentArea.addEventListener('touchstart', (e) => {
        if (e.target !== e.currentTarget) return; // Sadece arka planın kendisi için
        bgPressTimer = window.setTimeout(() => {
            showContextMenu(e, 'bg', null);
        }, 500); // 500ms uzun basma süresi
    });
    contentArea.addEventListener('touchmove', () => {
        clearTimeout(bgPressTimer);
    });
    contentArea.addEventListener('touchend', () => {
        clearTimeout(bgPressTimer);
    });

    contentAreaEventsInitialized = true;
}

document.addEventListener('mousemove', (e) => {
    if(!isSelecting) return;
    
    const currentX = e.pageX;
    const currentY = e.pageY;
    
    const width = Math.abs(currentX - startX);
    const height = Math.abs(currentY - startY);
    const left = Math.min(currentX, startX);
    const top = Math.min(currentY, startY);
    
    selBox.style.width = width + 'px';
    selBox.style.height = height + 'px';
    selBox.style.left = left + 'px';
    selBox.style.top = top + 'px';
    
    const boxRect = selBox.getBoundingClientRect();
    
    document.querySelectorAll('.icon-item').forEach(el => {
        const rect = el.getBoundingClientRect();
        const key = el.dataset.key;
        const intersect = !(rect.right < boxRect.left || rect.left > boxRect.right || rect.bottom < boxRect.top || rect.top > boxRect.bottom);
        
        if(intersect) { selectedItems.add(key); el.classList.add('selected'); el.querySelector('.item-checkbox').checked = true; }
        else { if(!e.ctrlKey && !e.shiftKey) { selectedItems.delete(key); el.classList.remove('selected'); el.querySelector('.item-checkbox').checked = false; } else if (initialSelection.has(key)) { selectedItems.add(key); el.classList.add('selected'); el.querySelector('.item-checkbox').checked = true; } else { selectedItems.delete(key); el.classList.remove('selected'); el.querySelector('.item-checkbox').checked = false; } }
    });
    
    if(selectedItems.size > 0) document.getElementById('contentArea').classList.add('show-checkboxes');
    document.getElementById('statusText').innerText = `${document.querySelectorAll('.icon-item').length} öğe | ${selectedItems.size} seçili`;
});

document.addEventListener('mouseup', () => { if(isSelecting) { isSelecting = false; selBox.style.display = 'none'; } });

function dragStart(e, type, id) {
    const key = `${type}-${id}`;
    
    // Sürükleme başladığında farenin ikon içindeki konumunu kaydet (currentTarget kullanarak)
    // e.target bazen içteki eleman (svg, label) olabilir, bu da hesaplamayı bozar.
    const rect = e.currentTarget.getBoundingClientRect();
    dragOffset = { x: e.clientX - rect.left, y: e.clientY - rect.top };

    if (!selectedItems.has(key)) {
        selectedItems.clear();
        selectedItems.add(key);
        document.querySelectorAll('.icon-item').forEach(el => {
            el.classList.remove('selected');
            const cb = el.querySelector('.item-checkbox');
            if(cb) cb.checked = false;
        });
        if(e.target.classList.contains('icon-item')) {
            e.target.classList.add('selected');
            const cb = e.target.querySelector('.item-checkbox');
            if(cb) cb.checked = true;
        }
        document.getElementById('statusText').innerText = `1 öğe | 1 seçili`;
    }
    e.dataTransfer.setData("text/plain", JSON.stringify([...selectedItems]));
    e.dataTransfer.effectAllowed = "move";
}

function allowDrop(e) {
    e.preventDefault();
    e.stopPropagation();
    e.currentTarget.classList.add('drag-over');
}

function dragLeave(e) {
    e.preventDefault();
    e.stopPropagation();
    e.currentTarget.classList.remove('drag-over');
}

function drop(e, targetId) {
    e.preventDefault();
    e.stopPropagation();
    e.currentTarget.classList.remove('drag-over');
    
    const data = e.dataTransfer.getData("text/plain");
    if (!data) return;
    
    const items = JSON.parse(data);
    let changed = false;

    items.forEach(key => {
        // Konteyner (klasör) güncelleme işlemi
        const parts = key.split('-'); const type = parts[0]; const id = Number(parts[1]);
        if (type === 'folder' && id === targetId) return;

        if(type === 'word') { const w = db.words.find(x => x.id === id); if(w && w.fid !== targetId) { w.fid = targetId; changed = true; } }
        if(type === 'note') { const n = db.notes.find(x => x.id === id); if(n && n.fid !== targetId) { n.fid = targetId; changed = true; } }
        if(type === 'game') { const g = db.games.find(x => x.id === id); if(g && g.fid !== targetId) { g.fid = targetId; changed = true; } }
        if(type === 'folder') { 
            let conflict = false;
            // Döngüsel taşımayı engelle (bir klasörü kendi içine taşımayı önle)
            if (targetId !== null) { let curr = db.folders.find(f => f.id === targetId); while(curr) { if(curr.id === id) { conflict = true; break; } curr = db.folders.find(f => f.id === curr.parentId); } }
            if(!conflict) { const f = db.folders.find(x => x.id === id); if(f && f.parentId !== targetId) { f.parentId = targetId; changed = true; } } 
        }
    });

    if(changed) { selectedItems.clear(); saveDB(); }
}

function applyHistoryAction(itemData, isUndo) {
    const { action, type, id, data } = itemData;
    const arr = getDbArray(type);
    const item = arr.find(x => x.id === id);

    if (action === 'DELETE') {
        // Silme işlemi: Geri alırken isDeleted=false, İleri alırken true
        if (item) item.isDeleted = !isUndo; 
    } 
    else if (action === 'CREATE') {
        // Oluşturma işlemi: Geri alırken diziden sil, İleri alırken ekle
        if (isUndo) {
            const idx = arr.findIndex(x => x.id === id);
            if (idx > -1) arr.splice(idx, 1);
        } else {
            // data içinde oluşturulan nesnenin kendisi var
            arr.push(data);
        }
    }
    else if (action === 'UPDATE') {
        // Güncelleme: data.changes = { field: { old: val, new: val } }
        if (item && data && data.changes) {
            Object.keys(data.changes).forEach(key => {
                item[key] = isUndo ? data.changes[key].old : data.changes[key].new;
            });
        }
    }
    else if (action === 'MOVE') {
        // Taşıma: data = { oldParent, newParent }
        if (item) {
            const field = type === 'folder' ? 'parentId' : 'fid';
            item[field] = isUndo ? data.oldParent : data.newParent;
        }
    }
}

function undoLastAction() {
    closeAllMenus();
    if (undoStack.length === 0) return;
    
    const lastBatch = undoStack.pop();
    redoStack.push(lastBatch); // Geri alınan işlemi ileri al yığınına ekle

    // Batch içindeki işlemleri tersine uygula
    lastBatch.forEach(op => applyHistoryAction(op, true));
    
    saveDB();
    updateUndoRedoUI();
}

function redoLastAction() {
    closeAllMenus();
    if (redoStack.length === 0) return;

    const batch = redoStack.pop();
    undoStack.push(batch); // İleri alınan işlemi tekrar geri al yığınına ekle

    // Batch içindeki işlemleri uygula
    batch.forEach(op => applyHistoryAction(op, false));
    
    saveDB();
    updateUndoRedoUI();
}

function updateUndoRedoUI() {
    const uBtn = document.getElementById('menuUndo');
    const rBtn = document.getElementById('menuRedo');
    if(uBtn) { if(undoStack.length > 0) uBtn.classList.remove('disabled'); else uBtn.classList.add('disabled'); }
    if(rBtn) { if(redoStack.length > 0) rBtn.classList.remove('disabled'); else rBtn.classList.add('disabled'); }
}

document.addEventListener('keydown', (e) => {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.isContentEditable) return;

    // F1: Yardım / Kullanım Kılavuzu
    if (e.key === 'F1') {
        e.preventDefault();
        openHelpWindow();
    }
    // F2: Yeniden Adlandır / Düzenle
    if (e.key === 'F2') {
        e.preventDefault();
        if (selectedItems.size === 1) {
            const key = selectedItems.values().next().value;
            const parts = key.split('-');
            const type = parts[0];
            const id = Number(parts[1]);
            if (type === 'folder') openFolderModal(id); else if (type === 'word') openWordModal(id); else if (type === 'note') openNoteModal(id); else if (type === 'game') openGameModal(id);
        }
    }
    // Ctrl + F: Bul (Arama)
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'f') {
        e.preventDefault();
        focusSearch();
    }
    // Ctrl + B: Gezgini (Sidebar) Gizle/Göster
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'b') {
        e.preventDefault();
        toggleUI();
    }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        undoLastAction();
    }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') {
        e.preventDefault();
        redoLastAction();
    }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'a') {
        e.preventDefault();
        selectAll();
    }
    if (e.key === 'Delete') {
        e.preventDefault();
        deleteSelected();
    }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'c') {
        e.preventDefault();
        if (selectedItems.size > 0) {
            clipboard.items = new Set(selectedItems);
            const pasteBtn = document.getElementById('topMenuPaste');
            if (pasteBtn) pasteBtn.style.display = 'flex';
        }
    }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'v') {
        e.preventDefault();
        executePaste();
    }
});

function openFolderModal(id) {
    document.getElementById('folderDialog').style.display = 'flex';
    if(id) {
        const f = db.folders.find(x => x.id === id);
        document.getElementById('fId').value = f.id;
        document.getElementById('fName').value = f.name;
        document.getElementById('fColorInput').value = f.color || '#fcd34d';
    } else {
        document.getElementById('fId').value = '';
        document.getElementById('fName').value = 'Yeni Klasör';
        document.getElementById('fColorInput').value = '#fcd34d';
    }
    document.getElementById('fName').focus();
    document.getElementById('fName').select();
}

function saveFolder() {
    let name = document.getElementById('fName').value.trim();
    const id = document.getElementById('fId').value;
    const color = document.getElementById('fColorInput').value;
    
    let targetParentId = creationContext;
    if(id) { const f = db.folders.find(x => x.id == id); if(f) targetParentId = f.parentId; }

    if(!name) {
        const siblings = db.folders.filter(f => !f.isDeleted && f.parentId === targetParentId && f.id != id);
        let maxNum = 0;
        siblings.forEach(f => {
            const match = f.name.match(/^Yeni Klasör (\d+)$/);
            if (match) { const num = parseInt(match[1]); if (num > maxNum) maxNum = num; }
        });
        name = `Yeni Klasör ${maxNum + 1}`;
    }
    
    if(id) {
        const f = db.folders.find(x => x.id == id);
        if(f) { 
            const oldName = f.name; const oldColor = f.color;
            f.name = name; f.color = color; 
            pushUndo([{ action: 'UPDATE', type: 'folder', id: f.id, data: { changes: { name: {old: oldName, new: name}, color: {old: oldColor, new: color} } } }]);
        }
    } else {
        const newObj = { id: Date.now(), name: name, parentId: creationContext, color: color };
        db.folders.push(newObj);
        pushUndo([{ action: 'CREATE', type: 'folder', id: newObj.id, data: newObj }]);
    }
    closeDialog('folderDialog');
    saveDB();
}

function selectColor(color) { document.getElementById('fColorInput').value = color; }

function checkWelcomeMessage() {
    if (!localStorage.getItem('turing_welcome_seen')) {
        document.getElementById('welcomeDialog').style.display = 'flex';
    }
}

function closeWelcomeDialog() {
    const checkbox = document.getElementById('dontShowWelcome');
    if (checkbox.checked) {
        localStorage.setItem('turing_welcome_seen', 'true');
    }
    document.getElementById('welcomeDialog').style.display = 'none';
}

function openResetDialog() {
    closeAllMenus();
    document.getElementById('resetDialog').style.display = 'flex';
}

function executeReset() {
    localStorage.removeItem('turing_v14');
    localStorage.removeItem('turing_welcome_seen');
    location.reload();
}

function openHelpWindow() {
    closeAllMenus();
    const w = window.open("", "TuringHelp", "width=900,height=700,scrollbars=yes,resizable=yes");
    if (!w) { alert("Lütfen açılır pencere (popup) engelleyicisini kapatın."); return; }
    
    const htmlContent = `
    <!DOCTYPE html>
    <html lang="tr">
    <head>
        <meta charset="UTF-8">
        <title>Turing - Kullanım Kılavuzu</title>
        <style>
            body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; line-height: 1.6; color: #334155; padding: 40px; background: #f1f5f9; max-width: 900px; margin: 0 auto; }
            h1 { color: #0f172a; border-bottom: 3px solid #3b82f6; padding-bottom: 15px; margin-bottom: 30px; font-size: 28px; }
            h2 { color: #1e293b; margin-top: 40px; margin-bottom: 15px; font-size: 22px; display: flex; align-items: center; }
            h2::before { content: ''; display: inline-block; width: 8px; height: 24px; background: #3b82f6; margin-right: 10px; border-radius: 4px; }
            h3 { color: #475569; margin-top: 25px; font-size: 18px; border-bottom: 1px solid #e2e8f0; padding-bottom: 5px; }
            .key { background: #fff; padding: 3px 8px; border-radius: 6px; font-family: 'Consolas', monospace; font-weight: bold; border: 1px solid #cbd5e1; color: #0f172a; box-shadow: 0 1px 2px rgba(0,0,0,0.05); font-size: 0.9em; }
            ul { list-style-type: disc; margin-left: 20px; }
            li { margin-bottom: 8px; }
            .section { background: #fff; padding: 30px; border-radius: 12px; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1); margin-bottom: 30px; }
            table { width: 100%; border-collapse: collapse; margin-top: 10px; }
            th, td { text-align: left; padding: 12px 15px; border-bottom: 1px solid #e2e8f0; }
            th { background-color: #f8fafc; color: #334155; font-weight: 600; }
            tr:last-child td { border-bottom: none; }
            .note-box { background-color: #fff7ed; border-left: 4px solid #f97316; padding: 15px; margin: 15px 0; border-radius: 0 4px 4px 0; color: #9a3412; }
            .tip-box { background-color: #eff6ff; border-left: 4px solid #3b82f6; padding: 15px; margin: 15px 0; border-radius: 0 4px 4px 0; color: #1e40af; }
        </style>
    </head>
    <body>
        <h1>📘 Turing Yardım Merkezi</h1>
        
        <div class="section">
            <h2>1. Turing Nedir?</h2>
            <p>Turing; notlarınızı, yabancı dil kelime kartlarınızı ve dosyalarınızı hiyerarşik bir yapıda düzenlemenizi sağlayan, tarayıcı tabanlı kişisel bir veritabanı uygulamasıdır. Windows Gezgini benzeri arayüzü ile kullanımı kolaydır ve verilerinizi yerel tarayıcınızda saklar.</p>
        </div>

        <div class="section">
            <h2>2. Arayüz ve Kullanım</h2>
            <h3>📂 Sol Menü (Gezgin)</h3>
            <p>Sol taraftaki ağaç yapısı, klasörleriniz arasında hızlıca gezinmenizi sağlar. Klasörleri sürükleyip bırakarak yerlerini değiştirebilir veya sağ tıklayarak yönetebilirsiniz.</p>
            
            <h3>📝 İçerik Alanı</h3>
            <p>Seçili klasörün içeriği burada görüntülenir. Boş bir alana sağ tıklayarak yeni öğeler oluşturabilirsiniz. Görünümü "Liste" veya "Detaylı" olarak değiştirebilirsiniz.</p>
            
            <h3>🔍 Arama Çubuğu</h3>
            <p>Üst kısımdaki arama kutusuna yazarak tüm klasörler, notlar ve kelimeler arasında anlık arama yapabilirsiniz. Kısayol: <span class="key">Ctrl</span> + <span class="key">F</span></p>
        </div>

        <div class="section">
            <h2>3. Temel İşlemler</h2>
            <ul>
                <li><b>Yeni Öğe Ekleme:</b> Boş alana sağ tıklayın veya üst menüdeki "Yeni" butonlarını kullanın. Klasör, Not veya Kelime Kartı oluşturabilirsiniz.</li>
                <li><b>Düzenleme:</b> Bir öğeyi düzenlemek için üzerine çift tıklayın veya seçip <span class="key">F2</span> tuşuna basın.</li>
                <li><b>Seçim Yapma:</b> Birden fazla öğe seçmek için <span class="key">Ctrl</span> tuşuna basılı tutarak tıklayın veya farenizle sürükleyerek bir seçim alanı oluşturun.</li>
                <li><b>Taşıma (Sürükle & Bırak):</b> Dosyaları veya notları tutup başka bir klasörün üzerine bırakarak taşıyabilirsiniz.</li>
                <li><b>Silme:</b> Seçili öğeleri <span class="key">Delete</span> tuşu ile Geri Dönüşüm Kutusu'na gönderebilirsiniz.</li>
            </ul>
            <div class="tip-box">💡 <b>İpucu:</b> Yanlışlıkla bir işlem mi yaptınız? <span class="key">Ctrl</span> + <span class="key">Z</span> ile işleminizi geri alabilirsiniz.</div>
        </div>

        <div class="section">
            <h2>4. Kelime Kartları ve Çeviri</h2>
            <p>Turing, dil öğrenimi için özel araçlar sunar:</p>
            <ul>
                <li><b>Otomatik Çeviri:</b> Kelime kartı oluştururken İngilizce kelimeyi yazıp "Çevir" butonuna basarsanız Türkçe karşılığı otomatik gelir.</li>
                <li><b>Görsel Ekleme:</b> Kelimeler için otomatik görsel araması yapabilir veya URL ekleyebilirsiniz.</li>
                <li><b>Toplu Yükleme:</b> "Toplu Kelime Ekle" menüsünden alt alta kelimeler yapıştırarak saniyeler içinde yüzlerce kart oluşturabilirsiniz.</li>
            </ul>
        </div>

        <div class="section">
            <h2>5. Veri Güvenliği ve Yedekleme</h2>
            <div class="note-box">⚠️ <b>Önemli:</b> Turing verilerinizi sunucuda değil, tarayıcınızın hafızasında (LocalStorage) saklar. Tarayıcı geçmişini temizlerseniz verileriniz silinebilir.</div>
            <p>Verilerinizi kaybetmemek için düzenli olarak:</p>
            <ol>
                <li>Sol menüdeki <b>Yedekle (İndir)</b> butonuna tıklayın.</li>
                <li>İnen <code>turing_backup.json</code> dosyasını güvenli bir yerde saklayın.</li>
                <li>Verilerinizi geri yüklemek için <b>Yedekleme Yükle</b> butonunu kullanabilirsiniz.</li>
            </ol>
        </div>

        <div class="section">
            <h2>6. Klavye Kısayolları</h2>
            <table>
                <tr><th>İşlem</th><th>Kısayol</th></tr>
                <tr><td>Yardım Kılavuzu</td><td><span class="key">F1</span></td></tr>
                <tr><td>Yeniden Adlandır / Düzenle</td><td><span class="key">F2</span></td></tr>
                <tr><td>Arama Yap</td><td><span class="key">Ctrl</span> + <span class="key">F</span></td></tr>
                <tr><td>Yan Menüyü Gizle/Göster</td><td><span class="key">Ctrl</span> + <span class="key">B</span></td></tr>
                <tr><td>Tümünü Seç</td><td><span class="key">Ctrl</span> + <span class="key">A</span></td></tr>
                <tr><td>Kopyala</td><td><span class="key">Ctrl</span> + <span class="key">C</span></td></tr>
                <tr><td>Yapıştır</td><td><span class="key">Ctrl</span> + <span class="key">V</span></td></tr>
                <tr><td>Geri Al</td><td><span class="key">Ctrl</span> + <span class="key">Z</span></td></tr>
                <tr><td>İleri Al (Yinele)</td><td><span class="key">Ctrl</span> + <span class="key">Y</span></td></tr>
                <tr><td>Sil (Geri Dönüşüm Kutusuna)</td><td><span class="key">Delete</span></td></tr>
            </table>
        </div>
        <div style="text-align:center; margin-top:40px; color:#94a3b8; font-size:13px; border-top:1px solid #e2e8f0; padding-top:20px;">
            Turing v1.4 &bull; Kişisel Veritabanı ve Öğrenme Asistanı
        </div>
    </body>
    </html>
    `;
    w.document.write(htmlContent);
    w.document.close();
}

/** Mobil menüyü kurar ve ekran boyutuna göre görünürlüğünü yönetir. */
function setupMobileMenu() {
    const desktopMenu = document.getElementById('menuDuzenle')?.parentElement;
    if (!desktopMenu) return;
    const header = desktopMenu.parentElement;
    if (!header) return;

    desktopMenu.classList.add('desktop-top-menu');

    let hamburger = document.getElementById('hamburger-btn');
    if (!hamburger) {
        hamburger = document.createElement('button');
        hamburger.id = 'hamburger-btn';
        hamburger.innerHTML = '&#9776;';
        hamburger.onclick = (e) => { e.stopPropagation(); toggleMobileMenuPanel(); };
        header.appendChild(hamburger);
    }

    if (!document.getElementById('mobile-menu-panel')) {
        const panel = document.createElement('div');
        panel.id = 'mobile-menu-panel';
        document.body.appendChild(panel);
    }

    const isMobile = window.innerWidth <= 768;
    desktopMenu.style.display = isMobile ? 'none' : 'flex';
    hamburger.style.display = isMobile ? 'block' : 'none';

    if (!isMobile) document.getElementById('mobile-menu-panel').classList.remove('active');
}

/** Mobil menü panelini açar/kapatır. */
function toggleMobileMenuPanel() {
    const panel = document.getElementById('mobile-menu-panel');
    if (!panel) return;
    if (panel.classList.toggle('active')) buildMobileMenu();
}

/** Mobil menünün içeriğini o anki duruma göre dinamik olarak oluşturur. */
function buildMobileMenu() {
    const panel = document.getElementById('mobile-menu-panel');
    if (!panel) return;
    panel.innerHTML = '';

    const hasSel = selectedItems.size > 0;
    const isTrash = currentPath === 'trash';
    const menuConfig = [ { label: 'Yeni', items: [ { label: 'Klasör', action: () => createItem('folder'), show: !isTrash }, { label: 'Not Defteri', action: () => createItem('note'), show: !isTrash }, { label: 'Kelime Kartı', action: () => createItem('word'), show: !isTrash }, { label: 'Oyun/Video', action: () => createItem('game'), show: !isTrash }, ] }, { label: 'Düzenle', items: [ { label: 'Geri Al', action: undoLastAction, show: undoStack.length > 0 }, { label: 'İleri Al', action: redoLastAction, show: redoStack.length > 0 }, { type: 'divider', show: (undoStack.length > 0 || redoStack.length > 0) && (hasSel || clipboard.items.size > 0) }, { label: 'Kopyala', action: () => { ctxAction('copy'); renderAll(); }, show: hasSel && !isTrash }, { label: 'Taşı...', action: moveSelected, show: hasSel && !isTrash }, { label: 'Yapıştır', action: executePaste, show: clipboard.items.size > 0 && !isTrash }, { label: 'Sil', action: deleteSelected, show: hasSel }, ] }, { label: 'Görünüm', items: [ { label: 'Tema Ayarları', action: openThemeSettingsDialog, show: true }, { label: 'Gezgini Gizle/Göster', action: toggleUI, show: true } ] }, { label: 'Araçlar', items: [ { label: 'Toplu Kelime Ekle', action: openBulkModal, show: !isTrash }, { label: 'Simge Değiştir', action: openIconDialog, show: selectedItems.size === 1 && !isTrash && !selectedItems.values().next().value.startsWith('word-') }, { label: 'Ses Ayarları', action: openSpeechSettingsDialog, show: true } ] }, { label: 'Veri', items: [ { label: 'Yedekle (İndir)', action: exportData, show: true }, { label: 'Yedekten Yükle', action: () => document.getElementById('importInput').click(), show: true }, { label: 'Uygulamayı Sıfırla', action: openResetDialog, show: true }, ] }, { label: 'Yardım', items: [ { label: 'Kullanım Kılavuzu', action: openHelpWindow, show: true }, ] } ];

    menuConfig.forEach(cat => {
        const visibleItems = cat.items.filter(item => item.show);
        if (visibleItems.length > 0) {
            panel.appendChild(Object.assign(document.createElement('div'), { className: 'mobile-menu-category', innerText: cat.label }));
            visibleItems.forEach(item => {
                if (item.type === 'divider') { panel.appendChild(document.createElement('hr')); return; }
                panel.appendChild(Object.assign(document.createElement('button'), { className: 'mobile-menu-item', innerHTML: item.label, onclick: () => { item.action(); toggleMobileMenuPanel(); } }));
            });
        }
    });
}

/** Mobil kenar çubuğunu kurar ve ekran boyutuna göre görünürlüğünü yönetir. */
function setupMobileSidebar() {
    const isMobile = window.innerWidth <= 768;
    document.body.classList.toggle('mobile-view', isMobile);

    // Buton ve arkaplan karartma katmanını oluştur
    if (!document.getElementById('sidebar-toggle-btn')) {
        const btn = document.createElement('button');
        btn.id = 'sidebar-toggle-btn';
        btn.innerHTML = '&#9776;'; // Hamburger ikonu
        btn.onclick = () => toggleMobileSidebar();
        
        // Adres çubuğunun önüne ekle
        const addressContainer = document.getElementById('addressPath')?.parentElement;
        if (addressContainer) addressContainer.prepend(btn);
    }

    if (!document.getElementById('sidebar-overlay')) {
        const overlay = document.createElement('div');
        overlay.id = 'sidebar-overlay';
        overlay.onclick = () => toggleMobileSidebar(true);
        document.body.appendChild(overlay);
    }

    // Mobilden masaüstüne geçerken açık kalmışsa kapat
    if (!isMobile) document.body.classList.remove('sidebar-open');
}

/** Mobil kenar çubuğu panelini açar/kapatır. */
function toggleMobileSidebar(forceClose = false) {
    if (window.innerWidth > 768 && !forceClose) return;
    document.body.classList.toggle('sidebar-open', forceClose ? false : undefined);
}

/** Araç çubuğuna Izgara/Liste görünüm değiştirme butonlarını ekler. */
function setupViewSwitcher() {
    const toolbar = document.querySelector('.toolbar');
    if (!toolbar || document.getElementById('viewSwitcher')) return;

    const switcher = document.createElement('div');
    switcher.id = 'viewSwitcher';
    switcher.className = 'view-switcher';
    switcher.innerHTML = `
        <button id="viewBtnGrid" class="view-btn" title="Izgara Görünümü">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor"><path d="M1 1h6v6H1V1zm8 0h6v6H9V1zM1 9h6v6H1V9zm8 0h6v6H9V9z"/></svg>
        </button>
        <button id="viewBtnList" class="view-btn" title="Liste Görünümü">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor"><path d="M2 4h12v1H2V4zm0 3h12v1H2V7zm0 3h12v1H2v-1zm0 3h12v1H2v-1z"/></svg>
        </button>
    `;
    
    const addressBar = toolbar.querySelector('.address-bar');
    if (addressBar) addressBar.insertAdjacentElement('afterend', switcher);
    else toolbar.appendChild(switcher);

    const gridBtn = document.getElementById('viewBtnGrid');
    const listBtn = document.getElementById('viewBtnList');

    const setView = (mode) => { localStorage.setItem('turing_view_mode', mode); gridBtn.classList.toggle('active', mode === 'grid'); listBtn.classList.toggle('active', mode === 'list'); renderContent(); };

    gridBtn.onclick = () => setView('grid');
    listBtn.onclick = () => setView('list');

    const currentView = localStorage.getItem('turing_view_mode') || 'grid';
    gridBtn.classList.toggle('active', currentView === 'grid');
    listBtn.classList.toggle('active', currentView === 'list');
}

/** Durum çubuğuna öğe boyutu ayarlama kaydırıcısını ekler. */
function setupSizeSlider() {
    const statusBar = document.getElementById('uiStatusBar');
    if (!statusBar || document.getElementById('sizeSliderContainer')) return; // Zaten varsa ekleme

    const sliderContainer = document.createElement('div');
    sliderContainer.id = 'sizeSliderContainer';
    sliderContainer.style.cssText = 'display: flex; align-items: center; margin-left: auto; padding-right: 15px;';

    sliderContainer.innerHTML = `
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-right: 8px; color: var(--text-color-light);"><rect x="3" y="3" width="7" height="7"></rect><rect x="14" y="3" width="7" height="7"></rect><rect x="14" y="14" width="7" height="7"></rect><rect x="3" y="14" width="7" height="7"></rect></svg>
        <input type="range" id="sizeSlider" min="80" max="200" step="2" style="width: 100px; cursor: pointer;">
    `;
    statusBar.appendChild(sliderContainer);

    const slider = document.getElementById('sizeSlider');

    const applySize = (sizeValue) => {
        const size = parseInt(sizeValue);
        // Font boyutunu orantılı olarak hesapla (80px'de 11px, 200px'de 15px)
        const fontSize = 11 + ((size - 80) / 120) * 4;

        document.documentElement.style.setProperty('--icon-size', `${size}px`);
        document.documentElement.style.setProperty('--icon-font-size', `${fontSize.toFixed(2)}px`);
    };

    slider.addEventListener('input', (e) => applySize(e.target.value));
    slider.addEventListener('change', (e) => localStorage.setItem('turing_icon_size', e.target.value));

    // Sayfa yüklendiğinde kayıtlı boyutu uygula
    const savedSize = localStorage.getItem('turing_icon_size') || '110'; // Varsayılan 110px
    slider.value = savedSize;
    applySize(savedSize);
}

/** Ses ayarları için gerekli fonksiyonlar */
function createSpeechSettingsDialog() {
    if (document.getElementById('speechSettingsDialog')) return;

    const dialogHtml = `
        <div class="dialog-header">
            <span>🔊 Ses Ayarları</span>
            <span onclick="closeDialog('speechSettingsDialog')">&times;</span>
        </div>
        <div class="dialog-body">
            <label for="speechVoiceSelect">Ses</label>
            <select id="speechVoiceSelect">
                <option>Sesler yükleniyor...</option>
            </select>
            
            <label for="speechRateSlider" style="margin-top: 16px;">Okuma Hızı</label>
            <div style="display: flex; align-items: center; gap: 10px;">
                <input type="range" id="speechRateSlider" min="0.5" max="2" step="0.1" style="width: 100%;">
                <span id="speechRateValue" style="font-weight: bold; width: 30px;">1.0</span>
            </div>
        </div>
        <div class="dialog-footer">
            <button class="dialog-btn" onclick="closeDialog('speechSettingsDialog')">İptal</button>
            <button class="dialog-btn primary" onclick="saveSpeechSettings()">Kaydet</button>
        </div>
    `;
    const dialog = document.createElement('div');
    dialog.id = 'speechSettingsDialog';
    dialog.className = 'dialog-overlay';
    dialog.style.display = 'none';

    const dialogContent = document.createElement('div');
    dialogContent.className = 'dialog';
    dialogContent.innerHTML = dialogHtml;

    dialog.appendChild(dialogContent);
    document.body.appendChild(dialog);

    const slider = document.getElementById('speechRateSlider');
    const rateValue = document.getElementById('speechRateValue');
    slider.addEventListener('input', () => {
        rateValue.textContent = parseFloat(slider.value).toFixed(1);
    });
}

function populateVoiceList() {
    if (typeof window.speechSynthesis === 'undefined' || availableVoices.length > 0) return;
    availableVoices = window.speechSynthesis.getVoices();
    const voiceSelect = document.getElementById('speechVoiceSelect');
    if (!voiceSelect) return;

    voiceSelect.innerHTML = '';
    voiceSelect.appendChild(Object.assign(document.createElement('option'), { value: 'default', textContent: 'Tarayıcı Varsayılanı' }));

    availableVoices.forEach(voice => {
        voiceSelect.appendChild(Object.assign(document.createElement('option'), { textContent: `${voice.name} (${voice.lang})`, value: voice.voiceURI }));
    });
    voiceSelect.value = localStorage.getItem('turing_speech_voice') || 'default';
}

function openSpeechSettingsDialog() {
    closeAllMenus();
    document.getElementById('speechSettingsDialog').style.display = 'flex';
    populateVoiceList();
    const savedRate = localStorage.getItem('turing_speech_rate') || '0.9';
    document.getElementById('speechRateSlider').value = savedRate;
    document.getElementById('speechRateValue').textContent = parseFloat(savedRate).toFixed(1);
}

function saveSpeechSettings() {
    localStorage.setItem('turing_speech_voice', document.getElementById('speechVoiceSelect').value);
    localStorage.setItem('turing_speech_rate', document.getElementById('speechRateSlider').value);
    closeDialog('speechSettingsDialog');
    alert('Ses ayarları kaydedildi.');
}

/** Tema Ayarları için gerekli fonksiyonlar */
function createThemeSettingsDialog() {
    if (document.getElementById('themeSettingsDialog')) return;
 
    const dialogHtml = `
        <div class="dialog-header">
            <span>🎨 Tema Ayarları</span>
            <span onclick="closeDialog('themeSettingsDialog')">&times;</span>
        </div>
        <div class="dialog-body" id="themeSettingsBody" style="gap: 0;">
            <label>Aydınlık Temalar</label>
            <div class="theme-option-group">
                <label><input type="radio" name="theme_choice" value="light"> ☀️ Varsayılan Aydınlık</label>
                <label><input type="radio" name="theme_choice" value="theme-macos-light"> 🍏 macOS (Light)</label>
                <label><input type="radio" name="theme_choice" value="theme-winxp"> 🏞️ Windows XP (Luna)</label>
                <label><input type="radio" name="theme_choice" value="theme-win95"> 🪟 Windows 95</label>
            </div>
            <label>Karanlık Temalar</label>
            <div class="theme-option-group">
                <label><input type="radio" name="theme_choice" value="theme-dark-midnight"> 🌃 Gece Yarısı (Mavi)</label>
                <label><input type="radio" name="theme_choice" value="theme-dark-forest"> 🌲 Orman (Yeşil)</label>
                <label><input type="radio" name="theme_choice" value="theme-dark-dracula"> 🧛 Vampir (Mor)</label>
                <label><input type="radio" name="theme_choice" value="theme-dark-macos"> 🍎 macOS (Dark)</label>
                <label><input type="radio" name="theme_choice" value="theme-dark-win10"> 🌌 Windows 10 (Dark)</label>
                <label><input type="radio" name="theme_choice" value="theme-dark-ubuntu"> 🐧 Ubuntu (Yaru)</label>
                <label><input type="radio" name="theme_choice" value="theme-dark-nord"> ❄️ Nord</label>
                <label><input type="radio" name="theme_choice" value="theme-dark-solarized"> 🌞 Solarized Dark</label>
                <label><input type="radio" name="theme_choice" value="theme-dark-gruvbox"> 📜 Gruvbox Dark</label>
                <label><input type="radio" name="theme_choice" value="theme-dark-material"> 🤖 Android (Material)</label>
            </div>
        </div>
        <div class="dialog-footer">
            <button class="dialog-btn primary" onclick="saveThemeSettings()">Uygula</button>
        </div>
    `;
    const dialog = document.createElement('div');
    dialog.id = 'themeSettingsDialog';
    dialog.className = 'dialog-overlay';
    dialog.style.display = 'none';
 
    const dialogContent = document.createElement('div');
    dialogContent.className = 'dialog';
    dialogContent.innerHTML = dialogHtml;
 
    dialog.appendChild(dialogContent);
    document.body.appendChild(dialog);
}

function openThemeSettingsDialog() {
    closeAllMenus();
    const dialog = document.getElementById('themeSettingsDialog');
    dialog.style.display = 'flex';
 
    // Renamed old themes for backward compatibility
    let currentTheme = localStorage.getItem('turing_theme') || 'light';
    if (currentTheme === 'dark-theme-midnight') currentTheme = 'theme-dark-midnight';
    if (currentTheme === 'dark-theme-forest') currentTheme = 'theme-dark-forest';
    if (currentTheme === 'dark-theme-dracula') currentTheme = 'theme-dark-dracula';
 
    const themeRadio = document.querySelector(`input[name="theme_choice"][value="${currentTheme}"]`);
    if (themeRadio) {
        themeRadio.checked = true;
    } else { // Fallback if saved theme is invalid or not found
        document.querySelector('input[name="theme_choice"][value="light"]').checked = true;
    }
}

function saveThemeSettings() {
    const finalTheme = document.querySelector('input[name="theme_choice"]:checked').value;
    localStorage.setItem('turing_theme', finalTheme);

    // If the selected theme is dark, save it as the last used dark theme for the toggle button
    if (finalTheme.includes('dark')) {
        localStorage.setItem('turing_last_dark_theme', finalTheme);
    }

    applyTheme(finalTheme);
    closeDialog('themeSettingsDialog');
}

/** Tema (Aydınlık/Karanlık) için gerekli fonksiyonlar */
function applyTheme(theme) {
    const themeToggleBtn = document.getElementById('themeToggleBtn');
    
    // Find and remove all old theme classes to prevent conflicts
    const oldThemes = Array.from(document.body.classList).filter(
        c => c.startsWith('theme-') || c.startsWith('dark-theme-') || c === 'dark-mode'
    );
    document.body.classList.remove(...oldThemes);

    // Add new theme class
    if (theme && theme !== 'light') {
        document.body.classList.add(theme);
    }

    // Add the generic dark-mode class if it's a dark theme
    const isDark = theme.includes('dark');
    if (isDark) {
        document.body.classList.add('dark-mode');
    }
    
    // Update the toggle button icon
    if (themeToggleBtn) {
        themeToggleBtn.innerHTML = isDark ? '☀️' : '🌙';
    }
}

function toggleTheme() {
    const currentTheme = localStorage.getItem('turing_theme') || 'light';
    let newTheme;

    if (currentTheme === 'light' || !currentTheme.includes('dark')) {
        // Switch to the last used dark theme, or the default dark theme
        newTheme = localStorage.getItem('turing_last_dark_theme') || 'theme-dark-midnight';
    } else {
        // Switch to light theme
        newTheme = 'light';
    }
    localStorage.setItem('turing_theme', newTheme);
    applyTheme(newTheme);
}

function setupThemeSwitcher() {
    const menuBar = document.getElementById('uiMenuBar');
    if (!menuBar || document.getElementById('themeToggleBtn')) return;

    const spacer = document.createElement('div');
    spacer.style.flex = '1';
    menuBar.appendChild(spacer);

    const btn = document.createElement('button');
    btn.id = 'themeToggleBtn';
    btn.title = 'Temayı Değiştir';
    btn.style.cssText = 'background:transparent; border:none; font-size:18px; cursor:pointer; color: var(--text-muted); padding: 6px 12px; border-radius: 6px;';
    btn.onclick = toggleTheme;
    btn.onmouseover = () => btn.style.background = 'var(--hover-bg)';
    btn.onmouseout = () => btn.style.background = 'transparent';
    
    menuBar.appendChild(btn);
}

renderAll();
checkWelcomeMessage();

// Oyun Penceresi Sürükle ve Boyutlandır Mantığı
(function initGameWindowLogic() {
    const win = document.getElementById('playDialog');
    const header = document.getElementById('playHeader');
    const resize = document.getElementById('playResize');
    let isDragging = false, isResizing = false;
    let startX, startY, startLeft, startTop, startW, startH;

    // "Yeni Sekmede Aç" butonu oluştur
    if (header) {
        const controls = header.querySelector('.window-controls');
        if (controls && !document.getElementById('playOpenNewTab')) {
            const newTabBtn = document.createElement('button');
            newTabBtn.id = 'playOpenNewTab';
            newTabBtn.title = 'Yeni Sekmede Aç';
            newTabBtn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path><polyline points="15 3 21 3 21 9"></polyline><line x1="10" y1="14" x2="21" y2="3"></line></svg>`;
            controls.insertBefore(newTabBtn, controls.firstChild);
        }
    }

    // Sürükleme
    header.addEventListener('mousedown', (e) => {
        if (window.innerWidth <= 768) return; // Mobil'de sürüklemeyi devre dışı bırak
        if(e.target.closest('.window-controls') || win.classList.contains('maximized')) return;
        isDragging = true;
        const rect = win.getBoundingClientRect();
        // Transform'u kaldırıp absolute pozisyona geç
        win.style.transform = 'none'; win.style.left = rect.left + 'px'; win.style.top = rect.top + 'px';
        startX = e.clientX; startY = e.clientY; startLeft = rect.left; startTop = rect.top;
        document.body.style.userSelect = 'none';
    });

    // Boyutlandırma
    resize.addEventListener('mousedown', (e) => {
        if (window.innerWidth <= 768) return; // Mobil'de boyutlandırmayı devre dışı bırak
        if(win.classList.contains('maximized')) return;
        e.preventDefault(); e.stopPropagation();
        isResizing = true;
        const rect = win.getBoundingClientRect();
        // Transform varsa kaldır
        if(win.style.transform !== 'none') { win.style.transform = 'none'; win.style.left = rect.left + 'px'; win.style.top = rect.top + 'px'; }
        startX = e.clientX; startY = e.clientY; startW = rect.width; startH = rect.height;
        document.body.style.userSelect = 'none';
    });

    document.addEventListener('mousemove', (e) => {
        if(isDragging) { win.style.left = (startLeft + e.clientX - startX) + 'px'; win.style.top = (startTop + e.clientY - startY) + 'px'; }
        if(isResizing) { win.style.width = (startW + e.clientX - startX) + 'px'; win.style.height = (startH + e.clientY - startY) + 'px'; }
    });

    document.addEventListener('mouseup', () => {
        isDragging = false; isResizing = false; document.body.style.userSelect = '';
    });
})();

// Fullscreen değişimini dinle (ESC ile çıkıldığında senkronizasyon için)
document.addEventListener('fullscreenchange', () => {
    const win = document.getElementById('playDialog');
    if (!document.fullscreenElement) win.classList.remove('maximized');
    else win.classList.add('maximized');
});

document.addEventListener('DOMContentLoaded', () => {
    createThemeSettingsDialog();
    createSpeechSettingsDialog();
    setupMobileMenu();
    setupMobileSidebar();
    setupSizeSlider();
    setupViewSwitcher();
    setupThemeSwitcher();

    // Tarayıcı seslerini yükle
    if (typeof window.speechSynthesis !== 'undefined') {
        window.speechSynthesis.onvoiceschanged = populateVoiceList;
    }

    // Kayıtlı temayı uygula
    let savedTheme = localStorage.getItem('turing_theme') || 'light';
    // Geriye dönük uyumluluk için eski tema adlarını yenileriyle değiştir
    if (savedTheme === 'dark-theme-midnight') savedTheme = 'theme-dark-midnight';
    if (savedTheme === 'dark-theme-forest') savedTheme = 'theme-dark-forest';
    if (savedTheme === 'dark-theme-dracula') savedTheme = 'theme-dark-dracula';
    applyTheme(savedTheme);
});
window.addEventListener('resize', () => {
    setupMobileMenu();
    setupMobileSidebar();
});

function pushUndo(operations) {
    if (!operations || operations.length === 0) return;
    undoStack.push(operations);
    redoStack = [];
    updateUndoRedoUI();
}

function getDbArray(type) {
    if(type === 'folder') return db.folders;
    if(type === 'word') return db.words;
    if(type === 'note') return db.notes;
    if(type === 'game') return db.games;
    return [];
}
