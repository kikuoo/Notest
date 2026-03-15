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
        const newPositionX = clipboardSection.position_x + 20;
        const newPositionY = clipboardSection.position_y + 20;

        const response = await apiCall(`/api/pages/${currentPageId}/sections`, {
            method: 'POST',
            body: JSON.stringify({
                name: clipboardSection.name,
                content_type: clipboardSection.content_type,
                content_data: clipboardSection.content_data,
                memo: clipboardSection.memo,
                position_x: newPositionX,
                position_y: newPositionY,
                width: clipboardSection.width,
                height: clipboardSection.height
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
