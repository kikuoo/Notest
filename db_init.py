#!/home/kikuoo0915/kikuoo0915.xsrv.jp/public_html/note/venv/bin/python3
"""
Xserverのデータベースにテーブルを作成するための初期化スクリプト
SSH接続後、以下のコマンドで実行してください：
  python3 db_init.py
または
  cd ~/kikuoo0915.xsrv.jp/public_html/note && ./db_init.py
"""

import sys
import os

# アプリのパスを追加
sys.path.insert(0, '/home/kikuoo0915/kikuoo0915.xsrv.jp/public_html/note')

# .envを読み込む
from dotenv import load_dotenv
load_dotenv('/home/kikuoo0915/kikuoo0915.xsrv.jp/public_html/note/.env')

from app import app, db

with app.app_context():
    print("データベース接続を確認中...")
    try:
        db.create_all()
        print("✅ 全テーブルの作成が完了しました！")
    except Exception as e:
        print(f"❌ エラーが発生しました: {e}")
        import traceback
        traceback.print_exc()
