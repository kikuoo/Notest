// メモ帳設定機能

// メモ帳設定モーダルを開く
function openNotepadSettings(sectionId) {
    const section = sections.find(s => s.id === sectionId);
    if (!section) return;

    const modal = document.getElementById('modalNotepadSettings');
    if (!modal) {
        // モーダルが存在しない場合は作成
        createNotepadSettingsModal();
    }

    // 現在の設定を読み込む
    const settings = section.content_data || {};
    document.getElementById('notepadTitleInput').value = section.name || 'メモ帳';
    document.getElementById('notepadBgColor').value = settings.bgColor || '#fffef7';
    document.getElementById('notepadBgColorValue').textContent = settings.bgColor || '#fffef7';
    document.getElementById('notepadFontFamily').value = settings.fontFamily || "'Segoe UI', Tahoma, Geneva, Verdana, sans-serif";
    document.getElementById('notepadFontSize').value = settings.fontSize || '14px';
    document.getElementById('notepadFontColor').value = settings.fontColor || '#333333';
    document.getElementById('notepadFontColorValue').textContent = settings.fontColor || '#333333';
    document.getElementById('editingNotepadId').value = sectionId;

    document.getElementById('modalNotepadSettings').style.display = 'block';
}

// メモ帳設定モーダルHTMLを作成
function createNotepadSettingsModal() {
    const modalHTML = `
        <div class="modal" id="modalNotepadSettings">
            <div class="modal-content">
                <span class="close" id="closeNotepadSettings">&times;</span>
                <h2>メモ帳設定</h2>
                <div class="form-group">
                    <label>タイトル:</label>
                    <input type="text" id="notepadTitleInput" placeholder="メモ帳のタイトル">
                </div>
                <div class="form-group">
                    <label>背景色:</label>
                    <div style="display: flex; gap: 10px; align-items: center;">
                        <input type="color" id="notepadBgColor" value="#fffef7">
                        <span id="notepadBgColorValue">#fffef7</span>
                    </div>
                </div>
                <div class="form-group">
                    <label>フォント:</label>
                    <select id="notepadFontFamily">
                        <option value="'Segoe UI', Tahoma, Geneva, Verdana, sans-serif">Segoe UI</option>
                        <option value="'Arial', sans-serif">Arial</option>
                        <option value="'Times New Roman', serif">Times New Roman</option>
                        <option value="'Courier New', monospace">Courier New</option>
                        <option value="'Georgia', serif">Georgia</option>
                        <option value="'Meiryo', sans-serif">メイリオ</option>
                        <option value="'MS Gothic', monospace">MS ゴシック</option>
                        <option value="'Yu Gothic', sans-serif">游ゴシック</option>
                    </select>
                </div>
                <div class="form-group">
                    <label>フォントサイズ:</label>
                    <select id="notepadFontSize">
                        <option value="12px">12px</option>
                        <option value="14px" selected>14px</option>
                        <option value="16px">16px</option>
                        <option value="18px">18px</option>
                        <option value="20px">20px</option>
                        <option value="24px">24px</option>
                    </select>
                </div>
                <div class="form-group">
                    <label>フォント色:</label>
                    <div style="display: flex; gap: 10px; align-items: center;">
                        <input type="color" id="notepadFontColor" value="#333333">
                        <span id="notepadFontColorValue">#333333</span>
                    </div>
                </div>

                <input type="hidden" id="editingNotepadId">

                <div class="modal-actions">
                    <button class="btn-primary" id="btnSaveNotepadSettings">保存</button>
                    <button class="btn-secondary" id="btnCancelNotepadSettings">キャンセル</button>
                </div>
            </div>
        </div>
    `;

    document.body.insertAdjacentHTML('beforeend', modalHTML);

    // イベントリスナーを設定
    setupNotepadSettingsListeners();
}

// メモ帳設定のイベントリスナーを設定
function setupNotepadSettingsListeners() {
    // カラーピッカーの値表示更新
    document.getElementById('notepadBgColor').addEventListener('input', (e) => {
        document.getElementById('notepadBgColorValue').textContent = e.target.value;
    });

    document.getElementById('notepadFontColor').addEventListener('input', (e) => {
        document.getElementById('notepadFontColorValue').textContent = e.target.value;
    });

    // 閉じるボタン
    document.getElementById('closeNotepadSettings').addEventListener('click', () => {
        document.getElementById('modalNotepadSettings').style.display = 'none';
    });

    // キャンセルボタン
    document.getElementById('btnCancelNotepadSettings').addEventListener('click', () => {
        document.getElementById('modalNotepadSettings').style.display = 'none';
    });

    // 保存ボタン
    document.getElementById('btnSaveNotepadSettings').addEventListener('click', saveNotepadSettings);
}

// メモ帳設定を保存
async function saveNotepadSettings() {
    const sectionId = parseInt(document.getElementById('editingNotepadId').value);
    const title = document.getElementById('notepadTitleInput').value;
    const bgColor = document.getElementById('notepadBgColor').value;
    const fontFamily = document.getElementById('notepadFontFamily').value;
    const fontSize = document.getElementById('notepadFontSize').value;
    const fontColor = document.getElementById('notepadFontColor').value;

    const section = sections.find(s => s.id === sectionId);
    if (!section) return;

    try {
        // 現在のテキスト内容を取得（DOMから直接取得して最新の状態を確保）
        const currentTextarea = document.querySelector(`#section-${sectionId} .notepad-content`);
        const currentText = currentTextarea ? currentTextarea.value : (section.content_data?.text || '');

        // 設定を保存
        const settings = {
            text: currentText,
            bgColor: bgColor,
            fontFamily: fontFamily,
            fontSize: fontSize,
            fontColor: fontColor
        };

        await apiCall(`/api/sections/${sectionId}`, {
            method: 'PUT',
            body: JSON.stringify({
                name: title,
                content_data: settings
            })
        });

        // ローカルデータを更新
        section.name = title;
        section.content_data = settings;

        // 設定を適用
        applyNotepadSettings(sectionId, settings);

        // モーダルを閉じる
        document.getElementById('modalNotepadSettings').style.display = 'none';

        // ページを再レンダリング
        renderPageContent();
    } catch (error) {
        console.error('Save notepad settings error:', error);
        alert('設定の保存に失敗しました: ' + error.message);
    }
}

// メモ帳設定を適用
function applyNotepadSettings(sectionId, settings) {
    const textarea = document.querySelector(`#section-${sectionId} .notepad-content`);
    if (textarea) {
        textarea.style.backgroundColor = settings.bgColor || '#fffef7';
        textarea.style.fontFamily = settings.fontFamily || "'Segoe UI', Tahoma, Geneva, Verdana, sans-serif";
        textarea.style.fontSize = settings.fontSize || '14px';
        textarea.style.color = settings.fontColor || '#333333';
    }
}

// configureSection関数を修正してメモ帳の場合は専用モーダルを開く
const originalConfigureSection = window.configureSection;
window.configureSection = function (sectionId) {
    const section = sections.find(s => s.id === sectionId);
    if (section && (section.content_type === 'notepad' || section.content_type === 'image')) {
        openNotepadSettings(sectionId);
    } else {
        originalConfigureSection(sectionId);
    }
};
