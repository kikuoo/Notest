from flask import Flask, render_template, request, jsonify, send_file
from flask_sqlalchemy import SQLAlchemy
from config import Config
import os
from datetime import datetime
import json
from dotenv import load_dotenv

# 環境変数の読み込み
load_dotenv()

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
    if section.content_type != 'file' or not section.content_data:
        return jsonify({'error': 'Not a file section'}), 400
    
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
        
        return send_file(file_path, as_attachment=True, download_name=content.get('filename', 'file'))
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

if __name__ == '__main__':
    with app.app_context():
        db.create_all()
    app.run(debug=True, host='0.0.0.0', port=5000)
