// ファイルプレビュー機能
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
}

function showFilePreview(sectionId, filename) {
    const panel = document.getElementById('filePreviewPanel');
    const btn = document.getElementById('togglePreviewBtn');
    const fileNameEl = document.getElementById('previewFileName');
    const contentEl = document.getElementById('previewContent');

    // パネルを開く
    panel.classList.add('open');
    btn.classList.add('active');

    // ファイル名を表示
    fileNameEl.textContent = filename;

    // ファイルの拡張子を取得
    const ext = filename.split('.').pop().toLowerCase();
    const downloadUrl = `/api/sections/${sectionId}/files/${encodeURIComponent(filename)}`;

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
            <iframe src="${downloadUrl}" style="width: 100%; height: calc(100% - 80px);"></iframe>
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
