import os
from pathlib import Path
import sys
from datetime import timedelta

class Config:
    REMOTE_SERVER_URL = os.environ.get('REMOTE_SERVER_URL', 'https://kikuoo0915.xsrv.jp/note')
    # SQLAlchemy設定
    if getattr(sys, 'frozen', False) or os.environ.get('WOWNOTE_DESKTOP') == 'true':
        # デスクトップアプリ用ローカルSQLite
        LOCAL_DB_PATH = os.path.join(os.path.expanduser('~'), 'WowNoteData', 'wownote.db')
        SQLALCHEMY_DATABASE_URI = f"sqlite:///{LOCAL_DB_PATH}"
    else:
        # Webサーバー用MySQL設定 (既存)
        MYSQL_HOST = os.environ.get('MYSQL_HOST', 'localhost')
        MYSQL_PORT = int(os.environ.get('MYSQL_PORT', 3306))
        MYSQL_USER = os.environ.get('MYSQL_USER', 'root')
        MYSQL_PASSWORD = os.environ.get('MYSQL_PASSWORD', '')
        MYSQL_DATABASE = os.environ.get('MYSQL_DATABASE', 'notest_db')
        SQLALCHEMY_DATABASE_URI = f"mysql+pymysql://{MYSQL_USER}:{MYSQL_PASSWORD}@{MYSQL_HOST}:{MYSQL_PORT}/{MYSQL_DATABASE}?charset=utf8mb4"
    
    SQLALCHEMY_TRACK_MODIFICATIONS = False
    SQLALCHEMY_ENGINE_OPTIONS = {
        'pool_recycle': 3600,
        'pool_pre_ping': True
    } if not SQLALCHEMY_DATABASE_URI.startswith('sqlite') else {}
    
    # アップロード・ストレージ設定 (配布時はユーザホームディレクトリを使用する)
    if getattr(sys, 'frozen', False) or os.environ.get('WOWNOTE_DESKTOP') == 'true':
        # デスクトップ版
        BASE_DATA_DIR = os.path.join(os.path.expanduser('~'), 'WowNoteData')
    else:
        # 開発環境 (Webサーバー)
        BASE_DATA_DIR = os.path.dirname(os.path.abspath(__file__))

    UPLOAD_FOLDER = os.path.join(BASE_DATA_DIR, 'uploads')
    MAX_CONTENT_LENGTH = 500 * 1024 * 1024  # 500MB
    ALLOWED_EXTENSIONS = {'txt', 'pdf', 'png', 'jpg', 'jpeg', 'gif', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'zip', 'rar'}
    
    # セッション・クッキー設定
    SECRET_KEY = os.environ.get('SECRET_KEY', 'dev-secret-key-change-in-production')
    PERMANENT_SESSION_LIFETIME = timedelta(days=30)
    REMEMBER_COOKIE_DURATION = timedelta(days=30)
    SESSION_COOKIE_PATH = '/'  # /note プレフィックスに関わらず共通のクッキーを使用
    SESSION_PERMANENT = True
    SESSION_COOKIE_HTTPONLY = True
    SESSION_COOKIE_SAMESITE = 'Lax'
    REMEMBER_COOKIE_HTTPONLY = True
    REMEMBER_COOKIE_SAMESITE = 'Lax'
    
    # メール設定
    MAIL_SERVER = os.environ.get('MAIL_SERVER', 'sv16646.xserver.jp')
    MAIL_PORT = int(os.environ.get('MAIL_PORT', 587))
    MAIL_USE_TLS = os.environ.get('MAIL_USE_TLS', 'True') == 'True'
    MAIL_USE_SSL = os.environ.get('MAIL_USE_SSL', 'False') == 'True'
    MAIL_USERNAME = os.environ.get('MAIL_USERNAME')
    MAIL_PASSWORD = os.environ.get('MAIL_PASSWORD')
    MAIL_DEFAULT_SENDER = os.environ.get('MAIL_DEFAULT_SENDER', 'support@kikuoo0915.xsrv.jp')
    
    # Stripe 設定
    STRIPE_PAYMENT_LINK = os.environ.get('STRIPE_PAYMENT_LINK', 'https://buy.stripe.com/test_eVq7sLbo4gpMfWng3R0Fi00')
    
    # 外部ストレージ設定
    STORAGE_BASE_PATH = os.environ.get('STORAGE_BASE_PATH', os.path.join(BASE_DATA_DIR, 'storage'))
    
    @staticmethod
    def init_app(app):
        # アップロードフォルダとストレージフォルダを作成
        os.makedirs(Config.UPLOAD_FOLDER, exist_ok=True)
        os.makedirs(Config.STORAGE_BASE_PATH, exist_ok=True)
