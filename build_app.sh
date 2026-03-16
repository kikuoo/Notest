#!/bin/bash

# WowNote Desktop アプリ生成スクリプト (Mac版)
echo "------------------------------------------------"
echo "  WowNote Desktop のパッケージ作成を開始します"
echo "------------------------------------------------"

# 1. 仮想環境のロードとライブラリのインストール
if [ -f "venv/bin/activate" ]; then
    source venv/bin/activate
fi

echo "-> 必要なライブラリをインストール中..."
python3 -m pip install -r requirements.txt

# 2. アイコンの変換 (PNG -> ICNS)
echo "-> アイコンを変換中..."
mkdir -p WowNote.iconset
sips -z 16 16     static/img/app_icon.png --out WowNote.iconset/icon_16x16.png
sips -z 32 32     static/img/app_icon.png --out WowNote.iconset/icon_16x16@2x.png
sips -z 32 32     static/img/app_icon.png --out WowNote.iconset/icon_32x32.png
sips -z 64 64     static/img/app_icon.png --out WowNote.iconset/icon_32x32@2x.png
sips -z 128 128   static/img/app_icon.png --out WowNote.iconset/icon_128x128.png
sips -z 256 256   static/img/app_icon.png --out WowNote.iconset/icon_128x128@2x.png
sips -z 256 256   static/img/app_icon.png --out WowNote.iconset/icon_256x256.png
sips -z 512 512   static/img/app_icon.png --out WowNote.iconset/icon_256x256@2x.png
sips -z 512 512   static/img/app_icon.png --out WowNote.iconset/icon_512x512.png
sips -z 1024 1024 static/img/app_icon.png --out WowNote.iconset/icon_512x512@2x.png
iconutil -c icns WowNote.iconset
rm -R WowNote.iconset

# 3. PyInstaller の実行
echo "-> PyInstallerを実行中..."
# --windowed: ターミナルを表示せずに起動
# --add-data: 静的リソースとテンプレートを同梱
# --icon: 生成した .icns を使用
pyinstaller --noconfirm --windowed --name "WowNote" \
    --add-data "static:static" \
    --add-data "templates:templates" \
    --icon "WowNote.icns" \
    --hidden-import flask_sqlalchemy \
    --hidden-import flask_login \
    --hidden-import flask_mail \
    --hidden-import bcrypt \
    --hidden-import pymysql \
    --hidden-import sqlalchemy.sql.default_comparator \
    desktop_app.py

# 4. 「破損している」エラーの回避策（クアランティンの解除）
echo "-> セキュリティ警告の回避処理を実行中..."
xattr -cr "dist/WowNote.app"

echo "------------------------------------------------"
echo "  ビルドが完了しました！"
echo "  1. dist/WowNote.app を実行して動作確認してください。"
echo "  2. 問題なければ ./make_dmg.sh で配布用ファイルを作成してください。"
echo "------------------------------------------------"
