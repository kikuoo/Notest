from dotenv import load_dotenv
import os

# 環境変数の読み込み (Configのインポート前に実行する必要があります)
load_dotenv()

from flask import Flask, render_template, request, jsonify, send_file
from flask_sqlalchemy import SQLAlchemy
from config import Config
from datetime import datetime
import json
import shutil

app = Flask(__name__)
app.config.from_object(Config)
Config.init_app(app)

db = SQLAlchemy(app)

# データベースモデル
class Tab(db.Model):
    __tablename__ = 'tabs'
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(255), nullable=False)
    order_index = db.Column(db.Integer, default=0)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    pages = db.relationship('Page', backref='tab', lazy=True, cascade='all, delete-orphan', order_by='Page.order_index')

class Page(db.Model):
    __tablename__ = 'pages'
    id = db.Column(db.Integer, primary_key=True)
    tab_id = db.Column(db.Integer, db.ForeignKey('tabs.id'), nullable=False)
    name = db.Column(db.String(255), nullable=False)
    order_index = db.Column(db.Integer, default=0)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    sections = db.relationship('Section', backref='page', lazy=True, cascade='all, delete-orphan', order_by='Section.order_index')

class Section(db.Model):
    __tablename__ = 'sections'
    id = db.Column(db.Integer, primary_key=True)
    page_id = db.Column(db.Integer, db.ForeignKey('pages.id'), nullable=False)
    name = db.Column(db.String(255), nullable=True)
    content_type = db.Column(db.String(50), nullable=False)  # 'text', 'file', 'link'
    content_data = db.Column(db.Text, nullable=True)  # JSON形式で保存
    memo = db.Column(db.Text, nullable=True)  # メモ欄
    order_index = db.Column(db.Integer, default=0)
    width = db.Column(db.Integer, default=300)
    height = db.Column(db.Integer, default=200)
    position_x = db.Column(db.Integer, default=0)
    position_y = db.Column(db.Integer, default=0)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

