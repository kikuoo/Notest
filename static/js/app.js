// --- LOGGING SYSTEM ---
window.debugLog = function(msg, isError = false) {
    if (isError) {
        console.error('WowNote [v3.5-clean-ui]:', msg);
    } else {
        console.log('WowNote [v3.5-clean-ui]:', msg);
    }
};

// --- LEGACY INPUT INITIALIZATION ---
(function() {
    // 互換性維持用の非表示要素のみ残す
    const initLegacyInput = () => {
        if (!document.getElementById('legacy-directory-input')) {
            const legacyInput = document.createElement('input');
            legacyInput.type = 'file';
            legacyInput.id = 'legacy-directory-input';
            legacyInput.webkitdirectory = true;
            legacyInput.style.display = 'none';
            document.body.appendChild(legacyInput);
            
            legacyInput.addEventListener('change', (e) => {
                const files = e.target.files;
                if (files.length > 0) {
                    const rootName = files[0].webkitRelativePath.split('/')[0];
                    const sectionId = parseInt(document.getElementById('editingSectionId')?.value || "0");
                    const pathInput = document.getElementById('sectionStoragePath');
                    if (pathInput) pathInput.value = rootName;
                    if (sectionId > 0) {
                        const mockHandle = window.createMockHandle(files, rootName);
                        localDirHandles[sectionId] = mockHandle;
                        localDirSubHandles[sectionId] = mockHandle;
                        sectionNavigationHistory[sectionId] = { history: [rootName], currentIndex: 0, handles: [mockHandle] };
                    }
                    alert('フォルダを認識しました。「保存」を押して反映させてください。');
                }
            });
        }
    };

    if (document.body) {
        initLegacyInput();
    } else {
        document.addEventListener('DOMContentLoaded', initLegacyInput);
    }
})();

window.createMockHandle = function(files, pathPrefix = "") {
    const rootArr = Array.from(files);
    const name = pathPrefix.split('/').pop() || (rootArr[0]?.webkitRelativePath.split('/')[0] || "root");
    return {
        kind: 'directory',
        name: name,
        entries: async function* () {
            const seen = new Set();
            for (const file of rootArr) {
                const relPath = file.webkitRelativePath;
                if (!relPath.startsWith(pathPrefix)) continue;
                const tail = relPath.substring(pathPrefix.length + (pathPrefix ? 1 : 0));
                if (!tail) continue;
                const parts = tail.split('/');
                const itemName = parts[0];
                if (seen.has(itemName)) continue;
                seen.add(itemName);
                const isDir = parts.length > 1;
                const newPrefix = pathPrefix + (pathPrefix ? '/' : '') + itemName;
                yield [itemName, isDir ? window.createMockHandle(rootArr, newPrefix) : {
                    kind: 'file',
                    name: itemName,
                    getFile: async () => file
                }];
            }
        },
        getDirectoryHandle: async (subName) => window.createMockHandle(rootArr, pathPrefix + (pathPrefix ? '/' : '') + subName),
        getFileHandle: async (subName) => {
            const search = (pathPrefix ? pathPrefix + '/' : '') + subName;
            const file = rootArr.find(f => f.webkitRelativePath === search);
            return { kind: 'file', name: subName, getFile: async () => file };
        },
        queryPermission: async () => 'granted',
        requestPermission: async () => 'granted'
    };
};

window.openLegacyDirectorySelector = function() {
    document.getElementById('legacy-directory-input').click();
};

window.debugLog('DEBUG: app.js loaded v3.5-clean-ui');

// 全域クリックハンドラ (デバッグ用)
document.addEventListener('click', (e) => {
    const target = e.target;
    const info = `${target.tagName}${target.id ? '#' + target.id : ''}${target.className ? '.' + target.className.replace(/ /g, '.') : ''}`;
    window.debugLog(`Global Click: ${info}`);
}, true);

window.onerror = function(message, source, lineno, colno, error) {
    const errMsg = `ERROR: ${message}\nAt: ${source}:${lineno}:${colno}`;
    window.debugLog(errMsg, true);
    return false;
};
// --- DEBUG HUD SYSTEM END ---

// グローバル変数
let currentTabId = null;
let currentPageId = null;
let currentWorkspace = 1; // ワークスペースID (1, 2, 3)
let tabs = [];
let storageLocations = [];
let sections = [];
let draggedSection = null;
let sectionZIndex = 1000;

// ナビゲーション履歴の管理用
// 履歴の構造: { [sectionId]: { history: string[], currentIndex: number } }
let sectionNavigationHistory = {};

// ローカルファイルシステム用: セクションIDとディレクトリハンドルのマッピング
const localDirHandles = {}; // { sectionId: FileSystemDirectoryHandle (root) }
const localDirSubHandles = {}; // { sectionId: FileSystemDirectoryHandle (current) }

// フォルダピッカーの状態管理（多重起動防止用）
let isFolderPickerActive = false;

// デバイス固有ID（localStorageに永続）→複数PC間で設定を分離する
function getDeviceId() {
    let id = localStorage.getItem('notest_device_id');
    if (!id) {
        id = 'dev_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8);
        localStorage.setItem('notest_device_id', id);
    }
    return id;
}

// DEBUG: バージョン表示の更新 (DOM読み込み前に実行しようとするとエラーになる可能性があるため、関数外またはDOMContentLoaded内で行う)
// ここではDOMContentLoaded内で実行するように修正

// デバイス固有の設定を保存・取得
function saveDeviceSetting(key, value) {
    const dkey = `notest_${getDeviceId()}_${key}`;
    localStorage.setItem(dkey, JSON.stringify(value));
}

function loadDeviceSetting(key, defaultValue) {
    const dkey = `notest_${getDeviceId()}_${key}`;
    const v = localStorage.getItem(dkey);
    return v !== null ? JSON.parse(v) : defaultValue;
}

// IndexedDBへのハンドル保存（リロード後も持続するため）
const FS_DB_NAME = 'notest-fs-handles';
const FS_DB_VERSION = 1;
const FS_STORE = 'handles';

function openFsDB() {
    return new Promise((resolve, reject) => {
        const req = indexedDB.open(FS_DB_NAME, FS_DB_VERSION);
        req.onupgradeneeded = e => e.target.result.createObjectStore(FS_STORE);
        req.onsuccess = e => resolve(e.target.result);
        req.onerror = e => reject(e.target.error);
    });
}

async function saveFsHandle(sectionId, handle) {
    const db = await openFsDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(FS_STORE, 'readwrite');
        tx.objectStore(FS_STORE).put(handle, String(sectionId));
        tx.oncomplete = resolve;
        tx.onerror = e => reject(e.target.error);
    });
}

async function loadAllFsHandles() {
    const db = await openFsDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(FS_STORE, 'readonly');
        const keys = [], values = [];
        tx.objectStore(FS_STORE).openCursor().onsuccess = e => {
            const cursor = e.target.result;
            if (cursor) { keys.push(cursor.key); values.push(cursor.value); cursor.continue(); }
            else resolve(keys.map((k, i) => ({ sectionId: parseInt(k), handle: values[i] })));
        };
        tx.onerror = e => reject(e.target.error);
    });
}

async function deleteFsHandle(sectionId) {
    const db = await openFsDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(FS_STORE, 'readwrite');
        tx.objectStore(FS_STORE).delete(String(sectionId));
        tx.oncomplete = resolve;
        tx.onerror = e => reject(e.target.error);
    });
}

// API URL構築用ヘルパー
window.getApiUrl = function (path) {
    // /note/ サブフォルダ対応: /api/ で始まるURLに /note プレフィックスを付ける
    if (path.startsWith('/api/')) {
        return '/note' + path;
    }
    return path;
};

// API呼び出し関数
// ネットワーク状態・ホスト判定用ヘルパー
window.isLocalServer = function() {
    return window.location.hostname === 'localhost' || 
           window.location.hostname === '127.0.0.1' || 
           window.location.hostname.startsWith('192.168.') ||
           window.location.hostname.startsWith('10.');
};

// API呼び出し関数
window.apiCall = async function(url, options = {}) {
    const showAlert = options.showAlert !== false;

    // キャッシュ対策：GETリクエストにはタイムスタンプ付与
    if (!options.method || options.method === 'GET') {
        const separator = url.includes('?') ? '&' : '?';
        url += `${separator}_t=${Date.now()}`;
    }

    url = window.getApiUrl(url);
    try {
        window.debugLog(`API Call: ${url}`);
        const response = await fetch(url, {
            headers: {
                'Content-Type': 'application/json',
                ...options.headers
            },
            credentials: 'include',
            ...options
        });
        if (!response.ok) {
            let errorMessage = `HTTP error! status: ${response.status}`;
            try {
                const errorData = await response.json();
                if (errorData && errorData.error) {
                    errorMessage = errorData.error;
                }
            } catch (e) {
                // Ignore
            }
            window.debugLog(`API Error (${url}): ${errorMessage}`, true);
            throw new Error(errorMessage);
        }
        const data = await response.json();
        window.debugLog(`API Success (${url})`);
        return data;
    } catch (error) {
        console.error(`[API_CALL_ERROR] ${url}:`, error);
        window.debugLog(`API Failed (${url}): ${error.message}`, true);
        if (showAlert) {
            alert('通信エラーが発生しました: ' + error.message + '\nURL: ' + url);
        }
        throw error;
    }
}

// タブ関連
async function loadTabs() {
    try {
        console.log('Start loading tabs...');
        tabs = await apiCall('/api/tabs');
        console.log('Tabs loaded:', tabs);
        renderTabs();

        // localStorageから前回の状態を復元 (ワークスペース固有の設定を優先)
        const wsTabId = localStorage.getItem(`notest_current_tab_id_ws${currentWorkspace}`);
        const wsPageId = localStorage.getItem(`notest_current_page_id_ws${currentWorkspace}`);
        const savedTabId = wsTabId || localStorage.getItem('currentTabId');
        const savedPageId = wsPageId || localStorage.getItem('currentPageId');

        if (savedTabId && tabs.find(t => t.id === parseInt(savedTabId))) {
            const tabId = parseInt(savedTabId);
            const hiddenTabs = getHiddenTabs();

            if (!hiddenTabs.includes(tabId)) {
                console.log('Restoring saved tab:', tabId);
                currentTabId = tabId;
                await selectTab(currentTabId, savedPageId ? parseInt(savedPageId) : null);
            } else {
                const visibleTabs = tabs.filter(t => !hiddenTabs.includes(t.id));
                if (visibleTabs.length > 0) {
                    await selectTab(visibleTabs[0].id);
                }
            }
        } else if (tabs.length > 0) {
            const hiddenTabs = getHiddenTabs();
            const visibleTabs = tabs.filter(t => !hiddenTabs.includes(t.id));
            if (visibleTabs.length > 0) {
                await selectTab(visibleTabs[0].id);
            }
        }
    } catch (e) {
        console.error('Failed to load tabs:', e);
        alert('タブの読み込みに失敗しました: ' + e.message);
    }
}

async function createTab(name) {
    const tab = await apiCall('/api/tabs', {
        method: 'POST',
        body: JSON.stringify({ name, order_index: tabs.length })
    });
    tab.pages = []; // 初期化
    tabs.push(tab);

    // 他の全ワークスペース(1, 2, 3)でこのタブを非表示にする（独立性を保つため）
    [1, 2, 3].forEach(wsId => {
        if (wsId !== currentWorkspace) {
            let hiddenTabs = [];
            try {
                const key = `notest_hidden_tabs_ws${wsId}`;
                const stored = localStorage.getItem(key);
                hiddenTabs = stored ? JSON.parse(stored) : [];
                if (!hiddenTabs.includes(tab.id)) {
                    hiddenTabs.push(tab.id);
                    localStorage.setItem(key, JSON.stringify(hiddenTabs));
                }
            } catch (e) {
                console.error(`Error hiding tab ${tab.id} in workspace ${wsId}:`, e);
            }
        }
    });

    renderTabs();
    selectTab(tab.id);
}

async function deleteTab(tabId) {
    if (!confirm('このタブを削除しますか？')) return;

    try {
        await apiCall(`/api/tabs/${tabId}`, { method: 'DELETE' });

        // 削除成功後に状態を更新
        tabs = tabs.filter(t => t.id !== tabId);

        if (currentTabId === tabId) {
            currentTabId = null;
            currentPageId = null;
            sections = [];
            localStorage.removeItem('currentTabId');
            localStorage.removeItem('currentPageId');
            renderPageContent();
        }

        renderTabs();
        console.log(`Tab ${tabId} deleted successfully`);
    } catch (error) {
        console.error('Delete tab failed:', error);
        // apiCall内でalertが表示されるので、ここでは何もしない
    }
}

function renderTabs() {
    const tabsList = document.getElementById('tabsList');
    if (!tabsList) return;
    tabsList.innerHTML = '';

    try {
        // PC固有の非表示タブ設定を取得
        const hiddenTabs = getHiddenTabs();

        // 設定ボタンの表示/非表示を切り替え
        const btnManageHiddenTabs = document.getElementById('btnManageHiddenTabs');
        if (btnManageHiddenTabs) {
            btnManageHiddenTabs.style.display = hiddenTabs.length > 0 ? 'block' : 'none';
        }

        // 非表示タブを除外して表示
        const visibleTabs = tabs.filter(tab => !hiddenTabs.includes(tab.id));

        // 全て非表示になっていて選択タブがない場合のフォールバック
        if (visibleTabs.length > 0 && (!currentTabId || !visibleTabs.find(t => t.id === currentTabId))) {
            // 自動選択は初回のみ、または以前のタブが消えた場合のみにする
            // currentTabId = visibleTabs[0].id;
        } else if (visibleTabs.length === 0) {
            currentTabId = null;
        }

        visibleTabs.forEach(tab => {
            const tabItem = document.createElement('div');
            tabItem.className = `tab-item ${currentTabId === tab.id ? 'active' : ''}`;
            tabItem.innerHTML = `
                <span class="tab-item-name">${escapeHtml(tab.name)}</span>
                <button class="tab-item-delete" onclick="event.stopPropagation(); deleteTab(${tab.id})" title="タブを削除">×</button>
            `;
            tabItem.onclick = () => selectTab(tab.id);
            tabItem.oncontextmenu = (e) => showTabContextMenu(e, tab.id, tab.name);
            tabsList.appendChild(tabItem);
        });
    } catch (error) {
        console.error('CRITICAL: renderTabs failed:', error);
        window.debugLog(`renderTabs error: ${error.message}`, true);
    }

    // 常時表示の「+ 新しいタブ」ボタンをリストの最後に追加 (エラー時も試みる)
    try {
        const addTabBtn = document.createElement('div');
        addTabBtn.className = 'tab-item add-tab-item';
        addTabBtn.style.color = '#0078d4';
        addTabBtn.style.fontWeight = 'bold';
        addTabBtn.style.justifyContent = 'center';
        addTabBtn.style.border = '1px dashed #0078d4';
        addTabBtn.style.margin = '10px';
        addTabBtn.style.cursor = 'pointer';
        addTabBtn.innerHTML = '+ 新しいタブを追加';
        addTabBtn.onclick = () => showModal('modalNewTab');
        tabsList.appendChild(addTabBtn);
    } catch (e) {
        console.error('Failed to add the Add Tab button:', e);
    }
}

// タブのコンテキストメニュー
function showTabContextMenu(e, tabId, tabName) {
    e.preventDefault();
    e.stopPropagation();
    hideContextMenu();

    const contextMenu = document.getElementById('contextMenu');

    const hiddenTabs = getHiddenTabs();
    const isHidden = hiddenTabs.includes(tabId);

    contextMenu.innerHTML = `
        <div class="context-menu-item" onclick="renameTab(${tabId}, '${escapeHtml(tabName)}'); hideContextMenu();">✏️ タブ名の変更</div>
        <div class="context-menu-item" onclick="toggleTabVisibility(${tabId}, true); hideContextMenu();">👁️‍🗨️ このPCでは非表示にする</div>
        <div class="context-menu-item" onclick="deleteTab(${tabId}); hideContextMenu();" style="color: #ff4444;">🗑️ 完全に削除 (全PC)</div>
    `;

    contextMenu.style.display = 'block';
    adjustContextMenuPosition(contextMenu, e);

    // クリックでメニューを閉じる
    setTimeout(() => {
        document.addEventListener('click', hideContextMenu, { once: true });
    }, 0);
}

// --- PC固有のタブ表示設定 (ワークスペース対応) ---
function getHiddenTabs() {
    try {
        const key = `notest_hidden_tabs_ws${currentWorkspace}`;
        const stored = localStorage.getItem(key);
        return stored ? JSON.parse(stored) : [];
    } catch (e) {
        return [];
    }
}

function toggleTabVisibility(tabId, hide) {
    let hiddenTabs = getHiddenTabs();

    if (hide) {
        if (!hiddenTabs.includes(tabId)) {
            hiddenTabs.push(tabId);
        }
    } else {
        hiddenTabs = hiddenTabs.filter(id => id !== tabId);
    }

    const key = `notest_hidden_tabs_ws${currentWorkspace}`;
    localStorage.setItem(key, JSON.stringify(hiddenTabs));
    renderTabs(); // UIを即座に更新

    // 現在のタブが変わった場合、セクションを描画し直す
    if (currentTabId && tabs.find(t => t.id === currentTabId)) {
        renderPageTabs(tabs.find(t => t.id === currentTabId).pages || []);
    } else {
        const tabBar = document.getElementById('tabBar');
        const pageContent = document.getElementById('pageContent');
        if (tabBar) tabBar.innerHTML = '';
        if (pageContent) pageContent.innerHTML = '';
    }
}

// ワークスペースの切り替え
async function switchWorkspace(wsId) {
    console.log(`Switching to workspace: ${wsId}`);

    // 初回起動時の初期化：既存の全タブを非表示にする（1番以外の独立性を保つため）
    // ※ 1番は初期状態を維持、2番・3番は空の状態で始めたいというリクエストに対応
    const initKey = `notest_ws${wsId}_initialized`;
    if (wsId !== 1 && !localStorage.getItem(initKey)) {
        console.log(`Initializing workspace ${wsId} for the first time...`);
        const allTabIds = tabs.map(t => t.id);
        localStorage.setItem(`notest_hidden_tabs_ws${wsId}`, JSON.stringify(allTabIds));
        localStorage.setItem(initKey, 'true');
    }

    currentWorkspace = wsId;
    localStorage.setItem('notest_current_workspace', wsId);

    renderWorkspaceButtons();

    // ワークスペース固有の最後に開いていたタブとページを復元
    const wsTabId = localStorage.getItem(`notest_current_tab_id_ws${currentWorkspace}`);
    const wsPageId = localStorage.getItem(`notest_current_page_id_ws${currentWorkspace}`);
    const hiddenTabs = getHiddenTabs();

    if (wsTabId && tabs.find(t => t.id === parseInt(wsTabId)) && !hiddenTabs.includes(parseInt(wsTabId))) {
        console.log(`Restoring workspace ${wsId} state: Tab ${wsTabId}, Page ${wsPageId}`);
        await selectTab(parseInt(wsTabId), wsPageId ? parseInt(wsPageId) : null);
    } else {
        console.log(`Workspace ${wsId} has no saved state or tab is hidden. Selecting first visible tab.`);
        // 保存されていないか非表示の場合、表示されている最初のタブを選択
        const visibleTabs = tabs.filter(tab => !hiddenTabs.includes(tab.id));
        if (visibleTabs.length > 0) {
            await selectTab(visibleTabs[0].id);
        } else {
            currentTabId = null;
            currentPageId = null;
            renderTabs();
            const tabBar = document.getElementById('tabBar');
            const pageContent = document.getElementById('pageContent');
            if (tabBar) tabBar.innerHTML = '';
            if (pageContent) pageContent.innerHTML = '';
            if (pageContent) pageContent.innerHTML = '<div class="empty-state"><p>タブを選択するか、新しいタブを作成してください</p></div>';
        }
    }
}

