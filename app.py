from dotenv import load_dotenv
import os

# 環境変数の読み込み (Configのインポート前に実行する必要があります)
load_dotenv()

from flask import Flask, render_template, request, jsonify, send_file, redirect, url_for
from flask_sqlalchemy import SQLAlchemy
from flask_login import LoginManager, login_user, logout_user, login_required, current_user
from flask_mail import Mail, Message
from config import Config
from datetime import datetime, timedelta
import json
import shutil
import bcrypt
import secrets
import stripe
import sys
import requests

class PrefixMiddleware(object):
    def __init__(self, app, prefix=''):
        self.app = app
        self.prefix = prefix

    def __call__(self, environ, start_response):
        if environ['PATH_INFO'].startswith(self.prefix):
            environ['PATH_INFO'] = environ['PATH_INFO'][len(self.prefix):]
            environ['SCRIPT_NAME'] = self.prefix
            return self.app(environ, start_response)
        else:
            return self.app(environ, start_response)

def is_desktop_app():
    """実行環境がデスクトップアプリかどうかを判定"""
    return getattr(sys, 'frozen', False) or os.environ.get('WOWNOTE_DESKTOP') == 'true'

def proxy_auth_to_remote(endpoint, data, params=None):
    """リモートサーバーに認証リクエストをプロキシする"""
    try:
        remote_base = app.config['REMOTE_SERVER_URL'].rstrip('/')
        remote_url = f"{remote_base}{endpoint}"
        headers = {'X-Internal-Auth': app.config['SECRET_KEY']}
        
        # status確認などのGETリクエストにも対応
        if not data and endpoint.endswith('status'):
            response = requests.get(remote_url, params=params, headers=headers, timeout=15)
        else:
            response = requests.post(remote_url, json=data, headers=headers, timeout=15)
        
        # JSONとして解析を試みる
        try:
            return response.json(), response.status_code
        except Exception:
            # 解析失敗時はステータスコードを添えてエラーを返す
            error_msg = f'認証サーバーが不正なレスポンスを返しました (Status: {response.status_code})'
            print(f"Proxy Error: {error_msg} URL: {remote_url}")
            return {'error': error_msg}, response.status_code if response.status_code != 200 else 500
    except Exception as e:
        return {'error': f'認証サーバーに接続できません: {str(e)}'}, 500
def resource_path(relative_path):
    """ Get absolute path to resource, works for dev and for PyInstaller """
    try:
        base_path = sys._MEIPASS
    except Exception:
        base_path = os.path.abspath(".")
    return os.path.join(base_path, relative_path)

stripe.api_key = os.getenv('STRIPE_SECRET_KEY')
STRIPE_WEBHOOK_SECRET = os.getenv('STRIPE_WEBHOOK_SECRET')

app = Flask(__name__, 
            template_folder=resource_path('templates'),
            static_folder=resource_path('static'))
app.config.from_object(Config)
app.wsgi_app = PrefixMiddleware(app.wsgi_app, prefix='/note')
Config.init_app(app)

db = SQLAlchemy(app)
login_manager = LoginManager(app)
login_manager.login_message = None  # ログインメッセージを表示しない
mail = Mail(app)


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

