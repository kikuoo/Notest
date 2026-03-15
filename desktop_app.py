import webview
import subprocess
import os
import sys
import platform

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
    # ユーザーが配布されたときにアクセスするリモートURL
    # 開発時は localhost:5001 でも良いが、配布時は Xserver 等のURLにする
    remote_url = 'https://kikuoo0915.xsrv.jp/note/' 
    
    # デバッグモード判定
    is_debug = '--debug' in sys.argv
    
    # 万が一開発中にローカルで見たい場合は環境変数等で切り替え
    target_url = os.getenv('WOWNOTE_URL', remote_url)

    api = ApiDict()
    
    window = webview.create_window(
        'WowNote Desktop',
        target_url,
        js_api=api,
        width=1280,
        height=850,
        min_size=(1000, 700),
        icon='static/img/app_icon.png'
    )
    
    webview.start(debug=is_debug)