// ワークスペースボタンの表示更新
function renderWorkspaceButtons() {
    const buttons = document.querySelectorAll('.ws-btn');
    buttons.forEach((btn, index) => {
        if (index + 1 === currentWorkspace) {
            btn.classList.add('active');
        } else {
            btn.classList.remove('active');
        }
    });

    // デバッグ用の表示を更新
    const wsDisplay = document.getElementById('current-ws-display');
    if (wsDisplay) {
        wsDisplay.textContent = currentWorkspace;
    }
}

// タブ名の変更
async function renameTab(tabId, oldName) {
    const newName = prompt('新しいタブ名を入力してください:', oldName);
    if (!newName || newName.trim() === '' || newName === oldName) return;

    try {
        await apiCall(`/api/tabs/${tabId}`, {
            method: 'PUT',
            body: JSON.stringify({ name: newName.trim() })
        });

        // ローカル状態を更新
        const tab = tabs.find(t => t.id === tabId);
        if (tab) {
            tab.name = newName.trim();
        }
        renderTabs();
    } catch (error) {
        console.error('Rename tab failed:', error);
    }
}

async function selectTab(tabId, preferredPageId = null) {
    currentTabId = tabId;
    const tab = tabs.find(t => t.id === tabId);
    if (!tab) return;

    // localStorageに保存 (グローバルおよびワークスペース固有)
    localStorage.setItem('currentTabId', tabId);
    localStorage.setItem(`notest_current_tab_id_ws${currentWorkspace}`, tabId);

    // 検索機能のセットアップ

    renderTabs();
    const pages = tab.pages || [];
    renderPageTabs(pages);

    if (pages.length > 0) {
        // preferredPageIdが指定されていて、そのページが存在する場合はそれを選択
        let pageToSelect = pages[0].id;
        if (preferredPageId) {
            const found = pages.find(p => p.id === preferredPageId);
            if (found) {
                pageToSelect = found.id;
            } else {
                window.debugLog(`Preferred page ID ${preferredPageId} not found in tab ${tabId}. Defaulting to first page.`);
            }
        }
        await selectPage(pageToSelect);
    } else {
        currentPageId = null;
        localStorage.removeItem('currentPageId');
        localStorage.removeItem(`notest_current_page_id_ws${currentWorkspace}`);
        renderPageContent();
    }
}

// ページ関連
function renderPageTabs(pages) {
    const tabBar = document.getElementById('tabBar');
    if (!tabBar) return;
    
    // 全体を書き換えるのではなく、既存のタブがある場合はクラスの更新だけに止めることを検討
    // しかし現状は再生成しているので、最小限の負荷にする
    const fragment = document.createDocumentFragment();

    pages.forEach(page => {
        const pageTab = document.createElement('div');
        pageTab.className = `page-tab ${currentPageId === page.id ? 'active' : ''}`;
        pageTab.dataset.pageId = page.id;
        pageTab.innerHTML = `
            <span>${escapeHtml(page.name)}</span>
            <span class="page-tab-close" onclick="event.stopPropagation(); deletePage(${page.id})">×</span>
        `;
        pageTab.onclick = () => selectPage(page.id);
        pageTab.oncontextmenu = (e) => showPageContextMenu(e, page.id, page.name);
        fragment.appendChild(pageTab);
    });

    const newPageBtn = document.createElement('button');
    newPageBtn.className = 'btn-new-page';
    newPageBtn.textContent = '+ ページ';
    newPageBtn.onclick = () => showModal('modalNewPage');
    fragment.appendChild(newPageBtn);
    
    tabBar.innerHTML = '';
    tabBar.appendChild(fragment);
}

// アクティブなページタブの表示を更新する
function updateActivePageTab() {
    const tabs = document.querySelectorAll('.page-tab');
    tabs.forEach(tab => {
        if (parseInt(tab.dataset.pageId) === currentPageId) {
            tab.classList.add('active');
        } else {
            tab.classList.remove('active');
        }
    });
}

async function createPage(name) {
    if (!currentTabId) {
        alert('まずタブを選択してください');
        return;
    }
    const page = await apiCall('/api/pages', {
        method: 'POST',
        body: JSON.stringify({
            tab_id: currentTabId,
            name,
            order_index: 0
        })
    });
    const tab = tabs.find(t => t.id === currentTabId);
    if (tab) {
        tab.pages = tab.pages || [];
        tab.pages.push(page);
        renderPageTabs(tab.pages);
        selectPage(page.id);
    }
    hideModal('modalNewPage');
    document.getElementById('newPageName').value = '';
}

async function deletePage(pageId) {
    if (!confirm('このページを削除しますか？')) return;

    try {
        await apiCall(`/api/pages/${pageId}`, { method: 'DELETE' });

        // 削除成功後に状態を更新
        const tab = tabs.find(t => t.id === currentTabId);
        if (tab) {
            tab.pages = tab.pages.filter(p => p.id !== pageId);
            renderPageTabs(tab.pages);

            // 削除したページが現在表示中の場合、画面をクリア
            if (currentPageId === pageId) {
                currentPageId = null;
                sections = [];
                localStorage.removeItem('currentPageId');
                renderPageContent();
            }
        }

        console.log(`Page ${pageId} deleted successfully`);
    } catch (error) {
        console.error('Delete page failed:', error);
    }
}

// ページの名称変更
async function renamePage(pageId, oldName) {
    const newName = prompt('新しいページ名を入力してください:', oldName);
    if (!newName || newName.trim() === '' || newName === oldName) return;

    try {
        await apiCall(`/api/pages/${pageId}`, {
            method: 'PUT',
            body: JSON.stringify({ name: newName.trim() })
        });

        // ローカル状態を更新
        const tab = tabs.find(t => t.id === currentTabId);
        if (tab) {
            const page = tab.pages.find(p => p.id === pageId);
            if (page) {
                page.name = newName.trim();
            }
            renderPageTabs(tab.pages);
        }
    } catch (error) {
        console.error('Rename page failed:', error);
    }
}

// ページのコンテキストメニュー
function showPageContextMenu(e, pageId, pageName) {
    e.preventDefault();
    e.stopPropagation();
    hideContextMenu();

    const contextMenu = document.getElementById('contextMenu');

    contextMenu.innerHTML = `
        <div class="context-menu-item" onclick="renamePage(${pageId}, '${escapeHtml(pageName)}'); hideContextMenu();">✏️ ページ名の変更</div>
        <div class="context-menu-item" onclick="deletePage(${pageId}); hideContextMenu();" style="color: #ff4444;">🗑️ 削除</div>
    `;

    contextMenu.style.display = 'block';
    adjustContextMenuPosition(contextMenu, e);

    // クリックでメニューを閉じる
    setTimeout(() => {
        document.addEventListener('click', hideContextMenu, { once: true });
    }, 0);
}

async function selectPage(pageId) {
    if (currentPageId === pageId) return; // すでに選択されている場合は何もしない
    currentPageId = pageId;

    // localStorageに保存
    localStorage.setItem('currentPageId', pageId);
    localStorage.setItem(`notest_current_page_id_ws${currentWorkspace}`, pageId);

    try {
        const page = await apiCall(`/api/pages/${pageId}`);
        sections = page.sections || [];
        renderPageContent();
        
        // 全体を再レンダリングせず、アクティブクラスの付け替えだけにする
        updateActivePageTab();
    } catch (error) {
        console.error('Select page failed:', error);
    }
}

// セクション関連
function renderPageContent() {
    const pageContent = document.getElementById('pageContent');

    if (!currentPageId) {
        pageContent.innerHTML = '<div class="empty-state"><p>ページを選択するか、新しいページを作成してください</p></div>';
        return;
    }

    pageContent.innerHTML = '';
    pageContent.style.position = 'relative';

    sections.forEach(section => {
        const sectionEl = createSectionElement(section);
        pageContent.appendChild(sectionEl);
    });

    // セクション追加ボタン
    // セクション追加ドロップダウンメニュー
    const addSectionContainer = document.createElement('div');
    addSectionContainer.className = 'add-section-container';
    addSectionContainer.style.position = 'absolute';
    addSectionContainer.style.top = '20px';
    addSectionContainer.style.right = '20px';
    addSectionContainer.style.zIndex = '10000';

    const addSectionBtn = document.createElement('button');
    addSectionBtn.className = 'btn-add-section';
    addSectionBtn.innerHTML = '➕';
    addSectionBtn.onclick = (e) => {
        window.debugLog('addSectionBtn.onclick TRIGGERED');
        e.stopPropagation();
        
        // ボタンの位置を取得してドロップダウンの表示位置を決定 (position: fixed 用)
        const rect = addSectionBtn.getBoundingClientRect();
        const dropdown = document.getElementById('sectionDropdown');
        if (dropdown) {
            dropdown.style.top = `${rect.bottom + 10}px`;
            dropdown.style.left = `${rect.right - 200}px`; // 幅200px想定
            window.debugLog(`Positioning dropdown at: top=${dropdown.style.top}, left=${dropdown.style.left}`);
        }

        if (typeof window.toggleSectionDropdown === 'function') {
            window.toggleSectionDropdown(e);
        } else {
            window.debugLog('ERROR: window.toggleSectionDropdown not found', true);
        }
    };
    window.debugLog('addSectionBtn.onclick handler attached');

    const dropdown = document.createElement('div');
    dropdown.className = 'section-dropdown';
    dropdown.id = 'sectionDropdown';
    dropdown.innerHTML = `
        <div class="dropdown-item" onclick="createNewSection('text')">
            <span class="dropdown-icon">📄</span>
            <span>ファイルビュー</span>
        </div>
        <div class="dropdown-item" onclick="createNewSection('notepad')">
            <span class="dropdown-icon">📋</span>
            <span>メモ帳</span>
        </div>
        <div class="dropdown-item" onclick="createNewSection('image')">
            <span class="dropdown-icon">🖼️</span>
            <span>画像貼り付け</span>
        </div>
    `;

    addSectionContainer.appendChild(addSectionBtn);
    addSectionContainer.appendChild(dropdown);
    pageContent.appendChild(addSectionContainer);
}

// セクションのHTML作成
function createSectionElement(section) {
    const sectionEl = document.createElement('div');
    sectionEl.className = 'section';
    sectionEl.id = `section-${section.id}`;
    sectionEl.style.left = `${section.position_x}px`;
    sectionEl.style.top = `${section.position_y}px`;
    sectionEl.style.width = `${section.width}px`;
    sectionEl.style.height = `${section.height}px`;
    sectionEl.style.zIndex = sectionZIndex++;

    // Content-specific header rendering logic
    let headerHtml = '';

    if (section.content_type === 'notepad') {
        headerHtml = `
            <div class="section-header notepad-header" 
                 oncontextmenu="showUnifiedNotepadContextMenu(event, ${section.id})" 
                 style="background-color: ${section.content_data?.bgColor || '#f9f9f9'};">
                <span class="section-title" title="${escapeHtml(section.name || 'メモ帳')}">${escapeHtml(section.name || 'メモ帳')}</span>
                <button class="section-btn-icon" onclick="configureSection(${section.id})" title="設定" style="font-size: 18px;">⋮</button>
            </div>
        `;
    } else {
        // Standard header for text, image, storage
        headerHtml = `
            <div class="section-header" oncontextmenu="${section.content_type === 'storage' ? `showUnifiedStorageContextMenu(event, ${section.id}, 'header')` : `showSectionHeaderContextMenu(event, ${section.id})`}">
                <span class="section-title" title="${escapeHtml(section.name || 'ファイルビュー')}">${escapeHtml(section.name || 'ファイルビュー')}</span>
                <div class="section-controls">
                    ${section.content_type === 'storage' ? `<button class="section-btn-icon" id="view-toggle-${section.id}" onclick="cycleSectionViewMode(${section.id})" title="表示切替">${getViewIcon(section.content_data?.view_mode || 'list')}</button>` : ''}
                    <button class="section-btn-icon" onclick="configureSection(${section.id})" title="設定" style="font-size: 18px;">⋮</button>
                </div>
            </div>
        `;
    }

    sectionEl.innerHTML = headerHtml + `
        ${section.content_type !== 'notepad' && section.content_type !== 'image' ? `
            <div class="section-memo">
                <textarea placeholder="メモ..." oninput="updateSectionContentDebounced(${section.id}, 'memo', this.value)">${escapeHtml(localStorage.getItem('notest_draft_' + section.id + '_memo') ?? (section.memo || ''))}</textarea>
            </div>
        ` : ''}
        <div class="section-content ${section.content_type === 'notepad' || section.content_type === 'image' ? 'full-height notepad-content-area' : ''}" data-section-id="${section.id}">
            ${renderSectionContent(section)}
        </div>
    `;

    // ドラッグ機能
    makeDraggable(sectionEl, section);

    // ドロップ機能
    const contentArea = sectionEl.querySelector('.section-content');
    setupDropZone(contentArea, section.id);

    return sectionEl;
}

function renderSectionContent(section) {
    if (!section.content_data) {
        return '<p style="color: #999;">コンテンツを追加してください</p>';
    }

    const data = section.content_data;

    switch (section.content_type) {
        case 'text':
            return `<textarea class="content-text" oninput="updateSectionContentDebounced(${section.id}, 'text', this.value)">${escapeHtml(localStorage.getItem('notest_draft_' + section.id + '_text') ?? (data.text || ''))}</textarea>`;
        case 'link':
            return `<a href="${escapeHtml(data.url || '#')}" target="_blank" class="content-link">${escapeHtml(data.title || data.url || 'リンク')}</a>`;
        case 'file':
            return `
                <div class="content-file" onclick="downloadFile(${section.id})" style="cursor: pointer;">
                    <div class="content-file-name">${escapeHtml(data.filename || 'ファイル')}</div>
                    <div class="content-file-size">${formatFileSize(data.file_size || 0)}</div>
                    <div style="margin-top: 5px; font-size: 12px; color: #0078d4;">クリックして開く</div>
                </div>
            `;
        case 'storage':
            // ローカルフォルダが既に選択済みの場合はそのまま読み込む
            setTimeout(() => fetchSectionFiles(section.id), 0);
            return `
                <div class="file-browser" id="file-browser-${section.id}">
                    <div class="file-list" id="file-list-${section.id}" oncontextmenu="showUnifiedStorageContextMenu(event, ${section.id}, 'background')"></div>
                </div>
                `;
        case 'notepad':
            const style = `
            background-color: ${data.bgColor || '#fffef7'};
            font-family: ${data.fontFamily || "'Segoe UI', Tahoma, Geneva, Verdana, sans-serif"};
            font-size: ${data.fontSize || '14px'};
            color: ${data.fontColor || '#333333'};
            `;
            return `
                <textarea class="notepad-content" id="notepad-${section.id}" style="${style}" placeholder="ここにメモを入力してください..." oninput="updateSectionContentDebounced(${section.id}, 'notepad', this.value)">${escapeHtml(localStorage.getItem('notest_draft_' + section.id + '_notepad') ?? (data.text || ''))}</textarea>
                `;

        case 'image':
            const imageUrl = data.image_url || '';
            return `
                <div class="image-paste-container">
                    ${imageUrl ? `
                        <img src="${escapeHtml(imageUrl)}" class="pasted-image" alt="貼り付けた画像">
                        <button class="btn-secondary" onclick="clearSectionImage(${section.id})" style="margin-top: 10px;">画像を削除</button>
                    ` : `
                        <div class="image-paste-placeholder" onclick="triggerImagePaste(${section.id})">
                            <div style="font-size: 48px; margin-bottom: 10px;">🖼️</div>
                            <div>クリックして画像を貼り付け</div>
                            <div style="font-size: 12px; color: #999; margin-top: 5px;">または画像をドラッグ&ドロップ</div>
                        </div>
                    `}
                </div>
                `;
        default:
            return '<p>不明なコンテンツタイプ</p>';
    }
}

// ドロップダウンメニューの表示/非表示を切り替え
window.toggleSectionDropdown = function(e) {
    if (e) e.stopPropagation();
    window.debugLog('toggleSectionDropdown called');
    const dropdown = document.getElementById('sectionDropdown');
    if (dropdown) {
        dropdown.classList.toggle('show');
        window.debugLog(`Dropdown show state: ${dropdown.classList.contains('show')}`);
    } else {
        window.debugLog('ERROR: sectionDropdown not found', true);
    }
}

// ドロップダウンメニューを閉じる（外側クリック時）
document.addEventListener('click', function (e) {
    const dropdown = document.getElementById('sectionDropdown');
    const container = document.querySelector('.add-section-container');
    if (dropdown && !container?.contains(e.target)) {
        dropdown.classList.remove('show');
    }
});