# ユーザー認証モデル
class User(db.Model):
    __tablename__ = 'users'
    id = db.Column(db.Integer, primary_key=True)
    email = db.Column(db.String(255), unique=True, nullable=False, index=True)
    username = db.Column(db.String(100), nullable=False)
    password_hash = db.Column(db.String(255), nullable=False)
    is_active = db.Column(db.Boolean, default=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    # Stripe サブスクリプション管理
    stripe_customer_id = db.Column(db.String(255), nullable=True)
    stripe_subscription_id = db.Column(db.String(255), nullable=True)
    subscription_status = db.Column(db.String(50), default='trialing') # 'trialing', 'active', 'canceled', 'expired'
    trial_end = db.Column(db.DateTime, nullable=True)
    current_period_end = db.Column(db.DateTime, nullable=True)
    cancel_at_period_end = db.Column(db.Boolean, default=False)
    remote_user_id = db.Column(db.Integer, nullable=True) # リモートサーバー側のユーザーID
    
    # Flask-Loginに必要なメソッド
    @property
    def is_authenticated(self):
        return True
    
    @property
    def is_anonymous(self):
        return False
    
    def get_id(self):
        return str(self.id)

class EmailVerificationToken(db.Model):
    __tablename__ = 'email_verification_tokens'
    id = db.Column(db.Integer, primary_key=True)
    email = db.Column(db.String(255), nullable=False, index=True)
    token = db.Column(db.String(255), unique=True, nullable=False, index=True)
    expires_at = db.Column(db.DateTime, nullable=False)
    used = db.Column(db.Boolean, default=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)


class StorageLocation(db.Model):
    __tablename__ = 'storage_locations'
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(255), nullable=False)
    storage_type = db.Column(db.String(50), nullable=False)  # 'local', 'onedrive', 'googledrive', 'icloud'
    path = db.Column(db.String(1000), nullable=False)
    is_active = db.Column(db.Boolean, default=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

class PasswordResetToken(db.Model):
    __tablename__ = 'password_reset_tokens'
    id = db.Column(db.Integer, primary_key=True)
    email = db.Column(db.String(255), nullable=False, index=True)
    token = db.Column(db.String(255), unique=True, nullable=False, index=True)
    expires_at = db.Column(db.DateTime, nullable=False)
    used = db.Column(db.Boolean, default=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

# Flask-Loginのユーザーローダー
@login_manager.user_loader
def load_user(user_id):
    return User.query.get(int(user_id))

@login_manager.unauthorized_handler
def unauthorized():
    """未ログイン時のリダイレクト"""
    return redirect(url_for('login_view'))

@app.route('/')
def landing():
    """ランディングページ（Webブラウザ用）"""
    return render_template('landing.html')

@app.route('/login')
def login_view():
    """ログインページ（デスクトップアプリ用）"""
    return render_template('login_page.html')

@app.route('/register')
def register_view():
    """新規登録ページ（デスクトップアプリ用）"""
    return render_template('register_page.html')

@app.route('/app')
@login_required
def index():
    """メインアプリケーション（ログイン必須・デスクトップアプリ専用）"""
    # デスクトップアプリ実行中か、デバッグモードか、凍結済みかをチェック
    is_desktop = os.environ.get('WOWNOTE_DESKTOP') == 'true' or getattr(sys, 'frozen', False)
    if not is_desktop and not os.getenv('DEBUG_MODE'):
        return redirect(url_for('landing'))
    return render_template('index.html')

@app.route('/privacy-policy')
def privacy_policy():
    return render_template('privacy-policy.html')

@app.route('/terms-of-service')
def terms_of_service():
    return render_template('terms-of-service.html')

@app.route('/forgot-password')
def forgot_password_view():
    """パスワード再設定リクエストページ"""
    return render_template('forgot_password.html')

@app.route('/reset-password')
def reset_password_view():
    """パスワード再設定ページ"""
    token = request.args.get('token')
    if not token:
        return redirect(url_for('login_view'))
    return render_template('reset_password.html', token=token)

@app.route('/legal')
def legal():
    return render_template('legal.html')

# メール認証ページ（リダイレクト用）
@app.route('/verify-email')
def verify_email_page():
    """メール認証リンクからのリダイレクト"""
    token = request.args.get('token')
    # APP_BASE_URLが設定されている場合はそれを使用（サブフォルダ運用時用）
    app_base_url = os.environ.get('APP_BASE_URL', '').rstrip('/')
    root_url = app_base_url if app_base_url else ''
    target_url = f'{root_url}/?token={token}' if token else f'{root_url}/'
    # CGIモードではredirect()が正常に機能しない場合があるため、HTMLで直接リダイレクト
    return f'''<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta http-equiv="refresh" content="0; url={target_url}">
  <script>window.location.replace("{target_url}");</script>
</head>
<body>リダイレクト中...</body>
</html>'''

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
            
        items = []
        for item_name in os.listdir(path):
            item_path = os.path.join(path, item_name)
            stats = os.stat(item_path)
            is_dir = os.path.isdir(item_path)
            
            items.append({
                'name': item_name,
                'size': stats.st_size if not is_dir else 0,
                'updated_at': datetime.fromtimestamp(stats.st_mtime).isoformat(),
                'is_directory': is_dir
            })
        
        # フォルダを先に、ファイルを後に並べる
        items.sort(key=lambda x: (not x['is_directory'], x['name'].lower()))
        
        return jsonify(items)
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
            
        file_path = os.path.join(path, filename)
        
        if not os.path.exists(file_path):
            return jsonify({'error': f'File not found: {filename}'}), 404
        
        # MIMEタイプを推測
        import mimetypes
        mimetype, _ = mimetypes.guess_type(filename)
        
        # PDFの場合は明示的にMIMEタイプを設定
        if filename.lower().endswith('.pdf'):
            mimetype = 'application/pdf'
            
        as_attachment = request.args.get('download', '0') == '1'
        
        return send_file(file_path, as_attachment=as_attachment, mimetype=mimetype)
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
            
        # ターゲットに同名ファイル/フォルダがある場合は別名にする
        base_name = os.path.basename(target_file)
        dir_name = os.path.dirname(target_file)
        counter = 1
        name, ext = os.path.splitext(base_name)
        while os.path.exists(target_file):
            target_file = os.path.join(dir_name, f"{name}_{counter}{ext}")
            counter += 1

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
            
        # ターゲットに同名ファイル/フォルダがある場合は別名にする
        base_name = os.path.basename(target_file)
        dir_name = os.path.dirname(target_file)
        counter = 1
        name, ext = os.path.splitext(base_name)
        while os.path.exists(target_file):
            target_file = os.path.join(dir_name, f"{name}_{counter}{ext}")
            counter += 1

        # ファイル・フォルダをコピー
        if os.path.isdir(source_file):
            import shutil
            shutil.copytree(source_file, target_file)
        else:
            import shutil
            shutil.copy2(source_file, target_file)
        
        return jsonify({'message': 'File/Folder copied successfully'}), 200
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
    
    # ベースパス（ホームディレクトリ）を取得
    home_dir = os.path.expanduser('~')
    
    # パスが指定されていない場合はホームディレクトリ
    if not path:
        path = home_dir
    else:
        path = os.path.expanduser(path)
    
    # パスを正規化
    path = os.path.abspath(path)
    
    # ホームディレクトリより上への移動を禁止
    if not path.startswith(home_dir):
        path = home_dir
    
    if not os.path.exists(path) or not os.path.isdir(path):
        return jsonify({'error': 'Invalid path'}), 400
        
    try:
        # 親ディレクトリ（ホームより上には行かせない）
        parent_path = os.path.dirname(path)
        if not parent_path.startswith(home_dir):
            parent_path = home_dir
        
        # サブディレクトリ一覧
        directories = []
        with os.scandir(path) as it:
            for entry in it:
                if entry.is_dir() and not entry.name.startswith('.'):
                    directories.append(entry.name)
        
        directories.sort()
        
        return jsonify({
            'current_path': path,
            'parent_path': parent_path,
            'directories': directories
        })
    except PermissionError:
        return jsonify({'error': 'このフォルダへのアクセス権限がありません'}), 403
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

@app.route('/api/system/cloud-storage-paths', methods=['GET'])
def get_cloud_storage_paths():
    """利用可能なクラウドストレージパスを検出"""
    cloud_paths = {}
    
    # macOS/Windows共通のクラウドストレージ検出
    cloud_storage_base = os.path.expanduser('~/Library/CloudStorage')
    
    if os.path.exists(cloud_storage_base):
        try:
            # OneDrive
            onedrive_dirs = [d for d in os.listdir(cloud_storage_base) 
                            if d.startswith('OneDrive')]
            if onedrive_dirs:
                cloud_paths['onedrive'] = os.path.join(cloud_storage_base, onedrive_dirs[0])
            
            # Google Drive
            gdrive_dirs = [d for d in os.listdir(cloud_storage_base) 
                          if 'GoogleDrive' in d or 'Google Drive' in d]
            if gdrive_dirs:
                cloud_paths['googledrive'] = os.path.join(cloud_storage_base, gdrive_dirs[0])
        except Exception as e:
            print(f"Error scanning cloud storage: {e}")
    
    # iCloud Drive (macOS)
    icloud_path = os.path.expanduser('~/Library/Mobile Documents/com~apple~CloudDocs')
    if os.path.exists(icloud_path):
        cloud_paths['icloud'] = icloud_path
    
    # Windows OneDrive (追加サポート)
    if os.name == 'nt':
        onedrive_win = os.path.expanduser('~/OneDrive')
        if os.path.exists(onedrive_win):
            cloud_paths['onedrive'] = onedrive_win
    
    return jsonify(cloud_paths)

@app.route('/api/system/open-local', methods=['POST'])
def open_local_file():
    """OSの標準アプリでローカルファイルを開く"""
    data = request.json
    file_path = data.get('path')
    
    import unicodedata
    if not file_path:
        return jsonify({'error': 'Path is required'}), 400
        
    # Normalize path encoding (handles NFD/NFC issues)
    file_path = unicodedata.normalize('NFC', file_path)
    
    file_path = os.path.expanduser(file_path)
    if not os.path.isabs(file_path):
        # アプリのルートディレクトリを基準にする
        app_root = os.path.dirname(os.path.abspath(__file__))
        abs_path = os.path.abspath(os.path.join(app_root, file_path))
        if os.path.exists(abs_path):
            file_path = abs_path
        else:
            file_path = os.path.abspath(file_path) # CWD基準の元の挙動
    
    if not os.path.exists(file_path):
        return jsonify({'error': f'File not found: {file_path}'}), 404
        
    try:
        if os.name == 'nt': # Windows
            os.startfile(file_path)
        elif os.name == 'posix': # macOS or Linux
            import subprocess
            opener = 'open' if sys.platform == 'darwin' else 'xdg-open'
            subprocess.call([opener, file_path])
        else:
            return jsonify({'error': 'OS not supported for auto-open'}), 400
            
        return jsonify({'message': 'File opened successfully'}), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/sections/<int:section_id>/files/<path:filename>/save', methods=['POST'])
def save_section_file(section_id, filename):
    """ファイルの内容を保存（上書き）する"""
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
        
        # セキュリティチェック: 指定されたディレクトリ内にあるか
        if not os.path.abspath(file_path).startswith(os.path.abspath(path)):
            return jsonify({'error': 'Invalid file path'}), 403

        data = request.json
        content = data.get('content')
        if content is None:
            return jsonify({'error': 'No content provided'}), 400

        # テキストとして保存
        with open(file_path, 'w', encoding='utf-8') as f:
            f.write(content)
        
        return jsonify({'message': 'File saved successfully'})
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/system/open-local-with', methods=['POST'])
def open_local_file_with():
    """指定されたプログラムでローカルファイルを開く"""
    data = request.json
    file_path = data.get('path')
    program = data.get('program') # 'vscode', 'textedit', etc.
    
    import unicodedata
    if not file_path:
        return jsonify({'error': 'Path is required'}), 400
        
    file_path = unicodedata.normalize('NFC', file_path)
    file_path = os.path.expanduser(file_path)
    
    if not os.path.isabs(file_path):
        app_root = os.path.dirname(os.path.abspath(__file__))
        abs_path = os.path.abspath(os.path.join(app_root, file_path))
        if os.path.exists(abs_path):
            file_path = abs_path
        else:
            file_path = os.path.abspath(file_path)
    
    if not os.path.exists(file_path):
        return jsonify({'error': 'File not found'}), 404
        
    try:
        if sys.platform == 'darwin': # macOS
            if program == 'vscode':
                cmd = ['open', '-a', 'Visual Studio Code', file_path]
            elif program == 'textedit':
                cmd = ['open', '-a', 'TextEdit', file_path]
            else:
                # デフォル：プログラム選択ダイアログを表示
                cmd = ['open', '-R', file_path] # Finderで表示
                # または 'open -a "Application Name" file'
                # とりあえず open だけだと標準、プログラム指定なしの場合は 'open'
                cmd = ['open', file_path]
            
            import subprocess
            subprocess.call(cmd)
        elif os.name == 'nt': # Windows
            if program == 'vscode':
                cmd = ['code', file_path]
            elif program == 'notepad':
                cmd = ['notepad', file_path]
            else:
                os.startfile(file_path)
                return jsonify({'message': 'File opened successfully'}), 200
            
            import subprocess
            subprocess.call(cmd, shell=True)
        else:
            return jsonify({'error': 'OS not supported for specific app open'}), 400
            
        return jsonify({'message': 'File opened successfully'}), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 500

# ==================== 認証API ====================

# ヘルパー関数: トークン生成
def generate_verification_token():
    """メール認証用のトークンを生成"""
    return secrets.token_urlsafe(32)

# ヘルパー関数: メール送信
def send_verification_email(email, token, host_url):
    """認証メールを送信"""
    # APP_BASE_URLが設定されている場合はそれを優先（サブフォルダ運用時用）
    app_base_url = os.environ.get('APP_BASE_URL', '').rstrip('/')
    if not app_base_url:
        app_base_url = host_url.rstrip('/')
    verification_url = f"{app_base_url}/verify-email?token={token}"
    
    msg = Message(
        subject="【Notest】メールアドレスの確認",
        recipients=[email],
        body=f"""
Notestへようこそ！

以下のリンクをクリックして、メールアドレスの確認を完了してください：

{verification_url}

このリンクは24時間有効です。

※このメールに心当たりがない場合は、無視してください。
        """,
        html=f"""
<html>
<body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
    <h2 style="color: #0078d4;">Notestへようこそ！</h2>
    <p>以下のボタンをクリックして、メールアドレスの確認を完了してください：</p>
    <p style="margin: 30px 0;">
        <a href="{verification_url}" 
           style="background-color: #0078d4; color: white; padding: 12px 24px; 
                  text-decoration: none; border-radius: 4px; display: inline-block;">
            メールアドレスを確認
        </a>
    </p>
    <p style="color: #666; font-size: 14px;">
        このリンクは24時間有効です。
    </p>
    <hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;">
    <p style="color: #999; font-size: 12px;">
        ※このメールに心当たりがない場合は、無視してください。
    </p>
</body>
</html>
        """
    )
    
    mail.send(msg)

# 1. メールアドレス送信（仮登録）
@app.route('/api/auth/request-registration', methods=['POST'])
def request_registration():
    """メールアドレスを受け取り、認証メールを送信"""
    try:
        data = request.get_json()
        email = data.get('email', '').strip().lower()
        
        # デスクトップアプリの場合はリモートに飛ばす
        if is_desktop_app() or os.environ.get('WOWNOTE_DESKTOP') == 'true':
            return proxy_auth_to_remote('/api/auth/request-registration', data)
        
        if not email:
            return jsonify({'error': 'メールアドレスを入力してください'}), 400
        
        # メールアドレスの形式チェック
        import re
        email_pattern = re.compile(r'^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$')
        if not email_pattern.match(email):
            return jsonify({'error': '有効なメールアドレスを入力してください'}), 400
        
        # 既に登録済みかチェック
        existing_user = User.query.filter_by(email=email).first()
        if existing_user:
            return jsonify({'error': 'このメールアドレスは既に登録されています'}), 400
        
        # トークン生成
        token = generate_verification_token()
        expires_at = datetime.utcnow() + timedelta(hours=24)
        
        # 既存の未使用トークンを削除
        EmailVerificationToken.query.filter_by(email=email, used=False).delete()
        
        # 新しいトークンを保存
        verification_token = EmailVerificationToken(
            email=email,
            token=token,
            expires_at=expires_at
        )
        db.session.add(verification_token)
        db.session.commit()
        
        # メール送信
        send_verification_email(email, token, request.host_url)
        
        return jsonify({
            'message': '確認メールを送信しました。メールをご確認ください。',
            'email': email
        }), 200
        
    except Exception as e:
        db.session.rollback()
        import traceback
        tb = traceback.format_exc()
        print(f"Registration request error: {e}")
        print(tb)
        # デバッグ用：実際のエラーを返す（後で元に戻すこと）
        return jsonify({'error': f'デバッグ: {str(e)}', 'detail': tb}), 500

# 2. メール認証
@app.route('/api/auth/verify-email/<token>', methods=['GET'])
def verify_email(token):
    """トークンを検証してメールアドレスを確認"""
    try:
        verification = EmailVerificationToken.query.filter_by(token=token, used=False).first()
        
        if not verification:
            return jsonify({'error': 'トークンが無効です'}), 400
        
        if verification.expires_at < datetime.utcnow():
            return jsonify({'error': 'トークンの有効期限が切れています'}), 400
        
        # トークンを使用済みにマーク
        verification.used = True
        db.session.commit()
        
        return jsonify({
            'message': 'メールアドレスが確認されました',
            'email': verification.email,
            'token': token
        }), 200
        
    except Exception as e:
        db.session.rollback()
        print(f"Email verification error: {e}")
        return jsonify({'error': '認証に失敗しました'}), 500

# 3. ユーザー登録完了
@app.route('/api/auth/register', methods=['POST'])
def register():
    """ユーザー情報を受け取り、登録を完了"""
    try:
        data = request.get_json()
        token = data.get('token')
        password = data.get('password', '').strip()
        
        # デスクトップアプリの場合はリモートに飛ばす
        if is_desktop_app() or os.environ.get('WOWNOTE_DESKTOP') == 'true':
            return proxy_auth_to_remote('/api/auth/register', data)
        agreed_to_terms = data.get('agreedToTerms', False)
        
        # バリデーション
        if not token:
            return jsonify({'error': 'トークンが必要です'}), 400
        
        if not password or len(password) < 8:
            return jsonify({'error': 'パスワードは8文字以上で入力してください'}), 400
        
        if not agreed_to_terms:
            return jsonify({'error': 'プライバシーポリシーと利用規約に同意してください'}), 400
        
        # トークン検証
        verification = EmailVerificationToken.query.filter_by(token=token, used=True).first()
        if not verification:
            return jsonify({'error': '無効なトークンです'}), 400
        
        # 既に登録済みかチェック
        existing_user = User.query.filter_by(email=verification.email).first()
        if existing_user:
            return jsonify({'error': 'このメールアドレスは既に登録されています'}), 400
        
        # パスワードをハッシュ化
        password_hash = bcrypt.hashpw(password.encode('utf-8'), bcrypt.gensalt()).decode('utf-8')
        
        # メールアドレスからユーザー名を自動生成
        username = verification.email.split('@')[0]
        
        # ユーザー作成
        user = User(
            email=verification.email,
            username=username,
            password_hash=password_hash,
            trial_end=datetime.utcnow() + timedelta(days=30),
            subscription_status='trialing'
        )
        db.session.add(user)
        db.session.commit()
        
        # ログイン
        login_user(user)
        
        return jsonify({
            'message': '登録が完了しました',
            'user': {
                'id': user.id,
                'email': user.email,
                'username': user.username
            }
        }), 201
        
    except Exception as e:
        db.session.rollback()
        print(f"Registration error: {e}")
        import traceback
        traceback.print_exc()
        return jsonify({'error': '登録に失敗しました'}), 500

# ==================== Stripe & サブスクリプション API ====================

@app.route('/api/user/status', methods=['GET'])
def user_status():
    # 内部プロキシ用：SECRET_KEYによるメールアドレス指定での取得
    internal_auth = request.headers.get('X-Internal-Auth')
    req_email = request.args.get('email')
    
    if internal_auth == app.config['SECRET_KEY'] and req_email:
        user = User.query.filter_by(email=req_email).first()
    elif current_user.is_authenticated:
        user = current_user
    else:
        return jsonify({'error': 'Unauthorized'}), 401

    if not user:
        return jsonify({'error': 'User not found'}), 404
    
    # デスクトップアプリの場合はリモートサーバーから最新状態を取得する
    if is_desktop_app():
        try:
            # プロキシ経由でリモートのステータスを取得 (Emailで指定)
            remote_data, status_code = proxy_auth_to_remote('/api/user/status', None, params={'email': user.email})
            if status_code == 200:
                # ローカルDBを更新
                user.subscription_status = remote_data.get('subscription_status', user.subscription_status)
                if remote_data.get('trial_end'):
                    user.trial_end = datetime.fromisoformat(remote_data.get('trial_end'))
                if remote_data.get('current_period_end'):
                    user.current_period_end = datetime.fromisoformat(remote_data.get('current_period_end'))
                user.cancel_at_period_end = remote_data.get('cancel_at_period_end', user.cancel_at_period_end)
                db.session.commit()
                
                # リモートの payment_link にリモートのIDを付与して返す
                payment_link = remote_data.get('payment_link', '')
                if not payment_link:
                    payment_link = app.config.get('STRIPE_PAYMENT_LINK', '')

                if payment_link and user.remote_user_id:
                    # IDが既に付いている可能性もあるのでクエリパラメータを調整
                    if '?' in payment_link:
                        payment_link += f"&client_reference_id={user.remote_user_id}"
                    else:
                        payment_link += f"?client_reference_id={user.remote_user_id}"
                remote_data['payment_link'] = payment_link
                return jsonify(remote_data)
        except Exception as e:
            print(f"Proxy status error: {e}")

    # 以下、Web版またはプロキシ失敗時のフォールバック
    now = datetime.utcnow()
    trial_days_left = 0
    if user.trial_end and user.trial_end > now:
        trial_days_left = (user.trial_end - now).days
    
    is_locked = False
    if user.subscription_status != 'active':
        if not user.trial_end or user.trial_end < now:
            is_locked = True
            
    return jsonify({
        'subscription_status': user.subscription_status,
        'trial_end': user.trial_end.isoformat() if user.trial_end else None,
        'trial_days_left': trial_days_left,
        'current_period_end': user.current_period_end.isoformat() if user.current_period_end else None,
        'cancel_at_period_end': user.cancel_at_period_end,
        'is_locked': is_locked,
        'payment_link': app.config.get('STRIPE_PAYMENT_LINK', '') + (f'?client_reference_id={user.remote_user_id or user.id}' if '?' not in app.config.get('STRIPE_PAYMENT_LINK', '') else f'&client_reference_id={user.remote_user_id or user.id}')
    })

@app.route('/api/user/cancel-subscription', methods=['POST'])
@login_required
def cancel_subscription():
    user = current_user
    if not user.stripe_subscription_id:
        return jsonify({'error': 'サブスクリプションが見つかりません'}), 400
        
    try:
        stripe.Subscription.modify(
            user.stripe_subscription_id,
            cancel_at_period_end=True
        )
        user.cancel_at_period_end = True
        db.session.commit()
        return jsonify({'message': '次回更新時での退会手続きが完了しました。有効期限までは引き続きご利用いただけます。'})
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/webhook/stripe', methods=['POST'])
def stripe_webhook():
    payload = request.data
    sig_header = request.headers.get('Stripe-Signature')

    try:
        event = stripe.Webhook.construct_event(
            payload, sig_header, STRIPE_WEBHOOK_SECRET
        )
    except ValueError as e:
        return 'Invalid payload', 400
    except stripe.error.SignatureVerificationError as e:
        return 'Invalid signature', 400

    if event['type'] == 'checkout.session.completed':
        session = event['data']['object']
        
        user_id = session.get('client_reference_id')
        if user_id:
            user = User.query.get(int(user_id))
            if user:
                user.stripe_customer_id = session.get('customer')
                user.stripe_subscription_id = session.get('subscription')
                user.subscription_status = 'active'
                db.session.commit()
                
    elif event['type'] == 'customer.subscription.updated':
        subscription = event['data']['object']
        customer_id = subscription.get('customer')
        user = User.query.filter_by(stripe_customer_id=customer_id).first()
        if user:
            user.subscription_status = subscription.get('status')
            user.current_period_end = datetime.utcfromtimestamp(subscription.get('current_period_end'))
            user.cancel_at_period_end = subscription.get('cancel_at_period_end', False)
            db.session.commit()
            
    elif event['type'] == 'customer.subscription.deleted':
        subscription = event['data']['object']
        customer_id = subscription.get('customer')
        user = User.query.filter_by(stripe_customer_id=customer_id).first()
        if user:
            user.subscription_status = 'canceled'
            user.cancel_at_period_end = True
            db.session.commit()

    return jsonify(success=True)

# 4. ログイン
@app.route('/api/auth/login', methods=['POST'])
def login():
    """ログイン処理"""
    try:
        data = request.get_json()
        email = data.get('email', '').strip().lower()
        password = data.get('password', '').strip()
        
        if not email or not password:
            return jsonify({'error': 'メールアドレスとパスワードを入力してください'}), 400
        
        remember = data.get('remember', False)
        
        # デスクトップアプリの場合はリモートサーバーで認証を行う
        if is_desktop_app():
            remote_data, status_code = proxy_auth_to_remote('/api/auth/login', data)
            if status_code == 200:
                user = User.query.filter_by(email=email).first()
                if not user:
                    user = User(email=email, 
                                username=email.split('@')[0],
                                password_hash=bcrypt.hashpw(secrets.token_bytes(16), bcrypt.gensalt()).decode('utf-8'))
                    db.session.add(user)
                # サブスクリプション状態やリモートIDを同期
                remote_user = remote_data.get('user', {})
                user.remote_user_id = remote_user.get('id')
                user.subscription_status = remote_user.get('subscription_status', 'trialing')
                if remote_user.get('trial_end'):
                    user.trial_end = datetime.fromisoformat(remote_user.get('trial_end'))
                if remote_user.get('current_period_end'):
                    user.current_period_end = datetime.fromisoformat(remote_user.get('current_period_end'))
                user.cancel_at_period_end = remote_user.get('cancel_at_period_end', False)
                db.session.commit()
                
                login_user(user, remember=remember)
                return jsonify({'success': True, 'user': {'email': user.email}})
            else:
                return jsonify(remote_data), status_code
        
        # ユーザー検索
        user = User.query.filter_by(email=email).first()
        
        if not user:
            return jsonify({'error': 'メールアドレスまたはパスワードが正しくありません'}), 401
        
        # パスワード検証
        if not bcrypt.checkpw(password.encode('utf-8'), user.password_hash.encode('utf-8')):
            return jsonify({'error': 'メールアドレスまたはパスワードが正しくありません'}), 401
        
        if not user.is_active:
            return jsonify({'error': 'このアカウントは無効化されています'}), 403
        
        # ログイン
        login_user(user, remember=remember)
        
        return jsonify({
            'message': 'ログインしました',
            'user': {
                'id': user.id,
                'email': user.email,
                'username': user.username,
                'subscription_status': user.subscription_status,
                'trial_end': user.trial_end.isoformat() if user.trial_end else None,
                'current_period_end': user.current_period_end.isoformat() if user.current_period_end else None,
                'cancel_at_period_end': user.cancel_at_period_end
            }
        }), 200
        
    except Exception as e:
        print(f"Login error: {e}")
        return jsonify({'error': 'ログインに失敗しました'}), 500

# 4.5 パスワードリセット
@app.route('/api/auth/forgot-password', methods=['POST'])
def forgot_password():
    """パスワード再設定メール送信"""
    try:
        data = request.get_json()
        email = data.get('email', '').strip().lower()
        
        # デスクトップアプリの場合はリモートに飛ばす
        if is_desktop_app():
            return proxy_auth_to_remote('/api/auth/forgot-password', data)
            
        if not email:
            return jsonify({'error': 'メールアドレスを入力してください'}), 400
            
        user = User.query.filter_by(email=email).first()
        if not user:
            # セキュリティのため、ユーザーが存在しなくても成功を装う
            return jsonify({'message': 'ご入力いただいたアドレス宛に再設定用リンクを送信しました（登録がある場合のみ）'}), 200

        # トークン生成
        token = secrets.token_urlsafe(32)
        expires_at = datetime.utcnow() + timedelta(hours=1)
        
        # 既存の未使用トークンを削除
        PasswordResetToken.query.filter_by(email=email, used=False).delete()
        
        # 新しいトークンを保存
        reset_token = PasswordResetToken(
            email=email,
            token=token,
            expires_at=expires_at
        )
        db.session.add(reset_token)
        db.session.commit()
        
        # メール送信
        reset_link = f"{request.host_url.rstrip('/')}/reset-password?token={token}"
        msg = Message("【WowNote】パスワードの再設定",
                    recipients=[email])
        msg.body = f"""WowNoteをご利用いただきありがとうございます。

パスワードの再設定リクエストを受け付けました。
以下のリンクから新しいパスワードを設定してください。
このリンクの有効期限は1時間です。

{reset_link}

※このメールに心当たりがない場合は、破棄してください。
"""
        mail.send(msg)
        
        return jsonify({'message': 'ご入力いただいたアドレス宛に再設定用リンクを送信しました'}), 200
        
    except Exception as e:
        print(f"Forgot password error: {e}")
        return jsonify({'error': '処理に失敗しました'}), 500

@app.route('/api/auth/reset-password', methods=['POST'])
def reset_password():
    """パスワード再設定実行"""
    try:
        data = request.get_json()
        token = data.get('token')
        new_password = data.get('password')
        
        # デスクトップアプリの場合はリモートに飛ばす
        if is_desktop_app():
            return proxy_auth_to_remote('/api/auth/reset-password', data)
            
        if not token or not new_password:
            return jsonify({'error': '不正なリクエストです'}), 400
            
        reset_token = PasswordResetToken.query.filter_by(token=token, used=False).first()
        if not reset_token or reset_token.expires_at < datetime.utcnow():
            return jsonify({'error': '期限切れまたは無効なリンクです'}), 400
            
        user = User.query.filter_by(email=reset_token.email).first()
        if not user:
            return jsonify({'error': 'ユーザーが見つかりません'}), 404
            
        # パスワード更新
        user.password_hash = bcrypt.hashpw(new_password.encode('utf-8'), bcrypt.gensalt()).decode('utf-8')
        reset_token.used = True
        db.session.commit()
        
        return jsonify({'message': 'パスワードを再設定しました'}), 200
        
    except Exception as e:
        print(f"Reset password error: {e}")
        return jsonify({'error': '再設定に失敗しました'}), 500

# 5. ログアウト
@app.route('/api/auth/logout', methods=['POST'])
@login_required
def logout():
    """ログアウト処理"""
    logout_user()
    return jsonify({'message': 'ログアウトしました'}), 200

# 6. 現在のユーザー情報取得
@app.route('/api/auth/me', methods=['GET'])
@login_required
def get_current_user():
    """ログイン中のユーザー情報を取得"""
    return jsonify({
        'user': {
            'id': current_user.id,
            'email': current_user.email,
            'username': current_user.username,
            'created_at': current_user.created_at.isoformat()
        }
    }), 200

# 7. ユーザー情報更新
@app.route('/api/auth/me', methods=['PUT'])
@login_required
def update_current_user():
    """ユーザー情報を更新"""
    try:
        data = request.get_json()
        current_password = data.get('currentPassword', '').strip()
        new_username = data.get('username', '').strip()
        new_password = data.get('newPassword', '').strip()
        
        # 現在のパスワード確認
        if not current_password:
            return jsonify({'error': '現在のパスワードを入力してください'}), 400
        
        if not bcrypt.checkpw(current_password.encode('utf-8'), current_user.password_hash.encode('utf-8')):
            return jsonify({'error': '現在のパスワードが正しくありません'}), 401
        
        # ユーザー名更新
        if new_username:
            current_user.username = new_username
        
        # パスワード更新
        if new_password:
            if len(new_password) < 8:
                return jsonify({'error': '新しいパスワードは8文字以上で入力してください'}), 400
            
            password_hash = bcrypt.hashpw(new_password.encode('utf-8'), bcrypt.gensalt()).decode('utf-8')
            current_user.password_hash = password_hash
        
        current_user.updated_at = datetime.utcnow()
        db.session.commit()
        
        return jsonify({
            'message': 'ユーザー情報を更新しました',
            'user': {
                'id': current_user.id,
                'email': current_user.email,
                'username': current_user.username
            }
        }), 200
        
    except Exception as e:
        db.session.rollback()
        print(f"Update user error: {e}")
        return jsonify({'error': '更新に失敗しました'}), 500


def init_db():
    """データベースとテーブルの作成"""
    with app.app_context():
        db.create_all()

if __name__ == '__main__':
    init_db()
    app.run(debug=True, host='0.0.0.0', port=5001)
