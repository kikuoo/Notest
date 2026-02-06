// グローバル変数
let currentTabId = null;
let currentPageId = null;
let tabs = [];
let storageLocations = [];
let sections = [];
let draggedSection = null;
let sectionZIndex = 1000;

// API呼び出し関数
async function apiCall(url, options = {}) {
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
        alert('エラーが発生しました: ' + error.message);
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
    addSectionBtn.title = 'セクションを追加';
    addSectionBtn.onclick = (e) => {
        e.stopPropagation();
        toggleSectionDropdown();
    };

    const dropdown = document.createElement('div');
    dropdown.className = 'section-dropdown';
    dropdown.id = 'sectionDropdown';
    dropdown.innerHTML = `
        <div class="dropdown-item" onclick="createNewSection('text')">
            <span class="dropdown-icon">📝</span>
            <span>セクション（通常）</span>
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

function createSectionElement(section) {
    const sectionEl = document.createElement('div');
    sectionEl.className = 'section';
    sectionEl.id = `section-${section.id}`;
    sectionEl.style.left = `${section.position_x}px`;
    sectionEl.style.top = `${section.position_y}px`;
    sectionEl.style.width = `${section.width}px`;
    sectionEl.style.height = `${section.height}px`;
    sectionEl.style.zIndex = sectionZIndex++;

    sectionEl.innerHTML = `
        ${section.content_type === 'notepad' || section.content_type === 'image' ? `
            <div class="section-header notepad-header" oncontextmenu="showSectionContextMenu(event, ${section.id})">
                <span class="section-title" title="${escapeHtml(section.name || 'メモ帳')}">${escapeHtml(section.name || 'メモ帳')}</span>
                <button class="section-btn-icon" onclick="configureSection(${section.id})" title="設定">⚙️</button>
            </div>
        ` : `
            <div class="section-header" oncontextmenu="showSectionContextMenu(event, ${section.id})">
                <span class="section-title" title="${escapeHtml(section.name || 'セクション')}">${escapeHtml(section.name || 'セクション')}</span>
                <div class="section-controls">
                    ${section.content_type === 'storage' ? `<button class="section-btn-icon" id="view-toggle-${section.id}" onclick="cycleSectionViewMode(${section.id})" title="表示切替">${getViewIcon(section.content_data?.view_mode || 'list')}</button>` : ''}
                    <button class="section-btn-icon" onclick="configureSection(${section.id})" title="設定">⚙️</button>
                </div>
            </div>
            <div class="section-memo">
                <textarea placeholder="メモ..." onchange="updateSectionContent(${section.id}, 'memo', this.value)">${escapeHtml(section.memo || '')}</textarea>
            </div>
        `}
        <div class="section-content ${section.content_type === 'notepad' || section.content_type === 'image' ? 'full-height' : ''}" data-section-id="${section.id}">
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
                    <div class="file-list" id="file-list-${section.id}">
                        <div style="padding: 10px; color: #666;">読み込み中...</div>
                    </div>
                </div>
            `;
            const style = `
                background-color: ${data.bgColor || '#fffef7'};
                font-family: ${data.fontFamily || "'Segoe UI', Tahoma, Geneva, Verdana, sans-serif"};
                font-size: ${data.fontSize || '14px'};
                color: ${data.fontColor || '#333333'};
            `;
            return `
                <textarea class="notepad-content" 
                    style="${style}"
                    placeholder="ここにメモを入力してください..."
                    onchange="updateSectionContent(${section.id}, 'notepad', this.value)">${escapeHtml(data.text || '')}</textarea>
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

async function createNewSection(sectionType = 'text') {
    if (!currentPageId) return;

    // ドロップダウンを閉じる
    const dropdown = document.getElementById('sectionDropdown');
    if (dropdown) {
        dropdown.classList.remove('show');
    }

    let contentType = 'text';
    let defaultName = '新しいセクション';

    // セクションタイプに応じた設定
    if (sectionType === 'notepad') {
        contentType = 'notepad';
        defaultName = 'メモ帳';
    } else if (sectionType === 'image') {
        contentType = 'image';
        defaultName = '画像';
    }


    // セクションタイプに応じた初期データを設定
    let contentData = { text: '' };
    if (sectionType === 'notepad') {
        contentData = { text: '' };
    } else if (sectionType === 'image') {
        contentData = { image_url: '' };
    }

    const name = prompt('セクション名を入力してください（空白可）:', defaultName);
    if (name === null) return; // キャンセルされた場合

    const section = await apiCall('/api/sections', {
        method: 'POST',
        body: JSON.stringify({
            page_id: currentPageId,
            name: name || defaultName,
            content_type: contentType,
            content_data: contentData,
            position_x: 50,
            position_y: 50,
            width: 300,
            height: 200
        })
    });
    sections.push(section);
    renderPageContent();
}

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
    if (!confirm('このセクションを削除しますか？')) return;

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
            if (section && section.content_type === 'storage') {
                // Storageセクションの場合は、そのディレクトリにアップロード
                // 複数ファイルのアップロードに対応
                for (let i = 0; i < files.length; i++) {
                    await uploadFileToStorage(sectionId, files[i]);
                }
            } else {
                // 通常のセクションの場合は、既存の動作（セクションをファイルタイプに変換）
                await uploadFileToSection(files[0], sectionId);
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

    try {
        const files = await apiCall(`/api/sections/${sectionId}/files`);

        if (files.length === 0) {
            listEl.innerHTML = '<div style="padding: 10px; color: #999;" oncontextmenu="showEmptyContextMenu(event, ' + sectionId + ')">ファイルがありません</div>';
            return;
        }

        // ビューモードに応じたクラスを付与
        listEl.className = 'file-list ' + (viewMode === 'list' ? '' : viewMode);
        if (viewMode === 'list') listEl.classList.remove('grid', 'thumbnails', 'previews');
        else if (viewMode === 'grid') listEl.classList.add('grid');

        listEl.innerHTML = files.map(file => {
            const isImage = /\.(jpg|jpeg|png|gif|webp)$/i.test(file.name);
            const downloadUrl = `/api/sections/${sectionId}/files/${encodeURIComponent(file.name)}`;

            let icon = '📄';
            if (isImage) icon = '🖼';
            else if (file.name.toLowerCase().endsWith('.pdf')) icon = '📕';
            else if (file.name.toLowerCase().endsWith('.zip')) icon = '📦';

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
                     data-filename="${escapeHtml(file.name)}"
                     title="${escapeHtml(file.name)}"
                     onclick="showFilePreview(${sectionId}, '${escapeHtml(file.name)}')"
                     ondblclick="downloadStorageFile(${sectionId}, '${escapeHtml(file.name)}')"
                     oncontextmenu="showFileContextMenu(event, ${sectionId}, '${escapeHtml(file.name)}')"
                     ondragstart="handleFileDragStart(event, ${sectionId}, '${escapeHtml(file.name)}')">
                    ${previewHtml}
                    <div class="file-icon">${isImage && (viewMode === 'thumbnails' || viewMode === 'previews') ? '' : icon}</div>
                    <div class="file-info">
                        <div class="file-name">${escapeHtml(file.name)}</div>
                        <div class="file-meta">${formatFileSize(file.size)} - ${new Date(file.updated_at).toLocaleString()}</div>
                    </div>
                </div>
            `;
        }).join('');

    } catch (error) {
        listEl.innerHTML = `<div style="padding: 10px; color: red;">エラー: ${escapeHtml(error.message)}</div>`;
    }
}

// ビューモードのアイコンを取得
function getViewIcon(mode) {
    const icons = {
        'list': '📋',
        'grid': '🗂️',
        'thumbnails': '🖼️',
        'previews': '👁️'
    };
    return icons[mode] || icons['list'];
}

// ビューモードを切り替え
function cycleSectionViewMode(sectionId) {
    const section = sections.find(s => s.id === sectionId);
    if (!section) return;

    const modes = ['list', 'card', 'thumbnail', 'preview'];
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
    window.open(`/api/sections/${sectionId}/files/${encodeURIComponent(filename)}`, '_blank');
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

// コンテキストメニュー
let contextMenu = null;

function showContextMenu(e, sectionId, filename) {
    e.preventDefault();
    hideContextMenu();

    contextMenu = document.createElement('div');
    contextMenu.className = 'context-menu';
    contextMenu.style.left = `${e.clientX}px`;
    contextMenu.style.top = `${e.clientY}px`;

    contextMenu.innerHTML = `
        <div class="context-menu-item delete" onclick="deleteStorageFileAndHide(${sectionId}, '${escapeHtml(filename)}')">削除</div>
    `;

    document.body.appendChild(contextMenu);

    // クリックでメニューを閉じるイベントを追加 (一度だけ)
    setTimeout(() => {
        document.addEventListener('click', hideContextMenu, { once: true });
    }, 0);
}

function hideContextMenu() {
    if (contextMenu) {
        contextMenu.remove();
        contextMenu = null;
    }
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
    hideContextMenu();

    contextMenu = document.createElement('div');
    contextMenu.className = 'context-menu';
    contextMenu.style.left = `${e.clientX}px`;
    contextMenu.style.top = `${e.clientY}px`;

    const downloadUrl = `${window.location.origin}/api/sections/${sectionId}/files/${encodeURIComponent(filename)}`;
    const isZipFile = filename.toLowerCase().endsWith('.zip');

    let menuItems = `
        <div class="context-menu-item" onclick="copyFile(${sectionId}, '${escapeHtml(filename)}')">📋 コピー</div>
        <div class="context-menu-item" onclick="cutFile(${sectionId}, '${escapeHtml(filename)}')">✂️ 切り取り</div>
    `;


    // 貼り付けは常に表示（クリップボードが空の場合は無効化）
    menuItems += `<div class="context-menu-item" onclick="pasteFile(${sectionId})" ${!clipboardFile ? 'style="opacity: 0.5; pointer-events: none;"' : ''}>📄 貼り付け</div>`;

    menuItems += `
        <div class="context-menu-item" onclick="shareFile('${downloadUrl}', '${escapeHtml(filename)}')">🔗 共有</div>
        <div class="context-menu-item" onclick="downloadStorageFile(${sectionId}, '${escapeHtml(filename)}'); hideContextMenu();">📥 ダウンロード</div>
    `;

    // ZIPファイルの場合は解凍オプションを追加
    if (isZipFile) {
        menuItems += `<div class="context-menu-item" onclick="extractZipFile(${sectionId}, '${escapeHtml(filename)}')">📦 解凍</div>`;
    }

    menuItems += `<div class="context-menu-item delete" onclick="deleteStorageFileAndHide(${sectionId}, '${escapeHtml(filename)}')">🗑️ 削除</div>`;

    contextMenu.innerHTML = menuItems;

    document.body.appendChild(contextMenu);

    setTimeout(() => {
        document.addEventListener('click', hideContextMenu, { once: true });
    }, 0);
}

function copyFileLink(url) {
    navigator.clipboard.writeText(url).then(() => {
        alert('リンクをコピーしました');
        hideContextMenu();
    }).catch(err => {
        console.error('Copy failed:', err);
        alert('コピーに失敗しました');
    });
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

// 空のファイルリスト用コンテキストメニュー
function showEmptyContextMenu(e, sectionId) {
    e.preventDefault();
    hideContextMenu();

    contextMenu = document.createElement('div');
    contextMenu.className = 'context-menu';
    contextMenu.style.left = `${e.clientX}px`;
    contextMenu.style.top = `${e.clientY}px`;

    let menuItems = '';

    // 貼り付けのみ表示
    if (clipboardFile) {
        menuItems += `<div class="context-menu-item" onclick="pasteFile(${sectionId})">📄 貼り付け</div>`;
    } else {
        menuItems += `<div class="context-menu-item" style="opacity: 0.5; pointer-events: none;">📄 貼り付け</div>`;
    }

    contextMenu.innerHTML = menuItems;

    document.body.appendChild(contextMenu);

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
    const currentType = section.content_type || 'text';
    const currentStorageType = currentData.storage_type || 'local';
    const currentPath = currentData.path || '';

    // モーダルに値をセット
    document.getElementById('editingSectionId').value = sectionId;
    document.getElementById('sectionNameInput').value = section.name || '';
    document.getElementById('sectionContentType').value = currentType;
    document.getElementById('sectionStorageType').value = currentStorageType;
    document.getElementById('sectionStoragePath').value = currentPath;

    // ストレージ設定の表示制御
    toggleStorageSettings(currentType);

    // モーダルを表示
    showModal('modalSectionSettings');
}

function toggleStorageSettings(type) {
    const storageSettings = document.getElementById('storageSettingsGroup');
    if (type === 'storage') {
        storageSettings.style.display = 'block';
    } else {
        storageSettings.style.display = 'none';
    }
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
            listEl.innerHTML = data.directories.map(dir => `
                <div class="directory-item" onclick="loadDirectory('${escapeHtml(data.current_path)}/${escapeHtml(dir)}')">
                     📁 ${escapeHtml(dir)}
                </div>
            `).join('');
        }
    } catch (error) {
        listEl.innerHTML = `<div style="padding: 10px; color: red;">エラー: ${escapeHtml(error.message)}</div>`;
        pathEl.textContent = 'エラー';
    }
}

// ディレクトリブラウザのイベント設定
document.addEventListener('DOMContentLoaded', () => {
    // 既存のDOMContentLoadedに追加するためのコード片。
    // 実際の実装では下部のDOMContentLoaded内に追加する形になりますが、
    // ここでは置換で見通しを良くするため関数として定義し、後で呼び出します。
});

function setupDirectoryBrowserEvents() {
    // セクション設定モーダル
    document.getElementById('closeSectionSettings').onclick = () => hideModal('modalSectionSettings');
    document.getElementById('btnCancelSectionSettings').onclick = () => hideModal('modalSectionSettings');

    // タイプ変更時の表示切り替え
    document.getElementById('sectionContentType').onchange = (e) => {
        toggleStorageSettings(e.target.value);
    };

    // セクション保存
    document.getElementById('btnSaveSectionSettings').onclick = async () => {
        const sectionId = parseInt(document.getElementById('editingSectionId').value);
        const name = document.getElementById('sectionNameInput').value.trim();
        const contentType = document.getElementById('sectionContentType').value;
        const storageType = document.getElementById('sectionStorageType').value;
        const path = document.getElementById('sectionStoragePath').value.trim();

        const updateData = {
            name: name,
            content_type: contentType,
            content_data: {}
        };

        const section = sections.find(s => s.id === sectionId);
        // コンテンツタイプに応じたデータをセット
        if (contentType === 'storage') {
            if (!path) {
                alert('フォルダパスを入力してください');
                return;
            }
            updateData.content_data = {
                storage_type: storageType,
                path: path
            };
        } else if (contentType === 'text') {
            if (section.content_type === 'text') {
                updateData.content_data = section.content_data;
            } else {
                updateData.content_data = { text: '' };
            }
        } else if (contentType === 'link') {
            if (section.content_type === 'link') {
                updateData.content_data = section.content_data;
            } else {
                updateData.content_data = { url: '#', title: 'New Link' };
            }
        }

        await apiCall(`/api/sections/${sectionId}`, {
            method: 'PUT',
            body: JSON.stringify(updateData)
        });

        // ローカルデータ更新して再描画
        if (section) {
            section.name = name;
            section.content_type = contentType;
            section.content_data = updateData.content_data;
        }
        hideModal('modalSectionSettings');
        renderPageContent(); // 再描画

        // ストレージタイプの場合はファイルを読み込む
        if (contentType === 'storage') {
            await fetchSectionFiles(sectionId);
        }
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
        const selectedPath = document.getElementById('currentBrowsePath').dataset.path;
        if (selectedPath) {
            document.getElementById('sectionStoragePath').value = selectedPath;
            hideModal('modalDirectoryBrowser');
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
    document.getElementById(modalId).classList.add('active');
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

// イベントリスナー
document.addEventListener('DOMContentLoaded', () => {
    // タブ作成
    document.getElementById('btnNewTab').onclick = () => showModal('modalNewTab');
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
    document.getElementById('btnSettings').onclick = () => {
        loadStorageLocations();
        showModal('modalSettings');
    };
    document.getElementById('closeSettings').onclick = () => hideModal('modalSettings');

    // ストレージ追加
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

    // Enterキーでモーダルを閉じる
    document.getElementById('newTabName').addEventListener('keypress', (e) => {
        if (e.key === 'Enter') document.getElementById('btnCreateTab').click();
    });
    document.getElementById('newPageName').addEventListener('keypress', (e) => {
        if (e.key === 'Enter') document.getElementById('btnCreatePage').click();
    });

    // 初期化
    setupDirectoryBrowserEvents();
    loadTabs();
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
