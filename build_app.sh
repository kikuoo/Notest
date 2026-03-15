#!/bin/bash

# Notest Desktop アプリ生成スクリプト (Mac版)
echo "------------------------------------------------"
echo "  Notest Desktop のパッケージ作成を開始します"
echo "------------------------------------------------"

# 必要に応じて仮想環境をロード
if [ -f "venv/bin/activate" ]; then
    source venv/bin/activate
fi

# PyInstaller の実行
# --windowed: ターミナルを表示せずに起動
# --add-data: 静的リソースとテンプレートを同梱
# --icon: 必要があればパスを指定
# ※ mysqlなどを使用しているため、隠れたインポートが必要な場合があるため追加
pyinstaller --noconfirm --windowed --name "WowNote" \
    --add-data "static:static" \
    --add-data "templates:templates" \
    --icon "static/img/app_icon.png" \
    --hidden-import flask_sqlalchemy \
    --hidden-import flask_login \
    --hidden-import flask_mail \
    --hidden-import bcrypt \
    --hidden-import pymysql \
    --hidden-import sqlalchemy.sql.default_comparator \
    desktop_app.py

echo "------------------------------------------------"
echo "  ビルドが完了しました！"
echo "  dist/Notest.app を実行して動作確認してください。"
echo "------------------------------------------------"
