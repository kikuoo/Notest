// ファイルプレビュー機能
let currentPreviewUrl = null;
let isResizing = false;

// ページ読み込み時にリサイズ機能を初期化
document.addEventListener('DOMContentLoaded', () => {
    initPreviewResize();
});

function initPreviewResize() {
    const panel = document.getElementById('filePreviewPanel');
    const handle = document.getElementById('previewResizeHandle');
    if (!panel || !handle) return;

    // 保存された幅を復元
    const savedWidth = localStorage.getItem('file_preview_panel_width');
    if (savedWidth) {
        panel.style.width = savedWidth + 'px';
    }

    handle.addEventListener('mousedown', (e) => {
        isResizing = true;
        panel.classList.add('resizing');
        document.body.style.cursor = 'ew-resize';
        e.preventDefault();
    });

    document.addEventListener('mousemove', (e) => {
        if (!isResizing) return;
        
        // 右端が0固定なので、新しい幅 = window.innerWidth - mouseX
        const newWidth = window.innerWidth - e.clientX;
        
        // CSSのmin-width / max-width制限を考慮
        if (newWidth > 200 && newWidth < window.innerWidth * 0.9) {
            panel.style.width = newWidth + 'px';
        }
    });

    document.addEventListener('mouseup', () => {
        if (!isResizing) return;
        isResizing = false;
        panel.classList.remove('resizing');
        document.body.style.cursor = '';
        
        // 幅を保存
        localStorage.setItem('file_preview_panel_width', parseInt(panel.style.width));
    });
}

function toggleFilePreview() {
    const panel = document.getElementById('filePreviewPanel');
    const btn = document.getElementById('togglePreviewBtn');
    panel.classList.toggle('open');
    btn.classList.toggle('active');
}

function closeFilePreview() {
    const panel = document.getElementById('filePreviewPanel');
    const btn = document.getElementById('togglePreviewBtn');
    panel.classList.remove('open');
    btn.classList.remove('active');

    // プレビュー用に作られたローカルファイルURLを解放（メモリリーク防止）
    if (typeof currentPreviewUrl !== 'undefined' && currentPreviewUrl && currentPreviewUrl.startsWith('blob:')) {
        URL.revokeObjectURL(currentPreviewUrl);
        currentPreviewUrl = null;
    }
}

