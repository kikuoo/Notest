#!/bin/bash

# Notest ローカル環境一括セットアップスクリプト (Mac用)
echo "------------------------------------------------"
echo "  Notest ローカル環境セットアップを開始します"
echo "------------------------------------------------"

# 1. Pythonの確認
if ! command -v python3 &> /dev/null; then
    echo "エラー: python3 が見つかりません。 https://www.python.org/ からインストールしてください。"
    exit 1
fi

# 2. 仮想環境の作成
echo "-> 仮想環境 (venv) を作成しています..."
python3 -m venv venv

# 3. ライブラリのインストール
echo "-> 必要なライブラリをインストールしています..."
./venv/bin/pip install --upgrade pip
./venv/bin/pip install -r requirements.txt

# 4. DB初期化（必要であれば）
echo "-> データベースを初期化しています..."
./venv/bin/python << EOF
from app import app, db
with app.app_context():
    db.create_all()
EOF

echo "------------------------------------------------"
echo "  セットアップが完了しました！"
echo ""
echo "  【起動方法】"
echo "  1. ターミナルで ./venv/bin/python app.py と入力して Enter"
echo "  2. ブラウザで http://localhost:5001 を開く"
echo "------------------------------------------------"
