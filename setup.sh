#!/bin/bash
# Notest セットアップスクリプト

echo "=========================================="
echo "Notest セットアップを開始します"
echo "=========================================="
echo ""

# 仮想環境の確認
if [ ! -d "venv" ]; then
    echo "仮想環境を作成しています..."
    python3 -m venv venv
fi

# 仮想環境のアクティベート
echo "仮想環境をアクティベートしています..."
source venv/bin/activate

# 依存関係のインストール
echo "依存関係をインストールしています..."
pip install --upgrade pip
pip install -r requirements.txt

echo ""
echo "=========================================="
echo "セットアップ手順"
echo "=========================================="
echo ""
echo "1. .envファイルを編集してMySQLの接続情報を設定してください:"
echo "   - MYSQL_PASSWORD: MySQLのパスワード"
echo "   - その他の設定も必要に応じて変更してください"
echo ""
echo "2. データベースを作成します:"
echo "   python setup_db.py"
echo ""
echo "3. アプリケーションを起動します:"
echo "   python app.py"
echo ""
echo "4. ブラウザで http://localhost:5000 にアクセスしてください"
echo ""
