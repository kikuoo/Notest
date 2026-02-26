// 画像貼り付け機能
function triggerImagePaste(sectionId) {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.onchange = async (e) => {
        if (e.target.files.length > 0) {
            await uploadSectionImage(sectionId, e.target.files[0]);
        }
    };
    input.click();
}

async function uploadSectionImage(sectionId, file) {
    try {
        const formData = new FormData();
        formData.append('image', file);

        const response = await fetch(`api/sections/${sectionId}/image`, {
            method: 'POST',
            body: formData
        });

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const result = await response.json();

        // セクションを再レンダリング
        const section = sections.find(s => s.id === sectionId);
        if (section) {
            section.content_data = section.content_data || {};
            section.content_data.image_url = result.image_url;
            renderPageContent();
        }
    } catch (error) {
        console.error('Upload image error:', error);
        alert('画像のアップロードに失敗しました: ' + error.message);
    }
}

async function clearSectionImage(sectionId) {
    if (!confirm('画像を削除しますか？')) return;

    try {
        const section = sections.find(s => s.id === sectionId);
        if (!section) return;

        section.content_data = section.content_data || {};
        section.content_data.image_url = '';

        await apiCall(`/api/sections/${sectionId}`, {
            method: 'PUT',
            body: JSON.stringify({
                content_data: section.content_data
            })
        });

        renderPageContent();
    } catch (error) {
        console.error('Clear image error:', error);
        alert('画像の削除に失敗しました: ' + error.message);
    }
}