window.createNewSection = async function(sectionType = 'text', x = null, y = null) {
    window.debugLog(`createNewSection called: type=${sectionType}`);
    if (!currentPageId) {
        window.debugLog('ERROR: currentPageId is null', true);
        return;
    }

    // ドロップダウンを閉じる
    const dropdown = document.getElementById('sectionDropdown');
    if (dropdown) {
        dropdown.classList.remove('show');
    }

    // 座標の決定（指定がなければデフォルト位置）
    let positionX = x !== null ? x : 50 + (sections.length * 20);
    let positionY = y !== null ? y : 50 + (sections.length * 20);

    // 画像の場合は直接ファイル選択
    if (sectionType === 'image') {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = 'image/*';
        input.onchange = async (e) => {
            if (e.target.files.length > 0) {
                const file = e.target.files[0];
                const defaultName = file.name;
                const name = prompt('ファイルビュー名を入力してください（空白可）:', defaultName);
                if (name === null) return; // キャンセル

                try {
                    // アップロード
                    const formData = new FormData();
                    formData.append('file', file);
                    const response = await fetch('/note/api/upload', {
                        method: 'POST',
                        body: formData,
                        credentials: 'include'
                    });
                    if (!response.ok) throw new Error('Upload failed');
                    const fileData = await response.json();

                    // セクション作成
                    const section = await apiCall('/api/sections', {
                        method: 'POST',
                        body: JSON.stringify({
                            page_id: currentPageId,
                            name: name || defaultName,
                            content_type: 'image',
                            content_data: {
                                file_path: fileData.file_path,
                                filename: fileData.filename,
                                image_url: ''
                            },
                            position_x: positionX,
                            position_y: positionY,
                            width: 300,
                            height: 200
                        })
                    });

                    // ID確定後、image_urlを更新
                    await apiCall(`/api/sections/${section.id}`, {
                        method: 'PUT',
                        body: JSON.stringify({
                            content_data: {
                                file_path: fileData.file_path,
                                filename: fileData.filename,
                                image_url: `/api/files/${section.id}`
                            }
                        })
                    });

                    section.content_data.image_url = `/api/files/${section.id}`;
                    sections.push(section);
                    renderPageContent();

                } catch (error) {
                    console.error('Image section creation failed:', error);
                    alert('画像の追加に失敗しました: ' + error.message);
                }
            }
        };
        input.click();
        return;
    }

    let contentType = 'text';
    let defaultName = '新しいセクション';
    let promptMsg = 'セクション名を入力してください（空白可）:';

    // セクションタイプに応じた設定
    if (sectionType === 'notepad') {
        contentType = 'notepad';
        defaultName = 'メモ帳';
        promptMsg = 'メモ帳の名前を入力してください:';
    } else if (sectionType === 'storage') {
        contentType = 'storage';
        defaultName = 'ファイルビュー';
        promptMsg = '表示するフォルダの識別名を入力してください:';
    } else if (sectionType === 'text') {
        contentType = 'text';
        defaultName = 'テキスト記述';
        promptMsg = 'テキスト領域の名前を入力してください:';
    }

    const name = prompt(promptMsg, defaultName);
    if (name === null) return; // キャンセルされた場合

    // セクションタイプに応じた初期データを設定
    let contentData = { text: '' };
    if (sectionType === 'notepad') {
        contentData = { text: '' };
    } else if (sectionType === 'storage') {
        contentData = { storage_type: 'local', path: '', view_mode: 'list' };
    }

    try {
        const section = await apiCall('/api/sections', {
            method: 'POST',
            body: JSON.stringify({
                page_id: currentPageId,
                name: name || defaultName,
                content_type: contentType,
                content_data: contentData,
                position_x: positionX,
                position_y: positionY,
                width: 300,
                height: 200
            })
        });
        sections.push(section);
        renderPageContent();
    } catch (error) {
        console.error('Section creation failed:', error);
        alert('セクションの追加に失敗しました: ' + error.message);
    }
}

// ... existing code ...

// コンテキストメニュー共通処理
let contextMenu = null;

function hideContextMenu() {
    if (contextMenu) {
        contextMenu.remove();
        contextMenu = null;
    }
}

// メニューが画面外にはみ出さないように位置を調整する
function adjustContextMenuPosition(menu, e) {
    if (!menu) return;
    const rect = menu.getBoundingClientRect();
    let x = e.clientX;
    let y = e.clientY;

    if (x + rect.width > window.innerWidth) {
        x = window.innerWidth - rect.width - 5;
    }
    if (y + rect.height > window.innerHeight) {
        y = window.innerHeight - rect.height - 5;
    }

    if (x < 5) x = 5;
    if (y < 5) y = 5;

    menu.style.left = `${x}px`;
    menu.style.top = `${y}px`;
}

// ページ背景のコンテキストメニュー（セクション作成）
function showPageContextMenu(e) {
    // セクションやモーダル上でのクリックは無視
    if (e.target.closest('.section') || e.target.closest('.modal')) return;

    e.preventDefault();
    hideContextMenu();

    const x = e.pageX;
    const y = e.pageY;

    // スクロール位置を考慮して、ドキュメント上の絶対位置を使用
    // createNewSectionはそのまま座標を使う

    contextMenu = document.createElement('div');
    contextMenu.className = 'context-menu';
    contextMenu.style.left = `${e.clientX}px`;
    contextMenu.style.top = `${e.clientY}px`;

    contextMenu.innerHTML = `
        <div class="context-menu-item" onclick="createNewSection('storage', ${x}, ${y})">📁 フォルダを表示(ファイルビュー)</div>
        <div class="context-menu-item" onclick="createNewSection('notepad', ${x}, ${y})">📒 メモ帳を作成</div>
        <div class="context-menu-item" onclick="createNewSection('image', ${x}, ${y})">🖼️ 画像を貼り付け</div>
        <div class="context-menu-item" onclick="createNewSection('text', ${x}, ${y})">📝 テキスト入力領域を配置</div>
    `;

    document.body.appendChild(contextMenu);
    adjustContextMenuPosition(contextMenu, e);
    setTimeout(() => document.addEventListener('click', hideContextMenu, { once: true }), 0);
}

// ストレージファイルリストのコンテキストメニュー（表示切替）
function showStorageViewContextMenu(e, sectionId) {
    e.preventDefault();
    e.stopPropagation();
    hideContextMenu();

    contextMenu = document.createElement('div');
    contextMenu.className = 'context-menu';
    contextMenu.style.left = `${e.clientX}px`;
    contextMenu.style.top = `${e.clientY}px`;

    contextMenu.innerHTML = `
        <div class="context-menu-item" onclick="navigateToParentFolder(${sectionId})">⬅️ 戻る</div>
        <div class="context-menu-item" onclick="navigateForwardFolder(${sectionId})" ${!canNavigateForward(sectionId) ? 'style="opacity: 0.5; pointer-events: none;"' : ''}>➡️ 進む</div>
        <div class="context-menu-divider"></div>
        <div class="context-menu-item" onclick="bringSectionToFront(${sectionId})">⬆️ 最前面へ移動</div>
        <div class="context-menu-item" onclick="sendSectionToBack(${sectionId})">⬇️ 最背面へ移動</div>
        <div class="context-menu-divider"></div>
        <div class="context-menu-item header">表示モード</div>
        <div class="context-menu-item" onclick="updateSectionViewMode(${sectionId}, 'list')">📋 リスト</div>
        <div class="context-menu-item" onclick="updateSectionViewMode(${sectionId}, 'grid')">🗂️ グリッド</div>
        <div class="context-menu-item" onclick="updateSectionViewMode(${sectionId}, 'thumbnails')">🖼️ サムネイル</div>
        <div class="context-menu-item" onclick="updateSectionViewMode(${sectionId}, 'previews')">📄 プレビュー</div>
        <div class="context-menu-divider"></div>
        <div class="context-menu-item header">並び替え</div>
        <div class="context-menu-item" onclick="updateSectionSortOrder(${sectionId}, 'name_asc')">🔃 名前 (昇順)</div>
        <div class="context-menu-item" onclick="updateSectionSortOrder(${sectionId}, 'name_desc')">🔃 名前 (降順)</div>
        <div class="context-menu-item" onclick="updateSectionSortOrder(${sectionId}, 'date_desc')">🔃 日付 (新しい順)</div>
        <div class="context-menu-item" onclick="updateSectionSortOrder(${sectionId}, 'date_asc')">🔃 日付 (古い順)</div>
        <div class="context-menu-item" onclick="updateSectionSortOrder(${sectionId}, 'size_desc')">🔃 サイズ (大きい順)</div>
        <div class="context-menu-item" onclick="updateSectionSortOrder(${sectionId}, 'size_asc')">🔃 サイズ (小さい順)</div>
        <div class="context-menu-divider"></div>
        <div class="context-menu-item" onclick="createNewFolderInSection(${sectionId})">📁 新規フォルダ</div>
    `;

    // 貼り付けは常に表示（クリップボードが空の場合は無効化）
    if (clipboardFile) {
        contextMenu.innerHTML += `<div class="context-menu-item" onclick="pasteFile(${sectionId})">📄 貼り付け</div>`;
    } else {
        contextMenu.innerHTML += `<div class="context-menu-item" style="opacity: 0.5; pointer-events: none;">📄 貼り付け</div>`;
    }

    contextMenu.innerHTML += `<div class="context-menu-item" onclick="fetchSectionFiles(${sectionId})">🔄 更新</div>`;

    document.body.appendChild(contextMenu);
    adjustContextMenuPosition(contextMenu, e);
    setTimeout(() => document.addEventListener('click', hideContextMenu, { once: true }), 0);
}

// セクションヘッダーのコンテキストメニュー（最前面/最背面移動）
function showSectionHeaderContextMenu(e, sectionId) {
    e.preventDefault();
    e.stopPropagation();
    hideContextMenu();

    contextMenu = document.createElement('div');
    contextMenu.className = 'context-menu';
    contextMenu.style.left = `${e.clientX}px`;
    contextMenu.style.top = `${e.clientY}px`;

    let menuItems = `
        <div class="context-menu-item" onclick="bringSectionToFront(${sectionId})">⬆️ 最前面へ移動</div>
        <div class="context-menu-item" onclick="sendSectionToBack(${sectionId})">⬇️ 最背面へ移動</div>
        <div class="context-menu-divider"></div>
        <div class="context-menu-item" onclick="copySection(${sectionId})">📋 コピー</div>
        <div class="context-menu-item" onclick="cutSection(${sectionId})">✂️ 切り取り</div>
    `;

    // 貼り付けはクリップボードにセクションがある場合のみ有効
    if (clipboardSection) {
        menuItems += `<div class="context-menu-item" onclick="pasteSection()">📄 貼り付け</div>`;
    }

    menuItems += `
        <div class="context-menu-divider"></div>
        <div class="context-menu-item delete" onclick="deleteSection(${sectionId})">🗑️ 削除</div>
    `;

    contextMenu.innerHTML = menuItems;

    document.body.appendChild(contextMenu);
    adjustContextMenuPosition(contextMenu, e);
    setTimeout(() => document.addEventListener('click', hideContextMenu, { once: true }), 0);
}

// 統合・未定義だったコンテキストメニューのハンドラー
function showUnifiedStorageContextMenu(e, sectionId, target) {
    if (target === 'header') {
        showSectionHeaderContextMenu(e, sectionId);
    } else if (target === 'background') {
        showStorageBackgroundContextMenu(e, sectionId);
    }
}

function showUnifiedNotepadContextMenu(e, sectionId) {
    // textareaでの右クリックの場合、基本的にはネイティブメニューを残したいが、最前面/最後面移動も提供したい。
    // そのため、カスタムのコンテキストメニューを表示するが、ブラウザ標準のコピー＆ペーストはショートカットキー(Ctrl+C/V)を推奨するか、
    // あるいはテキスト選択時はネイティブを優先するなどの工夫が必要。
    // ここでは要望通り、最前面・最背面移動を含めたカスタムメニューを表示する。

    e.preventDefault();
    e.stopPropagation();
    hideContextMenu();

    contextMenu = document.createElement('div');
    contextMenu.className = 'context-menu';
    contextMenu.style.left = `${e.clientX}px`;
    contextMenu.style.top = `${e.clientY}px`;

    contextMenu.innerHTML = `
        <div class="context-menu-item header">セクション操作</div>
        <div class="context-menu-item" onclick="bringSectionToFront(${sectionId})">⬆️ 最前面へ移動</div>
        <div class="context-menu-item" onclick="sendSectionToBack(${sectionId})">⬇️ 最背面へ移動</div>
        <div class="context-menu-divider"></div>
        <div class="context-menu-item" onclick="copySection(${sectionId})">📋 セクションをコピー</div>
        <div class="context-menu-item" onclick="cutSection(${sectionId})">✂️ セクションを切り取り</div>
        <div class="context-menu-item delete" onclick="deleteSection(${sectionId})">🗑️ セクションを削除</div>
        <div class="context-menu-divider"></div>
        <div class="context-menu-item header" style="font-weight: normal; font-size: 11px;">※テキストのコピー＆ペーストは<br>キーボード(Ctrl+C / Ctrl+V)等<br>をご利用ください。</div>
    `;

    document.body.appendChild(contextMenu);
    adjustContextMenuPosition(contextMenu, e);

    setTimeout(() => document.addEventListener('click', hideContextMenu, { once: true }), 0);
}


// 最前面へ移動
async function bringSectionToFront(sectionId) {
    sectionZIndex += 1;
    const sectionEl = document.getElementById(`section-${sectionId}`);
    if (sectionEl) {
        sectionEl.style.zIndex = sectionZIndex;
        // Save using API
        apiCall(`/api/sections/${sectionId}`, {
            method: 'PUT',
            body: JSON.stringify({ order_index: sectionZIndex })
        }).catch(err => console.error('Failed to save z-index:', err));
    }
}

// 最背面へ移動
async function sendSectionToBack(sectionId) {
    const sectionEl = document.getElementById(`section-${sectionId}`);
    if (sectionEl) {
        sectionEl.style.zIndex = 1;
        // Save using API
        apiCall(`/api/sections/${sectionId}`, {
            method: 'PUT',
            body: JSON.stringify({ order_index: 1 })
        }).catch(err => console.error('Failed to save z-index:', err));
    }
}

function deleteStorageFileAndHide(sectionId, filename) {
    if (confirm(`${filename} を削除しますか？`)) {
        deleteStorageFile(sectionId, filename);
    }
}

// ページ読み込み完了時の初期化処理
document.addEventListener('DOMContentLoaded', async () => {
    window.debugLog('DEBUG: DomContentLoaded triggered. Starting initialization...');
    try {
        window.debugLog('App initialization started... (v3.5-clean-ui)');

    // バージョン確認用アラート (一時的)
    // alert('WowNote Version 1.3 Loaded');

    // 1. ワークスペースの復元 (最優先)
    const storedWs = localStorage.getItem('notest_current_workspace');
    if (storedWs) {
        currentWorkspace = parseInt(storedWs);
        console.log('Restored workspace:', currentWorkspace);
    }

    // DEBUG: バージョン表示の更新
    const debugInfo = document.getElementById('debug-info');
    if (debugInfo) {
        debugInfo.innerHTML = `v3.5.2-debug [WS: ${currentWorkspace}] [Tab: ${currentTabId || 'None'}] [Page: ${currentPageId || 'None'}]`;
    }

    renderWorkspaceButtons();

    // 2. 基本設定の適用
    applySavedTheme();
    initSidebarToggle();
    setupSettingsEvents();
    setupTabManagementEvents();
    setupDirectoryBrowserEvents();

    // 3. データの読み込み
    // ① IndexedDBからファイルを先にメモリに読み込む
    try {
        const savedHandles = await loadAllFsHandles();
        for (const { sectionId, handle } of savedHandles) {
            localDirHandles[sectionId] = handle;
            localDirSubHandles[sectionId] = handle;
            sectionNavigationHistory[sectionId] = { history: [handle.name], currentIndex: 0, handles: [handle] };
        }
    } catch (e) {
        console.error('IndexedDB load error:', e);
    }

    // ② サブスク状態とタブを読み込む
    await loadSubscriptionStatus();

    // タブ情報の取得
    tabs = await apiCall('/api/tabs');

    // バージョン表示
    const title = document.getElementById('appTitle');
    if (title) title.title = 'Version 1.3';

    // ワークスペース固有の状態を復元
    const hiddenTabs = getHiddenTabs();
    const wsTabId = localStorage.getItem(`notest_current_tab_id_ws${currentWorkspace}`);
    const wsPageId = localStorage.getItem(`notest_current_page_id_ws${currentWorkspace}`);

    if (wsTabId && tabs.find(t => t.id === parseInt(wsTabId)) && !hiddenTabs.includes(parseInt(wsTabId))) {
        await selectTab(parseInt(wsTabId), wsPageId ? parseInt(wsPageId) : null);
    } else {
        const visibleTabs = tabs.filter(t => !hiddenTabs.includes(t.id));
        if (visibleTabs.length > 0) {
            await selectTab(visibleTabs[0].id);
        } else {
            renderTabs();
        }
    }

    // 4. History APIトラップ
    setupHistoryTrap();

    window.debugLog('App initialization completed.');
    
    // DBスキーマの確認 (デバッグ用)
    try {
        const schema = await apiCall('/api/system/check-db-schema', { showAlert: false });
        console.log('--- DATABASE SCHEMA CHECK ---');
        console.log('DB Type:', schema.db_type);
        console.log('Sections Columns:', schema.sections.map(c => c.name).join(', '));
        console.log('Users Columns:', schema.users.map(c => c.name).join(', '));
        
        // 必須カラムのチェック
        const required = ['memo', 'width', 'height', 'position_x', 'position_y'];
        const missing = required.filter(r => !schema.sections.find(c => c.name === r));
        if (missing.length > 0) {
            window.debugLog(`CRITICAL SCHEMA ERROR: Missing columns ${missing.join(', ')}`, true);
            alert(`データベースの更新が必要なようです。不足カラム: ${missing.join(', ')}\nアプリを再起動するか開発者に連絡してください。`);
        }
    } catch (e) {
        console.warn('Schema check failed (might be legacy backend):', e);
    }

    window.debugLog('SUCCESS: Initialization finished with no fatal errors.');
    } catch (e) {
        console.error('CRITICAL: Initialization failed!', e);
        window.debugLog('CRITICAL FAILED: ' + e.message, true);
    }
});

function applySavedTheme() {
    const savedTheme = localStorage.getItem('theme') || 'light';
    if (savedTheme === 'dark') {
        document.body.classList.add('dark-theme');
    }
}

function setupSettingsEvents() {
    const btnSettings = document.getElementById('btnSettings');
    const closeSettings = document.getElementById('closeSettings');
    const btnToggleTheme = document.getElementById('btnToggleThemeInSettings');

    if (btnSettings) btnSettings.onclick = () => {
        loadSubscriptionStatus();
        showModal('modalSettings');
    };
    if (closeSettings) closeSettings.onclick = () => hideModal('modalSettings');
    if (btnToggleTheme) {
        btnToggleTheme.onclick = () => {
            document.body.classList.toggle('dark-theme');
            const isDark = document.body.classList.contains('dark-theme');
            localStorage.setItem('theme', isDark ? 'dark' : 'light');
        };
    }

    const toggleMemo = document.getElementById('toggleMemoField');
    if (toggleMemo) {
        const saved = localStorage.getItem('show_memo_field') !== 'false';
        toggleMemo.checked = saved;
        document.body.classList.toggle('hide-memo-fields', !saved);
        toggleMemo.onchange = (e) => {
            document.body.classList.toggle('hide-memo-fields', !e.target.checked);
            localStorage.setItem('show_memo_field', e.target.checked);
        };
    }
}

function setupTabManagementEvents() {
    const btnManageHiddenTabs = document.getElementById('btnManageHiddenTabs');
    const closeHiddenTabs = document.getElementById('closeHiddenTabs');
    const btnCloseHiddenTabsModal = document.getElementById('btnCloseHiddenTabsModal');

    if (btnManageHiddenTabs) {
        btnManageHiddenTabs.onclick = () => {
            renderHiddenTabsList();
            showModal('modalHiddenTabs');
        };
    }
    if (closeHiddenTabs) closeHiddenTabs.onclick = () => hideModal('modalHiddenTabs');
    if (btnCloseHiddenTabsModal) btnCloseHiddenTabsModal.onclick = () => hideModal('modalHiddenTabs');

    const btnNewTab = document.getElementById('btnNewTab');
    if (btnNewTab) btnNewTab.onclick = () => showModal('modalNewTab');

    document.getElementById('btnCreateTab').onclick = () => {
        const name = document.getElementById('newTabName').value.trim();
        if (name) {
            createTab(name);
            hideModal('modalNewTab');
            document.getElementById('newTabName').value = '';
        }
    };
    document.getElementById('closeNewTab').onclick = () => hideModal('modalNewTab');
    document.getElementById('btnCancelTab').onclick = () => hideModal('modalNewTab');

    document.getElementById('newTabName').onkeypress = (e) => {
        if (e.key === 'Enter') document.getElementById('btnCreateTab').click();
    };

    // ページ作成
    document.getElementById('btnCreatePage').onclick = () => {
        const name = document.getElementById('newPageName').value.trim();
        if (name) createPage(name);
    };
    document.getElementById('closeNewPage').onclick = () => hideModal('modalNewPage');
    document.getElementById('btnCancelPage').onclick = () => hideModal('modalNewPage');

    // ページ背景の右クリックイベント
    const pageContent = document.getElementById('pageContent');
    if (pageContent) {
        pageContent.addEventListener('contextmenu', showPageContextMenu);
    }
}

