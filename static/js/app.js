// グローバル変数
let currentTabId = null;
let currentPageId = null;
let tabs = [];
let storageLocations = [];
let sections = [];
let draggedSection = null;
let sectionZIndex = 1000;

// ナビゲーション履歴の管理用
// 履歴の構造: { [sectionId]: { history: string[], currentIndex: number } }
let sectionNavigationHistory = {};

// API呼び出し関数
async function apiCall(url, options = {}) {
    const showAlert = options.showAlert !== false;
    try {
        console.log(`API Call: ${url}`, options);
        const response = await fetch(url, {
            headers: {
                'Content-Type': 'application/json',
                ...options.headers
            },
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
                // JSON parse failed, use default message
            }
            console.error(`API Error (${url}):`, errorMessage);
            throw new Error(errorMessage);
        }
        const data = await response.json();
        console.log(`API Success (${url}):`, data);
        return data;
    } catch (error) {
        console.error('API call failed:', error);
        if (showAlert) {
            alert('エラーが発生しました: ' + error.message);
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

        // localStorageから前回の状態を復元
        const savedTabId = localStorage.getItem('currentTabId');
        const savedPageId = localStorage.getItem('currentPageId');

        if (savedTabId && tabs.find(t => t.id === parseInt(savedTabId))) {
            // 保存されたタブが存在する場合は復元
            console.log('Restoring saved tab:', savedTabId);
            currentTabId = parseInt(savedTabId);
            await selectTab(currentTabId, savedPageId ? parseInt(savedPageId) : null);
        } else if (tabs.length > 0 && !currentTabId) {
            // 保存された状態がない、または無効な場合は最初のタブを選択
            console.log('Selecting first tab:', tabs[0].id);
            selectTab(tabs[0].id);
        } else {
            console.log('No tabs to select or tab already selected');
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
    tabsList.innerHTML = '';
    tabs.forEach(tab => {
        const tabItem = document.createElement('div');
        tabItem.className = `tab-item ${currentTabId === tab.id ? 'active' : ''}`;
        tabItem.innerHTML = `
            <span class="tab-item-name">${escapeHtml(tab.name)}</span>
            <button class="tab-item-delete" onclick="event.stopPropagation(); deleteTab(${tab.id})">×</button>
        `;
        tabItem.onclick = () => selectTab(tab.id);
        tabsList.appendChild(tabItem);
    });
}

async function selectTab(tabId, preferredPageId = null) {
    currentTabId = tabId;
    const tab = tabs.find(t => t.id === tabId);
    if (!tab) return;

    // localStorageに保存
    localStorage.setItem('currentTabId', tabId);

    // タブ選択状態の更新
    renderTabs();

    const pages = tab.pages || [];
    renderPageTabs(pages);

    if (pages.length > 0) {
        // preferredPageIdが指定されていて、そのページが存在する場合はそれを選択
        if (preferredPageId && pages.find(p => p.id === preferredPageId)) {
            selectPage(preferredPageId);
        } else {
            // それ以外は最初のページを選択
            selectPage(pages[0].id);
        }
    } else {
        currentPageId = null;
        localStorage.removeItem('currentPageId');
        renderPageContent();
    }
}

// ページ関連
function renderPageTabs(pages) {
    const tabBar = document.getElementById('tabBar');
    tabBar.innerHTML = '';

    pages.forEach(page => {
        const pageTab = document.createElement('div');
        pageTab.className = `page-tab ${currentPageId === page.id ? 'active' : ''}`;
        pageTab.innerHTML = `
            <span>${escapeHtml(page.name)}</span>
            <span class="page-tab-close" onclick="event.stopPropagation(); deletePage(${page.id})">×</span>
        `;
        pageTab.onclick = () => selectPage(page.id);
        tabBar.appendChild(pageTab);
    });

    const newPageBtn = document.createElement('button');
    newPageBtn.className = 'btn-new-page';
    newPageBtn.textContent = '+ ページ';
    newPageBtn.onclick = () => showModal('modalNewPage');
    tabBar.appendChild(newPageBtn);
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
        // apiCall内でalertが表示されるので、ここでは何もしない
    }
}

async function selectPage(pageId) {
    currentPageId = pageId;

    // localStorageに保存
    localStorage.setItem('currentPageId', pageId);

    const page = await apiCall(`/api/pages/${pageId}`);
    sections = page.sections || [];
    renderPageContent();
    renderPageTabs(tabs.find(t => t.id === currentTabId)?.pages || []);
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
    addSectionBtn.title = 'ファイルビューを追加';
    addSectionBtn.onclick = (e) => {
        e.stopPropagation();
        toggleSectionDropdown();
    };

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
                <textarea placeholder="メモ..." onchange="updateSectionContent(${section.id}, 'memo', this.value)">${escapeHtml(section.memo || '')}</textarea>
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
            return `<textarea class="content-text" onchange="updateSectionContent(${section.id}, 'text', this.value)">${escapeHtml(data.text || '')}</textarea>`;
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
            // ファイル一覧を非同期で取得して表示するためのコンテナを返す
            setTimeout(() => fetchSectionFiles(section.id), 0);
            return `
                <div class="file-browser" id="file-browser-${section.id}">
                    <div class="file-list" id="file-list-${section.id}" oncontextmenu="showUnifiedStorageContextMenu(event, ${section.id}, 'background')">
                        <div style="padding: 10px; color: #666;">読み込み中...</div>
                    </div>
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
                <textarea class="notepad-content" id="notepad-${section.id}" style="${style}" placeholder="ここにメモを入力してください..." onchange="updateSectionContent(${section.id}, 'notepad', this.value)">${escapeHtml(data.text || '')}</textarea>
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
function toggleSectionDropdown() {
    const dropdown = document.getElementById('sectionDropdown');
    if (dropdown) {
        dropdown.classList.toggle('show');
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

async function createNewSection(sectionType = 'text', x = null, y = null) {
    if (!currentPageId) return;

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
                    const response = await fetch('/api/upload', {
                        method: 'POST',
                        body: formData
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
    let defaultName = '新しいファイルビュー';

    // セクションタイプに応じた設定
    if (sectionType === 'notepad') {
        contentType = 'notepad';
        defaultName = 'メモ帳';
    } else if (sectionType === 'storage') {
        contentType = 'storage';
        defaultName = 'ストレージ';
    }

    // セクションタイプに応じた初期データを設定
    let contentData = { text: '' };
    if (sectionType === 'notepad') {
        contentData = { text: '' };
    } else if (sectionType === 'storage') {
        contentData = { storage_type: 'local', path: '', view_mode: 'list' };
    }

    const name = prompt('ファイルビュー名を入力してください（空白可）:', defaultName);
    if (name === null) return; // キャンセルされた場合

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
        <div class="context-menu-item" onclick="createNewSection('text', ${x}, ${y})">📝 ファイルビュー作成</div>
        <div class="context-menu-item" onclick="createNewSection('notepad', ${x}, ${y})">📒 メモ帳作成</div>
        <div class="context-menu-item" onclick="createNewSection('image', ${x}, ${y})">🖼️ 画像貼り付け</div>
        <div class="context-menu-item" onclick="createNewSection('storage', ${x}, ${y})">📁 ストレージ作成</div>
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

// ページ読み込み完了時の処理
document.addEventListener('DOMContentLoaded', () => {
    loadTabs();

    // テーマ適用
    const savedTheme = localStorage.getItem('theme');
    if (savedTheme === 'dark') {
        document.body.classList.add('dark-theme');
    }

    // テーマ切り替えボタン（設定モーダル内）
    const btnToggleTheme = document.getElementById('btnToggleTheme');
    if (btnToggleTheme) {
        btnToggleTheme.addEventListener('click', () => {
            document.body.classList.toggle('dark-theme');
            const isDark = document.body.classList.contains('dark-theme');
            localStorage.setItem('theme', isDark ? 'dark' : 'light');
        });
    }

    // ページ背景の右クリックイベント
    const pageContent = document.getElementById('pageContent');
    if (pageContent) {
        pageContent.addEventListener('contextmenu', showPageContextMenu);
    }
});

async function updateSectionContent(sectionId, contentType, value) {
    if (contentType === 'text') {
        const contentData = { text: value };
        await apiCall(`/api/sections/${sectionId}`, {
            method: 'PUT',
            body: JSON.stringify({ content_data: contentData })
        });
    } else if (contentType === 'memo') {
        await apiCall(`/api/sections/${sectionId}`, {
            method: 'PUT',
            body: JSON.stringify({ memo: value })
        });
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

async function deleteSection(sectionId) {
    if (!confirm('このファイルビューを削除しますか？')) return;

    try {
        await apiCall(`/api/sections/${sectionId}`, { method: 'DELETE' });

        // 削除成功後に状態を更新
        sections = sections.filter(s => s.id !== sectionId);
        renderPageContent();

        console.log(`Section ${sectionId} deleted successfully`);
    } catch (error) {
        console.error('Delete section failed:', error);
        // apiCall内でalertが表示されるので、ここでは何もしない
    }
}

function downloadFile(sectionId) {
    window.open(`/api/files/${sectionId}`, '_blank');
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
        const response = await fetch('/api/upload', {
            method: 'POST',
            body: formData
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
        const response = await fetch('/api/upload', {
            method: 'POST',
            body: formData
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
async function fetchSectionFiles(sectionId) {
    const listEl = document.getElementById(`file-list-${sectionId}`);
    if (!listEl) return;

    const section = sections.find(s => s.id === sectionId);
    if (!section) return;

    const data = typeof section.content_data === 'string'
        ? JSON.parse(section.content_data || '{}')
        : (section.content_data || {});
    const viewMode = data.view_mode || 'list';
    const sortOrder = data.sort_order || 'name_asc';

    try {
        const files = await apiCall(`/api/sections/${sectionId}/files`, { showAlert: false });

        // Sort files array based on sortOrder
        files.sort((a, b) => {
            if (a.is_directory !== b.is_directory) {
                return a.is_directory ? -1 : 1; // Always folders first
            }
            if (sortOrder === 'name_asc') {
                return a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' });
            } else if (sortOrder === 'name_desc') {
                return b.name.localeCompare(a.name, undefined, { numeric: true, sensitivity: 'base' });
            } else if (sortOrder === 'date_desc') {
                return new Date(b.updated_at) - new Date(a.updated_at);
            } else if (sortOrder === 'date_asc') {
                return new Date(a.updated_at) - new Date(b.updated_at);
            } else if (sortOrder === 'size_desc') {
                return b.size - a.size;
            } else if (sortOrder === 'size_asc') {
                return a.size - b.size;
            }
            return 0;
        });

        if (files.length === 0) {
            listEl.innerHTML = '<div style="padding: 10px; color: #999;" oncontextmenu="showEmptyContextMenu(event, ' + sectionId + ')">ファイルがありません</div>';
            return;
        }

        // ビューモードに応じたクラスを付与
        listEl.className = 'file-list ' + (viewMode === 'list' ? '' : viewMode);
        if (viewMode === 'list') listEl.classList.remove('grid', 'thumbnails', 'previews');
        else if (viewMode === 'grid') listEl.classList.add('grid');

        // コンテキストメニューを追加 (ストレージビュー切り替え)
        listEl.oncontextmenu = (e) => showStorageViewContextMenu(e, sectionId);

        listEl.innerHTML = files.map(item => {
            // フォルダの場合
            if (item.is_directory) {
                return `
                    <div class="file-item folder-item" 
                         data-section-id="${sectionId}"
                         data-filename="${escapeHtml(item.name)}"
                         data-is-folder="true"
                         title="${escapeHtml(item.name)}"
                         ondblclick="navigateToFolder(${sectionId}, '${escapeHtml(item.name)}')"
                         oncontextmenu="showFolderContextMenu(event, ${sectionId}, '${escapeHtml(item.name)}')">
                        <div class="file-icon">📁</div>
                        <div class="file-info">
                            <div class="file-name">${escapeHtml(item.name)}</div>
                            <div class="file-meta">フォルダ - ${new Date(item.updated_at).toLocaleString()}</div>
                        </div>
                    </div>
                `;
            }

            // ファイルの場合
            const isImage = /\.(jpg|jpeg|png|gif|webp)$/i.test(item.name);
            const downloadUrl = `/api/sections/${sectionId}/files/${encodeURIComponent(item.name)}`;

            let icon = '📄';
            if (isImage) icon = '🖼';
            else if (item.name.toLowerCase().endsWith('.pdf')) icon = '📕';
            else if (item.name.toLowerCase().endsWith('.zip')) icon = '📦';

            let previewHtml = '';
            if (viewMode === 'thumbnails' && isImage) {
                previewHtml = `<img src="${downloadUrl}" class="file-thumbnail" loading="lazy">`;
            } else if (viewMode === 'previews' && isImage) {
                previewHtml = `<div class="file-preview-content"><img src="${downloadUrl}" loading="lazy"></div>`;
            }

            return `
                <div class="file-item" 
                     draggable="true"
                     data-section-id="${sectionId}"
                     data-filename="${escapeHtml(item.name)}"
                     title="${escapeHtml(item.name)}"
                     onclick="showFilePreview(${sectionId}, '${escapeHtml(item.name)}')"
                     ondblclick="downloadStorageFile(${sectionId}, '${escapeHtml(item.name)}')"
                     oncontextmenu="showFileContextMenu(event, ${sectionId}, '${escapeHtml(item.name)}')"
                     ondragstart="handleFileDragStart(event, ${sectionId}, '${escapeHtml(item.name)}')">
                    ${previewHtml}
                    <div class="file-icon">${isImage && (viewMode === 'thumbnails' || viewMode === 'previews') ? '' : icon}</div>
                     <div class="file-info">
                        <div class="file-name">${escapeHtml(item.name)}</div>
                        <div class="file-meta">${formatFileSize(item.size)} - ${new Date(item.updated_at).toLocaleString()}</div>
                    </div>
                </div>
            `;
        }).join('');

    } catch (error) {
        listEl.innerHTML = `<div style="padding: 10px; color: red;">エラー: ${escapeHtml(error.message)}</div>`;
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
    const section = sections.find(s => s.id === sectionId);
    if (!section) return;

    const data = typeof section.content_data === 'string'
        ? JSON.parse(section.content_data || '{}')
        : (section.content_data || {});

    const currentPath = data.path || '';

    // フォルダ名を入力
    const folderName = prompt('新しいフォルダ名を入力してください:');
    if (!folderName || !folderName.trim()) return;

    try {
        // APIを使ってフォルダを作成
        await apiCall('/api/system/directories', {
            method: 'POST',
            body: JSON.stringify({
                path: currentPath,
                name: folderName.trim()
            })
        });

        // ファイルリストを再読み込み
        await fetchSectionFiles(sectionId);
    } catch (error) {
        alert('フォルダの作成に失敗しました: ' + error.message);
    }
}

// 「進む」が利用可能かチェック
function canNavigateForward(sectionId) {
    const navCtx = sectionNavigationHistory[sectionId];
    return navCtx && navCtx.currentIndex < navCtx.history.length - 1;
}

// 親フォルダに戻る
async function navigateToParentFolder(sectionId) {
    const section = sections.find(s => s.id === sectionId);
    if (!section) return;

    const data = typeof section.content_data === 'string'
        ? JSON.parse(section.content_data || '{}')
        : (section.content_data || {});

    const currentPath = data.path || '';

    // 履歴管理
    if (!sectionNavigationHistory[sectionId]) {
        sectionNavigationHistory[sectionId] = { history: [currentPath], currentIndex: 0 };
    }
    const navCtx = sectionNavigationHistory[sectionId];

    let targetPath;

    // 履歴があればそれを使う、なければパス文字列で推測
    if (navCtx.currentIndex > 0) {
        navCtx.currentIndex--;
        targetPath = navCtx.history[navCtx.currentIndex];
    } else {
        targetPath = currentPath.split('/').slice(0, -1).join('/');
        if (!targetPath || targetPath === currentPath) {
            alert('これ以上戻れません');
            return;
        }
        // 履歴を強制的に修正
        navCtx.history.unshift(targetPath);
        // currentIndexは0のままでOK (unshiftにより新しい要素が0番目になったため、現在位置は1になるべきだが、
        // 戻る操作中なので現在位置としてはtargetPath(0番目)になる)
        // いや、既存の履歴の先頭に追加したのであればcurrentIndexは0になった。
    }

    // セクションのパスを更新
    await updateSectionStorageConfig(sectionId, data.storage_type || 'local', targetPath);

    // ファイルリストを再読み込み
    await fetchSectionFiles(sectionId);
}

// 「進む」機能
async function navigateForwardFolder(sectionId) {
    if (!canNavigateForward(sectionId)) return;

    const section = sections.find(s => s.id === sectionId);
    if (!section) return;

    const data = typeof section.content_data === 'string'
        ? JSON.parse(section.content_data || '{}')
        : (section.content_data || {});

    const navCtx = sectionNavigationHistory[sectionId];
    navCtx.currentIndex++;
    const targetPath = navCtx.history[navCtx.currentIndex];

    // セクションのパスを更新
    await updateSectionStorageConfig(sectionId, data.storage_type || 'local', targetPath);

    // ファイルリストを再読み込み
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

    try {
        const data = typeof section.content_data === 'string' ? JSON.parse(section.content_data) : (section.content_data || {});
        data.view_mode = mode;

        await apiCall(`/api/sections/${sectionId}`, {
            method: 'PUT',
            body: JSON.stringify({
                content_data: data
            })
        });

        section.content_data = data;
        fetchSectionFiles(sectionId);

        // ヘッダーのアイコンを更新
        const toggleBtn = document.getElementById(`view-toggle-${sectionId}`);
        if (toggleBtn) {
            toggleBtn.innerHTML = getViewIcon(mode);
        }
    } catch (error) {
        console.error('Update view mode error:', error);
    }
}

async function updateSectionSortOrder(sectionId, sortOrder) {
    const section = sections.find(s => s.id === sectionId);
    if (!section) return;

    try {
        const data = typeof section.content_data === 'string' ? JSON.parse(section.content_data) : (section.content_data || {});
        data.sort_order = sortOrder;

        await apiCall(`/api/sections/${sectionId}`, {
            method: 'PUT',
            body: JSON.stringify({
                content_data: data
            })
        });

        section.content_data = data;
        fetchSectionFiles(sectionId);
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
    const formData = new FormData();
    formData.append('file', file);

    try {
        const response = await fetch(`/api/sections/${sectionId}/files`, {
            method: 'POST',
            body: formData
        });

        if (!response.ok) throw new Error('Upload failed');

        await fetchSectionFiles(sectionId); // リロード
    } catch (error) {
        console.error('Upload error:', error);
        alert('アップロードに失敗しました: ' + error.message);
    }
}

function downloadStorageFile(sectionId, filename) {
    window.open(`/api/sections/${sectionId}/files/${encodeURIComponent(filename)}?download=1`, '_blank');
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
        const response = await fetch(`/api/sections/${sourceSectionId}/files/${encodeURIComponent(filename)}/move`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ target_section_id: targetSectionId })
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

    const downloadUrl = `${window.location.origin}/api/sections/${sectionId}/files/${encodeURIComponent(filename)}`;
    const isZipFile = filename.toLowerCase().endsWith('.zip');

    let menuItems = `
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
        const response = await fetch(`/api/sections/${clipboardFile.sectionId}/files/${encodeURIComponent(clipboardFile.filename)}/copy`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ target_section_id: targetSectionId })
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
        const response = await fetch(`/api/sections/${sectionId}/files/${encodeURIComponent(filename)}/extract`, {
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
function configureSection(sectionId) {
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
    const currentStorageType = currentData.storage_type || 'local';
    const currentPath = currentData.path || '';

    // モーダルに値をセット
    document.getElementById('editingSectionId').value = sectionId;
    document.getElementById('sectionNameInput').value = section.name || '';
    document.getElementById('sectionStorageType').value = currentStorageType;
    document.getElementById('sectionStoragePath').value = currentPath;

    // モーダルを表示
    showModal('modalSectionSettings');
}



// フォルダ参照ボタン
function openDirectoryBrowser() {
    const currentPathInput = document.getElementById('sectionStoragePath').value;
    // 現在のパスがあればそこから、なければホームディレクトリから開始
    loadDirectory(currentPathInput || '');
    showModal('modalDirectoryBrowser');
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


// ディレクトリブラウザのイベント設定
document.addEventListener('DOMContentLoaded', () => {
    // 既存のDOMContentLoadedに追加するためのコード片。
    // 実際の実装では下部のDOMContentLoaded内に追加する形になりますが、
    // ここでは置換で見通しを良くするため関数として定義し、後で呼び出します。
});

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
                const response = await fetch('/api/system/cloud-storage-paths');
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
        const storageType = document.getElementById('sectionStorageType').value;
        const path = document.getElementById('sectionStoragePath').value.trim();

        if (!path) {
            alert('フォルダパスを入力してください');
            return;
        }

        const updateData = {
            name: name,
            content_type: 'storage',
            content_data: {
                storage_type: storageType,
                path: path
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
            section.content_data = updateData.content_data;
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

    document.getElementById('btnBrowseSectionPath').onclick = () => openDirectoryBrowser();

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
async function loadSubscriptionStatus() {
    try {
        // user/status API は要認証なので、初期化前などに呼ばれた場合は無視される実装とする
        const response = await fetch('/api/user/status');
        if (response.status === 401 || response.status === 403) return; // 未ログイン
        if (!response.ok) return;

        const data = await response.json();

        // App Lock判定
        if (data.is_locked) {
            document.getElementById('modalAppLock').style.display = 'flex';
            document.getElementById('btnSubscribeNow').href = data.payment_link;
            return; // ロック状態ならこれ以上何もしない
        }

        // 設定モーダルの表示内容を更新
        const container = document.getElementById('subscriptionStatusContainer');
        if (!container) return;

        let html = '';
        if (data.subscription_status === 'trialing') {
            html += `<p style="font-weight: bold; color: #f0ad4e;">無料トライアル中 (残り ${data.trial_days_left} 日)</p>`;
            html += `<p style="font-size: 13px; color: #666; margin-top: 4px;">トライアル終了日: ${new Date(data.trial_end).toLocaleDateString()}</p>`;
            html += `<a href="${data.payment_link}" target="_blank" class="btn-primary" style="display: inline-block; margin-top: 15px; text-decoration: none;">サブスクリプションを登録する</a>`;
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
            html += `<a href="${data.payment_link}" target="_blank" class="btn-primary" style="display: inline-block; margin-top: 15px; text-decoration: none;">再開する</a>`;
        }

        container.innerHTML = html;

    } catch (error) {
        console.error('Failed to load subscription status:', error);
    }
}

async function cancelSubscription() {
    if (!confirm('本当にサブスクリプションを退会しますか？\\n（次回の更新日までは引き続き利用可能です）')) return;

    try {
        const response = await fetch('/api/user/cancel-subscription', { method: 'POST' });
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

// イベントリスナー
document.addEventListener('DOMContentLoaded', () => {
    // 起動直後にサブスクリプション状態を取得し、必要なら画面をロック
    loadSubscriptionStatus();

    // タブ作成
    const btnNewTab = document.getElementById('btnNewTab');
    if (btnNewTab) {
        btnNewTab.onclick = () => showModal('modalNewTab');
    }
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

    // ページ作成
    document.getElementById('btnCreatePage').onclick = () => {
        const name = document.getElementById('newPageName').value.trim();
        if (name) {
            createPage(name);
        }
    };
    document.getElementById('closeNewPage').onclick = () => hideModal('modalNewPage');
    document.getElementById('btnCancelPage').onclick = () => hideModal('modalNewPage');

    // 設定
    // 設定を開いた時に最新の情報を表示
    const btnSettings = document.getElementById('btnSettings');
    if (btnSettings) {
        btnSettings.onclick = () => {
            loadSubscriptionStatus();
            showModal('modalSettings');
        };
    }

    // 設定内のテーマ切替ボタン
    const btnToggleThemeInSettings = document.getElementById('btnToggleThemeInSettings');
    if (btnToggleThemeInSettings) {
        btnToggleThemeInSettings.onclick = () => {
            document.body.classList.toggle('dark-theme');
            const isDark = document.body.classList.contains('dark-theme');
            localStorage.setItem('theme', isDark ? 'dark' : 'light');
        };
    }
    const closeSettings = document.getElementById('closeSettings');
    if (closeSettings) {
        closeSettings.onclick = () => hideModal('modalSettings');
    }

    // ストレージ追加 (廃止)
    /*
    document.getElementById('btnAddStorage').onclick = () => showModal('modalAddStorage');
    document.getElementById('btnSaveStorage').onclick = () => {
        const name = document.getElementById('storageName').value.trim();
        const type = document.getElementById('storageType').value;
        const path = document.getElementById('storagePath').value.trim();
        if (name && path) {
            createStorageLocation(name, type, path);
        } else {
            alert('名前とパスを入力してください');
        }
    };
    document.getElementById('closeAddStorage').onclick = () => hideModal('modalAddStorage');
    document.getElementById('btnCancelStorage').onclick = () => hideModal('modalAddStorage');
    */

    // Enterキーでモーダルを閉じる
    document.getElementById('newTabName').addEventListener('keypress', (e) => {
        if (e.key === 'Enter') document.getElementById('btnCreateTab').click();
    });
    document.getElementById('newPageName').addEventListener('keypress', (e) => {
        if (e.key === 'Enter') document.getElementById('btnCreatePage').click();
    });

    // 初期化
    setupDirectoryBrowserEvents();
    initSidebarToggle();
    loadTabs();

    // メモ欄表示切替の初期化
    const memoToggle = document.getElementById('toggleMemoField');
    const savedMemoVisible = localStorage.getItem('showMemoField');

    // 初期状態の設定（デフォルトはtrue）
    if (savedMemoVisible === 'false') {
        memoToggle.checked = false;
        document.body.classList.add('hide-memo-fields');
    }

    // トグル変更時の処理
    memoToggle.addEventListener('change', (e) => {
        const showMemo = e.target.checked;
        localStorage.setItem('showMemoField', showMemo);

        if (showMemo) {
            document.body.classList.remove('hide-memo-fields');
        } else {
            document.body.classList.add('hide-memo-fields');
        }
    });
});

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

function showFilePreview(sectionId, filename) {
    const panel = document.getElementById('filePreviewPanel');
    const content = document.getElementById('previewContent');
    const fileNameEl = document.getElementById('previewFileName');

    // 同じファイルをクリックした場合はプレビューを閉じる
    if (currentPreviewFile && currentPreviewFile.sectionId === sectionId && currentPreviewFile.filename === filename) {
        closeFilePreview();
        return;
    }

    // 現在のプレビューファイルを記録
    currentPreviewFile = { sectionId, filename };

    const downloadUrl = `${window.location.origin}/api/sections/${sectionId}/files/${encodeURIComponent(filename)}`;
    const ext = filename.toLowerCase().split('.').pop();

    fileNameEl.textContent = filename;

    // ファイルタイプに応じてプレビューを生成
    if (['jpg', 'jpeg', 'png', 'gif', 'bmp', 'webp', 'svg'].includes(ext)) {
        content.innerHTML = `<img src="${downloadUrl}" style="max-width: 100%; max-height: 100%; object-fit: contain;">`;
    } else if (['mp4', 'webm', 'ogg'].includes(ext)) {
        content.innerHTML = `<video controls style="max-width: 100%; max-height: 100%;"><source src="${downloadUrl}"></video>`;
    } else if (['mp3', 'wav', 'ogg'].includes(ext)) {
        content.innerHTML = `<audio controls style="width: 100%;"><source src="${downloadUrl}"></audio>`;
    } else if (ext === 'pdf') {
        content.innerHTML = `<iframe src="${downloadUrl}" style="width: 100%; height: 100%; border: none;"></iframe>`;
    } else if (['txt', 'md', 'json', 'js', 'css', 'html', 'xml', 'csv'].includes(ext)) {
        fetch(downloadUrl)
            .then(r => r.text())
            .then(text => {
                content.innerHTML = `<pre style="padding: 20px; overflow: auto; height: 100%;">${escapeHtml(text)}</pre>`;
            });
    } else {
        content.innerHTML = `<div class="preview-placeholder">このファイル形式はプレビューできません<br><br><a href="${downloadUrl}" download>ダウンロード</a></div>`;
    }

    panel.classList.add('active');
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
