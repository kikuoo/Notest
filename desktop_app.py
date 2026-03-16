import webview
import subprocess
import os
import sys
import platform
import threading
from app import app

def resource_path(relative_path):
    """ Get absolute path to resource, works for dev and for PyInstaller """
    try:
        base_path = sys._MEIPASS
    except Exception:
        base_path = os.path.abspath(".")
    return os.path.join(base_path, relative_path)

def start_backend():
    """Flaskバックエンドを別スレッドで起動"""
    # デスクトップ版として起動していることを環境変数で明示
    os.environ['WOWNOTE_DESKTOP'] = 'true'
    app.run(host='127.0.0.1', port=5001, threaded=True)

class ApiDict:
    def open_path(self, path):
        """OS標準のアプリでファイルを開く"""
        print(f"Opening path: {path}")
        try:
            if platform.system() == 'Darwin':       # macOS
                subprocess.call(('open', path))
            elif platform.system() == 'Windows':    # Windows
                os.startfile(path)
            else:                                   # linux variants
                subprocess.call(('xdg-open', path))
            return {"success": True}
        except Exception as e:
            print(f"Error opening path: {e}")
            return {"success": False, "error": str(e)}

    def open_with_app(self, path, app_path):
        """指定したアプリでファイルを開く"""
        print(f"Opening path with app: {path} using {app_path}")
        try:
            if platform.system() == 'Darwin':
                subprocess.call(['open', '-a', app_path, path])
            elif platform.system() == 'Windows':
                subprocess.call([app_path, path])
            else:
                subprocess.call([app_path, path])
            return {"success": True}
        except Exception as e:
            print(f"Error opening with app: {e}")
            return {"success": False, "error": str(e)}

if __name__ == '__main__':
    # 1. バックエンドサーバーをスレッドで開始
    t = threading.Thread(target=start_backend)
    t.daemon = True
    t.start()

    # 2. メインウィンドウの作成
    # ローカルのFlaskサーバーにアクセスする
    target_url = 'http://127.0.0.1:5001/app'
    
    # デバッグモード判定
    is_debug = '--debug' in sys.argv
    
    api = ApiDict()
    
    window = webview.create_window(
        'WowNote Desktop',
        target_url,
        js_api=api,
        width=1280,
        height=850,
        min_size=(1000, 700),
        text_select=True
    )
    
    # 3. アプリケーションを開始
    webview.start(debug=is_debug)