function setupHistoryTrap() {
    history.replaceState({ isAppBase: true }, '', location.href);
    history.pushState({ isAppTrap: true }, '', location.href);
}

// フォルダへの再接続（リロード後のパーミッション再取得）
async function reconnectFolder(sectionId) {
    const handle = localDirHandles[sectionId];
    if (!handle) return;
    try {
        const perm = await handle.requestPermission({ mode: 'read' });
        if (perm === 'granted') {
            localDirSubHandles[sectionId] = handle;
            await fetchSectionFiles(sectionId);
        } else {
            alert('フォルダへのアクセスが拒否されました。再度フォルダを選択してください。');
        }
    } catch (e) {
        alert('再接続に失敗しました: ' + e.message);
    }
}

let debounceTimers = {};
let pendingUpdates = {};

window.updateSectionContentDebounced = function(sectionId, contentType, value) {
    const key = `${sectionId}-${contentType}`;
    pendingUpdates[key] = value;

    // 直ちにローカルストレージへドラフト保存（リロード時の保険）
    localStorage.setItem(`notest_draft_${sectionId}_${contentType}`, value);

    if (debounceTimers[key]) clearTimeout(debounceTimers[key]);
    debounceTimers[key] = setTimeout(() => {
        updateSectionContent(sectionId, contentType, pendingUpdates[key]);
        delete pendingUpdates[key];
        delete debounceTimers[key];
    }, 1000);
}

// ページ遷移直前(リロード時等)に未保存のデータを強制保存
window.addEventListener('beforeunload', () => {
    for (const key in pendingUpdates) {
        const [sectionIdStr, contentType] = key.split('-');
        const sectionId = parseInt(sectionIdStr);
        const value = pendingUpdates[key];

        const section = sections.find(s => s.id === sectionId);
        if (!section) continue;

        let bodyData = null;
        if (contentType === 'text') {
            const contentData = { text: value };
            section.content_data = contentData;
            bodyData = JSON.stringify({ content_data: contentData });
        } else if (contentType === 'notepad') {
            const contentData = section.content_data || {};
            contentData.text = value;
            section.content_data = contentData;
            bodyData = JSON.stringify({ content_data: contentData });
        } else if (contentType === 'memo') {
            section.memo = value;
            bodyData = JSON.stringify({ memo: value });
        }

        if (bodyData) {
            const url = window.getApiUrl(`/api/sections/${sectionId}`);
            // keepaliveフラグをつけて送信完了を保証
            fetch(url, {
                method: 'PUT',
                body: bodyData,
                headers: { 'Content-Type': 'application/json' },
                keepalive: true
            });
        }
    }
});

async function updateSectionContent(sectionId, contentType, value) {
    const section = sections.find(s => s.id === sectionId);
    if (!section) return;

    try {
        if (contentType === 'text') {
            const contentData = { text: value };
            section.content_data = contentData;
            await apiCall(`/api/sections/${sectionId}`, {
                method: 'PUT',
                body: JSON.stringify({ content_data: contentData })
            });
        } else if (contentType === 'notepad') {
            const contentData = section.content_data || {};
            contentData.text = value;
            section.content_data = contentData;
            await apiCall(`/api/sections/${sectionId}`, {
                method: 'PUT',
                body: JSON.stringify({ content_data: contentData })
            });
        } else if (contentType === 'memo') {
            section.memo = value;
            await apiCall(`/api/sections/${sectionId}`, {
                method: 'PUT',
                body: JSON.stringify({ memo: value })
            });
        }

        // サーバーへの保存が成功した場合のみドラフトを削除
        localStorage.removeItem(`notest_draft_${sectionId}_${contentType}`);
    } catch (e) {
        console.error('Failed to save content to server', e);
        // 保存に失敗した場合、ドラフトはそのまま維持されるので、次回リロード時に復元される
    }
}

async function changeSectionType(sectionId) {
    const section = sections.find(s => s.id === sectionId);
    if (!section) return;

    const type = prompt('コンテンツタイプを選択:\n1. text\n2. link\n3. file\n4. storage', section.content_type);
    if (!type || !['text', 'link', 'file', 'storage'].includes(type)) return;

    let contentData = {};
    if (type === 'link') {
        const url = prompt('URLを入力:');
        const title = prompt('タイトルを入力（空白可）:');
        if (!url) return;
        contentData = { url, title: title || url };
    } else if (type === 'text') {
        contentData = { text: '' };
    } else if (type === 'storage') {
        const storageType = prompt('ストレージタイプ (local, onedrive, googledrive, icloud):', 'local');
        const path = prompt('フォルダパスを入力:');
        if (!path) return;
        contentData = { storage_type: storageType, path: path };
    }

    await apiCall(`/api/sections/${sectionId}`, {
        method: 'PUT',
        body: JSON.stringify({
            content_type: type,
            content_data: contentData
        })
    });

    const updatedSection = sections.find(s => s.id === sectionId);
    if (updatedSection) {
        updatedSection.content_type = type;
        updatedSection.content_data = contentData;
    }
    renderPageContent();
}

window.deleteSection = async function(sectionId) {
    window.debugLog(`deleteSection called: ID=${sectionId}`);
    const result = confirm('このファイルビューを削除しますか？');
    window.debugLog(`confirm() result: ${result}`);
    if (!result) {
        window.debugLog('Delete cancelled by user');
        return;
    }

    try {
        await apiCall(`/api/sections/${sectionId}`, { method: 'DELETE' });

        // 削除成功後に状態を更新
        sections = sections.filter(s => s.id !== sectionId);
        renderPageContent();

        window.debugLog(`Section ${sectionId} deleted successfully`);
    } catch (error) {
        window.debugLog(`Delete section failed: ${error.message}`, true);
    }
}

function downloadFile(sectionId) {
    window.open(window.getApiUrl(`/api/files/${sectionId}`), '_blank');
}

// ドラッグアンドドロップ
function makeDraggable(element, section) {
    const header = element.querySelector('.section-header');

    // ヘッダーがない場合（メモ帳や画像セクション）は何もしない
    if (!header) return;

    let isDragging = false;
    let startX, startY, initialX, initialY;

    header.addEventListener('mousedown', (e) => {
        isDragging = true;
        startX = e.clientX;
        startY = e.clientY;
        initialX = section.position_x;
        initialY = section.position_y;
        element.style.cursor = 'grabbing';
        e.preventDefault();
    });

    document.addEventListener('mousemove', (e) => {
        if (!isDragging) return;
        const dx = e.clientX - startX;
        const dy = e.clientY - startY;
        const newX = initialX + dx;
        let newY = initialY + dy;

        // 境界チェック: 上部にはみ出さないようにする
        if (newY < 0) newY = 0;

        element.style.left = `${newX}px`;
        element.style.top = `${newY}px`;
    });

    document.addEventListener('mouseup', async () => {
        if (isDragging) {
            isDragging = false;
            element.style.cursor = 'move';

            const rect = element.getBoundingClientRect();
            const pageRect = document.getElementById('pageContent').getBoundingClientRect();
            const newX = rect.left - pageRect.left;
            let newY = rect.top - pageRect.top;

            if (newY < 0) newY = 0;

            await updateSectionPosition(section.id, newX, newY, rect.width, rect.height);
        }
    });

    // 手動リサイズ検出用のイベントハンドラ
    element.addEventListener('mouseup', async (e) => {
        // ヘッダー以外でのマウスアップ（リサイズ終了）を検出
        if (!isDragging && e.target !== header && !header.contains(e.target)) {
            const rect = element.getBoundingClientRect();
            const pageRect = document.getElementById('pageContent').getBoundingClientRect();
            const newX = rect.left - pageRect.left;
            let newY = rect.top - pageRect.top;

            if (newY < 0) newY = 0;

            await updateSectionPosition(section.id, newX, newY, rect.width, rect.height);
        }
    });
}

async function updateSectionPosition(sectionId, x, y, width, height) {
    const section = sections.find(s => s.id === sectionId);
    if (!section) return;

    await apiCall(`/api/sections/${sectionId}`, {
        method: 'PUT',
        body: JSON.stringify({
            position_x: x,
            position_y: y,
            width: width,
            height: height
        })
    });

    section.position_x = x;
    section.position_y = y;
    section.width = width;
    section.height = height;
}

function setupDropZone(element, sectionId) {
    element.addEventListener('dragover', (e) => {
        e.preventDefault();
        element.classList.add('drag-over');
    });

    element.addEventListener('dragleave', () => {
        element.classList.remove('drag-over');
    });

    element.addEventListener('drop', async (e) => {
        e.preventDefault();
        element.classList.remove('drag-over');

        const files = e.dataTransfer.files;
        const draggedFileData = e.dataTransfer.getData('application/x-file-transfer');

        // OSからのファイルドロップ
        if (files.length > 0) {
            const section = sections.find(s => s.id === sectionId);
            if (section) {
                if (section.content_type === 'storage') {
                    // Storageセクションの場合は、そのディレクトリにアップロード
                    for (let i = 0; i < files.length; i++) {
                        await uploadFileToStorage(sectionId, files[i]);
                    }
                } else if (section.content_type === 'image') {
                    // 画像セクションの場合は画像としてアップロード
                    // 最初のファイルのみ処理（画像は1つだけ）
                    if (files[0].type.startsWith('image/')) {
                        await uploadImageToSection(files[0], sectionId);
                    } else {
                        alert('画像ファイルのみアップロード可能です');
                    }
                } else {
                    // 通常のセクションの場合は、既存の動作（セクションをファイルタイプに変換）
                    await uploadFileToSection(files[0], sectionId);
                }
            }
        }
        // 他のセクションからのファイルドロップ
        else if (draggedFileData) {
            const { sourceSectionId, filename } = JSON.parse(draggedFileData);
            const targetSection = sections.find(s => s.id === sectionId);

            if (targetSection && targetSection.content_type === 'storage' && sourceSectionId !== sectionId) {
                await moveFileBetweenSections(sourceSectionId, sectionId, filename);
            }
        }
    });
}

// 画像貼り付けトリガー
function triggerImagePaste(sectionId) {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.onchange = async (e) => {
        if (e.target.files.length > 0) {
            await uploadImageToSection(e.target.files[0], sectionId);
        }
    };
    input.click();
}

async function uploadImageToSection(file, sectionId) {
    const formData = new FormData();
    formData.append('file', file);

    try {
        const response = await fetch('/note/api/upload', {
            method: 'POST',
            body: formData,
            credentials: 'include'
        });

        if (!response.ok) throw new Error('Upload failed');

        const fileData = await response.json();
        const imageUrl = `/api/files/${sectionId}`; // This might be wrong if /api/files/ID expects file content type

        // Update section to be an image section with the file URL
        // Actually, /api/upload returns file_path.
        // We need to serve this file.
        // The existing renderSectionContent for image uses `data.image_url`.
        // If we use `uploadFileToSection` logic, it sets generic file data.
        // We want to set content_data = { image_url: ... }

        // Wait, app.py /api/upload returns:
        // 'filename': ..., 'file_path': ...

        // And /api/files/<section_id> serves the file if section is 'file' type.
        // But for 'image' type, we need a way to serve the image.
        // If we set content_type='file', `renderSectionContent` renders a file icon, not an image.
        // If we set content_type='image', we need an URL that serves the image.

        // Let's modify renderSectionContent to use the same /api/files/ID endpoint if we can,
        // OR we need to make sure `api/files/<section_id>` works for image sections too.

        // Let's check app.py get_file(section_id):
        // It checks: if section.content_type != 'file' ... return error.
        // So we can't use /api/files/ID for 'image' type sections directly unless we modify app.py.

        // user request: "画像貼り付け" (Image Paste)

        // Strategy:
        // 1. Upload file.
        // 2. Set section content_type = 'image'.
        // 3. Set content_data = { image_url: '...' }.
        //    Where does the image URL come from?
        //    We can serve it via a new endpoint or reusing /api/files/ID if we tweak app.py.

        // Let's look at `renderSectionContent` case 'image':
        // const imageUrl = data.image_url || '';
        // <img src="${escapeHtml(imageUrl)}" ...>

        // If I upload an image, where is it hosted?
        // The current `upload_file` saves to `UPLOAD_FOLDER`.

        // If I change app.py to allow `get_file` to work for `content_type == 'image'` too, that would be easiest.

        // Let's assume I will modify app.py too.

        // For now, let's implement the JS side assuming /api/files/ID will work or I'll use a direct path if it's static?
        // No, `upload_file` saves to a protected folder.

        // Alternatively, I can use the existing `uploadFileToSection` approach but change the type to `image`?
        // No, `uploadFileToSection` sets type to `file`.

        // I will implement `uploadImageToSection` to:
        // 1. Upload file.
        // 2. Update section to type 'image', and store `file_path` in content_data (like 'file' type).
        // 3. But wait, `image` type expects `image_url`.
        //    If I store `file_path`, I need an endpoint to serve it.

        // Let's update `app.py` to allow `get_file` for `image` type as well.
        // And `uploadImageToSection` will save `file_path` in `content_data`, similar to `file` type,
        // AND maybe `image_url` pointing to `/api/files/${sectionId}`.

        await apiCall(`/api/sections/${sectionId}`, {
            method: 'PUT',
            body: JSON.stringify({
                content_type: 'image',
                content_data: {
                    file_path: fileData.file_path,
                    filename: fileData.filename,
                    image_url: `/api/files/${sectionId}` // Point to the file serving endpoint
                }
            })
        });

        const section = sections.find(s => s.id === sectionId);
        if (section) {
            section.content_type = 'image';
            section.content_data = {
                file_path: fileData.file_path,
                filename: fileData.filename,
                image_url: `/api/files/${sectionId}`
            };
        }
        renderPageContent();
    } catch (error) {
        console.error('Upload error:', error);
        alert('画像のアップロードに失敗しました');
    }
}

async function clearSectionImage(sectionId) {
    if (!confirm('画像を削除しますか？')) return;

    try {
        await apiCall(`/api/sections/${sectionId}`, {
            method: 'PUT',
            body: JSON.stringify({
                content_type: 'image',
                content_data: { image_url: '' }
            })
        });

        const section = sections.find(s => s.id === sectionId);
        if (section) {
            section.content_data = { image_url: '' };
        }
        renderPageContent();
    } catch (error) {
        console.error('Clear image error:', error);
        alert('画像の削除に失敗しました: ' + error.message);
    }
}

async function uploadFileToSection(file, sectionId) {
    const formData = new FormData();
    formData.append('file', file);

    try {
        const response = await fetch('/note/api/upload', {
            method: 'POST',
            body: formData,
            credentials: 'include'
        });

        if (!response.ok) throw new Error('Upload failed');

        const fileData = await response.json();

        await apiCall(`/api/sections/${sectionId}`, {
            method: 'PUT',
            body: JSON.stringify({
                content_type: 'file',
                content_data: {
                    filename: fileData.filename,
                    file_path: fileData.file_path,
                    file_size: fileData.file_size,
                    file_type: fileData.file_type
                }
            })
        });

        const section = sections.find(s => s.id === sectionId);
        if (section) {
            section.content_type = 'file';
            section.content_data = fileData;
        }
        renderPageContent();
    } catch (error) {
        console.error('Upload error:', error);
        alert('ファイルのアップロードに失敗しました');
    }
}

// ストレージ（フォルダ）機能
// ローカルフォルダを選択する
// (Obsolete pickLocalFolder removed. Use window.openDirectoryBrowser)

