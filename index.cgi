#!/home/kikuoo0915/kikuoo0915.xsrv.jp/public_html/note/venv/bin/python3
# -*- coding: utf-8 -*-

import sys
import os
import traceback

# アプリのルートディレクトリをパスに追加
APP_ROOT = '/home/kikuoo0915/kikuoo0915.xsrv.jp/public_html/note'
sys.path.insert(0, APP_ROOT)

# 環境変数の読み込み
os.environ['PYTHONIOENCODING'] = 'utf-8'

# エラーハンドリング用のラッパー
try:
    from wsgiref.handlers import CGIHandler
    from app import app
    
    # ----------------------------------------------------
    # エラーを画面に表示するための特別なラッパー（デバッグ用）
    # ----------------------------------------------------
    class ExceptionCatchingMiddleware:
        def __init__(self, app):
            self.app = app

        def __call__(self, environ, start_response):
            try:
                return self.app(environ, start_response)
            except Exception as e:
                import traceback
                error_msg = traceback.format_exc()
                start_response('500 Internal Server Error', [('Content-Type', 'text/plain; charset=utf-8')])
                return [b"Flask Application Error:\n\n", error_msg.encode('utf-8')]

    # ラッパー経由でアプリを実行
    wrapped_app = ExceptionCatchingMiddleware(app.wsgi_app)
    CGIHandler().run(wrapped_app)
    
except Exception as e:
    # ブラウザにエラーを表示（デバッグ用）
    print("Content-Type: text/plain; charset=utf-8")
    print("")
    print("CGI Execution Error:")
    print(str(e))
    traceback.print_exc(file=sys.stdout)