class StorageLocation(db.Model):
    __tablename__ = 'storage_locations'
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(255), nullable=False)
    storage_type = db.Column(db.String(50), nullable=False)  # 'local', 'onedrive', 'googledrive', 'icloud'
    path = db.Column(db.String(1000), nullable=False)
    is_active = db.Column(db.Boolean, default=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

@app.route('/')
def index():
    return render_template('index.html')

# タブ関連のAPI
@app.route('/api/tabs', methods=['GET'])
def get_tabs():
    tabs = Tab.query.order_by(Tab.order_index).all()
    return jsonify([{
        'id': tab.id,
        'name': tab.name,
        'order_index': tab.order_index,
        'pages': [{
            'id': page.id,
            'name': page.name,
            'order_index': page.order_index
        } for page in tab.pages]
    } for tab in tabs])

@app.route('/api/tabs', methods=['POST'])
def create_tab():
    data = request.json
    tab = Tab(name=data['name'], order_index=data.get('order_index', 0))
    db.session.add(tab)
    db.session.commit()
    return jsonify({'id': tab.id, 'name': tab.name, 'order_index': tab.order_index}), 201

@app.route('/api/tabs/<int:tab_id>', methods=['PUT'])
def update_tab(tab_id):
    tab = Tab.query.get_or_404(tab_id)
    data = request.json
    if 'name' in data:
        tab.name = data['name']
    if 'order_index' in data:
        tab.order_index = data['order_index']
    tab.updated_at = datetime.utcnow()
    db.session.commit()
    return jsonify({'id': tab.id, 'name': tab.name, 'order_index': tab.order_index})

@app.route('/api/tabs/<int:tab_id>', methods=['DELETE'])
def delete_tab(tab_id):
    tab = Tab.query.get_or_404(tab_id)
    db.session.delete(tab)
    db.session.commit()
    return jsonify({'message': 'Tab deleted'}), 200

# ページ関連のAPI
@app.route('/api/pages', methods=['POST'])
def create_page():
    data = request.json
    page = Page(tab_id=data['tab_id'], name=data['name'], order_index=data.get('order_index', 0))
    db.session.add(page)
    db.session.commit()
    return jsonify({'id': page.id, 'name': page.name, 'tab_id': page.tab_id, 'order_index': page.order_index}), 201

@app.route('/api/pages/<int:page_id>', methods=['GET'])
def get_page(page_id):
    page = Page.query.get_or_404(page_id)
    sections = Section.query.filter_by(page_id=page_id).order_by(Section.order_index).all()
    return jsonify({
        'id': page.id,
        'name': page.name,
        'tab_id': page.tab_id,
        'sections': [{
            'id': section.id,
            'name': section.name,
            'content_type': section.content_type,
            'content_data': json.loads(section.content_data) if section.content_data else None,
            'memo': section.memo,
            'order_index': section.order_index,
            'width': section.width,
            'height': section.height,
            'position_x': section.position_x,
            'position_y': section.position_y
        } for section in sections]
    })

@app.route('/api/pages/<int:page_id>', methods=['PUT'])
def update_page(page_id):
    page = Page.query.get_or_404(page_id)
    data = request.json
    if 'name' in data:
        page.name = data['name']
    if 'order_index' in data:
        page.order_index = data['order_index']
    page.updated_at = datetime.utcnow()
    db.session.commit()
    return jsonify({'id': page.id, 'name': page.name, 'order_index': page.order_index})

@app.route('/api/pages/<int:page_id>', methods=['DELETE'])
def delete_page(page_id):
    page = Page.query.get_or_404(page_id)
    db.session.delete(page)
    db.session.commit()
    return jsonify({'message': 'Page deleted'}), 200

# セクション関連のAPI
@app.route('/api/sections', methods=['POST'])
def create_section():
    data = request.json
    section = Section(
        page_id=data['page_id'],
        name=data.get('name'),
        content_type=data.get('content_type', 'text'),
        content_data=json.dumps(data.get('content_data')) if data.get('content_data') else None,
        order_index=data.get('order_index', 0),
        width=data.get('width', 300),
        height=data.get('height', 200),
        position_x=data.get('position_x', 0),
        position_y=data.get('position_y', 0)
    )
    db.session.add(section)
    db.session.commit()
    return jsonify({
        'id': section.id,
        'name': section.name,
        'content_type': section.content_type,
        'content_data': json.loads(section.content_data) if section.content_data else None,
        'memo': section.memo,
        'order_index': section.order_index,
        'width': section.width,
        'height': section.height,
        'position_x': section.position_x,
        'position_y': section.position_y
    }), 201

@app.route('/api/sections/<int:section_id>', methods=['PUT'])
def update_section(section_id):
    section = Section.query.get_or_404(section_id)
    data = request.json
    if 'name' in data:
        section.name = data['name']
    if 'content_type' in data:
        section.content_type = data['content_type']
    if 'content_data' in data:
        section.content_data = json.dumps(data['content_data'])
    if 'memo' in data:
        section.memo = data['memo']
    if 'name' in data:
        section.name = data['name']
    if 'width' in data:
        section.width = data['width']
    if 'height' in data:
        section.height = data['height']
    if 'position_x' in data:
        section.position_x = data['position_x']
    if 'position_y' in data:
        section.position_y = data['position_y']
    if 'order_index' in data:
        section.order_index = data['order_index']
    section.updated_at = datetime.utcnow()
    db.session.commit()
    return jsonify({
        'id': section.id,
        'name': section.name,
        'content_type': section.content_type,
        'content_data': json.loads(section.content_data) if section.content_data else None,
        'memo': section.memo,
        'order_index': section.order_index,
        'width': section.width,
        'height': section.height,
        'position_x': section.position_x,
        'position_y': section.position_y
    })

@app.route('/api/sections/<int:section_id>', methods=['DELETE'])
def delete_section(section_id):
    section = Section.query.get_or_404(section_id)
    # ファイルの場合は物理ファイルも削除
    if section.content_type == 'file' and section.content_data:
        try:
            content = json.loads(section.content_data)
            file_path = content.get('file_path')
            if file_path and os.path.exists(file_path):
                os.remove(file_path)
        except:
            pass
    db.session.delete(section)
    db.session.commit()
    return jsonify({'message': 'Section deleted'}), 200

# ファイルアップロード
@app.route('/api/upload', methods=['POST'])
def upload_file():
    if 'file' not in request.files:
        return jsonify({'error': 'No file provided'}), 400
    
    file = request.files['file']
    if file.filename == '':
        return jsonify({'error': 'No file selected'}), 400
    
    # ストレージ場所の取得（デフォルトはローカル）
    storage_location_id = request.form.get('storage_location_id', None)
    if storage_location_id:
        storage = StorageLocation.query.get(storage_location_id)
        if storage and storage.is_active:
            upload_path = storage.path
        else:
            upload_path = app.config['UPLOAD_FOLDER']
    else:
        upload_path = app.config['UPLOAD_FOLDER']
    
    os.makedirs(upload_path, exist_ok=True)
    
    # ファイル名の重複を避ける
    filename = file.filename
    filepath = os.path.join(upload_path, filename)
    counter = 1
    while os.path.exists(filepath):
        name, ext = os.path.splitext(filename)
        filepath = os.path.join(upload_path, f"{name}_{counter}{ext}")
        counter += 1
    
    file.save(filepath)
    
    return jsonify({
        'filename': os.path.basename(filepath),
        'file_path': filepath,
        'file_size': os.path.getsize(filepath),
        'file_type': file.content_type
    }), 201

@app.route('/api/files/<int:section_id>')
def get_file(section_id):
    section = Section.query.get_or_404(section_id)
    if section.content_type not in ['file', 'image'] or not section.content_data:
        return jsonify({'error': 'Not a file or image section'}), 400
    
    try:
        content = json.loads(section.content_data)
        file_path = content.get('file_path')
        if not file_path or not os.path.exists(file_path):
            return jsonify({'error': 'File not found'}), 404
        
        # セキュリティのため、パスを検証
        upload_folder = os.path.abspath(app.config['UPLOAD_FOLDER'])
        storage_base = os.path.abspath(app.config['STORAGE_BASE_PATH'])
        abs_file_path = os.path.abspath(file_path)
        
        if not (abs_file_path.startswith(upload_folder) or abs_file_path.startswith(storage_base)):
            return jsonify({'error': 'Access denied'}), 403
        
        return send_file(file_path, as_attachment=False, download_name=content.get('filename', 'file'))
    except Exception as e:
        return jsonify({'error': str(e)}), 500

# セクション内のファイル操作API
@app.route('/api/sections/<int:section_id>/files', methods=['GET'])
def list_section_files(section_id):
    section = Section.query.get_or_404(section_id)
    if section.content_type != 'storage':
        return jsonify({'error': 'Not a storage section'}), 400
    
    try:
        content_data = json.loads(section.content_data) if section.content_data else {}
        path = content_data.get('path')
        
        if path:
            path = os.path.expanduser(path)
        
        if not path or not os.path.exists(path):
            return jsonify({'error': f'Path not found: {path}'}), 404
            
        files = []
        for filename in os.listdir(path):
            file_path = os.path.join(path, filename)
            if os.path.isfile(file_path):
                stats = os.stat(file_path)
                files.append({
                    'name': filename,
                    'size': stats.st_size,
                    'updated_at': datetime.fromtimestamp(stats.st_mtime).isoformat()
                })
        
        return jsonify(files)
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/sections/<int:section_id>/files', methods=['POST'])
def upload_section_file(section_id):
    section = Section.query.get_or_404(section_id)
    if section.content_type != 'storage':
        return jsonify({'error': 'Not a storage section'}), 400
        
    try:
        content_data = json.loads(section.content_data) if section.content_data else {}
        path = content_data.get('path')
        
        if path:
            path = os.path.expanduser(path)
        
        if not path or not os.path.exists(path):
            return jsonify({'error': f'Path not found: {path}'}), 404
            
        if 'file' not in request.files:
            return jsonify({'error': 'No file part'}), 400
            
        file = request.files['file']
        if file.filename == '':
            return jsonify({'error': 'No selected file'}), 400
            
        file.save(os.path.join(path, file.filename))
        
        return jsonify({'message': 'File uploaded successfully'})
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/sections/<int:section_id>/files/<path:filename>', methods=['DELETE'])
def delete_section_file(section_id, filename):
    section = Section.query.get_or_404(section_id)
    if section.content_type != 'storage':
        return jsonify({'error': 'Not a storage section'}), 400
        
    try:
        content_data = json.loads(section.content_data) if section.content_data else {}
        path = content_data.get('path')
        
        if path:
            path = os.path.expanduser(path)
        
        if not path or not os.path.exists(path):
            return jsonify({'error': f'Path not found: {path}'}), 404
            
        file_path = os.path.join(path, filename)
        if not os.path.exists(file_path):
            return jsonify({'error': 'File not found'}), 404
            
        os.remove(file_path)
        return jsonify({'message': 'File deleted successfully'})
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/sections/<int:section_id>/files/<path:filename>', methods=['GET'])
def download_section_file(section_id, filename):
    section = Section.query.get_or_404(section_id)
    if section.content_type != 'storage':
        return jsonify({'error': 'Not a storage section'}), 400
        
    try:
        content_data = json.loads(section.content_data) if section.content_data else {}
        path = content_data.get('path')
        
        if path:
            path = os.path.expanduser(path)
        
        if not path or not os.path.exists(path):
            return jsonify({'error': f'Path not found: {path}'}), 404
            
        return send_file(os.path.join(path, filename), as_attachment=False)
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/sections/<int:source_section_id>/files/<path:filename>/move', methods=['POST'])
def move_section_file(source_section_id, filename):
    source_section = Section.query.get_or_404(source_section_id)
    if source_section.content_type != 'storage':
        return jsonify({'error': 'Source is not a storage section'}), 400
        
    data = request.json
    target_section_id = data.get('target_section_id')
    if not target_section_id:
        return jsonify({'error': 'Target section ID required'}), 400
        
    target_section = Section.query.get_or_404(target_section_id)
    if target_section.content_type != 'storage':
        return jsonify({'error': 'Target is not a storage section'}), 400
        
    try:
        source_data = json.loads(source_section.content_data) if source_section.content_data else {}
        target_data = json.loads(target_section.content_data) if target_section.content_data else {}
        
        source_path = source_data.get('path')
        target_path = target_data.get('path')
        
        if source_path:
            source_path = os.path.expanduser(source_path)
        if target_path:
            target_path = os.path.expanduser(target_path)
            
        if not source_path or not os.path.exists(source_path):
            return jsonify({'error': f'Source path not found: {source_path}'}), 404
        if not target_path or not os.path.exists(target_path):
            return jsonify({'error': f'Target path not found: {target_path}'}), 404
            
        source_file = os.path.join(source_path, filename)
        target_file = os.path.join(target_path, filename)
        
        if not os.path.exists(source_file):
            return jsonify({'error': 'Source file not found'}), 404
            
        # ファイルを移動
        shutil.move(source_file, target_file)
        
        return jsonify({'message': 'File moved successfully'}), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/sections/<int:source_section_id>/files/<path:filename>/copy', methods=['POST'])
def copy_section_file(source_section_id, filename):
    source_section = Section.query.get_or_404(source_section_id)
    if source_section.content_type != 'storage':
        return jsonify({'error': 'Source is not a storage section'}), 400
        
    data = request.json
    target_section_id = data.get('target_section_id')
    if not target_section_id:
        return jsonify({'error': 'Target section ID required'}), 400
        
    target_section = Section.query.get_or_404(target_section_id)
    if target_section.content_type != 'storage':
        return jsonify({'error': 'Target is not a storage section'}), 400
        
    try:
        source_data = json.loads(source_section.content_data) if source_section.content_data else {}
        target_data = json.loads(target_section.content_data) if target_section.content_data else {}
        
        source_path = source_data.get('path')
        target_path = target_data.get('path')
        
        if source_path:
            source_path = os.path.expanduser(source_path)
        if target_path:
            target_path = os.path.expanduser(target_path)
            
        if not source_path or not os.path.exists(source_path):
            return jsonify({'error': f'Source path not found: {source_path}'}), 404
        if not target_path or not os.path.exists(target_path):
            return jsonify({'error': f'Target path not found: {target_path}'}), 404
            
        source_file = os.path.join(source_path, filename)
        target_file = os.path.join(target_path, filename)
        
        if not os.path.exists(source_file):
            return jsonify({'error': 'Source file not found'}), 404
            
        # ファイルをコピー
        shutil.copy2(source_file, target_file)
        
        return jsonify({'message': 'File copied successfully'}), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/sections/<int:section_id>/files/<path:filename>/extract', methods=['POST'])
def extract_zip_file(section_id, filename):
    section = Section.query.get_or_404(section_id)
    if section.content_type != 'storage':
        return jsonify({'error': 'Not a storage section'}), 400
        
    try:
        content_data = json.loads(section.content_data) if section.content_data else {}
        path = content_data.get('path')
        
        if path:
            path = os.path.expanduser(path)
            
        if not path or not os.path.exists(path):
            return jsonify({'error': f'Path not found: {path}'}), 404
            
        zip_file_path = os.path.join(path, filename)
        
        if not os.path.exists(zip_file_path):
            return jsonify({'error': 'ZIP file not found'}), 404
            
        if not filename.lower().endswith('.zip'):
            return jsonify({'error': 'Not a ZIP file'}), 400
            
        # ZIPファイルを解凍
        import zipfile
        with zipfile.ZipFile(zip_file_path, 'r') as zip_ref:
            zip_ref.extractall(path)
        
        return jsonify({'message': 'ZIP file extracted successfully'}), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 500



# ストレージ場所関連のAPI
@app.route('/api/storage-locations', methods=['GET'])
def get_storage_locations():
    locations = StorageLocation.query.filter_by(is_active=True).all()
    return jsonify([{
        'id': loc.id,
        'name': loc.name,
        'storage_type': loc.storage_type,
        'path': loc.path
    } for loc in locations])

@app.route('/api/storage-locations', methods=['POST'])
def create_storage_location():
    data = request.json
    location = StorageLocation(
        name=data['name'],
        storage_type=data['storage_type'],
        path=data['path']
    )
    db.session.add(location)
    db.session.commit()
    return jsonify({
        'id': location.id,
        'name': location.name,
        'storage_type': location.storage_type,
        'path': location.path
    }), 201

# システム関連API
@app.route('/api/system/directories', methods=['GET'])
def list_directories():
    path = request.args.get('path')
    
    # パスが指定されていない場合はホームディレクトリ
    if not path:
        path = os.path.expanduser('~')
    else:
        path = os.path.expanduser(path)
    
    if not os.path.exists(path) or not os.path.isdir(path):
        return jsonify({'error': 'Invalid path'}), 400
        
    try:
        # 親ディレクトリ
        parent_path = os.path.dirname(os.path.abspath(path))
        
        # サブディレクトリ一覧
        directories = []
        with os.scandir(path) as it:
            for entry in it:
                if entry.is_dir() and not entry.name.startswith('.'):
                    directories.append(entry.name)
        
        directories.sort()
        
        return jsonify({
            'current_path': os.path.abspath(path),
            'parent_path': parent_path,
            'directories': directories
        })
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/system/directories', methods=['POST'])
def create_directory():
    data = request.json
    path = data.get('path')
    name = data.get('name')
    
    if not path or not name:
        return jsonify({'error': 'Path and name are required'}), 400
        
    path = os.path.expanduser(path)
    new_dir_path = os.path.join(path, name)
    
    if os.path.exists(new_dir_path):
        return jsonify({'error': 'Directory already exists'}), 400
        
    try:
        os.makedirs(new_dir_path)
        return jsonify({'message': 'Directory created', 'path': new_dir_path}), 201
    except Exception as e:
        return jsonify({'error': str(e)}), 500


if __name__ == '__main__':
    with app.app_context():
        db.create_all()
    app.run(debug=True, host='0.0.0.0', port=5001)
