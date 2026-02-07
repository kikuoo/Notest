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
    // カラーパレット定義（より濃い色・リッチな色）
    const colorPalette = [
        '#fff9c4', // Yellow 100
        '#ffcc80', // Orange 200
        '#ffab91', // Deep Orange 200
        '#f48fb1', // Pink 200
        '#ce93d8', // Purple 200
        '#9fa8da', // Indigo 200
        '#90caf9', // Blue 200
        '#80deea', // Cyan 200
        '#a5d6a7', // Green 200
        '#e6ee9c', // Lime 200
        '#ffe082', // Amber 200
        '#bcaaa4'  // Brown 200
    ];

    // フォントカラーパレット定義
    const fontColorPalette = [
        '#000000', // Black
        '#424242', // Grey 800
        '#b71c1c', // Red 900
        '#880e4f', // Pink 900
        '#4a148c', // Purple 900
        '#1a237e', // Indigo 900
        '#0d47a1', // Blue 900
        '#006064', // Cyan 900
        '#1b5e20', // Green 900
        '#827717', // Lime 900
        '#f57f17', // Yellow 900
        '#e65100'  // Orange 900
    ];

    document.getElementById('notepadBgColor').value = settings.bgColor || '#fff9c4';

    // 背景色パレット生成
    const paletteContainer = document.getElementById('notepadColorPalette');
    paletteContainer.innerHTML = '';

    colorPalette.forEach(color => {
        const btn = document.createElement('button');
        btn.className = 'color-swatch-btn';
        btn.style.backgroundColor = color;
        btn.dataset.color = color;
        if (color === (settings.bgColor || '#fff9c4')) {
            btn.classList.add('selected');
        }

        btn.onclick = (e) => {
            // 背景色選択状態の更新
            paletteContainer.querySelectorAll('.color-swatch-btn').forEach(b => b.classList.remove('selected'));
            e.target.classList.add('selected');
            document.getElementById('notepadBgColor').value = color;
        };

        paletteContainer.appendChild(btn);
    });

    // フォント色初期値
    document.getElementById('notepadFontColor').value = settings.fontColor || '#333333';

    // フォント色パレット生成
    const fontPaletteContainer = document.getElementById('notepadFontColorPalette');
    fontPaletteContainer.innerHTML = '';

    fontColorPalette.forEach(color => {
        const btn = document.createElement('button');
        btn.className = 'color-swatch-btn';
        btn.style.backgroundColor = color;
        btn.dataset.color = color;
        // フォント色は厳密一致でなくても近い色が表示されることがあるため、値で比較
        if (color.toLowerCase() === (settings.fontColor || '#333333').toLowerCase()) {
            btn.classList.add('selected');
        }

        btn.onclick = (e) => {
            // フォント色選択状態の更新
            fontPaletteContainer.querySelectorAll('.color-swatch-btn').forEach(b => b.classList.remove('selected'));
            e.target.classList.add('selected');
            document.getElementById('notepadFontColor').value = color;
        };

        fontPaletteContainer.appendChild(btn);
    });


    document.getElementById('notepadFontFamily').value = settings.fontFamily || "'Segoe UI', Tahoma, Geneva, Verdana, sans-serif";
    document.getElementById('notepadFontSize').value = settings.fontSize || '14px';
    document.getElementById('editingNotepadId').value = sectionId;

    document.getElementById('modalNotepadSettings').classList.add('active');
}

// メモ帳設定モーダルHTMLを作成
function createNotepadSettingsModal() {
    const modalHTML = `
        <div class="modal compact-modal" id="modalNotepadSettings">
            <div class="modal-content">
                <span class="close" id="closeNotepadSettings">&times;</span>
                <h2 style="font-size: 18px; margin-bottom: 15px;">メモ帳設定</h2>
                
                <div class="settings-grid">
                    <div class="form-group full-width">
                        <label>タイトル</label>
                        <input type="text" id="notepadTitleInput" placeholder="タイトル">
                    </div>
                    
                    <div class="form-group full-width">
                        <label>背景色</label>
                        <div class="color-swatch-grid compact" id="notepadColorPalette"></div>
                        <input type="hidden" id="notepadBgColor" value="#fff9c4">
                    </div>
                    
                    <div class="form-group">
                        <label>フォント</label>
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
                        <label>サイズ</label>
                        <select id="notepadFontSize">
                            <option value="12px">12px</option>
                            <option value="14px" selected>14px</option>
                            <option value="16px">16px</option>
                            <option value="18px">18px</option>
                            <option value="20px">20px</option>
                            <option value="24px">24px</option>
                        </select>
                    </div>
                    
                    <div class="form-group full-width">
                        <label>文字色</label>
                        <div class="color-swatch-grid compact" id="notepadFontColorPalette"></div>
                        <input type="hidden" id="notepadFontColor" value="#333333">
                    </div>
                </div>

                <input type="hidden" id="editingNotepadId">

                <div class="modal-actions compact">
                    <button class="btn-primary small" id="btnSaveNotepadSettings">保存</button>
                    <button class="btn-secondary small" id="btnCancelNotepadSettings">キャンセル</button>
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
    // カラーピッカーの値表示更新は不要（パレット使用のため）
    /*
    document.getElementById('notepadBgColor').addEventListener('input', (e) => {
        document.getElementById('notepadBgColorValue').textContent = e.target.value;
    });
    */

    // 閉じるボタン
    document.getElementById('closeNotepadSettings').addEventListener('click', () => {
        document.getElementById('modalNotepadSettings').classList.remove('active');
    });

    // キャンセルボタン
    document.getElementById('btnCancelNotepadSettings').addEventListener('click', () => {
        document.getElementById('modalNotepadSettings').classList.remove('active');
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

        // ヘッダータイトルの更新
        const headerTitle = document.querySelector(`#section-${sectionId} .section-title`);
        if (headerTitle) {
            headerTitle.textContent = title || 'メモ帳';
            headerTitle.title = title || 'メモ帳';
        }

        // モーダルを閉じる
        document.getElementById('modalNotepadSettings').classList.remove('active');

        // ページを再レンダリング（ヘッダー色適用のため）
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

    // ヘッダーの色も変更
    const header = document.querySelector(`#section-${sectionId} .notepad-header`);
    if (header) {
        // ヘッダーは本文より少し濃い色にするか、同じ色にする
        // ここでは同じ色に設定し、borderで区切りを表現
        header.style.backgroundColor = settings.bgColor || '#fffef7';
        // 明るさを調整するロジックを入れるのも良いが、まずは同色でシンプルに実装
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