async function showFilePreview(sectionId, filename) {
    const panel = document.getElementById('filePreviewPanel');
    const btn = document.getElementById('togglePreviewBtn');
    const fileNameEl = document.getElementById('previewFileName');
    const contentEl = document.getElementById('previewContent');

    // 前回のURLがあれば解放（メモリリーク防止）
    if (currentPreviewUrl && currentPreviewUrl.startsWith('blob:')) {
        URL.revokeObjectURL(currentPreviewUrl);
        currentPreviewUrl = null;
    }

    // パネルを開く
    panel.classList.add('open');
    btn.classList.add('active');

    // 最初はローディング表示や内容のクリア
    contentEl.innerHTML = '<div style="padding: 20px; color: #666; text-align: center;">読み込み中...</div>';

    // ファイル名を表示
    fileNameEl.textContent = filename;

    // ファイルの拡張子を取得
    const ext = filename.split('.').pop().toLowerCase();

    let downloadUrl = '';

    // ローカルフォルダ（File System Access API）の確認
    if (typeof localDirSubHandles !== 'undefined' && localDirSubHandles[sectionId]) {
        try {
            const currentHandle = localDirSubHandles[sectionId];
            const fileHandle = await currentHandle.getFileHandle(filename);
            const file = await fileHandle.getFile();
            downloadUrl = URL.createObjectURL(file);
            currentPreviewUrl = downloadUrl;
        } catch (e) {
            console.error("Local file access error:", e);
            contentEl.innerHTML = `<div style="padding:20px; color:red; text-align:center;">ファイルの読み込みに失敗しました: ${e.message}</div>`;
            return;
        }
    } else {
        downloadUrl = window.getApiUrl(`/api/sections/${sectionId}/files/${encodeURIComponent(filename)}`);
        currentPreviewUrl = downloadUrl;
    }

    // プレビュー内容を生成
    let previewHTML = '';

    if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg'].includes(ext)) {
        // 画像ファイル
        previewHTML = `
            <div class="preview-file-info">
                <p><strong>ファイル名:</strong> ${escapeHtml(filename)}</p>
                <p><strong>種類:</strong> 画像ファイル</p>
            </div>
            <img src="${downloadUrl}" alt="${escapeHtml(filename)}" onerror="this.src='data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 width=%22100%22 height=%22100%22><text x=%2250%%22 y=%2250%%22 text-anchor=%22middle%22 dy=%22.3em%22>読み込みエラー</text></svg>'">
        `;
    } else if (['pdf'].includes(ext)) {
        // PDFファイル
        previewHTML = `
            <div class="preview-file-info">
                <p><strong>ファイル名:</strong> ${escapeHtml(filename)}</p>
                <p><strong>種類:</strong> PDFドキュメント</p>
            </div>
            <embed src="${downloadUrl}#toolbar=1&navpanes=1&scrollbar=1" 
                   type="application/pdf" 
                   style="width: 100%; height: calc(100% - 100px); min-height: 500px;"
                   onerror="this.style.display='none'; document.getElementById('pdfError').style.display='block';">
            <div id="pdfError" style="display: none; padding: 20px; text-align: center;">
                <p>PDFのプレビューに失敗しました。</p>
                <button class="btn-primary" onclick="window.open('${downloadUrl}', '_blank')" style="margin-top: 10px;">
                    PDFを開く
                </button>
            </div>
        `;
    } else if (['txt', 'md', 'json', 'js', 'css', 'html', 'xml', 'csv'].includes(ext)) {
        // テキストファイル
        previewHTML = `
            <div class="preview-file-info">
                <p><strong>ファイル名:</strong> ${escapeHtml(filename)}</p>
                <p><strong>種類:</strong> テキストファイル</p>
                <p style="color: #999; font-size: 12px;">読み込み中...</p>
            </div>
            <pre id="textPreviewContent">読み込み中...</pre>
        `;

        // テキストファイルの内容を取得
        fetch(downloadUrl)
            .then(response => response.text())
            .then(text => {
                const preElement = document.getElementById('textPreviewContent');
                if (preElement) {
                    preElement.textContent = text;
                }
            })
            .catch(error => {
                const preElement = document.getElementById('textPreviewContent');
                if (preElement) {
                    preElement.textContent = 'ファイルの読み込みに失敗しました';
                }
            });
    } else if (['mp4', 'webm', 'ogg'].includes(ext)) {
        // 動画ファイル
        previewHTML = `
            <div class="preview-file-info">
                <p><strong>ファイル名:</strong> ${escapeHtml(filename)}</p>
                <p><strong>種類:</strong> 動画ファイル</p>
            </div>
            <video controls style="width: 100%; max-height: 500px;">
                <source src="${downloadUrl}" type="video/${ext}">
                お使いのブラウザは動画タグをサポートしていません。
            </video>
        `;
    } else if (['mp3', 'wav', 'ogg'].includes(ext)) {
        // 音声ファイル
        previewHTML = `
            <div class="preview-file-info">
                <p><strong>ファイル名:</strong> ${escapeHtml(filename)}</p>
                <p><strong>種類:</strong> 音声ファイル</p>
            </div>
            <audio controls style="width: 100%;">
                <source src="${downloadUrl}" type="audio/${ext}">
                お使いのブラウザは音声タグをサポートしていません。
            </audio>
        `;
    } else {
        // その他のファイル
        previewHTML = `
            <div class="preview-file-info">
                <p><strong>ファイル名:</strong> ${escapeHtml(filename)}</p>
                <p><strong>種類:</strong> ${ext.toUpperCase()}ファイル</p>
                <p style="margin-top: 20px;">このファイル形式はプレビューできません。</p>
                <button class="btn-primary" onclick="window.open('${downloadUrl}', '_blank')" style="margin-top: 10px;">
                    ダウンロード
                </button>
            </div>
        `;
    }

    contentEl.innerHTML = previewHTML;
}
