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
    
    # 実行
    CGIHandler().run(app)
    
except Exception as e:
    # ブラウザにエラーを表示（デバッグ用）
    print("Content-Type: text/plain; charset=utf-8")
    print("")
    print("CGI Execution Error:")
    print(str(e))
    traceback.print_exc(file=sys.stdout)
