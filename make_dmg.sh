#!/bin/bash

# WowNote Mac DMG作成スクリプト
echo "------------------------------------------------"
echo "  WowNote_Mac.dmg の作成を開始します"
echo "------------------------------------------------"

# 変数設定
APP_NAME="Notest"
VOLUME_NAME="WowNoteInstaller"
DMG_NAME="WowNote_Mac.dmg"
SOURCE_DIR="dist/${APP_NAME}.app"

# 以前のDMGがあれば削除
if [ -f "dist/${DMG_NAME}" ]; then
    rm "dist/${DMG_NAME}"
fi

# hdiutilを使ってDMGを作成
# create: 作成
# -volname: マウントした時の名前
# -srcfolder: 元となるフォルダ (.app)
# -ov: 上書き許可
# -format: UDZO (圧縮保存用)
echo "-> DMGファイルを生成中..."
hdiutil create -volname "${VOLUME_NAME}" -srcfolder "${SOURCE_DIR}" -ov -format UDZO "dist/${DMG_NAME}"

echo "------------------------------------------------"
echo "  作成が完了しました！"
echo "  dist/${DMG_NAME} をサーバーにアップロードしてください。"
echo "------------------------------------------------"