async function fetchSectionFiles(sectionId) {
    const listEl = document.getElementById(`file-list-${sectionId}`);
    if (!listEl) return;

    const section = sections.find(s => s.id === sectionId);
    if (!section) return;

    const data = typeof section.content_data === 'string'
        ? JSON.parse(section.content_data || '{}')
        : (section.content_data || {});

    // 端末ごとのローカル設定を上書きで読み込む（他のPCの設定に影響されないようにする）
    const localOverrideJSON = localStorage.getItem('local_storage_config_' + sectionId);
    if (localOverrideJSON) {
        try {
            const localOverride = JSON.parse(localOverrideJSON);
            if (localOverride.storage_type) data.storage_type = localOverride.storage_type;
            if (localOverride.path) data.path = localOverride.path;
        } catch (e) {
            console.error("Local storage override parse error:", e);
        }
    }

    // デバイス固有の設定を優先（なければサーバー側の値を使用）
    const viewMode = loadDeviceSetting(`view_mode_${sectionId}`, data.view_mode || 'list');

    // ローカルディレクトリハンドルがある場合はFile System Access APIを使う
    const currentHandle = localDirSubHandles[sectionId];
    if (currentHandle) {
        let hasPermission = false;
        try {
            const perm = await currentHandle.queryPermission({ mode: 'read' });
            if (perm === 'granted') {
                hasPermission = true;
            } else {
                listEl.innerHTML += `<div style="color:red;font-size:12px;">Permission state: ${perm}</div>`;
            }
        } catch (e) {
            listEl.innerHTML = `<div style="color:red;padding:10px;">Query Permission Error: ${e.message}</div>`;
            return;
        }

        if (hasPermission) {
            try {
                await fetchLocalFiles(sectionId, currentHandle, viewMode);
            } catch (e) {
                listEl.innerHTML = `<div style="color:red;padding:10px;">Fetch Local Files Error: ${e.message}</div>`;
            }
            return;
        } else {
            // 未許可、またはエラー完了時 → 再接続ボタンを表示（クリックでrequestPermission）
            listEl.innerHTML = `<div style="padding: 20px; text-align: center; background: #f8f9fa; border: 1px dashed #ddd; border-radius: 8px; margin: 10px;">
                <div style="font-size: 14px; margin-bottom: 10px; font-weight: bold; color: #333;">🔒 PCフォルダのアクセス保護</div>
                <div style="font-size: 12px; color: #666; margin-bottom: 15px; line-height: 1.5;">
                    ブラウザのセキュリティ制限により、リロード後は再度アクセス許可が必要です。<br>
                    下のボタンを押して「許可」を選択してください。
                </div>
                <button class="btn-primary" onclick="reconnectFolder(${sectionId})" style="padding: 8px 20px;">🔗 アクセスを許可する</button>
                <div style="margin-top: 10px; font-size: 11px; color: #999;">
                    対象: ${escapeHtml(currentHandle.name)}
                </div>
            </div>`;
            return;
        }
    }

    // === サーバーサイドパス指定の場合（ローカルハンドルがない場合） ===
    // もし storage_type が 'local' の場合も、パスがあればサーバー経由の取得を試みる
    // これにより、サーバー上のフォルダ指定を永続的に利用可能にする

    if (data.path) {
        try {
            const files = await apiCall(`/api/sections/${sectionId}/files`, { showAlert: false });
            listEl.className = 'file-list' + (viewMode !== 'list' ? ' ' + viewMode : '');
            listEl.oncontextmenu = (e) => showStorageViewContextMenu(e, sectionId);

            if (files.length === 0) {
                listEl.innerHTML = '<div style="padding:10px;color:#999;">ファイルがありません</div>';
                return;
            }

            listEl.innerHTML = files.map(entry => {
                if (entry.is_directory) {
                    return `
                        <div class="file-item folder-item"
                             title="${escapeHtml(entry.name)}"
                             ondblclick="navigateToFolder(${sectionId}, '${escapeHtml(entry.name)}')">
                            <div class="file-icon">📁</div>
                            <div class="file-info">
                                <div class="file-name">${escapeHtml(entry.name)}</div>
                                <div class="file-meta">フォルダ</div>
                            </div>
                        </div>`;
                }
                const isImage = /\\.(jpg|jpeg|png|gif|webp|svg)$/i.test(entry.name);
                const isPdf = /\\.pdf$/i.test(entry.name);
                const isOffice = /\\.(xlsx|xls|docx|doc|pptx|ppt)$/i.test(entry.name);
                let icon = isImage ? '🖼' : isPdf ? '📕' : isZip ? '📦' : isOffice ? '📊' : '📄';
                return `
                    <div class="file-item"
                         title="${escapeHtml(entry.name)}"
                         data-filename="${escapeHtml(entry.name)}"
                         onclick="showFilePreview(${sectionId}, this.dataset.filename)"
                         ondblclick="window.isLocalServer() ? openFileNativeOS(${sectionId}, this.dataset.filename) : (['xlsx','xls','docx','doc','pptx','ppt'].includes(this.dataset.filename.split('.').pop().toLowerCase()) ? openFileNativeOS(${sectionId}, this.dataset.filename) : showFilePreview(${sectionId}, this.dataset.filename))"
                         oncontextmenu="showFileContextMenu(event, ${sectionId}, this.dataset.filename)">
                        <div class="file-icon">${icon}</div>
                        <div class="file-info">
                            <div class="file-name">${escapeHtml(entry.name)}</div>
                            <div class="file-meta">${formatFileSize(entry.size)}</div>
                        </div>
                    </div>`;
            }).join('');
            return;
        } catch (error) {
            // パスが見つからない場合は、ユーザーが選べるようにフレンドリーなUIを表示
            if (error.message.includes('Path not found') || error.message.includes('404')) {
                window.debugLog(`Showing actionable error UI for section ${sectionId} (Path: ${data.path})`);
                listEl.innerHTML = `<div style="padding:20px; text-align:center; color:#666; background:#fefefe; border:1px dashed #ccc; border-radius:8px; margin:10px;">
                    <div style="font-size:14px; margin-bottom:12px; font-weight:bold;">📁 フォルダにアクセスできません</div>
                    <div style="font-size:12px; color:#d32f2f; margin-bottom:8px;">「${escapeHtml(data.path)}」</div>
                    <div style="font-size:11px; color:#999; margin-bottom:15px; line-height:1.4;">
                        接続が解除されたか、サーバー上でパスが見つかりません。<br>
                        以下のいずれかで再度指定してください。
                    </div>
                    <div style="display:flex; flex-wrap:wrap; gap:8px; justify-content:center;">
                        <button class="btn-primary" style="padding:6px 12px; font-size:12px;" onclick="window.openDirectoryBrowser()">📁 フォルダを参照 (再構築)</button>
                        <button class="btn-secondary" style="padding:6px 12px; font-size:12px;" onclick="window.openNativeBrowserPicker()">🌐 ブラウザ標準選択 (一時的)</button>
                        <button class="btn-secondary" style="padding:6px 12px; font-size:12px;" onclick="window.openLegacyDirectorySelector()">☁️ 手動選択 (レガシー)</button>
                    </div>
                </div>`;
            } else {
                listEl.innerHTML = `<div style="padding:10px;color:red;">サーバーからの取得エラー: ${escapeHtml(error.message)}</div>`;
            }
            return;
        }
    }

    // ハンドルがなく、パスも設定されていない場合
    listEl.innerHTML = `<div style="padding:12px;color:#999;font-size:13px;">⚙️ フォルダ未選択です<br>設定ボタンから「フォルダを選択」またはパスを設定してください。</div>`;
}

async function fetchLocalFiles(sectionId, dirHandle, viewMode) {
    const listEl = document.getElementById(`file-list-${sectionId}`);
    if (!listEl) return;

    // フォルダが選択済みなのでピッカーボタンを非表示にする
    const pickerEl = document.getElementById(`picker-${sectionId}`);
    if (pickerEl) pickerEl.style.display = 'none';

    const entries = [];
    for await (const [name, handle] of dirHandle.entries()) {
        if (name.startsWith('.')) continue;
        entries.push({ name, kind: handle.kind, handle });
    }

    // フォルダ優先・名前順に並び替え
    entries.sort((a, b) => {
        if (a.kind !== b.kind) return a.kind === 'directory' ? -1 : 1;
        return a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' });
    });

    listEl.className = 'file-list' + (viewMode !== 'list' ? ' ' + viewMode : '');
    listEl.oncontextmenu = (e) => showStorageViewContextMenu(e, sectionId);

    if (entries.length === 0) {
        listEl.innerHTML = '<div style="padding:10px;color:#999;">ファイルがありません</div>';
        return;
    }

    listEl.innerHTML = entries.map(entry => {
        if (entry.kind === 'directory') {
            return `
                <div class="file-item folder-item"
                     title="${escapeHtml(entry.name)}"
                     ondblclick="navigateToLocalFolder(${sectionId}, '${escapeHtml(entry.name)}')">
                    <div class="file-icon">📁</div>
                    <div class="file-info">
                        <div class="file-name">${escapeHtml(entry.name)}</div>
                        <div class="file-meta">フォルダ</div>
                    </div>
                </div>`;
        }
        const isImage = /\.(jpg|jpeg|png|gif|webp|svg)$/i.test(entry.name);
        const isPdf = /\.pdf$/i.test(entry.name);
        const isZip = /\.(zip|rar|7z)$/i.test(entry.name);
        let icon = isImage ? '🖼' : isPdf ? '📕' : isZip ? '📦' : '📄';
        return `
            <div class="file-item"
                 title="${escapeHtml(entry.name)}"
                 data-filename="${escapeHtml(entry.name)}"
                 onclick="showFilePreview(${sectionId}, this.dataset.filename)"
                 ondblclick="openFileNativeOS(${sectionId}, this.dataset.filename)"
                 oncontextmenu="showFileContextMenu(event, ${sectionId}, this.dataset.filename)">
                <div class="file-icon">${icon}</div>
                <div class="file-info">
                    <div class="file-name">${escapeHtml(entry.name)}</div>
                </div>
            </div>`;
    }).join('');
}

// ローカルフォルダに移動
async function navigateToLocalFolder(sectionId, folderName) {
    const currentHandle = localDirSubHandles[sectionId];
    if (!currentHandle) return;
    try {
        const subHandle = await currentHandle.getDirectoryHandle(folderName);
        localDirSubHandles[sectionId] = subHandle;

        // 履歴に追記
        const navCtx = sectionNavigationHistory[sectionId];
        if (navCtx) {
            navCtx.handles = navCtx.handles.slice(0, navCtx.currentIndex + 1);
            navCtx.handles.push(subHandle);
            navCtx.history = navCtx.history.slice(0, navCtx.currentIndex + 1);
            navCtx.history.push(folderName);
            navCtx.currentIndex++;
        }
        await fetchSectionFiles(sectionId);
    } catch (e) {
        alert('フォルダを開けませんでした: ' + e.message);
    }
}

// ローカルファイルを開く（ブラウザのタブでプレビュー、現在は未使用にしてOSネイティブ起動に移行）
async function openLocalFile(sectionId, fileName) {
    const currentHandle = localDirSubHandles[sectionId];
    if (!currentHandle) return;
    try {
        const fileHandle = await currentHandle.getFileHandle(fileName);
        const file = await fileHandle.getFile();
        const url = URL.createObjectURL(file);
        window.open(url, '_blank');
        // 少し後にURLを解放
        setTimeout(() => URL.revokeObjectURL(url), 60000);
    } catch (e) {
        alert('ファイルを開けませんでした: ' + e.message);
    }
}

// OSネイティブの標準アプリでファイルを開く
async function openFileNativeOS(sectionId, fileName) {
    const section = sections.find(s => s.id === sectionId);
    if (!section) return;

    // デスクトップアプリ（pywebview）環境のチェック
    if (window.pywebview && window.pywebview.api) {
        console.log('Desktop bridge (pywebview) detected. Opening via native API.');
        try {
            const result = await window.pywebview.api.open_path(fullPath);
            if (result && result.success) return;
            // 失敗した場合は通常フロー（API経由）で続行を試みる
        } catch (e) {
            console.error('Desktop bridge error:', e);
        }
    }

    // リモートサーバーの場合はOSアプリ起動をスキップしてプレビュー/ダウンロードにフォールバック
    if (!window.isLocalServer() && !(window.pywebview && window.pywebview.api)) {
        const msg = '【重要】デスクトップアプリ（Excel等）で直接開く機能は、NotestをPC(localhost)で起動している場合のみ利用可能です。\n\n現在はリモートサーバー接続のため、プレビュー表示を行います。起動ガイドが必要な場合は設定画面をご確認ください。';
        console.log(msg);
        
        const ext = fileName.split('.').pop().toLowerCase();
        const isOfficeFile = ['xlsx', 'xls', 'docx', 'doc', 'pptx', 'ppt'].includes(ext);

        if (isOfficeFile && !localDirSubHandles[sectionId]) {
            // リモートサーバー上のOfficeファイルの場合、Office Online Previewを試みる
            const fileUrl = `${window.location.origin}${window.getApiUrl(`/api/sections/${sectionId}/files/${encodeURIComponent(fileName)}`)}`;
            const officeUrl = `https://view.officeapps.live.com/op/view.aspx?src=${encodeURIComponent(fileUrl)}`;
            window.open(officeUrl, '_blank');
            return;
        }

        if (localDirSubHandles[sectionId]) {
            openLocalFile(sectionId, fileName);
        } else {
            // リモートの場合はプレビューを優先
            showFilePreview(sectionId, fileName);
            // ユーザーに一度だけ通知（複数回出ると煩わしいため、セッション中一度などの考慮が必要かもしれないが、まずはalertで明示）
            if (!window._remoteOpenWarned) {
                alert(msg);
                window._remoteOpenWarned = true;
            }
        }
        return;
    }

    let fullPath = await getFullPathForFile(sectionId, fileName);
    if (!fullPath) return;

    try {
        await apiCall('/api/system/open-local', {
            method: 'POST',
            body: JSON.stringify({ path: fullPath }),
            showAlert: false
        });
    } catch (e) {
        console.error('Failed to open file natively:', e);
        
        // エラー時はフォールバックとしてブラウザ上で開く/プレビュー
        if (localDirSubHandles[sectionId]) {
            openLocalFile(sectionId, fileName);
        } else {
            showFilePreview(sectionId, fileName);
        }
    }
}

// ヘルパー: ファイルのフルパスを取得
async function getFullPathForFile(sectionId, fileName) {
    const section = sections.find(s => s.id === sectionId);
    if (!section) return null;
    let basePath = '';

    // 端末ごとのローカル設定があるか確認 (localStorage)
    const localOverrideJSON = localStorage.getItem('local_storage_config_' + sectionId);
    if (localOverrideJSON) {
        try {
            const localOverride = JSON.parse(localOverrideJSON);
            if (localOverride.path) basePath = localOverride.path;
        } catch (e) {
            console.error("Local storage override parse error:", e);
        }
    }

    // なければサーバーデータを使用
    if (!basePath) {
        const data = typeof section.content_data === 'string'
            ? JSON.parse(section.content_data || '{}')
            : (section.content_data || {});
        basePath = data.path || '';
    }

    // 履歴から現在のパスを取得（サブフォルダ対応）
    const navCtx = sectionNavigationHistory[sectionId];
    if (navCtx && navCtx.history && navCtx.history.length > 0) {
        // history[0] がベースパス、それ以降がサブフォルダであることを想定
        // navigateToFolder では newPath = path/folderName としているので
        // history[currentIndex] は常にそのディレクトリのフルパスが入っているはず
        basePath = navCtx.history[navCtx.currentIndex];
    }

    if (!basePath) {
        alert('フォルダのベースパスが設定されていません。設定からフォルダを指定してください。');
        return null;
    }

    // スラッシュの重複や欠落を避けつつ結合
    basePath = basePath.replace(/[\\\/]+$/, ''); // 末尾のスラッシュを削除
    return `${basePath}/${fileName}`;
}

// 特定のプログラムでファイルを開く
async function openFileWithProgram(sectionId, fileName, program) {
    const fullPath = await getFullPathForFile(sectionId, fileName);
    if (!fullPath) {
        alert('ファイルのフルパスを取得できませんでした');
        return;
    }

    try {
        await apiCall('/api/system/open-local-with', {
            method: 'POST',
            body: JSON.stringify({ path: fullPath, program: program })
        });
    } catch (e) {
        console.error('Failed to open file with program:', e);
        alert('プログラムで開けませんでした: ' + e.message);
    }
}

// フォルダに移動
async function navigateToFolder(sectionId, folderName) {
    const section = sections.find(s => s.id === sectionId);
    if (!section) return;

    const data = typeof section.content_data === 'string'
        ? JSON.parse(section.content_data || '{}')
        : (section.content_data || {});

    const currentPath = data.path || '';
    const newPath = `${currentPath}/${folderName}`;

    // 履歴の更新（新しいフォルダを開くときは進む履歴をクリア）
    if (!sectionNavigationHistory[sectionId]) {
        sectionNavigationHistory[sectionId] = { history: [currentPath], currentIndex: 0 };
    }
    const navCtx = sectionNavigationHistory[sectionId];

    // 現在のインデックス以降の履歴（進む履歴）を削除し、新しいパスを追加
    navCtx.history = navCtx.history.slice(0, navCtx.currentIndex + 1);
    navCtx.history.push(newPath);
    navCtx.currentIndex++;

    // セクションのパスを更新
    await updateSectionStorageConfig(sectionId, data.storage_type || 'local', newPath);

    // ファイルリストを再読み込み
    await fetchSectionFiles(sectionId);
}

// セクション内に新規フォルダを作成
async function createNewFolderInSection(sectionId) {
    const currentHandle = localDirSubHandles[sectionId];

    const folderName = prompt('新しいフォルダ名を入力してください:');
    if (!folderName || !folderName.trim()) return;

    if (currentHandle) {
        // ローカルファイルシステム：書き込み権限を取得してフォルダを作成
        try {
            // 書き込み権限を要求
            let perm = await currentHandle.queryPermission({ mode: 'readwrite' });
            if (perm === 'prompt') perm = await currentHandle.requestPermission({ mode: 'readwrite' });
            if (perm !== 'granted') {
                alert('フォルダへの書き込み権限がありません。');
                return;
            }
            await currentHandle.getDirectoryHandle(folderName.trim(), { create: true });
            await fetchSectionFiles(sectionId);
        } catch (error) {
            alert('フォルダの作成に失敗しました: ' + error.message);
        }
    } else {
        alert('フォルダが選択されていません。先にフォルダを選択してください。');
    }
}

// 「進む」が利用可能かチェック
function canNavigateForward(sectionId) {
    const navCtx = sectionNavigationHistory[sectionId];
    return navCtx && navCtx.currentIndex < navCtx.history.length - 1;
}

// 親フォルダに戻る
async function navigateToParentFolder(sectionId) {
    const navCtx = sectionNavigationHistory[sectionId];
    if (!navCtx || navCtx.currentIndex <= 0) {
        alert('これ以上戻れません');
        return;
    }
    navCtx.currentIndex--;

    if (navCtx.handles && navCtx.handles.length > 0) {
        const handle = navCtx.handles[navCtx.currentIndex];
        localDirSubHandles[sectionId] = handle;
    } else {
        const targetPath = navCtx.history[navCtx.currentIndex];
        const section = sections.find(s => s.id === sectionId);
        const data = typeof section.content_data === 'string'
            ? JSON.parse(section.content_data || '{}')
            : (section.content_data || {});
        await updateSectionStorageConfig(sectionId, data.storage_type || 'local', targetPath);
    }
    await fetchSectionFiles(sectionId);
}

// 「進む」機能
async function navigateForwardFolder(sectionId) {
    if (!canNavigateForward(sectionId)) return;
    const navCtx = sectionNavigationHistory[sectionId];
    navCtx.currentIndex++;

    if (navCtx.handles && navCtx.handles.length > 0) {
        const handle = navCtx.handles[navCtx.currentIndex];
        localDirSubHandles[sectionId] = handle;
    } else {
        const targetPath = navCtx.history[navCtx.currentIndex];
        const section = sections.find(s => s.id === sectionId);
        const data = typeof section.content_data === 'string'
            ? JSON.parse(section.content_data || '{}')
            : (section.content_data || {});
        await updateSectionStorageConfig(sectionId, data.storage_type || 'local', targetPath);
    }
    await fetchSectionFiles(sectionId);
}




// フォルダ用コンテキストメニュー
function showFolderContextMenu(e, sectionId, folderName) {
    e.preventDefault();
    e.stopPropagation();
    hideContextMenu();

    contextMenu = document.createElement('div');
    contextMenu.className = 'context-menu';
    contextMenu.style.left = `${e.clientX}px`;
    contextMenu.style.top = `${e.clientY}px`;

    let menuItems = `
        <div class="context-menu-item" onclick="navigateToParentFolder(${sectionId})">⬅️ 戻る</div>
        <div class="context-menu-item" onclick="navigateForwardFolder(${sectionId})" ${!canNavigateForward(sectionId) ? 'style="opacity: 0.5; pointer-events: none;"' : ''}>➡️ 進む</div>
        <div class="context-menu-divider"></div>
        <div class="context-menu-item" onclick="bringSectionToFront(${sectionId})">⬆️ 最前面へ移動</div>
        <div class="context-menu-item" onclick="sendSectionToBack(${sectionId})">⬇️ 最背面へ移動</div>
        <div class="context-menu-divider"></div>
        <div class="context-menu-item" onclick="navigateToFolder(${sectionId}, '${escapeHtml(folderName)}')">📂 開く</div>
        <div class="context-menu-item" onclick="copyFile(${sectionId}, '${escapeHtml(folderName)}')">📋 コピー</div>
        <div class="context-menu-item" onclick="cutFile(${sectionId}, '${escapeHtml(folderName)}')">✂️ 切り取り</div>
    `;

    // 貼り付けは常に表示（クリップボードが空の場合は無効化）
    menuItems += `<div class="context-menu-item" onclick="pasteFile(${sectionId})" ${!clipboardFile ? 'style="opacity: 0.5; pointer-events: none;"' : ''}>📄 貼り付け</div>`;

    menuItems += `<div class="context-menu-item delete" onclick="deleteStorageFileAndHide(${sectionId}, '${escapeHtml(folderName)}')">🗑️ 削除</div>`;

    contextMenu.innerHTML = menuItems;

    document.body.appendChild(contextMenu);
    adjustContextMenuPosition(contextMenu, e);

    setTimeout(() => {
        document.addEventListener('click', hideContextMenu, { once: true });
    }, 0);
}


