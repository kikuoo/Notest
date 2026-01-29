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
        const response = await fetch(url, {
            headers: {
                'Content-Type': 'application/json',
                ...options.headers
        },
        ...options
    });
    if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
    }
    return await response.json();
    } catch (error) {
        console.error('API call failed:', error);
        alert('エラーが発生しました: ' + error.message);
        throw error;
    }
}

// タブ関連
async function loadTabs() {
    tabs = await apiCall('/api/tabs');
    renderTabs();
}

async function createTab(name) {
    const tab = await apiCall('/api/tabs', {
        method: 'POST',
        body: JSON.stringify({ name, order_index: tabs.length })
    });
    tabs.push(tab);
    renderTabs();
    selectTab(tab.id);
}

async function deleteTab(tabId) {
    if (!confirm('このタブを削除しますか？')) return;
    await apiCall(`/api/tabs/${tabId}`, { method: 'DELETE' });
    tabs = tabs.filter(t => t.id !== tabId);
    if (currentTabId === tabId) {
        currentTabId = null;
        currentPageId = null;
        renderPageContent();
    }
    renderTabs();
}

function renderTabs() {
    const tabsList = document.getElementById('tabsList');
    tabsList.innerHTML = '';
    tabs.forEach(tab => {
        const tabItem = document.createElement('div');
        tabItem.className = `tab-item ${currentTabId === tab.id ? 'active' : ''}`;
        tabItem.innerHTML = `
            <span class="tab-item-name">${escapeHtml(tab.name)}</span>
            <button class="tab-item-delete" onclick="deleteTab(${tab.id})">×</button>
        `;
        tabItem.onclick = () => selectTab(tab.id);
        tabsList.appendChild(tabItem);
    });
}

function selectTab(tabId) {
    currentTabId = tabId;
    const tab = tabs.find(t => t.id === tabId);
    if (!tab) return;
    
    renderPageTabs(tab.pages);
    if (tab.pages.length > 0) {
        selectPage(tab.pages[0].id);
    } else {
        currentPageId = null;
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
    await apiCall(`/api/pages/${pageId}`, { method: 'DELETE' });
    const tab = tabs.find(t => t.id === currentTabId);
    if (tab) {
        tab.pages = tab.pages.filter(p => p.id !== pageId);
        renderPageTabs(tab.pages);
        if (currentPageId === pageId) {
            currentPageId = null;
            renderPageContent();
        }
    }
}

async function selectPage(pageId) {
    currentPageId = pageId;
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
    const addSectionBtn = document.createElement('button');
    addSectionBtn.className = 'btn-primary';
    addSectionBtn.style.position = 'absolute';
    addSectionBtn.style.top = '20px';
    addSectionBtn.style.right = '20px';
    addSectionBtn.style.zIndex = '10000';
    addSectionBtn.textContent = '+ セクション';
    addSectionBtn.onclick = () => createNewSection();
    pageContent.appendChild(addSectionBtn);
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
        <div class="section-header">
            <span class="section-title">${escapeHtml(section.name || 'セクション')}</span>
            <div class="section-controls">
                <button class="section-btn" onclick="changeSectionType(${section.id})">タイプ変更</button>
                <button class="section-btn" onclick="deleteSection(${section.id})">削除</button>
            </div>
        </div>
        <div class="section-content" data-section-id="${section.id}">
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
                    <div style="margin-top: 5px; font-size: 12px; color: #0078d4;">クリックしてダウンロード</div>
                </div>
            `;
        default:
            return '<p>不明なコンテンツタイプ</p>';
    }
}

async function createNewSection() {
    if (!currentPageId) return;
    
    const name = prompt('セクション名を入力してください（空白可）:');
    const section = await apiCall('/api/sections', {
        method: 'POST',
        body: JSON.stringify({
            page_id: currentPageId,
            name: name || null,
            content_type: 'text',
            content_data: { text: '' },
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
    let contentData = {};
    if (contentType === 'text') {
        contentData = { text: value };
    }
    
    await apiCall(`/api/sections/${sectionId}`, {
        method: 'PUT',
        body: JSON.stringify({
            content_data: contentData
        })
    });
}

async function changeSectionType(sectionId) {
    const section = sections.find(s => s.id === sectionId);
    if (!section) return;
    
    const type = prompt('コンテンツタイプを選択:\n1. text\n2. link\n3. file', section.content_type);
    if (!type || !['text', 'link', 'file'].includes(type)) return;
    
    let contentData = {};
    if (type === 'link') {
        const url = prompt('URLを入力:');
        const title = prompt('タイトルを入力（空白可）:');
        if (!url) return;
        contentData = { url, title: title || url };
    } else if (type === 'text') {
        contentData = { text: '' };
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
    await apiCall(`/api/sections/${sectionId}`, { method: 'DELETE' });
    sections = sections.filter(s => s.id !== sectionId);
    renderPageContent();
}

function downloadFile(sectionId) {
    window.location.href = `/api/files/${sectionId}`;
}

// ドラッグアンドドロップ
function makeDraggable(element, section) {
    const header = element.querySelector('.section-header');
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
        const newY = initialY + dy;
        
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
            const newY = rect.top - pageRect.top;
            
            await updateSectionPosition(section.id, newX, newY, rect.width, rect.height);
        }
    });
    
    // リサイズの監視
    const resizeObserver = new ResizeObserver(async (entries) => {
        for (const entry of entries) {
            const rect = entry.target.getBoundingClientRect();
            const pageRect = document.getElementById('pageContent').getBoundingClientRect();
            const newX = rect.left - pageRect.left;
            const newY = rect.top - pageRect.top;
            await updateSectionPosition(section.id, newX, newY, rect.width, rect.height);
        }
    });
    resizeObserver.observe(element);
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
        if (files.length > 0) {
            await uploadFileToSection(files[0], sectionId);
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
    loadTabs();
});