// ビューモードのアイコンを取得
function getViewIcon(mode) {
    const icons = {
        'list': '≡',
        'grid': '⊞',
        'thumbnails': '□',
        'previews': '📄'
    };
    return icons[mode] || icons['list'];
}

// ビューモードを切り替え
function cycleSectionViewMode(sectionId) {
    const section = sections.find(s => s.id === sectionId);
    if (!section) return;

    const modes = ['list', 'grid', 'thumbnails', 'previews'];
    const currentMode = section.content_data?.view_mode || 'list';
    const currentIndex = modes.indexOf(currentMode);
    const nextMode = modes[(currentIndex + 1) % modes.length];

    updateSectionViewMode(sectionId, nextMode);
}

async function updateSectionViewMode(sectionId, mode) {
    const section = sections.find(s => s.id === sectionId);
    if (!section) return;

    // デバイス固有のlocalStorageに保存（複数PC間で設定を分離）
    saveDeviceSetting(`view_mode_${sectionId}`, mode);

    try {
        const data = typeof section.content_data === 'string' ? JSON.parse(section.content_data) : (section.content_data || {});
        data.view_mode = mode;
        section.content_data = data;
        fetchSectionFiles(sectionId);

        // ヘッダーのアイコンを更新
        const toggleBtn = document.getElementById(`view-toggle-${sectionId}`);
        if (toggleBtn) toggleBtn.innerHTML = getViewIcon(mode);

        // サーバーにも保存（他の設定と一緒に）
        await apiCall(`/api/sections/${sectionId}`, {
            method: 'PUT',
            body: JSON.stringify({ content_data: data })
        });
    } catch (error) {
        console.error('Update view mode error:', error);
    }
}

async function updateSectionSortOrder(sectionId, sortOrder) {
    const section = sections.find(s => s.id === sectionId);
    if (!section) return;

    // デバイス固有のlocalStorageに保存
    saveDeviceSetting(`sort_order_${sectionId}`, sortOrder);

    try {
        const data = typeof section.content_data === 'string' ? JSON.parse(section.content_data) : (section.content_data || {});
        data.sort_order = sortOrder;
        section.content_data = data;
        fetchSectionFiles(sectionId);

        await apiCall(`/api/sections/${sectionId}`, {
            method: 'PUT',
            body: JSON.stringify({ content_data: data })
        });
    } catch (error) {
        console.error('Update sort order error:', error);
    }
}

function openUploadDialog(sectionId) {
    const input = document.createElement('input');
    input.type = 'file';
    input.onchange = async (e) => {
        if (e.target.files.length > 0) {
            await uploadFileToStorage(sectionId, e.target.files[0]);
        }
    };
    input.click();
}

async function uploadFileToStorage(sectionId, file) {
    const currentHandle = localDirSubHandles[sectionId];

    if (!currentHandle) {
        alert('先に⚙️設定ボタンから「フォルダを選択」してください。\nフォルダを選択した後、ファイルをドロップしてください。');
        return;
    }

    // ローカルファイルシステムへの書き込み
    try {
        // 書き込み権限を確認
        let perm = await currentHandle.queryPermission({ mode: 'readwrite' });
        if (perm === 'prompt') perm = await currentHandle.requestPermission({ mode: 'readwrite' });
        if (perm !== 'granted') {
            alert('フォルダへの書き込み権限がありません。');
            return;
        }

        // 同名ファイルが存在する場合は確認
        const filename = file.name;
        try {
            await currentHandle.getFileHandle(filename);
            if (!confirm(`「${filename}」はすでに存在します。上書きしますか？`)) return;
        } catch (e) { /* ファイルが存在しない場合はそのまま */ }

        // ファイルを書き込む
        const fileHandle = await currentHandle.getFileHandle(filename, { create: true });
        const writable = await fileHandle.createWritable();
        await writable.write(file);
        await writable.close();

        await fetchSectionFiles(sectionId);
    } catch (error) {
        console.error('Local write error:', error);
        alert('ファイルの保存に失敗しました: ' + error.message);
    }
}

function downloadStorageFile(sectionId, filename) {        // ファイルをダウンロード（別タブで開く）
    window.open(window.getApiUrl(`/api/sections/${sectionId}/files/${encodeURIComponent(filename)}?download=1`), '_blank');
}

async function deleteStorageFile(sectionId, filename) {
    if (!confirm(`ファイル "${filename}" を削除しますか？`)) return;

    try {
        await apiCall(`/api/sections/${sectionId}/files/${encodeURIComponent(filename)}`, {
            method: 'DELETE'
        });
        await fetchSectionFiles(sectionId); // リロード
    } catch (error) {
        console.error('Delete error:', error);
        alert('削除に失敗しました: ' + error.message);
    }
}

// コンテキストメニュー共通処理
// let contextMenu = null; // Removed redundant declaration

function showContextMenu(e, sectionId, filename) {
    e.preventDefault();
    hideContextMenu();

    contextMenu = document.createElement('div');
    contextMenu.className = 'context-menu';
    contextMenu.style.left = `${e.clientX}px`;
    contextMenu.style.top = `${e.clientY}px`;

    contextMenu.innerHTML = `
        <div class="context-menu-item" onclick="bringSectionToFront(${sectionId})">⬆️ 最前面へ移動</div>
        <div class="context-menu-item" onclick="sendSectionToBack(${sectionId})">⬇️ 最背面へ移動</div>
        <div class="context-menu-divider"></div>
        <div class="context-menu-item delete" onclick="deleteStorageFileAndHide(${sectionId}, '${escapeHtml(filename)}')">🗑️ 削除</div>
    `;

    document.body.appendChild(contextMenu);
    adjustContextMenuPosition(contextMenu, e);

    // クリックでメニューを閉じるイベントを追加 (一度だけ)
    setTimeout(() => {
        document.addEventListener('click', hideContextMenu, { once: true });
    }, 0);
}

async function deleteStorageFileAndHide(sectionId, filename) {
    hideContextMenu();
    await deleteStorageFile(sectionId, filename);
}

// ファイルドラッグ関連
function handleFileDragStart(e, sectionId, filename) {
    // セクション間での移動用データ
    e.dataTransfer.setData('application/x-file-transfer', JSON.stringify({
        sourceSectionId: sectionId,
        filename: filename
    }));

    // デスクトップへのドラッグ用（ダウンロードURL）
    const downloadUrl = `${window.location.origin}/api/sections/${sectionId}/files/${encodeURIComponent(filename)}`;
    e.dataTransfer.setData('DownloadURL', `application/octet-stream:${filename}:${downloadUrl}`);

    e.dataTransfer.effectAllowed = 'copyMove';
}

async function moveFileBetweenSections(sourceSectionId, targetSectionId, filename) {
    try {
        const response = await fetch(`/note/api/sections/${sourceSectionId}/files/${encodeURIComponent(filename)}/move`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ target_section_id: targetSectionId }),
            credentials: 'include'
        });

        if (!response.ok) throw new Error('Move failed');

        // 両方のセクションをリロード
        await fetchSectionFiles(sourceSectionId);
        await fetchSectionFiles(targetSectionId);
    } catch (error) {
        console.error('Move error:', error);
        alert('ファイルの移動に失敗しました: ' + error.message);
    }
}

// 拡張されたコンテキストメニュー
let clipboardFile = null; // ファイルコピー用のクリップボード
let clipboardSection = null; // セクションコピー用のクリップボード

function showFileContextMenu(e, sectionId, filename) {
    e.preventDefault();
    e.stopPropagation();
    hideContextMenu();

    contextMenu = document.createElement('div');
    contextMenu.className = 'context-menu';
    contextMenu.style.left = `${e.clientX}px`;
    contextMenu.style.top = `${e.clientY}px`;

    const isZipFile = filename.toLowerCase().endsWith('.zip');
    const escapedFilename = escapeHtml(filename);

    let menuItems = `
        <div class="context-menu-item" data-filename="${escapedFilename}" onclick="openFileNativeOS(${sectionId}, this.dataset.filename); hideContextMenu();">🚀 開く</div>
        <div class="context-menu-item submenu-parent">
            🛠 プログラムを選択して開く
            <div class="context-submenu">
                <div class="context-menu-item" data-filename="${escapedFilename}" onclick="openFileWithProgram(${sectionId}, this.dataset.filename, 'vscode'); hideContextMenu();">Visual Studio Code</div>
                <div class="context-menu-item" data-filename="${escapedFilename}" onclick="openFileWithProgram(${sectionId}, this.dataset.filename, 'textedit'); hideContextMenu();">テキストエディタ</div>
            </div>
        </div>
        <div class="context-menu-divider"></div>
        <div class="context-menu-item" onclick="navigateToParentFolder(${sectionId})">⬅️ 戻る</div>
        <div class="context-menu-item" onclick="navigateForwardFolder(${sectionId})" ${!canNavigateForward(sectionId) ? 'style="opacity: 0.5; pointer-events: none;"' : ''}>➡️ 進む</div>
        <div class="context-menu-divider"></div>
        <div class="context-menu-item" onclick="bringSectionToFront(${sectionId})">⬆️ 最前面へ移動</div>
        <div class="context-menu-item" onclick="sendSectionToBack(${sectionId})">⬇️ 最背面へ移動</div>
        <div class="context-menu-divider"></div>
        <div class="context-menu-item" onclick="copyFile(${sectionId}, '${escapeHtml(filename)}')">📋 コピー</div>
        <div class="context-menu-item" onclick="cutFile(${sectionId}, '${escapeHtml(filename)}')">✂️ 切り取り</div>
    `;


    // 貼り付けは常に表示（クリップボードが空の場合は無効化）
    menuItems += `<div class="context-menu-item" onclick="pasteFile(${sectionId})" ${!clipboardFile ? 'style="opacity: 0.5; pointer-events: none;"' : ''}>📄 貼り付け</div>`;

    menuItems += `
        <div class="context-menu-item" onclick="downloadStorageFile(${sectionId}, '${escapeHtml(filename)}'); hideContextMenu();">📥 ダウンロード</div>
    `;

    // ZIPファイルの場合は解凍オプションを追加
    if (isZipFile) {
        menuItems += `<div class="context-menu-item" onclick="extractZipFile(${sectionId}, '${escapeHtml(filename)}')">📦 解凍</div>`;
    }

    menuItems += `<div class="context-menu-item delete" onclick="deleteStorageFileAndHide(${sectionId}, '${escapeHtml(filename)}')">🗑️ 削除</div>`;

    contextMenu.innerHTML = menuItems;

    document.body.appendChild(contextMenu);
    adjustContextMenuPosition(contextMenu, e);

    setTimeout(() => {
        document.addEventListener('click', hideContextMenu, { once: true });
    }, 0);
}

function copyFileLink(url) {
    // navigator.clipboard は HTTPS または localhost 環境でのみ動作するため、
    // ローカルネットワーク（HTTP）からのアクセスのためのフォールバックを実装
    if (navigator.clipboard && window.isSecureContext) {
        navigator.clipboard.writeText(url).then(() => {
            alert('リンクをコピーしました');
            hideContextMenu();
        }).catch(err => {
            console.error('Copy failed (Clipboard API):', err);
            fallbackCopyTextToClipboard(url);
        });
    } else {
        fallbackCopyTextToClipboard(url);
    }
}

function fallbackCopyTextToClipboard(text) {
    var textArea = document.createElement("textarea");
    textArea.value = text;

    // 画面外に隠す
    textArea.style.top = "0";
    textArea.style.left = "0";
    textArea.style.position = "fixed";
    textArea.style.opacity = "0";

    document.body.appendChild(textArea);
    textArea.focus();
    textArea.select();

    try {
        var successful = document.execCommand('copy');
        if (successful) {
            alert('リンクをコピーしました');
        } else {
            alert('コピーに失敗しました。ブラウザの権限を確認してください。');
        }
    } catch (err) {
        console.error('Fallback copy failed:', err);
        alert('コピーに失敗しました: ' + err);
    }

    document.body.removeChild(textArea);
    hideContextMenu();
}

// ファイルコピー（クリップボードに保存）
function copyFile(sectionId, filename) {
    clipboardFile = { sectionId, filename, isCut: false };
    hideContextMenu();
}

// ファイル切り取り
function cutFile(sectionId, filename) {
    clipboardFile = { sectionId, filename, isCut: true };
    hideContextMenu();
}

// ファイル貼り付け
async function pasteFile(targetSectionId) {
    if (!clipboardFile) return;

    hideContextMenu();

    try {
        const response = await fetch(`/note/api/sections/${clipboardFile.sectionId}/files/${encodeURIComponent(clipboardFile.filename)}/copy`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ target_section_id: targetSectionId }),
            credentials: 'include'
        });

        if (!response.ok) throw new Error('Copy failed');

        await fetchSectionFiles(targetSectionId);

        // 切り取りの場合は元のファイルを削除
        if (clipboardFile.isCut && clipboardFile.sectionId !== targetSectionId) {
            await apiCall(`/api/sections/${clipboardFile.sectionId}/files/${encodeURIComponent(clipboardFile.filename)}`, {
                method: 'DELETE'
            });
            await fetchSectionFiles(clipboardFile.sectionId);
            clipboardFile = null; // 切り取り後はクリア
        }
    } catch (error) {
        console.error('Paste error:', error);
        alert('貼り付けに失敗しました: ' + error.message);
    }
}

// ファイル共有（リンクをコピー）
function shareFile(url, filename) {
    if (navigator.share) {
        // Web Share APIが利用可能な場合
        navigator.share({
            title: filename,
            text: `${filename}を共有`,
            url: url
        }).then(() => {
            hideContextMenu();
        }).catch(err => {
            console.error('Share failed:', err);
            // フォールバック: リンクをコピー
            copyFileLink(url);
        });
    } else {
        // Web Share APIが利用できない場合はリンクをコピー
        copyFileLink(url);
    }
}

// ZIPファイル解凍
async function extractZipFile(sectionId, filename) {
    hideContextMenu();

    if (!confirm(`${filename} を解凍しますか？`)) return;

    try {
        const response = await fetch(`/note/api/sections/${sectionId}/files/${encodeURIComponent(filename)}/extract`, {
            method: 'POST'
        });

        if (!response.ok) throw new Error('Extract failed');

        await fetchSectionFiles(sectionId);
        alert(`${filename} を解凍しました`);
    } catch (error) {
        console.error('Extract error:', error);
        alert('解凍に失敗しました: ' + error.message);
    }
}

// ストレージセクションの背景用コンテキストメニュー
function showStorageBackgroundContextMenu(e, sectionId) {
    // ファイルやフォルダ上でのクリックは無視
    if (e.target.closest('.file-item')) {
        return;
    }

    e.preventDefault();
    e.stopPropagation();
    hideContextMenu();

    contextMenu = document.createElement('div');
    contextMenu.className = 'context-menu';
    contextMenu.style.left = `${e.clientX}px`;
    contextMenu.style.top = `${e.clientY}px`;

    let menuItems = `
        <div class="context-menu-item" onclick="bringSectionToFront(${sectionId})">⬆️ 最前面へ移動</div>
        <div class="context-menu-item" onclick="sendSectionToBack(${sectionId})">⬇️ 最背面へ移動</div>
        <div class="context-menu-divider"></div>
        <div class="context-menu-item header">並び替え</div>
        <div class="context-menu-item" onclick="updateSectionSortOrder(${sectionId}, 'name_asc')">🔃 名前 (昇順)</div>
        <div class="context-menu-item" onclick="updateSectionSortOrder(${sectionId}, 'name_desc')">🔃 名前 (降順)</div>
        <div class="context-menu-item" onclick="updateSectionSortOrder(${sectionId}, 'date_desc')">🔃 日付 (新しい順)</div>
        <div class="context-menu-item" onclick="updateSectionSortOrder(${sectionId}, 'date_asc')">🔃 日付 (古い順)</div>
        <div class="context-menu-item" onclick="updateSectionSortOrder(${sectionId}, 'size_desc')">🔃 サイズ (大きい順)</div>
        <div class="context-menu-item" onclick="updateSectionSortOrder(${sectionId}, 'size_asc')">🔃 サイズ (小さい順)</div>
        <div class="context-menu-divider"></div>
        <div class="context-menu-item" onclick="createNewFolderInSection(${sectionId})">📁 新規フォルダ</div>
    `;

    // 貼り付けは常に表示（クリップボードが空の場合は無効化）
    if (clipboardFile) {
        menuItems += `<div class="context-menu-item" onclick="pasteFile(${sectionId})">📄 貼り付け</div>`;
    } else {
        menuItems += `<div class="context-menu-item" style="opacity: 0.5; pointer-events: none;">📄 貼り付け</div>`;
    }

    menuItems += `<div class="context-menu-item" onclick="fetchSectionFiles(${sectionId})">🔄 更新</div>`;

    contextMenu.innerHTML = menuItems;

    document.body.appendChild(contextMenu);
    adjustContextMenuPosition(contextMenu, e);

    setTimeout(() => {
        document.addEventListener('click', hideContextMenu, { once: true });
    }, 0);
}

// 空のファイルリスト用コンテキストメニュー
function showEmptyContextMenu(e, sectionId) {
    e.preventDefault();
    hideContextMenu();

    contextMenu = document.createElement('div');
    contextMenu.className = 'context-menu';
    contextMenu.style.left = `${e.clientX}px`;
    contextMenu.style.top = `${e.clientY}px`;

    let menuItems = `
        <div class="context-menu-item" onclick="bringSectionToFront(${sectionId})">⬆️ 最前面へ移動</div>
        <div class="context-menu-item" onclick="sendSectionToBack(${sectionId})">⬇️ 最背面へ移動</div>
        <div class="context-menu-divider"></div>
    `;

    // 貼り付けのみ表示
    if (clipboardFile) {
        menuItems += `<div class="context-menu-item" onclick="pasteFile(${sectionId})">📄 貼り付け</div>`;
    } else {
        menuItems += `<div class="context-menu-item" style="opacity: 0.5; pointer-events: none;">📄 貼り付け</div>`;
    }

    contextMenu.innerHTML = menuItems;

    document.body.appendChild(contextMenu);
    adjustContextMenuPosition(contextMenu, e);

    setTimeout(() => {
        document.addEventListener('click', hideContextMenu, { once: true });
    }, 0);
}


// セクション設定モーダル関連
// セクション設定モーダル関連
window.configureSection = function(sectionId) {
    const section = sections.find(s => s.id === sectionId);
    if (!section) return;

    // メモ帳または画像セクションの場合は専用設定を開く
    if (section.content_type === 'notepad' || section.content_type === 'image') {
        if (typeof openNotepadSettings === 'function') {
            openNotepadSettings(sectionId);
        }
        return;
    }


    // 現在の設定を取得
    const currentData = section.content_data || {};
    let currentStorageType = currentData.storage_type || 'local';
    let currentPath = currentData.path || '';

    // 端末ごとのローカル設定を上書きで読み込む（他のPCの設定に影響されないようにする）
    const localOverrideJSON = localStorage.getItem('local_storage_config_' + sectionId);
    if (localOverrideJSON) {
        try {
            const localOverride = JSON.parse(localOverrideJSON);
            if (localOverride.storage_type) currentStorageType = localOverride.storage_type;
            if (localOverride.path) currentPath = localOverride.path;
        } catch (e) {
            console.error("Local storage override parse error:", e);
        }
    }

    // モーダルに値をセット
    document.getElementById('editingSectionId').value = sectionId;
    document.getElementById('sectionNameInput').value = section.name || '';
    document.getElementById('sectionStorageType').value = currentStorageType;
    document.getElementById('sectionStoragePath').value = currentPath;

    // モーダルを表示
    showModal('modalSectionSettings');
}



// フォルダ参照ボタン - ローカルPCのフォルダを確実に開く (v3.2-picker-fix)
// ブラウザの制限により、呼び出し元からここまでの間に非同期処理を挟まないことが重要
window.openDirectoryBrowser = async function() {
    window.debugLog('openDirectoryBrowser start (v3.2)');
    
    if (!('showDirectoryPicker' in window)) {
        alert('このブラウザはフォルダ選択に対応していません。Chrome または Edge の最新版をお使いください。');
        return;
    }

    if (isFolderPickerActive) {
        window.debugLog('Picker already active, forcing reset');
        isFolderPickerActive = false;
    }

    try {
        isFolderPickerActive = true;
        // showDirectoryPicker を可能な限り早く（同期的と言える範囲で）呼び出す
        const dirHandle = await window.showDirectoryPicker({ mode: 'read' });
        window.debugLog(`Folder selected: ${dirHandle.name}`);
        
        const pathInput = document.getElementById('sectionStoragePath');
        if (pathInput) pathInput.value = dirHandle.name;
        
        const sectionId = parseInt(document.getElementById('editingSectionId')?.value);
        if (sectionId) {
            localDirHandles[sectionId] = dirHandle;
            localDirSubHandles[sectionId] = dirHandle;
            await saveFsHandle(sectionId, dirHandle);
            window.debugLog('Handle saved to IndexedDB.');
        }
    } catch (e) {
        if (e.name === 'AbortError') {
            window.debugLog('Picker cancelled by user');
        } else {
            window.debugLog(`Picker Error: ${e.message}`, true);
            if (e.message.includes('user activation')) {
                alert('セキュリティ制限により画面を表示できませんでした。もう一度ボタンを押し直してください。');
            } else {
                alert('フォルダ選択に失敗しました: ' + e.message);
            }
        }
    } finally {
        isFolderPickerActive = false;
        window.debugLog('openDirectoryBrowser finished');
    }
}

async function loadDirectory(path) {
    const listEl = document.getElementById('directoryList');
    const pathEl = document.getElementById('currentBrowsePath');

    pathEl.textContent = '読み込み中...';
    listEl.innerHTML = '<div style="padding: 10px; color: #666;">読み込み中...</div>';

    try {
        const data = await apiCall(`/api/system/directories?path=${encodeURIComponent(path)}`);

        // 現在のパスを表示
        pathEl.textContent = data.current_path;
        pathEl.dataset.path = data.current_path;
        pathEl.dataset.parent = data.parent_path;

        // ディレクトリ一覧を表示
        if (data.directories.length === 0) {
            listEl.innerHTML = '<div style="padding: 10px; color: #999;">サブフォルダはありません</div>';
        } else {
            listEl.innerHTML = data.directories.map(dir => {
                // パスを正しく結合（末尾の/を考慮）
                const currentPath = data.current_path.endsWith('/')
                    ? data.current_path.slice(0, -1)
                    : data.current_path;
                const fullPath = `${currentPath}/${dir}`;

                return `
                    <div class="directory-item"
                         data-path="${escapeHtml(fullPath)}"
                         onclick="selectDirectoryItem(this, '${escapeHtml(fullPath)}')"
                         ondblclick="loadDirectory('${escapeHtml(fullPath)}')">
                         📁 ${escapeHtml(dir)}
                    </div>
                `;
            }).join('');
        }
    } catch (error) {
        listEl.innerHTML = `<div style="padding: 10px; color: red;">エラー: ${escapeHtml(error.message)}</div>`;
        pathEl.textContent = 'エラー';
    }
}

// フォルダアイテムを選択
let selectedDirectoryPath = null;

function selectDirectoryItem(element, path) {
    // 以前の選択を解除
    const previousSelected = document.querySelector('.directory-item.selected');
    if (previousSelected) {
        previousSelected.classList.remove('selected');
    }

    // 新しい選択を設定
    element.classList.add('selected');
    selectedDirectoryPath = path;
}




// サイドバー機能関連
function initSidebarToggle() {
    const sidebar = document.querySelector('.sidebar');
    const toggleBtn = document.getElementById('btnSidebarToggle');

    // 初期状態の復元
    const savedCollapsed = localStorage.getItem('sidebarCollapsed') === 'true';

    if (savedCollapsed) {
        sidebar.classList.add('collapsed');
    }

    // トグルボタン
    if (toggleBtn) {
        toggleBtn.addEventListener('click', () => {
            sidebar.classList.toggle('collapsed');
            const isCollapsed = sidebar.classList.contains('collapsed');
            localStorage.setItem('sidebarCollapsed', isCollapsed);
        });
    }
}

function setupDirectoryBrowserEvents() {
    // セクション設定モーダル
    document.getElementById('closeSectionSettings').onclick = () => hideModal('modalSectionSettings');
    document.getElementById('btnCancelSectionSettings').onclick = () => hideModal('modalSectionSettings');

    // ストレージタイプ変更時の自動パス設定
    document.getElementById('sectionStorageType').onchange = async (e) => {
        const storageType = e.target.value;
        const pathInput = document.getElementById('sectionStoragePath');

        if (storageType !== 'local') {
            try {
                const response = await fetch('/note/api/system/cloud-storage-paths', { credentials: 'include' });
                const cloudPaths = await response.json();

                if (cloudPaths[storageType]) {
                    // クラウドストレージのパスが見つかった場合、既存のパスを上書きして自動設定する
                    pathInput.value = cloudPaths[storageType];
                } else {
                    // 見つからなかった場合はパスを空にし、案内ダイアログを出す
                    pathInput.value = '';
                    const storageNames = {
                        'onedrive': 'OneDrive',
                        'googledrive': 'Google Drive',
                        'icloud': 'iCloud Drive'
                    };
                    alert(`PCのローカル環境に ${storageNames[storageType]} の同期フォルダが見つかりませんでした。\n同期アプリがインストールされているか確認するか、手動でパスを入力してください。\n\n[検索先]\n- OneDrive: ~/Library/CloudStorage/...\n- Google Drive: ~/Library/CloudStorage/...\n- iCloud: ~/Library/Mobile Documents/com~apple~CloudDocs`);
                }
            } catch (error) {
                console.error('Failed to fetch cloud storage paths:', error);
            }
        }
    };

    // セクション保存
    document.getElementById('btnSaveSectionSettings').onclick = async () => {
        const sectionId = parseInt(document.getElementById('editingSectionId').value);
        const name = document.getElementById('sectionNameInput').value.trim();
        const storageType = document.getElementById('sectionStorageType')?.value || 'local';
        const path = document.getElementById('sectionStoragePath').value.trim();

        if (!path) {
            alert('フォルダパスを入力してください');
            return;
        }

        let dbPath = path;

        // 端末ごとのローカルフォルダ設定機能
        if (storageType === 'local') {
            // ローカルフォルダの場合は端末のブラウザ(localStorage)にのみフルパスを記憶させる（他PCとの競合防止用）
            localStorage.setItem('local_storage_config_' + sectionId, JSON.stringify({
                storage_type: 'local',
                path: path
            }));
            // クラウド上のDBにもパスを保存（デフォルトのフォールバックとして機能し、永続化を可能にする）
            dbPath = path;
        } else {
            // ローカル以外のクラウドストレージ（OneDrive等）に変更された場合は、現在のローカル設定を破棄
            localStorage.removeItem('local_storage_config_' + sectionId);
        }

        const updateData = {
            name: name,
            content_type: 'storage',
            content_data: {
                storage_type: storageType,
                path: dbPath
            }
        };

        await apiCall(`/api/sections/${sectionId}`, {
            method: 'PUT',
            body: JSON.stringify(updateData)
        });

        // ローカルデータ更新して再描画
        const section = sections.find(s => s.id === sectionId);
        if (section) {
            section.name = name;
            section.content_type = 'storage';
            // 表示上は現在の端末のパスを保持しておく
            section.content_data = {
                storage_type: storageType,
                path: path
            };
        }
        hideModal('modalSectionSettings');
        renderPageContent(); // 再描画

        // ファイルを読み込む
        await fetchSectionFiles(sectionId);
    };

    // セクション削除
    document.getElementById('btnDeleteSection').onclick = async () => {
        const sectionId = parseInt(document.getElementById('editingSectionId').value);
        if (confirm('本当にこのセクションを削除しますか？')) {
            await deleteSection(sectionId);
            hideModal('modalSectionSettings');
        }
    };

    const btnBrowse = document.getElementById('btnBrowseSectionPath');
    if (btnBrowse) {
        window.debugLog('Binding btnBrowseSectionPath click listener');
        btnBrowse.addEventListener('click', () => {
            window.debugLog('btnBrowseSectionPath clicked (from addEventListener)');
            openDirectoryBrowser();
        });
    } else {
        window.debugLog('WARNING: btnBrowseSectionPath not found in DOM during setup', true);
    }

    // ディレクトリブラウザモーダル
    document.getElementById('closeDirectoryBrowser').onclick = () => hideModal('modalDirectoryBrowser');
    document.getElementById('btnCancelDirectoryBrowser').onclick = () => hideModal('modalDirectoryBrowser');

    document.getElementById('btnDirUp').onclick = () => {
        const parent = document.getElementById('currentBrowsePath').dataset.parent;
        if (parent) loadDirectory(parent);
    };

    document.getElementById('btnCreateNewFolder').onclick = async () => {
        const currentPath = document.getElementById('currentBrowsePath').dataset.path;
        if (!currentPath) return;

        const name = prompt('新しいフォルダ名を入力してください:');
        if (!name) return;

        try {
            await apiCall('/api/system/directories', {
                method: 'POST',
                body: JSON.stringify({
                    path: currentPath,
                    name: name
                })
            });
            loadDirectory(currentPath); // リロード
        } catch (error) {
            console.error('Create directory error:', error);
            alert('フォルダ作成に失敗しました: ' + error.message);
        }
    };

    document.getElementById('btnSelectDirectory').onclick = () => {
        // 選択されたフォルダがあればそれを使用、なければ現在のパスを使用
        const pathToUse = selectedDirectoryPath || document.getElementById('currentBrowsePath').dataset.path;
        if (pathToUse) {
            document.getElementById('sectionStoragePath').value = pathToUse;
            hideModal('modalDirectoryBrowser');
            selectedDirectoryPath = null; // リセット
        }
    };
}


async function updateSectionStorageConfig(sectionId, type, path) {
    await apiCall(`/api/sections/${sectionId}`, {
        method: 'PUT',
        body: JSON.stringify({
            content_type: 'storage',
            content_data: {
                storage_type: type,
                path: path
            }
        })
    });

    // データ更新
    const section = sections.find(s => s.id === sectionId);
    if (section) {
        section.content_type = 'storage';
        section.content_data = { storage_type: type, path: path };
    }
    renderPageContent(); // 再描画
}

// ストレージ関連
async function loadStorageLocations() {
    storageLocations = await apiCall('/api/storage-locations');
    renderStorageLocations();
}

function renderStorageLocations() {
    const container = document.getElementById('storageLocations');
    container.innerHTML = '';

    storageLocations.forEach(loc => {
        const item = document.createElement('div');
        item.className = 'storage-item';
        item.innerHTML = `
            <div class="storage-item-info">
                <div class="storage-item-name">${escapeHtml(loc.name)} (${loc.storage_type})</div>
                <div class="storage-item-path">${escapeHtml(loc.path)}</div>
            </div>
        `;
        container.appendChild(item);
    });
}

async function createStorageLocation(name, type, path) {
    await apiCall('/api/storage-locations', {
        method: 'POST',
        body: JSON.stringify({ name, storage_type: type, path })
    });
    await loadStorageLocations();
    hideModal('modalAddStorage');
    document.getElementById('storageName').value = '';
    document.getElementById('storagePath').value = '';
}

// モーダル管理
function showModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) {
        modal.classList.add('active');
    }
}

function hideModal(modalId) {
    document.getElementById(modalId).classList.remove('active');
}

// ユーティリティ関数
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function formatFileSize(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
}

// ==================== サブスクリプション状態の確認と制御 ====================
// 外部URLをブラウザで開く (デスクトップ版対応)
function openExternalLink(url) {
    if (window.pywebview && window.pywebview.api && window.pywebview.api.open_url) {
        window.pywebview.api.open_url(url);
    } else {
        window.open(url, '_blank');
    }
}

// サブスクリプション状態のポーリング設定
let subscriptionPollingTimer = null;

async function loadSubscriptionStatus() {
    try {
        // user/status API は要認証なので、初期化前などに呼ばれた場合は無視される実装とする
        const response = await fetch('/note/api/user/status', { credentials: 'include' });
        if (response.status === 401 || response.status === 403) return; // 未ログイン
        if (!response.ok) return;

        const data = await response.json();

        // App Lock判定
        if (data.is_locked) {
            document.getElementById('modalAppLock').style.display = 'flex';
            document.getElementById('btnSubscribeNow').href = data.payment_link;
            
            // ロック中かつタイマーが動いていなければポーリング開始 (10秒ごと)
            if (!subscriptionPollingTimer) {
                console.log("Subscription is locked. Starting auto-polling...");
                subscriptionPollingTimer = setInterval(() => {
                    loadSubscriptionStatus();
                }, 10000);
            }
            return; // ロック状態ならこれ以上何もしない
        } else {
            document.getElementById('modalAppLock').style.display = 'none';
            // ロック解除されたらタイマー停止
            if (subscriptionPollingTimer) {
                console.log("Subscription unlocked! Stopping auto-polling.");
                clearInterval(subscriptionPollingTimer);
                subscriptionPollingTimer = null;
            }
        }

        // 設定モーダルの表示内容を更新
        const container = document.getElementById('subscriptionStatusContainer');
        if (!container) return;

        let html = '';
        if (data.subscription_status === 'trialing') {
            html += `<p style="font-weight: bold; color: #f0ad4e;">無料トライアル中 (残り ${data.trial_days_left} 日)</p>`;
            html += `<p style="font-size: 13px; color: #666; margin-top: 4px;">トライアル終了日: ${new Date(data.trial_end).toLocaleDateString()}</p>`;
            html += `<a href="${data.payment_link}" onclick="event.preventDefault(); openExternalLink(this.href);" class="btn-primary" style="display: inline-block; margin-top: 15px; text-decoration: none;">サブスクリプションを登録する</a>`;
        } else if (data.subscription_status === 'active') {
            if (data.cancel_at_period_end) {
                html += `<p style="font-weight: bold; color: #d9534f;">サブスクリプション退会済み</p>`;
                html += `<p style="font-size: 14px; margin-top: 4px;">有効期限: ${new Date(data.current_period_end).toLocaleDateString()}</p>`;
                html += `<p style="font-size: 12px; color: #666; margin-top: 5px;">有効期限までは引き続きご利用いただけます。</p>`;
            } else {
                html += `<p style="font-weight: bold; color: #5cb85c;">サブスクリプション有効</p>`;
                html += `<p style="font-size: 14px; margin-top: 4px;">次回更新日: ${new Date(data.current_period_end).toLocaleDateString()}</p>`;
                html += `<button onclick="cancelSubscription()" class="btn-secondary" style="margin-top: 15px; border-color: #d9534f; color: #d9534f; width: 100%;">サブスクリプションを退会する</button>`;
            }
        } else if (data.subscription_status === 'canceled' || data.subscription_status === 'expired') {
            html += `<p style="font-weight: bold; color: #d9534f;">利用期間終了</p>`;
            html += `<a href="${data.payment_link}" onclick="event.preventDefault(); openExternalLink(this.href);" class="btn-primary" style="display: inline-block; margin-top: 15px; text-decoration: none;">再開する</a>`;
        }

        container.innerHTML = html;

    } catch (error) {
        console.error('Failed to load subscription status:', error);
    }
}

// ==================== サブスクリプション状態の確認と制御 ====================
async function cancelSubscription() {
    if (!confirm('本当にサブスクリプションを退会しますか？\\n（次回の更新日までは引き続き利用可能です）')) return;

    try {
        const response = await fetch('/note/api/user/cancel-subscription', { method: 'POST' });
        const data = await response.json();

        if (response.ok) {
            alert(data.message);
            loadSubscriptionStatus(); // 表示を最新に更新
        } else {
            alert('エラー: ' + data.error);
        }
    } catch (e) {
        alert('通信エラーが発生しました');
    }
}

// 非表示タブリストの描画関数
function renderHiddenTabsList() {
    const container = document.getElementById('hiddenTabsListContainer');
    if (!container) return;

    container.innerHTML = '';
    const hiddenTabIds = getHiddenTabs();

    // 現在サーバーに存在するタブのうち、非表示リストに含まれるものだけを抽出
    const hiddenTabsObjects = tabs.filter(tab => hiddenTabIds.includes(tab.id));

    if (hiddenTabsObjects.length === 0) {
        container.innerHTML = '<p style="color: #999; text-align: center; padding: 20px 0;">非表示のタブはありません</p>';
        return;
    }

    hiddenTabsObjects.forEach(tab => {
        const item = document.createElement('div');
        item.style.display = 'flex';
        item.style.justifyContent = 'space-between';
        item.style.alignItems = 'center';
        item.style.padding = '10px';
        item.style.borderBottom = '1px solid #eee';

        item.innerHTML = `
            <span style="font-weight: 500;">${escapeHtml(tab.name)}</span>
            <button class="btn-primary" style="padding: 4px 10px; font-size: 12px;" onclick="restoreHiddenTab(${tab.id})">再表示</button>
        `;
        container.appendChild(item);
    });
}

// タブを再表示するグローバル関数
window.restoreHiddenTab = function (tabId) {
    toggleTabVisibility(tabId, false);
    renderHiddenTabsList(); // モーダル内のリストを更新

    // 再表示したタブを選択する
    selectTab(tabId);

    const modalHiddenTabs = document.getElementById('modalHiddenTabs');
    if (modalHiddenTabs) closeModal(modalHiddenTabs);
};



// セクション用コンテキストメニュー
function showSectionContextMenu(e, sectionId) {
    e.preventDefault();
    e.stopPropagation();
    hideContextMenu();

    contextMenu = document.createElement('div');
    contextMenu.className = 'context-menu';
    contextMenu.style.left = `${e.clientX}px`;
    contextMenu.style.top = `${e.clientY}px`;

    let menuItems = `
        <div class="context-menu-item" onclick="copySection(${sectionId})">📋 コピー</div>
        <div class="context-menu-item" onclick="cutSection(${sectionId})">✂️ 切り取り</div>
    `;

    // 貼り付けはクリップボードにセクションがある場合のみ有効
    if (clipboardSection) {
        menuItems += `<div class="context-menu-item" onclick="pasteSection()">📄 貼り付け</div>`;
    } else {
        menuItems += `<div class="context-menu-item" style="opacity: 0.5; pointer-events: none;">📄 貼り付け</div>`;
    }

    menuItems += `<div class="context-menu-item delete" onclick="deleteSectionFromMenu(${sectionId})">🗑️ 削除</div>`;

    contextMenu.innerHTML = menuItems;

    document.body.appendChild(contextMenu);
    adjustContextMenuPosition(contextMenu, e);

    setTimeout(() => {
        document.addEventListener('click', hideContextMenu, { once: true });
    }, 0);
}

// セクションコピー
function copySection(sectionId) {
    const section = sections.find(s => s.id === sectionId);
    if (!section) return;

    clipboardSection = {
        ...section,
        isCut: false
    };

    hideContextMenu();
}

// セクション切り取り
function cutSection(sectionId) {
    const section = sections.find(s => s.id === sectionId);
    if (!section) return;

    clipboardSection = {
        ...section,
        isCut: true,
        originalId: sectionId
    };

    // 視覚的に切り取り状態を表示
    const sectionEl = document.getElementById(`section-${sectionId}`);
    if (sectionEl) {
        sectionEl.style.opacity = '0.5';
        sectionEl.style.border = '2px dashed #999';
    }

    hideContextMenu();
}

// セクション貼り付け
async function pasteSection() {
    if (!clipboardSection || !currentPageId) return;

    hideContextMenu();

    try {
        // 新しい位置を計算（少しオフセット）
        const newPositionX = (clipboardSection.position_x || 0) + 20;
        const newPositionY = (clipboardSection.position_y || 0) + 20;

        const response = await apiCall(`/api/pages/${currentPageId}/sections`, {
            method: 'POST',
            body: JSON.stringify({
                name: clipboardSection.name,
                content_type: clipboardSection.content_type,
                content_data: clipboardSection.content_data,
                memo: clipboardSection.memo,
                position_x: newPositionX,
                position_y: newPositionY,
                width: clipboardSection.width || 300,
                height: clipboardSection.height || 200
            })
        });

        // 切り取りの場合は元のセクションを削除
        if (clipboardSection.isCut && clipboardSection.originalId) {
            await apiCall(`/api/sections/${clipboardSection.originalId}`, {
                method: 'DELETE'
            });
            clipboardSection = null; // 切り取り後はクリップボードをクリア
        }

        // ページをリロード
        await selectPage(currentPageId);
    } catch (error) {
        console.error('Paste section error:', error);
        alert('セクションの貼り付けに失敗しました: ' + error.message);
    }
}

// セクション削除（コンテキストメニューから）
async function deleteSectionFromMenu(sectionId) {
    hideContextMenu();

    if (!confirm('このセクションを削除しますか？')) return;

    try {
        await apiCall(`/api/sections/${sectionId}`, {
            method: 'DELETE'
        });

        await selectPage(currentPageId);
    } catch (error) {
        console.error('Delete section error:', error);
        alert('セクションの削除に失敗しました: ' + error.message);
    }
}

// ファイルプレビュー関連
let currentPreviewFile = null; // 現在プレビュー中のファイル

async function showFilePreview(sectionId, filename) {
    const panel = document.getElementById('filePreviewPanel');
    const content = document.getElementById('previewContent');
    const fileNameEl = document.getElementById('previewFileName');

    // 同じファイルをクリックした場合はプレビューを閉じる
    if (currentPreviewFile && currentPreviewFile.sectionId === sectionId && currentPreviewFile.filename === filename) {
        closeFilePreview();
        return;
    }

    currentPreviewFile = { sectionId, filename };
    fileNameEl.textContent = filename;
    content.innerHTML = '<div style="padding:20px;color:#999;">読み込み中...</div>';
    panel.classList.add('active');

    const ext = filename.toLowerCase().split('.').pop();
    const currentHandle = localDirSubHandles[sectionId];

    let fileUrl;
    let isBlob = false;

    if (currentHandle) {
        // ローカルファイルをBlobURLで表示（事前権限チェック）
        try {
            // パミッションの確認と要求
            let perm = await currentHandle.queryPermission({ mode: 'read' });
            if (perm === 'prompt') perm = await currentHandle.requestPermission({ mode: 'read' });

            if (perm !== 'granted') {
                content.innerHTML = `<div class="preview-placeholder">ファイルへのアクセス権限がありません (状態: ${perm})</div>`;
                return;
            }

            const fileHandle = await currentHandle.getFileHandle(filename);
            const file = await fileHandle.getFile();
            fileUrl = URL.createObjectURL(file);
            isBlob = true;
        } catch (e) {
            console.error("Preview local file error:", e);
            content.innerHTML = `<div class="preview-placeholder" style="color:red;text-align:left;padding:20px;">
                <b>プレビュー生成エラー:</b><br><br>
                ${escapeHtml(e.toString())}<br><br>
                <div style="font-size:11px;color:#666;">${escapeHtml(e.stack || '')}</div>
            </div>`;
            return;
        }
    } else {
        fileUrl = `${window.location.origin}/note/api/sections/${sectionId}/files/${encodeURIComponent(filename)}`;
    }

    // ファイルタイプに応じてプレビューを生成
    if (['jpg', 'jpeg', 'png', 'gif', 'bmp', 'webp', 'svg'].includes(ext)) {
        content.innerHTML = `<img src="${fileUrl}" style="max-width: 100%; max-height: 100%; object-fit: contain;">`;
    } else if (['mp4', 'webm'].includes(ext)) {
        content.innerHTML = `<video controls style="max-width: 100%; max-height: 100%;"><source src="${fileUrl}"></video>`;
    } else if (['mp3', 'wav', 'ogg', 'm4a'].includes(ext)) {
        content.innerHTML = `<audio controls style="width: 100%;"><source src="${fileUrl}"></audio>`;
    } else if (ext === 'pdf') {
        content.innerHTML = `<iframe src="${fileUrl}" style="width: 100%; height: 100%; border: none;"></iframe>`;
    } else if (['txt', 'md', 'json', 'js', 'css', 'html', 'xml', 'csv', 'py', 'sh'].includes(ext)) {
        if (currentHandle) {
            try {
                const fileHandle = await currentHandle.getFileHandle(filename);
                const file = await fileHandle.getFile();
                const text = await file.text();
                content.innerHTML = `<pre style="padding: 20px; overflow: auto; height: 100%;">${escapeHtml(text)}</pre>`;
            } catch (e) {
                content.innerHTML = `<div class="preview-placeholder">テキストを読み込めませんでした</div>`;
            }
        } else {
            fetch(fileUrl).then(r => r.text()).then(text => {
                content.innerHTML = `<pre style="padding: 20px; overflow: auto; height: 100%;">${escapeHtml(text)}</pre>`;
            });
        }
    } else {
        content.innerHTML = `<div class="preview-placeholder">このファイル形式はプレビューできません<br><br><a href="${fileUrl}" download="${escapeHtml(filename)}">ダウンロード</a></div>`;
    }

    // BlobURLは1分後に解放
    if (isBlob) setTimeout(() => URL.revokeObjectURL(fileUrl), 60000);
}

function closeFilePreview() {
    const panel = document.getElementById('filePreviewPanel');
    panel.classList.remove('active');
    currentPreviewFile = null; // プレビューファイルをクリア
}

function toggleFilePreview() {
    const panel = document.getElementById('filePreviewPanel');
    panel.classList.toggle('active');
}

// メモ帳の編集機能
function printNotepad(sectionId) {
    const textarea = document.getElementById(`notepad-${sectionId}`);
    if (!textarea) return;

    const printWindow = window.open('', '', 'width=800,height=600');
    printWindow.document.write(`
        <html>
        <head><title>印刷</title></head>
        <body style="font-family: ${textarea.style.fontFamily}; font-size: ${textarea.style.fontSize}; color: ${textarea.style.color}; white-space: pre-wrap;">
        ${escapeHtml(textarea.value)}
        </body>
        </html>
    `);
    printWindow.document.close();
    printWindow.print();
}

function copyNotepadText(sectionId) {
    const textarea = document.getElementById(`notepad-${sectionId}`);
    if (!textarea) return;

    const selectedText = textarea.value.substring(textarea.selectionStart, textarea.selectionEnd);
    const textToCopy = selectedText || textarea.value;

    navigator.clipboard.writeText(textToCopy).then(() => {
        console.log('テキストをコピーしました');
    });
}

function cutNotepadText(sectionId) {
    const textarea = document.getElementById(`notepad-${sectionId}`);
    if (!textarea) return;

    const selectedText = textarea.value.substring(textarea.selectionStart, textarea.selectionEnd);
    if (!selectedText) return;

    navigator.clipboard.writeText(selectedText).then(() => {
        const start = textarea.selectionStart;
        const end = textarea.selectionEnd;
        textarea.value = textarea.value.substring(0, start) + textarea.value.substring(end);
        textarea.selectionStart = textarea.selectionEnd = start;

        // 変更を保存
        updateSectionContent(sectionId, 'notepad', textarea.value);
    });
}

function pasteNotepadText(sectionId) {
    const textarea = document.getElementById(`notepad-${sectionId}`);
    if (!textarea) return;

    navigator.clipboard.readText().then(text => {
        const start = textarea.selectionStart;
        const end = textarea.selectionEnd;
        textarea.value = textarea.value.substring(0, start) + text + textarea.value.substring(end);
        textarea.selectionStart = textarea.selectionEnd = start + text.length;

        // 変更を保存
        updateSectionContent(sectionId, 'notepad', textarea.value);
    });
}

function showNotepadContextMenu(e, sectionId) {
    e.preventDefault();
    hideContextMenu();

    contextMenu = document.createElement('div');
    contextMenu.className = 'context-menu';
    contextMenu.style.left = `${e.clientX}px`;
    contextMenu.style.top = `${e.clientY}px`;

    contextMenu.innerHTML = `
        <div class="context-menu-item" onclick="printNotepad(${sectionId})">🖨️ 印刷</div>
        <div class="context-menu-item" onclick="copyNotepadText(${sectionId})">📋 コピー</div>
        <div class="context-menu-item" onclick="cutNotepadText(${sectionId})">✂️ 切り取り</div>
        <div class="context-menu-item" onclick="pasteNotepadText(${sectionId})">📄 貼り付け</div>
    `;

    document.body.appendChild(contextMenu);
    adjustContextMenuPosition(contextMenu, e);

    setTimeout(() => {
        document.addEventListener('click', hideContextMenu, { once: true });
    }, 0);
}

// メモ帳設定モーダル
function openNotepadSettings(sectionId) {
    const section = sections.find(s => s.id === sectionId);
    if (!section) return;

    const data = section.content_data || {};

    // カスタムモーダルを作成
    const modal = document.createElement('div');
    modal.className = 'modal';
    modal.id = 'notepadSettingsModal';
    modal.style.display = 'flex';

    modal.innerHTML = `
        <div class="modal-content compact-modal">
            <span class="close" onclick="closeNotepadSettings()">&times;</span>
            <h2>${section.name || 'メモ帳'} - 設定</h2>
            
            <div class="settings-grid">
                <div class="form-group full-width">
                    <label>タイトル</label>
                    <input type="text" id="notepadTitle" value="${escapeHtml(section.name || '')}" placeholder="タイトルを入力">
                </div>
                
                <div class="form-group">
                    <label>背景色</label>
                    <input type="color" id="notepadBgColor" value="${data.bgColor || '#fffef7'}">
                </div>
                
                <div class="form-group">
                    <label>文字色</label>
                    <input type="color" id="notepadFontColor" value="${data.fontColor || '#333333'}">
                </div>
                
                <div class="form-group">
                    <label>フォント</label>
                    <select id="notepadFontFamily">
                        <option value="'Segoe UI', Tahoma, Geneva, Verdana, sans-serif'" ${(data.fontFamily || '').includes('Segoe') ? 'selected' : ''}>Segoe UI</option>
                        <option value="'Arial', sans-serif'" ${(data.fontFamily || '').includes('Arial') ? 'selected' : ''}>Arial</option>
                        <option value="'Times New Roman', serif'" ${(data.fontFamily || '').includes('Times') ? 'selected' : ''}>Times New Roman</option>
                        <option value="'Courier New', monospace'" ${(data.fontFamily || '').includes('Courier') ? 'selected' : ''}>Courier New</option>
                        <option value="'Georgia', serif'" ${(data.fontFamily || '').includes('Georgia') ? 'selected' : ''}>Georgia</option>
                    </select>
                </div>
                
                <div class="form-group">
                    <label>フォントサイズ</label>
                    <select id="notepadFontSize">
                        <option value="12px" ${data.fontSize === '12px' ? 'selected' : ''}>小</option>
                        <option value="14px" ${!data.fontSize || data.fontSize === '14px' ? 'selected' : ''}>中</option>
                        <option value="16px" ${data.fontSize === '16px' ? 'selected' : ''}>大</option>
                        <option value="18px" ${data.fontSize === '18px' ? 'selected' : ''}>特大</option>
                    </select>
                </div>
            </div>
            
            <div style="margin-top: 20px; padding-top: 15px; border-top: 1px solid #eee;">
                <h3 style="font-size: 14px; margin-bottom: 10px; color: #555;">編集機能</h3>
                <div style="display: flex; gap: 10px; flex-wrap: wrap;">
                    <button class="btn-secondary" onclick="printNotepad(${sectionId})" style="flex: 1; min-width: 100px;">🖨️ 印刷</button>
                    <button class="btn-secondary" onclick="copyNotepadText(${sectionId})" style="flex: 1; min-width: 100px;">📋 コピー</button>
                    <button class="btn-secondary" onclick="cutNotepadText(${sectionId})" style="flex: 1; min-width: 100px;">✂️ 切り取り</button>
                    <button class="btn-secondary" onclick="pasteNotepadText(${sectionId})" style="flex: 1; min-width: 100px;">📄 貼り付け</button>
                </div>
            </div>
            
            <div class="modal-actions compact">
                <button class="btn-primary small" onclick="saveNotepadSettings(${sectionId})">保存</button>
                <button class="btn-secondary small" onclick="closeNotepadSettings()">キャンセル</button>
            </div>
        </div>
    `;

    document.body.appendChild(modal);
}

function closeNotepadSettings() {
    const modal = document.getElementById('notepadSettingsModal');
    if (modal) {
        modal.remove();
    }
}

async function saveNotepadSettings(sectionId) {
    const title = document.getElementById('notepadTitle').value;
    const bgColor = document.getElementById('notepadBgColor').value;
    const fontColor = document.getElementById('notepadFontColor').value;
    const fontFamily = document.getElementById('notepadFontFamily').value;
    const fontSize = document.getElementById('notepadFontSize').value;

    try {
        // タイトルを更新
        await apiCall(`/api/sections/${sectionId}`, {
            method: 'PUT',
            body: JSON.stringify({ name: title })
        });

        // スタイル設定を更新
        const section = sections.find(s => s.id === sectionId);
        if (section) {
            section.content_data = section.content_data || {};
            section.content_data.bgColor = bgColor;
            section.content_data.fontColor = fontColor;
            section.content_data.fontFamily = fontFamily;
            section.content_data.fontSize = fontSize;

            await apiCall(`/api/sections/${sectionId}/content`, {
                method: 'PUT',
                body: JSON.stringify({
                    content_type: 'notepad',
                    content_data: section.content_data
                })
            });
        }

        closeNotepadSettings();
        await selectPage(currentPageId);
    } catch (error) {
        console.error('Save notepad settings error:', error);
        alert('設定の保存に失敗しました: ' + error.message);
    }
}

// マウスの戻る・進むボタンに対応
// マウスの進むボタン(Button 4)への対応
document.addEventListener('mouseup', (e) => {
    if (e.button === 4) {
        const sectionEl = e.target.closest('.section');
        if (sectionEl) {
            const sectionIdStr = sectionEl.id.replace('section-', '');
            const sectionId = parseInt(sectionIdStr, 10);

            const section = sections.find(s => s.id === sectionId);
            if (section && section.content_type === 'storage') {
                e.preventDefault();
                e.stopPropagation();
                if (canNavigateForward(sectionId)) {
                    navigateForwardFolder(sectionId);
                }
            }
        }
    }
});

// --- OSレベルの「戻る」ボタン（マウスサイドボタン、スワイプ、キーボード等）をファイルビュー内でフックする ---
let hoveredStorageSectionIdForHistory = null;

// マウスがどのストレージセクション上にあるかを常に追跡
document.addEventListener('mouseover', (e) => {
    const sectionEl = e.target.closest('.section');
    if (sectionEl) {
        const sectionId = parseInt(sectionEl.id.replace('section-', ''), 10);
        const section = sections.find(s => s.id === sectionId);
        if (section && section.content_type === 'storage') {
            hoveredStorageSectionIdForHistory = sectionId;
            return;
        }
    }
    hoveredStorageSectionIdForHistory = null;
});

// 初期化時にHistory APIの「トラップ（罠）」を仕掛け、戻る操作をJSでインターセプトできるようにする
window.addEventListener('load', () => {
    history.replaceState({ isAppBase: true }, '', location.href);
    history.pushState({ isAppTrap: true }, '', location.href);
});

// ブラウザが「戻る/進む」を実行した直後に発生するイベント
window.addEventListener('popstate', (e) => {
    // 状態がBaseに戻った = 「戻る」ボタンが押された
    if (e.state && e.state.isAppBase) {
        if (hoveredStorageSectionIdForHistory) {
            // ファイルビューの上にカーソルがある場合は、アプリから離脱させずにフォルダ階層を上に上がる
            history.pushState({ isAppTrap: true }, '', location.href);
            navigateToParentFolder(hoveredStorageSectionIdForHistory);
        } else {
            // それ以外の場所で戻るが押された場合は、そのまま本来の前のページへ離脱させる
            history.back();
        }
    } else if (e.state && e.state.isAppTrap) {
        // Baseから「進む」ボタンで戻ってきた場合。正常として何もしない。
    } else {
        // 想定外のstateの場合の念のための復元
        history.replaceState({ isAppBase: true }, '', location.href);
        history.pushState({ isAppTrap: true }, '', location.href);
    }
});

// DEBUG: 読み込み完了ログ
window.debugLog('DEBUG: app.js loaded successfully. (End of file reached)');
